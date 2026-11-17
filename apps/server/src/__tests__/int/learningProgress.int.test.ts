/**
 * LearningProgress on a real Postgres (plan unit U6): the composite key makes a repeat a no-op, a
 * dismissal cannot overwrite a completion, and the rows go with the user.
 */

import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';
import { SERVER_DIR, prisma as prismaCli } from './prismaCli.js';

const db = integrationPrisma();

describe('LearningProgress (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('keeps one row per user and item, and a repeat dismissal changes nothing', async () => {
    const userId = await createUser(db);
    await db.learningProgress.upsert({
      where: { userId_itemId: { userId, itemId: 'primer' } },
      create: { userId, itemId: 'primer', status: 'completed' },
      update: { status: 'completed' },
    });
    await db.learningProgress.createMany({
      data: [{ userId, itemId: 'primer', status: 'dismissed' }],
      skipDuplicates: true,
    });

    const rows = await db.learningProgress.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
  });

  it('raises a begun lesson’s step, never lowers it, and leaves a finished lesson alone', async () => {
    // The same two writes as PUT /progress with `started` (the map's ring, 2026-11-12)
    const userId = await createUser(db);
    const start = async (itemId: string, step: number) => {
      await db.learningProgress.createMany({
        data: [{ userId, itemId, status: 'started', step }],
        skipDuplicates: true,
      });
      await db.learningProgress.updateMany({
        where: { userId, itemId, status: 'started', OR: [{ step: null }, { step: { lt: step } }] },
        data: { step },
      });
    };
    await start('lesson-02', 45);
    await start('lesson-02', 47);
    await start('lesson-02', 44);
    const row = await db.learningProgress.findUnique({
      where: { userId_itemId: { userId, itemId: 'lesson-02' } },
    });
    expect(row).toMatchObject({ status: 'started', step: 47 });

    await db.learningProgress.create({
      data: { userId, itemId: 'lesson-01', status: 'completed' },
    });
    await start('lesson-01', 23);
    const done = await db.learningProgress.findUnique({
      where: { userId_itemId: { userId, itemId: 'lesson-01' } },
    });
    expect(done).toMatchObject({ status: 'completed', step: null });
  });

  it('keeps two users’ progress apart', async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await db.learningProgress.create({
      data: { userId: a, itemId: 'primer', status: 'completed' },
    });

    expect(await db.learningProgress.count({ where: { userId: b } })).toBe(0);
  });

  it('goes with the user when the account is deleted', async () => {
    const userId = await createUser(db);
    await db.learningProgress.create({
      data: { userId, itemId: 'welcome-card', status: 'dismissed' },
    });

    await db.user.delete({ where: { id: userId } });

    expect(await db.learningProgress.count({ where: { userId } })).toBe(0);
  });

  it('should reset every learner’s Lessons 1–3, begun and finished, and nothing else (owner 2026-11-16)', async () => {
    const userId = await createUser(db);
    await db.learningProgress.createMany({
      data: [
        { userId, itemId: 'lesson-01', status: 'completed' },
        { userId, itemId: 'lesson-ownership', status: 'started', step: 24 },
        { userId, itemId: 'lesson-02', status: 'completed' },
        { userId, itemId: 'primer', status: 'completed' },
        { userId, itemId: 'checkpoint-ch1', status: 'completed' },
        { userId, itemId: 'welcome-card', status: 'dismissed' },
      ],
    });
    // The migration's own file, run again here (it already ran when the database was migrated)
    const file = join(
      SERVER_DIR,
      'prisma/migrations/20261116200000_reset_lessons_1_3/migration.sql'
    );
    const res = prismaCli(['db', 'execute', '--file', file], process.env.DATABASE_URL as string);
    expect(res.status, res.output).toBe(0);

    const rows = await db.learningProgress.findMany({
      where: { userId },
      orderBy: { itemId: 'asc' },
    });
    expect(rows.map((r) => r.itemId)).toEqual(['checkpoint-ch1', 'primer', 'welcome-card']);
    // A learner who finished Lesson 1 without dismissing the welcome card keeps it dismissed
    const other = await createUser(db);
    await db.learningProgress.create({
      data: { userId: other, itemId: 'lesson-01', status: 'completed' },
    });
    const again = prismaCli(['db', 'execute', '--file', file], process.env.DATABASE_URL as string);
    expect(again.status, again.output).toBe(0);
    expect(
      await db.learningProgress.findMany({
        where: { userId: other },
        select: { itemId: true, status: true },
      })
    ).toEqual([{ itemId: 'welcome-card', status: 'dismissed' }]);
  });

  it('should clear every learner’s chapter 1 checkpoint pass, and nothing else (owner 2026-11-17)', async () => {
    const userId = await createUser(db);
    await db.learningProgress.createMany({
      data: [
        { userId, itemId: 'checkpoint-ch1', status: 'completed' },
        { userId, itemId: 'primer', status: 'completed' },
        { userId, itemId: 'lesson-01', status: 'started', step: 64 },
      ],
    });
    const file = join(
      SERVER_DIR,
      'prisma/migrations/20261117090000_reset_checkpoint_ch1/migration.sql'
    );
    const res = prismaCli(['db', 'execute', '--file', file], process.env.DATABASE_URL as string);
    expect(res.status, res.output).toBe(0);
    const rows = await db.learningProgress.findMany({
      where: { userId },
      orderBy: { itemId: 'asc' },
    });
    expect(rows.map((r) => r.itemId)).toEqual(['lesson-01', 'primer']);
  });
});
