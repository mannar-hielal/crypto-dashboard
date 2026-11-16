/**
 * The foot of a Drag and drop or Match boxes board: Check until the question is answered, then
 * "Right." or "Not quite." and the Why (owner 2026-11-13: never repeating the pick). On a revisit,
 * the label that says the board shows the right answer.
 */

import { guide } from '@/lib/guideAnchors';
import styles from './QuizBoard.module.css';

interface BoardFooterProps {
  /** 0 right, 1 not quite; undefined until checked */
  answer: number | undefined;
  /** Every slot or term is filled: Check can grade */
  ready: boolean;
  onCheck: () => void;
  /** Answered on an earlier visit: the board shows the right answer, unmarked */
  revisit: boolean;
  /** What the revisited board shows ("The right order:") */
  revisitLabel: string;
  explain: string;
}

export function BoardFooter({
  answer,
  ready,
  onCheck,
  revisit,
  revisitLabel,
  explain,
}: BoardFooterProps) {
  const answered = answer !== undefined;
  return (
    <>
      {!answered && (
        <button
          type="button"
          className={styles.check}
          disabled={!ready}
          onClick={onCheck}
          {...guide('lesson.check')}
        >
          Check
        </button>
      )}
      {revisit && <p className={styles.explain}>{revisitLabel}</p>}
      {answered && (
        <p className={styles.explain} role="status">
          <strong>{answer === 0 ? 'Right. ' : 'Not quite. '}</strong>
          {explain}
        </p>
      )}
    </>
  );
}
