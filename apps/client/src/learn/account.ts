import { useAuthStore } from '@/store/authStore';

/**
 * The signed-in account, to name what this device keeps for it (the finish queue, the habits): the
 * profile's id, or, while the profile is still loading (a restored session), the access token's own
 * `userId` (read, not verified: it only names the account's things here)
 */
export function accountOf(accessToken: string | null): string | null {
  const id = useAuthStore.getState().user?.id;
  if (id) return id;
  if (!accessToken) return null;
  try {
    const part = accessToken.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const userId = (payload as { userId?: unknown } | null)?.userId;
    return typeof userId === 'string' && userId !== '' ? userId : null;
  } catch {
    return null;
  }
}
