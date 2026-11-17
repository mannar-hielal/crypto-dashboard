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

import type { TourId } from './tours';
import { create } from 'zustand';
import { getLesson, lessonScreens, type LessonId, screenQuestion, screenTour } from './lessons';

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
  /** The tour the lesson handed over (its Try tour or a card's practice): only its end moves on */
  tourFrom: TourId | null;
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
  /**
   * The lesson start already counted as finished (`markFinished`): its close is no second finish.
   * By `starts`, which a look back and the way back from it don't change (`run` does)
   */
  doneAt: { id: LessonId; starts: number } | null;
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
  /**
   * "Try again" after a wrong answer (owner 2026-11-17): the screen's answer is cleared, so the board
   * starts afresh and Continue waits for a right one. A right answer stands
   */
  retry: () => void;
  /** "Show me": hide the sheet while the lesson's tour runs */
  enterTour: (tour: TourId) => void;
  /** Another tour took the handed-over one's place: its end brings the learner back, not on */
  forgetTour: () => void;
  /**
   * The tour ended (finished, skipped or closed): back to the sheet, on the screen after Try if it
   * was started from there; handed over from elsewhere (an article), where the lesson was
   */
  /** `moveOn` false: the tour was closed by the app (a rotation), not done: stay on the screen */
  leaveTour: (moveOn?: boolean) => void;
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
  /**
   * The lesson is done, but the sheet stays (the streak screen shows first): counted and saved now,
   * so leaving from the streak screen loses nothing. A `finish()` after it only closes
   */
  markFinished: () => void;
  /** Close without finishing: ✕ or Esc (during a look back: back to the lesson) */
  close: () => void;
  setCompleted: (ids: LessonId[]) => void;
  /** The server's furthest screens, merged: each lesson keeps the higher of the two */
  setReached: (reached: Partial<Record<LessonId, number>>) => void;
  /** Forget the furthest screens (signed out: they belong to the account that made them) */
  clearReached: () => void;
  reset: () => void;
}

/** Whether leaving the last screen must save the journal line first: typed, not saved, not failed */
export function noteToSave(s: Pick<LessonRun, 'note' | 'noteStatus' | 'noteError'>): boolean {
  return s.noteStatus === 'draft' && s.note.trim() !== '' && !s.noteError;
}

/** The answers without this screen's, when that one is wrong (a right one stands) */
function withoutWrong(
  s: Pick<LessonRun, 'activeId' | 'answers'>,
  screen: number
): Record<number, number> {
  const given = s.answers[screen];
  if (!s.activeId || given === undefined) return s.answers;
  const lesson = getLesson(s.activeId);
  const q = screenQuestion(lesson, lessonScreens(lesson)[screen]);
  if (!q || given === q.correct) return s.answers;
  return Object.fromEntries(Object.entries(s.answers).filter(([at]) => Number(at) !== screen));
}

/** A screen index kept within the lesson */
function clampScreen(id: LessonId, screen: number): number {
  return Math.min(Math.max(0, screen), lessonScreens(getLesson(id)).length - 1);
}

/** `reached` with a lesson's furthest screen raised to `screen` (never lowered) */
function raised(
  reached: Partial<Record<LessonId, number>>,
  id: LessonId,
  screen: number
): Partial<Record<LessonId, number>> {
  return screen > (reached[id] ?? -1) ? { ...reached, [id]: screen } : reached;
}

/** A lesson's run from its start, or no lesson at all */
function freshRun(id: LessonId | null, screen = 0): LessonRun {
  return {
    activeId: id,
    screen: id ? clampScreen(id, screen) : 0,
    answers: {},
    inTour: false,
    tourFrom: null,
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
  doneAt: null,
  returnTo: null,
  run: 0,
  starts: 0,
} as const;

/**
 * This start of the lesson is already counted as finished (`markFinished` ran for it; `finish`
 * alone sets no `doneAt`, so a run finished only that way, signed out or from a look back, reads false):
 * the one rule the finish count, the streak screen and the funnel's close all use. A look back and
 * the way back from it never change `starts`
 */
export function isStartDone(s: Pick<LessonState, 'doneAt' | 'starts'>, id: LessonId): boolean {
  return s.doneAt !== null && s.doneAt.id === id && s.doneAt.starts === s.starts;
}

export const useLessonStore = create<LessonState>()((set, get) => ({
  ...initial,

  start: (id, screen) => {
    const s = get();
    // The lesson already on screen (its node on the map, an article's link to one of its cards; a
    // look back's lesson too): the same run carries on, at that screen if one is given; during
    // its tour, the tour does
    if (s.activeId === id) {
      if (screen !== undefined && !s.inTour) {
        const at = clampScreen(id, screen);
        // A look back's own lesson is only visited: it isn't begun by it. Leaving a wrong answer
        // this way clears it, as Back does: coming back, the board starts afresh
        set({
          screen: at,
          answers: withoutWrong(s, s.screen),
          reached: s.returnTo ? s.reached : raised(s.reached, id, at),
        });
      }
      return;
    }
    // The lesson a look back came from: home, as it was left
    if (s.returnTo?.lesson === id) {
      get().returnBack();
      if (screen !== undefined) {
        const at = clampScreen(id, screen);
        // (a wrong answer on the screen it's left from clears, as Back does)
        set((now) => ({
          screen: at,
          answers: withoutWrong(now, now.screen),
          reached: raised(now.reached, id, at),
        }));
      }
      return;
    }
    const run = freshRun(id, screen);
    set({
      ...run,
      reached: raised(s.reached, id, run.screen),
      returnTo: null,
      run: s.run + 1,
      starts: s.starts + 1,
    });
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
    const { activeId, screen, returnTo, reached } = get();
    if (!activeId) return;
    const last = lessonScreens(getLesson(activeId)).length - 1;
    if (screen >= last) return;
    // The map's ring (owner 2026-11-12): the furthest screen of the learner's own lesson, never of
    // one they're only looking back at
    set({
      screen: screen + 1,
      reached: returnTo ? reached : raised(reached, activeId, screen + 1),
    });
  },

  back: () => {
    const { screen } = get();
    if (screen <= 0) return;
    // A wrong answer isn't kept: coming back, the board starts afresh rather than showing the right
    // answer to a learner who hasn't found it yet (owner 2026-11-17: try again until right)
    set({ screen: screen - 1, answers: withoutWrong(get(), screen) });
  },

  answer: (option) => {
    const { screen, answers } = get();
    // An answer stands until "Try again" (a wrong one) clears it: the "Why" is shown against it
    if (answers[screen] !== undefined) return;
    set({ answers: { ...answers, [screen]: option } });
  },

  retry: () => set((s) => ({ answers: withoutWrong(s, s.screen) })),

  enterTour: (tour) => set({ inTour: true, tourFrom: tour }),

  forgetTour: () => set({ tourFrom: null }),

  leaveTour: (moveOn = true) => {
    const { inTour, activeId, screen, tourFrom } = get();
    if (!inTour || !activeId) return;
    set({ inTour: false, tourFrom: null });
    // Moves on from the Try screen when its own tour ended, or from the card whose practice trade it
    // was (owner 2026-11-16), however it ended: a learner stuck on a step (a missing control) closes
    // it, and landing back on the card would only offer the same stuck trade again (the plan,
    // notes 11 item 5); Back returns to the card. Another tour handed over from there (an article's
    // practice link) brings the learner back to the same screen
    const lesson = getLesson(activeId);
    const at = lessonScreens(lesson)[screen];
    // (never one the app closed itself: a rotation to a size the tour can't run at is no ending of
    // the learner's, so they stay on the screen and can start it again where it runs)
    if (moveOn && tourFrom !== null && screenTour(lesson, at) === tourFrom) get().next();
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
    set((s) => {
      const counted = isStartDone(s, activeId);
      return {
        ...freshRun(null),
        // A start markFinished already counted keeps `completed` as it is now: the server may have
        // refused it since (undone() took it back), and leaving must not show it done again
        completed: counted ? s.completed : { ...s.completed, [activeId]: true },
        finishes: counted ? s.finishes : s.finishes + 1,
        returnTo: null,
        run: s.run + 1,
      };
    });
  },

  // (finish and markFinished stay two: one ends the run and closes, the other counts the finish
  // and keeps the sheet for the streak; isStartDone is their one shared rule. Weighed, review
  // after release #302)
  markFinished: () => {
    const { activeId, returnTo, starts } = get();
    if (!activeId || returnTo || isStartDone(get(), activeId)) return;
    set((s) => ({
      completed: { ...s.completed, [activeId]: true },
      finishes: s.finishes + 1,
      doneAt: { id: activeId, starts },
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

  clearReached: () => set({ reached: {} }),

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
    // `run` and `starts` keep counting (never back to an earlier value): a key made from them, such
    // as the streak's "seen" mark, never comes round again
    set((s) => ({
      ...initial,
      answers: {},
      completed: {},
      reached: {},
      run: s.run + 1,
      starts: s.starts,
    })),
}));
