import { useEffect, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { finishSaved } from './finishSync';

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
    // After the last finish's event lands: the server then counts today's finish
    finishSaved()
      .then(() => learnApi.getHabits(accessToken))
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
