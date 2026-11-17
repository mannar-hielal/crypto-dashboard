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
/**
 * 🔐 Bounds on the rows each read takes for one user (the journal is capped at 200 per user, the
 * learning events at MAX_LEARN_EVENTS_PER_USER, 500, today): the read's own bound, so a larger
 * storage cap never makes every habits read heavier (it then reads the most recent ones)
 */
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
 * 🔐 The zones this runtime knows (418 on Node 24), as Intl names them, plus the fixed whole-hour
 * ones. Formatters are kept for zone names Intl itself returns (its own database: these and its
 * aliases), and that cache is capped too (MAX_ZONE_FORMATS), whatever is sent
 */
const KNOWN_ZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf('timeZone'),
  // The fixed whole-hour zones Intl leaves out of its list (a device may report one): Etc/GMT-14
  // is UTC+14, Etc/GMT+12 is UTC−12
  ...Array.from({ length: 14 }, (_, i) => `Etc/GMT-${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `Etc/GMT+${i + 1}`),
  'Etc/GMT',
  'Etc/UTC',
]);
const ZONE_FORMATS = new Map<string, Intl.DateTimeFormat>();
/** 🔐 Above every name Intl's database holds (about 600 with its aliases): a bound, never reached */
const MAX_ZONE_FORMATS = 1000;
/**
 * 🔐 A zone name as Intl's own database writes them, never an offset: Asia/Kolkata,
 * America/Argentina/Salta, and the one-part aliases (Japan, GB, EST5EDT). It starts with a letter
 * (an offset starts with + or −); split on '/', each part checked with a plain pattern (no nested
 * repetition, so no regex backtracking on what a client sends)
 */
function isZoneName(name: string): boolean {
  const parts = name.split('/');
  return (
    parts.length <= 4 &&
    /^[A-Za-z][A-Za-z0-9_+-]*$/.test(parts[0]) &&
    parts.slice(1).every((p) => /^[A-Za-z0-9_+-]+$/.test(p))
  );
}

/**
 * 🔐 Any other text sent as a zone → the known zone Intl reads it as (`asia/kolkata`, `US/Eastern`),
 * or null (a made-up name, an offset such as `+05:07`), so it is never worked out twice. Capped, least
 * recently used out first: such names only ever push out each other. (Weighed, review round 33: one
 * cache keyed by the sent text would be shorter, but then text a client makes up could push out the
 * real zones' formatters; kept apart, it never touches them)
 */
const ZONE_SPELLINGS = new Map<string, string | null>();
const MAX_ZONE_SPELLINGS = 200;

/** 🔐 Both zone caches' rule: least recently used out first, never past the cap */
function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}
function lruSet<V>(cache: Map<string, V>, key: string, value: V, cap: number): void {
  // An overwrite takes the key's own place (moved to the end), never another's
  if (cache.has(key)) cache.delete(key);
  else if (cache.size >= cap) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** A zone's name as the known list has it, or null: UTC for anything else */
function knownZone(zone: string): string | null {
  if (KNOWN_ZONES.has(zone)) return zone;
  const seen = lruGet(ZONE_SPELLINGS, zone);
  if (seen !== undefined) return seen;
  let canonical: string | null;
  try {
    const named = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
    // A listed zone, or any zone name Intl itself returns (its own database, so a finite set): a
    // runtime that names Asia/Kolkata or Japan as itself, not as a listed name, still counts it.
    // Never an offset ('+05:07'), which isn't on a quarter hour
    canonical = KNOWN_ZONES.has(named) || isZoneName(named) ? named : null;
  } catch {
    canonical = null;
  }
  lruSet(ZONE_SPELLINGS, zone, canonical, MAX_ZONE_SPELLINGS);
  return canonical;
}

/** The zone's date formatter, or null for UTC and for anything not a known zone */
function zoneFormat(zone: string): Intl.DateTimeFormat | null {
  if (zone === 'UTC') return null;
  const name = knownZone(zone);
  if (!name) return null;
  let format = lruGet(ZONE_FORMATS, name);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    // (never more than the cap: a runtime that echoed any name back would still be bounded)
    lruSet(ZONE_FORMATS, name, format, MAX_ZONE_FORMATS);
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
  /** When the user started, moved through, closed or finished a tour or a lesson */
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
      orderBy: { createdAt: 'desc' }, // the most recent days, should the cap ever pass the bound
      take: MAX_ROWS,
      select: { createdAt: true },
    }),
    // The rule (2026-11-17): a learning day is one with any learning event on it but a rating (a new
    // rating deletes the earlier one of that lesson, and its day with it): starts, finishes and
    // closes (a few a run, each stored every time, so a run carried on past midnight still marks
    // its second day when it ends) and steps (each stored once ever, the days a new screen was
    // reached). One read: with today's cap (MAX_LEARN_EVENTS_PER_USER, 500) it takes them all (review
    // round 37: the two reads it replaced read the same rows)
    prisma.learningEvent.findMany({
      where: { userId, name: { not: 'lesson_rated' } },
      orderBy: { at: 'desc' }, // the most recent days, should the cap ever pass the read's bound
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
