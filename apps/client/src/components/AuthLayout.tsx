import { type ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { bg } from '@/lib/tokens';
import homeBg from '@/assets/home-bg.svg';

interface AuthLayoutProps {
  children: ReactNode;
  hideFooter?: boolean;
  centerContent?: boolean;
}

export function AuthLayout({
  children,
  hideFooter = false,
  centerContent = false,
}: AuthLayoutProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col"
      style={{
        background: `linear-gradient(180deg, ${bg.deep} 0%, ${bg.page} 30%, ${bg.navy} 100%)`,
      }}
    >
      {/* Home page background pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: `url(${homeBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <main
        className={`relative z-10 flex flex-1 flex-col items-center${centerContent || hideFooter ? ' justify-center p-4' : ''}`}
      >
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}
