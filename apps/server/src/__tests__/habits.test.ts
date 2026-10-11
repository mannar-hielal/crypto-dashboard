import { describe, expect, it } from 'vitest';
import { computeHabits, streakEndingAt, type HabitInput } from '../services/Habits.js';

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
});
