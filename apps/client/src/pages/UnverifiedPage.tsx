import { useState } from 'react';
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { bg, color } from '@/lib/tokens';
import { useNavigate } from 'react-router';

export function UnverifiedPage() {
  const { user, clearAuth } = useAuthStore();
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
    } finally {
      clearAuth();
      void navigate('/login');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: bg.app }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-2xl border shadow-2xl text-center space-y-6"
        style={{ background: bg.panel, borderColor: color.purpleDeep }}
      >
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-purple-500/10 border border-purple-500/20">
            <Mail className="w-12 h-12 text-purple-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Verify your email</h1>
          <p className="text-white/60">
            We've sent a verification link to{' '}
            <span className="text-purple-400 font-medium">{user?.email}</span>. Please check your
            inbox (and spam folder) to activate your account.
          </p>
        </div>

        {status === 'sent' ? (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3 text-left"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <p className="text-sm text-green-400">{message}</p>
          </motion.div>
        ) : (
          <button
            onClick={handleResend}
            disabled={status === 'loading'}
            className="w-full h-11 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/20"
          >
            {status === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Resend verification email'
            )}
          </button>
        )}

        {status === 'error' && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded">
            {message}
          </p>
        )}

        <div className="pt-4 flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-semibold text-white/40 hover:text-white/60 transition-colors uppercase tracking-widest"
          >
            I've verified my email
          </button>

          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Use a different account
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
