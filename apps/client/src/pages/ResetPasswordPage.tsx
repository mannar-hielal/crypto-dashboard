import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { bg, color, gradient, radius } from '@/lib/tokens';

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(256)
      .regex(/(?=.*[a-z])/, 'Must include a lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Must include an uppercase letter')
      .regex(/(?=.*[0-9])/, 'Must include a number')
      .regex(/(?=.*[^a-zA-Z0-9])/, 'Must include a special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetSchema>;

const formContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};

const formFieldVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
};

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Redirect to login 2s after successful reset — cleaned up on unmount
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => void navigate('/login'), 2000);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <AuthLayout centerContent>
        <div
          className="rounded-2xl border border-white/8 p-8 shadow-2xl w-full max-w-sm"
          style={{ background: bg.panel }}
        >
          <div
            className="rounded-lg border px-3 py-2.5 text-xs font-medium text-center"
            style={{
              borderColor: `${color.red}33`,
              background: `${color.red}1a`,
              color: color.red,
            }}
          >
            Invalid or missing reset token.{' '}
            <Link to="/forgot-password" style={{ color: color.purpleDark }} className="underline">
              Request a new link
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  async function onSubmit(data: ResetForm) {
    setServerError(null);
    try {
      await authApi.resetPassword({ token, password: data.password });
      setSuccess(true);
      // Navigation is handled by the useEffect watching `success`
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <>
      <SeoHead
        title="Set New Password"
        description="Set a new password for your cryptopapertrade.com account."
        path="/reset-password"
        noIndex
      />
      <AuthLayout centerContent>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div
            className="rounded-2xl border border-white/8 p-8 shadow-2xl"
            style={{ background: bg.panel }}
          >
            {/* Brand mark */}
            <div className="mb-6 flex flex-col items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="h-12 w-12 overflow-hidden rounded-xl"
                style={{
                  boxShadow: `0 0 24px ${color.purpleDark}80`,
                }}
              >
                <img src="/logo.svg" alt="CPT" className="h-full w-full" />
              </motion.div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white">Set new password</h1>
                <p className="mt-0.5 text-sm" style={{ color: color.muted }}>
                  Choose a strong password
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg border px-3 py-2.5 text-xs font-medium text-center"
                  style={{
                    borderColor: `${color.purpleDark}33`,
                    background: `${color.purpleDark}1a`,
                    color: color.muted,
                  }}
                >
                  Password updated! Redirecting to sign in…
                </motion.div>
              ) : (
                <Form {...form}>
                  <motion.form
                    variants={formContainerVariants}
                    initial="hidden"
                    animate="visible"
                    onSubmit={form.handleSubmit(onSubmit)}
                    noValidate
                    className="space-y-4"
                  >
                    <AnimatePresence mode="wait">
                      {serverError && (
                        <motion.div
                          key="server-error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div
                            role="alert"
                            className="rounded-lg border px-3 py-2.5 text-xs font-medium mb-2"
                            style={{
                              borderColor: `${color.red}33`,
                              background: `${color.red}1a`,
                              color: color.red,
                            }}
                          >
                            {serverError}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div variants={formFieldVariants}>
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel
                              className="text-xs font-semibold uppercase tracking-widest"
                              style={{ color: color.muted }}
                            >
                              New password
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className="border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage style={{ color: color.red }} />
                          </FormItem>
                        )}
                      />
                    </motion.div>

                    <motion.div variants={formFieldVariants}>
                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel
                              className="text-xs font-semibold uppercase tracking-widest"
                              style={{ color: color.muted }}
                            >
                              Confirm password
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className="border-white/8 text-white focus-visible:ring-0 focus-visible:border-brand-purple-dark/50"
                                style={{ background: bg.surface }}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage style={{ color: color.red }} />
                          </FormItem>
                        )}
                      />
                    </motion.div>

                    <motion.div variants={formFieldVariants}>
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
                        {form.formState.isSubmitting ? 'Updating…' : 'Update password'}
                      </Button>
                    </motion.div>
                  </motion.form>
                </Form>
              )}
            </div>
          </div>
        </motion.div>
      </AuthLayout>
    </>
  );
}
