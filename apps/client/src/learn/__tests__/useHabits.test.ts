import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));

import { useHabits } from '@/learn/useHabits';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';

const habits = { badges: [], learningDays: 1, streakDays: 1, thisWeek: [] };

describe('useHabits', () => {
  // Each test's hooks unmounted: none left to read again when the next one changes the account
  afterEach(() => cleanup());

  beforeEach(() => {
    getHabits.mockReset();
    useLessonStore.getState().reset();
    useTourStore.getState().reset();
    useTourStore.setState({ loaded: true }); // the account's progress is in
    // No profile from an earlier test: each names its own account
    useAuthStore.getState().clearAuth();
  });

  it('should read nothing when there is no token', () => {
    const { result } = renderHook(() => useHabits(null));
    expect(getHabits).not.toHaveBeenCalled();
    expect(result.current).toEqual({ habits: null, failed: false });
  });

  it('should read again after a finish, keeping the last answer on a failure', async () => {
    getHabits.mockResolvedValueOnce(habits);
    const { result } = renderHook(() => useHabits('t'));
    await waitFor(() => expect(result.current.habits).toEqual(habits));
    getHabits.mockRejectedValueOnce(new Error('offline'));
    act(() => useLessonStore.getState().setCompleted(['lesson-01']));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.habits).toEqual(habits);
    expect(getHabits).toHaveBeenCalledTimes(2);
  });

  it('should show no other account’s habits, but keep its own through a session refresh', async () => {
    useAuthStore.setState({ user: { id: 'a', email: 'a@x', username: 'a' } as never });
    getHabits.mockResolvedValue(habits);
    const { result, rerender } = renderHook(({ t }) => useHabits(t), { initialProps: { t: 't1' } });
    await waitFor(() => expect(result.current.habits).toEqual(habits));
    // The token rotates, same account: still shown while it reads again
    getHabits.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ t: 't2' });
    expect(result.current.habits).toEqual(habits);
    // Another account signs in: nothing shown until its own answer
    act(() => useAuthStore.setState({ user: { id: 'b', email: 'b@x', username: 'b' } as never }));
    getHabits.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ t: 't3' });
    expect(result.current.habits).toBeNull();
  });

  it('should not read again when only the token rotates (the same account)', async () => {
    useAuthStore.getState().setAuth('t1', { id: 'u1', email: 'a@b', username: 'a' } as never);
    getHabits.mockResolvedValue(habits);
    const { rerender } = renderHook(({ t }) => useHabits(t), { initialProps: { t: 't1' } });
    await waitFor(() => expect(getHabits).toHaveBeenCalledTimes(1));
    rerender({ t: 't2' });
    await act(async () => {});
    expect(getHabits).toHaveBeenCalledTimes(1);
  });

  it('should send nothing for a read cancelled before it answered', async () => {
    let answer: (v: unknown) => void = () => undefined;
    getHabits.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const { result, unmount } = renderHook(() => useHabits('t'));
    unmount(); // the map closed (or the account changed) before the answer
    await act(async () => answer(habits));
    expect(result.current.habits).toBeNull();
  });

  it('should share one habits request between two readers of the same account', async () => {
    getHabits.mockResolvedValue(habits);
    // The map and the streak screen opening together after a finish
    const a = renderHook(() => useHabits('t'));
    const b = renderHook(() => useHabits('t'));
    await waitFor(() => expect(a.result.current.habits).toEqual(habits));
    await waitFor(() => expect(b.result.current.habits).toEqual(habits));
    expect(getHabits).toHaveBeenCalledTimes(1);
  });

  it('should never let a read after a finish join one sent before it', async () => {
    let answer: (h: typeof habits) => void = () => {};
    getHabits.mockReturnValueOnce(new Promise((r) => (answer = r))).mockResolvedValue(habits);
    renderHook(() => useHabits('t')); // the map, its read on its way
    act(() => useLessonStore.getState().setCompleted(['lesson-01'])); // a finish
    // The streak screen opens after it
    const streak = renderHook(() => useHabits('t'));
    await waitFor(() => expect(streak.result.current.habits).toEqual(habits));
    expect(getHabits).toHaveBeenCalledTimes(2);
    await act(async () => answer(habits)); // no read left on its way for the next test
  });

  it('should read once the account’s progress is in, not before and again after', async () => {
    getHabits.mockResolvedValue(habits);
    useTourStore.setState({ loaded: false });
    renderHook(() => useHabits('t'));
    await act(async () => {});
    expect(getHabits).not.toHaveBeenCalled();
    act(() => useTourStore.setState({ loaded: true }));
    await waitFor(() => expect(getHabits).toHaveBeenCalledTimes(1));
  });
});
