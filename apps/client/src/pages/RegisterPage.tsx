import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
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
import { AuthLayout } from '@/components/AuthLayout';
import { gradient, radius } from '@/lib/tokens';

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
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', username: '', password: '' },
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {serverError && (
                  <Alert variant="destructive">
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

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

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="satoshi_nakamoto" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                <p className="text-muted-foreground text-center text-sm">
                  Already have an account?{' '}
                  <Link to="/login" className="underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </AuthLayout>
  );
}
