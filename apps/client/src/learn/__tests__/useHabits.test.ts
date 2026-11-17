import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));

import { useHabits, withTodayLearned } from '@/learn/useHabits';

const habits = { badges: [], learningDays: 1, streakDays: 1, thisWeek: [] };

describe('useHabits', () => {
  beforeEach(() => getHabits.mockReset());

  it('should read nothing when there is no token', () => {
    const { result } = renderHook(() => useHabits(null));
    expect(getHabits).not.toHaveBeenCalled();
    expect(result.current).toEqual({ habits: null, failed: false });
  });

  it('should read again when the refresh key changes, keeping the last answer on a failure', async () => {
    getHabits.mockResolvedValueOnce(habits);
    const { result, rerender } = renderHook(({ n }) => useHabits('t', n), {
      initialProps: { n: 0 },
    });
    await waitFor(() => expect(result.current.habits).toEqual(habits));
    getHabits.mockRejectedValueOnce(new Error('offline'));
    rerender({ n: 1 });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.habits).toEqual(habits);
    expect(getHabits).toHaveBeenCalledTimes(2);
  });

  it('should count today as learned on the streak screen when the finish is not counted yet', () => {
    const wed = new Date(2026, 10, 18, 9); // a Wednesday, local time
    const before = {
      badges: [],
      learningDays: 4,
      streakDays: 2,
      thisWeek: [true, true, false, false, false, false, false],
    };
    expect(withTodayLearned(before, wed)).toEqual({
      ...before,
      learningDays: 5,
      streakDays: 3,
      thisWeek: [true, true, true, false, false, false, false],
    });
    // Already counted, or no week (an older API): left as it is
    const counted = { ...before, thisWeek: [true, true, true, false, false, false, false] };
    expect(withTodayLearned(counted, wed)).toBe(counted);
    const older = { ...before, thisWeek: undefined };
    expect(withTodayLearned(older, wed)).toBe(older);
  });
});
