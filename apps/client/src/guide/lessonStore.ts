/**
 * The running lesson: which one, which screen, the answers given, and which lessons are finished.
 * In memory only — the account keeps "completed" (useTourProgress syncs it, with the lesson's
 * events); a reload closes a lesson. While its tour runs the sheet steps aside (`inTour`) and the
 * tour store drives the screen; when the tour ends, however it ends, the lesson carries on.
 */

import { create } from 'zustand';
import { getLesson, lessonScreens, type LessonId } from './lessons';

interface LessonState {
  activeId: LessonId | null;
  /** Index into `lessonScreens(lesson)` */
  screen: number;
  /** The option chosen on a question screen, keyed by screen index */
  answers: Record<number, number>;
  /** The lesson's tour is running: the sheet is hidden until it ends */
  inTour: boolean;
  /** The rating given on the last screen, if any */
  rating: number | null;
  /** Lessons finished, from the server and this session */
  completed: Partial<Record<LessonId, true>>;
  /** Counts every finish this session, a replay included: what the funnel reports as completed */
  finishes: number;
  /** Open a lesson, at its first screen or (from an article's "Learn it in Lesson 1") at a card */
  start: (id: LessonId, screen?: number) => void;
  next: () => void;
  back: () => void;
  answer: (option: number) => void;
  /** "Show me": hide the sheet while the lesson's tour runs */
  enterTour: () => void;
  /** The tour ended (finished, skipped or closed): back to the sheet, on the screen after it */
  leaveTour: () => void;
  rate: (rating: number) => void;
  /** The last screen's Finish: the lesson is done */
  finish: () => void;
  /** Close without finishing: ✕ or Esc */
  close: () => void;
  setCompleted: (ids: LessonId[]) => void;
  reset: () => void;
}

const initial = {
  activeId: null,
  screen: 0,
  answers: {},
  inTour: false,
  rating: null,
  completed: {},
  finishes: 0,
} as const;

export const useLessonStore = create<LessonState>()((set, get) => ({
  ...initial,

  start: (id, screen = 0) => {
    const last = lessonScreens(getLesson(id)).length - 1;
    set({
      activeId: id,
      screen: Math.min(Math.max(0, screen), last),
      answers: {},
      inTour: false,
      rating: null,
    });
  },

  next: () => {
    const { activeId, screen } = get();
    if (!activeId) return;
    const last = lessonScreens(getLesson(activeId)).length - 1;
    if (screen < last) set({ screen: screen + 1 });
  },

  back: () => {
    const { screen } = get();
    if (screen > 0) set({ screen: screen - 1 });
  },

  answer: (option) => {
    const { screen, answers } = get();
    // First answer stands: the "Why" is shown against it
    if (answers[screen] !== undefined) return;
    set({ answers: { ...answers, [screen]: option } });
  },

  enterTour: () => set({ inTour: true }),

  leaveTour: () => {
    if (!get().inTour) return;
    set({ inTour: false });
    get().next();
  },

  rate: (rating) => set({ rating }),

  finish: () => {
    const { activeId } = get();
    if (!activeId) return;
    set((s) => ({
      completed: { ...s.completed, [activeId]: true },
      finishes: s.finishes + 1,
      activeId: null,
      screen: 0,
      answers: {},
      inTour: false,
    }));
  },

  close: () => set({ activeId: null, screen: 0, answers: {}, inTour: false, rating: null }),

  setCompleted: (ids) =>
    set({
      completed: Object.fromEntries(ids.map((id) => [id, true])) as Partial<Record<LessonId, true>>,
    }),

  reset: () => set({ ...initial, answers: {}, completed: {} }),
}));
