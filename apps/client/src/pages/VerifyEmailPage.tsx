import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const hasAttempted = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
    !token ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() => (!token ? 'Missing verification token.' : ''));

  useEffect(() => {
    if (!token || status !== 'loading' || hasAttempted.current) return;

    const verify = async () => {
      hasAttempted.current = true;
      try {
        const res = await authApi.verifyEmail({ token });
        setStatus('success');
        setMessage(res.message);
        setTimeout(() => navigate('/login'), 3000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    };

    verify();
  }, [token, navigate, status]);

  return (
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
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-12 h-12 animate-spin" style={{ color: color.purple }} />
            <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
            <p className="text-sm" style={{ color: color.muted }}>
              One moment while we confirm your account.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-16 h-16" style={{ color: color.green }} />
            <h1 className="text-2xl font-bold text-white">Email Verified!</h1>
            <p className="text-sm" style={{ color: color.muted }}>
              {message}
            </p>
            <p className="text-xs pt-4" style={{ color: `${color.muted}60` }}>
              Redirecting you to login...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="w-16 h-16" style={{ color: color.red }} />
            <h1 className="text-2xl font-bold text-white">Verification Failed</h1>
            <p className="text-sm font-medium" style={{ color: color.red }}>
              {message}
            </p>
            <Link
              to="/login"
              className="flex items-center gap-2 text-sm font-bold pt-4 transition-colors"
              style={{ color: color.purple }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
