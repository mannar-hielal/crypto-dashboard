import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLesson, lessonScreens } from '@/guide/lessons';
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
/** The signed-in profile (null: still loading after a restored session) */
let profile: { id: string } | null = { id: 'u1' };
vi.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string | null }) => unknown) => selector({ accessToken: token }),
    { getState: () => ({ user: profile, accessToken: token }) }
  ),
}));

import { useTourProgress } from '@/guide/useTourProgress';
import { pendingDone, queueDone } from '@/learn/pendingDone';
import { forgetSignedOutAccount } from '@/learn/signedOut';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from '@/learn/pathStore';

const item = (itemId: string, status: string) => ({
  itemId,
  status,
  updatedAt: '2026-10-11T00:00:00Z',
});

/** Lesson 1's last screen as its funnel step: `stepBase` (60) + its screens */
const LESSON_01_LAST_STEP = 60 + lessonScreens(getLesson('lesson-01')).length;

describe('useTourProgress', () => {
  beforeEach(() => {
    profile = { id: 'u1' };
    // The finish queue outlives a save (a read drops it): each test starts with none, and with no
    // account read yet (the last-read account and the lists held in memory are module state)
    localStorage.clear();
    forgetSignedOutAccount();
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

  it('should keep a pass this device still has to save shown when the progress cannot be read', async () => {
    localStorage.clear();
    queueDone('u1', { itemId: 'checkpoint-ch1', step: 2 });
    getProgress.mockRejectedValue(new Error('network'));
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true);
    localStorage.clear();
  });

  it('should keep a finish this device still has to save shown when the progress cannot be read', async () => {
    localStorage.clear();
    queueDone('u1', { itemId: 'lesson-02', step: 81 });
    getProgress.mockRejectedValue(new Error('network'));
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    localStorage.clear();
  });

  it('should not send the server’s own passes back after a first read failed', async () => {
    getProgress.mockRejectedValueOnce(new Error('network'));
    const { rerender } = renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    // A later read (a session refresh) brings the server's pass: never written back
    getProgress.mockResolvedValue({ items: [item('checkpoint-ch1', 'completed')] });
    token = 'tok2';
    rerender();
    await waitFor(() => expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true));
    expect(setProgress).not.toHaveBeenCalled();
    token = 'tok';
  });

  it('should name the queue by the token’s own user while the profile is still loading', async () => {
    localStorage.clear();
    profile = null;
    const payload = btoa(JSON.stringify({ userId: 'u9', email: 'x@y' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    token = `h.${payload}.s`;
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    setProgress.mockRejectedValueOnce(new Error('offline'));
    act(() =>
      usePathStore.getState().setProgress({ skippedTours: [], checkpoints: ['checkpoint-ch1'] })
    );
    await waitFor(() =>
      expect(pendingDone('u9')).toEqual([
        expect.objectContaining({ itemId: 'checkpoint-ch1', step: 2 }),
      ])
    );
    token = 'tok';
    localStorage.clear();
  });

  it('should leave everything shown as it is when a read again fails (a session refresh)', async () => {
    getProgress.mockResolvedValueOnce({ items: [item('checkpoint-ch1', 'completed')] });
    const { rerender } = renderHook(() => useTourProgress());
    await waitFor(() => expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true));
    getProgress.mockRejectedValueOnce(new Error('offline'));
    token = 'tok2';
    rerender();
    await act(async () => {});
    expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true);
    token = 'tok';
  });

  it('should drop a kept finish of another version, never showing it done', async () => {
    queueDone('u1', { itemId: 'lesson-01', step: 30 }); // an earlier version's step
    queueDone('u1', { itemId: 'checkpoint-ch1', step: 1 }); // an earlier question set
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(useLessonStore.getState().completed['lesson-01']).toBeUndefined();
    expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBeUndefined();
    expect(useTourStore.getState().cardDismissed).toBe(false);
    expect(pendingDone('u1')).toEqual([]);
  });

  it('should show none of the previous account’s progress when the next one’s first read fails', async () => {
    getProgress.mockResolvedValueOnce({ items: [item('checkpoint-ch1', 'completed')] });
    const { rerender } = renderHook(() => useTourProgress());
    await waitFor(() => expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true));
    // The session expires (nothing reset), and someone else signs in; their read fails
    profile = { id: 'u2' };
    token = 'tok-u2';
    getProgress.mockRejectedValueOnce(new Error('offline'));
    rerender();
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    expect(usePathStore.getState().checkpoints).toEqual({});
    profile = { id: 'u1' };
    token = 'tok';
  });

  it('should send nothing for an account that signed out mid-lesson', async () => {
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    act(() => useLessonStore.getState().start('lesson-01'));
    trackEvent.mockClear();
    // The sign-out: the token goes, then the stores reset before the hook unsubscribes
    token = null;
    act(() => useLessonStore.getState().reset());
    expect(trackEvent).not.toHaveBeenCalled();
    token = 'tok';
  });

  it('should put nothing in the stores from a read that lands after a sign-out', async () => {
    let answer: (v: { items: unknown[] }) => void = () => undefined;
    getProgress.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    renderHook(() => useTourProgress());
    // Signed out before the read answers (the hook's cleanup hasn't run yet)
    token = null;
    await act(async () => answer({ items: [item('checkpoint-ch1', 'completed')] }));
    expect(usePathStore.getState().checkpoints).toEqual({});
    token = 'tok';
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
    // With its question set's version (owner 2026-11-17: earlier passes no longer count)
    expect(setProgress).toHaveBeenCalledWith('checkpoint-ch1', 'completed', 'tok', 2);
    expect(setProgress).toHaveBeenCalledTimes(2);
  });

  it('should save a checkpoint passed before the first read lands, and keep it shown', async () => {
    let land: (v: { items: never[] }) => void = () => {};
    getProgress.mockReturnValueOnce(new Promise((r) => (land = r)));
    setProgress.mockReturnValue(new Promise(() => {})); // on its way when the read lands
    renderHook(() => useTourProgress());
    act(() => {
      usePathStore.setState({ checkpoints: { 'checkpoint-ch1': true } });
    });
    expect(setProgress).toHaveBeenCalledWith('checkpoint-ch1', 'completed', 'tok', 2);
    await act(async () => land({ items: [] }));
    expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBe(true);
  });

  it('should close a tour another one replaces before it ended', async () => {
    getProgress.mockResolvedValue({ items: [] });
    renderHook(() => useTourProgress());
    await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
    act(() => useTourStore.getState().start('buy-first-coin'));
    trackEvent.mockClear();
    act(() => useTourStore.getState().start('sell-and-review'));
    const sent = trackEvent.mock.calls.map((c) => c[0] as { name: string; itemId: string });
    expect(sent[0]).toMatchObject({ name: 'tour_closed', itemId: 'buy-first-coin' });
    expect(sent[1]).toMatchObject({ name: 'tour_started', itemId: 'sell-and-review' });
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
        {
          name: 'tour_closed',
          itemId: 'buy-first-coin', // The second desktop step keeps its id: the phone's step is numbered apart (51)
          stepId: 'buy-first-coin.2',
        },
      ]);
    });

    it('should report a finish, but neither a start nor a close of the look that follows it', async () => {
      await loaded();
      act(() => useTourStore.getState().start('buy-first-coin'));
      trackEvent.mockClear();
      act(() => {
        for (let i = 0; i < 5; i++) useTourStore.getState().next();
      });
      // On to the look at the coin bought (owner 2026-11-17), never the Sell lesson
      expect(useTourStore.getState().activeId).toBe('review-first-coin');
      act(() => useTourStore.getState().close());

      const sent = names().map((n: { name: string; itemId: string }) => `${n.name}:${n.itemId}`);
      // The buy's own steps, its finish, and nothing from the look
      expect(sent.filter((x: string) => !x.startsWith('tour_step:buy-first-coin'))).toEqual([
        'tour_completed:buy-first-coin',
      ]);
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
      // With its last screen's step: the server refuses a finish from an earlier version
      expect(setProgress).toHaveBeenCalledWith(
        'lesson-01',
        'completed',
        'tok',
        LESSON_01_LAST_STEP
      );
    });

    it('should save a finish when the streak screen shows, and send no close when it is left', async () => {
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      trackEvent.mockClear();
      act(() => useLessonStore.getState().markFinished());
      expect(setProgress).toHaveBeenCalledWith(
        'lesson-01',
        'completed',
        'tok',
        LESSON_01_LAST_STEP
      );
      expect(calls()).toEqual([{ name: 'tour_completed', itemId: 'lesson-01' }]);
      // Continue (or ✕) leaves: no second finish, no close
      setProgress.mockClear();
      trackEvent.mockClear();
      act(() => useLessonStore.getState().finish());
      expect(setProgress).not.toHaveBeenCalled();
      expect(calls()).toEqual([]);
      expect(useLessonStore.getState()).toMatchObject({ activeId: null, finishes: 1 });
    });

    it('should keep a finish that could not be saved, show it done, and send it again on the next read', async () => {
      localStorage.clear();
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      // An API rolled back on its own refuses the step
      setProgress.mockRejectedValueOnce(new Error('Only a start takes a step'));
      act(() => useLessonStore.getState().finish());
      await waitFor(() =>
        expect(pendingDone('u1')).toEqual([
          expect.objectContaining({ itemId: 'lesson-01', step: LESSON_01_LAST_STEP }),
        ])
      );
      // Next read (a reload, a session refresh): still shown as done, and sent again
      useLessonStore.getState().reset();
      useTourStore.getState().reset();
      await loaded([]);
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      // It stays kept until a read shows the server has it (a read older than the save can't hide it)
      expect(pendingDone('u1')).toHaveLength(1);
      useTourStore.getState().reset();
      await loaded([item('lesson-01', 'completed')]);
      expect(pendingDone('u1')).toEqual([]);
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
    });

    it('should take a finish back off the screen when the server refuses it as an earlier version', async () => {
      localStorage.clear();
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      act(() => useLessonStore.getState().finish());
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      await waitFor(() => expect(useLessonStore.getState().completed['lesson-01']).toBeUndefined());
      expect(pendingDone('u1')).toEqual([]);
    });

    it('should keep a finish shown when a progress read lands while its save is on its way', async () => {
      localStorage.clear();
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      let answer: () => void = () => undefined;
      // The save hasn't answered yet (it does at the end, so nothing stays in flight)
      setProgress.mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)));
      act(() => useLessonStore.getState().finish());
      // Kept before it was sent: a read now (a session refresh) still shows it
      expect(pendingDone('u1')).toEqual([
        expect.objectContaining({ itemId: 'lesson-01', step: LESSON_01_LAST_STEP }),
      ]);
      useTourStore.getState().reset();
      await loaded([]);
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      await act(async () => answer());
    });

    it('should not send a finish again while its save is still on its way', async () => {
      await loaded([]);
      let sent = 0;
      let answer: () => void = () => undefined;
      setProgress.mockImplementation(
        (_id: string, status: string) =>
          new Promise<void>((resolve) => {
            if (status === 'completed') {
              sent++;
              answer = resolve;
            } else resolve();
          })
      );
      act(() => useLessonStore.getState().start('lesson-01'));
      act(() => useLessonStore.getState().finish());
      // A read meanwhile (a session refresh) finds it kept: not sent a second time
      useTourStore.getState().reset();
      await loaded([]);
      expect(sent).toBe(1);
      await act(async () => answer());
      setProgress.mockReset();
      setProgress.mockResolvedValue({});
    });

    it('should keep a finish an older API refuses (a 400), shown as done, for when the API is back', async () => {
      localStorage.clear();
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      // The real answer of an API from before 2026-11-16, status included
      setProgress.mockRejectedValueOnce(
        Object.assign(new Error('Only a start takes a step'), { status: 400 })
      );
      act(() => useLessonStore.getState().finish());
      await act(async () => {});
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      expect(pendingDone('u1')).toEqual([
        expect.objectContaining({ itemId: 'lesson-01', step: LESSON_01_LAST_STEP }),
      ]);
    });

    it('should keep a refused finish shown when the server has one of its own (another device)', async () => {
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      // This tab's version is refused, but another device's finish is stored
      getProgress.mockResolvedValue({ items: [item('lesson-01', 'completed')] });
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      act(() => useLessonStore.getState().finish());
      await waitFor(() => expect(getProgress).toHaveBeenCalledTimes(2));
      await act(async () => {});
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      expect(pendingDone('u1')).toEqual([]);
    });

    it('should leave a refused finish shown when the server can’t be asked whether it has one', async () => {
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      getProgress.mockRejectedValue(new Error('offline'));
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      act(() => useLessonStore.getState().finish());
      await waitFor(() => expect(getProgress).toHaveBeenCalledTimes(2));
      await act(async () => {});
      // Not taken back on a guess: the next read shows what the server has
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      getProgress.mockResolvedValue({ items: [] });
    });

    it('should keep what was done signed out after an explicit sign-out, for the next account', async () => {
      getProgress.mockResolvedValue({ items: [] });
      const { rerender } = renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      // u1 signs out from the menu; someone reads Lesson 1 signed out, then signs in as u2
      act(() => forgetSignedOutAccount());
      token = null;
      rerender();
      act(() => useLessonStore.setState({ reached: { 'lesson-01': 4 } }));
      profile = { id: 'u2' };
      token = 'tok2';
      setProgress.mockClear();
      rerender();
      await waitFor(() =>
        expect(setProgress).toHaveBeenCalledWith('lesson-01', 'started', 'tok2', 61 + 4)
      );
    });

    it('should check the progress once for kept finishes refused together', async () => {
      queueDone('u1', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP });
      const ownershipLast = 60 + lessonScreens(getLesson('lesson-ownership')).length;
      queueDone('u1', { itemId: 'lesson-ownership', step: ownershipLast });
      setProgress.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(setProgress).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(useLessonStore.getState().completed['lesson-01']).toBeUndefined());
      expect(getProgress).toHaveBeenCalledTimes(2); // the read, then one check for both
    });

    it('should not resend the newer finish for an account that signed out meanwhile', async () => {
      profile = { id: 'u8' };
      queueDone('u8', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP - 1 });
      let refuse: (e: unknown) => void = () => {};
      setProgress.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)));
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(setProgress).toHaveBeenCalledTimes(1));
      queueDone('u8', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP });
      token = null; // signed out before the refusal lands
      await act(async () => refuse(Object.assign(new Error('x'), { status: 409 })));
      expect(setProgress).toHaveBeenCalledTimes(1);
    });

    it('should keep a tour finished this session when a refresh read lands before its save', async () => {
      profile = { id: 'u2' };
      forgetSignedOutAccount();
      getProgress.mockResolvedValue({ items: [] });
      const { rerender } = renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      // Buy finished here; its save is lost
      setProgress.mockRejectedValueOnce(new Error('offline'));
      act(() => useTourStore.setState({ completed: { 'buy-first-coin': true } }));
      setProgress.mockClear();
      token = 'tok-refreshed'; // a session refresh: the same account, read again
      rerender();
      await waitFor(() => expect(getProgress).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(setProgress).toHaveBeenCalledWith('buy-first-coin', 'completed', 'tok-refreshed')
      );
      expect(useTourStore.getState().completed['buy-first-coin']).toBe(true);
    });

    it('should send no close for a finished lesson left from a look back', async () => {
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      act(() => useLessonStore.getState().start('lesson-02', 3));
      act(() => useLessonStore.getState().markFinished());
      // A look back from it ("From Lesson 1"), then another lesson started from there
      act(() => useLessonStore.getState().visit('lesson-01', 0));
      trackEvent.mockClear();
      act(() => useLessonStore.getState().start('lesson-ownership'));
      const sent = trackEvent.mock.calls.map((c) => c[0] as { name: string; itemId: string });
      expect(sent).not.toContainEqual(expect.objectContaining({ name: 'tour_closed' }));
    });

    it('should leave another account’s stores alone when a refusal’s check lands after a switch', async () => {
      queueDone('u1', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP });
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      let check: (v: { items: never[] }) => void = () => {};
      getProgress
        .mockResolvedValueOnce({ items: [] })
        .mockReturnValueOnce(new Promise((r) => (check = r)));
      renderHook(() => useTourProgress());
      await waitFor(() => expect(getProgress).toHaveBeenCalledTimes(2));
      // Another account signs in while the check is on its way, with Lesson 1 finished
      profile = { id: 'u2' };
      act(() => useLessonStore.getState().setCompleted(['lesson-01']));
      await act(async () => check({ items: [] }));
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
    });

    it('should keep a finish answered with a 404 (an edge or a proxy, not the route)', async () => {
      await loaded([]);
      act(() => useLessonStore.getState().start('lesson-01'));
      setProgress.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }));
      act(() => useLessonStore.getState().finish());
      await act(async () => {});
      expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
      expect(pendingDone('u1')).toHaveLength(1);
    });

    it('should show the welcome card again when the kept Lesson 1 finish hiding it is refused', async () => {
      queueDone('u1', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP });
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      getProgress.mockResolvedValue({ items: [] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useTourStore.getState().loaded).toBe(true));
      // Shown as done, the card hidden, until the resend is refused: then both come back
      await waitFor(() => expect(useTourStore.getState().cardDismissed).toBe(false));
      expect(useLessonStore.getState().completed['lesson-01']).toBeUndefined();
    });

    it('should keep the welcome card hidden when the account answered it since the read', async () => {
      queueDone('u1', { itemId: 'lesson-01', step: LESSON_01_LAST_STEP });
      setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
      // The read had nothing; by the refusal's check the card was dismissed (another device)
      getProgress
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValue({ items: [{ itemId: 'welcome-card', status: 'dismissed' }] });
      renderHook(() => useTourProgress());
      await waitFor(() => expect(useLessonStore.getState().completed['lesson-01']).toBeUndefined());
      expect(useTourStore.getState().cardDismissed).toBe(true);
    });

    it('should drop a kept finish the server already has, without sending it again', async () => {
      localStorage.clear();
      queueDone('u1', { itemId: 'lesson-01', step: 81 });
      // A send would fail and keep it queued: an empty queue means it was dropped, never sent
      setProgress.mockRejectedValue(new Error('down'));
      await loaded([item('lesson-01', 'completed')]);
      expect(pendingDone('u1')).toEqual([]);
      setProgress.mockResolvedValue({});
    });

    it('should drop a kept finish the server refuses as an earlier version', async () => {
      localStorage.clear();
      queueDone('u1', { itemId: 'lesson-02', step: 30 });
      // Told apart by its status, never its words
      setProgress.mockRejectedValueOnce(
        Object.assign(new Error('reworded, whatever it says'), { status: 409 })
      );
      await loaded([]);
      await waitFor(() => expect(pendingDone('u1')).toEqual([]));
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
      // With its last screen's step: the server refuses a finish from an earlier version
      expect(setProgress).toHaveBeenCalledWith(
        'lesson-01',
        'completed',
        'tok',
        LESSON_01_LAST_STEP
      );
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
        { name: 'tour_step', itemId: 'lesson-ownership', stepId: 'lesson-ownership.63' },
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
        { name: 'tour_closed', itemId: 'lesson-ownership', stepId: 'lesson-ownership.62' },
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

  it('should take a refused pass off the map without marking its progress read', async () => {
    profile = { id: 'u6' };
    let land: (v: { items: never[] }) => void = () => {};
    getProgress
      .mockReturnValueOnce(new Promise((r) => (land = r))) // the first read, still on its way
      .mockResolvedValue({ items: [] }); // the refusal's check
    setProgress.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409 }));
    renderHook(() => useTourProgress());
    act(() => {
      usePathStore.setState({ checkpoints: { 'checkpoint-ch1': true } });
    });
    await waitFor(() =>
      expect(usePathStore.getState().checkpoints['checkpoint-ch1']).toBeUndefined()
    );
    expect(usePathStore.getState().loaded).toBe(false);
    await act(async () => land({ items: [] }));
  });
});
