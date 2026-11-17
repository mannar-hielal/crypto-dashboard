import { useEffect, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';

/**
 * The account's habits (badges, the learning streak, this week's days), counted on the server.
 * `accessToken` null: nothing is read. Read again when `refresh` changes (a new finish); the last
 * answer stays shown meanwhile, and `failed` says the latest read didn't arrive.
 */
export function useHabits(
  accessToken: string | null,
  refresh: unknown = null
): { habits: HabitsResponse | null; failed: boolean } {
  const [habits, setHabits] = useState<HabitsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    learnApi
      .getHabits(accessToken)
      .then((r) => {
        if (cancelled) return;
        setHabits(r);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refresh]);

  return { habits, failed };
}

/**
 * The habits with today counted as a learning day (it ends a finish): today's dot lit, and a streak
 * that didn't count today yet one day longer. Monday first, in the learner's time zone, as the
 * server counts them; an API with no week (rolled back) is left as it is
 */
export function withTodayLearned(habits: HabitsResponse, now: Date): HabitsResponse {
  const today = (now.getDay() + 6) % 7;
  if (!habits.thisWeek || habits.thisWeek[today]) return habits;
  return {
    ...habits,
    learningDays: habits.learningDays + 1,
    streakDays: habits.streakDays + 1,
    thisWeek: habits.thisWeek.map((d, i) => d || i === today),
  };
}
