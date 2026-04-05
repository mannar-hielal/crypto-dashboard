import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';

export default function App() {
  const { setAuth, setLoading } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // 🔐 On every app boot, try to restore the session silently.
    // The browser sends the httpOnly refresh_token cookie automatically.
    // If it's valid, we get a new access token and the user stays logged in.
    authApi
      .refresh()
      .then(({ accessToken }) => {
        return authApi.me(accessToken).then(({ user }) => setAuth(accessToken, user));
      })
      .catch(() => {
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // AnimatePresence: detects route changes via location.pathname and plays
    // enter/exit animations on the outgoing and incoming page components.
    // mode="wait" ensures the old page fully exits before the new one enters.
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
