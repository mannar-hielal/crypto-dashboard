import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { Footer } from '@/components/Footer';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared layout for legal pages (Terms of Use, Privacy Policy).
 * Provides a readable max-width container with a back link and footer.
 */
export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {/* Back navigation */}
        <Link
          to="/login"
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm underline-offset-4 transition-colors hover:underline"
        >
          ← Back
        </Link>

        {/* Page header */}
        <div className="mb-8 border-b pb-6">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: {lastUpdated}</p>
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ This platform is in active development (Phase 1). These terms will be updated as new
            features are added.
          </p>
        </div>

        {/* Legal content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
