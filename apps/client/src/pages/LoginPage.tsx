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
import { AuthLayout } from '@/components/AuthLayout';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { bg, color, fontSize, gradient, radius } from '@/lib/tokens';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const { accessToken, user } = await authApi.login({
        email: data.email,
        password: data.password,
      });
      setAuth(accessToken, user);
      void navigate('/dashboard');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message.toLowerCase() : '';
      const isCreds =
        msg.includes('invalid email or password') ||
        msg.includes('invalid credentials') ||
        msg.includes('unauthorized') ||
        msg.includes('401');
      setServerError(
        isCreds ? 'Invalid email or password' : 'Unable to sign in right now. Please try again.'
      );
    }
  };

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Card */}
        <div
          className="rounded-2xl border border-white/[0.08] p-8 shadow-2xl"
          style={{ background: bg.panel }}
        >
          {/* Brand mark */}
          <div className="mb-6 flex flex-col items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
                boxShadow: `0 0 24px ${color.purpleDark}80`,
              }}
            >
              <span className="text-lg font-black text-white">CD</span>
            </motion.div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Welcome back</h1>
              <p className="mt-0.5 text-sm" style={{ color: color.muted }}>
                Sign in to your account
              </p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
              {serverError && (
                <motion.div
                  role="alert"
                  aria-live="polite"
                  aria-atomic="true"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border px-3 py-2.5 text-xs font-medium"
                  style={{
                    borderColor: `${color.red}33`,
                    background: `${color.red}1a`,
                    color: color.red,
                  }}
                >
                  {serverError}
                </motion.div>
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: color.muted }}
                    >
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        aria-invalid={!!form.formState.errors.email}
                        className="border-white/[0.08] text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                        style={{ background: bg.surface }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage style={{ color: color.red }} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel
                        className="text-xs font-semibold uppercase tracking-widest"
                        style={{ color: color.muted }}
                      >
                        Password
                      </FormLabel>
                      <Link
                        to="/forgot-password"
                        className="transition-colors hover:text-brand-purple"
                        style={{ fontSize: fontSize.xs11, color: color.purpleDark }}
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        aria-invalid={!!form.formState.errors.password}
                        className="border-white/[0.08] text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                        style={{ background: bg.surface }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage style={{ color: color.red }} />
                  </FormItem>
                )}
              />

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  type="submit"
                  className="w-full font-bold tracking-wide text-white"
                  style={{
                    background: form.formState.isSubmitting
                      ? `${color.purpleDark}80`
                      : gradient.brand,
                    borderRadius: radius.button,
                    boxShadow: `0 0 20px ${gradient.brandFrom}55`,
                  }}
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </motion.div>

              <p className="text-center text-sm" style={{ color: color.muted }}>
                Don&apos;t have an account?{' '}
                <Link
                  to="/register"
                  className="font-semibold transition-colors hover:text-brand-purple"
                  style={{ color: color.purpleDark }}
                >
                  Create one
                </Link>
              </p>
            </form>
          </Form>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
