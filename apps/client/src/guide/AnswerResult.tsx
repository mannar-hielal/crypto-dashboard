/**
 * The answer to a lesson question, told once in every format (multiple choice, Choose buy or sell,
 * Drag and drop, Match boxes): "Right." or "Not quite.", then the Why (owner 2026-11-13: never
 * repeating the pick, which is already marked). Announced to screen readers as it appears.
 */

import { RichText } from '@/learn/RichText';
import styles from './QuizBoard.module.css';

export function AnswerResult({
  right,
  explain,
  className = styles.explain,
}: {
  right: boolean;
  explain: string;
  /** The surface's own text style (a tour bubble's); the lesson boards' by default */
  className?: string;
}) {
  return (
    <p className={className} role="status">
      <strong>{right ? 'Right. ' : 'Not quite. '}</strong>
      <RichText text={explain} />
    </p>
  );
}
