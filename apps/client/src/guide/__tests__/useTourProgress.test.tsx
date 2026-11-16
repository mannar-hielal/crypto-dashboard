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
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from '@/learn/pathStore';

const item = (itemId: string, status: string) => ({
  itemId,
  status,
  updatedAt: '2026-10-11T00:00:00Z',
});

describe('useTourProgress', () => {
  beforeEach(() => {
    token = 'tok';
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
    usePathStore.getState().reset();
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

  it('should load the learning map’s skipped tours and passed checkpoints', async () => {
    getProgress.mockResolvedValue({
      items: [
        item('buy-first-coin', 'dismissed'),
        item('checkpoint-ch1', 'completed'),
        item('welcome-card', 'dismissed'),
      ],
    });
    renderHook(() => useTourProgress());

    await waitFor(() => expect(usePathStore.getState().loaded).toBe(true));
    expect(usePathStore.getState().skippedTours).toEqual({ 'buy-first-coin': true });
    expect(usePathStore.getState().checkpoints).toEqual({ 'checkpoint-ch1': true });
    expect(useTourStore.getState().completed).toEqual({});
    expect(setProgress).not.toHaveBeenCalled();
  });

  it('should save a tour skipped for now and a passed checkpoint, once each', async () => {
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(usePathStore.getState().loaded).toBe(true));

    act(() => {
      usePathStore.getState().skipTour('buy-first-coin');
      usePathStore.getState().skipTour('buy-first-coin');
      usePathStore.getState().setProgress({ skippedTours: ['buy-first-coin'], checkpoints: [] });
    });
    expect(setProgress).toHaveBeenCalledWith('buy-first-coin', 'dismissed', 'tok');
    expect(setProgress).toHaveBeenCalledTimes(1);

    act(() => {
      usePathStore.setState({ checkpoints: { 'checkpoint-ch1': true } });
    });
    expect(setProgress).toHaveBeenCalledWith('checkpoint-ch1', 'completed', 'tok');
    expect(setProgress).toHaveBeenCalledTimes(2);
  });

  it('should treat unreadable progress as nothing skipped or passed', async () => {
    getProgress.mockRejectedValue(new Error('network'));
    renderHook(() => useTourProgress());
    await waitFor(() => expect(usePathStore.getState().loaded).toBe(true));
    expect(usePathStore.getState().checkpoints).toEqual({});
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

    it('should report a replay of a finished tour as a finish, never as a close', async () => {
      getProgress.mockResolvedValue({ items: [item('primer', 'completed')] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      act(() => useTourStore.getState().start('primer'));
      trackEvent.mockClear();
      act(() => {
        for (let i = 0; i < 3; i++) useTourStore.getState().next();
      });
      expect(names()).toContainEqual({ name: 'tour_completed', itemId: 'primer' });
      expect(names().some((n: { name: string }) => n.name === 'tour_closed')).toBe(false);
    });

    it('should keep going when a report fails', async () => {
      await loaded();
      trackEvent.mockRejectedValue(new Error('offline'));
      expect(() => act(() => useTourStore.getState().start('primer'))).not.toThrow();
    });
  });

  describe('lessons', () => {
    async function loaded(items: (ReturnType<typeof item> & { step?: number })[] = []) {
      getProgress.mockResolvedValue({ items });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      trackEvent.mockClear();
      setProgress.mockClear();
    }
    const calls = () => trackEvent.mock.calls.map((c) => c[0]);

    it('should report nothing when finished lessons arrive from the server', async () => {
      getProgress.mockResolvedValue({ items: [item('lesson-01', 'completed')] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useLessonStore.getState().completed['lesson-01']).toBe(true));
      expect(trackEvent).not.toHaveBeenCalled();
      expect(setProgress).not.toHaveBeenCalled();
    });

    it('should report a replay of a finished lesson as a finish, never as a close', async () => {
      await loaded([item('lesson-01', 'completed')]);
      act(() => useLessonStore.getState().start('lesson-01'));
      trackEvent.mockClear();
      act(() => useLessonStore.getState().finish());
      expect(calls()).toEqual([{ name: 'tour_completed', itemId: 'lesson-01' }]);
      expect(setProgress).toHaveBeenCalledWith('lesson-01', 'completed', 'tok');
    });

    it('should load how far each begun lesson got, ignoring a step from an earlier version', async () => {
      await loaded([
        { ...item('lesson-02', 'started'), step: 66 },
        // Lesson 1's steps 1–60 were its earlier versions': no screen today
        { ...item('lesson-01', 'started'), step: 5 },
      ]);
      expect(useLessonStore.getState().reached).toEqual({ 'lesson-02': 5 });
      // The server's own answer is never written back
      expect(setProgress).not.toHaveBeenCalled();
    });

    it('should send screens reached before the server answered, then nothing twice', async () => {
      // Begun before the progress loaded (or before signing in): nothing rises past it later
      act(() => useLessonStore.getState().start('lesson-02', 3));
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      expect(setProgress.mock.calls).toEqual([['lesson-02', 'started', 'tok', 64]]);
      // The server's answer doesn't send it again
      expect(useLessonStore.getState().reached).toEqual({ 'lesson-02': 3 });
    });

    it('should forget the furthest screens on sign-out, so the next account starts clean', async () => {
      await loaded([{ ...item('lesson-02', 'started'), step: 66 }]);
      expect(useLessonStore.getState().reached).toEqual({ 'lesson-02': 5 });
      token = null; // signed out
      renderHook(() => useTourProgress());
      expect(useLessonStore.getState().reached).toEqual({});
      token = 'tok';
    });

    it('should not echo the server’s furthest screen back while a lesson is open (review on #280)', async () => {
      // Lesson 3 open at screen 1 when the answer arrives with screen 5: nothing to send
      act(() => useLessonStore.getState().start('lesson-02', 1));
      getProgress.mockResolvedValue({ items: [{ ...item('lesson-02', 'started'), step: 66 }] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useLessonStore.getState().reached).toEqual({ 'lesson-02': 5 }));
      expect(setProgress).not.toHaveBeenCalled();
    });

    it('should never send a lower screen than the furthest one', async () => {
      await loaded([{ ...item('lesson-02', 'started'), step: 66 }]);
      act(() => useLessonStore.getState().start('lesson-02', 2));
      act(() => useLessonStore.getState().next());
      expect(setProgress).not.toHaveBeenCalled();
      act(() => useLessonStore.getState().start('lesson-02', 6));
      expect(setProgress.mock.calls).toEqual([['lesson-02', 'started', 'tok', 67]]);
    });

    it('should load finished lessons, and treat Lesson 1 as the offer being done with', async () => {
      await loaded([item('lesson-01', 'completed')]);
      expect(useLessonStore.getState().completed).toEqual({ 'lesson-01': true });
      expect(useTourStore.getState().cardDismissed).toBe(true);
    });

    it('should report the screens as steps, a close on its screen, and save a finish', async () => {
      await loaded();
      act(() => useLessonStore.getState().start('lesson-01'));
      act(() => useLessonStore.getState().next());
      act(() => useLessonStore.getState().close());
      expect(calls()).toEqual([
        { name: 'tour_started', itemId: 'lesson-01' },
        // Lesson 1's screens count from 61 (`stepBase`): 1–60 are its earlier versions'
        { name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.61' },
        { name: 'tour_step', itemId: 'lesson-01', stepId: 'lesson-01.62' },
        { name: 'tour_closed', itemId: 'lesson-01', stepId: 'lesson-01.62' },
      ]);
      // How far it got, once per new furthest screen (the map's ring, 2026-11-12); no finish
      expect(setProgress.mock.calls).toEqual([
        ['lesson-01', 'started', 'tok', 61],
        ['lesson-01', 'started', 'tok', 62],
      ]);
      setProgress.mockClear();

      trackEvent.mockClear();
      act(() => useLessonStore.getState().start('lesson-01'));
      act(() => useLessonStore.getState().rate(5));
      act(() => useLessonStore.getState().finish());
      expect(calls()).toContainEqual({
        name: 'lesson_rated',
        itemId: 'lesson-01',
        stepId: 'lesson-01.5',
      });
      expect(calls()).toContainEqual({ name: 'tour_completed', itemId: 'lesson-01' });
      expect(calls().some((c) => c.name === 'tour_closed')).toBe(false);
      expect(setProgress).toHaveBeenCalledWith('lesson-01', 'completed', 'tok');
    });

    it('should send nothing for a look back at an earlier lesson, nor for the way back from it', async () => {
      await loaded();
      act(() => useLessonStore.getState().start('lesson-ownership'));
      act(() => useLessonStore.getState().next());
      trackEvent.mockClear();

      act(() => useLessonStore.getState().visit('lesson-01', 5));
      act(() => useLessonStore.getState().next());
      act(() => useLessonStore.getState().rate(4));
      act(() => useLessonStore.getState().returnBack());
      // No start, step, close, finish or rating: Lesson 1 was rated when it was taken
      expect(calls()).toEqual([]);

      act(() => useLessonStore.getState().next());
      expect(calls()).toEqual([
        { name: 'tour_step', itemId: 'lesson-ownership', stepId: 'lesson-ownership.23' },
      ]);
    });

    it('should not count opening the lesson already on screen as a drop-off, nor a reset as a finish', async () => {
      await loaded();
      act(() => useLessonStore.getState().start('lesson-02', 2));
      act(() => useLessonStore.getState().finish());
      act(() => useLessonStore.getState().start('lesson-02', 2));
      trackEvent.mockClear();
      setProgress.mockClear();
      act(() => useLessonStore.getState().start('lesson-02', 4));
      expect(calls()).toEqual([{ name: 'tour_step', itemId: 'lesson-02', stepId: 'lesson-02.65' }]);

      act(() => useLessonStore.getState().reset());
      expect(calls().some((c) => c.name === 'tour_completed')).toBe(false);
      // A replay of a finished lesson: no furthest-screen write (it changes nothing), never a finish
      expect(setProgress).not.toHaveBeenCalled();
      expect(calls().at(-1)).toEqual({
        name: 'tour_closed',
        itemId: 'lesson-02',
        stepId: 'lesson-02.65',
      });
    });

    it('should close the lesson a start replaces, a look back’s home included, and a reset during one', async () => {
      await loaded();
      act(() => useLessonStore.getState().start('lesson-ownership', 1));
      act(() => useLessonStore.getState().visit('lesson-01', 3));
      trackEvent.mockClear();
      act(() => useLessonStore.getState().start('lesson-02', 4));
      expect(calls()).toEqual([
        { name: 'tour_closed', itemId: 'lesson-ownership', stepId: 'lesson-ownership.22' },
        { name: 'tour_started', itemId: 'lesson-02' },
        { name: 'tour_step', itemId: 'lesson-02', stepId: 'lesson-02.65' },
      ]);

      // A start outside a look back closes the lesson it replaces too
      trackEvent.mockClear();
      act(() => useLessonStore.getState().start('lesson-01'));
      expect(calls()[0]).toEqual({
        name: 'tour_closed',
        itemId: 'lesson-02',
        stepId: 'lesson-02.65',
      });

      act(() => useLessonStore.getState().start('lesson-02', 4));
      act(() => useLessonStore.getState().visit('lesson-01', 3));
      trackEvent.mockClear();
      act(() => useLessonStore.getState().reset());
      expect(calls()).toEqual([
        { name: 'tour_closed', itemId: 'lesson-02', stepId: 'lesson-02.65' },
      ]);
    });
  });
});
