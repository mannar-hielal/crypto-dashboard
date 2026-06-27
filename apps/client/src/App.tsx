import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { CookieBanner } from '@/components/CookieBanner';
import { PageFallback } from '@/components/PageFallback';

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() =>
  import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage }))
);
const SecurityPage = lazy(() =>
  import('@/pages/SecurityPage').then((m) => ({ default: m.SecurityPage }))
);
const AcceptableUsePolicyPage = lazy(() =>
  import('@/pages/AcceptableUsePolicyPage').then((m) => ({ default: m.AcceptableUsePolicyPage }))
);
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const FeaturesPage = lazy(() =>
  import('@/pages/FeaturesPage').then((m) => ({ default: m.FeaturesPage }))
);
const UnverifiedPage = lazy(() =>
  import('@/pages/UnverifiedPage').then((m) => ({ default: m.UnverifiedPage }))
);
const VerifyEmailPage = lazy(() =>
  import('@/pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);
const VerifyEmailChangePage = lazy(() =>
  import('@/pages/VerifyEmailChangePage').then((m) => ({ default: m.VerifyEmailChangePage }))
);
const NewsletterVerifyPage = lazy(() =>
  import('@/pages/NewsletterVerifyPage').then((m) => ({ default: m.NewsletterVerifyPage }))
);
const NewsletterUnsubscribedPage = lazy(() =>
  import('@/pages/NewsletterUnsubscribedPage').then((m) => ({
    default: m.NewsletterUnsubscribedPage,
  }))
);
const AdminNewsletterPage = lazy(() =>
  import('@/pages/AdminNewsletterPage').then((m) => ({ default: m.AdminNewsletterPage }))
);

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

      {/* ⚖️ Legal cookie/storage notice — required by nDSG and GDPR */}
      <CookieBanner />

      {/* AnimatePresence: detects route changes via location.pathname and plays
          enter/exit animations on the outgoing and incoming page components.
          mode="wait" ensures the old page fully exits before the new one enters. */}
      <Suspense fallback={<PageFallback />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* Landing page */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/features" element={<FeaturesPage />} />

            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/unverified" element={<UnverifiedPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
            <Route path="/newsletter/verify" element={<NewsletterVerifyPage />} />
            <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribedPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/aup" element={<AcceptableUsePolicyPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/admin/newsletter" element={<AdminNewsletterPage />} />
            </Route>

            {/* Catch-all — redirect to landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </>
  );
}
