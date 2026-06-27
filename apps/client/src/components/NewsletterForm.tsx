import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { newsletterApi } from '@crypto-dashboard/sdk';
import { Loader2, CheckCircle } from 'lucide-react';
import { color, gradient, bg } from '@/lib/tokens';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();

    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.');
      setState('error');
      return;
    }

    setState('loading');
    setErrorMsg('');

    try {
      await newsletterApi.subscribe(trimmed);
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setState('error');
    }
  };

  if (state === 'success') {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border px-6 py-5"
        style={{ borderColor: `${color.green}30`, background: `${color.green}08` }}
      >
        <CheckCircle className="h-6 w-6 shrink-0" style={{ color: color.green }} />
        <p className="text-sm font-medium text-white">
          Check your inbox — confirm your email to stay in the loop.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3">
      <div className="flex gap-3">
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          aria-label="Email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          placeholder="your@email.com"
          disabled={state === 'loading'}
          className="h-12 flex-1 rounded-xl border px-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 disabled:opacity-50"
          style={{
            background: bg.surface,
            borderColor: state === 'error' ? color.red : 'rgba(255,255,255,0.15)',
          }}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="flex h-12 shrink-0 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: gradient.brand }}
        >
          {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get Notified'}
        </button>
      </div>

      {state === 'error' && errorMsg && (
        <p className="text-xs" style={{ color: color.red }}>
          {errorMsg}
        </p>
      )}

      <p className="text-xs" style={{ color: color.muted }}>
        No spam, unsubscribe anytime. Read our{' '}
        <Link
          to="/privacy"
          className="underline transition-colors hover:text-white"
          style={{ color: color.purple }}
        >
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
