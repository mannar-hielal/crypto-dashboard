import { tokenPayload } from '@/lib/tokenPayload';
import { useAuthStore } from '@/store/authStore';

/**
 * The signed-in account, to name what this device keeps for it (the finish queue, the habits): the
 * profile's id, or, while the profile is still loading (a restored session), the access token's own
 * `userId` (read, not verified: it only names the account's things here)
 */
export function accountOf(accessToken: string | null): string | null {
  return useAuthStore.getState().user?.id ?? accountFromToken(accessToken);
}

/** The access token's own `userId` (read, not verified), or null */
export function accountFromToken(accessToken: string | null): string | null {
  if (!accessToken) return null;
  const userId = tokenPayload(accessToken)?.userId;
  return typeof userId === 'string' && userId !== '' ? userId : null;
}
