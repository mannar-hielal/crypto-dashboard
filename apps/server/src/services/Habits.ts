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

/**
 * The learner's day counter: each moment's calendar date in their time zone (an IANA name such as
 * `Europe/Zurich`), as days since 1 Jan 1970. By the zone, not today's offset, so a day before a
 * daylight-saving change is placed with the offset of its own date. UTC for an unknown zone.
 */
export function dayCounter(zone = 'UTC'): (d: Date) => number {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return (d) => Math.floor(d.getTime() / DAY_MS);
  }
  return (d) => {
    const part = (type: string) =>
      Number(format.formatToParts(d).find((p) => p.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day')) / DAY_MS;
  };
}

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

/** This week's learning days, Monday first (the learner's days, as the streak counts them) */
export function weekDays(days: ReadonlySet<number>, today: number): boolean[] {
  // Day 0 (1 Jan 1970) was a Thursday: Monday is 3 days after it
  const monday = today - ((today + 3) % 7);
  return Array.from({ length: 7 }, (_, i) => days.has(monday + i));
}

/**
 * `zone`: the learner's time zone (IANA), so a day, the streak and the week's dots are the learner's
 * own days (UTC when not given or unknown)
 */
export function computeHabits(input: HabitInput, now: Date, zone = 'UTC'): HabitsResponse {
  const dayIndex = dayCounter(zone);
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
    thisWeek: weekDays(learningDays, dayIndex(now)),
  };
}

export async function loadHabits(
  prisma: Prisma,
  userId: string,
  now: Date = new Date(),
  zone = 'UTC'
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
      orderBy: { at: 'desc' }, // the most recent days if there are ever more rows than we read
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
    now,
    zone
  );
}
