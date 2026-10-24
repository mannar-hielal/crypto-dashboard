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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { guide } from '@/lib/guideAnchors';
import { getArticle } from '@/learn/articles';
import { useArticleStore } from '@/learn/articleStore';
import { ArticleWidget } from '@/learn/ArticleWidgets';
import type { Concept } from '@/learn/concepts';
import { conceptFor } from '@/learn/graph';
import { parseTerms } from '@/learn/terms';
import { usePaperStore } from '@/store/paperStore';
import { GuideFigure } from './art/Guide';
import { GuideAvatar, LessonArt } from './LessonArt';
import { LessonChart } from './LessonChart';
import { TOUR_MIN_WIDTH } from './LearnCard';
import { useLessonStore } from './lessonStore';
import {
  getLesson,
  lessonScreens,
  type Lesson,
  questionGuide,
  type LessonQuestion,
} from './lessons';
import styles from './LessonSheet.module.css';
import { useTourStore } from './tourStore';
import { getTour } from './tours';

const NAMES = { tick: 'Tick', tock: 'Tock' } as const;
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

function TermPeek({
  concept,
  onClose,
  onMore,
}: {
  concept: Concept;
  onClose: () => void;
  onMore: () => void;
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
      <button type="button" className={styles.link} onClick={onMore} {...guide('lesson.peek.more')}>
        Read more ({getArticle(concept.article).minutes} min) →
      </button>
    </div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function QuestionView({
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
      {answered && (
        <p className={styles.explain} role="status">
          <strong>{answer === q.correct ? 'Right. ' : 'Not quite. '}</strong>
          {q.explain}
        </p>
      )}
    </>
  );
}

function NoteView({ prompt, onDone }: { prompt: string; onDone: () => void }) {
  const addJournalNote = usePaperStore((s) => s.addJournalNote);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    const err = await addJournalNote(text.trim());
    setSaving(false);
    if (err) setError('Could not save the note right now. You can skip it and carry on.');
    else onDone();
  };

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
        onChange={(e) => setText(e.target.value)}
        {...guide('lesson.note')}
      />
      <p className={styles.hint}>
        It goes to your journal (in the account panel), where only you can read it.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.inlineActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={text.trim() === '' || saving}
          onClick={() => void save()}
          {...guide('lesson.note.save')}
        >
          Save to journal
        </button>
        <button type="button" className={styles.link} onClick={onDone}>
          Skip
        </button>
      </div>
    </>
  );
}

function CloseView({ lesson, screen }: { lesson: Lesson; screen: number }) {
  const rating = useLessonStore((s) => s.rating);
  return (
    <>
      <p className={styles.question}>You can now</p>
      <ul className={styles.canDo}>
        {lesson.canDo.map((item) => (
          <li key={item.text}>
            <span aria-hidden="true">✓ </span>
            {item.text}.{' '}
            <button
              type="button"
              className={styles.link}
              onClick={() =>
                useArticleStore.getState().open(item.article, {
                  section: item.section,
                  from: { lesson: lesson.id, screen },
                })
              }
              {...guide('lesson.can-do', item.section ?? item.article)}
            >
              Read more →
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.rule} {...guide('lesson.rule')}>
        {lesson.rule}
      </p>
      <p className={styles.text}>{lesson.teaser}</p>
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
    </>
  );
}

// ─── The sheet ───────────────────────────────────────────────────────────────

export function LessonSheet() {
  const navigate = useNavigate();
  const desktop = useMediaQuery(TOUR_MIN_WIDTH);
  const activeId = useLessonStore((s) => s.activeId);
  const screenIndex = useLessonStore((s) => s.screen);
  const answers = useLessonStore((s) => s.answers);
  const inTour = useLessonStore((s) => s.inTour);
  const articleOpen = useArticleStore((s) => s.openId !== null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** The term whose peek is open, on the screen it was opened on; Next and Back close it */
  const [peek, setPeek] = useState<{ screen: number; id: string } | null>(null);

  const lesson = activeId ? getLesson(activeId) : null;
  const lessonTour = lesson?.tour ?? null;

  // While the lesson's tour runs, the tour store has the screen; when the tour stops — finished,
  // skipped or closed — the lesson carries on with its questions
  useEffect(() => {
    if (!inTour || !lessonTour) return;
    return useTourStore.subscribe((s, prev) => {
      if (prev.activeId === lessonTour && s.activeId !== lessonTour) {
        useLessonStore.getState().leaveTour();
      }
    });
  }, [inTour, lessonTour]);

  // Esc closes the sheet (not while the tour or an article is open: each has its own Esc)
  useEffect(() => {
    if (!activeId || inTour || articleOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useLessonStore.getState().close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, inTour, articleOpen]);

  // Each new screen takes the focus, so a screen reader reads it from the top
  useEffect(() => {
    dialogRef.current?.focus();
  }, [screenIndex, activeId, inTour, articleOpen]);

  // The lesson waits, hidden, while its tour runs or an article is open in the drawer
  if (!lesson || inTour || articleOpen) return null;

  const screens = lessonScreens(lesson);
  const screen = screens[screenIndex];
  if (!screen) return null;
  const { next, back, close, answer, finish } = useLessonStore.getState();
  const isQuestion = screen.kind === 'moment' || screen.kind === 'check';
  const question =
    screen.kind === 'moment'
      ? lesson.moment
      : screen.kind === 'check'
        ? lesson.checks[screen.index]
        : null;
  const answered = answers[screenIndex] !== undefined;

  const startTour = () => {
    if (!lesson.tour) return;
    const tourId = lesson.tour;
    navigate(getTour(tourId).startUrl);
    useLessonStore.getState().enterTour();
    useTourStore.getState().start(tourId);
  };

  // The close's next step: the next lesson (any screen), or a tour (a larger screen only)
  const nextStep = lesson.next;
  const offerNext = !!nextStep && (nextStep.kind === 'lesson' || desktop);
  const nextLabel = !nextStep
    ? ''
    : nextStep.kind === 'lesson'
      ? `Lesson ${getLesson(nextStep.id).number}: ${getLesson(nextStep.id).title}`
      : getTour(nextStep.id).title;
  const startNext = () => {
    if (!nextStep) return;
    finish();
    if (nextStep.kind === 'lesson') {
      useLessonStore.getState().start(nextStep.id);
      return;
    }
    navigate(getTour(nextStep.id).startUrl);
    useTourStore.getState().start(nextStep.id);
  };

  const openTerm = peek?.screen === screenIndex ? peek.id : null;
  const peekConcept = openTerm ? conceptFor(openTerm) : null;
  const toggleTerm = (id: string) => setPeek(openTerm === id ? null : { screen: screenIndex, id });
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
      body = (
        <>
          {card.chart ? (
            // A real chart keeps its whole slot: the presenter stands beside it
            <div className={styles.chartRow}>
              <GuideFigure {...card.presenter} className={styles.chartGuide} />
              <LessonChart
                scene={card.chart}
                revealed={false}
                fallback={<LessonArt id={card.chart.fallback} />}
              />
            </div>
          ) : (
            <LessonArt id={card.art} presenter={card.presenter} />
          )}
          {card.text && <CardText text={card.text} openTerm={openTerm} onTerm={toggleTerm} />}
          {peekConcept && (
            <TermPeek
              concept={peekConcept}
              onClose={() => setPeek(null)}
              onMore={() => readMore(peekConcept)}
            />
          )}
          {card.lines?.map((line) => (
            <p key={line.text} className={styles.line}>
              <GuideAvatar who={line.speaker} />
              <span>
                <strong className={styles.speaker}>{NAMES[line.speaker]}</strong> {line.text}
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
        <>
          {question.chart && (
            <LessonChart
              scene={question.chart}
              revealed={answered}
              fallback={<LessonArt id={question.chart.fallback} />}
            />
          )}
          <QuestionView q={question} answer={answers[screenIndex]} onAnswer={answer} />
        </>
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
            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.primary}
                onClick={next}
                {...guide('lesson.try')}
              >
                Continue
              </button>
            </div>
          </>
        );
        break;
      }
      heading = 'Try it on the real screen';
      body = (
        <>
          <p className={styles.text}>{lesson.tryIntro}</p>
          {!desktop && (
            <p className={styles.hint}>
              This part needs a larger screen (a laptop or tablet). You can skip it for now and come
              back to it from Learn.
            </p>
          )}
          <div className={styles.inlineActions}>
            {desktop && (
              <button
                type="button"
                className={styles.primary}
                onClick={startTour}
                {...guide('lesson.try')}
              >
                Show me
              </button>
            )}
            <button type="button" className={styles.link} onClick={next}>
              {desktop ? 'Skip this part' : 'Continue'}
            </button>
          </div>
        </>
      );
      break;
    case 'note':
      heading = 'Your note';
      body = <NoteView prompt={lesson.notePrompt} onDone={next} />;
      break;
    case 'close':
      heading = `Lesson ${lesson.number} done`;
      body = <CloseView lesson={lesson} screen={screenIndex} />;
      break;
  }

  // The try and note screens carry their own buttons; the close has Finish (and the next step)
  const showNext = screen.kind === 'card' || isQuestion;

  return createPortal(
    <div className={styles.overlay} {...guide('lesson.overlay')}>
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-heading"
        tabIndex={-1}
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
        <h2 id="lesson-heading" className={styles.heading}>
          {heading}
        </h2>
        <div className={styles.body}>{body}</div>

        <div className={styles.foot}>
          {screenIndex > 0 && screen.kind !== 'close' && (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setPeek(null);
                back();
              }}
              {...guide('lesson.back')}
            >
              ← Back
            </button>
          )}
          <span className={styles.spacer} />
          {showNext && (
            <button
              type="button"
              className={styles.primary}
              disabled={isQuestion && !answered}
              onClick={() => {
                setPeek(null);
                next();
              }}
              {...guide('lesson.next')}
            >
              Next →
            </button>
          )}
          {screen.kind === 'close' &&
            (offerNext ? (
              <>
                <button
                  type="button"
                  className={styles.link}
                  onClick={finish}
                  {...guide('lesson.finish')}
                >
                  Finish for now
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={startNext}
                  {...guide(
                    nextStep?.kind === 'lesson' ? 'lesson.next-lesson' : 'lesson.next-tour'
                  )}
                >
                  {nextLabel}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={finish}
                {...guide('lesson.finish')}
              >
                Finish
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
