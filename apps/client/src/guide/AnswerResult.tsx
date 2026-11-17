/**
 * The answer to a lesson question, told once in every format (multiple choice, Choose buy or sell,
 * Drag and drop, Match boxes): "Right." or "Not quite.", then the Why (owner 2026-11-13: never
 * repeating the pick, which is already marked). Announced to screen readers as it appears.
 */

import styles from './QuizBoard.module.css';

export function AnswerResult({ right, explain }: { right: boolean; explain: string }) {
  return (
    <p className={styles.explain} role="status">
      <strong>{right ? 'Right. ' : 'Not quite. '}</strong>
      {explain}
    </p>
  );
}
