/**
 * The answer to a lesson question, told once in every format (multiple choice, Choose buy or sell,
 * Drag and drop, Match boxes): "Right." or "Not quite.", then the Why (owner 2026-11-13: never
 * repeating the pick, which is already marked). Announced to screen readers as it appears. After a
 * "Not quite.", a lesson offers "Try again" (owner 2026-11-17): the board starts afresh, and the
 * lesson goes on only once the answer is right.
 */

import { guide } from '@/lib/guideAnchors';
import { RichText } from '@/learn/RichText';
import styles from './QuizBoard.module.css';

export function AnswerResult({
  right,
  explain,
  className = styles.explain,
  onRetry,
}: {
  right: boolean;
  explain: string;
  /** The surface's own text style (a tour bubble's); the lesson boards' by default */
  className?: string;
  /** Offered after a wrong answer: clears it for another go (a lesson's questions; not a checkpoint) */
  onRetry?: () => void;
}) {
  return (
    <>
      <p className={className} role="status">
        <strong>{right ? 'Right. ' : 'Not quite. '}</strong>
        <RichText text={explain} />
      </p>
      {!right && onRetry && (
        <button type="button" className={styles.check} onClick={onRetry} {...guide('lesson.retry')}>
          Try again
        </button>
      )}
    </>
  );
}
