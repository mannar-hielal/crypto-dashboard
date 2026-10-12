import { describe, it, expect } from 'vitest';
import {
  buildRetentionReport,
  weekStartUtc,
  type ActivityRow,
  type FirstOrder,
  type MetricsUser,
} from '../services/RetentionMetrics.js';

// Wednesday 2026-10-14 12:00 UTC; its week starts Monday 2026-10-12
const NOW = new Date('2026-10-14T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

function user(id: string, createdAt: string, extra: Partial<MetricsUser> = {}): MetricsUser {
  return {
    id,
    createdAt: at(createdAt),
    emailVerifiedAt: null,
    resetCount: 0,
    lastReset: null,
    ...extra,
  };
}
const first = (userId: string, createdAt: string, hasStopLoss = false): FirstOrder => ({
  userId,
  createdAt: at(createdAt),
  hasStopLoss,
});
const act = (userId: string, iso: string): ActivityRow => ({ userId, at: at(iso) });

const report = (
  users: MetricsUser[],
  firstOrders: FirstOrder[] = [],
  activity: ActivityRow[] = [],
  weeks = 4
) => buildRetentionReport({ users, firstOrders, activity, truncated: false }, NOW, weeks);

describe('weekStartUtc', () => {
  it('is Monday 00:00 UTC for every day of the week, Sunday included', () => {
    expect(weekStartUtc(at('2026-10-12T00:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(weekStartUtc(at('2026-10-14T23:59:59Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(weekStartUtc(at('2026-10-18T23:59:59Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(weekStartUtc(at('2026-10-19T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });
});

describe('buildRetentionReport', () => {
  it('returns one empty cohort per week of the window, newest first', () => {
    const r = report([]);
    expect(r.cohorts.map((c) => c.weekStart)).toEqual([
      '2026-10-12',
      '2026-10-05',
      '2026-09-28',
      '2026-09-21',
    ]);
    expect(r.cohorts.every((c) => c.signups === 0)).toBe(true);
    expect(r.totals.weekStart).toBeNull();
    expect(r.totals.medianHoursToFirstOrder).toBeNull();
  });

  it('buckets users by the Monday of their signup week and counts verified / reset users', () => {
    const r = report([
      user('a', '2026-10-04T23:59:00Z', { emailVerifiedAt: at('2026-10-05T00:01:00Z') }), // Sunday → week of 09-28
      user('b', '2026-10-05T00:00:00Z', { resetCount: 2, lastReset: at('2026-10-06T00:00:00Z') }),
    ]);
    const byWeek = Object.fromEntries(r.cohorts.map((c) => [c.weekStart, c]));
    expect(byWeek['2026-09-28'].signups).toBe(1);
    expect(byWeek['2026-09-28'].verified).toBe(1);
    expect(byWeek['2026-10-05'].signups).toBe(1);
    expect(byWeek['2026-10-05'].resetUsers).toBe(1);
    expect(r.totals.signups).toBe(2);
  });

  it('ignores users outside the window', () => {
    const r = report([user('old', '2026-01-01T00:00:00Z')]);
    expect(r.totals.signups).toBe(0);
  });

  describe('activation', () => {
    it('counts a first order within 7 days; one after 7 days or none is not activated', () => {
      const users = [
        user('fast', '2026-10-05T10:00:00Z'),
        user('slow', '2026-10-05T10:00:00Z'),
        user('never', '2026-10-05T10:00:00Z'),
      ];
      const r = report(users, [
        first('fast', '2026-10-05T11:30:00Z'),
        first('slow', '2026-10-13T10:00:00Z'), // 8 days later
      ]);
      expect(r.totals.activated).toEqual({ eligible: 3, count: 1 });
      expect(r.totals.medianHoursToFirstOrder).toBe(1.5);
    });

    it('leaves a user out of the denominator until 7 days have passed', () => {
      const r = report(
        [user('new', '2026-10-13T10:00:00Z')],
        [first('new', '2026-10-13T10:05:00Z')]
      );
      expect(r.totals.activated).toEqual({ eligible: 0, count: 0 });
    });

    it('takes the median of the activated users only (even count averages the middle two)', () => {
      const users = ['a', 'b', 'c', 'd'].map((id) => user(id, '2026-10-05T00:00:00Z'));
      const r = report(users, [
        first('a', '2026-10-05T01:00:00Z'),
        first('b', '2026-10-05T02:00:00Z'),
        first('c', '2026-10-05T04:00:00Z'),
        first('d', '2026-10-05T10:00:00Z'),
      ]);
      expect(r.totals.medianHoursToFirstOrder).toBe(3);
    });
  });

  describe('return in week 1 / 2 / 4', () => {
    const signup = '2026-09-21T10:00:00Z'; // Monday; 23 days before NOW (the 14th) → week 1–2 elapsed

    it('counts activity on a later UTC day, not on the signup day', () => {
      const r = report(
        [user('same-day', signup), user('next-day', signup)],
        [],
        [act('same-day', '2026-09-21T23:00:00Z'), act('next-day', '2026-09-22T00:30:00Z')]
      );
      expect(r.totals.activeWeek1).toEqual({ eligible: 2, count: 1 });
    });

    it('places day 8–14 in week 2 and not in week 1', () => {
      const r = report([user('a', signup)], [], [act('a', '2026-09-29T09:00:00Z')]); // day 8
      expect(r.totals.activeWeek1.count).toBe(0);
      expect(r.totals.activeWeek2).toEqual({ eligible: 1, count: 1 });
    });

    it('is not eligible for a window that has not fully passed', () => {
      const r = report([user('a', signup)]);
      // week 1 ended on day 7 (09-28), week 2 on day 14 (10-05): both over; week 4 ends 10-19
      expect(r.totals.activeWeek1.eligible).toBe(1);
      expect(r.totals.activeWeek2.eligible).toBe(1);
      expect(r.totals.activeWeek4.eligible).toBe(0);
    });

    it('counts the last account reset as activity', () => {
      const r = report([
        user('a', signup, { resetCount: 1, lastReset: at('2026-09-25T00:00:00Z') }),
      ]);
      expect(r.totals.activeWeek1).toEqual({ eligible: 1, count: 1 });
    });
  });

  it('measures the stop-loss share over users who placed an order', () => {
    const users = [
      user('a', '2026-10-05T00:00:00Z'),
      user('b', '2026-10-05T00:00:00Z'),
      user('c', '2026-10-05T00:00:00Z'),
    ];
    const r = report(users, [
      first('a', '2026-10-05T01:00:00Z', true),
      first('b', '2026-10-05T01:00:00Z', false),
    ]);
    expect(r.totals.firstOrderWithStopLoss).toEqual({ eligible: 2, count: 1 });
  });

  it('carries the truncation flag and holds no user identifiers', () => {
    const r = buildRetentionReport(
      {
        users: [user('secret-id', '2026-10-05T00:00:00Z')],
        firstOrders: [],
        activity: [],
        truncated: true,
      },
      NOW,
      4
    );
    expect(r.truncated).toBe(true);
    expect(JSON.stringify(r)).not.toContain('secret-id');
  });
});
