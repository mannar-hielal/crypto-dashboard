/**
 * ProtectedRoute
 *
 * Wraps any route that requires authentication.
 * - While session is being restored (isLoading): shows a spinner
 * - No access token: redirects to /login
 * - Authenticated: renders the child route via <Outlet />
 */

import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute() {
  const { accessToken, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  // Renders the matched child route
  return <Outlet />;
}
