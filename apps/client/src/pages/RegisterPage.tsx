import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { AuthLayout } from '@/components/AuthLayout';
import { bg, color, gradient, radius } from '@/lib/tokens';

// ─── Animation variants ──────────────────────────────────────────────────────

const formContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const formFieldVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: 'easeOut' as const } },
};

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(20, 'Max 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscore only'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(72, 'Max 72 characters')
    .regex(/(?=.*[a-z])/, 'Must include a lowercase letter')
    .regex(/(?=.*[A-Z])/, 'Must include an uppercase letter')
    .regex(/(?=.*[0-9])/, 'Must include a number')
    .regex(/(?=.*[^a-zA-Z0-9])/, 'Must include a special character'),
  acceptedTerms: z.boolean().refine((val) => val, {
    message: 'You must accept the terms and privacy policy',
  }),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', username: '', password: '', acceptedTerms: false },
  });

  async function onSubmit(data: RegisterForm) {
    setServerError(null);
    try {
      const { accessToken, user } = await authApi.register(data);
      setAuth(accessToken, user);
      void navigate('/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <AuthLayout>
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
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
                boxShadow: `0 0 24px ${color.purpleDark}80`,
              }}
            >
              <span className="text-lg font-black text-white">CPT</span>
            </motion.div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Create account</h1>
              <p className="mt-0.5 text-sm" style={{ color: color.muted }}>
                Start paper trading in seconds
              </p>
            </div>
          </div>

          <Form {...form}>
            <motion.form
              variants={formContainerVariants}
              initial="hidden"
              animate="visible"
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="space-y-4"
            >
              <AnimatePresence>
                {serverError && (
                  <motion.div
                    key="server-error"
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                    role="alert"
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
              </AnimatePresence>

              <motion.div variants={formFieldVariants}>
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
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel
                        className="text-xs font-semibold uppercase tracking-widest"
                        style={{ color: color.muted }}
                      >
                        Username
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="satoshi_nakamoto"
                          autoComplete="username"
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel
                        className="text-xs font-semibold uppercase tracking-widest"
                        style={{ color: color.muted }}
                      >
                        Password
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
                  name="acceptedTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-1">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="grid gap-1.5 leading-none">
                        <FormLabel
                          className="text-xs font-medium cursor-pointer"
                          style={{ color: color.muted }}
                        >
                          I have read and agree to the{' '}
                          <Link
                            to="/terms"
                            className="transition-colors hover:text-brand-purple"
                            style={{ color: color.purpleDark }}
                          >
                            Terms of Use
                          </Link>{' '}
                          and{' '}
                          <Link
                            to="/privacy"
                            className="transition-colors hover:text-brand-purple"
                            style={{ color: color.purpleDark }}
                          >
                            Privacy Policy
                          </Link>
                        </FormLabel>
                        <FormMessage style={{ color: color.red }} />
                      </div>
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div
                variants={formFieldVariants}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <button
                  type="submit"
                  className="w-full h-8 flex items-center justify-center font-bold tracking-wide text-white transition-all"
                  style={{
                    background: form.formState.isSubmitting
                      ? `${color.purpleDark}80`
                      : gradient.brand,
                    borderRadius: radius.button,
                    boxShadow: `0 0 20px ${gradient.brandFrom}55`,
                    fontSize: '14px',
                  }}
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
                </button>
              </motion.div>

              <motion.p
                variants={formFieldVariants}
                className="text-center text-[10px] leading-tight"
                style={{ color: `${color.muted}99` }}
              >
                ⚠️ <strong>No Financial Advice:</strong> This is a paper trading simulator for
                educational purposes only. No real funds are involved. Simulated results do not
                guarantee future performance.
              </motion.p>

              <motion.p
                variants={formFieldVariants}
                className="text-center text-sm"
                style={{ color: color.muted }}
              >
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold transition-colors hover:text-brand-purple"
                  style={{ color: color.purpleDark }}
                >
                  Sign in
                </Link>
              </motion.p>
            </motion.form>
          </Form>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
