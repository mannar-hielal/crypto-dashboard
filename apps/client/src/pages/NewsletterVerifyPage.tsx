import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router';
import { SeoHead } from '@/components/SeoHead';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { newsletterApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

export function NewsletterVerifyPage() {
  const [searchParams] = useSearchParams();
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
        const res = await newsletterApi.verify(token);
        setStatus('success');
        setMessage(res.message);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    };

    verify();
  }, [token, status]);

  return (
    <>
      <SeoHead
        title="Subscription Confirmed"
        description="Confirming your waitlist subscription for cryptopapertrade.com."
        path="/newsletter/verify"
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
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin" style={{ color: color.purple }} />
              <h1 className="text-xl font-bold text-white">Confirming your subscription...</h1>
              <p className="text-sm" style={{ color: color.muted }}>
                One moment while we verify your email.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="w-16 h-16" style={{ color: color.green }} />
              <h1 className="text-2xl font-bold text-white">You're on the list!</h1>
              <p className="text-sm" style={{ color: color.muted }}>
                {message}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: `${color.muted}80` }}>
                We'll notify you when we launch. In the meantime, feel free to explore our features.
              </p>
              <Link
                to="/"
                className="flex items-center gap-2 text-sm font-bold pt-4 transition-colors"
                style={{ color: color.purple }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to homepage
              </Link>
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
                to="/"
                className="flex items-center gap-2 text-sm font-bold pt-4 transition-colors"
                style={{ color: color.purple }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to homepage
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}
