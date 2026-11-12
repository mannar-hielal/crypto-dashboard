/**
 * Keeps the account's tour progress and the store in step: read it once signed in, write each new
 * finish / dismissal as it happens, and report the tour's events (the funnel). A failed write is dropped — progress then lives only in this
 * session, which is the worst case, never a broken tour.
 */

import { useEffect } from 'react';
import { learnApi } from '@crypto-dashboard/sdk';
import type { LearnEventRequest } from '@crypto-dashboard/sdk';
import { isCheckpointId, type CheckpointId } from '@/learn/checkpoints';
import { usePathStore } from '@/learn/pathStore';
import { useAuthStore } from '@/store/authStore';
import { useLessonStore } from './lessonStore';
import { getLesson, isLessonId, lessonScreenOfStep, lessonStepId, type LessonId } from './lessons';
import { useTourStore } from './tourStore';
import { isTourId, type TourId } from './tours';

/** A lesson's furthest screen, as its funnel step number (the server's `started` row) */
function sendReached(id: LessonId, screen: number, accessToken: string): void {
  const step = Number(lessonStepId(getLesson(id), screen).split('.')[1]);
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
          .map((i) => i.itemId as TourId);
        const lessons = items
          .filter((i) => i.status === 'completed' && isLessonId(i.itemId))
          .map((i) => i.itemId as LessonId);
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
        useLessonStore.getState().setReached(reached);
        // The learning map: practice skipped on a phone, and checkpoints passed
        usePathStore.getState().setProgress({
          skippedTours: items
            .filter((i) => i.status === 'dismissed' && isTourId(i.itemId))
            .map((i) => i.itemId as TourId),
          checkpoints: items
            .filter((i) => i.status === 'completed' && isCheckpointId(i.itemId))
            .map((i) => i.itemId as CheckpointId),
        });
        const fillOfferDismissed = items.some((i) => i.itemId === 'fill-email-offer');
        useTourStore.getState().setProgress({ completed, cardDismissed, fillOfferDismissed });
      })
      .catch(() => {
        // Can't read it: show no offer rather than one that may already have been answered
        if (!cancelled) {
          useTourStore
            .getState()
            .setProgress({ completed: [], cardDismissed: true, fillOfferDismissed: true });
          usePathStore.getState().setProgress({ skippedTours: [], checkpoints: [] });
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
      for (const id of Object.keys(state.completed) as TourId[]) {
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
      const send = (name: LearnEventRequest['name'], itemId: TourId, stepId?: string) =>
        learnApi
          .trackEvent({ name, itemId, ...(stepId ? { stepId } : {}) }, accessToken)
          .catch(() => undefined);
      // A finish, a replay of a finished tour included (`completed` doesn't change then)
      // (a reset sets the count back to 0: that's no finish)
      const finished = state.finishes > prev.finishes ? prev.activeId : null;
      if (finished) send('tour_completed', finished);

      const { activeId, stepIndex } = state;
      if (activeId !== null && activeId !== prev.activeId) {
        send('tour_started', activeId);
        send('tour_step', activeId, `${activeId}.1`);
      } else if (activeId !== null && stepIndex !== prev.stepIndex) {
        send('tour_step', activeId, `${activeId}.${stepIndex + 1}`);
      } else if (activeId === null && prev.activeId !== null && !finished) {
        // Closed (Skip, ✕, Esc) on the step it was showing
        send('tour_closed', prev.activeId, `${prev.activeId}.${prev.stepIndex + 1}`);
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
        if (!prev.skippedTours[id]) {
          learnApi.setProgress(id, 'dismissed', accessToken).catch(() => undefined);
        }
      }
      for (const id of Object.keys(state.checkpoints) as CheckpointId[]) {
        if (!prev.checkpoints[id]) {
          learnApi.setProgress(id, 'completed', accessToken).catch(() => undefined);
        }
      }
    });
  }, [accessToken]);

  // A lesson's furthest screen, synced: one write each time it rises (never for the server's own
  // answer, which arrives through `setReached` with the furthest screens it already holds)
  useEffect(() => {
    if (!accessToken) return;
    return useLessonStore.subscribe((state, prev) => {
      if (state.reached === prev.reached || state.activeId === null) return;
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
        learnApi.setProgress(finished, 'completed', accessToken).catch(() => undefined);
        send('tour_completed', finished);
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
      const closeHome = () => {
        if (home) send('tour_closed', home.id, lessonStepId(getLesson(home.id), home.screen));
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
