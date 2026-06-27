import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router';
import { SeoHead } from '@/components/SeoHead';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { newsletterApi } from '@crypto-dashboard/sdk';
import { bg, color } from '@/lib/tokens';

export function NewsletterUnsubscribedPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const hasAttempted = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
    !token ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() => (!token ? 'Missing token.' : ''));

  useEffect(() => {
    if (!token || status !== 'loading' || hasAttempted.current) return;

    const run = async () => {
      hasAttempted.current = true;
      try {
        const res = await newsletterApi.unsubscribe(token);
        setStatus('success');
        setMessage(res.message);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Something went wrong.');
      }
    };

    run();
  }, [token, status]);

  return (
    <>
      <SeoHead
        title="Unsubscribed"
        description="You have been unsubscribed from cryptopapertrade.com updates."
        path="/newsletter/unsubscribe"
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
              <h1 className="text-xl font-bold text-white">Unsubscribing...</h1>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="w-16 h-16" style={{ color: color.green }} />
              <h1 className="text-2xl font-bold text-white">Unsubscribed</h1>
              <p className="text-sm" style={{ color: color.muted }}>
                {message}
              </p>
              <p className="text-sm" style={{ color: `${color.muted}80` }}>
                You won't receive any more emails from us. If you change your mind, you're always
                welcome back.
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
              <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
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
