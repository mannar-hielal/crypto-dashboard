import { useEffect, useRef, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { accountFor } from './account';

/**
 * The account's habits (badges, the learning streak, this week's days), counted on the server.
 * `accessToken` null: nothing is read. Read again when `refresh` changes (a new finish); the last
 * answer stays shown meanwhile, and `failed` says the latest read didn't arrive.
 */
/**
 * One habits read per account at a time: the map (refreshing on a finish) and the streak screen
 * opening with it share the request on its way instead of sending two
 */
const reading = new Map<string | null, Promise<HabitsResponse>>();
function readHabits(account: string | null, token: string): Promise<HabitsResponse> {
  const onTheWay = reading.get(account);
  if (onTheWay) return onTheWay;
  const read = learnApi.getHabits(token).finally(() => reading.delete(account));
  reading.set(account, read);
  return read;
}

export function useHabits(
  accessToken: string | null,
  refresh: unknown = null
): { habits: HabitsResponse | null; failed: boolean } {
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

  // The token at the moment of the read: a rotation (the same account) reads nothing again
  const token = useRef(accessToken);
  useEffect(() => {
    token.current = accessToken;
  }, [accessToken]);
  const signedIn = !!accessToken;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    // Read at once, never waiting for a finish to land: a lesson's own start already counted today
    // (Habits counts starts), so the streak screen right after a finish shows today. Only a run
    // begun before midnight and finished after it shows its new day on the next read (weighed,
    // review round 30: the wait that covered it cost a 4 s hold on every read and kept failing)
    const now = token.current;
    if (!now) return;
    readHabits(account, now)
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
  }, [signedIn, account, refresh]);

  const mine = accessToken && read && read.account === account ? read : null;
  return { habits: mine?.habits ?? null, failed: mine?.failed ?? false };
}
