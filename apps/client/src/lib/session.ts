/**
 * Access-token lifetime helpers.
 *
 * The access token is short-lived (15 min) and lives only in memory (authStore). Before BP-1
 * it was only refreshed on app boot, so authenticated calls silently failed after 15 minutes;
 * with trading executed on the server that would stop a user from trading. These helpers keep
 * the in-memory token fresh using the httpOnly refresh cookie.
 */

import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';

let inflight: Promise<string | null> | null = null;

/**
 * Single-flight refresh: concurrent callers share one POST /api/auth/refresh (the server
 * rotates the refresh token, so parallel refreshes would race). Returns the new access token,
 * or null if it failed — after a 401 / 403 the user is signed out; after a transient failure
 * they stay signed in and the caller retries.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!inflight) {
    inflight = authApi
      .refresh()
      .then((res) => {
        const { user, setAuth, clearAuth } = useAuthStore.getState();
        if (!res) {
          // No refresh cookie any more (expired, or cleared by a logout elsewhere): the
          // session is gone, same as a 401.
          clearAuth();
          return null;
        }
        const { accessToken } = res;
        if (!user) return null; // signed out meanwhile — don't resurrect the session
        setAuth(accessToken, user);
        return accessToken;
      })
      .catch((err: unknown) => {
        // Only an auth answer ends the session. A network blip or a 5xx (e.g. a deploy restart)
        // keeps the user signed in; callers retry.
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) useAuthStore.getState().clearAuth();
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Boot-time session restore: trade the httpOnly refresh cookie for an access token, then load
 * the user. A signed-out visitor (no cookie) gets `null` from refresh — no 401, no /me call.
 * Any failure just ends the loading state so ProtectedRoute can redirect to /login.
 */
export async function restoreSession(): Promise<void> {
  const { setAuth, setLoading } = useAuthStore.getState();
  try {
    const res = await authApi.refresh();
    if (!res) {
      setLoading(false);
      return;
    }
    const { user } = await authApi.me(res.accessToken);
    setAuth(res.accessToken, user);
  } catch {
    // Refresh rejected (expired / revoked cookie) or /me failed — stay signed out.
    setLoading(false);
  }
}

/**
 * Milliseconds until the token's `exp`, or null if it can't be read. The payload is decoded
 * without verification — only to schedule a refresh; the server verifies every use.
 */
export function msUntilExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 - Date.now() : null;
  } catch {
    return null;
  }
}
