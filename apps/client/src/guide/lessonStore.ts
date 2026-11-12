/**
 * The running lesson: which one, which screen, the answers given, and which lessons are finished.
 * In memory only — the account keeps "completed" (useTourProgress syncs it, with the lesson's
 * events); a reload closes a lesson. While its tour runs the sheet steps aside (`inTour`) and the
 * tour store drives the screen; when the tour ends, however it ends, the lesson carries on.
 *
 * A look back ("From Lesson 1" on a later lesson's term) shows an earlier lesson while `returnTo`
 * keeps the lesson the learner came from, as they left it. It isn't a lesson of its own: ✕, Esc,
 * Finish and the way on all lead back, and the funnel skips it.
 */

import { create } from 'zustand';
import { getLesson, lessonScreens, type LessonId } from './lessons';

/** The journal line on the last screen: typed, on its way, or in the journal */
export type NoteStatus = 'draft' | 'saving' | 'saved';

/** Writes a line to the journal (`paperStore.addJournalNote`): an error message, or null */
export type JournalWrite = (text: string) => Promise<string | null>;

const NOTE_ERROR = 'Could not save the note right now. You can carry on without it.';

/** Everything that belongs to one run of one lesson, and starts afresh with each */
interface LessonRun {
  activeId: LessonId | null;
  /** Index into `lessonScreens(lesson)` */
  screen: number;
  /** The option chosen on a question screen, keyed by screen index */
  answers: Record<number, number>;
  /** The lesson's tour is running: the sheet is hidden until it ends */
  inTour: boolean;
  /** The rating given on the last screen, if any */
  rating: number | null;
  /** The journal line typed on the last screen */
  note: string;
  noteStatus: NoteStatus;
  /** The last save failed: said under the note, and the buttons go on without it */
  noteError: string | null;
}

/**
 * A lesson the learner left for a look back, as they left it. No journal line: one is typed only on
 * the last screen, which has no terms to look back from (see `afterNote.ts`)
 */
type ReturnPlace = Pick<LessonRun, 'screen' | 'answers' | 'rating'> & { lesson: LessonId };

interface LessonState extends LessonRun {
  /** Lessons finished, from the server and this session */
  completed: Partial<Record<LessonId, true>>;
  /**
   * The furthest screen (0-based) reached in each lesson, from the server and this session: the
   * map's progress ring (owner 2026-11-12). It only rises; a look back doesn't count
   */
  reached: Partial<Record<LessonId, number>>;
  /** Counts every finish this session, a replay included: what the funnel reports as completed */
  finishes: number;
  /** During a look back: the lesson to return to, for "← Back to Lesson N" */
  returnTo: ReturnPlace | null;
  /** Counts every change of run, so a save that lands after the learner moved on changes nothing */
  run: number;
  /** Counts every `start()`: how the funnel tells a lesson started from the way back from a look back */
  starts: number;
  /**
   * Open a lesson, at a screen (an article's "Learn it in Lesson 1") or, with none given, at its
   * start. The lesson already on screen (a look back's included) keeps its run, and its screen if
   * none is given; during a look back, the lesson the learner came from is the way home. Any other
   * is a fresh run, and ends a look back
   */
  start: (id: LessonId, screen?: number) => void;
  /** Look back at an earlier lesson's card, keeping the current lesson as it is to return to */
  visit: (id: LessonId, screen: number) => void;
  /** "← Back to Lesson N": the lesson the visit started from, its screen, answers and rating kept */
  returnBack: () => void;
  next: () => void;
  back: () => void;
  answer: (option: number) => void;
  /** "Show me": hide the sheet while the lesson's tour runs */
  enterTour: () => void;
  /**
   * The tour ended (finished, skipped or closed): back to the sheet, on the screen after Try if it
   * was started from there; handed over from elsewhere (an article), where the lesson was
   */
  leaveTour: () => void;
  rate: (rating: number) => void;
  setNote: (text: string) => void;
  /**
   * Send the journal line, if there is one not yet sent. True when the learner may go on: nothing
   * to save, saved, or a save already failed once (the note says they can carry on without it).
   * `retry` ("Save to journal") tries again after a failure
   */
  saveNote: (write: JournalWrite, retry?: boolean) => Promise<boolean>;
  /** The last screen's Finish: the lesson is done (during a look back: back to the lesson) */
  finish: () => void;
  /** Close without finishing: ✕ or Esc (during a look back: back to the lesson) */
  close: () => void;
  setCompleted: (ids: LessonId[]) => void;
  /** The server's furthest screens, merged: each lesson keeps the higher of the two */
  setReached: (reached: Partial<Record<LessonId, number>>) => void;
  reset: () => void;
}

/** Whether leaving the last screen must save the journal line first: typed, not saved, not failed */
export function noteToSave(s: Pick<LessonRun, 'note' | 'noteStatus' | 'noteError'>): boolean {
  return s.noteStatus === 'draft' && s.note.trim() !== '' && !s.noteError;
}

/** A screen index kept within the lesson */
function clampScreen(id: LessonId, screen: number): number {
  return Math.min(Math.max(0, screen), lessonScreens(getLesson(id)).length - 1);
}

/** A lesson's run from its start, or no lesson at all */
function freshRun(id: LessonId | null, screen = 0): LessonRun {
  return {
    activeId: id,
    screen: id ? clampScreen(id, screen) : 0,
    answers: {},
    inTour: false,
    rating: null,
    note: '',
    noteStatus: 'draft',
    noteError: null,
  };
}

const initial = {
  ...freshRun(null),
  completed: {},
  reached: {},
  finishes: 0,
  returnTo: null,
  run: 0,
  starts: 0,
} as const;

export const useLessonStore = create<LessonState>()((set, get) => ({
  ...initial,

  start: (id, screen) => {
    const s = get();
    // The lesson already on screen (its node on the map, an article's link to one of its cards; a
    // look back's lesson too): the same run carries on, at that screen if one is given; during
    // its tour, the tour does
    if (s.activeId === id) {
      if (screen !== undefined && !s.inTour) set({ screen: clampScreen(id, screen) });
      return;
    }
    // The lesson a look back came from: home, as it was left
    if (s.returnTo?.lesson === id) {
      get().returnBack();
      if (screen !== undefined) set({ screen: clampScreen(id, screen) });
      return;
    }
    set({ ...freshRun(id, screen), returnTo: null, run: s.run + 1, starts: s.starts + 1 });
  },

  visit: (id, screen) => {
    const s = get();
    if (!s.activeId) return;
    set({
      ...freshRun(id, screen),
      // A look back from a look back still returns to the lesson the learner started from
      returnTo: s.returnTo ?? {
        lesson: s.activeId,
        screen: s.screen,
        answers: s.answers,
        rating: s.rating,
      },
      run: s.run + 1,
    });
  },

  returnBack: () => {
    const { returnTo } = get();
    if (!returnTo) return;
    const { lesson, ...kept } = returnTo;
    set((s) => ({ ...freshRun(lesson), ...kept, returnTo: null, run: s.run + 1 }));
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
    const { inTour, activeId, screen } = get();
    if (!inTour || !activeId) return;
    set({ inTour: false });
    if (lessonScreens(getLesson(activeId))[screen]?.kind === 'try') get().next();
  },

  rate: (rating) => set({ rating }),

  // An edit after a failed save is worth another try on the way out
  setNote: (note) => set({ note, noteError: null }),

  saveNote: async (write, retry = false) => {
    // One save at a time: `afterNote.saveJournalLine`, its only caller, keeps the one on its way
    const { note, noteStatus, noteError, run } = get();
    if (noteStatus === 'saved' || note.trim() === '' || (noteError && !retry)) return true;
    set({ noteStatus: 'saving', noteError: null });
    const err = await write(note.trim());
    // The learner left the lesson meanwhile (✕, Esc): the answer belongs to no run on screen
    if (get().run !== run) return false;
    set(err ? { noteStatus: 'draft', noteError: NOTE_ERROR } : { noteStatus: 'saved' });
    return !err;
  },

  finish: () => {
    const { activeId, returnTo } = get();
    if (!activeId) return;
    // The end of a look back isn't a finish: the learner goes back to their lesson
    if (returnTo) {
      get().returnBack();
      return;
    }
    set((s) => ({
      ...freshRun(null),
      completed: { ...s.completed, [activeId]: true },
      finishes: s.finishes + 1,
      returnTo: null,
      run: s.run + 1,
    }));
  },

  close: () => {
    if (get().returnTo) {
      get().returnBack();
      return;
    }
    set((s) => ({ ...freshRun(null), returnTo: null, run: s.run + 1 }));
  },

  setCompleted: (ids) =>
    set({
      completed: Object.fromEntries(ids.map((id) => [id, true])) as Partial<Record<LessonId, true>>,
    }),

  setReached: (reached) =>
    set((s) => {
      const merged = { ...s.reached };
      for (const [id, screen] of Object.entries(reached) as [LessonId, number][]) {
        merged[id] = Math.max(merged[id] ?? -1, clampScreen(id, screen));
      }
      return { reached: merged };
    }),

  // `run` keeps counting: a save from before the reset must never match a run after it
  reset: () =>
    set((s) => ({ ...initial, answers: {}, completed: {}, reached: {}, run: s.run + 1 })),
}));

// The furthest screen rises with every screen the learner opens in their own lesson (not a look
// back, which only visits). One place for every way the screen changes: next, start, a resume
useLessonStore.subscribe((s) => {
  if (!s.activeId || s.returnTo) return;
  const furthest = s.reached[s.activeId] ?? -1;
  if (s.screen > furthest) {
    useLessonStore.setState({ reached: { ...s.reached, [s.activeId]: s.screen } });
  }
});
