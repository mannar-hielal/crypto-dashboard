/**
 * The learning map's Habits tab: the habit badges. It was the Library tab, whose articles moved to
 * the public Blog (owner 2026-11-18), leaving the habits here.
 */

import { Check } from 'lucide-react';
import type { HabitsResponse } from '@crypto-dashboard/sdk';
import { HABIT_COPY } from '@/guide/habits';
import { guide } from '@/lib/guideAnchors';
import styles from './PathDrawer.module.css';

interface HabitsTabProps {
  habits: HabitsResponse | null;
  habitsError: boolean;
}

export function HabitsTab({ habits, habitsError }: HabitsTabProps) {
  return (
    <div>
      <h3 className={styles.sectionTitle}>Your habits</h3>
      {habitsError && (
        <p className={styles.hint} {...guide('learn.habits.error')}>
          Could not load your habits right now.
        </p>
      )}
      {habits && (
        <>
          <p className={styles.rowMeta}>
            {habits.learningDays} learning {habits.learningDays === 1 ? 'day' : 'days'}
          </p>
          <ul className={styles.list}>
            {habits.badges.map((b) => (
              <li key={b.id} className={styles.row} {...guide('learn.habit', b.id)}>
                <span
                  className={`${styles.tick}${b.earned ? ` ${styles.tickDone}` : ''}`}
                  aria-hidden="true"
                >
                  {b.earned && <Check size={14} />}
                </span>
                <div className={styles.rowText}>
                  <p className={styles.rowTitle}>{HABIT_COPY[b.id].title}</p>
                  <p className={styles.rowMeta}>
                    {HABIT_COPY[b.id].text}
                    {b.earned ? '' : ` · ${b.progress} / ${b.target}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>
            Habits are about how carefully you trade and learn — never about profit or how often you
            trade.
          </p>
        </>
      )}
    </div>
  );
}
