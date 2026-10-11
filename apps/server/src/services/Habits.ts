/**
 * Habit badges and the learning streak for the Learn panel. Every number is counted from rows the
 * app already keeps — nothing new is stored — and every badge is a careful habit, never a result:
 * a stop-loss set, a journal kept, a tour finished. No badge for profit, for trading often or for
 * trading every day (the education report: reward habits, never profits or frequency).
 */

import type { FastifyInstance } from 'fastify';
import type { HabitBadge, HabitBadgeId, HabitsResponse } from '@crypto-dashboard/sdk';
import { LEARN_TOUR_IDS } from '../constants.js';
import { USER_ORDER_TYPES } from './RetentionMetrics.js';

type Prisma = FastifyInstance['prisma'];

const DAY_MS = 86_400_000;
/** 🔐 Bounds on the rows read for one user (the journal is capped at 200 per user anyway) */
const MAX_ROWS = 500;

const dayIndex = (d: Date) => Math.floor(d.getTime() / DAY_MS);

export interface HabitInput {
  /** User-placed orders that carried a stop-loss */
  stopLossOrders: number;
  /** When the user wrote a journal note */
  noteTimes: Date[];
  /** When the user started or moved through a guided-tour step */
  tourTimes: Date[];
  /** Tours finished */
  toursCompleted: number;
}

const BADGES: ReadonlyArray<{ id: HabitBadgeId; target: number }> = [
  { id: 'first-stop-loss', target: 1 },
  { id: 'ten-stop-losses', target: 10 },
  { id: 'journal-week', target: 7 },
  { id: 'first-tour', target: 1 },
  { id: 'all-tours', target: LEARN_TOUR_IDS.length },
];

/** Consecutive days ending today — or yesterday, so a streak is alive until midnight */
export function streakEndingAt(days: ReadonlySet<number>, today: number): number {
  let day = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (day === null) return 0;
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day -= 1;
  }
  return n;
}

export function computeHabits(input: HabitInput, now: Date): HabitsResponse {
  const noteDays = new Set(input.noteTimes.map(dayIndex));
  const learningDays = new Set([...noteDays, ...input.tourTimes.map(dayIndex)]);

  const counted: Record<HabitBadgeId, number> = {
    'first-stop-loss': input.stopLossOrders,
    'ten-stop-losses': input.stopLossOrders,
    'journal-week': noteDays.size,
    'first-tour': input.toursCompleted,
    'all-tours': input.toursCompleted,
  };
  const badges: HabitBadge[] = BADGES.map(({ id, target }) => {
    // eslint-disable-next-line security/detect-object-injection -- id is from the fixed list above
    const value = counted[id];
    return { id, target, progress: Math.min(value, target), earned: value >= target };
  });

  return {
    badges,
    learningDays: learningDays.size,
    streakDays: streakEndingAt(learningDays, dayIndex(now)),
  };
}

export async function loadHabits(
  prisma: Prisma,
  userId: string,
  now: Date = new Date()
): Promise<HabitsResponse> {
  const [stopLossOrders, notes, events, toursCompleted] = await Promise.all([
    prisma.order.count({
      where: {
        userId,
        createType: null,
        orderType: { in: [...USER_ORDER_TYPES] },
        stopLoss: { not: null },
      },
    }),
    prisma.journalEntry.findMany({
      where: { userId, isUserNote: true },
      take: MAX_ROWS,
      select: { createdAt: true },
    }),
    prisma.learningEvent.findMany({
      where: { userId, name: { in: ['tour_started', 'tour_step'] } },
      take: MAX_ROWS,
      select: { at: true },
    }),
    prisma.learningProgress.count({
      where: { userId, status: 'completed', itemId: { in: [...LEARN_TOUR_IDS] } },
    }),
  ]);

  return computeHabits(
    {
      stopLossOrders,
      noteTimes: notes.map((n) => n.createdAt),
      tourTimes: events.map((e) => e.at),
      toursCompleted,
    },
    now
  );
}
