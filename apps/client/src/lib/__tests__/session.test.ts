/**
 * Access-token refresh (BP-1 review fix): only an auth failure ends the session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authApi } from '@crypto-dashboard/sdk';
import {
  isOffline,
  isSafeToRetry,
  retryReconnect,
  reconnectDeadline,
  retryFitsWindow,
  msUntilExpiry,
  refreshAccessToken,
  restoreSession,
  signOutOnServer,
  startedNewSession,
} from '../session';
import { useAuthStore } from '@/store/authStore';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@crypto-dashboard/sdk')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      refresh: vi.fn(),
      me: vi.fn(),
      logout: vi.fn(),
      health: vi.fn(),
    },
  };
});

const refresh = vi.mocked(authApi.refresh);
const me = vi.mocked(authApi.me);
const logout = vi.mocked(authApi.logout);
const health = vi.mocked(authApi.health);

beforeEach(() => {
  refresh.mockReset();
  me.mockReset();
  logout.mockReset();
  health.mockReset();
  health.mockResolvedValue({ status: 'ok' });
  localStorage.clear();
  useAuthStore.setState({ accessToken: 'old', user: { id: 'u1' } as never, isLoading: false });
});

describe('refreshAccessToken()', () => {
  it('stores the new token on success', async () => {
    refresh.mockResolvedValueOnce({ accessToken: 'new' } as never);
    await expect(refreshAccessToken()).resolves.toBe('new');
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('signs out on a 401 (refresh cookie no longer valid)', async () => {
    refresh.mockRejectedValueOnce(
      Object.assign(new Error('Invalid refresh token'), { status: 401 })
    );
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('should sign out when the refresh cookie is gone (204, no session to restore)', async () => {
    refresh.mockResolvedValueOnce(null);
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['a 502 during a deploy', Object.assign(new Error('Bad Gateway'), { status: 502 })],
  ])('keeps the user signed in on %s', async (_label, err) => {
    refresh.mockRejectedValueOnce(err);
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('old');
  });

  it('shares one request between concurrent callers (the server rotates refresh tokens)', async () => {
    refresh.mockResolvedValueOnce({ accessToken: 'new' } as never);
    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('restoreSession()', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
  });

  it('should end loading without calling /me when there is no session (signed-out visitor)', async () => {
    refresh.mockResolvedValueOnce(null);
    await restoreSession();
    expect(me).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      isLoading: false,
    });
  });

  it('should restore the user when the refresh cookie is valid', async () => {
    refresh.mockResolvedValueOnce({ accessToken: 'fresh' });
    me.mockResolvedValueOnce({ user: { id: 'u1' } as never });
    await restoreSession();
    expect(me).toHaveBeenCalledWith('fresh');
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh', isLoading: false });
  });

  it('should stay signed out when the cookie is rejected (401)', async () => {
    refresh.mockRejectedValueOnce(Object.assign(new Error('Invalid'), { status: 401 }));
    await restoreSession();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, isLoading: false });
  });
});

describe('msUntilExpiry()', () => {
  it('should keep the session waiting when opened offline, and restore it once the API answers', async () => {
    // PWA readiness (2026-11-13): an offline launch used to land on /login, signed out
    vi.useFakeTimers();
    try {
      useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      refresh.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await restoreSession();
      // Not signed out: protected pages wait; public pages see a guest (review on #283)
      expect(useAuthStore.getState()).toMatchObject({ isLoading: false, awaitingNetwork: true });
      onLine.mockReturnValue(true);

      // The `online` event came early: /health fails twice, then answers (review on #287)
      health
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({ status: 'ok' });
      refresh.mockResolvedValueOnce({ accessToken: 'new' } as never);
      me.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      // No refresh until the network is proven: the token is never spent on a dead line
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().awaitingNetwork).toBe(true);
      await vi.advanceTimersByTimeAsync(1000 + 2000);
      expect(health).toHaveBeenCalledTimes(3);
      expect(refresh).toHaveBeenCalledTimes(2); // exactly once after reconnecting
      expect(useAuthStore.getState().accessToken).toBe('new');
      onLine.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should offer Try again, not sign out, when the API never answers after reconnecting (review on #290)', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      refresh.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await restoreSession();
      onLine.mockReturnValue(true);
      health.mockRejectedValue(new TypeError('Failed to fetch'));
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000);
      expect(health).toHaveBeenCalledTimes(5);
      expect(refresh).toHaveBeenCalledTimes(1); // never sent while the line was dead
      expect(useAuthStore.getState()).toMatchObject({ isLoading: false, reconnectStalled: true });
      onLine.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should retry a lost or failed refresh after reconnecting, as the server serves a just-rotated token again (owner 2026-11-13)', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({
        accessToken: null,
        user: null,
        isLoading: false,
        awaitingNetwork: true,
      });
      // A dropped reply, a timeout, a 502: each retried, the fourth try gets through
      refresh
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
        .mockRejectedValueOnce(Object.assign(new Error('Bad Gateway'), { status: 502 }))
        .mockResolvedValueOnce({ accessToken: 'back' } as never);
      me.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
      await restoreSession(1);
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
      expect(refresh).toHaveBeenCalledTimes(4);
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'back',
        awaitingNetwork: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop retrying before a retry could reach the server after the reuse window (review on #289)', () => {
    // Window 30 s, request timeout 10 s, margin 2 s: a retry must start within 18 s of the first try
    const start = 1_000_000;
    const deadline = reconnectDeadline(start);
    expect(deadline - start).toBe(18_000);
    expect(retryFitsWindow(start + 10_000, 1000, deadline)).toBe(true);
    expect(retryFitsWindow(start + 17_500, 1000, deadline)).toBe(false);
  });

  it('should send no retry past its deadline when every try runs to its timeout, then offer Try again', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({
        accessToken: null,
        user: null,
        isLoading: false,
        awaitingNetwork: true,
      });
      // Each refresh hangs to the SDK's 10 s timeout, then fails
      const started = Date.now();
      const starts: number[] = [];
      refresh.mockImplementation(() => {
        starts.push(Date.now() - started);
        return new Promise((_, reject) =>
          setTimeout(() => reject(new DOMException('signal timed out', 'TimeoutError')), 10_000)
        );
      });
      void restoreSession(1);
      await vi.advanceTimersByTimeAsync(60_000);
      // Tries start at 0 and 11 s; the next (23 s) would reach the server too late, so it isn't sent
      expect(starts).toEqual([0, 11_000]);
      // Every request that was sent reached the server inside the 30 s window
      for (const t of starts) expect(t + 10_000).toBeLessThanOrEqual(30_000);
      expect(useAuthStore.getState()).toMatchObject({ isLoading: false, reconnectStalled: true });
    } finally {
      refresh.mockReset();
      vi.useRealTimers();
    }
  });

  it('should try again on the learner’s tap: probe, then one refresh, and sign them back in', async () => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isLoading: false,
      reconnectStalled: true,
    });
    refresh.mockResolvedValueOnce({ accessToken: 'again' } as never);
    me.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
    retryReconnect();
    expect(useAuthStore.getState().reconnectStalled).toBe(false);
    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBe('again'));
    expect(health).toHaveBeenCalled();
  });

  it('should retry anything but a refusal (401 / 403)', () => {
    expect(isSafeToRetry(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isSafeToRetry(new TypeError('Failed to fetch'))).toBe(true);
    expect(isSafeToRetry(Object.assign(new Error('x'), { status: 502 }))).toBe(true);
    expect(isSafeToRetry(new DOMException('t', 'TimeoutError'))).toBe(true);
    expect(isSafeToRetry(Object.assign(new Error('x'), { status: 401 }))).toBe(false);
    expect(isSafeToRetry(Object.assign(new Error('x'), { status: 403 }))).toBe(false);
  });

  it('should stop after three retries with Try again, and sign out at once on a 401', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({
        accessToken: null,
        user: null,
        isLoading: false,
        awaitingNetwork: true,
      });
      refresh.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { status: 429 }));
      await restoreSession(1);
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
      expect(refresh).toHaveBeenCalledTimes(4);
      expect(useAuthStore.getState()).toMatchObject({ isLoading: false, reconnectStalled: true });

      refresh.mockReset();
      useAuthStore.setState({ isLoading: true });
      refresh.mockRejectedValueOnce(Object.assign(new Error('Invalid'), { status: 401 }));
      await restoreSession(1);
      // A refusal is a real sign-out: no stalled Try again left over
      expect(useAuthStore.getState()).toMatchObject({ isLoading: false, reconnectStalled: false });
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not hang when online but the API is unreachable: it signs out as before (review on #283)', async () => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
    refresh.mockRejectedValueOnce(new TypeError('Failed to fetch')); // an outage, DNS, a restart
    await restoreSession();
    expect(useAuthStore.getState().isLoading).toBe(false); // to /login, never a spinner for ever
  });

  it('should still sign out when the server refuses the session (not a network failure)', async () => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
    refresh.mockRejectedValueOnce(new Error('Unauthorized'));
    await restoreSession();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(isOffline()).toBe(false); // jsdom is online
  });

  it('reads exp from the token payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const token = `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.y`;
    const ms = msUntilExpiry(token)!;
    expect(ms).toBeGreaterThan(590_000);
    expect(ms).toBeLessThanOrEqual(600_000);
  });

  it('returns null for an unreadable token', () => {
    expect(msUntilExpiry('garbage')).toBeNull();
  });
});

describe('signOutOnServer() — a sign-out made offline (row 19.15)', () => {
  it('should finish an offline sign-out on the next load instead of restoring the session', async () => {
    logout.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signOutOnServer()).resolves.toBeUndefined();

    // Back online, next load: the cookie is still valid on the server, but it isn't traded in
    logout.mockResolvedValueOnce(undefined);
    useAuthStore.setState({ accessToken: null, user: null, isLoading: true });
    await restoreSession();
    expect(logout).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);

    // Done: the load after that restores sessions normally again
    refresh.mockResolvedValueOnce(null);
    await restoreSession();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('should keep trying while the server is still unreachable, and stay signed out', async () => {
    logout.mockRejectedValue(new TypeError('Failed to fetch'));
    await signOutOnServer();
    await restoreSession();
    await restoreSession();
    expect(refresh).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledTimes(3);
  });

  it('should not mark anything when the server call works', async () => {
    logout.mockResolvedValueOnce(undefined);
    await signOutOnServer();
    refresh.mockResolvedValueOnce(null);
    await restoreSession();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('should not sign out a session started after a failed sign-out (review #186)', async () => {
    logout.mockRejectedValueOnce(new Error('Bad Gateway'));
    await signOutOnServer();
    // Signed in again without a reload (the login page calls this on success)
    startedNewSession();
    refresh.mockResolvedValueOnce({ accessToken: 'fresh' } as never);
    me.mockResolvedValueOnce({ user: { id: 'u2' } } as never);
    await restoreSession();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('fresh');
  });
});
