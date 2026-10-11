/**
 * Retention metrics for the admin page (docs: reports/, plan "Retention analytics"): weekly signup
 * cohorts built only from tables that already exist — no tracking, no schema change.
 *
 * Two layers: `buildRetentionReport` is pure (rows in, report out — unit-tested without a DB) and
 * `loadRetentionReport` runs the bounded Prisma queries. The report holds aggregates only: no user
 * id, e-mail or username ever leaves this module.
 *
 * What "active" means here: a day the user signed in or resumed a session (`UserActivity`, kept 180
 * days), or a user-initiated action that leaves a row — an order the user placed, a note the user
 * wrote, an account reset. Engine fills and liquidations are not activity. Activity days only exist
 * from the day they started being recorded (`activityTrackedSince`), so older cohorts under-count.
 */

import type { FastifyInstance } from 'fastify';
import type { MetricsRate, RetentionCohort, RetentionMetricsResponse } from '@crypto-dashboard/sdk';
import { config } from '../config.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export const WINDOW_WEEKS = 12;
/** Activated = a first order within this many days of signup */
export const ACTIVATION_DAYS = 7;
/** 🔐 Bounds on every query: a growing table can never turn this report into a memory problem */
export const MAX_USERS = 20_000;
export const MAX_ACTIVITY_ROWS = 200_000;
/** Accounts that are the owner's own tooling, not users: left out of every number */
export const EXCLUDED_USERNAMES = ['cpt_qa_test'] as const;
/** An order the user placed; TAKE_PROFIT / STOP_LOSS rows are the engine's exit legs */
export const USER_ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP'] as const;

const CACHE_TTL_MS = 10 * 60_000;

// ─── Pure core ──────────────────────────────────────────────────────────────

export interface MetricsUser {
  id: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  resetCount: number;
  lastReset: Date | null;
}

export interface FirstOrder {
  userId: string;
  createdAt: Date;
  hasStopLoss: boolean;
}

export interface ActivityRow {
  userId: string;
  at: Date;
}

export interface ReportInput {
  users: MetricsUser[];
  /** Each user's first user-placed order (at most one per user) */
  firstOrders: FirstOrder[];
  activity: ActivityRow[];
  truncated: boolean;
  /** UTC date of the oldest recorded activity day, or null when none exist yet */
  activityTrackedSince?: string | null;
}

/** Monday 00:00 UTC of the week `d` falls in */
export function weekStartUtc(d: Date): Date {
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
}

const dayIndex = (d: Date) => Math.floor(d.getTime() / DAY_MS);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const rate = (): MetricsRate => ({ eligible: 0, count: 0 });

function emptyCohort(weekStart: string | null): RetentionCohort {
  return {
    weekStart,
    signups: 0,
    verified: 0,
    activated: rate(),
    medianHoursToFirstOrder: null,
    activeWeek1: rate(),
    activeWeek2: rate(),
    activeWeek4: rate(),
    resetUsers: 0,
    firstOrderWithStopLoss: rate(),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted.at(mid) ?? 0;
  const m = sorted.length % 2 === 1 ? hi : ((sorted.at(mid - 1) ?? 0) + hi) / 2;
  return Math.round(m * 10) / 10;
}

function addRate(into: MetricsRate, from: MetricsRate) {
  into.eligible += from.eligible;
  into.count += from.count;
}

/** Cohorts newest first, one per week in the window (empty weeks included), plus a totals row */
export function buildRetentionReport(
  input: ReportInput,
  now: Date,
  windowWeeks = WINDOW_WEEKS
): RetentionMetricsResponse {
  const firstOrderByUser = new Map(input.firstOrders.map((o) => [o.userId, o]));
  const daysByUser = new Map<string, Set<number>>();
  const addDay = (userId: string, at: Date) => {
    let days = daysByUser.get(userId);
    if (!days) daysByUser.set(userId, (days = new Set()));
    days.add(dayIndex(at));
  };
  for (const a of input.activity) addDay(a.userId, a.at);
  // A reset is activity too (only the last one is stored; that is all the table keeps)
  for (const u of input.users) if (u.resetCount > 0 && u.lastReset) addDay(u.id, u.lastReset);

  const thisWeek = weekStartUtc(now);
  const cohorts = new Map<string, RetentionCohort>();
  const hoursByWeek = new Map<string, number[]>();
  for (let i = 0; i < windowWeeks; i++) {
    const key = isoDate(new Date(thisWeek.getTime() - i * WEEK_MS));
    cohorts.set(key, emptyCohort(key));
    hoursByWeek.set(key, []);
  }

  const today = dayIndex(now);
  for (const u of input.users) {
    const key = isoDate(weekStartUtc(u.createdAt));
    const cohort = cohorts.get(key);
    const hours = hoursByWeek.get(key);
    if (!cohort || !hours) continue; // outside the window

    cohort.signups += 1;
    if (u.emailVerifiedAt) cohort.verified += 1;
    if (u.resetCount > 0) cohort.resetUsers += 1;

    const first = firstOrderByUser.get(u.id);
    if (now.getTime() - u.createdAt.getTime() >= ACTIVATION_DAYS * DAY_MS) {
      cohort.activated.eligible += 1;
      const after = first ? first.createdAt.getTime() - u.createdAt.getTime() : null;
      if (after !== null && after >= 0 && after <= ACTIVATION_DAYS * DAY_MS) {
        cohort.activated.count += 1;
        hours.push(after / 3_600_000);
      }
    }
    if (first) {
      cohort.firstOrderWithStopLoss.eligible += 1;
      if (first.hasStopLoss) cohort.firstOrderWithStopLoss.count += 1;
    }

    // Return = activity on a UTC day after the signup day; a window counts once it has fully passed
    const signupDay = dayIndex(u.createdAt);
    const days = daysByUser.get(u.id);
    const returned = (week: number, into: MetricsRate) => {
      const lo = signupDay + 7 * (week - 1) + 1;
      const hi = signupDay + 7 * week;
      if (today <= hi) return;
      into.eligible += 1;
      if (days && [...days].some((d) => d >= lo && d <= hi)) into.count += 1;
    };
    returned(1, cohort.activeWeek1);
    returned(2, cohort.activeWeek2);
    returned(4, cohort.activeWeek4);
  }

  const totals = emptyCohort(null);
  const allHours: number[] = [];
  for (const [key, c] of cohorts) {
    c.medianHoursToFirstOrder = median(hoursByWeek.get(key) ?? []);
    allHours.push(...(hoursByWeek.get(key) ?? []));
    totals.signups += c.signups;
    totals.verified += c.verified;
    totals.resetUsers += c.resetUsers;
    addRate(totals.activated, c.activated);
    addRate(totals.activeWeek1, c.activeWeek1);
    addRate(totals.activeWeek2, c.activeWeek2);
    addRate(totals.activeWeek4, c.activeWeek4);
    addRate(totals.firstOrderWithStopLoss, c.firstOrderWithStopLoss);
  }
  totals.medianHoursToFirstOrder = median(allHours);

  return {
    generatedAt: now.toISOString(),
    windowWeeks,
    truncated: input.truncated,
    activityTrackedSince: input.activityTrackedSince ?? null,
    totals,
    cohorts: [...cohorts.values()], // inserted newest first
  };
}

// ─── Loading ────────────────────────────────────────────────────────────────

type Prisma = FastifyInstance['prisma'];

/** Every query below is bounded by the window and by a row cap, and reads typed Prisma only */
export async function loadRetentionReport(
  prisma: Prisma,
  now: Date = new Date(),
  windowWeeks = WINDOW_WEEKS
): Promise<RetentionMetricsResponse> {
  const start = new Date(weekStartUtc(now).getTime() - (windowWeeks - 1) * WEEK_MS);
  const userFilter = {
    createdAt: { gte: start },
    email: { not: config.adminEmail },
    username: { notIn: [...EXCLUDED_USERNAMES] },
  };
  const placedByUser = {
    user: userFilter,
    createType: null,
    orderType: { in: [...USER_ORDER_TYPES] },
  };

  const [userRows, firstOrderRows, orderActivity, noteActivity, signInDays, oldestSignIn] =
    await Promise.all([
      prisma.user.findMany({
        where: userFilter,
        orderBy: { createdAt: 'asc' },
        take: MAX_USERS + 1,
        select: {
          id: true,
          createdAt: true,
          emailVerifiedAt: true,
          account: { select: { resetCount: true, lastReset: true } },
        },
      }),
      prisma.order.findMany({
        where: placedByUser,
        orderBy: { createdAt: 'asc' },
        distinct: ['userId'],
        take: MAX_USERS + 1,
        select: { userId: true, createdAt: true, stopLoss: true },
      }),
      prisma.order.findMany({
        where: { ...placedByUser, createdAt: { gte: start } },
        take: MAX_ACTIVITY_ROWS,
        select: { userId: true, createdAt: true },
      }),
      prisma.journalEntry.findMany({
        where: { user: userFilter, isUserNote: true, createdAt: { gte: start } },
        take: MAX_ACTIVITY_ROWS,
        select: { userId: true, createdAt: true },
      }),
      prisma.userActivity.findMany({
        where: { user: userFilter, day: { gte: start } },
        take: MAX_ACTIVITY_ROWS,
        select: { userId: true, day: true },
      }),
      // Not filtered by user: "since when do we record sign-in days at all"
      prisma.userActivity.findFirst({ orderBy: { day: 'asc' }, select: { day: true } }),
    ]);

  const truncated =
    userRows.length > MAX_USERS ||
    firstOrderRows.length > MAX_USERS ||
    orderActivity.length >= MAX_ACTIVITY_ROWS ||
    noteActivity.length >= MAX_ACTIVITY_ROWS ||
    signInDays.length >= MAX_ACTIVITY_ROWS;

  return buildRetentionReport(
    {
      users: userRows.slice(0, MAX_USERS).map((u) => ({
        id: u.id,
        createdAt: u.createdAt,
        emailVerifiedAt: u.emailVerifiedAt,
        resetCount: u.account?.resetCount ?? 0,
        lastReset: u.account?.lastReset ?? null,
      })),
      firstOrders: firstOrderRows.slice(0, MAX_USERS).map((o) => ({
        userId: o.userId,
        createdAt: o.createdAt,
        hasStopLoss: o.stopLoss !== null,
      })),
      activity: [
        ...[...orderActivity, ...noteActivity].map((r) => ({ userId: r.userId, at: r.createdAt })),
        ...signInDays.map((r) => ({ userId: r.userId, at: r.day })),
      ],
      truncated,
      activityTrackedSince: oldestSignIn ? oldestSignIn.day.toISOString().slice(0, 10) : null,
    },
    now,
    windowWeeks
  );
}

// ─── Cache ──────────────────────────────────────────────────────────────────

/** One entry, never a map: the report takes no parameters, so nothing here can grow */
let cached: { at: number; report: RetentionMetricsResponse } | null = null;

export async function getRetentionReport(prisma: Prisma): Promise<RetentionMetricsResponse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.report;
  const report = await loadRetentionReport(prisma, new Date(now));
  cached = { at: now, report };
  return report;
}

/** For tests */
export function clearRetentionCache() {
  cached = null;
}
