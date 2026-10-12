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

  it('prunes the oldest rows at the cap so a finish or a close is never lost', async () => {
    const userId = await createUser(db);
    const base = new Date('2026-10-01T00:00:00.000Z').getTime();
    await db.learningEvent.createMany({
      data: Array.from({ length: MAX_LEARN_EVENTS_PER_USER }, (_, i) => ({
        userId,
        name: 'tour_started',
        itemId: 'primer',
        at: new Date(base + i * 1000),
      })),
    });

    const stored = await recordLearningEvent(db, {
      userId,
      name: 'tour_completed',
      itemId: 'primer',
    });

    expect(stored).toBe(true);
    expect(await db.learningEvent.count({ where: { userId } })).toBe(MAX_LEARN_EVENTS_PER_USER);
    expect(await db.learningEvent.count({ where: { userId, name: 'tour_completed' } })).toBe(1);
    // the oldest one made room
    expect(await db.learningEvent.count({ where: { userId, at: new Date(base) } })).toBe(0);
  });

  it('does not store a repeated step for the same tour, but does for another tour', async () => {
    const userId = await createUser(db);
    const step = { userId, name: 'tour_step', itemId: 'primer', stepId: 'primer.2' };
    await recordLearningEvent(db, step);
    await recordLearningEvent(db, step);
    await recordLearningEvent(db, {
      ...step,
      itemId: 'buy-first-coin',
      stepId: 'buy-first-coin.2',
    });

    expect(await db.learningEvent.count({ where: { userId } })).toBe(2);
  });

  it('holds the cap exactly when requests for one user arrive in parallel', async () => {
    const userId = await createUser(db);
    await db.learningEvent.createMany({
      data: Array.from({ length: MAX_LEARN_EVENTS_PER_USER - 5 }, () => ({
        userId,
        name: 'tour_step',
        itemId: 'primer',
        stepId: 'primer.1',
      })),
    });

    // Twenty at once against five free slots: each is stored, the oldest rows make room, and the
    // count never passes the cap (check-then-insert would have left it at cap + 15)
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        recordLearningEvent(db, { userId, name: 'tour_started', itemId: 'primer' })
      )
    );

    expect(results.every(Boolean)).toBe(true);
    expect(await db.learningEvent.count({ where: { userId } })).toBe(MAX_LEARN_EVENTS_PER_USER);
  });

  it('drops the event for an account that no longer exists, without an error', async () => {
    const stored = await recordLearningEvent(db, {
      userId: 'no-such-user',
      name: 'tour_started',
      itemId: 'primer',
    });
    expect(stored).toBe(false);
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
