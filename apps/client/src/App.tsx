import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';

import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TermsPage } from '@/pages/TermsPage';
import { PrivacyPage } from '@/pages/PrivacyPage';

// 🔐 Module-level flag — unlike useRef, this survives React StrictMode's
// simulated mount → unmount → remount cycle, so only ONE /refresh fires
// per actual page load (not two concurrent requests that race on the same
// rotation token and log the user out).
let refreshInitiated = false;

export default function App() {
  // Use individual selectors so App only re-renders when setAuth/setLoading themselves change,
  // not on every unrelated store update (e.g. user data changing after login).
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);
  const location = useLocation();

  useEffect(() => {
    if (refreshInitiated) return;
    refreshInitiated = true;

    // 🔐 On every app boot, try to restore the session silently.
    // The browser sends the httpOnly refresh_token cookie automatically.
    // If it's valid, we get a new access token and the user stays logged in.
    authApi
      .refresh()
      .then(({ accessToken }) => {
        return authApi.me(accessToken).then(({ user }) => setAuth(accessToken, user));
      })
      .catch(() => {
        // Refresh failed (first visit, expired token, logged out on another tab).
        // Clear the loading state so ProtectedRoute redirects to /login.
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* PWA install hint — iOS Safari (manual) and Android Chrome (native prompt) */}
      <PWAInstallBanner />

      {/* AnimatePresence: detects route changes via location.pathname and plays
          enter/exit animations on the outgoing and incoming page components.
          mode="wait" ensures the old page fully exits before the new one enters. */}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
