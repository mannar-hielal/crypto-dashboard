/**
 * Keeps the account's tour progress and the store in step: read it once signed in, write each new
 * finish / dismissal as it happens, and report the tour's events (the funnel). A lesson finish or a
 * checkpoint pass is kept on the device until its save lands and sent again on each progress read
 * (learn/pendingDone.ts), shown as done meanwhile; one the server refuses for good (an earlier
 * version, a step it won't take) is taken back. Any other failed write is dropped: that progress then lives only in this session,
 * the worst case, never a broken tour.
 */

import { useEffect } from 'react';
import { learnApi } from '@crypto-dashboard/sdk';
import type { LearnEventRequest } from '@crypto-dashboard/sdk';
import { accountOf } from '@/learn/account';
import { noteFinishSent } from '@/learn/finishSync';
import {
  dropDone,
  dropMany,
  forgetAllDone,
  pendingDone,
  queueDone,
  type PendingDone,
} from '@/learn/pendingDone';
import { getCheckpoint, isCheckpointId, type CheckpointId } from '@/learn/checkpoints';
import { usePathStore } from '@/learn/pathStore';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from './lessonStore';
import {
  getLesson,
  isLessonId,
  lessonScreenOfStep,
  lessonScreens,
  lessonStepId,
  lessonStepNumber,
  type LessonId,
} from './lessons';
import { useTourStore } from './tourStore';
import { tourSteps, getTour, isTourId, type PathTourId, type TourId } from './tours';

/** Set while the server's answer is put in the stores: it's already stored, so never sent back */
let applyingServer = false;

/**
 * The account's kept finishes and passes of today's versions: a lesson's step on one of its screens,
 * a checkpoint's own question set. One kept under another version (a release since) is dropped,
 * never shown as done or counted
 */
function currentQueued(account: string): PendingDone[] {
  const kept = pendingDone(account);
  const current = kept.filter((q) =>
    isLessonId(q.itemId)
      ? lessonScreenOfStep(getLesson(q.itemId), q.step) !== null
      : q.step === getCheckpoint(q.itemId).version
  );
  dropMany(
    account,
    kept.filter((q) => !current.includes(q)).map((q) => q.itemId)
  );
  return current;
}

/** A lesson finish or a checkpoint pass refused as an earlier version: no longer shown as done */
function undone(itemId: PendingDone['itemId']): void {
  if (isLessonId(itemId)) {
    const { completed, setCompleted } = useLessonStore.getState();
    setCompleted((Object.keys(completed) as LessonId[]).filter((id) => id !== itemId));
    return;
  }
  const { skippedTours, checkpoints, setProgress } = usePathStore.getState();
  setProgress({
    skippedTours: Object.keys(skippedTours) as TourId[],
    checkpoints: (Object.keys(checkpoints) as CheckpointId[]).filter((id) => id !== itemId),
  });
}

/**
 * A lesson finish or a checkpoint pass, with its version step. Shown as done from the start; one
 * that can't be saved is kept on the device and sent again on each progress read
 * (learn/pendingDone.ts), still shown as done. One refused as an earlier version (409), which no
 * retry changes, is dropped and taken back off the screen
 */
function saveDone(itemId: PendingDone['itemId'], step: number, accessToken: string): void {
  const account = accountOf(accessToken);
  // Kept before it's sent, and until a read shows the server has it (not dropped when the save
  // lands: a read that left before the save and answers after it would hide it again)
  if (account) queueDone(account, { itemId, step });
  // One save of an item at a time: a read meanwhile doesn't send it again
  const key = `${account ?? ''}:${itemId}`;
  if (inFlight.has(key)) return;
  // Each save holds its own token: a stalled one released by the timer never frees a later one
  const mine = Symbol(key);
  inFlight.set(key, mine);
  const release = () => {
    if (inFlight.get(key) === mine) inFlight.delete(key);
  };
  // A save that never answers (a hung link) stops holding later resends back after a while
  const released = setTimeout(release, SAVE_HOLD_MS);
  learnApi
    .setProgress(itemId, 'completed', accessToken, step)
    .catch((err: unknown) => {
      // Refused for good (REFUSED_FOR_GOOD): no retry changes it, so it's dropped. Taken back off
      // the screen only if that account is still the one signed in and the server has no finish
      // of it either (another device's may be there). Anything else (offline, a 5xx, an expired
      // session, an older API's 400) stays kept. Told apart by status, never the words
      const status = (err as { status?: unknown } | null)?.status;
      if (typeof status !== 'number' || !REFUSED_FOR_GOOD.has(status)) return;
      if (account) dropDone(account, itemId);
      if (accountOf(useAuthStore.getState().accessToken) !== account) return;
      return (
        learnApi
          .getProgress(accessToken)
          .then(({ items }) => {
            if (!items.some((i) => i.itemId === itemId && i.status === 'completed')) undone(itemId);
          })
          // Couldn't check: left shown; the next progress read shows what the server has
          .catch(() => undefined)
      );
    })
    .finally(() => {
      clearTimeout(released);
      release();
    });
}

/** How long one save holds back resends of its item at most (the SDK's own fetch has no timeout) */
const SAVE_HOLD_MS = 20_000;

/** Saves on their way, by account and item */
const inFlight = new Map<string, symbol>();

/**
 * Answers no retry changes: not found, an earlier version (409), unprocessable. Never 400: that is
 * what an older API answers a newer client (one from before 2026-11-16 refuses the step; a later
 * one refuses a step past its version), and that finish is kept until the API is back, at most 30
 * days (learn/pendingDone.ts)
 */
const REFUSED_FOR_GOOD: ReadonlySet<number> = new Set([404, 409, 422]);

/** A lesson's furthest screen, as its funnel step number (the server's `started` row) */
function sendReached(id: LessonId, screen: number, accessToken: string): void {
  const step = lessonStepNumber(getLesson(id), screen);
  learnApi.setProgress(id, 'started', accessToken, step).catch(() => undefined);
}

export function useTourProgress(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  // Signed out: the furthest screens belong to the account that made them, never the next one; the
  // device keeps no account's unsaved finishes either (forgetAllDone)
  useEffect(() => {
    if (accessToken) return;
    useLessonStore.getState().clearReached();
    forgetAllDone();
  }, [accessToken]);

  // Read
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    learnApi
      .getProgress(accessToken)
      .then(({ items }) => {
        if (cancelled) return;
        const completed = items
          .filter((i) => i.status === 'completed' && isTourId(i.itemId))
          .map((i) => i.itemId as PathTourId);
        // Finishes and passes this device couldn't save yet: still shown as done, and sent again
        // (one the server already has is dropped; one refused as an earlier version is taken back)
        const account = accountOf(accessToken);
        const queued = account ? currentQueued(account) : [];
        const stillQueued = queued.filter(
          (q) => !items.some((i) => i.itemId === q.itemId && i.status === 'completed')
        );
        if (account) {
          dropMany(
            account,
            queued.filter((q) => !stillQueued.includes(q)).map((q) => q.itemId)
          );
        }
        const lessons = [
          ...new Set([
            ...items
              .filter((i) => i.status === 'completed' && isLessonId(i.itemId))
              .map((i) => i.itemId as LessonId),
            ...stillQueued.map((q) => q.itemId).filter(isLessonId),
          ]),
        ];
        // Lesson 1 (or its primer) finished means the offer is done with, dismissed or not
        const cardDismissed =
          items.some((i) => i.itemId === 'welcome-card') ||
          completed.includes('primer') ||
          lessons.includes('lesson-01');
        useLessonStore.getState().setCompleted(lessons);
        // How far each begun lesson got (the map's ring). A step from an earlier version of the
        // lesson names no screen today: that lesson's ring starts again
        const reached: Partial<Record<LessonId, number>> = {};
        for (const i of items) {
          if (i.status !== 'started' || !isLessonId(i.itemId) || i.step === undefined) continue;
          const screen = lessonScreenOfStep(getLesson(i.itemId), i.step);
          if (screen !== null) reached[i.itemId] = screen;
        }
        // Screens reached here before the answer came (or before signing in) that the server
        // doesn't have yet: sent now, as nothing will rise past them to send them later
        const local = useLessonStore.getState().reached;
        for (const [id, screen] of Object.entries(local) as [LessonId, number][]) {
          if (screen > (reached[id] ?? -1) && !lessons.includes(id)) {
            sendReached(id, screen, accessToken);
          }
        }
        // The server's own answer: the writer below must not echo it back (review on #280)
        applyingServer = true;
        try {
          useLessonStore.getState().setReached(reached);
        } finally {
          applyingServer = false;
        }
        // The learning map: practice skipped on a phone, and checkpoints passed. The server's own
        // answer: the writers below must not echo it back (applyingServer)
        applyingServer = true;
        try {
          usePathStore.getState().setProgress({
            skippedTours: items
              .filter((i) => i.status === 'dismissed' && isTourId(i.itemId))
              .map((i) => i.itemId as TourId),
            checkpoints: [
              ...new Set([
                ...items
                  .filter((i) => i.status === 'completed' && isCheckpointId(i.itemId))
                  .map((i) => i.itemId as CheckpointId),
                ...stillQueued.map((q) => q.itemId).filter(isCheckpointId),
              ]),
            ],
          });
          const fillOfferDismissed = items.some((i) => i.itemId === 'fill-email-offer');
          useTourStore.getState().setProgress({ completed, cardDismissed, fillOfferDismissed });
        } finally {
          applyingServer = false;
        }
        for (const q of stillQueued) saveDone(q.itemId, q.step, accessToken);
      })
      .catch(() => {
        // Can't read it. A read again (a session refresh) leaves everything shown as it is; a first
        // read shows no offer rather than one that may already have been answered
        if (!cancelled && !useTourStore.getState().loaded) {
          // (finishes and passes this device still has to save stay shown, as on a read that lands;
          // nothing here is echoed back)
          const account = accountOf(accessToken);
          const queued = (account ? currentQueued(account) : []).map((q) => q.itemId);
          applyingServer = true;
          try {
            useTourStore
              .getState()
              .setProgress({ completed: [], cardDismissed: true, fillOfferDismissed: true });
            usePathStore.getState().setProgress({
              skippedTours: [],
              checkpoints: queued.filter(isCheckpointId),
            });
            const done = Object.keys(useLessonStore.getState().completed) as LessonId[];
            useLessonStore
              .getState()
              .setCompleted([...new Set([...done, ...queued.filter(isLessonId)])]);
          } finally {
            applyingServer = false;
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Write
  useEffect(() => {
    if (!accessToken) return;
    return useTourStore.subscribe((state, prev) => {
      // The read above flips `loaded`: that change is the server's answer, not the learner's
      if (!prev.loaded || applyingServer) return;
      for (const id of Object.keys(state.completed) as PathTourId[]) {
        if (!prev.completed[id]) {
          learnApi.setProgress(id, 'completed', accessToken).catch(() => undefined);
        }
      }
      if (state.cardDismissed && !prev.cardDismissed) {
        learnApi.setProgress('welcome-card', 'dismissed', accessToken).catch(() => undefined);
      }

      if (state.fillOfferDismissed && !prev.fillOfferDismissed) {
        learnApi.setProgress('fill-email-offer', 'dismissed', accessToken).catch(() => undefined);
      }

      // The funnel (privacy policy §3 "Learning events"): started → each step → completed / closed
      const send = (name: LearnEventRequest['name'], itemId: TourId, stepId?: string) => {
        // A practice trade from a lesson card is no tour of its own (the lesson's screens report)
        if (!isTourId(itemId)) return;
        learnApi
          .trackEvent({ name, itemId, ...(stepId ? { stepId } : {}) }, accessToken)
          .catch(() => undefined);
      };
      // A step's own id (`<tour>.<n>` over every step), not its place among this screen size's
      const stepIdAt = (id: TourId, index: number, wide: boolean) =>
        tourSteps(getTour(id), wide)[index]?.id;
      // A finish, a replay of a finished tour included (`completed` doesn't change then)
      // (a reset sets the count back to 0: that's no finish)
      const finished = state.finishes > prev.finishes ? prev.activeId : null;
      if (finished) send('tour_completed', finished);

      const { activeId, stepIndex } = state;
      if (activeId !== null && activeId !== prev.activeId) {
        send('tour_started', activeId);
        send('tour_step', activeId, stepIdAt(activeId, 0, state.wide));
      } else if (
        activeId !== null &&
        stepIdAt(activeId, stepIndex, state.wide) !== stepIdAt(activeId, prev.stepIndex, prev.wide)
      ) {
        // A new step, also when only the screen size changed it (a rotation mid-tour)
        send('tour_step', activeId, stepIdAt(activeId, stepIndex, state.wide));
      } else if (activeId === null && prev.activeId !== null && !finished) {
        // Closed (Skip, ✕, Esc) on the step it was showing
        send('tour_closed', prev.activeId, stepIdAt(prev.activeId, prev.stepIndex, prev.wide));
      }
    });
  }, [accessToken]);

  // The learning map: a tour skipped for now, a checkpoint passed
  useEffect(() => {
    if (!accessToken) return;
    return usePathStore.subscribe((state, prev) => {
      // The read above flips `loaded`: that change is the server's answer, not the learner's
      if (!prev.loaded || applyingServer) return;
      for (const id of Object.keys(state.skippedTours) as TourId[]) {
        if (!prev.skippedTours[id] && isTourId(id)) {
          learnApi.setProgress(id, 'dismissed', accessToken).catch(() => undefined);
        }
      }
      for (const id of Object.keys(state.checkpoints) as CheckpointId[]) {
        if (!prev.checkpoints[id]) {
          // With its question set's version: the server ignores a pass from an earlier set
          saveDone(id, getCheckpoint(id).version, accessToken);
        }
      }
    });
  }, [accessToken]);

  // A lesson's furthest screen, synced: one write each time it rises (never for the server's own
  // answer, which arrives through `setReached` with the furthest screens it already holds)
  useEffect(() => {
    if (!accessToken) return;
    return useLessonStore.subscribe((state, prev) => {
      if (state.reached === prev.reached || state.activeId === null || applyingServer) return;
      const id = state.activeId;
      const now = state.reached[id];
      // A replay of a finished lesson changes nothing on the server: no write
      if (now === undefined || now <= (prev.reached[id] ?? -1) || state.completed[id]) return;
      sendReached(id, now, accessToken);
    });
  }, [accessToken]);

  // Lessons: progress, and their screens as the funnel's steps (`lesson-02.<n>`), plus the rating
  useEffect(() => {
    if (!accessToken) return;
    return useLessonStore.subscribe((state, prev) => {
      const send = (name: LearnEventRequest['name'], itemId: LessonId, stepId?: string) =>
        learnApi
          .trackEvent({ name, itemId, ...(stepId ? { stepId } : {}) }, accessToken)
          .catch(() => undefined);

      // A finish (Finish or the next lesson), a replay included. Counted, not read from `completed`:
      // that also changes when the server's progress loads, which is no finish at all
      // (a reset sets the count back to 0: that's no finish)
      const finished = state.finishes > prev.finishes ? prev.activeId : null;
      if (finished) {
        // With its last screen's step: the server refuses a finish from an earlier version. An API
        // from before 2026-11-16 (rolled back on its own) refuses the step instead: saveDone keeps
        // the finish and sends it again once the API is back
        const lesson = getLesson(finished);
        const last = lessonStepNumber(lesson, lessonScreens(lesson).length - 1);
        saveDone(finished, last, accessToken);
        // Noted, so the streak screen reads the habits after it lands (learn/finishSync.ts)
        noteFinishSent(
          accountOf(accessToken),
          learnApi
            .trackEvent({ name: 'tour_completed', itemId: finished }, accessToken)
            .catch(() => undefined)
        );
      }

      // A start ends the run before it, if that wasn't finished: during a look back, the lesson the
      // learner came from. A look back ("From Lesson 1") and the way back from it are no lesson of
      // their own: nothing is sent for them, and the lesson carries on where it was left
      const { activeId, screen, returnTo } = state;
      // (the lesson already on screen, opened again, is no start: the store keeps its run)
      const started = activeId !== null && state.starts !== prev.starts;
      const home = prev.returnTo
        ? { id: prev.returnTo.lesson, screen: prev.returnTo.screen }
        : prev.activeId !== null
          ? { id: prev.activeId, screen: prev.screen }
          : null;
      // (a run already counted as finished, its streak screen then left, is no close)
      const alreadyDone =
        !prev.returnTo && prev.doneAt?.id === prev.activeId && prev.doneAt?.starts === prev.starts;
      const closeHome = () => {
        if (home && !alreadyDone) {
          send('tour_closed', home.id, lessonStepId(getLesson(home.id), home.screen));
        }
      };
      if (started) {
        if (!finished) closeHome();
        send('tour_started', activeId);
        send('tour_step', activeId, lessonStepId(getLesson(activeId), screen));
      } else if (returnTo || prev.returnTo) {
        // A reset during a look back closes the lesson the learner came from
        if (activeId === null && !finished) closeHome();
      } else if (activeId !== null && screen !== prev.screen) {
        send('tour_step', activeId, lessonStepId(getLesson(activeId), screen));
      } else if (activeId === null && prev.activeId !== null && !finished) {
        closeHome();
      }

      // A rating given now, in a lesson's own run (not during a look back)
      if (
        state.rating !== null &&
        state.rating !== prev.rating &&
        activeId !== null &&
        activeId === prev.activeId &&
        !started &&
        !returnTo
      ) {
        send('lesson_rated', activeId, `${activeId}.${state.rating}`);
      }
    });
  }, [accessToken]);
}
