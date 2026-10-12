/**
 * LearningProgress on a real Postgres (plan unit U6): the composite key makes a repeat a no-op, a
 * dismissal cannot overwrite a completion, and the rows go with the user.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

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
});
