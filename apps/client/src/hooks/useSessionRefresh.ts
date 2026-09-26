/**
 * useSessionRefresh — refreshes the in-memory access token shortly before it expires, so a
 * long dashboard session keeps working (paper trading runs on authenticated API calls and the
 * private WebSocket). Mount once in the authenticated area (DashboardPage).
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { msUntilExpiry, refreshAccessToken } from '@/lib/session';

/** Refresh this long before expiry */
const REFRESH_LEAD_MS = 60_000;
/** Never schedule sooner than this (clock skew / already-expired tokens) */
const MIN_DELAY_MS = 5_000;
/** Retry interval after a transient refresh failure (network, 5xx) */
const RETRY_MS = 10_000;

export function useSessionRefresh(): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    const ttl = msUntilExpiry(accessToken);
    if (ttl === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      void refreshAccessToken().then((token) => {
        // A new token re-runs this effect; a transient failure retries while still signed in
        if (!token && useAuthStore.getState().accessToken === accessToken) {
          timer = setTimeout(attempt, RETRY_MS);
        }
      });
    };
    timer = setTimeout(attempt, Math.max(MIN_DELAY_MS, ttl - REFRESH_LEAD_MS));
    return () => clearTimeout(timer);
  }, [accessToken]);
}
