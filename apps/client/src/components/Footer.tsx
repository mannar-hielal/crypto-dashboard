import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="px-4 py-6 text-center">
      <p className="text-muted-foreground text-xs">
        ⚠️ Paper trading only — no real money involved. For educational purposes only.
      </p>
      <nav className="mt-2 flex items-center justify-center gap-3 text-xs" aria-label="Footer">
        <Link
          to="/terms"
          className="text-muted-foreground hover:text-foreground underline-offset-4 transition-colors hover:underline"
        >
          Terms of Use
        </Link>
        <span className="text-muted-foreground/40" aria-hidden="true">
          ·
        </span>
        <Link
          to="/privacy"
          className="text-muted-foreground hover:text-foreground underline-offset-4 transition-colors hover:underline"
        >
          Privacy Policy
        </Link>
      </nav>
      <p className="text-muted-foreground/50 mt-2 text-xs">
        © {new Date().getFullYear()} Crypto Dashboard
      </p>
    </footer>
  );
}
