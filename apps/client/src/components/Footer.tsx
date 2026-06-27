import { Link } from 'react-router';
import { TrustBadges } from '@/components/TrustBadges';
import { bg, color, fontSize } from '@/lib/tokens';

export function Footer() {
  return (
    <footer
      className="relative px-4 py-6 text-center"
      style={{
        background: bg.panel,
        zIndex: 1,
      }}
    >
      <div className="mb-5 flex justify-center">
        <TrustBadges />
      </div>
      <p style={{ fontSize: fontSize.xs, color: color.muted }}>
        ⚠️ Paper trading only — no real money involved. For educational purposes only.
      </p>
      <nav
        className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5"
        aria-label="Footer"
      >
        <Link
          to="/terms"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Terms of Service
        </Link>
        <Link
          to="/privacy"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Privacy Policy
        </Link>
        <Link
          to="/security"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Security
        </Link>
        <Link
          to="/aup"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Acceptable Use Policy
        </Link>
      </nav>
      <p className="mt-2" style={{ fontSize: fontSize.xs, color: color.muted }}>
        © {new Date().getFullYear()} cryptopapertrade.com
      </p>
    </footer>
  );
}
