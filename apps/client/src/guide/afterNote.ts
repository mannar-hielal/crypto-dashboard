/**
 * Leaving a lesson's run, and starting a lesson or a tour from outside the sheet (an article, the
 * map, a checkpoint's review), all in one place.
 *
 * - **The journal line first:** a line typed but not saved goes to the journal before the move,
 *   which happens once it's there. After a failure (said under the note) the next press goes on
 *   without it. While a save is on its way, one move waits for it (the Save button says "Saving your
 *   line…"): a finishing one (Finish, the way on) over a closing one (✕, Esc), else the first asked.
 *   So a learner who pressed Finish always finishes, whatever else they pressed meanwhile.
 * - **One lesson or tour on screen:** a lesson's own tour is handed over as its Try step does; any
 *   other tour ends the lesson on screen, and another lesson ends a running tour, so neither comes
 *   back over the other.
 *
 * The rule that keeps the journal part small: a line exists only on a lesson's last screen, where
 * it's typed. That screen has no Back, no terms and no Read more (a test holds it), and the sheet's
 * overlay and focus trap keep the map out of reach over it, so the only ways off it are the sheet's
 * buttons, ✕, Esc and the look back's way home, all through here. The drawers' starts come through
 * here too, for the one-on-screen rule; they never find a line to save.
 */

import { getLesson, type LessonId } from './lessons';
import { useLessonStore, noteToSave, type JournalWrite } from './lessonStore';
import { useTourStore } from './tourStore';
import { getTour, type TourId } from './tours';

/**
 * The journal writer (`paperStore.addJournalNote`), given by the lesson sheet while it's mounted;
 * a line is only ever typed there. Kept out of an import so this module stays free of the paper
 * store (and its SDK) for the drawers that use it.
 */
let journalWrite: JournalWrite | null = null;
export function setJournalWrite(write: JournalWrite | null) {
  journalWrite = write;
}

/**
 * The save on its way and the move waiting for it. The store's `run` keeps them honest: a save
 * whose run is gone (✕ elsewhere, a reset) resolves false and drops the move with it.
 */
let inFlight: Promise<boolean> | null = null;
let queued: { go: () => void; finishing: boolean } | null = null;

/** Send the journal line now (Save to journal, `retry` after a failure, or on the way out) */
export function saveJournalLine(retry = false): Promise<boolean> {
  if (inFlight) return inFlight;
  if (!journalWrite) return Promise.resolve(true);
  const save = useLessonStore.getState().saveNote(journalWrite, retry);
  inFlight = save;
  void save.then((ok) => {
    inFlight = null;
    const move = queued;
    queued = null;
    if (ok && move) move.go();
  });
  return save;
}

/** `finishing`: Finish or the way on, which a later ✕ or Esc mustn't undo, and which wins over them */
export function afterNote(go: () => void, { finishing = false } = {}) {
  if (inFlight) {
    if (!queued || (finishing && !queued.finishing)) queued = { go, finishing };
    return;
  }
  if (!noteToSave(useLessonStore.getState()) || !journalWrite) {
    go();
    return;
  }
  queued = { go, finishing };
  void saveJournalLine();
}

/** Start a tour on its page */
function runTour(tour: TourId, navigate: (url: string) => void) {
  navigate(getTour(tour).startUrl);
  useTourStore.getState().start(tour);
}

/**
 * A tour, from the sheet's Try step or the way on, an article, the map or a checkpoint. The
 * lesson's own tour is handed over: the lesson waits where it is, and carries on past Try after it
 * if it was started there (`leaveTour`). Any other ends the lesson on screen first (a look back's
 * home with it).
 */
export function startTour(tour: TourId, navigate: (url: string) => void) {
  afterNote(() => {
    const lessons = useLessonStore.getState();
    // The lesson's own tour: its Try tour, or a card's practice trade (owner 2026-11-16)
    const own = (id: LessonId | null | undefined) =>
      !!id &&
      (getLesson(id).tour === tour || getLesson(id).cards.some((c) => c.practice?.tour === tour));
    if (own(lessons.activeId)) {
      // The lesson on screen (a look back's too, from its Try step) waits where it is; only its
      // Try step moves on when the tour ends
      lessons.enterTour(tour);
    } else if (own(lessons.returnTo?.lesson)) {
      // From a look back, the home lesson's own tour: home first, then handed over the same way
      lessons.returnBack();
      useLessonStore.getState().enterTour(tour);
    } else {
      lessons.returnBack();
      useLessonStore.getState().close();
    }
    runTour(tour, navigate);
  });
}

/**
 * A lesson, from an article, the map or a checkpoint (`lessonStore.start` knows the lesson on
 * screen, a look back's way home, and any other). A tour still running ends, unless it's that
 * lesson's own (handed over from it).
 */
export function startLesson(id: LessonId, screen?: number) {
  afterNote(() => {
    const { activeId, inTour } = useLessonStore.getState();
    useLessonStore.getState().start(id, screen);
    const tour = useTourStore.getState().activeId;
    if (tour && !(inTour && activeId === id)) useTourStore.getState().close();
  });
}
