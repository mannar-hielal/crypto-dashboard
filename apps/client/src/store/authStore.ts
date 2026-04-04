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

  setAuth: (accessToken: string, user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true, // boot state — assume loading until /refresh resolves or fails

  setAuth: (accessToken, user) => set({ accessToken, user, isLoading: false }),
  clearAuth: () => set({ accessToken: null, user: null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
