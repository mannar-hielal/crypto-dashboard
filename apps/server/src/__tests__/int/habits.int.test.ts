/**
 * Habits on a real Postgres (plan unit U9): the counts come from the caller's own rows only, and
 * only user-placed orders with a stop-loss count — never an engine leg or another user's order.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadHabits } from '../../services/Habits.js';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();
const NOW = new Date('2026-10-14T12:00:00.000Z');

async function account(userId: string) {
  return db.account.create({ data: { userId } });
}

async function order(
  userId: string,
  accountId: string,
  extra: { orderType?: string; createType?: string; stopLoss?: number }
) {
  await db.order.create({
    data: {
      userId,
      accountId,
      symbol: 'BTCUSDT',
      side: 'BUY',
      orderType: extra.orderType ?? 'MARKET',
      quantity: 1,
      ...(extra.createType ? { createType: extra.createType } : {}),
      ...(extra.stopLoss !== undefined ? { stopLoss: extra.stopLoss } : {}),
    },
  });
}

describe('loadHabits (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('counts the caller’s stop-loss orders, not engine legs, liquidations or another user’s', async () => {
    const me = await createUser(db);
    const other = await createUser(db);
    const mine = await account(me);
    const theirs = await account(other);

    await order(me, mine.id, { stopLoss: 100 });
    await order(me, mine.id, { orderType: 'LIMIT', stopLoss: 90 });
    await order(me, mine.id, {}); // no stop-loss
    await order(me, mine.id, { orderType: 'STOP_LOSS', stopLoss: 80 }); // engine leg
    await order(me, mine.id, { createType: 'CreateByLiq', stopLoss: 70 });
    await order(other, theirs.id, { stopLoss: 100 });

    const h = await loadHabits(db, me, NOW);
    const first = h.badges.find((b) => b.id === 'first-stop-loss')!;
    const ten = h.badges.find((b) => b.id === 'ten-stop-losses')!;
    expect(first.earned).toBe(true);
    expect(ten.progress).toBe(2);
    expect(ten.earned).toBe(false);
  });

  it('reads notes (not automatic journal lines), tour events and finished tours', async () => {
    const userId = await createUser(db);
    const acc = await account(userId);
    const at = new Date('2026-10-13T10:00:00.000Z');
    await db.journalEntry.create({
      data: { userId, accountId: acc.id, time: at, text: 'plan', isUserNote: true, createdAt: at },
    });
    await db.journalEntry.create({
      data: { userId, accountId: acc.id, time: at, text: 'auto', isUserNote: false, createdAt: at },
    });
    await db.learningEvent.create({
      data: {
        userId,
        name: 'tour_step',
        itemId: 'primer',
        stepId: 'primer.1',
        at: new Date('2026-10-14T08:00:00Z'),
      },
    });
    await db.learningEvent.create({
      data: {
        userId,
        name: 'tour_closed',
        itemId: 'primer',
        stepId: 'primer.1',
        at: new Date('2026-10-12T08:00:00Z'),
      },
    });
    await db.learningProgress.create({ data: { userId, itemId: 'primer', status: 'completed' } });
    await db.learningProgress.create({
      data: { userId, itemId: 'welcome-card', status: 'dismissed' },
    });

    const h = await loadHabits(db, userId, NOW);

    // the 13th (a note) and the 14th (a tour step); a close and an automatic line add nothing
    expect(h.learningDays).toBe(2);
    expect(h.streakDays).toBe(2);
    expect(h.badges.find((b) => b.id === 'first-tour')!.earned).toBe(true);
    expect(h.badges.find((b) => b.id === 'all-tours')!.progress).toBe(1);
  });

  it('is all zeros for an account with nothing', async () => {
    const userId = await createUser(db);
    const h = await loadHabits(db, userId, NOW);
    expect(h.learningDays).toBe(0);
    expect(h.streakDays).toBe(0);
    expect(h.badges.every((b) => !b.earned)).toBe(true);
  });
});
