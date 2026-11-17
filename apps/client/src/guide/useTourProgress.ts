/**
 * Keeps the account's tour progress and the store in step: read it once signed in, write each new
 * finish / dismissal as it happens, and report the tour's events (the funnel). A lesson finish or a
 * checkpoint pass is kept on the device until its save lands and sent again on each progress read
 * (learn/pendingDone.ts), shown as done meanwhile; one the server refuses for good (an earlier
 * version: a 409, REFUSED_FOR_GOOD) is taken back. A 400 is kept: an older API's answer. Any other failed write is dropped: that progress then lives only in this session,
 * the worst case, never a broken tour.
 */

import { useEffect } from 'react';
import { learnApi } from '@crypto-dashboard/sdk';
import type { LearnEventRequest, LearnProgressItem } from '@crypto-dashboard/sdk';
import { accountOf } from '@/learn/account';
import { onePerKey } from '@/lib/onePerKey';
import { lastReadAccount, resetLearningStores, setLastReadAccount } from '@/learn/signedOut';
import { dropDone, keepOnly, pendingDone, queueDone, type PendingDone } from '@/learn/pendingDone';
import { getCheckpoint, isCheckpointId, type CheckpointId } from '@/learn/checkpoints';
import { usePathStore } from '@/learn/pathStore';
import { useAuthStore } from '@/store/authStore';
import { isStartDone, useLessonStore } from './lessonStore';
import {
  getLesson,
  isLessonId,
  lessonScreenOfStep,
  lessonFinishStep,
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
function isCurrentVersion(q: PendingDone): boolean {
  return isLessonId(q.itemId)
    ? lessonScreenOfStep(getLesson(q.itemId), q.step) !== null
    : q.step === getCheckpoint(q.itemId).version;
}

/** A lesson finish or a checkpoint pass refused as an earlier version: no longer shown as done */
function undone(itemId: PendingDone['itemId'], items: LearnProgressItem[]): void {
  if (isLessonId(itemId)) {
    const { completed, setCompleted } = useLessonStore.getState();
    setCompleted((Object.keys(completed) as LessonId[]).filter((id) => id !== itemId));
    // The welcome card, if only this kept Lesson 1 finish was hiding it
    // (never one the account has answered since, here or on another device: the server's items say)
    if (itemId === 'lesson-01' && cardByKeptFinish) {
      cardByKeptFinish = false;
      if (cardAnswered(items)) return;
      asServerAnswer(() => useTourStore.setState({ cardDismissed: false }));
    }
    return;
  }
  // Only the pass goes: the map's `loaded` stays as the progress read left it (it may not have
  // landed yet), and nothing here is sent back as the learner's own change
  asServerAnswer(() =>
    usePathStore.setState((s) => {
      const checkpoints = { ...s.checkpoints };
      delete checkpoints[itemId as CheckpointId];
      return { checkpoints };
    })
  );
}

/**
 * A lesson finish or a checkpoint pass, with its version step. Shown as done from the start; one
 * that can't be saved is kept on the device and sent again on each progress read
 * (learn/pendingDone.ts), still shown as done. One refused as an earlier version (409), which no
 * retry changes, is dropped and taken back off the screen
 */
function saveDone(
  itemId: PendingDone['itemId'],
  step: number,
  accessToken: string,
  { kept = false }: { kept?: boolean } = {}
): void {
  const account = accountOf(accessToken);
  // Kept before it's sent, and until a read shows the server has it (not dropped when the save
  // lands: a read that left before the save and answers after it would hide it again). A resend
  // from the read is already kept. (No account means no token the server signed: every one it signs
  // carries the userId, so a signed-in save always has one; weighed, review round 35)
  if (account && !kept) queueDone(account, { itemId, step });
  // One save of an item at a time: a read meanwhile doesn't send it again
  const key = `${account ?? ''}:${itemId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  learnApi
    .setProgress(itemId, 'completed', accessToken, step)
    .catch((err: unknown) => {
      // Refused for good (REFUSED_FOR_GOOD): no retry changes it, so it's dropped. Taken back off
      // the screen only if that account is still the one signed in and the server has no finish
      // of it either (another device's may be there). Anything else (offline, a 5xx, an expired
      // session, an older API's 400) stays kept. Told apart by status, never the words
      const status = (err as { status?: unknown } | null)?.status;
      if (typeof status !== 'number' || !REFUSED_FOR_GOOD.has(status)) return;
      if (account) dropDone(account, itemId, step);
      if (accountOf(useAuthStore.getState().accessToken) !== account) return;
      // With the token signed in now (it may have rotated since this save left)
      return (
        checkProgress(account, useAuthStore.getState().accessToken ?? accessToken)
          .then(({ items }) => {
            // 🔐 Still that account (a sign-out or a switch while this read was on its way): never
            // another's stores
            if (accountOf(useAuthStore.getState().accessToken) !== account) return;
            if (!items.some((i) => i.itemId === itemId && i.status === 'completed')) {
              undone(itemId, items);
            }
          })
          // Couldn't check: left shown; the next progress read shows what the server has
          .catch(() => undefined)
      );
    })
    // Always settles: every learn request (the save, the check) times out at SDK_REQUEST_TIMEOUT_MS.
    // (Not onePerKey: a second save of the item is dropped, not handed this one's outcome)
    // (No "newer finish" follow-up: within one build an item always sends the same step, a lesson
    // its last screen and a checkpoint its version, so a second finish meanwhile is this one; a
    // new build starts with no save in flight. Weighed, review after release #302)
    .finally(() => inFlight.delete(key));
}

/**
 * The progress check after a refusal: one read per account at a time, so several kept finishes
 * refused together (a resend after a version mismatch) share it
 */
const checks = new Map<string, Promise<{ items: LearnProgressItem[] }>>();
function checkProgress(account: string | null, token: string) {
  // Keyed by the token too: a check never joins one sent with an older, perhaps expired token
  return onePerKey(checks, `${account ?? ''}|${token}`, () => learnApi.getProgress(token));
}

/** Saves on their way, by account and item */
const inFlight = new Set<string>();

/**
 * The one answer no retry changes: an earlier version (409), the only final refusal the route
 * gives. Never a 404 or a 422 (an edge or a proxy may answer one; the route never does) nor a 400:
 * that is what an older API answers a newer client (one from before 2026-11-16 refuses the step; a
 * later one refuses a step past its version), and that finish is kept until the API is back, at
 * most 30 days (learn/pendingDone.ts). (Weighed, review round 34: today's API answers its own 400
 * only to a lesson grown past its version span without a stepBase raise, which lessons.test
 * refuses before release, so telling the two 400s apart isn't worth a contract change)
 */
const REFUSED_FOR_GOOD: ReadonlySet<number> = new Set([409]);

/** Put the server's own answer in the stores: the writers below never echo it back */
function asServerAnswer(apply: () => void): void {
  applyingServer = true;
  try {
    apply();
  } finally {
    applyingServer = false;
  }
}

/** No one is signed in any more (a token rotation is still signed in) */
const signedOut = () => !useAuthStore.getState().accessToken;

/**
 * 🔐 Every write subscription's guard, in one place: signed out meanwhile (the stores reset before
 * the subscription goes), nothing is sent for an account that has left
 */
function whileSignedIn<S>(handler: (state: S, prev: S) => void) {
  return (state: S, prev: S) => {
    if (signedOut()) return;
    handler(state, prev);
  };
}

/**
 * The kept finishes and passes shown as done, on a read that lands and on one that fails alike:
 * those of the lesson or checkpoint version this app teaches (the one rule, in one place: review round 32 found its two copies had already drifted)
 */
function keptToShow(kept: PendingDone[]): PendingDone[] {
  return kept.filter(isCurrentVersion);
}

/** The welcome card answered on the server: dismissed, or the primer finished */
function cardAnswered(items: LearnProgressItem[]): boolean {
  return items.some(
    (i) => i.itemId === 'welcome-card' || (i.itemId === 'primer' && i.status === 'completed')
  );
}

/** The welcome card is hidden only by a Lesson 1 finish still to save (the last read worked it out) */
let cardByKeptFinish = false;

/** A lesson's furthest screen, as its funnel step number (the server's `started` row) */
function sendReached(id: LessonId, screen: number, accessToken: string): void {
  const step = lessonStepNumber(getLesson(id), screen);
  learnApi.setProgress(id, 'started', accessToken, step).catch(() => undefined);
}

export function useTourProgress(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  // No account (an expired session included, which keeps the queue): the furthest screens belong to
  // the one that made them. An explicit sign-out also resets everything (learn/signedOut.ts)
  useEffect(() => {
    if (!accessToken) useLessonStore.getState().clearReached();
  }, [accessToken]);

  // Read
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // Another account than the last read's (a session expired, then someone else signed in): the
    // previous one's progress never shows, even if this read fails
    const account = accountOf(accessToken);
    const readFor = lastReadAccount();
    if (readFor !== null && account !== readFor) {
      cardByKeptFinish = false;
      asServerAnswer(resetLearningStores);
    }
    // The page's first read for an account (none read before, or an explicit sign-out since): what
    // the stores hold now was done here signed out (never sent: the writes need a token), and
    // belongs to the account signing in, as the screens reached then do. Only then: on any later
    // read the stores hold the server's own answers (learn/signedOut.ts)
    const signedOutWork =
      readFor === null
        ? {
            lessons: Object.keys(useLessonStore.getState().completed) as LessonId[],
            checkpoints: Object.keys(usePathStore.getState().checkpoints) as CheckpointId[],
            tours: Object.keys(useTourStore.getState().completed) as PathTourId[],
          }
        : null;
    setLastReadAccount(account);
    // 🔐 An answer that lands after a sign-out or for another account (before this effect's cleanup
    // has run) is never put in the stores or the device's queue
    const stale = () =>
      cancelled || signedOut() || accountOf(useAuthStore.getState().accessToken) !== account;
    learnApi
      .getProgress(accessToken)
      .then(({ items }) => {
        if (stale()) return;
        const completed = items
          .filter((i) => i.status === 'completed' && isTourId(i.itemId))
          .map((i) => i.itemId as PathTourId);
        // Finishes and passes this device couldn't save yet: still shown as done, and sent again
        // (one the server already has is dropped; one refused as an earlier version is taken back)
        // (the stored list read once, worked out in memory, and written once)
        const onServer = (id: string) =>
          items.some((i) => i.itemId === id && i.status === 'completed');
        const stored = account ? pendingDone(account) : [];
        // Signed-out finishes and passes join the kept ones, in memory (one read, one write)
        const signedOutKept: PendingDone[] =
          account && signedOutWork
            ? [
                ...signedOutWork.lessons.map((id) => ({
                  itemId: id,
                  step: lessonFinishStep(getLesson(id)),
                })),
                ...signedOutWork.checkpoints.map((id) => ({
                  itemId: id,
                  step: getCheckpoint(id).version,
                })),
              ]
                .filter((p) => !onServer(p.itemId) && !stored.some((k) => k.itemId === p.itemId))
                .map((p) => ({ ...p, since: Date.now() }))
            : [];
        const kept = [...stored, ...signedOutKept];
        const stillQueued = keptToShow(kept).filter((q) => !onServer(q.itemId));
        if (account && (stillQueued.length !== stored.length || signedOutKept.length > 0)) {
          keepOnly(account, stillQueued);
        }
        // Tours finished signed out: saved now (a tour finish is one write, nothing to keep)
        const signedOutTours = (signedOutWork?.tours ?? []).filter((id) => !onServer(id));
        for (const id of signedOutTours) {
          learnApi.setProgress(id, 'completed', accessToken).catch(() => undefined);
        }
        completed.push(...signedOutTours.filter((id) => !completed.includes(id)));
        const lessons = [
          ...new Set([
            ...items
              .filter((i) => i.status === 'completed' && isLessonId(i.itemId))
              .map((i) => i.itemId as LessonId),
            ...stillQueued.map((q) => q.itemId).filter(isLessonId),
          ]),
        ];
        // Lesson 1 (or its primer) finished means the offer is done with, dismissed or not
        const cardBySaved =
          cardAnswered(items) ||
          items.some((i) => i.itemId === 'lesson-01' && i.status === 'completed');
        // Hidden only by a Lesson 1 finish still to save: undone() shows it again if that's refused
        cardByKeptFinish = !cardBySaved && lessons.includes('lesson-01');
        const cardDismissed = cardBySaved || cardByKeptFinish;
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
        // The server's own answer (never echoed back, review on #280): the furthest screens, and
        // the learning map's skipped tours and passed checkpoints
        asServerAnswer(() => {
          useLessonStore.getState().setReached(reached);
          usePathStore.getState().setProgress({
            skippedTours: items
              .filter((i) => i.status === 'dismissed' && isTourId(i.itemId))
              .map((i) => i.itemId as PathTourId),
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
        });
        // Sent again on every read, a session refresh's included (about every 15 minutes): the only
        // retry a kept finish gets, a handful of writes at most (weighed, review round 35)
        for (const q of stillQueued) saveDone(q.itemId, q.step, accessToken, { kept: true });
      })
      .catch(() => {
        // Can't read it. A read again (a session refresh) leaves everything shown as it is; a first
        // read shows no offer rather than one that may already have been answered
        if (!stale() && !useTourStore.getState().loaded) {
          cardByKeptFinish = false; // the card stays hidden by the fallback itself
          // (finishes and passes this device still has to save stay shown, as on a read that lands;
          // nothing here is echoed back)
          const queued = keptToShow(account ? pendingDone(account) : []).map((q) => q.itemId);
          asServerAnswer(() => {
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
    return useTourStore.subscribe(
      whileSignedIn((state, prev) => {
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
          // Started over another one left unfinished (from the map or an article): that run ends as
          // a close, so every start ends once
          if (prev.activeId !== null && !finished) {
            send('tour_closed', prev.activeId, stepIdAt(prev.activeId, prev.stepIndex, prev.wide));
          }
          send('tour_started', activeId);
          send('tour_step', activeId, stepIdAt(activeId, 0, state.wide));
        } else if (
          activeId !== null &&
          stepIdAt(activeId, stepIndex, state.wide) !==
            stepIdAt(activeId, prev.stepIndex, prev.wide)
        ) {
          // A new step, also when only the screen size changed it (a rotation mid-tour)
          send('tour_step', activeId, stepIdAt(activeId, stepIndex, state.wide));
        } else if (activeId === null && prev.activeId !== null && !finished) {
          // Closed (Skip, ✕, Esc) on the step it was showing. A close by the app (closedForSize: a rotation
          // to a size the tour can't run at) is one too: the learner couldn't go on there, a real drop
          // at that step, and every start still ends once (weighed, review after release #302)
          send('tour_closed', prev.activeId, stepIdAt(prev.activeId, prev.stepIndex, prev.wide));
        }
      })
    );
  }, [accessToken]);

  // The learning map: a tour skipped for now, a checkpoint passed
  useEffect(() => {
    if (!accessToken) return;
    return usePathStore.subscribe(
      whileSignedIn((state, prev) => {
        if (applyingServer) return;
        // A pass is saved even before the first read lands: queued first, so that read keeps it shown
        for (const id of Object.keys(state.checkpoints) as CheckpointId[]) {
          if (!prev.checkpoints[id]) {
            // With its question set's version: the server ignores a pass from an earlier set
            saveDone(id, getCheckpoint(id).version, accessToken);
          }
        }
        // The read above flips `loaded`: that change is the server's answer, not the learner's
        if (!prev.loaded) return;
        for (const id of Object.keys(state.skippedTours) as PathTourId[]) {
          if (!prev.skippedTours[id]) {
            learnApi.setProgress(id, 'dismissed', accessToken).catch(() => undefined);
          }
        }
      })
    );
  }, [accessToken]);

  // A lesson's furthest screen, synced: one write each time it rises (never for the server's own
  // answer, which arrives through `setReached` with the furthest screens it already holds)
  useEffect(() => {
    if (!accessToken) return;
    return useLessonStore.subscribe(
      whileSignedIn((state, prev) => {
        if (state.reached === prev.reached || state.activeId === null || applyingServer) return;
        const id = state.activeId;
        const now = state.reached[id];
        // A replay of a finished lesson changes nothing on the server: no write
        if (now === undefined || now <= (prev.reached[id] ?? -1) || state.completed[id]) return;
        sendReached(id, now, accessToken);
      })
    );
  }, [accessToken]);

  // Lessons: progress, and their screens as the funnel's steps (`lesson-02.<n>`), plus the rating
  useEffect(() => {
    if (!accessToken) return;
    return useLessonStore.subscribe(
      whileSignedIn((state, prev) => {
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
          saveDone(finished, lessonFinishStep(getLesson(finished)), accessToken);
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
        // (a run already counted as finished, its streak screen then left, is no close: also when it's
        // the lesson a look back came from, as a look back never changes `starts`)
        const alreadyDone = home !== null && isStartDone(prev, home.id);
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
      })
    );
  }, [accessToken]);
}
