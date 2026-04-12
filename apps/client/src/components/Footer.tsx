import { Link } from 'react-router';
import { bg, color, fontSize } from '@/lib/tokens';

export function Footer() {
  return (
    <footer className="px-4 py-6 text-center" style={{ background: bg.footer }}>
      <p style={{ fontSize: fontSize.xs, color: color.muted }}>
        ⚠️ Paper trading only — no real money involved. For educational purposes only.
      </p>
      <nav className="mt-2 flex items-center justify-center gap-3" aria-label="Footer">
        <Link
          to="/terms"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Terms of Use
        </Link>
        <span style={{ color: `${color.muted}40` }} aria-hidden="true">
          ·
        </span>
        <Link
          to="/privacy"
          className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
          style={{ fontSize: fontSize.xs, color: color.muted }}
        >
          Privacy Policy
        </Link>
      </nav>
      <p className="mt-2" style={{ fontSize: fontSize.xs, color: `${color.muted}60` }}>
        © {new Date().getFullYear()} Crypto Dashboard
      </p>
    </footer>
  );
}
