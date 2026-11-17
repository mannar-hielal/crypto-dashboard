import { useEffect, useState } from 'react';
import { learnApi, type HabitsResponse } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { accountOf } from './account';
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
  // The profile's id, or the token's own user while the profile loads: one read, not two
  const profileId = useAuthStore((s) => s.user?.id ?? null);
  const account = profileId ?? accountOf(accessToken);
  const [read, setRead] = useState<{
    account: string | null;
    habits: HabitsResponse | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // After the last finish's event lands: the server then counts today's finish
    finishSaved(account)
      .then(() => learnApi.getHabits(accessToken))
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
  }, [accessToken, account, refresh]);

  const mine = accessToken && read && read.account === account ? read : null;
  return { habits: mine?.habits ?? null, failed: mine?.failed ?? false };
}
