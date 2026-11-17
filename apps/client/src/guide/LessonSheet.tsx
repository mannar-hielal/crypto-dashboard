/**
 * The lesson sheet (owner's visual Q&A 2026-10-22): a centred card over the dimmed dashboard, full
 * screen on phones. One screen at a time — illustrated cards, the mid-lesson question, "try it on
 * the real screen" (the sheet steps aside while the lesson's tour runs), the questions, one
 * journal line, and the close with the lesson's rule and an optional rating. Questions praise the
 * honest answer and explain every answer; there are no prizes and no confetti.
 *
 * Knowledge base (owner's visual Q&A 2026-10-23): a card's terms (dotted underline) open a peek
 * inside the sheet, and its "Read more" opens the article in the drawer while the lesson waits;
 * history cards show a real mini chart; the close lists what the learner can now do.
 */

import { AnswerResult } from './AnswerResult';
import { useTourWide } from './useTourWide';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { guide } from '@/lib/guideAnchors';
import { trapFocus } from '@/lib/trapFocus';
import { getArticle } from '@/learn/articles';
import { useArticleStore } from '@/learn/articleStore';
import { useAuthStore } from '@/store/authStore';
import { ArticleWidget } from '@/learn/ArticleWidgets';
import type { Concept } from '@/learn/concepts';
import { conceptFor, lessonPlaceLabel, lessonPlacesOf } from '@/learn/graph';
import { parseTerms } from '@/learn/terms';
import { usePaperStore } from '@/store/paperStore';
import { GuideFigure } from './art/Guide';
import { CardBeats } from './CardBeats';
import { FinishLine } from './FinishLine';
import { GenesisReveal } from './GenesisReveal';
import { GuidesMeet } from './GuidesMeet';
import { GuideAvatar, LessonArt } from './LessonArt';
import { LessonChart } from './LessonChart';
import { BuySellView } from './BuySellView';
import { StreakView } from './StreakView';
import { MatchQuiz } from './MatchQuiz';
import { OrderQuiz } from './OrderQuiz';
import {
  afterNote,
  saveJournalLine,
  setJournalWrite,
  startTour as startTourShared,
} from './afterNote';
import { useLessonStore } from './lessonStore';
import {
  getLesson,
  GUIDE_NAMES,
  lessonScreens,
  type CanDo,
  type Lesson,
  type LessonPhoto,
  questionGuide,
  type LessonQuestion,
} from './lessons';
import styles from './LessonSheet.module.css';
import { useTourStore } from './tourStore';
import { getTour, runsHere } from './tours';

const NOTE_MAX = 500;

// ─── Terms and their peek ────────────────────────────────────────────────────

/** Card text with its terms as buttons; an unknown id stays plain text */
function CardText({
  text,
  openTerm,
  onTerm,
}: {
  text: string;
  openTerm: string | null;
  onTerm: (id: string) => void;
}) {
  return (
    <p className={styles.text}>
      {parseTerms(text).map((seg) => {
        const concept = seg.concept ? conceptFor(seg.concept) : null;
        if (!concept) return seg.text;
        return (
          <button
            key={`term:${concept.id}`}
            type="button"
            className={styles.term}
            aria-expanded={openTerm === concept.id}
            onClick={() => onTerm(concept.id)}
            {...guide('lesson.term', concept.id)}
          >
            {seg.text}
          </button>
        );
      })}
    </p>
  );
}

/** Where an earlier lesson first taught a term, as "Lesson 1: A notebook, not coins" */
function earlierPlace(concept: Concept, current: Lesson) {
  // Places are card screens, in lesson order (`lessonPlacesOf`)
  const first = lessonPlacesOf(concept.id)[0];
  if (!first || getLesson(first.lesson).number >= current.number) return null;
  return { ...first, label: lessonPlaceLabel(first) };
}

function TermPeek({
  concept,
  from,
  onClose,
  onMore,
  onFrom,
}: {
  concept: Concept;
  /** The earlier lesson that taught it, if any (owner 2026-11-08) */
  from: string | null;
  onClose: () => void;
  onMore: () => void;
  onFrom: () => void;
}) {
  return (
    <div className={styles.peek} role="region" aria-label={concept.term} {...guide('lesson.peek')}>
      <div className={styles.peekHead}>
        <strong>{concept.term}</strong>
        <button
          type="button"
          className={styles.close}
          aria-label={`Close ${concept.term}`}
          onClick={onClose}
          {...guide('lesson.peek.close')}
        >
          <X size={16} />
        </button>
      </div>
      <p className={styles.peekText}>{concept.peek}</p>
      <p className={styles.peekText}>
        <span className={styles.peekLabel}>Think of it as </span>
        {concept.think}
      </p>
      {from && (
        <button
          type="button"
          className={`${styles.link} ${styles.peekFrom}`}
          onClick={onFrom}
          {...guide('lesson.peek.from')}
        >
          From {from} →
        </button>
      )}
      <button type="button" className={styles.link} onClick={onMore} {...guide('lesson.peek.more')}>
        Read more ({getArticle(concept.article).minutes} min) →
      </button>
    </div>
  );
}

/**
 * ✕ or Esc on the streak screen: back to the close, then the finish the learner asked for (never the
 * next lesson or tour the main button would have opened). A failed journal save shows on the close.
 */
function leaveStreakFinishing(clear: (v: null) => void) {
  clear(null);
  finishLesson();
}

/** The lesson's finish, after the journal line (if one is typed) is saved: the one sequence */
function finishLesson() {
  afterNote(() => useLessonStore.getState().finish(), { finishing: true });
}

// ─── Screens ─────────────────────────────────────────────────────────────────

/**
 * A question screen's body: its chart (a frozen one plays on once answered), then the multiple
 * choice, Buy and Sell under the plan, Drag and drop or Match boxes (owner's visual Q&A 2026-11-16)
 */
function QuestionBody({
  q,
  answer,
  onAnswer,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
}) {
  return (
    <>
      {q.chart && (
        <LessonChart
          scene={q.chart}
          revealed={answer !== undefined}
          fallback={<LessonArt id={q.chart.fallback} />}
        />
      )}
      {q.format === 'buy-sell' ? (
        <BuySellView q={q} answer={answer} onAnswer={onAnswer} />
      ) : q.format === 'order' ? (
        <OrderQuiz q={q} answer={answer} onAnswer={onAnswer} />
      ) : q.format === 'match' ? (
        <MatchQuiz q={q} answer={answer} onAnswer={onAnswer} />
      ) : (
        <QuestionView q={q} answer={answer} onAnswer={onAnswer} />
      )}
    </>
  );
}

export function QuestionView({
  q,
  answer,
  onAnswer,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
}) {
  const answered = answer !== undefined;
  const guideNow = questionGuide(q, answer);
  return (
    <>
      {q.context && <p className={styles.context}>{q.context}</p>}
      <div className={styles.questionHead}>
        <GuideFigure who={guideNow.who} mood={guideNow.mood} className={styles.reactGuide} />
        <p className={styles.question}>{q.question}</p>
      </div>
      <div className={styles.options}>
        {q.options.map((option, i) => {
          const cls = !answered
            ? styles.option
            : i === q.correct
              ? `${styles.option} ${styles.right}`
              : i === answer
                ? `${styles.option} ${styles.wrong}`
                : styles.option;
          return (
            <button
              key={option}
              type="button"
              className={cls}
              disabled={answered}
              onClick={() => onAnswer(i)}
              {...guide('lesson.option', String(i))}
            >
              {option}
            </button>
          );
        })}
      </div>
      {answered && <AnswerResult right={answer === q.correct} explain={q.explain} />}
    </>
  );
}

/**
 * One line for the journal, on the lesson's last screen; optional. The draft lives in the lesson
 * store, so the sheet's buttons that leave the screen can save it first (and wait for it) when
 * "Save to journal" wasn't pressed
 */
function NoteView({ prompt }: { prompt: string }) {
  const text = useLessonStore((s) => s.note);
  const status = useLessonStore((s) => s.noteStatus);
  const error = useLessonStore((s) => s.noteError);
  const saved = status === 'saved';

  return (
    <>
      <p className={styles.question}>One line for your journal</p>
      <label className={styles.noteLabel} htmlFor="lesson-note">
        {prompt}
      </label>
      <textarea
        id="lesson-note"
        className={styles.note}
        rows={3}
        maxLength={NOTE_MAX}
        value={text}
        // Locked while it's on its way too: what's saved is what the learner sees
        readOnly={saved || status === 'saving'}
        onChange={(e) => useLessonStore.getState().setNote(e.target.value)}
        {...guide('lesson.note')}
      />
      <p className={styles.hint}>
        It goes to your journal (in the account panel), where only you can read it.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.inlineActions}>
        {saved ? (
          <p className={styles.saved} role="status">
            ✓ Saved to your journal
          </p>
        ) : (
          // While it saves, the button says so (any press now waits for it, so a button that waits
          // isn't a mystery); it stays in place and enabled, so the focus never falls out
          <button
            type="button"
            className={styles.primary}
            aria-live="polite"
            disabled={text.trim() === ''}
            onClick={() => void saveJournalLine(true)}
            {...guide('lesson.note.save')}
          >
            {status === 'saving' ? 'Saving your line…' : 'Save to journal'}
          </button>
        )}
      </div>
    </>
  );
}

/** A real photograph on a card (owner 2026-11-08), with its credit under it when it has one */
function LessonPhotoView({ photo }: { photo: LessonPhoto }) {
  return (
    <figure className={styles.photo} {...guide('lesson.photo')}>
      <img src={photo.src} alt={photo.alt} className={styles.photoImg} />
      {photo.credit && <figcaption className={styles.photoCredit}>{photo.credit}</figcaption>}
    </figure>
  );
}

/** A line to read more on: a recap line or a "You can now" line, each opening its article */
function ReadMore({
  item,
  lesson,
  screen,
  anchor = lesson.recap ? 'lesson.recap' : 'lesson.can-do',
}: {
  item: Pick<CanDo, 'article' | 'section'>;
  lesson: Lesson;
  screen: number;
  anchor?: 'lesson.recap' | 'lesson.can-do' | 'lesson.more';
}) {
  // A line with no article yet is plain text (owner 2026-11-16)
  const article = item.article;
  if (!article) return null;
  return (
    <button
      type="button"
      className={styles.link}
      onClick={() =>
        useArticleStore.getState().open(article, {
          section: item.section,
          from: { lesson: lesson.id, screen },
        })
      }
      {...guide(anchor, item.section ?? article)}
    >
      Read more →
    </button>
  );
}

/** The summary before the end: the lesson's recap, or what the learner can now do */
function SummaryView({
  lesson,
  screen,
  done,
  onDone,
}: {
  lesson: Lesson;
  screen: number;
  /** For a staged summary (`recap.genesis`): everything shown */
  done: boolean;
  onDone: () => void;
}) {
  const recap = lesson.recap;
  if (!recap) {
    return (
      <ul className={styles.canDo}>
        {lesson.canDo.map((item) => (
          <li key={item.text}>
            <span aria-hidden="true">✓ </span>
            {item.text}. <ReadMore item={item} lesson={lesson} screen={screen} />
          </li>
        ))}
      </ul>
    );
  }
  // A highlight with no article has no Read more (the end of Lesson 1, owner 2026-11-12). Its words
  // are built once: in the purple box on a plain recap, under the Bitcoin mark on a staged one
  const { article, section } = recap.highlight ?? {};
  const highlightWords = recap.highlight && (
    <>
      {recap.highlight.text}{' '}
      {article && <ReadMore item={{ article, section }} lesson={lesson} screen={screen} />}
    </>
  );
  const highlight = highlightWords && (
    <p className={styles.highlight} {...guide('lesson.highlight')}>
      {highlightWords}
    </p>
  );
  if (recap.genesis) {
    return (
      <GenesisReveal
        story={recap.genesis}
        points={recap.points.map((item) => ({
          text: item.text,
          node: (
            <>
              {item.text} <ReadMore item={item} lesson={lesson} screen={screen} />
            </>
          ),
        }))}
        // The story's last line under the Bitcoin mark, not in the purple box
        highlight={highlightWords && <span {...guide('lesson.highlight')}>{highlightWords}</span>}
        done={done}
        onDone={onDone}
      />
    );
  }
  return (
    <>
      <ol className={styles.recap}>
        {recap.points.map((item) => (
          <li key={item.text}>
            {item.text} <ReadMore item={item} lesson={lesson} screen={screen} />
          </li>
        ))}
      </ol>
      {highlight}
    </>
  );
}

/** The end (owner 2026-11-08): the finish ribbon, a line for the journal, the rating; the way on is below */
function CloseView({ lesson }: { lesson: Lesson }) {
  const rating = useLessonStore((s) => s.rating);
  // A look back is no run of the lesson to rate: the learner rated it when they took it
  const visiting = useLessonStore((s) => s.returnTo !== null);
  return (
    <>
      <FinishLine />
      <NoteView prompt={lesson.notePrompt} />
      {!visiting && (
        <div className={styles.rating}>
          <p className={styles.hint} id="lesson-rating">
            How clear was this lesson? (optional)
          </p>
          <div role="group" aria-labelledby="lesson-rating" className={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.star}${rating !== null && n <= rating ? ` ${styles.starOn}` : ''}`}
                aria-label={`${n} of 5`}
                aria-pressed={rating === n}
                onClick={() => useLessonStore.getState().rate(n)}
                {...guide('lesson.rating', String(n))}
              >
                <Star size={22} />
              </button>
            ))}
          </div>
        </div>
      )}
      {/* What the next lesson brings, just above the way on; not on a look back, whose way on leads home */}
      {lesson.teaser && !visiting && (
        <p className={styles.teaser} {...guide('lesson.teaser')}>
          {lesson.teaser}
        </p>
      )}
    </>
  );
}

// ─── The sheet ───────────────────────────────────────────────────────────────

export function LessonSheet() {
  const navigate = useNavigate();
  const desktop = useTourWide();
  const activeId = useLessonStore((s) => s.activeId);
  const screenIndex = useLessonStore((s) => s.screen);
  const answers = useLessonStore((s) => s.answers);
  const inTour = useLessonStore((s) => s.inTour);
  const returnTo = useLessonStore((s) => s.returnTo);
  const writeNote = usePaperStore((s) => s.addJournalNote);
  const articleOpen = useArticleStore((s) => s.openId !== null);
  const mapOpen = useTourStore((s) => s.panelOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  /**
   * The term whose peek is open, on the run and screen it was opened on: Next, Back and any change
   * of lesson (a look back, the way back, a start) close it
   */
  const [peek, setPeek] = useState<{ run: number; screen: number; id: string } | null>(null);
  const run = useLessonStore((s) => s.run);
  /** Cold-open cards whose lines are all in (`lesson:screen`): Back to one doesn't replay it */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const accessToken = useAuthStore((s) => s.accessToken);
  /**
   * The streak screen after the close (owner's visual Q&A, 2026-11-16): the close's button pressed
   * waits here, on this run, and Continue then does it. Not a screen of its own, so the funnel's
   * step ids don't move.
   */
  const [streakThen, setStreakThen] = useState<{
    run: number;
    screen: number;
    go: () => void;
  } | null>(null);
  const [streakSeenAt, setStreakSeenAt] = useState<string | null>(null);
  // Which lesson start the streak was shown for: a look back and the way back from it change the
  // run, never the start, so the same finish never shows its streak twice
  const starts = useLessonStore((s) => s.starts);
  const startKey = `${activeId ?? ''}:${starts}`;
  // On the close it was opened from: the same run moved to another screen (the lesson opened again
  // at a card from the map) leaves it, so ✕ and Esc there just close
  // Leaving the close any other way (the lesson opened again at a card, Back) ends the streak's wait:
  // coming back to the close shows the close, never the same finish's streak again
  useEffect(
    () =>
      useLessonStore.subscribe((state, prev) => {
        if (state.screen !== prev.screen || state.run !== prev.run) setStreakThen(null);
      }),
    []
  );
  const streakActive =
    streakThen?.run === run && streakThen.screen === screenIndex && !!accessToken;

  const lesson = activeId ? getLesson(activeId) : null;
  const lessonTour = lesson?.tour ?? null;
  // A tour that works on phones too (owner 2026-11-16): its Try is offered on every screen
  const lessonTourPhone = !!lessonTour && runsHere(lessonTour, false);

  // While a tour handed over from the lesson runs (its Try tour, a card's practice trade), the tour
  // store has the screen; when no tour runs any more — finished, skipped or closed, after a chain
  // like buy → sell too — the lesson carries on. A tour that took its place some other way (not
  // its next chapter, not handed over by the lesson) didn't come from the lesson: its end brings
  // the learner back to the same screen
  useEffect(() => {
    if (!inTour) return;
    return useTourStore.subscribe((s, prev) => {
      if (prev.activeId === null || s.activeId === prev.activeId) return;
      const lessons = useLessonStore.getState();
      if (s.activeId === null) lessons.leaveTour();
      else if (s.activeId !== getTour(prev.activeId).next && s.activeId !== lessons.tourFrom) {
        lessons.forgetTour();
      }
    });
  }, [inTour]);

  // The journal line is typed here, so here is where `afterNote` gets its writer
  useEffect(() => {
    setJournalWrite(writeNote);
    return () => setJournalWrite(null);
  }, [writeNote]);

  // Esc closes the sheet (not while the tour or an article is open: each has its own Esc)
  // (an open term peek closes first: Esc then dismisses just the peek; the map, if open over the
  // sheet, has its own Esc)
  const peekOpen = peek !== null;
  useEffect(() => {
    if (!activeId || inTour || articleOpen || mapOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (peekOpen) setPeek(null);
      else if (streakActive) leaveStreakFinishing(setStreakThen);
      else afterNote(() => useLessonStore.getState().close());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, inTour, articleOpen, mapOpen, peekOpen, streakActive]);

  // Each new screen takes the focus, so a screen reader reads it from the top (the streak screen
  // too: the button pressed to reach it is gone)
  useEffect(() => {
    dialogRef.current?.focus();
  }, [screenIndex, activeId, inTour, articleOpen, streakActive]);

  // When the map closes over the sheet, the sheet takes the focus back (so Tab stays trapped in
  // it), unless what the map opened has taken it (a checkpoint's sheet)
  const mapWasOpen = useRef(false);
  useEffect(() => {
    const closed = mapWasOpen.current && !mapOpen;
    mapWasOpen.current = mapOpen;
    if (!closed) return;
    const active = document.activeElement;
    if (!active || active === document.body || dialogRef.current?.contains(active)) {
      dialogRef.current?.focus();
    }
  }, [mapOpen]);

  // Whether the screen's Next may show yet: a cold-open card waits for its lines
  const beatsKey = lesson ? `${lesson.id}:${screenIndex}` : '';
  const screens = lesson ? lessonScreens(lesson) : [];
  const screen = screens.at(screenIndex);
  const screenCard = lesson && screen?.kind === 'card' ? lesson.cards[screen.index] : null;
  // A cold open, the guides' meeting and a staged summary (the birth of Bitcoin) each play first
  const staged =
    !!screenCard?.beats ||
    !!screenCard?.meet ||
    (!!lesson?.recap?.genesis && screen?.kind === 'summary');
  const ready = !staged || revealed.has(beatsKey);
  const reveal = () => setRevealed((r) => (r.has(beatsKey) ? r : new Set(r).add(beatsKey)));

  // Enter or → moves on (not from a button, an option or the note: they handle their own keys);
  // during a cold open, it shows the lines first
  useEffect(() => {
    if (!activeId || inTour || articleOpen || mapOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select')) return;
      const button = document.querySelector<HTMLButtonElement>('[data-guide="lesson.next"]');
      if (!ready) {
        e.preventDefault();
        setRevealed((r) => new Set(r).add(beatsKey));
      } else if (button && !button.disabled) {
        e.preventDefault();
        button.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, inTour, articleOpen, mapOpen, ready, beatsKey]);

  // The lesson waits, hidden, while its tour runs or an article is open in the drawer
  if (!lesson || inTour || articleOpen) return null;

  if (!screen) return null;
  const { next, back, answer } = useLessonStore.getState();
  const close = () =>
    streakActive
      ? leaveStreakFinishing(setStreakThen)
      : afterNote(() => useLessonStore.getState().close());
  const goBack = () => {
    setPeek(null);
    back();
  };
  // The last screen's buttons save a journal line typed but not saved first, and wait for it: on a
  // failure the learner stays, reads why, and the next press goes on without it
  const finish = finishLesson;
  // A card can be a quick check between cards (owner 2026-11-16)
  const cardQuiz = screen.kind === 'card' ? (lesson.cards[screen.index].quiz ?? null) : null;
  const isQuestion = screen.kind === 'moment' || screen.kind === 'check' || !!cardQuiz;
  const question =
    screen.kind === 'moment'
      ? lesson.moment
      : screen.kind === 'check'
        ? lesson.checks[screen.index]
        : cardQuiz;
  const answered = answers[screenIndex] !== undefined;

  // The lesson's own tour: handed over, the lesson waiting on this Try screen (`afterNote.ts`)
  const startTour = () => {
    if (lesson.tour) startTourShared(lesson.tour, navigate);
  };

  // The close's way on: the next lesson; during a look back, the lesson the learner came from
  const nextLesson = lesson.next;
  const offerNext = !!returnTo || !!nextLesson;
  const wayOn = returnTo?.lesson ?? nextLesson;
  const nextLabel = !wayOn
    ? ''
    : `${returnTo ? 'Back to ' : ''}Lesson ${getLesson(wayOn).number}: ${getLesson(wayOn).title}`;
  // The close's buttons show the streak first: a signed-in finish only, not from a look back, and
  // once per run
  // The finish and the journal line are saved at the press, before the streak shows: leaving from
  // the streak screen (a closed tab) loses neither. Continue, ✕ or Esc then only leave
  const viaStreak = (go: () => void) => () => {
    if (accessToken && !returnTo && streakSeenAt !== startKey) {
      // Seen once the finish goes through (a journal line that fails to save keeps the learner on
      // the close: the next press still shows the streak)
      afterNote(
        () => {
          setStreakSeenAt(startKey);
          useLessonStore.getState().markFinished();
          setStreakThen({ run, screen: screenIndex, go });
        },
        { finishing: true }
      );
    } else go();
  };
  const startNext = () =>
    afterNote(
      () => {
        // From a look back, Finish leads back to the lesson the learner came from, as they left it
        if (returnTo) {
          useLessonStore.getState().finish();
          return;
        }
        if (!nextLesson) return;
        useLessonStore.getState().finish();
        useLessonStore.getState().start(nextLesson);
      },
      { finishing: true }
    );

  const openTerm = peek?.run === run && peek.screen === screenIndex ? peek.id : null;
  const peekConcept = openTerm ? conceptFor(openTerm) : null;
  const earlier = peekConcept ? earlierPlace(peekConcept, lesson) : null;
  const toggleTerm = (id: string) =>
    setPeek(openTerm === id ? null : { run, screen: screenIndex, id });
  const readMore = (concept: Concept) => {
    setPeek(null);
    useArticleStore
      .getState()
      .open(concept.article, { from: { lesson: lesson.id, screen: screenIndex } });
  };

  let heading: string;
  let body: ReactNode;
  switch (screen.kind) {
    case 'card': {
      const card = lesson.cards[screen.index];
      heading = card.title;
      if (card.quiz) {
        // A fresh chart per screen: back-to-back quizzes never share one's candles
        body = (
          <QuestionBody
            key={`${run}:${screenIndex}`}
            q={card.quiz}
            answer={answers[screenIndex]}
            onAnswer={answer}
          />
        );
        break;
      }
      body = card.meet ? (
        <GuidesMeet meet={card.meet} done={ready} onDone={reveal} />
      ) : card.beats ? (
        <>
          {card.photo ? (
            <LessonPhotoView photo={card.photo} />
          ) : (
            card.art && <LessonArt id={card.art} presenter={card.presenter} />
          )}
          <CardBeats beats={card.beats} done={ready} onDone={reveal} />
        </>
      ) : (
        <>
          {card.photo ? (
            <LessonPhotoView photo={card.photo} />
          ) : card.chart ? (
            // A real chart keeps its whole slot: the presenter stands beside it
            <div className={styles.chartRow}>
              {card.presenter && <GuideFigure {...card.presenter} className={styles.chartGuide} />}
              <LessonChart
                scene={card.chart}
                revealed={false}
                fallback={<LessonArt id={card.chart.fallback} />}
              />
            </div>
          ) : (
            card.art && <LessonArt id={card.art} presenter={card.presenter} />
          )}
          {card.text && <CardText text={card.text} openTerm={openTerm} onTerm={toggleTerm} />}
          {card.practice && (
            // A practice trade on the real chart (owner 2026-11-16): the lesson waits, then goes on
            <button
              type="button"
              className={styles.practice}
              onClick={() => {
                if (card.practice) startTourShared(card.practice.tour, navigate);
              }}
              {...guide('lesson.practice', card.practice.tour)}
            >
              {card.practice.label}
            </button>
          )}
          {peekConcept && (
            <TermPeek
              concept={peekConcept}
              from={earlier?.label ?? null}
              onClose={() => setPeek(null)}
              onMore={() => readMore(peekConcept)}
              onFrom={() => {
                if (!earlier) return;
                setPeek(null);
                useLessonStore.getState().visit(earlier.lesson, earlier.screen);
              }}
            />
          )}
          {card.points && (
            <ul className={styles.points}>
              {card.points.map((point) => (
                <li key={point.label}>
                  <strong>{point.label}</strong> {point.text}
                </li>
              ))}
            </ul>
          )}
          {card.more && (
            <p className={styles.more}>
              <ReadMore
                item={card.more}
                lesson={lesson}
                screen={screenIndex}
                anchor="lesson.more"
              />
            </p>
          )}
          {card.lines?.map((line) => (
            <p key={line.text} className={styles.line}>
              <GuideAvatar who={line.speaker} />
              <span>
                <strong className={styles.speaker}>{GUIDE_NAMES[line.speaker]}</strong> {line.text}
              </span>
            </p>
          ))}
        </>
      );
      break;
    }
    case 'moment':
    case 'check':
      heading = screen.kind === 'moment' ? 'Your call' : 'Check yourself';
      body = question && (
        <QuestionBody
          key={`${run}:${screenIndex}`}
          q={question}
          answer={answers[screenIndex]}
          onAnswer={answer}
        />
      );
      break;
    case 'try':
      if (lesson.tryWidget) {
        // An interactive piece inside the sheet: the same on every screen size
        heading = 'Try it';
        body = (
          <>
            <p className={styles.text}>{lesson.tryIntro}</p>
            <ArticleWidget id={lesson.tryWidget} />
          </>
        );
        break;
      }
      heading = 'Try it on the real screen';
      body = (
        <>
          <p className={styles.text}>{lesson.tryIntro}</p>
          {!desktop && !lessonTourPhone && (
            <p className={styles.hint}>
              This part needs a larger screen (a laptop or tablet). You can skip it for now and come
              back to it from the learning path.
            </p>
          )}
        </>
      );
      break;
    case 'summary':
      heading = lesson.recap?.title ?? 'You can now';
      body = <SummaryView lesson={lesson} screen={screenIndex} done={ready} onDone={reveal} />;
      break;
    case 'close':
      if (streakActive && streakThen && accessToken) {
        heading = 'Your streak';
        const { go } = streakThen;
        body = (
          <StreakView
            accessToken={accessToken}
            onContinue={() => {
              setStreakThen(null);
              go();
            }}
          />
        );
        break;
      }
      heading = `Lesson ${lesson.number} done`;
      body = <CloseView lesson={lesson} />;
      break;
  }

  // The try screen carries its own buttons; the close has the way on (and Finish for now)
  const showNext = screen.kind === 'card' || screen.kind === 'summary' || isQuestion;
  // "Try it": its own main action in the same full-width footer as every screen's Next, with Skip
  // and Back under it (owner 2026-11-13)
  const tourTry = screen.kind === 'try' && !lesson.tryWidget && (desktop || lessonTourPhone);
  const nextWords = (screenCard?.nextLabel ?? 'Continue') + ' →';

  return createPortal(
    <div className={styles.overlay} {...guide('lesson.overlay')}>
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-heading"
        tabIndex={-1}
        // Tab stays inside the sheet: the page behind it (the map's Route button…) is out of reach
        onKeyDown={(e) => trapFocus(e, dialogRef.current)}
        {...guide('lesson.sheet')}
      >
        <div className={styles.head}>
          <button
            type="button"
            className={styles.close}
            aria-label="Close the lesson"
            onClick={close}
            {...guide('lesson.close')}
          >
            <X size={18} />
          </button>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Lesson progress"
            aria-valuemin={1}
            aria-valuemax={screens.length}
            aria-valuenow={screenIndex + 1}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${((screenIndex + 1) / screens.length) * 100}%` }}
            />
          </div>
          <span className={styles.counter}>
            {screenIndex + 1} / {screens.length}
          </span>
        </div>

        <p className={styles.kicker}>
          Lesson {lesson.number} · {lesson.title}
        </p>
        {returnTo && (
          <button
            type="button"
            className={`${styles.link} ${styles.returnLink}`}
            onClick={() => {
              setPeek(null);
              // From a look back's last screen too: a journal line typed there is saved first
              afterNote(() => useLessonStore.getState().returnBack());
            }}
            {...guide('lesson.return')}
          >
            ← Back to Lesson {getLesson(returnTo.lesson).number}
          </button>
        )}
        <h2 id="lesson-heading" className={styles.heading}>
          {heading}
        </h2>
        <div className={styles.body} data-tone={screenCard?.beats ? 'cinema' : undefined}>
          {body}
        </div>

        {showNext ? (
          <div className={styles.footStack}>
            <button
              // A new key on each screen (and once the lines are in) replays the shine
              key={`${screenIndex}:${ready}`}
              type="button"
              className={`${styles.primary} ${styles.nextButton}`}
              disabled={isQuestion && !answered}
              data-ready={ready}
              aria-hidden={ready ? undefined : true}
              tabIndex={ready ? undefined : -1}
              onClick={() => {
                setPeek(null);
                next();
              }}
              {...guide('lesson.next')}
            >
              {nextWords}
            </button>
            {screenIndex > 0 && (
              <button
                type="button"
                className={styles.link}
                onClick={goBack}
                {...guide('lesson.back')}
              >
                ← Back
              </button>
            )}
          </div>
        ) : screen.kind === 'try' ? (
          <div className={styles.footStack}>
            <button
              type="button"
              className={`${styles.primary} ${styles.nextButton}`}
              onClick={tourTry ? startTour : next}
              {...(lesson.tryWidget || tourTry ? guide('lesson.try') : {})}
            >
              {tourTry ? 'Show me' : 'Continue'}
            </button>
            {tourTry && (
              <button type="button" className={styles.link} onClick={next}>
                Skip this part
              </button>
            )}
            {screenIndex > 0 && (
              <button
                type="button"
                className={styles.link}
                onClick={goBack}
                {...guide('lesson.back')}
              >
                ← Back
              </button>
            )}
          </div>
        ) : screen.kind === 'close' && streakActive ? null : screen.kind === 'close' ? (
          // The way on first, as big as the cards' Next; finishing for now under it (2026-11-08)
          <div className={styles.footStack}>
            <button
              type="button"
              className={`${styles.primary} ${styles.nextButton}`}
              data-ready="true"
              onClick={viaStreak(offerNext ? startNext : finish)}
              {...guide(offerNext ? 'lesson.next-lesson' : 'lesson.finish')}
            >
              {offerNext ? nextLabel : 'Finish'}
            </button>
            {offerNext && !returnTo && (
              <button
                type="button"
                className={styles.link}
                onClick={viaStreak(finish)}
                {...guide('lesson.finish')}
              >
                Finish for now
              </button>
            )}
          </div>
        ) : (
          <div className={styles.foot}>
            {screenIndex > 0 && (
              <button
                type="button"
                className={styles.link}
                onClick={goBack}
                {...guide('lesson.back')}
              >
                ← Back
              </button>
            )}
            <span className={styles.spacer} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
