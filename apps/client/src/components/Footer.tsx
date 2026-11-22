import { Link } from 'react-router';
import { TrustBadges } from '@/components/TrustBadges';
import { bg, color, fontSize } from '@/lib/tokens';

// The public pages' own links first (internal links for visitors and search engines), then the legal ones
const LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/chart', label: 'Live chart' },
  { to: '/blog', label: 'Blog' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/security', label: 'Security' },
  { to: '/aup', label: 'Acceptable Use Policy' },
] as const;

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

export function Footer() {
  // Before launch there is no chart to link to
  const links = LINKS.filter((l) => isLive || l.to !== '/chart');
  return (
    <footer
      className="relative px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
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
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="underline-offset-4 transition-colors hover:underline hover:text-brand-muted"
            style={{ fontSize: fontSize.xs, color: color.muted }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-2" style={{ fontSize: fontSize.xs, color: color.muted }}>
        © {new Date().getFullYear()} cryptopapertrade.com
      </p>
    </footer>
  );
}
