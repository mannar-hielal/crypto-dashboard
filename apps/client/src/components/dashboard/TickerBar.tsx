/**
 * TickerBar
 *
 * EXGEN-style scrolling market ticker at the bottom of the dashboard.
 * Shows popular crypto pairs with color-coded 24h price changes.
 * The active symbol price is wired to the market store (live); the rest are static.
 */

import { motion } from 'framer-motion';
import { useMarketStore } from '@/store/marketStore';
import { bg, color, fontSize } from '@/lib/tokens';
import { CryptoIcon } from '@/components/ui/CryptoIcon';

// Static 24-h snapshots for non-live tickers (cosmetic / placeholder)
const STATIC_TICKERS = [
  { symbol: 'BTC/USDT', price: '83,412.50', change: '+2.14%', positive: true },
  { symbol: 'ETH/USDT', price: '1,582.30', change: '+1.84%', positive: true },
  { symbol: 'SOL/USDT', price: '120.45', change: '+1.45%', positive: true },
  { symbol: 'BNB/USDT', price: '598.40', change: '-0.83%', positive: false },
  { symbol: 'XRP/USDT', price: '2.20', change: '+3.12%', positive: true },
  { symbol: 'DOGE/USDT', price: '0.1804', change: '+12.00%', positive: true },
  { symbol: 'ADA/USDT', price: '0.635', change: '+1.89%', positive: true },
  { symbol: 'AVAX/USDT', price: '19.87', change: '-2.45%', positive: false },
  { symbol: 'LINK/USDT', price: '13.24', change: '+4.21%', positive: true },
];

function TickerItem({
  symbol,
  price,
  change,
  positive,
  isLive = false,
}: {
  symbol: string;
  price: string;
  change: string;
  positive: boolean;
  isLive?: boolean;
}) {
  const itemColor = positive ? color.green : color.red;
  const arrow = positive ? '↑' : '↓';
  const base = symbol.split('/')[0];

  return (
    <span
      className="relative flex shrink-0 items-center gap-2 px-4"
      style={{ fontSize: fontSize.xs11 }}
    >
      {/* Live pulse overlay */}
      {isLive && (
        <motion.span
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: [0.0, 0.12, 0.0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: color.purpleDark, borderRadius: 4 }}
        />
      )}
      <CryptoIcon symbol={base} size={14} />
      <span className="font-semibold text-white/80">{symbol}</span>
      <span className="tabular-nums text-white/60">{price}</span>
      <span style={{ color: itemColor }} className="tabular-nums font-medium">
        {change}&nbsp;{arrow}
      </span>
      {/* Live indicator dot / static separator dot */}
      {isLive ? (
        <span
          className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full pulse-live-dot"
          style={{ background: color.green }}
        />
      ) : (
        <span className="ml-2 h-1 w-1 rounded-full bg-white/10" />
      )}
    </span>
  );
}

export function TickerBar() {
  const latestPrice = useMarketStore((s) => s.latestPrice);
  const priceChange = useMarketStore((s) => s.priceChange);
  const symbol = useMarketStore((s) => s.symbol);

  // Build live ticker for the currently active symbol
  const prevClose = latestPrice !== null && priceChange !== null ? latestPrice - priceChange : null;
  const changePct =
    prevClose && prevClose !== 0 && priceChange !== null ? (priceChange / prevClose) * 100 : null;
  const isPositive = (priceChange ?? 0) >= 0;

  const liveSymbolDisplay = symbol.replace('USDT', '/USDT');

  const liveTicker = {
    symbol: liveSymbolDisplay,
    price: latestPrice
      ? latestPrice.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—',
    change: changePct !== null ? `${isPositive ? '+' : ''}${changePct.toFixed(2)}%` : '—',
    positive: isPositive,
  };

  // Exclude the active symbol from the static list to avoid duplicates
  const staticFiltered = STATIC_TICKERS.filter((t) => t.symbol !== liveSymbolDisplay);

  // Merge live (first) + remaining statics, then duplicate for seamless loop
  const items = [liveTicker, ...staticFiltered];
  const doubled = [...items, ...items]; // duplicate → seamless loop

  return (
    <div
      className="flex h-8 shrink-0 items-center overflow-hidden border-t border-white/[0.06]"
      style={{ background: bg.page }}
    >
      {/* "Popular" label — fixed left anchor */}
      <div className="flex h-full shrink-0 items-center gap-1.5 border-r border-white/[0.06] bg-bg-panel px-3">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color.purpleDark, boxShadow: `0 0 6px 2px ${color.purpleDark}60` }}
        />
        <span
          className="font-semibold uppercase tracking-widest"
          style={{ fontSize: fontSize.xs10, color: color.purpleDark }}
        >
          Popular
        </span>
      </div>

      {/* Scrolling band */}
      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        {/* Fade-out masks at edges */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8"
          style={{ background: `linear-gradient(to right, ${bg.page}, transparent)` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
          style={{ background: `linear-gradient(to left, ${bg.page}, transparent)` }}
        />

        {/* The scrolling content — CSS animation avoids framer-motion overhead */}
        <div className="ticker-scroll flex items-center">
          {doubled.map((item, i) => (
            <TickerItem
              key={`${item.symbol}-${i < items.length ? 'a' : 'b'}`}
              {...item}
              isLive={i === 0 || i === items.length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
