import { tokenPayload } from '@/lib/tokenPayload';
import { useAuthStore } from '@/store/authStore';

/**
 * The signed-in account, to name what this device keeps for it (the finish queue, the habits): the
 * profile's id, or, while the profile is still loading (a restored session), the access token's own
 * `userId` (read, not verified: it only names the account's things here)
 */
export function accountOf(accessToken: string | null): string | null {
  return accountFor(useAuthStore.getState().user?.id ?? null, accessToken);
}

/**
 * The rule itself, for a hook that watches the profile's id: that id, else the token's own user.
 * (Three names for three callers, weighed in review round 33: a store reader (`accountOf`), a hook
 * that subscribes to the profile id (this), and the token alone (`accountFromToken`)
 */
export function accountFor(profileId: string | null, accessToken: string | null): string | null {
  return profileId ?? accountFromToken(accessToken);
}

/** The access token's own `userId` (read, not verified), or null */
export function accountFromToken(accessToken: string | null): string | null {
  if (!accessToken) return null;
  const userId = tokenPayload(accessToken)?.userId;
  return typeof userId === 'string' && userId !== '' ? userId : null;
}
