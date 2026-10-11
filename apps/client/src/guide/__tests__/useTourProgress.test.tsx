import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const getProgress = vi.fn();
const setProgress = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: {
    getProgress: (...a: unknown[]) => getProgress(...a),
    setProgress: (...a: unknown[]) => setProgress(...a),
  },
}));

let token: string | null = 'tok';
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: token }),
}));

import { useTourProgress } from '@/guide/useTourProgress';
import { useTourStore } from '@/guide/tourStore';

const item = (itemId: string, status: string) => ({
  itemId,
  status,
  updatedAt: '2026-10-11T00:00:00Z',
});

describe('useTourProgress', () => {
  beforeEach(() => {
    token = 'tok';
    useTourStore.getState().reset();
    getProgress.mockReset();
    setProgress.mockReset();
    setProgress.mockResolvedValue({});
  });
  afterEach(() => cleanup());

  it('should load the account’s finished tours and the dismissed card', async () => {
    getProgress.mockResolvedValue({
      items: [item('primer', 'completed'), item('welcome-card', 'dismissed')],
    });
    renderHook(() => useTourProgress());

    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(getProgress).toHaveBeenCalledWith('tok');
    expect(useTourStore.getState().completed).toEqual({ primer: true });
    expect(useTourStore.getState().cardDismissed).toBe(true);
    // loading is the server's answer: nothing is written back
    expect(setProgress).not.toHaveBeenCalled();
  });

  it('should treat a finished primer as the offer being done with', async () => {
    getProgress.mockResolvedValue({ items: [item('primer', 'completed')] });
    renderHook(() => useTourProgress());

    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should offer the card to an account with no progress', async () => {
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());

    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(useTourStore.getState().cardDismissed).toBe(false);
  });

  it('should show no offer when the progress cannot be read', async () => {
    getProgress.mockRejectedValue(new Error('network'));
    renderHook(() => useTourProgress());

    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should save a finished tour and a dismissed card, once each', async () => {
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));

    act(() => {
      useTourStore.getState().dismissCard();
    });
    expect(setProgress).toHaveBeenCalledWith('welcome-card', 'dismissed', 'tok');

    act(() => {
      useTourStore.getState().start('sell-and-review');
      for (let i = 0; i < 5; i++) useTourStore.getState().next();
    });
    expect(setProgress).toHaveBeenCalledWith('sell-and-review', 'completed', 'tok');
    expect(setProgress).toHaveBeenCalledTimes(2);
  });

  it('should do nothing without a session', () => {
    token = null;
    renderHook(() => useTourProgress());
    expect(getProgress).not.toHaveBeenCalled();
  });

  it('should keep going when a save fails', async () => {
    getProgress.mockResolvedValue({ items: [] });
    setProgress.mockRejectedValue(new Error('offline'));
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));

    expect(() =>
      act(() => {
        useTourStore.getState().dismissCard();
      })
    ).not.toThrow();
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });
});
