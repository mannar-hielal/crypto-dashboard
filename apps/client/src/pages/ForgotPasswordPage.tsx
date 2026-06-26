import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
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

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

const formContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};

const formFieldVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
};

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(data: ForgotForm) {
    await authApi.forgotPassword(data);
    // 🔐 Always show success — never reveal whether the email exists
    setSubmitted(true);
  }

  return (
    <>
      <SeoHead
        title="Reset Password"
        description="Reset your cryptopapertrade.com account password."
        path="/forgot-password"
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
                <h1 className="text-xl font-bold text-white">Forgot password?</h1>
                <p className="mt-0.5 text-sm" style={{ color: color.muted }}>
                  Enter your email to receive a reset link
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border px-3 py-2.5 text-xs font-medium"
                  style={{
                    borderColor: `${color.purpleDark}33`,
                    background: `${color.purpleDark}1a`,
                    color: color.muted,
                  }}
                >
                  If that email exists, a reset link has been sent. Check your inbox.
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
                        {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
                      </button>
                    </motion.div>
                  </motion.form>
                </Form>
              )}

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center text-sm"
                style={{ color: color.muted }}
              >
                <Link
                  to="/login"
                  className="font-semibold transition-colors hover:text-brand-purple"
                  style={{ color: color.purpleDark }}
                >
                  Back to sign in
                </Link>
              </motion.p>
            </div>
          </div>
        </motion.div>
      </AuthLayout>
    </>
  );
}
