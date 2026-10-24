/**
 * The Learn panel (owner's visual Q&A 2026-10-11: opened from "Learn" in the user menu): the lessons,
 * then every tour, each with a tick when it is done and a way to run it again, then the library of
 * knowledge-base articles (2026-10-23), which open in the drawer. Tours are re-runnable
 * and never need a fresh account — they use whatever balance is there. Lessons open on any screen
 * size; tours need a larger one. Habit badges sit at the bottom.
 */

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { learnApi } from '@crypto-dashboard/sdk';
import type { HabitsResponse } from '@crypto-dashboard/sdk';
import { useNavigate } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { guide } from '@/lib/guideAnchors';
import { ARTICLES } from '@/learn/articles';
import { useArticleStore } from '@/learn/articleStore';
import { useAuthStore } from '@/store/authStore';
import { HABIT_COPY } from './habits';
import { TOUR_MIN_WIDTH } from './LearnCard';
import styles from './LearnPanel.module.css';
import { useLessonStore } from './lessonStore';
import { LESSONS } from './lessons';
import { useTourStore } from './tourStore';
import { TOURS } from './tours';

export function LearnPanel() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const open = useTourStore((s) => s.panelOpen);
  const completed = useTourStore((s) => s.completed);
  const lessonsDone = useLessonStore((s) => s.completed);
  const desktop = useMediaQuery(TOUR_MIN_WIDTH);
  const [habits, setHabits] = useState<HabitsResponse | null>(null);
  const [habitsError, setHabitsError] = useState(false);

  // Habits are counted on the server from what the account already has; read whenever the panel
  // opens (and again when a tour was just finished, so a new badge shows)
  const finishedCount = Object.keys(completed).length + Object.keys(lessonsDone).length;
  useEffect(() => {
    if (!open || !accessToken) return;
    let cancelled = false;
    learnApi
      .getHabits(accessToken)
      .then((r) => {
        if (cancelled) return;
        setHabits(r);
        setHabitsError(false);
      })
      .catch(() => {
        if (!cancelled) setHabitsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accessToken, finishedCount]);

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

      <h3 className={styles.sectionTitle}>Lessons</h3>
      <ul className={styles.list}>
        {LESSONS.map((lesson) => {
          const done = lessonsDone[lesson.id] === true;
          return (
            <li key={lesson.id} className={styles.tour} {...guide('learn.lesson', lesson.id)}>
              <span
                className={`${styles.tick}${done ? ` ${styles.tickDone}` : ''}`}
                aria-hidden="true"
              >
                {done && <Check size={14} />}
              </span>
              <div className={styles.tourText}>
                <p className={styles.tourTitle}>
                  {lesson.number}. {lesson.title}
                </p>
                <p className={styles.tourMeta}>
                  {done ? 'Done · ' : ''}
                  about {lesson.minutes} min
                </p>
              </div>
              <button
                type="button"
                className={styles.start}
                onClick={() => {
                  useTourStore.getState().closePanel();
                  useLessonStore.getState().start(lesson.id);
                }}
                {...guide('learn.lesson.start', lesson.id)}
              >
                {done ? 'Repeat' : 'Start'}
              </button>
            </li>
          );
        })}
      </ul>

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

      <h3 className={styles.sectionTitle}>Library</h3>
      <ul className={styles.list}>
        {ARTICLES.map((article) => (
          <li key={article.id} className={styles.tour} {...guide('learn.article', article.id)}>
            <div className={styles.tourText}>
              <p className={styles.tourTitle}>{article.title}</p>
              <p className={styles.tourMeta}>{article.minutes} min read</p>
            </div>
            <button
              type="button"
              className={styles.start}
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
        <p className={styles.note} {...guide('learn.habits.error')}>
          Could not load your habits right now.
        </p>
      )}
      {habits && (
        <>
          <p className={styles.tourMeta} {...guide('learn.streak')}>
            {habits.streakDays > 0
              ? `${habits.streakDays}-day learning streak`
              : 'No learning streak yet'}
            {' · '}
            {habits.learningDays} learning {habits.learningDays === 1 ? 'day' : 'days'}
          </p>
          <ul className={styles.list}>
            {habits.badges.map((b) => (
              <li key={b.id} className={styles.tour} {...guide('learn.habit', b.id)}>
                <span
                  className={`${styles.tick}${b.earned ? ` ${styles.tickDone}` : ''}`}
                  aria-hidden="true"
                >
                  {b.earned && <Check size={14} />}
                </span>
                <div className={styles.tourText}>
                  <p className={styles.tourTitle}>{HABIT_COPY[b.id].title}</p>
                  <p className={styles.tourMeta}>
                    {HABIT_COPY[b.id].text}
                    {b.earned ? '' : ` · ${b.progress} / ${b.target}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            Habits are about how carefully you trade and learn — never about profit or how often you
            trade.
          </p>
        </>
      )}
    </aside>
  );
}
