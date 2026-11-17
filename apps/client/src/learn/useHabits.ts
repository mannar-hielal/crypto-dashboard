import { useEffect, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { accountFor } from './account';
import { onePerKey } from '@/lib/onePerKey';
import { usePathStore } from './pathStore';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';

/**
 * One habits read per account and done count at a time. Every reader keys its read on the same
 * count (lessons, tours and checkpoints done, from the stores), so the map and the streak screen
 * opening together share one request; a finish changes the count, so a read after it is never
 * answered by one sent before it
 */
const reading = new Map<string, Promise<HabitsResponse>>();
function readHabits(key: string, token: string): Promise<HabitsResponse> {
  return onePerKey(reading, key, () => learnApi.getHabits(token));
}

/**
 * How much this account has done: what the habits count from, so a new finish reads again. Null
 * until the account's progress is in: its arrival moves the count without a finish, so no reader
 * reads before it (and again right after)
 */
function useDoneCount(): number | null {
  const lessons = useLessonStore((st) => Object.keys(st.completed).length);
  const tours = useTourStore((st) => Object.keys(st.completed).length);
  const checkpoints = usePathStore((st) => Object.keys(st.checkpoints).length);
  const progressIn = useTourStore((st) => st.loaded);
  return progressIn ? lessons + tours + checkpoints : null;
}

/**
 * The account's habits (badges, the learning streak, this week's days), counted on the server.
 * `accessToken` null: nothing is read. Read again after a finish (the done count changes); the last
 * answer stays shown meanwhile, and `failed` says the latest read didn't arrive.
 */
export function useHabits(accessToken: string | null): {
  habits: HabitsResponse | null;
  failed: boolean;
} {
  // Whose answer it is, by account (a session refresh changes the token, not the account): another
  // account's (a sign-out, then a sign-in) is never shown
  // The account: the profile's id, or the token's own user while the profile loads
  const profileId = useAuthStore((s) => s.user?.id ?? null);
  const account = accountFor(profileId, accessToken);
  const [read, setRead] = useState<{
    account: string | null;
    habits: HabitsResponse | null;
    failed: boolean;
  } | null>(null);

  const signedIn = !!accessToken;
  const done = useDoneCount();

  useEffect(() => {
    // (an account always has a name here: every token the server signs carries its userId, so
    // the '' fallback below never joins two sessions; weighed, review after release #302)
    if (!signedIn || done === null) return;
    let cancelled = false;
    // Read at once, never waiting for a finish to land: a lesson's own start already counted today
    // (Habits counts starts), so the streak screen right after a finish shows today. Only a run
    // begun before midnight and finished after it shows its new day on the next read, as does one
    // begun signed out (no start was stored) (weighed, review round 30 and after release #302: the
    // wait that covered it cost a 4 s hold on every read and kept failing)
    // Keyed by the token too, and read again with each new one (a session refresh, about every 15
    // minutes, only while the map or the streak screen is open): a read never joins one sent with an
    // older token, and an expired token's failure always recovers with the next (review after
    // release #302: a retry kept only for failures raced the refresh, twice)
    if (!accessToken) return;
    readHabits(`${account ?? ''}|${done}|${accessToken}`, accessToken)
      .then((r) => {
        if (!cancelled) setRead({ account, habits: r, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        // The last answer stays shown, for this account only
        setRead((prev) => ({
          account,
          habits: prev?.account === account ? prev.habits : null,
          failed: true,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, account, done, accessToken]);

  const mine = accessToken && read && read.account === account ? read : null;
  return { habits: mine?.habits ?? null, failed: mine?.failed ?? false };
}
