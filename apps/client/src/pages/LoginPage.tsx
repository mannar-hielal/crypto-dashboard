import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginFormData) => {
    setServerError('');
    try {
      const { accessToken, user } = await authApi.login({
        email: data.email,
        password: data.password,
      });

      setAuth(accessToken, user);
      void navigate('/dashboard');
    } catch {
      setServerError('Invalid email or password');
    }
  };

  return (
    // Full-screen dark background
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B14]">
      {/* Animated background orbs — pure CSS radial gradients that float slowly */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 animate-[drift_12s_ease-in-out_infinite] rounded-full bg-[#6366F1] opacity-20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 animate-[drift_16s_ease-in-out_infinite_reverse] rounded-full bg-[#22D3A5] opacity-15 blur-[120px]" />
      </div>

      {/* Glass card — slides up + fades in on mount, fades out on exit */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl"
      >
        {/* Logo mark */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <svg
            viewBox="0 0 100 100"
            className="h-12 w-12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="tl" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#22D3A5" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="22" fill="#151b35" />
            <rect
              width="100"
              height="100"
              rx="22"
              fill="none"
              stroke="#6366F1"
              strokeWidth="1.2"
              strokeOpacity="0.4"
            />
            <line
              x1="24"
              y1="27"
              x2="24"
              y2="73"
              stroke="#F43F5E"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <rect x="18" y="43" width="12" height="19" rx="2.5" fill="#F43F5E" />
            <line
              x1="50"
              y1="20"
              x2="50"
              y2="68"
              stroke="#22D3A5"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <rect x="44" y="32" width="12" height="23" rx="2.5" fill="#22D3A5" />
            <line
              x1="76"
              y1="15"
              x2="76"
              y2="60"
              stroke="#22D3A5"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <rect x="70" y="25" width="12" height="23" rx="2.5" fill="#22D3A5" />
            <polyline
              points="24,43 50,32 76,25"
              stroke="url(#tl)"
              strokeWidth="2.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="43" r="2.8" fill="#6366F1" />
            <circle cx="50" cy="32" r="2.8" fill="#8183F4" />
            <circle cx="76" cy="25" r="2.8" fill="#22D3A5" />
          </svg>
          <h1 className="text-xl font-semibold tracking-tight text-white">Crypto Dashboard</h1>
          <p className="text-sm text-white/50">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-white/70">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-500 focus:ring-indigo-500/20"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-rose-400">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-white/70">
                Password
              </Label>
              <Link
                to="/forgot-password"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-500 focus:ring-indigo-500/20"
              {...register('password')}
            />
            {errors.password && <p className="text-xs text-rose-400">{errors.password.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 w-full bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98] transition-all"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
