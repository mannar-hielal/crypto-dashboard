/**
 * Auth Store (Zustand)
 *
 * Holds the short-lived access token in memory — never persisted to disk.
 * The httpOnly refresh_token cookie (managed by the browser) is used on
 * app boot to silently restore the session via POST /api/auth/refresh.
 */

import { create } from 'zustand';
import type { User } from '@crypto-dashboard/sdk';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  // true while the app is trying to restore the session on boot via /refresh
  isLoading: boolean;
  /**
   * The session couldn't be restored because the device is offline: it may be fine, so protected
   * pages wait for the connection instead of sending the learner to /login. Public pages see a
   * guest meanwhile (review on #283)
   */
  awaitingNetwork: boolean;

  setAuth: (accessToken: string, user: User) => void;
  updateUser: (partial: Partial<User>) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setAwaitingNetwork: (awaiting: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true, // boot state — assume loading until /refresh resolves or fails
  awaitingNetwork: false,

  setAuth: (accessToken, user) =>
    set({ accessToken, user, isLoading: false, awaitingNetwork: false }),
  updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : null })),
  clearAuth: () => set({ accessToken: null, user: null, isLoading: false, awaitingNetwork: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setAwaitingNetwork: (awaitingNetwork) => set({ awaitingNetwork }),
}));
