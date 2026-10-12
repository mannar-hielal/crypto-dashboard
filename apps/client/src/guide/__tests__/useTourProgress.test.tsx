import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const getProgress = vi.fn();
const setProgress = vi.fn();
const trackEvent = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: {
    getProgress: (...a: unknown[]) => getProgress(...a),
    setProgress: (...a: unknown[]) => setProgress(...a),
    trackEvent: (...a: unknown[]) => trackEvent(...a),
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
    trackEvent.mockReset();
    trackEvent.mockResolvedValue(undefined);
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

  describe('tour events (the funnel)', () => {
    async function loaded() {
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      trackEvent.mockClear();
    }
    const names = () => trackEvent.mock.calls.map((c) => c[0]);

    it('should not report the server’s own answer as events', async () => {
      getProgress.mockResolvedValue({ items: [item('primer', 'completed')] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('should report a start with its first step, then each step moved to', async () => {
      await loaded();
      act(() => useTourStore.getState().start('primer'));
      act(() => useTourStore.getState().next());
      act(() => useTourStore.getState().back());

      expect(names()).toEqual([
        { name: 'tour_started', itemId: 'primer' },
        { name: 'tour_step', itemId: 'primer', stepId: 'primer.1' },
        { name: 'tour_step', itemId: 'primer', stepId: 'primer.2' },
        { name: 'tour_step', itemId: 'primer', stepId: 'primer.1' },
      ]);
      expect(trackEvent.mock.calls[0][1]).toBe('tok');
    });

    it('should report a close on the step it was on, and no finish', async () => {
      await loaded();
      act(() => useTourStore.getState().start('buy-first-coin'));
      act(() => useTourStore.getState().next());
      trackEvent.mockClear();
      act(() => useTourStore.getState().close());

      expect(names()).toEqual([
        { name: 'tour_closed', itemId: 'buy-first-coin', stepId: 'buy-first-coin.2' },
      ]);
    });

    it('should report a finish, then the next chapter starting, but no close', async () => {
      await loaded();
      act(() => useTourStore.getState().start('buy-first-coin'));
      trackEvent.mockClear();
      act(() => {
        for (let i = 0; i < 5; i++) useTourStore.getState().next();
      });

      const sent = names().map((n: { name: string; itemId: string }) => `${n.name}:${n.itemId}`);
      expect(sent).toContain('tour_completed:buy-first-coin');
      expect(sent).toContain('tour_started:sell-and-review');
      expect(sent.some((s: string) => s.startsWith('tour_closed'))).toBe(false);
    });

    it('should keep going when a report fails', async () => {
      await loaded();
      trackEvent.mockRejectedValue(new Error('offline'));
      expect(() => act(() => useTourStore.getState().start('primer'))).not.toThrow();
    });
  });
});
