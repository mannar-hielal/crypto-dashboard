/**
 * Who is looking at the dashboard, and how to send a visitor to sign in.
 *
 * The public /chart page renders the same dashboard as /dashboard: a signed-out visitor gets the
 * charts, but every paper-trading action needs an account (the server rejects them all without a
 * token). These two hooks drive the sign-in lock over the order form and the account panel.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { useLayoutStore } from '@/store/layoutStore';
import { marketPath } from '@/lib/marketRoutes';

export type AuthStatus = 'loading' | 'guest' | 'user';

/** `loading` while the session is being restored on boot, so a returning user sees no prompt flash. */
export function useAuthStatus(): AuthStatus {
  const isLoading = useAuthStore((s) => s.isLoading);
  const signedIn = useAuthStore((s) => s.accessToken !== null && s.user !== null);
  if (signedIn) return 'user';
  return isLoading ? 'loading' : 'guest';
}

/**
 * Opens /login, remembering the market on screen: after signing in (or registering) the user lands
 * on their dashboard on that market. 🔐 LoginPage / RegisterPage only accept an allow-listed market
 * URL back (`safeReturnPath`), never the raw state.
 */
export function useSignInToTrade(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const { panes, activePane } = useLayoutStore.getState();
    const pane = panes[activePane] ?? panes[0];
    const from = pane ? marketPath({ category: pane.category, symbol: pane.symbol }) : undefined;
    void navigate('/login', { state: { from } });
  }, [navigate]);
}
