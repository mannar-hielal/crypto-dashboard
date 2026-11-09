/**
 * The welcome card: offered once, on a dashboard where the account has not finished Lesson 1 (or
 * the primer) and has not dismissed it. Start opens Lesson 1 on any screen size — its cards work
 * on phones; only its "try it" part needs a larger screen (owner, 2026-10-22). Dismissal is saved
 * on the account.
 */

import { X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import styles from './LearnCard.module.css';
import { useLessonStore } from './lessonStore';
import { useTourStore } from './tourStore';

/** Tours need the order form docked beside the chart: lg and up (design.md, responsive layout) */
export const TOUR_MIN_WIDTH = '(min-width: 1024px)';

export function LearnCard() {
  const loaded = useTourStore((s) => s.loaded);
  const dismissed = useTourStore((s) => s.cardDismissed);
  const touring = useTourStore((s) => s.activeId !== null);
  const learning = useLessonStore((s) => s.activeId !== null);

  if (!loaded || dismissed || touring || learning) return null;

  const start = () => {
    useTourStore.getState().dismissCard();
    useLessonStore.getState().start('lesson-01');
  };
  const dismiss = () => useTourStore.getState().dismissCard();

  return (
    <aside className={styles.card} aria-label="Welcome" {...guide('learn.card')}>
      <div className={styles.head}>
        <h2 className={styles.title}>New to crypto?</h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Dismiss"
          onClick={dismiss}
          {...guide('learn.card.dismiss')}
        >
          <X size={16} />
        </button>
      </div>
      <p className={styles.text}>
        Start with a 4-minute lesson: what Bitcoin is, and why money needs a record keeper. No real
        money.
      </p>
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.primary}
          onClick={start}
          {...guide('learn.card.start')}
        >
          Start
        </button>
        <button type="button" className={styles.link} onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
