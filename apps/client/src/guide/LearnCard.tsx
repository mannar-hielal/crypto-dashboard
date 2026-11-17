/**
 * The welcome card: offered once, on a dashboard where the account has not finished Lesson 1 (or
 * the primer) and has not dismissed it. Start opens Lesson 1 on any screen size — its cards work
 * on phones, its practice trades and "try it" too (owner, 2026-11-16). Dismissal is saved
 * on the account.
 */

import { X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import styles from './LearnCard.module.css';
import { getLesson } from './lessons';
import { useLessonStore } from './lessonStore';
import { useTourStore } from './tourStore';

export function LearnCard() {
  const loaded = useTourStore((s) => s.loaded);
  const dismissed = useTourStore((s) => s.cardDismissed);
  const touring = useTourStore((s) => s.activeId !== null);
  const learning = useLessonStore((s) => s.activeId !== null);
  // Lesson 1 finished is the offer done with, at once (the progress read says so only later)
  const lessonOneDone = useLessonStore((s) => !!s.completed['lesson-01']);

  if (!loaded || dismissed || touring || learning || lessonOneDone) return null;

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
        Start with a {getLesson('lesson-01').minutes}-minute lesson: how you can win when a price
        goes up or down, and your first practice trade. No real money.
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
