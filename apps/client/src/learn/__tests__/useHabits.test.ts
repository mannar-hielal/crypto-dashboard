import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));

import { useHabits } from '@/learn/useHabits';

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
});
