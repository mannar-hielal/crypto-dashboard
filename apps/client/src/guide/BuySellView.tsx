/**
 * Choose buy or sell (owner's visual Q&A, 2026-11-16): under the lesson chart, the stated plan in a
 * short line, then Buy and Sell side by side, filled like the phone trade bar (`MobileTradeBar`),
 * each with an arrow and its word so colour is never the only cue. The answer follows from the plan,
 * never from guessing the price: after a pick, the chosen button gets a tick or a cross, "Right." /
 * "Not quite." and the Why are announced, and a frozen chart plays on with a caption saying the plan
 * didn't depend on what came next. The arrow keys move between the two buttons.
 */

import { AnswerResult } from './AnswerResult';
import { useRef, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { RichText } from '@/learn/RichText';
import { QUIZ_MARK_SIZE } from './quizMarks';
import type { LessonQuestion } from './lessons';
import styles from './BuySellView.module.css';

const SIDES = [
  { label: 'Buy', Icon: ArrowUp, className: styles.buy },
  { label: 'Sell', Icon: ArrowDown, className: styles.sell },
] as const;

export function BuySellView({
  q,
  answer,
  onAnswer,
  onRetry,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
  /** "Try again" after a wrong pick (owner 2026-11-17) */
  onRetry?: () => void;
}) {
  const answered = answer !== undefined;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // Left / right (and up / down) move between Buy and Sell, as in a pair of radio buttons
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    buttons.current[1 - i]?.focus();
  };

  return (
    <>
      {q.plan && (
        <p className={styles.plan}>
          <RichText text={q.plan} />
        </p>
      )}
      <p className={styles.question}>{q.question}</p>
      <div className={styles.sides} role="group" aria-label={q.question}>
        {SIDES.map(({ label, Icon, className }, i) => {
          // With Try again only the learner's own pick is marked: a wrong one never points at the
          // right side (owner 2026-11-17). Without it (one scored go) the right side is shown
          const showRight = answered && (answer === q.correct || !onRetry);
          const mark =
            showRight && i === q.correct ? 'right' : answered && i === answer ? 'wrong' : null;
          return (
            <button
              key={label}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              // Dimmed: the other side once the answer is right; after a wrong pick nothing is dimmed,
              // so the dimming never hints at the right side either
              className={`${styles.side} ${className} ${showRight && mark === null ? styles.unpicked : ''}`}
              disabled={answered}
              onClick={() => onAnswer(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              {...guide('lesson.side', label.toLowerCase())}
            >
              <Icon aria-hidden="true" size={QUIZ_MARK_SIZE} strokeWidth={2.5} />
              {label}
              {mark === 'right' && (
                <Check aria-label="right answer" size={QUIZ_MARK_SIZE} strokeWidth={3} />
              )}
              {mark === 'wrong' && (
                <X aria-label="your pick, not quite" size={QUIZ_MARK_SIZE} strokeWidth={3} />
              )}
            </button>
          );
        })}
      </div>
      {/* The Why points at the plan, not the price */}
      {answered && (
        <AnswerResult right={answer === q.correct} explain={q.explain} onRetry={onRetry} />
      )}
      {answered && (answer === q.correct || !onRetry) && q.chart?.freezeAt && (
        <p className={styles.after}>What happened next (the plan doesn&apos;t depend on it)</p>
      )}
    </>
  );
}
