/**
 * ProtectedRoute
 *
 * Wraps any route that requires authentication.
 * - While session is being restored (isLoading): shows a spinner
 * - No access token: redirects to /login, remembering the URL (a market deep link comes back
 *   to it after sign-in; LoginPage only honours allow-listed market URLs)
 * - Authenticated: renders the child route via <Outlet />
 */

import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/store/authStore';

/** Whether the browser reports a connection, kept up to date */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();
  const online = useOnline();

  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        {/* Opened offline: the session waits for the connection instead of signing out */}
        {!online && (
          <p className="text-muted-foreground max-w-xs text-sm" role="status">
            You&apos;re offline. You&apos;ll be signed back in as soon as you&apos;re online.
          </p>
        )}
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
