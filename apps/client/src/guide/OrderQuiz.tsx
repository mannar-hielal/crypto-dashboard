/**
 * Drag and drop (owner's visual Q&A, 2026-11-16): numbered empty slots on top, the steps below in a
 * fixed shuffle. Drag a step into a slot, or tap a step then tap a slot (keyboard: Tab to a step,
 * Enter to pick it, Tab to a slot, Enter to place it). Tapping a filled slot sends its step back.
 * "Check" grades once every slot is filled: each slot gets ✓ or ✕, then "Right." / "Not quite." and
 * the Why; after a "Not quite.", "Try again" empties the slots for another go (owner 2026-11-17).
 * Coming back to a rightly answered question shows the right order.
 */

import { useMemo, useState, type DragEvent } from 'react';
import { Check, X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { QUIZ_MARK_SIZE } from './quizMarks';
import { shuffledOrder, type LessonQuestion } from './lessons';
import { BoardFooter } from './BoardFooter';
import styles from './QuizBoard.module.css';

const DRAG_TYPE = 'text/x-lesson-step';

export function OrderQuiz({
  q,
  answer,
  onAnswer,
  onRetry,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
  /** "Try again" after a wrong check (owner 2026-11-17): the slots are emptied, then the answer */
  onRetry?: () => void;
}) {
  const steps = useMemo(() => q.steps ?? [], [q.steps]);
  const answered = answer !== undefined;
  const pool = useMemo(() => shuffledOrder(steps.length, q.question), [steps.length, q.question]);
  // (Component state: a remount while a wrong answer is kept, an article opened over the sheet,
  // shows the board empty under "Not quite." until Try again resets it. Weighed, review after #311;
  // MatchQuiz's pairs alike)
  const [slots, setSlots] = useState<(number | null)[]>(() => steps.map(() => null));
  const [picked, setPicked] = useState<number | null>(null);
  // Answered on an earlier visit: no placements in memory, so the right order is shown, unmarked
  // Coming back to a right answer only: a wrong one (kept until Try again) never shows the order
  const revisit = answered && answer === q.correct && slots.some((x) => x === null);
  const shown = revisit ? steps.map((_, i) => i) : slots;
  const placed = new Set(shown.filter((x): x is number => x !== null));

  const place = (slot: number, step: number) => {
    setSlots((cur) => cur.map((x, i) => (i === slot ? step : x === step ? null : x)));
    setPicked(null);
  };
  const onSlot = (slot: number) => {
    if (answered) return;
    if (picked !== null) place(slot, picked);
    else if (slots[slot] !== null) setSlots((cur) => cur.map((x, i) => (i === slot ? null : x)));
  };
  const onDrop = (e: DragEvent, slot: number) => {
    e.preventDefault();
    // Only one of this board's steps (a dropped text or image carries no step)
    const data = e.dataTransfer.getData(DRAG_TYPE);
    const step = Number(data);
    if (!answered && data !== '' && Number.isInteger(step) && step >= 0 && step < steps.length) {
      place(slot, step);
    }
  };
  // Right: the question's own correct answer; not quite: -1 (no option), judged like any question
  const check = () => onAnswer(slots.every((x, i) => x === i) ? q.correct : -1);

  return (
    <>
      <p className={styles.question}>{q.question}</p>
      <ol className={styles.slots}>
        {shown.map((step, slot) => {
          const mark =
            answered && !revisit && step !== null ? (step === slot ? 'right' : 'wrong') : null;
          return (
            // Keyed by the step that belongs in the slot: unique in a question (lessons test)
            <li key={steps[slot]}>
              <button
                type="button"
                className={`${styles.slot} ${step === null ? styles.empty : ''} ${
                  mark ? styles[mark] : ''
                }`}
                disabled={answered}
                onClick={() => onSlot(slot)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, slot)}
                aria-label={`Slot ${slot + 1}: ${step === null ? 'empty' : steps[step]}${
                  mark === 'right' ? ', right' : mark === 'wrong' ? ', not quite' : ''
                }`}
                {...guide('lesson.slot', String(slot))}
              >
                <span className={styles.number} aria-hidden="true">
                  {slot + 1}
                </span>
                <span className={styles.slotText} aria-hidden="true">
                  {step === null
                    ? picked !== null
                      ? 'Place it here'
                      : 'Tap a step, then here'
                    : steps[step]}
                </span>
                {mark === 'right' && (
                  <Check aria-hidden="true" size={QUIZ_MARK_SIZE} strokeWidth={3} />
                )}
                {mark === 'wrong' && <X aria-hidden="true" size={QUIZ_MARK_SIZE} strokeWidth={3} />}
              </button>
            </li>
          );
        })}
      </ol>
      {!answered && (
        <div className={styles.pool}>
          {pool
            .filter((step) => !placed.has(step))
            .map((step) => (
              <button
                key={steps[step]}
                type="button"
                draggable
                className={`${styles.card} ${picked === step ? styles.picked : ''}`}
                aria-pressed={picked === step}
                onClick={() => setPicked(picked === step ? null : step)}
                onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, String(step))}
                {...guide('lesson.step', String(step))}
              >
                {steps[step]}
              </button>
            ))}
        </div>
      )}
      <BoardFooter
        right={answer === undefined ? undefined : answer === q.correct}
        ready={slots.every((x) => x !== null)}
        onCheck={check}
        revisit={revisit}
        revisitLabel="The right order:"
        explain={q.explain}
        onRetry={
          onRetry &&
          (() => {
            setSlots(steps.map(() => null));
            setPicked(null);
            onRetry();
          })
        }
      />
    </>
  );
}
