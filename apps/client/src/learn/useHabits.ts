import { useEffect, useRef, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { accountFor } from './account';

/**
 * One habits read per account at a time: the map (refreshing on a finish) and the streak screen
 * opening with it share the request on its way. A reader asking because of a new finish (`fresh`)
 * joins only a read sent in the same render's effects; an older one may predate the finish, so it
 * sends its own
 */
let tick = 0;
let tickScheduled = false;
function currentTick(): number {
  if (!tickScheduled) {
    tickScheduled = true;
    queueMicrotask(() => {
      tick += 1;
      tickScheduled = false;
    });
  }
  return tick;
}
const reading = new Map<string, { read: Promise<HabitsResponse>; tick: number }>();
function readHabits(
  account: string | null,
  token: string,
  fresh: boolean
): Promise<HabitsResponse> {
  const key = account ?? '';
  const now = currentTick();
  const onTheWay = reading.get(key);
  if (onTheWay && (!fresh || onTheWay.tick === now)) return onTheWay.read;
  const read = learnApi.getHabits(token).finally(() => {
    if (reading.get(key)?.read === read) reading.delete(key);
  });
  reading.set(key, { read, tick: now });
  return read;
}

/**
 * The account's habits (badges, the learning streak, this week's days), counted on the server.
 * `accessToken` null: nothing is read. Read again when `refresh` changes (a new finish); the last
 * answer stays shown meanwhile, and `failed` says the latest read didn't arrive.
 */
export function useHabits(
  accessToken: string | null,
  refresh: unknown = null,
  /** Opened because of a finish (the streak screen): its first read is fresh too */
  afterFinish = false
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
  // The refresh the last read was asked for: a change means a finish since
  const lastRefresh = useRef<{ value: unknown } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    // Read at once, never waiting for a finish to land: a lesson's own start already counted today
    // (Habits counts starts), so the streak screen right after a finish shows today. Only a run
    // begun before midnight and finished after it shows its new day on the next read (weighed,
    // review round 30: the wait that covered it cost a 4 s hold on every read and kept failing)
    const now = token.current;
    if (!now) return;
    const fresh =
      lastRefresh.current === null ? afterFinish : lastRefresh.current.value !== refresh;
    lastRefresh.current = { value: refresh };
    readHabits(account, now, fresh)
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
  }, [signedIn, account, refresh, afterFinish]);

  const mine = accessToken && read && read.account === account ? read : null;
  return { habits: mine?.habits ?? null, failed: mine?.failed ?? false };
}
