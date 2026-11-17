/**
 * The foot of a Drag and drop or Match boxes board: Check until the question is answered, then
 * "Right." or "Not quite." and the Why (owner 2026-11-13: never repeating the pick). On a revisit,
 * the label that says the board shows the right answer.
 */

import { guide } from '@/lib/guideAnchors';
import { AnswerResult } from './AnswerResult';
import styles from './QuizBoard.module.css';

interface BoardFooterProps {
  /** Right or not, once checked (undefined until then) */
  right: boolean | undefined;
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
  right,
  ready,
  onCheck,
  revisit,
  revisitLabel,
  explain,
}: BoardFooterProps) {
  const answered = right !== undefined;
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
      {right !== undefined && <AnswerResult right={right} explain={explain} />}
    </>
  );
}
