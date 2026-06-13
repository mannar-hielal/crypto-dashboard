import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { Footer } from '@/components/Footer';
import { bg, color } from '@/lib/tokens';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared layout for legal pages (Terms of Use, Privacy Policy).
 * Matches the app's EXGEN dark theme — ambient blobs, brand tokens, panel header.
 */
export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: bg.page }}
    >
      {/* Ambient glow blobs */}
      <div
        className="pointer-events-none absolute -top-48 left-1/4 h-[480px] w-[480px] rounded-full opacity-[0.07]"
        style={{
          background: `radial-gradient(circle, ${color.purpleDark} 0%, transparent 70%)`,
          animation: 'drift 18s ease-in-out infinite',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-1/4 h-[380px] w-[380px] rounded-full opacity-[0.05]"
        style={{
          background: `radial-gradient(circle, ${color.purple} 0%, transparent 70%)`,
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

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {/* Back navigation */}
        <Link
          to="/login"
          className="mb-8 inline-flex items-center gap-1.5 text-sm transition-colors hover:text-white"
          style={{ color: color.muted }}
        >
          ← Back
        </Link>

        {/* Page header */}
        <div
          className="mb-8 rounded-xl border px-6 py-6"
          style={{ background: bg.panel, borderColor: `${color.purpleDark}33` }}
        >
          {/* Brand mark row */}
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
                boxShadow: `0 0 18px ${color.purpleDark}60`,
              }}
            >
              <span className="text-xs font-black text-white">CD</span>
            </div>
            <span className="text-sm font-semibold tracking-wide text-white">Crypto Dashboard</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm" style={{ color: color.muted }}>
            Last updated: {lastUpdated}
          </p>

          {/* Development notice */}
          <div
            className="mt-4 rounded-lg border px-4 py-2.5 text-sm font-medium"
            style={{
              borderColor: `${color.amber}40`,
              background: `${color.amber}14`,
              color: color.amber,
            }}
          >
            ⚠️ This platform is in active development (Phase 1). These terms will be updated as new
            features are added.
          </div>
        </div>

        {/* Legal content */}
        <div className="legal-content" style={{ color: color.muted }}>
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
