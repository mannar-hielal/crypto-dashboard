import { useEffect, useRef, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { accountFromToken } from './account';
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
  // Whose answer it is, by account (a session refresh changes the token, not the account): another
  // account's (a sign-out, then a sign-in) is never shown
  // The account: the profile's id, or the token's own user while the profile loads
  const profileId = useAuthStore((s) => s.user?.id ?? null);
  const account = profileId ?? accountFromToken(accessToken);
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
    // After the last finish's event lands: the server then counts today's finish
    finishSaved(account)
      // (a run cancelled while it waited sends nothing)
      .then(async (counted) => {
        const now = token.current;
        if (cancelled || !now) return null;
        const read = await learnApi.getHabits(now);
        // The finish didn't land (failed, or still slow): the count is right only if today was
        // already counted (the lesson's own start counts it); else it would miss today, a failed read
        if (!counted && !read.thisWeek?.[(new Date().getDay() + 6) % 7]) {
          throw new Error('Today is not counted yet');
        }
        return read;
      })
      .then((r) => {
        if (!cancelled && r) setRead({ account, habits: r, failed: false });
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
