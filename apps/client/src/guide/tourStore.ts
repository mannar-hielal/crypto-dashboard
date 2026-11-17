/**
 * The running tour: which one, which step, and what the learner has finished. In memory only — the
 * account keeps "completed" (guide/tourProgress.ts syncs it); a reload simply closes a tour.
 */

import { create } from 'zustand';
import {
  backIndex,
  getTour,
  isTourId,
  isWideScreen,
  runsHere,
  tourSteps,
  type TourId,
  type PathTourId,
} from './tours';

interface TourState {
  activeId: TourId | null;
  stepIndex: number;
  /** The screen was wide when the tour started: which of its steps run (`tourSteps`) */
  wide: boolean;
  /** The step ids this run has shown: a rotation never replays one the learner already did */
  seen: readonly string[];
  /** The option chosen on a quiz step, or null */
  quizAnswer: number | null;
  /** Tours finished, from the server and this session */
  completed: Partial<Record<PathTourId, true>>;
  /** Counts every finish this session, a replay included: what the funnel reports as completed */
  finishes: number;
  /** The account's progress has been read (the card waits for it, so it never flashes) */
  loaded: boolean;
  /** The welcome card was dismissed (or the primer finished) on this account */
  cardDismissed: boolean;
  /** The "e-mail me when an order fills" offer was answered (taken, declined or already on) */
  fillOfferDismissed: boolean;
  /** The Learn panel is open */
  panelOpen: boolean;
  start: (id: TourId) => void;
  /** The screen crossed the tours' width (a rotation, a resize): its steps from the current one */
  setWide: (wide: boolean) => void;
  next: () => void;
  back: () => void;
  /** Close without finishing: Skip, ✕ or Esc */
  close: () => void;
  answerQuiz: (index: number) => void;
  /** Replace the finished set (the server's answer) */
  setCompleted: (ids: PathTourId[]) => void;
  /** The account's saved progress arrived */
  setProgress: (progress: {
    completed: PathTourId[];
    cardDismissed: boolean;
    fillOfferDismissed?: boolean;
  }) => void;
  dismissCard: () => void;
  dismissFillOffer: () => void;
  openPanel: () => void;
  closePanel: () => void;
  reset: () => void;
}

const initial = {
  activeId: null,
  stepIndex: 0,
  wide: true,
  seen: [],
  quizAnswer: null,
  completed: {},
  finishes: 0,
  loaded: false,
  cardDismissed: false,
  fillOfferDismissed: false,
  panelOpen: false,
} as const;

export const useTourStore = create<TourState>()((set, get) => ({
  ...initial,

  start: (id) => {
    const wide = isWideScreen();
    set({
      activeId: id,
      stepIndex: 0,
      quizAnswer: null,
      wide,
      seen: [tourSteps(getTour(id), wide)[0]?.id ?? ''],
    });
  },

  next: () => {
    const { activeId, stepIndex, wide } = get();
    if (!activeId) return;
    const tour = getTour(activeId);
    const steps = tourSteps(tour, wide);
    if (stepIndex < steps.length - 1) {
      set((s) => ({
        stepIndex: stepIndex + 1,
        quizAnswer: null,
        seen: s.seen.includes(steps[stepIndex + 1].id)
          ? s.seen
          : [...s.seen, steps[stepIndex + 1].id],
      }));
      return;
    }
    // Last step: the tour is done; hand over to the next chapter when there is one (its steps for
    // the screen as it is now). A practice trade from a lesson card is no tour of the path: it's
    // never marked finished or counted (the lesson's own screens are)
    const counted = isTourId(activeId);
    set((s) => ({
      completed: counted ? { ...s.completed, [activeId]: true } : s.completed,
      finishes: counted ? s.finishes + 1 : s.finishes,
      activeId: tour.next ?? null,
      stepIndex: 0,
      quizAnswer: null,
      wide: tour.next ? isWideScreen() : s.wide,
      seen: tour.next ? [tourSteps(getTour(tour.next), isWideScreen())[0]?.id ?? ''] : [],
    }));
  },

  setWide: (next) => {
    const { activeId, stepIndex, wide } = get();
    if (next === wide) return;
    if (!activeId) {
      set({ wide: next });
      return;
    }
    // Rotated to a phone: its own steps before this one that this run never showed (opening the
    // form from its bar, which a phone needs before any form step), so back to the first of them;
    // one already done isn't replayed (the form may still be open, the bar hidden). (A larger
    // screen docks the form: nothing to catch up.) Otherwise the same step if both sizes show it,
    // or, on a step only the old size had, the first step after the last shared one
    const tour = getTour(activeId);
    // A tour this size can't run (one that needs a larger screen, narrowed to a phone: its steps
    // point at what the phone layout doesn't show, the way every launcher refuses to start it
    // there), or with no step for it: it closes rather than ask for what can't be done
    if (!runsHere(activeId, next) || tourSteps(tour, next).length === 0) {
      set({ wide: next, activeId: null, stepIndex: 0, quizAnswer: null });
      return;
    }
    const all = tour.steps.map((s) => s.id);
    const current = all.indexOf(tourSteps(tour, wide)[stepIndex]?.id ?? '');
    // A step this size's list doesn't hold (a stale index): stay put, within the new list
    if (current === -1) {
      set({ wide: next, stepIndex: Math.min(stepIndex, tourSteps(tour, next).length - 1) });
      return;
    }
    const { seen } = get();
    const missed = next
      ? -1
      : tour.steps.findIndex((s, i) => i < current && s.screen === 'phone' && !seen.includes(s.id));
    const shared = tour.steps[current] && !tour.steps[current].screen;
    let lastShared = -1;
    for (let i = 0; i <= current; i++) if (!tour.steps[i].screen) lastShared = i;
    const from = missed !== -1 ? missed : shared ? current : lastShared + 1;
    // Narrowing, whichever way `from` was found: a phone step this run already showed (the form
    // opened from the bar) is never shown again, the form may still be open and the bar hidden
    let start = from;
    while (!next && tour.steps[start]?.screen === 'phone' && seen.includes(tour.steps[start].id)) {
      start++;
    }
    const shown = tourSteps(tour, next).map((s) => all.indexOf(s.id));
    const at = shown.findIndex((i) => i >= start);
    const stepIndexNow = at === -1 ? shown.length - 1 : at;
    const nowId = tourSteps(tour, next)[stepIndexNow]?.id ?? '';
    // (each step once: `seen` never holds more than the tour's steps)
    set({
      wide: next,
      stepIndex: stepIndexNow,
      seen: seen.includes(nowId) ? seen : [...seen, nowId],
    });
  },

  back: () => {
    const { activeId, stepIndex, wide, seen } = get();
    if (!activeId) return;
    const to = backIndex(tourSteps(getTour(activeId), wide), stepIndex, seen);
    if (to !== null) set({ stepIndex: to, quizAnswer: null });
  },

  close: () => set({ activeId: null, stepIndex: 0, quizAnswer: null }),

  answerQuiz: (index) => set({ quizAnswer: index }),

  setCompleted: (ids) =>
    set({
      completed: Object.fromEntries(ids.map((id) => [id, true])) as Partial<
        Record<PathTourId, true>
      >,
    }),

  setProgress: ({ completed, cardDismissed, fillOfferDismissed = false }) =>
    set({
      fillOfferDismissed,
      completed: Object.fromEntries(completed.map((id) => [id, true])) as Partial<
        Record<PathTourId, true>
      >,
      cardDismissed,
      loaded: true,
    }),

  dismissCard: () => set({ cardDismissed: true }),

  dismissFillOffer: () => set({ fillOfferDismissed: true }),

  openPanel: () => set({ panelOpen: true }),

  closePanel: () => set({ panelOpen: false }),

  reset: () => set({ ...initial, completed: {} }),
}));
