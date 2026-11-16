/**
 * The running tour: which one, which step, and what the learner has finished. In memory only — the
 * account keeps "completed" (guide/tourProgress.ts syncs it); a reload simply closes a tour.
 */

import { create } from 'zustand';
import { getTour, isTourId, isWideScreen, tourSteps, type TourId, type PathTourId } from './tours';

interface TourState {
  activeId: TourId | null;
  stepIndex: number;
  /** The screen was wide when the tour started: which of its steps run (`tourSteps`) */
  wide: boolean;
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

  start: (id) =>
    set({
      activeId: id,
      stepIndex: 0,
      quizAnswer: null,
      wide: isWideScreen(),
    }),

  next: () => {
    const { activeId, stepIndex, wide } = get();
    if (!activeId) return;
    const tour = getTour(activeId);
    if (stepIndex < tourSteps(tour, wide).length - 1) {
      set({ stepIndex: stepIndex + 1, quizAnswer: null });
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
    }));
  },

  setWide: (next) => {
    const { activeId, stepIndex, wide } = get();
    if (next === wide) return;
    if (!activeId) {
      set({ wide: next });
      return;
    }
    // The same step if both sizes show it; on a step only the old size had, back to the first step
    // after the last shared one, so the new size's own steps (a phone opening the form) still run
    const tour = getTour(activeId);
    const all = tour.steps.map((s) => s.id);
    const current = all.indexOf(tourSteps(tour, wide)[stepIndex]?.id ?? '');
    const shared = tour.steps[current] && !tour.steps[current].screen;
    let lastShared = -1;
    for (let i = 0; i <= current; i++) if (!tour.steps[i].screen) lastShared = i;
    const from = shared ? current : lastShared + 1;
    const shown = tourSteps(tour, next).map((s) => all.indexOf(s.id));
    const at = shown.findIndex((i) => i >= from);
    set({ wide: next, stepIndex: at === -1 ? shown.length - 1 : at });
  },

  back: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1, quizAnswer: null });
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
