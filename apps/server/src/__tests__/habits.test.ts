import { describe, expect, it } from 'vitest';
import {
  computeHabits,
  streakEndingAt,
  type HabitInput,
  dayCounter,
  zoneFormatsKept,
} from '../services/Habits.js';

const NOW = new Date('2026-10-14T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T09:00:00Z`);
const base: HabitInput = { stopLossOrders: 0, noteTimes: [], tourTimes: [], toursCompleted: 0 };
const badge = (r: ReturnType<typeof computeHabits>, id: string) =>
  r.badges.find((b) => b.id === id)!;

describe('computeHabits', () => {
  it('should earn nothing for an empty account and list every badge at zero', () => {
    const r = computeHabits(base, NOW);
    expect(r.badges.map((b) => b.id)).toEqual([
      'first-stop-loss',
      'ten-stop-losses',
      'journal-week',
      'first-tour',
      'all-tours',
    ]);
    expect(r.badges.every((b) => !b.earned && b.progress === 0)).toBe(true);
    expect(r.learningDays).toBe(0);
    expect(r.streakDays).toBe(0);
  });

  it('should award the stop-loss badges by how many protected orders there are', () => {
    const r = computeHabits({ ...base, stopLossOrders: 4 }, NOW);
    expect(badge(r, 'first-stop-loss')).toMatchObject({ earned: true, progress: 1, target: 1 });
    expect(badge(r, 'ten-stop-losses')).toMatchObject({ earned: false, progress: 4, target: 10 });
    expect(
      badge(computeHabits({ ...base, stopLossOrders: 25 }, NOW), 'ten-stop-losses')
    ).toMatchObject({ earned: true, progress: 10 });
  });

  it('should count journal days, not notes: seven notes on one day is one day', () => {
    const sameDay = Array.from({ length: 7 }, () => day('2026-10-10'));
    expect(
      badge(computeHabits({ ...base, noteTimes: sameDay }, NOW), 'journal-week')
    ).toMatchObject({
      earned: false,
      progress: 1,
    });
    const sevenDays = Array.from({ length: 7 }, (_, i) => day(`2026-10-0${i + 1}`));
    expect(
      badge(computeHabits({ ...base, noteTimes: sevenDays }, NOW), 'journal-week').earned
    ).toBe(true);
  });

  it('should award the tour badges by tours finished', () => {
    expect(badge(computeHabits({ ...base, toursCompleted: 1 }, NOW), 'first-tour').earned).toBe(
      true
    );
    expect(badge(computeHabits({ ...base, toursCompleted: 1 }, NOW), 'all-tours').earned).toBe(
      false
    );
    expect(badge(computeHabits({ ...base, toursCompleted: 3 }, NOW), 'all-tours').earned).toBe(
      true
    );
  });

  it('should count a learning day from a tour step or a note, once', () => {
    const r = computeHabits(
      {
        ...base,
        noteTimes: [day('2026-10-13')],
        tourTimes: [day('2026-10-13'), day('2026-10-12')],
      },
      NOW
    );
    expect(r.learningDays).toBe(2);
    expect(r.streakDays).toBe(2); // 12th and 13th, ending yesterday
  });

  it('should mark this week’s learning days, Monday first (UTC)', () => {
    // NOW is Wednesday 14 Oct 2026: Monday the 12th, Tuesday the 13th, and last week's Sunday the 11th
    const r = computeHabits(
      { ...base, tourTimes: [day('2026-10-12'), day('2026-10-14'), day('2026-10-11')] },
      NOW
    );
    expect(r.thisWeek).toEqual([true, false, true, false, false, false, false]);
  });

  it('should start the week on Monday even on a Sunday', () => {
    const sunday = new Date('2026-10-18T22:00:00Z');
    const r = computeHabits({ ...base, tourTimes: [day('2026-10-12'), day('2026-10-18')] }, sunday);
    expect(r.thisWeek).toEqual([true, false, false, false, false, false, true]);
  });

  it('should have no badge that depends on profit or on how often someone trades', () => {
    // The set of ids is the contract: a profit / frequency badge would have to be added here
    const ids = computeHabits(base, NOW).badges.map((b) => b.id.toString());
    expect(ids.some((id) => /profit|win|trade-|streak|daily/.test(id))).toBe(false);
  });
});

describe('streakEndingAt', () => {
  const t = Math.floor(NOW.getTime() / 86_400_000);

  it('should be alive through today and through yesterday, dead after that', () => {
    expect(streakEndingAt(new Set([t, t - 1, t - 2]), t)).toBe(3);
    expect(streakEndingAt(new Set([t - 1, t - 2]), t)).toBe(2);
    expect(streakEndingAt(new Set([t - 2, t - 3]), t)).toBe(0);
  });

  it('should stop at the first gap', () => {
    expect(streakEndingAt(new Set([t, t - 1, t - 3]), t)).toBe(2);
  });

  it('should count the learner’s own days (a time zone east of UTC)', () => {
    // 22:30 UTC on Sunday 11 Oct is 08:30 on Monday 12 Oct in UTC+10
    const sundayUtc = new Date('2026-10-11T22:30:00Z');
    const utc = computeHabits({ ...base, tourTimes: [sundayUtc] }, NOW);
    const sydney = computeHabits({ ...base, tourTimes: [sundayUtc] }, NOW, 'Australia/Sydney');
    expect(utc.thisWeek[0]).toBe(false);
    expect(sydney.thisWeek[0]).toBe(true); // Monday, where the learner is
  });

  it('should place each day with its own date’s offset, across a daylight-saving change', () => {
    const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
    const zurich = dayCounter('Europe/Zurich');
    // 00:30 on 24 Oct in Zurich (summer time, UTC+2), before the change on 25 Oct
    expect(zurich(new Date('2026-10-23T22:30:00Z'))).toBe(day(2026, 10, 24));
    // 00:30 on 26 Oct in Zurich (winter time, UTC+1), after it
    expect(zurich(new Date('2026-10-25T23:30:00Z'))).toBe(day(2026, 10, 26));
  });

  it('should change the day exactly at local midnight, in a zone with a 45-minute offset', () => {
    // Kathmandu is UTC+5:45: its midnight on 24 Oct is 18:15 UTC on 23 Oct
    const day = (d: number) => Date.UTC(2026, 9, d) / 86_400_000;
    const kathmandu = dayCounter('Asia/Kathmandu');
    expect(kathmandu(new Date('2026-10-23T18:14:59Z'))).toBe(day(23));
    expect(kathmandu(new Date('2026-10-23T18:15:00Z'))).toBe(day(24));
    // The same quarter hour again: the same day (formatted once)
    expect(kathmandu(new Date('2026-10-23T18:29:59Z'))).toBe(day(24));
  });

  it('should rely only on offsets of whole quarter hours: every zone, all through 2026', () => {
    const odd: string[] = [];
    for (const zone of Intl.supportedValuesOf('timeZone')) {
      const format = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        timeZoneName: 'longOffset',
      });
      for (let month = 0; month < 12; month++) {
        const name = format
          .formatToParts(new Date(Date.UTC(2026, month, 15)))
          .find((p) => p.type === 'timeZoneName')?.value;
        const m = /GMT[+-]\d\d:(\d\d)(?::(\d\d))?/.exec(name ?? '');
        if (m && (Number(m[1]) % 15 !== 0 || Number(m[2] ?? 0) !== 0)) odd.push(`${zone} ${name}`);
      }
    }
    expect(odd).toEqual([]);
  });

  it('should keep one formatter per zone, however its name is spelt', () => {
    const before = zoneFormatsKept();
    dayCounter('Europe/Vienna');
    for (const name of ['europe/vienna', 'EUROPE/VIENNA', 'eUROPE/vIENNA', 'Europe/VIENNA']) {
      expect(dayCounter(name)(new Date('2026-10-23T22:30:00Z'))).toBe(
        Date.UTC(2026, 9, 24) / 86_400_000
      );
    }
    expect(zoneFormatsKept()).toBe(before + 1);
  });

  it('should count in UTC for no time zone or an unknown one', () => {
    const late = new Date('2026-10-23T22:30:00Z');
    expect(dayCounter()(late)).toBe(Date.UTC(2026, 9, 23) / 86_400_000);
    expect(dayCounter('Mars/Olympus')(late)).toBe(Date.UTC(2026, 9, 23) / 86_400_000);
  });
});
