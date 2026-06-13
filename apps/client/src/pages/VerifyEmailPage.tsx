import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
    !token ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() => (!token ? 'Missing verification token.' : ''));

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await authApi.verifyEmail({ token });
        setStatus('success');
        setMessage(res.message);
        // 🧪 Temporarily disabled auto-redirect to allow for easier debugging of Success state
        // setTimeout(() => navigate('/login'), 3000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg.app }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-2xl border shadow-2xl text-center space-y-6"
        style={{ background: bg.panel, borderColor: color.purpleDeep }}
      >
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
            <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
            <p className="text-white/60">One moment while we confirm your account.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <h1 className="text-2xl font-bold text-white">Email Verified!</h1>
            <p className="text-white/60">{message}</p>
            <p className="text-xs text-white/40 pt-4">Redirecting you to login...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <h1 className="text-2xl font-bold text-white">Verification Failed</h1>
            <p className="text-red-400 font-medium">{message}</p>
            <Link
              to="/login"
              className="flex items-center gap-2 text-sm font-bold text-purple-400 hover:text-purple-300 transition-colors pt-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
