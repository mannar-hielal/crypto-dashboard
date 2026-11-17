import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));

import { useHabits } from '@/learn/useHabits';
import { finishSaved, noteFinishSent } from '@/learn/finishSync';
import { useAuthStore } from '@/store/authStore';

const habits = { badges: [], learningDays: 1, streakDays: 1, thisWeek: [] };

describe('useHabits', () => {
  // Each test's hooks unmounted: none left to read again when the next one changes the account
  afterEach(() => cleanup());

  beforeEach(() => {
    getHabits.mockReset();
    // No profile from an earlier test: each names its own account
    useAuthStore.getState().clearAuth();
  });

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

  it('should read the habits only after the last finish’s event has landed', async () => {
    let land: () => void = () => undefined;
    noteFinishSent(null, new Promise<void>((resolve) => (land = resolve)));
    getHabits.mockResolvedValueOnce(habits);
    const { result } = renderHook(() => useHabits('t'));
    await act(async () => {});
    expect(getHabits).not.toHaveBeenCalled();
    await act(async () => land());
    await waitFor(() => expect(result.current.habits).toEqual(habits));
  });

  it('should wait for nothing, and set no timer, when no finish is on its way', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    await finishSaved(null);
    expect(timer).not.toHaveBeenCalled();
    timer.mockRestore();
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

  it('should send nothing for a read cancelled while it waited for a finish', async () => {
    let land: () => void = () => undefined;
    noteFinishSent(null, new Promise<void>((resolve) => (land = resolve)));
    getHabits.mockResolvedValue(habits);
    const { unmount } = renderHook(() => useHabits('t'));
    unmount(); // the map closed (or the token changed) while it waited
    await act(async () => land());
    expect(getHabits).not.toHaveBeenCalled();
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
});
