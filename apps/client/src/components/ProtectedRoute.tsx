/**
 * ProtectedRoute
 *
 * Wraps any route that requires authentication.
 * - While session is being restored (isLoading): shows a spinner
 * - No access token: redirects to /login, remembering the URL (a market deep link comes back
 *   to it after sign-in; LoginPage only honours allow-listed market URLs)
 * - Authenticated: renders the child route via <Outlet />
 */

import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Redirect unverified users to the verification prompt
  if (user && !user.emailVerifiedAt) {
    return <Navigate to="/unverified" replace />;
  }

  // Renders the matched child route
  return <Outlet />;
}
