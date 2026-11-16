/**
 * The streak screen, after a lesson's close (owner's visual Q&A, 2026-11-16): a flame with today's
 * learning streak counting up ("3-day streak"), this week's seven days as dots (learning days filled
 * amber, Monday first, as the server counts them), one line, and Continue, which then does what the
 * close's button was pressed for. Reduced motion shows the number straight away. The numbers come
 * from the server's habits (`GET /api/learn/habits`), the same ones the Learn panel's counter shows;
 * if they can't load, the screen says so and Continue still goes on.
 */

import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { guide } from '@/lib/guideAnchors';
import styles from './StreakView.module.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COUNT_UP_S = 0.8;

export function StreakView({
  accessToken,
  onContinue,
}: {
  accessToken: string;
  onContinue: () => void;
}) {
  const reduced = useReducedMotion();
  const [habits, setHabits] = useState<HabitsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    learnApi
      .getHabits(accessToken)
      .then((r) => {
        if (!cancelled) setHabits(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Count up to the streak; with reduced motion the number is shown as it is
  const streak = habits?.streakDays ?? 0;
  useEffect(() => {
    if (!habits || reduced) return;
    const controls = animate(0, streak, {
      duration: COUNT_UP_S,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [habits, streak, reduced]);
  const display = reduced ? streak : shown;

  return (
    <div className={styles.streak} {...guide('lesson.streak')}>
      <Flame className={styles.flame} aria-hidden="true" size={56} strokeWidth={1.75} />
      {habits ? (
        <>
          {/* Screen readers get the final number, not each step of the count-up */}
          <p className={styles.count} aria-hidden="true">
            {display}-day streak
          </p>
          <p className={styles.srOnly}>{streak}-day learning streak</p>
          <ol className={styles.week} aria-label="This week">
            {DAYS.map((d, i) => (
              <li key={d} className={styles.day}>
                <span
                  className={`${styles.dot} ${habits.thisWeek?.[i] ? styles.done : ''}`}
                  aria-hidden="true"
                />
                <span className={styles.dayName}>
                  <span aria-hidden="true">{d[0]}</span>
                  <span className={styles.srOnly}>
                    {d}: {habits.thisWeek?.[i] ? 'learned' : 'not yet'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.line}>Come back tomorrow to keep it going.</p>
        </>
      ) : failed ? (
        <p className={styles.line} role="status">
          Your streak couldn’t load just now. Today still counts.
        </p>
      ) : (
        <p className={styles.line}>Counting your days…</p>
      )}
      <button
        type="button"
        className={styles.continue}
        onClick={onContinue}
        {...guide('lesson.streak.continue')}
      >
        Continue
      </button>
    </div>
  );
}
