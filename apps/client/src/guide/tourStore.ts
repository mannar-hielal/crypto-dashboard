/**
 * The running tour: which one, which step, and what the learner has finished. In memory only — the
 * account keeps "completed" (guide/tourProgress.ts syncs it); a reload simply closes a tour.
 */

import { create } from 'zustand';
import { getTour, type TourId } from './tours';

interface TourState {
  activeId: TourId | null;
  stepIndex: number;
  /** The option chosen on a quiz step, or null */
  quizAnswer: number | null;
  /** Tours finished, from the server and this session */
  completed: Partial<Record<TourId, true>>;
  /** The account's progress has been read (the card waits for it, so it never flashes) */
  loaded: boolean;
  /** The welcome card was dismissed (or the primer finished) on this account */
  cardDismissed: boolean;
  /** The "e-mail me when an order fills" offer was answered (taken, declined or already on) */
  fillOfferDismissed: boolean;
  /** The Learn panel is open */
  panelOpen: boolean;
  start: (id: TourId) => void;
  next: () => void;
  back: () => void;
  /** Close without finishing: Skip, ✕ or Esc */
  close: () => void;
  answerQuiz: (index: number) => void;
  /** Replace the finished set (the server's answer) */
  setCompleted: (ids: TourId[]) => void;
  /** The account's saved progress arrived */
  setProgress: (progress: {
    completed: TourId[];
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
  quizAnswer: null,
  completed: {},
  loaded: false,
  cardDismissed: false,
  fillOfferDismissed: false,
  panelOpen: false,
} as const;

export const useTourStore = create<TourState>()((set, get) => ({
  ...initial,

  start: (id) => set({ activeId: id, stepIndex: 0, quizAnswer: null }),

  next: () => {
    const { activeId, stepIndex } = get();
    if (!activeId) return;
    const tour = getTour(activeId);
    if (stepIndex < tour.steps.length - 1) {
      set({ stepIndex: stepIndex + 1, quizAnswer: null });
      return;
    }
    // Last step: the tour is done; hand over to the next chapter when there is one
    set((s) => ({
      completed: { ...s.completed, [activeId]: true },
      activeId: tour.next ?? null,
      stepIndex: 0,
      quizAnswer: null,
    }));
  },

  back: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1, quizAnswer: null });
  },

  close: () => set({ activeId: null, stepIndex: 0, quizAnswer: null }),

  answerQuiz: (index) => set({ quizAnswer: index }),

  setCompleted: (ids) =>
    set({
      completed: Object.fromEntries(ids.map((id) => [id, true])) as Partial<Record<TourId, true>>,
    }),

  setProgress: ({ completed, cardDismissed, fillOfferDismissed = false }) =>
    set({
      fillOfferDismissed,
      completed: Object.fromEntries(completed.map((id) => [id, true])) as Partial<
        Record<TourId, true>
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
