/**
 * Access-token lifetime helpers.
 *
 * The access token is short-lived (15 min) and lives only in memory (authStore). Before BP-1
 * it was only refreshed on app boot, so authenticated calls silently failed after 15 minutes;
 * with trading executed on the server that would stop a user from trading. These helpers keep
 * the in-memory token fresh using the httpOnly refresh cookie.
 */

import { authApi, SESSION_RECONNECT_TRIES } from '@crypto-dashboard/sdk';
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

// ─── Sign-out that survives being offline ───────────────────────────────────────

/** Set when a sign-out couldn't reach the server: the refresh cookie is still valid there */
const PENDING_SIGN_OUT_KEY = 'cd-pending-sign-out';

function setPendingSignOut(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(PENDING_SIGN_OUT_KEY, '1');
    else localStorage.removeItem(PENDING_SIGN_OUT_KEY);
  } catch {
    // Storage unavailable (private mode): the local sign-out still happened
  }
}

function hasPendingSignOut(): boolean {
  try {
    return localStorage.getItem(PENDING_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * End the session on the server (revokes the refresh cookie). 🔐 If the server can't be reached
 * (offline, 5xx), remember it: restoreSession finishes the sign-out before it would otherwise
 * trade the still-valid cookie for a new session (row 19.15). The caller clears the local
 * session either way. A new sign-in clears the flag (startedNewSession).
 */
export async function signOutOnServer(): Promise<void> {
  try {
    await authApi.logout();
    setPendingSignOut(false);
  } catch {
    setPendingSignOut(true);
  }
}

/**
 * A sign-in or sign-up succeeded: the browser now holds the new session's refresh cookie (the old
 * one is replaced), so an earlier sign-out still pending must not be finished — it would revoke
 * this new session on the next load (review #186).
 */
export function startedNewSession(): void {
  setPendingSignOut(false);
}

/** Tries after reconnecting, a second apart and doubling (shared with the server's reuse cap) */
const RECONNECT_TRIES = SESSION_RECONNECT_TRIES;

/**
 * Boot-time session restore: trade the httpOnly refresh cookie for an access token, then load
 * the user. A signed-out visitor (no cookie) gets `null` from refresh — no 401, no /me call.
 * Any failure just ends the loading state so ProtectedRoute can redirect to /login.
 */

export async function restoreSession(afterReconnect = 0): Promise<void> {
  const { setAuth, setLoading, setAwaitingNetwork } = useAuthStore.getState();
  // A sign-out made while offline: finish it, and stay signed out (still offline: try next time)
  if (hasPendingSignOut()) {
    await signOutOnServer();
    setLoading(false);
    return;
  }
  try {
    const res = await authApi.refresh();
    if (!res) {
      setAwaitingNetwork(false);
      setLoading(false);
      return;
    }
    const { user } = await authApi.me(res.accessToken);
    setAuth(res.accessToken, user);
  } catch (err) {
    // The device is offline: the session may be fine, so don't treat the learner as signed out.
    // Protected pages wait for the connection, and the restore runs again once the browser is
    // back online (PWA readiness, 2026-11-13: the installed app opened offline used to land on
    // /login and stay signed out). Loading ends, so public pages show a guest meanwhile (review on
    // #283). Only when the browser says it's offline: an online browser that can't reach the API
    // (an outage, DNS) would wait for an `online` event that never comes, so it signs out as before
    if (isOffline()) {
      setAwaitingNetwork(true);
      setLoading(false);
      retryWhenOnline();
      return;
    }
    // Back online, and /health already answered, so the network works (`reconnect`): retry a few
    // times, 1, 2 and 4 s apart, on anything but a refusal (401 / 403). Safe since the server's
    // reuse window (owner 2026-11-13): /refresh keeps a rotated token for 30 s and serves it again,
    // so a retry after a lost reply gets a fresh token, never a revocation. Past the window an old
    // token only gets a 401 for this browser
    if (afterReconnect > 0 && afterReconnect <= RECONNECT_TRIES && isSafeToRetry(err)) {
      setTimeout(() => void restoreSession(afterReconnect + 1), 1000 * 2 ** (afterReconnect - 1));
      return;
    }
    // Refresh rejected (expired / revoked cookie) or /me failed — stay signed out.
    setAwaitingNetwork(false);
    setLoading(false);
  }
}

/**
 * A failed restore worth trying again after reconnecting: anything but a refusal. 401 and 403 mean
 * the session is over; a failed fetch, a timeout, a 429 or a 5xx may pass, and a token rotated
 * meanwhile is served again inside the server's reuse window
 */
export function isSafeToRetry(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return status !== 401 && status !== 403;
}

/** Probes of /health after the `online` event, a second apart and doubling (1, 2, 4, 8, 16 s) */
const PROBE_TRIES = 5;

/**
 * Back online: prove the network works with /health (idempotent, safe to repeat) before the one
 * /refresh, which mustn't be sent twice. The `online` event often fires before the radio, DNS or a
 * captive portal lets anything through, so a refresh sent then would fail for nothing (review on
 * #287). If the API never answers, the learner is signed out as an outage would leave them
 */
async function reconnect(probe = 0): Promise<void> {
  try {
    await authApi.health();
  } catch {
    // Offline again: wait for the next `online` event
    if (isOffline()) {
      retryWhenOnline();
      return;
    }
    if (probe + 1 < PROBE_TRIES) {
      setTimeout(() => void reconnect(probe + 1), 1000 * 2 ** probe);
      return;
    }
    const { setAwaitingNetwork, setLoading } = useAuthStore.getState();
    setAwaitingNetwork(false);
    setLoading(false);
    return;
  }
  await restoreSession(1);
}

/** The browser reports no connection at all (not an API it can't reach) */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

let waitingForOnline = false;

/** One restore when the connection comes back, once /health shows the network works (one listener) */
function retryWhenOnline(): void {
  if (waitingForOnline) return;
  waitingForOnline = true;
  window.addEventListener(
    'online',
    () => {
      waitingForOnline = false;
      void reconnect();
    },
    { once: true }
  );
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
