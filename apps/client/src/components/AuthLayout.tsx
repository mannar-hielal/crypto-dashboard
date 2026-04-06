import { type ReactNode } from 'react';
import { Footer } from '@/components/Footer';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Shared layout for all auth pages (Login, Register, ForgotPassword, ResetPassword).
 * EXGEN-inspired: deep navy background with animated ambient glow blobs.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: '#0b0c1a' }}
    >
      {/* Ambient glow blobs */}
      <div
        className="pointer-events-none absolute -top-48 left-1/4 h-[480px] w-[480px] rounded-full opacity-[0.07]"
        style={{
          background: 'radial-gradient(circle, #7b2ff7 0%, transparent 70%)',
          animation: 'drift 18s ease-in-out infinite',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-1/4 h-[380px] w-[380px] rounded-full opacity-[0.05]"
        style={{
          background: 'radial-gradient(circle, #02c076 0%, transparent 70%)',
          animation: 'drift 24s ease-in-out infinite reverse',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center p-4">{children}</main>
      <Footer />
    </div>
  );
}
