/**
 * The learning map's Library tab: every knowledge-base article, always open (reference material is
 * never locked behind the path), then the habit badges. Moved from the old Learn panel unchanged.
 */

import { Check } from 'lucide-react';
import type { HabitsResponse } from '@crypto-dashboard/sdk';
import { HABIT_COPY } from '@/guide/habits';
import { useTourStore } from '@/guide/tourStore';
import { guide } from '@/lib/guideAnchors';
import { ARTICLES } from './articles';
import { useArticleStore } from './articleStore';
import styles from './PathDrawer.module.css';

interface LibraryTabProps {
  habits: HabitsResponse | null;
  habitsError: boolean;
}

export function LibraryTab({ habits, habitsError }: LibraryTabProps) {
  return (
    <div className={styles.library}>
      <h3 className={styles.sectionTitle}>Articles</h3>
      <ul className={styles.list}>
        {ARTICLES.map((article) => (
          <li key={article.id} className={styles.row} {...guide('learn.article', article.id)}>
            <div className={styles.rowText}>
              <p className={styles.rowTitle}>{article.title}</p>
              <p className={styles.rowMeta}>{article.minutes} min read</p>
            </div>
            <button
              type="button"
              className={styles.rowAction}
              onClick={() => {
                useTourStore.getState().closePanel();
                useArticleStore.getState().open(article.id);
              }}
              {...guide('learn.article.open', article.id)}
            >
              Read
            </button>
          </li>
        ))}
      </ul>

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
