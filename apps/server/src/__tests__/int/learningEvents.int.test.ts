/**
 * LearningEvent on a real Postgres (plan unit U7): the per-user cap, the purge boundary, the cascade
 * on user delete, and the funnel the retention report reads from it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_LEARN_EVENTS_PER_USER } from '../../constants.js';
import { purgeOldLearningEvents, recordLearningEvent } from '../../services/LearningEvents.js';
import { loadRetentionReport } from '../../services/RetentionMetrics.js';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();
const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('LearningEvent (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('stores events up to the per-user cap and drops the rest', async () => {
    const userId = await createUser(db);
    await db.learningEvent.createMany({
      data: Array.from({ length: MAX_LEARN_EVENTS_PER_USER }, () => ({
        userId,
        name: 'tour_step',
        itemId: 'primer',
        stepId: 'primer.1',
      })),
    });

    const stored = await recordLearningEvent(db, { userId, name: 'tour_step', itemId: 'primer' });

    expect(stored).toBe(false);
    expect(await db.learningEvent.count({ where: { userId } })).toBe(MAX_LEARN_EVENTS_PER_USER);
  });

  it('purges events older than 180 days and keeps the boundary day', async () => {
    const userId = await createUser(db);
    const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
    // 180 days before 2026-10-20 12:00 is 2026-04-23 12:00
    for (const at of [day('2026-04-22'), day('2026-04-23'), day('2026-10-19')]) {
      await db.learningEvent.create({
        data: { userId, name: 'tour_started', itemId: 'primer', at },
      });
    }

    const purged = await purgeOldLearningEvents(db, NOW);

    expect(purged).toBe(1);
    expect(await db.learningEvent.count({ where: { userId } })).toBe(2);
  });

  it('goes with the user when the account is deleted', async () => {
    const userId = await createUser(db);
    await recordLearningEvent(db, { userId, name: 'tour_started', itemId: 'primer' });

    await db.user.delete({ where: { id: userId } });

    expect(await db.learningEvent.count({ where: { userId } })).toBe(0);
  });

  it('feeds the funnel in the retention report, leaving the admin out', async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const admin = await db.user.create({
      data: { email: 'admin@test.com', username: 'the_admin_ev', password: 'x' },
    });
    const at = new Date('2026-10-19T10:00:00.000Z');
    const rows = [
      { userId: a, name: 'tour_started', itemId: 'primer', stepId: null },
      { userId: a, name: 'tour_step', itemId: 'primer', stepId: 'primer.1' },
      { userId: a, name: 'tour_closed', itemId: 'primer', stepId: 'primer.1' },
      { userId: b, name: 'tour_started', itemId: 'primer', stepId: null },
      { userId: b, name: 'tour_completed', itemId: 'primer', stepId: null },
      { userId: admin.id, name: 'tour_started', itemId: 'primer', stepId: null },
    ];
    await db.learningEvent.createMany({ data: rows.map((r) => ({ ...r, at })) });

    const r = await loadRetentionReport(db, NOW);
    const primer = r.tourFunnel.find((t) => t.itemId === 'primer')!;

    expect(primer.started).toBe(2);
    expect(primer.completed).toBe(1);
    expect(primer.steps).toEqual([{ stepId: 'primer.1', viewers: 1, closedHere: 1 }]);
    expect(r.tourFunnel.map((t) => t.itemId)).toEqual([
      'primer',
      'buy-first-coin',
      'sell-and-review',
    ]);
  });
});
