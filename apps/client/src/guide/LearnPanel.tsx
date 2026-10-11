/**
 * The Learn panel (owner's visual Q&A 2026-10-11: opened from "Learn" in the user menu): every tour
 * with a tick when it is done, and a way to run it again. Tours are re-runnable and never need a
 * fresh account — they use whatever balance is there. Habit badges join this panel in U9.
 */

import { Check, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { guide } from '@/lib/guideAnchors';
import { TOUR_MIN_WIDTH } from './LearnCard';
import styles from './LearnPanel.module.css';
import { useTourStore } from './tourStore';
import { TOURS } from './tours';

export function LearnPanel() {
  const navigate = useNavigate();
  const open = useTourStore((s) => s.panelOpen);
  const completed = useTourStore((s) => s.completed);
  const desktop = useMediaQuery(TOUR_MIN_WIDTH);

  if (!open) return null;

  return (
    <aside className={styles.panel} aria-label="Learn" {...guide('learn.panel')}>
      <div className={styles.head}>
        <h2 className={styles.title}>Learn</h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={() => useTourStore.getState().closePanel()}
          {...guide('learn.panel.close')}
        >
          <X size={18} />
        </button>
      </div>
      <p className={styles.intro}>
        Short guided practice on the real screen. Nothing here uses real money.
      </p>

      <h3 className={styles.sectionTitle}>Guided practice</h3>
      <ul className={styles.list}>
        {TOURS.map((tour) => {
          const done = completed[tour.id] === true;
          return (
            <li key={tour.id} className={styles.tour} {...guide('learn.tour', tour.id)}>
              <span
                className={`${styles.tick}${done ? ` ${styles.tickDone}` : ''}`}
                aria-hidden="true"
              >
                {done && <Check size={14} />}
              </span>
              <div className={styles.tourText}>
                <p className={styles.tourTitle}>{tour.title}</p>
                <p className={styles.tourMeta}>
                  {done ? 'Done · ' : ''}
                  about {tour.minutes} min · {tour.steps.length} steps
                </p>
              </div>
              <button
                type="button"
                className={styles.start}
                disabled={!desktop}
                onClick={() => {
                  navigate(tour.startUrl);
                  useTourStore.getState().closePanel();
                  useTourStore.getState().start(tour.id);
                }}
                {...guide('learn.tour.start', tour.id)}
              >
                {done ? 'Repeat' : 'Start'}
              </button>
            </li>
          );
        })}
      </ul>
      {!desktop && (
        <p className={styles.note}>Guided practice needs a larger screen (a laptop or tablet).</p>
      )}
    </aside>
  );
}
