import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { restoreSession } from '@/lib/session';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { OfflineBanner } from '@/components/OfflineBanner';
import { CookieBanner } from '@/components/CookieBanner';
import { PageFallback } from '@/components/PageFallback';
import { routeKey } from '@/lib/marketRoutes';

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
const ChartPage = lazy(() => import('@/pages/ChartPage').then((m) => ({ default: m.ChartPage })));
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const DashboardRedirect = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardRedirect }))
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
const AdminMetricsPage = lazy(() =>
  import('@/pages/AdminMetricsPage').then((m) => ({ default: m.AdminMetricsPage }))
);

// 🔐 Module-level flag — unlike useRef, this survives React StrictMode's
// simulated mount → unmount → remount cycle, so only ONE /refresh fires
// per actual page load (not two concurrent requests that race on the same
// rotation token and log the user out).
let refreshInitiated = false;

export default function App() {
  const location = useLocation();

  useEffect(() => {
    if (refreshInitiated) return;
    refreshInitiated = true;

    // 🔐 On every app boot, try to restore the session silently.
    // The browser sends the httpOnly refresh_token cookie automatically.
    // If it's valid, we get a new access token and the user stays logged in.
    void restoreSession();
  }, []);

  return (
    <>
      {/* Offline indicator — shows when the browser reports no network */}
      <OfflineBanner />

      {/* PWA install hint — iOS Safari (manual) and Android Chrome (native prompt) */}
      <PWAInstallBanner />

      {/* ⚖️ Legal cookie/storage notice — required by nDSG and GDPR */}
      <CookieBanner />

      {/* AnimatePresence: detects route changes via location.pathname and plays
          enter/exit animations on the outgoing and incoming page components.
          mode="wait" ensures the old page fully exits before the new one enters. */}
      <Suspense fallback={<PageFallback />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={routeKey(location.pathname)}>
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

            {/* Public chart page — no auth required (TVP free license requirement) */}
            <Route path="/chart" element={<ChartPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              {/* Market URLs (BP-2): /dashboard/spot/BTC/USDT, /dashboard/usdt/BTCUSDT.
                  Bare /dashboard and anything else under it go to the active pane's market. */}
              <Route path="/dashboard/spot/:base/:quote" element={<DashboardPage />} />
              <Route path="/dashboard/usdt/:symbol" element={<DashboardPage />} />
              <Route path="/dashboard/*" element={<DashboardRedirect />} />
              <Route path="/admin/newsletter" element={<AdminNewsletterPage />} />
              <Route path="/admin/metrics" element={<AdminMetricsPage />} />
            </Route>

            {/* Catch-all — redirect to landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </>
  );
}
