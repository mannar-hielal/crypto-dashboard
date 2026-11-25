/**
 * A chapter's checkpoint (learning map, owner's visual Q&A 2026-10-24), in the lesson sheet's frame
 * and with its question view: five mixed questions, each explained once answered, then the result.
 * A pass opens the rest of the path; a miss names where the idea was taught, with a way back
 * there, and the checkpoint can be taken again at once. No lives, timers or prizes. Closing it goes
 * back to the map.
 */

import { useTourWide } from '@/guide/useTourWide';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { guide } from '@/lib/guideAnchors';
import { startLesson, startTour } from '@/guide/afterNote';
import { missingPrerequisite } from './path';
import { getTour, isTourId, runsHere } from '@/guide/tours';
import { QuestionView } from '@/guide/LessonSheet';
import styles from '@/guide/LessonSheet.module.css';
import { getLesson } from '@/guide/lessons';
import { useTourStore } from '@/guide/tourStore';
import {
  checkpointScore,
  getCheckpoint,
  type CheckpointQuestion,
  type TaughtIn,
} from './checkpoints';
import { usePathStore } from './pathStore';
import { ReportBugButton } from '@/components/report/ReportBugButton';

/**
 * Where a Review goes: the place it was taught, unless that's a tour locked behind another (Sell
 * behind Buy) not done yet, which comes first. One rule for the label, the hint and the button
 */
function reviewTarget(t: TaughtIn, toursDone: Record<string, true | undefined>): TaughtIn {
  if (t.kind === 'lesson' || !isTourId(t.id)) return t;
  const needs = missingPrerequisite(t.id, toursDone);
  return needs ? { kind: 'tour', id: needs } : t;
}

function taughtInLabel(t: TaughtIn): string {
  if (t.kind === 'lesson') {
    const lesson = getLesson(t.id);
    return `Lesson ${lesson.number}: ${lesson.title}`;
  }
  return `Practice: ${getTour(t.id).title}`;
}

interface MissedProps {
  q: CheckpointQuestion;
  wide: boolean;
  onReview: (t: TaughtIn) => void;
  /** Where its Review goes (reviewTarget) */
  target: TaughtIn;
  /**
   * The first missed question with this target: the only one with the button (no twin links). The
   * others name where they were taught, which stays true; the button above leads there, through Buy
   * while Sell is locked (weighed, review after #311). The "(on a larger screen)" note is the
   * target's: it could mismatch the lesson named only if Buy couldn't run on a phone, and Buy is
   * phone-ready, so it gets its button there
   */
  firstForTarget: boolean;
}

function Missed({ q, wide, onReview, target, firstForTarget }: MissedProps) {
  // A tour that can't run here (a phone, unless it's phone-ready) gets its name without a button
  const canGo = firstForTarget && (target.kind === 'lesson' || runsHere(target.id, wide));
  return (
    <li>
      <p className={styles.text}>{q.question}</p>
      {canGo ? (
        <button
          type="button"
          className={styles.link}
          onClick={() => onReview(target)}
          {...guide('checkpoint.review', target.id)}
        >
          Review {taughtInLabel(target)} →
        </button>
      ) : (
        <p className={styles.hint}>
          Taught in {taughtInLabel(q.taughtIn)}
          {firstForTarget ? ' (on a larger screen)' : ''}
        </p>
      )}
    </li>
  );
}

export function CheckpointSheet() {
  const navigate = useNavigate();
  const wide = useTourWide();
  const checkpointId = usePathStore((s) => s.checkpointId);
  const index = usePathStore((s) => s.question);
  const answers = usePathStore((s) => s.answers);
  // Subscribed: a Buy finish landing while the result is open moves a Review to Sell
  const toursDone = useTourStore((st) => st.completed);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc closes, back to the map
  useEffect(() => {
    if (!checkpointId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      usePathStore.getState().closeCheckpoint();
      useTourStore.getState().openPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checkpointId]);

  // Each new question takes the focus, so a screen reader reads it from the top
  useEffect(() => {
    dialogRef.current?.focus();
  }, [checkpointId, index]);

  if (!checkpointId) return null;
  const checkpoint = getCheckpoint(checkpointId);
  const total = checkpoint.questions.length;
  const atResult = index >= total;
  const question = atResult ? null : checkpoint.questions[index];
  const answered = answers[index] !== undefined;
  const { answer, next, closeCheckpoint, startCheckpoint } = usePathStore.getState();

  const backToPath = () => {
    closeCheckpoint();
    useTourStore.getState().openPanel();
  };

  const review = (t: TaughtIn) => {
    closeCheckpoint();
    // As the map's and the articles' links (`afterNote.ts`): one lesson or tour on screen
    // (t is already reviewTarget's: a locked tour's prerequisite comes first)
    if (t.kind === 'lesson') startLesson(t.id);
    else startTour(t.id, navigate);
  };

  const score = checkpointScore(checkpoint, answers);
  const passed = score >= checkpoint.pass;
  const missed = checkpoint.questions.filter((q, i) => answers[i] !== q.correct);
  const targets = missed.map((q) => reviewTarget(q.taughtIn, toursDone));

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-heading"
        tabIndex={-1}
        {...guide('checkpoint.sheet')}
      >
        <div className={styles.head}>
          <button
            type="button"
            className={styles.close}
            aria-label="Close the checkpoint"
            onClick={backToPath}
            {...guide('checkpoint.close')}
          >
            <X size={18} />
          </button>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Checkpoint progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(index, total)}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${(Math.min(index + (answered ? 1 : 0), total) / total) * 100}%` }}
            />
          </div>
          {!atResult && (
            <span className={styles.counter}>
              {index + 1} / {total}
            </span>
          )}
          <ReportBugButton variant="sheet" anchor="checkpoint.report" />
        </div>

        <p className={styles.kicker}>{checkpoint.title}</p>

        {question ? (
          <>
            <h2 id="checkpoint-heading" className={styles.heading}>
              Check yourself
            </h2>
            <div className={styles.body}>
              <QuestionView q={question} answer={answers[index]} onAnswer={answer} />
            </div>
            <div className={styles.footStack}>
              <button
                type="button"
                className={`${styles.primary} ${styles.nextButton}`}
                disabled={!answered}
                onClick={next}
                {...guide('checkpoint.next')}
              >
                {index + 1 === total ? 'See the result' : 'Next →'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="checkpoint-heading" className={styles.heading}>
              {passed ? 'Checkpoint passed' : 'Not yet'}
            </h2>
            <div className={styles.body} {...guide('checkpoint.result')}>
              <p className={styles.rule}>
                {score} of {total} right
              </p>
              <p className={styles.text}>
                {passed
                  ? 'You know this chapter. Everything in it stays open to revisit, and the next chapter opens as soon as it’s ready.'
                  : `You need ${checkpoint.pass} to pass. That’s normal on a first try: here is where each idea was taught.`}
              </p>
              {missed.length > 0 && (
                <ul className={styles.canDo}>
                  {missed.map((q, i) => (
                    <Missed
                      key={q.question}
                      q={q}
                      wide={wide}
                      onReview={review}
                      target={targets[i]}
                      firstForTarget={targets.findIndex((t) => t.id === targets[i].id) === i}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.footStack}>
              <button
                type="button"
                className={`${styles.primary} ${styles.nextButton}`}
                onClick={backToPath}
                {...guide('checkpoint.done')}
              >
                Back to the path
              </button>
              {!passed && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => startCheckpoint(checkpointId)}
                  {...guide('checkpoint.retry')}
                >
                  Try again
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
