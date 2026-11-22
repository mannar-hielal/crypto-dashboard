import { ArrowRight, CornerDownLeft } from 'lucide-react';

import type { Feature } from '@/lib/landingContent';
import styles from './StepFlow.module.css';

/**
 * Steps read left to right (owner 2026-11-22): four boxes in one row from 768 px, with an arrow
 * between each, and two rows of two on a phone, an arrow after the first box of each row and a
 * "carry on" bend where the first row ends. The numbers and the list order carry the sequence for a
 * screen reader; the arrows are only a picture.
 */
export function StepFlow({ items }: { items: readonly Feature[] }) {
  return (
    <ol className={styles.flow}>
      {items.map((step, i) => {
        const last = i === items.length - 1;
        return (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.text}>{step.text}</p>
            {/* Right: after every box but the last (and, on a phone, only after the first of a row) */}
            {!last && <ArrowRight className={styles.arrow} aria-hidden="true" />}
            {/* A phone's first row ends here: a bend that says "carry on below" */}
            {!last && i % 2 === 1 && <CornerDownLeft className={styles.bend} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
