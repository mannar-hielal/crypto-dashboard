import { motion } from 'framer-motion';
import { CRYPTO_ICON_URLS } from '@/lib/cryptoIcons';
import { bg } from '@/lib/tokens';

const popIn = {
  initial: { scale: 0.5, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 22 },
};

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
  const url = CRYPTO_ICON_URLS[symbol.toUpperCase()];

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
