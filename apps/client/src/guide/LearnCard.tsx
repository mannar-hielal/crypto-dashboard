/**
 * The welcome card: offered once, on a dashboard where the account has not finished the primer and
 * has not dismissed it. Phones get the same card without Start — the tours are desktop-first
 * (owner, 2026-10-11). Dismissal is saved on the account.
 */

import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { guide } from '@/lib/guideAnchors';
import styles from './LearnCard.module.css';
import { useTourStore } from './tourStore';
import { getTour } from './tours';

/** Tours need the order form docked beside the chart: lg and up (design.md, responsive layout) */
export const TOUR_MIN_WIDTH = '(min-width: 1024px)';

export function LearnCard() {
  const navigate = useNavigate();
  const desktop = useMediaQuery(TOUR_MIN_WIDTH);
  const loaded = useTourStore((s) => s.loaded);
  const dismissed = useTourStore((s) => s.cardDismissed);
  const running = useTourStore((s) => s.activeId !== null);

  if (!loaded || dismissed || running) return null;

  const start = () => {
    const tour = getTour('primer');
    useTourStore.getState().dismissCard();
    navigate(tour.startUrl);
    useTourStore.getState().start('primer');
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
        {desktop
          ? 'Make your first practice trade in about 3 minutes. No real money, no sign-up to anything.'
          : 'The guided practice trade works best on a larger screen. Open this page on a laptop or tablet to try it.'}
      </p>
      <div className={styles.foot}>
        {desktop && (
          <button
            type="button"
            className={styles.primary}
            onClick={start}
            {...guide('learn.card.start')}
          >
            Start
          </button>
        )}
        <button type="button" className={styles.link} onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
