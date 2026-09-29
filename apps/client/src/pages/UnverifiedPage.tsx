import { guide } from '@/lib/guideAnchors';
import { useState } from 'react';
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { bg, color, gradient } from '@/lib/tokens';
import { SeoHead } from '@/components/SeoHead';
import { useNavigate } from 'react-router';

export function UnverifiedPage() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleResend = async () => {
    if (!user?.email) return;
    setStatus('loading');
    try {
      const res = await authApi.resendVerification({ email: user.email });
      setStatus('sent');
      setMessage(res.message);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to send verification email.');
    }
  };

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // 🔐 The local session must clear even if the server call fails (offline, 5xx) —
      // and a failure must not escape the click handler as an uncaught rejection.
    } finally {
      clearAuth();
      void navigate('/login');
    }
  };

  return (
    <>
      <SeoHead
        title="Verify Your Email"
        description="Please verify your email address to access your cryptopapertrade.com account."
        path="/unverified"
        noIndex
      />
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: bg.page }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-2xl border shadow-2xl text-center space-y-6"
          style={{ background: bg.panel, borderColor: color.purpleDeep }}
        >
          <div className="flex justify-center">
            <div
              className="p-4 rounded-full"
              style={{
                background: `${color.purple}15`,
                border: `1px solid ${color.purple}30`,
              }}
            >
              <Mail className="w-12 h-12" style={{ color: color.purple }} />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Verify your email</h1>
            <p className="text-sm" style={{ color: color.muted }}>
              We've sent a verification link to{' '}
              <span className="font-medium" style={{ color: color.purple }}>
                {user?.email}
              </span>
              . Please check your inbox (and spam folder) to activate your account.
            </p>
          </div>

          {status === 'sent' ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 rounded-lg flex items-center gap-3 text-left"
              style={{
                background: `${color.green}15`,
                border: `1px solid ${color.green}30`,
              }}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: color.green }} />
              <p
                className="text-sm"
                style={{ color: color.green }}
                {...guide('auth.unverified.message')}
              >
                {message}
              </p>
            </motion.div>
          ) : (
            <button
              onClick={handleResend}
              disabled={status === 'loading'}
              {...guide('auth.unverified.resend')}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-all shadow-lg"
              style={{
                background: gradient.brand,
                opacity: status === 'loading' ? 0.5 : 1,
                boxShadow: `0 4px 16px ${color.purpleDark}40`,
              }}
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Resend verification email'
              )}
            </button>
          )}

          {status === 'error' && (
            <p
              className="text-xs p-2 rounded"
              style={{
                color: color.red,
                background: `${color.red}15`,
                border: `1px solid ${color.red}30`,
              }}
            >
              {message}
            </p>
          )}

          <div className="pt-4 flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-semibold uppercase tracking-widest transition-colors"
              style={{ color: `${color.muted}60` }}
            >
              I've verified my email
            </button>

            <div className="flex items-center justify-center gap-2 text-sm">
              <button
                onClick={handleSignOut}
                {...guide('auth.unverified.sign-out')}
                className="flex items-center gap-2 transition-colors"
                style={{ color: color.purple }}
              >
                <ArrowLeft className="w-4 h-4" /> Use a different account
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
