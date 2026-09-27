/**
 * Access-token refresh (BP-1 review fix): only an auth failure ends the session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authApi } from '@crypto-dashboard/sdk';
import { msUntilExpiry, refreshAccessToken, restoreSession } from '../session';
import { useAuthStore } from '@/store/authStore';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@crypto-dashboard/sdk')>();
  return { ...actual, authApi: { ...actual.authApi, refresh: vi.fn(), me: vi.fn() } };
});

const refresh = vi.mocked(authApi.refresh);
const me = vi.mocked(authApi.me);

beforeEach(() => {
  refresh.mockReset();
  me.mockReset();
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
