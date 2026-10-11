/**
 * RetentionMetrics on a real Postgres (plan "Retention analytics", unit U3). The unit tests mock
 * Prisma, so the queries themselves — the relation filter on `user`, `distinct: ['userId']` with an
 * `orderBy`, the exclusions — only get proved here, against rows the database actually returns.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRetentionReport } from '../../services/RetentionMetrics.js';
import { cleanDatabase, integrationPrisma } from './db.js';

const db = integrationPrisma();

// Tuesday 2026-10-20: the week of Monday 2026-10-05 is fully elapsed through day 14
const NOW = new Date('2026-10-20T12:00:00.000Z');
const SIGNUP = new Date('2026-10-05T10:00:00.000Z'); // a Monday
const hoursAfter = (h: number) => new Date(SIGNUP.getTime() + h * 3_600_000);

let seq = 0;

async function makeUser(opts: {
  username?: string;
  email?: string;
  createdAt?: Date;
  resetCount?: number;
  lastReset?: Date;
}) {
  seq += 1;
  const user = await db.user.create({
    data: {
      email: opts.email ?? `ret-${seq}@example.test`,
      username: opts.username ?? `ret_${seq}`,
      password: 'not-a-hash',
      createdAt: opts.createdAt ?? SIGNUP,
      emailVerifiedAt: opts.createdAt ?? SIGNUP,
    },
  });
  const account = await db.account.create({
    data: {
      userId: user.id,
      ...(opts.resetCount ? { resetCount: opts.resetCount, lastReset: opts.lastReset } : {}),
    },
  });
  return { userId: user.id, accountId: account.id };
}

async function placeOrder(
  who: { userId: string; accountId: string },
  createdAt: Date,
  extra: { orderType?: string; createType?: string; stopLoss?: number } = {}
) {
  await db.order.create({
    data: {
      userId: who.userId,
      accountId: who.accountId,
      symbol: 'BTCUSDT',
      side: 'BUY',
      orderType: extra.orderType ?? 'MARKET',
      quantity: 1,
      createdAt,
      ...(extra.createType ? { createType: extra.createType } : {}),
      ...(extra.stopLoss !== undefined ? { stopLoss: extra.stopLoss } : {}),
    },
  });
}

async function note(who: { userId: string; accountId: string }, at: Date, isUserNote: boolean) {
  await db.journalEntry.create({
    data: {
      userId: who.userId,
      accountId: who.accountId,
      time: at,
      text: 'x',
      isUserNote,
      createdAt: at,
    },
  });
}

describe('loadRetentionReport (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('takes each user’s earliest user-placed order as the first order, whatever the insert order', async () => {
    const a = await makeUser({});
    // Inserted latest first; carries the stop-loss. The earliest has none.
    await placeOrder(a, hoursAfter(5), { orderType: 'LIMIT', stopLoss: 100 });
    await placeOrder(a, hoursAfter(1));

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.signups).toBe(1);
    expect(r.totals.activated).toEqual({ eligible: 1, count: 1 });
    expect(r.totals.medianHoursToFirstOrder).toBe(1);
    expect(r.totals.firstOrderWithStopLoss).toEqual({ eligible: 1, count: 0 });
  });

  it('does not count engine exit legs or liquidation rows as a first order', async () => {
    const b = await makeUser({});
    await placeOrder(b, hoursAfter(1), { orderType: 'TAKE_PROFIT' });
    await placeOrder(b, hoursAfter(2), { orderType: 'MARKET', createType: 'CreateByLiq' });

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.activated).toEqual({ eligible: 1, count: 0 });
    expect(r.totals.firstOrderWithStopLoss.eligible).toBe(0);
  });

  it('leaves the admin and the QA account out of every number', async () => {
    await makeUser({ email: 'admin@test.com', username: 'the_admin' });
    await makeUser({ username: 'cpt_qa_test' });
    const real = await makeUser({});
    await placeOrder(real, hoursAfter(1));

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.signups).toBe(1);
    expect(r.totals.activated).toEqual({ eligible: 1, count: 1 });
  });

  it('counts a written note as return, and an automatic journal line as nothing', async () => {
    const c = await makeUser({});
    const d = await makeUser({});
    await note(c, hoursAfter(24 * 3), true); // day 3
    await note(d, hoursAfter(24 * 3), false); // engine's "limit order filled" line

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.signups).toBe(2);
    expect(r.totals.activeWeek1).toEqual({ eligible: 2, count: 1 });
  });

  it('counts a reset as activity and as a reset user', async () => {
    await makeUser({ resetCount: 1, lastReset: hoursAfter(24 * 2) });

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.resetUsers).toBe(1);
    expect(r.totals.activeWeek1).toEqual({ eligible: 1, count: 1 });
  });

  it('ignores users who signed up before the window', async () => {
    await makeUser({ createdAt: new Date('2026-01-05T10:00:00.000Z') });

    const r = await loadRetentionReport(db, NOW);
    expect(r.totals.signups).toBe(0);
    expect(r.cohorts).toHaveLength(12);
  });
});
