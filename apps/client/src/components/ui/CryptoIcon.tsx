import { motion } from 'framer-motion';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { bg } from '@/lib/tokens';

// ─── Shared animation ─────────────────────────────────────────────────────────

const popIn = {
  initial: { scale: 0.5, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 22 },
};

// ─── CryptoIcon ───────────────────────────────────────────────────────────────

interface CryptoIconProps {
  /** Base symbol — e.g. 'BTC', 'ETH'. Case-insensitive. */
  symbol: string;
  /** Diameter in px. Default 20. */
  size?: number;
  className?: string;
}

/**
 * CryptoIcon
 *
 * Renders the branded circular SVG icon for a crypto base symbol.
 * Falls back to a 2-letter text badge when the symbol is not in the map.
 *
 * Icons are Vite-bundled static assets (cryptocurrency-icons pkg, ?url import)
 * — offline-ready for PWA, zero runtime dependencies.
 */
export function CryptoIcon({ symbol, size = 20, className = '' }: CryptoIconProps) {
  // Cast to Record<string, string> at lookup — CRYPTO_ICON_URLS is narrowed to
  // exact literal keys by `satisfies`, so a plain string index requires this cast.
  const url = (CRYPTO_ICON_URLS as Record<string, string | undefined>)[symbol.toUpperCase()];

  if (!url) {
    return (
      <motion.span
        {...popIn}
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-white ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(7, Math.floor(size * 0.42)) + 'px',
          background: bg.surface,
          border: '1px solid rgba(255,255,255,0.10)',
          flexShrink: 0,
        }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </motion.span>
    );
  }

  return (
    <motion.img
      {...popIn}
      src={url}
      alt={symbol}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 rounded-full ${className}`}
      style={{ display: 'inline-block', minWidth: size }}
    />
  );
}

// ─── SymbolPair ───────────────────────────────────────────────────────────────

interface SymbolPairProps {
  /**
   * Base asset symbol — e.g. 'BTC'. Case-insensitive.
   * Rendered as the larger front icon.
   */
  base: string;
  /**
   * Quote asset symbol — e.g. 'USDT'. Case-insensitive.
   * Rendered as the smaller overlapping icon at bottom-right.
   */
  quote?: string;
  /** Diameter of the base icon in px. Quote icon is 65% of this. Default 16. */
  baseSize?: number;
}

/**
 * SymbolPair
 *
 * Renders two stacked coin icons (base + quote) in the TVP style:
 * the base coin sits at full size in front; the quote coin overlaps at the
 * bottom-right at ~65% size with a 1 px panel-coloured ring separating them.
 * Falls back gracefully to the CryptoIcon text badge for unknown symbols.
 */
export function SymbolPair({ base, quote = 'USDT', baseSize = 16 }: SymbolPairProps) {
  const quoteSize = Math.round(baseSize * 0.65);
  // Total width: base icon + half of quote icon peeking out to the right
  const containerW = baseSize + Math.round(quoteSize * 0.45);

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: containerW, height: baseSize }}
      aria-label={`${base}/${quote}`}
    >
      {/* Base coin — sits at the left / front */}
      <span className="absolute left-0 top-0" style={{ zIndex: 1 }}>
        <CryptoIcon symbol={base} size={baseSize} />
      </span>
      {/* Quote coin — overlaps bottom-right, ring punches it out of the base icon */}
      <span
        className="absolute rounded-full"
        style={{
          right: 0,
          bottom: 0,
          zIndex: 2,
          padding: 1,
          background: bg.panel,
          lineHeight: 0,
        }}
      >
        <CryptoIcon symbol={quote} size={quoteSize} />
      </span>
    </span>
  );
}
