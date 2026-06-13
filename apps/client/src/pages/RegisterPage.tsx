import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AuthLayout } from '@/components/AuthLayout';
import { gradient, radius } from '@/lib/tokens';

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
  acceptedTerms: z.boolean().refine((val) => val === true, {
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
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create account</CardTitle>
            <CardDescription>Start paper trading in seconds</CardDescription>
          </CardHeader>
          <CardContent>
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
                    >
                      <Alert variant="destructive">
                        <AlertDescription>{serverError}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div variants={formFieldVariants}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
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
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="satoshi_nakamoto"
                            autoComplete="username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
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
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            autoComplete="new-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
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
                          <FormLabel className="text-xs font-medium text-muted-foreground cursor-pointer">
                            I have read and agree to the{' '}
                            <Link to="/terms" className="text-primary hover:underline">
                              Terms of Use
                            </Link>{' '}
                            and{' '}
                            <Link to="/privacy" className="text-primary hover:underline">
                              Privacy Policy
                            </Link>
                          </FormLabel>
                          <FormMessage />
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
                  <Button
                    type="submit"
                    className="w-full font-bold tracking-wide text-white"
                    style={{
                      background: form.formState.isSubmitting
                        ? 'rgba(100,91,237,0.5)'
                        : gradient.brand,
                      borderRadius: radius.button,
                      boxShadow: `0 0 20px ${gradient.brandFrom}55`,
                    }}
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
                  </Button>
                </motion.div>

                <motion.p
                  variants={formFieldVariants}
                  className="text-center text-[10px] leading-tight text-muted-foreground/60"
                >
                  ⚠️ <strong>No Financial Advice:</strong> This is a paper trading simulator for
                  educational purposes only. No real funds are involved. Simulated results do not
                  guarantee future performance.
                </motion.p>

                <motion.p
                  variants={formFieldVariants}
                  className="text-muted-foreground text-center text-sm"
                >
                  Already have an account?{' '}
                  <Link to="/login" className="underline">
                    Sign in
                  </Link>
                </motion.p>
              </motion.form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </AuthLayout>
  );
}
