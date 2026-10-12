/**
 * UserActivity on a real Postgres (plan unit U4): the composite key really makes a second call the
 * same day a no-op, the purge keeps the boundary day, a deleted user takes its days with it, and
 * the retention report reads them.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRetentionReport } from '../../services/RetentionMetrics.js';
import { purgeOldActivity, recordActivityDay } from '../../services/UserActivity.js';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();
const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('UserActivity (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('keeps one row per user per UTC day however often it is recorded', async () => {
    const userId = await createUser(db);
    await recordActivityDay(db, userId, new Date('2026-10-14T00:00:01Z'));
    await recordActivityDay(db, userId, new Date('2026-10-14T23:59:59Z'));
    await recordActivityDay(db, userId, new Date('2026-10-15T00:00:00Z'));

    const days = await db.userActivity.findMany({ where: { userId }, orderBy: { day: 'asc' } });
    expect(days.map((d) => d.day.toISOString().slice(0, 10))).toEqual(['2026-10-14', '2026-10-15']);
  });

  it('purges days older than 180 days and keeps the boundary day', async () => {
    const userId = await createUser(db);
    // 180 days before 2026-10-20 is 2026-04-23: that day stays, the day before goes
    await recordActivityDay(db, userId, new Date('2026-04-22T10:00:00Z'));
    await recordActivityDay(db, userId, new Date('2026-04-23T10:00:00Z'));
    await recordActivityDay(db, userId, new Date('2026-10-19T10:00:00Z'));

    const purged = await purgeOldActivity(db, NOW);
    expect(purged).toBe(1);
    const left = await db.userActivity.findMany({ where: { userId }, orderBy: { day: 'asc' } });
    expect(left.map((d) => d.day.toISOString().slice(0, 10))).toEqual(['2026-04-23', '2026-10-19']);
  });

  it('goes with the user when the account is deleted', async () => {
    const userId = await createUser(db);
    await recordActivityDay(db, userId, new Date('2026-10-14T10:00:00Z'));

    await db.user.delete({ where: { id: userId } });

    expect(await db.userActivity.count({ where: { userId } })).toBe(0);
  });

  it('is read by the retention report: a sign-in day counts as return', async () => {
    const watcher = await db.user.create({
      data: {
        email: 'w@example.test',
        username: 'watcher_u4',
        password: 'x',
        createdAt: new Date('2026-10-05T10:00:00Z'),
      },
    });
    await db.account.create({ data: { userId: watcher.id } });
    await recordActivityDay(db, watcher.id, new Date('2026-10-08T09:00:00Z')); // day 3, no orders

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.activeWeek1).toEqual({ eligible: 1, count: 1 });
    expect(r.activityTrackedSince).toBe('2026-10-08');
  });

  it('reports no tracked-since date while nothing is recorded', async () => {
    const r = await loadRetentionReport(db, NOW);
    expect(r.activityTrackedSince).toBeNull();
  });
});
