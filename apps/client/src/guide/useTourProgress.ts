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
import { noteFinishSent } from '@/learn/finishSync';
import { dropDone, pendingDone, queueDone, type PendingDone } from '@/learn/pendingDone';
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

/** Set while the server's furthest screens are merged in: they're already stored, so never sent */
let applyingServer = false;

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
  const account = useAuthStore.getState().user?.id;
  // Kept before it's sent: a progress read that lands while the save is on its way still shows it
  if (account) queueDone(account, { itemId, step });
  learnApi
    .setProgress(itemId, 'completed', accessToken, step)
    .then(() => {
      if (account) dropDone(account, itemId);
    })
    .catch((err: unknown) => {
      // Refused for good (an earlier version, a step this API won't take, a bad request): no retry
      // changes it, so it's dropped and taken back off the screen. Anything else (offline, a 5xx,
      // an expired session) stays kept for the next read. Told apart by status, never the words
      const status = (err as { status?: unknown } | null)?.status;
      if (typeof status === 'number' && REFUSED_FOR_GOOD.has(status)) {
        if (account) dropDone(account, itemId);
        undone(itemId);
      }
    });
}

/** Answers no retry changes: a bad request, not found, an earlier version, unprocessable */
const REFUSED_FOR_GOOD: ReadonlySet<number> = new Set([400, 404, 409, 422]);

/** A lesson's furthest screen, as its funnel step number (the server's `started` row) */
function sendReached(id: LessonId, screen: number, accessToken: string): void {
  const step = lessonStepNumber(getLesson(id), screen);
  learnApi.setProgress(id, 'started', accessToken, step).catch(() => undefined);
}

export function useTourProgress(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  // Signed out: the furthest screens belong to the account that made them, never the next one
  useEffect(() => {
    if (!accessToken) useLessonStore.getState().clearReached();
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
        const account = useAuthStore.getState().user?.id;
        const queued = account ? pendingDone(account) : [];
        const stillQueued = queued.filter(
          (q) => !items.some((i) => i.itemId === q.itemId && i.status === 'completed')
        );
        if (account) {
          for (const q of queued) if (!stillQueued.includes(q)) dropDone(account, q.itemId);
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
        // The learning map: practice skipped on a phone, and checkpoints passed
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
        for (const q of stillQueued) saveDone(q.itemId, q.step, accessToken);
      })
      .catch(() => {
        // Can't read it: show no offer rather than one that may already have been answered
        if (!cancelled) {
          useTourStore
            .getState()
            .setProgress({ completed: [], cardDismissed: true, fillOfferDismissed: true });
          // (a pass this device still has to save stays shown, as on a read that lands)
          const account = useAuthStore.getState().user?.id;
          usePathStore.getState().setProgress({
            skippedTours: [],
            checkpoints: (account ? pendingDone(account) : [])
              .map((q) => q.itemId)
              .filter(isCheckpointId),
          });
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
      if (!prev.loaded) return;
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
      if (!prev.loaded) return;
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
