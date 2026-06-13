import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft, LogIn } from 'lucide-react';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

export function VerifyEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    !token ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() => (!token ? 'Missing verification token.' : ''));

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await authApi.verifyEmailChange({ token });
        setStatus('success');
        setMessage(res.message);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Email change verification failed.');
      }
    };

    verify();
  }, [token]);

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
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
            <h1 className="text-xl font-bold text-white">Verifying email change...</h1>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <h1 className="text-2xl font-bold text-white">Email Updated!</h1>
            <p className="text-white/60">{message}</p>
            <Link
              to="/login"
              className="mt-6 flex items-center justify-center gap-2 h-11 w-full bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/20"
            >
              <LogIn className="w-4 h-4" /> Log in with new email
            </Link>
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
