/**
 * Access-token lifetime helpers.
 *
 * The access token is short-lived (15 min) and lives only in memory (authStore). Before BP-1
 * it was only refreshed on app boot, so authenticated calls silently failed after 15 minutes;
 * with trading executed on the server that would stop a user from trading. These helpers keep
 * the in-memory token fresh using the httpOnly refresh cookie.
 */

import { tokenPayload } from './tokenPayload';
import {
  authApi,
  SDK_REQUEST_TIMEOUT_MS,
  SESSION_RECONNECT_TRIES,
  SESSION_REUSE_WINDOW_MS,
} from '@crypto-dashboard/sdk';
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
          // session is gone, same as a 401. (Not an explicit sign-out: the learning stores and the
          // account's unsaved finishes stay for its return, and another account's first read resets
          // them. A sign-out in another tab reaches this one this way too; weighed, review after #311)
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

/** Kept clear of the window's edge: clocks and proxies add a little */
const RETRY_MARGIN_MS = 2_000;

/** Whether a retry starting after `delayMs` still reaches the server inside the reuse window */
export function retryFitsWindow(now: number, delayMs: number, deadline: number): boolean {
  return now + delayMs <= deadline;
}

/**
 * When a reconnect's retries stop: a whole request timeout (and a margin) before the reuse window
 * would end if it began at the first attempt. Best effort (reviews on #289, #290): the server's
 * window starts at its rotation, which may have come before the connection dropped, so a retry can
 * still land late; the deadline keeps that rare, and running out of retries never signs the learner
 * out (they get Try again instead)
 */
export function reconnectDeadline(startedAt: number): number {
  return startedAt + SESSION_REUSE_WINDOW_MS - SDK_REQUEST_TIMEOUT_MS - RETRY_MARGIN_MS;
}

/** When a reconnect cycle's refreshes were sent (ms since the epoch): its first and its latest */
export interface SendTimes {
  first: number;
  last: number;
}

/**
 * Boot-time session restore: trade the httpOnly refresh cookie for an access token, then load
 * the user. A signed-out visitor (no cookie) gets `null` from refresh — no 401, no /me call.
 * Any failure just ends the loading state so ProtectedRoute can redirect to /login.
 */
export async function restoreSession(
  afterReconnect = 0,
  // Each reconnect carries its own deadline, so a second reconnect never moves another's (review
  // on #290)
  deadline?: number,
  // 🔐 When this reconnect cycle's refreshes were sent. Any of them may have rotated the token and
  //    lost the reply, and the server's reuse window starts at that rotation, not when the
  //    connection came back: the deadline counts from the first send, the strictest bound, so slow
  //    /health probes can't push a retry past the window (reviews on #289, #296)
  earlier?: SendTimes
): Promise<void> {
  const { setAuth, setLoading, setAwaitingNetwork, setReconnectStalled } = useAuthStore.getState();
  const now = Date.now();
  const sends: SendTimes = { first: earlier?.first ?? now, last: now };
  const until = deadline ?? (afterReconnect > 0 ? reconnectDeadline(sends.first) : 0);
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
      // The cycle's send times travel with it: the deadline counts from them
      retryWhenOnline(sends);
      return;
    }
    // Back online, and /health already answered, so the network works (`reconnect`): retry a few
    // times, 1, 2 and 4 s apart, on anything but a refusal (401 / 403). Inside the server's reuse
    // window (owner 2026-11-13) a retry after a lost reply gets a fresh token; past it a retry
    // would read as theft and end the sign-in, so retries stop at the deadline (best effort)
    const delay = 1000 * 2 ** (afterReconnect - 1);
    if (afterReconnect > 0 && isSafeToRetry(err)) {
      if (afterReconnect <= RECONNECT_TRIES && retryFitsWindow(Date.now(), delay, until)) {
        setTimeout(() => void restoreSession(afterReconnect + 1, until, sends), delay);
        return;
      }
      // Out of safe retries, and the cookie may still be valid: not a straight trip to /login.
      // Protected pages offer Try again (owner 2026-11-13). A tap after the reuse window, if the
      // original reply was lost, reads as theft and ends that sign-in (this device only), so the
      // screen says the learner may be asked to sign in (review on #290)
      setReconnectStalled(true);
      setLoading(false);
      return;
    }
    // Refresh rejected (expired / revoked cookie) or /me failed — stay signed out (to /login, so
    // no stalled Try again either)
    setAwaitingNetwork(false);
    setReconnectStalled(false);
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
async function reconnect(probe = 0, sends?: SendTimes): Promise<void> {
  try {
    await authApi.health();
  } catch {
    // Offline again: wait for the next `online` event
    if (isOffline()) {
      retryWhenOnline(sends);
      return;
    }
    if (probe + 1 < PROBE_TRIES) {
      setTimeout(() => void reconnect(probe + 1, sends), 1000 * 2 ** probe);
      return;
    }
    // The API never answered: offer Try again rather than sign out (the cookie is untouched)
    const { setReconnectStalled, setLoading } = useAuthStore.getState();
    setReconnectStalled(true);
    setLoading(false);
    return;
  }
  // 🔐 The deadline counts from the cycle's first refresh, not from now (review on #289), while
  //    any of its refreshes is still inside the server's reuse window: the window starts at
  //    whichever one rotated, which may be the latest (review on #296). Once even the latest send
  //    is past it, the anchor protects nothing: a rotation by any of them is refused at the next
  //    refresh (a 401, never retried), and if none reached the server, retries are safe. So the
  //    count starts afresh, and a 502 after a long offline gap is still retried
  const stillInWindow = sends !== undefined && Date.now() - sends.last <= SESSION_REUSE_WINDOW_MS;
  await restoreSession(1, undefined, stillInWindow ? sends : undefined);
}

/**
 * The learner's Try again after a stalled reconnect: probe, then one refresh with a new deadline. A
 * deliberate tap starts a new cycle; the screen already says it may end in signing in again
 */
export function retryReconnect(): void {
  useAuthStore.getState().setReconnectStalled(false);
  void reconnect();
}

/** The browser reports no connection at all (not an API it can't reach) */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

let waitingForOnline = false;
/** The send times the waiting reconnect will carry, merged across calls (review on #296) */
let waitingSends: SendTimes | undefined;

/** The earliest first send and the latest last send of two cycles' times */
export function mergeSends(
  a: SendTimes | undefined,
  b: SendTimes | undefined
): SendTimes | undefined {
  if (!a) return b;
  if (!b) return a;
  return { first: Math.min(a.first, b.first), last: Math.max(a.last, b.last) };
}

/** One restore when the connection comes back, once /health shows the network works (one listener) */
function retryWhenOnline(sends?: SendTimes): void {
  // A second call while waiting keeps its newer send times instead of dropping them
  waitingSends = mergeSends(waitingSends, sends);
  if (waitingForOnline) return;
  waitingForOnline = true;
  window.addEventListener(
    'online',
    () => {
      waitingForOnline = false;
      const carried = waitingSends;
      waitingSends = undefined;
      void reconnect(0, carried);
    },
    { once: true }
  );
}

/**
 * Milliseconds until the token's `exp`, or null if it can't be read. The payload is decoded
 * without verification — only to schedule a refresh; the server verifies every use.
 */
export function msUntilExpiry(token: string): number | null {
  const exp = tokenPayload(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 - Date.now() : null;
}
