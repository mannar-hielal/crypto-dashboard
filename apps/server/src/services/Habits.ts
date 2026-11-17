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
  const format = zoneFormat(zone);
  if (!format) return (d) => Math.floor(d.getTime() / DAY_MS);
  // A date is the same all through a quarter hour, so each quarter hour is formatted once per
  // request: the rows counted here date from 2026 on, when every zone's offset is a whole number of
  // quarter hours (a test checks every zone the runtime knows)
  const seen = new Map<number, number>();
  return (d) => {
    const quarter = Math.floor(d.getTime() / QUARTER_HOUR_MS);
    const known = seen.get(quarter);
    if (known !== undefined) return known;
    let year = 0;
    let month = 0;
    let day = 0;
    for (const p of format.formatToParts(d)) {
      if (p.type === 'year') year = Number(p.value);
      else if (p.type === 'month') month = Number(p.value);
      else if (p.type === 'day') day = Number(p.value);
    }
    const index = Date.UTC(year, month - 1, day) / DAY_MS;
    seen.set(quarter, index);
    return index;
  };
}

const QUARTER_HOUR_MS = 15 * 60_000;

/**
 * 🔐 The zones this runtime knows (418 on Node 24), as Intl names them. A formatter is kept only for
 * one of these, so that cache never holds more than the list, whatever is sent
 */
const KNOWN_ZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('timeZone'));
const ZONE_FORMATS = new Map<string, Intl.DateTimeFormat>();

/**
 * 🔐 Any other text sent as a zone → the known zone Intl reads it as (`asia/kolkata`, `US/Eastern`),
 * or null (a made-up name, an offset such as `+05:07`), so it is never worked out twice. Capped, least
 * recently used out first: such names only ever push out each other
 */
const ZONE_SPELLINGS = new Map<string, string | null>();
const MAX_ZONE_SPELLINGS = 200;

/** A zone's name as the known list has it, or null: UTC for anything else */
function knownZone(zone: string): string | null {
  if (KNOWN_ZONES.has(zone)) return zone;
  const seen = ZONE_SPELLINGS.get(zone);
  if (seen !== undefined) {
    ZONE_SPELLINGS.delete(zone);
    ZONE_SPELLINGS.set(zone, seen);
    return seen;
  }
  let canonical: string | null;
  try {
    const named = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
    canonical = KNOWN_ZONES.has(named) ? named : null;
  } catch {
    canonical = null;
  }
  if (ZONE_SPELLINGS.size >= MAX_ZONE_SPELLINGS) {
    const oldest = ZONE_SPELLINGS.keys().next().value;
    if (oldest !== undefined) ZONE_SPELLINGS.delete(oldest);
  }
  ZONE_SPELLINGS.set(zone, canonical);
  return canonical;
}

/** The zone's date formatter, or null for UTC and for anything not a known zone */
function zoneFormat(zone: string): Intl.DateTimeFormat | null {
  if (zone === 'UTC') return null;
  const name = knownZone(zone);
  if (!name) return null;
  let format = ZONE_FORMATS.get(name);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    ZONE_FORMATS.set(name, format);
  }
  return format;
}

/** How many zones' formatters are kept (tests) */
export function zoneFormatsKept(): number {
  return ZONE_FORMATS.size;
}

export interface HabitInput {
  /** User-placed orders that carried a stop-loss */
  stopLossOrders: number;
  /** When the user wrote a journal note */
  noteTimes: Date[];
  /** When the user started, moved through or finished a tour or a lesson */
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
  const today = dayIndex(now);
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
    streakDays: streakEndingAt(learningDays, today),
    thisWeek: weekDays(learningDays, today),
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
      // A day is learned when a tour or a lesson is started or finished on it: every session
      // starts one (opening a lesson again is a start), and the streak screen shows right after a
      // finish. Not each step (about 25 a lesson), so the rows read cover far more days. Never a
      // rating: a new one deletes the learner's earlier rating of that lesson (and that day)
      where: {
        userId,
        name: { in: ['tour_started', 'tour_completed'] },
      },
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
