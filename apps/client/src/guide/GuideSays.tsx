/**
 * A guide in glasses, talking in a bubble (owner 2026-11-17): the nerdy look for the math and for an
 * analogy that explains a harder idea. Either guide may wear them, per card. `MathBreakdownView`
 * puts "Let's do the math" in the bubble, then the numbered steps (one operation each, its result
 * beside it) and the answer, set apart.
 */

import type { ReactNode } from 'react';
import { guide } from '@/lib/guideAnchors';
import { RichText } from '@/learn/RichText';
import { GuideFigure } from './art/Guide';
import { GUIDE_NAMES, type MathBreakdown, type Mood, type Speaker } from './lessons';
import styles from './GuideSays.module.css';

/** What the guide says before the steps */
export const MATH_INTRO = 'Let’s do the math.';

export function GuideSays({
  who,
  mood = 'smile',
  children,
}: {
  who: Speaker;
  mood?: Mood;
  children: ReactNode;
}) {
  return (
    <div className={styles.says}>
      <GuideFigure who={who} mood={mood} glasses className={styles.figure} />
      <p className={styles.bubble}>
        <strong className={styles.speaker}>{GUIDE_NAMES[who]}</strong> {children}
      </p>
    </div>
  );
}

export function MathBreakdownView({ math }: { math: MathBreakdown }) {
  return (
    <section className={styles.math} aria-label="The math, step by step" {...guide('lesson.math')}>
      <GuideSays who={math.who}>{MATH_INTRO}</GuideSays>
      <ol className={styles.steps}>
        {math.steps.map((step, i) => (
          <li key={step.label} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}.
            </span>
            <span className={styles.label}>{step.label}</span>
            <span className={styles.sum}>{step.sum}</span>
          </li>
        ))}
      </ol>
      <p className={styles.answer} {...guide('lesson.math.answer')}>
        <span aria-hidden="true">➜ </span>
        <RichText text={math.answer} />
      </p>
    </section>
  );
}
