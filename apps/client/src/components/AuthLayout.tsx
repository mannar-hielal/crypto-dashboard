import { type ReactNode } from 'react';
import { Footer } from '@/components/Footer';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Shared layout for all auth pages (Login, Register, ForgotPassword, ResetPassword).
 * Centers the card vertically and pins the footer to the bottom.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center p-4">{children}</main>
      <Footer />
    </div>
  );
}
