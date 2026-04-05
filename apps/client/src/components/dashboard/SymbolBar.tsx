import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import {
  Star,
  ChevronDown,
  ChevronUp,
  Search,
  TrendingUp,
  TrendingDown,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarketStore } from '@/store/marketStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

const INTERVAL_LABELS: Record<(typeof INTERVALS)[number], string> = {
  '1m': '1 Minute',
  '5m': '5 Minutes',
  '15m': '15 Minutes',
  '1h': '1 Hour',
  '4h': '4 Hours',
  '1d': '1 Day',
};

interface SymbolEntry {
  symbol: string;
  base: string;
  label: string;
}

const SYMBOLS: SymbolEntry[] = [
  { symbol: 'BTCUSDT', base: 'BTC', label: 'Bitcoin' },
  { symbol: 'ETHUSDT', base: 'ETH', label: 'Ethereum' },
  { symbol: 'SOLUSDT', base: 'SOL', label: 'Solana' },
  { symbol: 'BNBUSDT', base: 'BNB', label: 'BNB' },
  { symbol: 'XRPUSDT', base: 'XRP', label: 'XRP' },
  { symbol: 'DOGEUSDT', base: 'DOGE', label: 'Dogecoin' },
  { symbol: 'ADAUSDT', base: 'ADA', label: 'Cardano' },
  { symbol: 'AVAXUSDT', base: 'AVAX', label: 'Avalanche' },
  { symbol: 'LINKUSDT', base: 'LINK', label: 'Chainlink' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVol(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(2);
}

// ─── StatItem ─────────────────────────────────────────────────────────────────

function StatItem({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color =
    positive === true ? '#02c076' : positive === false ? '#f6465d' : 'rgba(255,255,255,0.6)';

  return (
    <div className="flex flex-col gap-px">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-[#848e9c]">
        {label}
      </span>
      <span className="text-[11px] tabular-nums font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ─── SymbolBar ────────────────────────────────────────────────────────────────

interface SymbolBarProps {
  /** Whether the right-side TradingPanel is currently open */
  tradingPanelOpen: boolean;
  /** Called when the user clicks the panel toggle button */
  onToggleTrading: () => void;
}

/**
 * SymbolBar — Trading sub-header (row 2)
 *
 * Contains all trading-specific controls:
 *   Left  : ⭐ · Symbol picker dropdown · Price · 24h change%
 *   Center: 24h stats (change, high, low, volume)
 *   Right : Timeframe buttons · Panel toggle · Connection status
 */
export function SymbolBar({ tradingPanelOpen, onToggleTrading }: SymbolBarProps) {
  const symbol = useMarketStore((s) => s.symbol);
  const interval = useMarketStore((s) => s.interval);
  const changeInterval = useMarketStore((s) => s.setInterval);
  const changeSymbol = useMarketStore((s) => s.setSymbol);
  const latestPrice = useMarketStore((s) => s.latestPrice);
  const priceChange = useMarketStore((s) => s.priceChange);
  const bars = useMarketStore((s) => s.bars);
  const isConnected = useMarketStore((s) => s.isConnected);

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');

  // ── Derived price stats ──────────────────────────────────────────────────
  const prevClose = latestPrice !== null && priceChange !== null ? latestPrice - priceChange : null;
  const changePercent =
    prevClose !== null && prevClose !== 0 && priceChange !== null
      ? (priceChange / prevClose) * 100
      : null;
  const isPositive = (priceChange ?? 0) >= 0;

  // ── 24h stats from available bars ───────────────────────────────────────
  const high24h = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : null;
  const low24h = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : null;
  const vol24h = bars.length > 0 ? bars.reduce((sum, b) => sum + b.volume, 0) : null;

  const activeEntry = SYMBOLS.find((s) => s.symbol === symbol);
  const filteredSymbols = SYMBOLS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
      s.label.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  function handleSymbolSelect(sym: string) {
    if (sym !== symbol) changeSymbol(sym);
    setSymbolOpen(false);
    setSymbolSearch('');
  }

  return (
    <div
      className="flex h-11 w-full shrink-0 items-center gap-3 border-b border-white/[0.06] px-3"
      style={{ background: '#0f1020' }}
    >
      {/* ── Star (favourite placeholder) ────────────────────────────────── */}
      <button
        title="Add to favourites"
        className="shrink-0 text-[#848e9c] transition-colors hover:text-[#f0b90b]"
      >
        <Star className="h-3.5 w-3.5" />
      </button>

      {/* ── Symbol picker ────────────────────────────────────────────────── */}
      <div className="relative shrink-0">
        <motion.button
          onClick={() => {
            setSymbolOpen((p) => !p);
            setSymbolSearch('');
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-bold text-white transition-colors"
          style={{
            background: symbolOpen ? '#131628' : 'transparent',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="tracking-wide">{activeEntry?.base ?? symbol.replace('USDT', '')}</span>
          <span className="text-[11px] font-normal text-[#848e9c]">/USDT</span>
          {symbolOpen ? (
            <ChevronUp className="h-3 w-3 text-[#848e9c]" />
          ) : (
            <ChevronDown className="h-3 w-3 text-[#848e9c]" />
          )}
        </motion.button>

        <AnimatePresence>
          {symbolOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setSymbolOpen(false)} />

              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-white/[0.08] shadow-2xl"
                style={{ background: '#0f1020' }}
              >
                {/* Search */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                  <Search className="h-3 w-3 shrink-0 text-[#848e9c]" />
                  <input
                    autoFocus
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-xs text-white placeholder-[#848e9c]/50 outline-none"
                  />
                </div>

                {/* Symbol list */}
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredSymbols.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-[#848e9c]">No results</p>
                  ) : (
                    filteredSymbols.map((entry) => {
                      const isActive = entry.symbol === symbol;
                      return (
                        <motion.button
                          key={entry.symbol}
                          onClick={() => handleSymbolSelect(entry.symbol)}
                          whileHover={{ background: '#131628' }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-black text-white"
                              style={{
                                background: isActive ? '#7b2ff7' : '#131628',
                                border: '1px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              {entry.base.slice(0, 2)}
                            </span>
                            <div>
                              <p
                                className={`text-xs font-bold ${isActive ? 'text-[#a855f7]' : 'text-white'}`}
                              >
                                {entry.base}/USDT
                              </p>
                              <p className="text-[10px] text-[#848e9c]">{entry.label}</p>
                            </div>
                          </div>
                          {isActive && (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background: '#7b2ff7',
                                boxShadow: '0 0 4px 2px #7b2ff760',
                              }}
                            />
                          )}
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* ── Live price + change% ─────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 tabular-nums">
        {latestPrice !== null ? (
          <>
            <NumberFlow
              value={latestPrice}
              format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
              className="text-sm font-bold text-white"
            />
            {changePercent !== null && (
              <span
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{
                  background: isPositive ? '#02c07618' : '#f6465d18',
                  color: isPositive ? '#02c076' : '#f6465d',
                }}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isPositive ? '+' : ''}
                {changePercent.toFixed(2)}%
              </span>
            )}
          </>
        ) : (
          <div className="h-4 w-24 rounded shimmer-bg" />
        )}
      </div>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* ── 24h stats ────────────────────────────────────────────────────── */}
      <div className="hidden items-center gap-5 overflow-hidden lg:flex">
        <StatItem
          label="24h Change"
          value={
            changePercent !== null ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%` : '—'
          }
          positive={changePercent !== null ? isPositive : undefined}
        />
        <StatItem
          label="↑ 24h High"
          value={
            high24h !== null
              ? high24h.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'
          }
        />
        <StatItem
          label="↓ 24h Low"
          value={
            low24h !== null
              ? low24h.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'
          }
        />
        <StatItem label="24h Volume (USDT)" value={vol24h !== null ? formatVol(vol24h) : '—'} />
      </div>

      {/* Push timeframes + status to the right */}
      <div className="flex-1" />

      {/* ── Timeframe buttons ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5">
        {INTERVALS.map((tf) => (
          <motion.button
            key={tf}
            onClick={() => changeInterval(tf)}
            title={INTERVAL_LABELS[tf]}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              interval === tf ? 'text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            {interval === tf && (
              <motion.span
                layoutId="active-tf"
                className="absolute inset-0 rounded"
                style={{ background: '#7b2ff720' }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className={`relative z-10 ${interval === tf ? 'text-[#a855f7]' : ''}`}>{tf}</span>
          </motion.button>
        ))}
      </div>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* ── Trade panel toggle ───────────────────────────────────────────── */}
      <motion.button
        onClick={onToggleTrading}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={tradingPanelOpen ? 'Hide trade panel' : 'Show trade panel'}
        className="relative flex shrink-0 items-center justify-center rounded p-1 transition-colors"
        style={{ color: tradingPanelOpen ? '#a855f7' : '#848e9c' }}
      >
        {tradingPanelOpen ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <PanelRightOpen className="h-4 w-4" />
        )}
        {/* Subtle pulsing ring when panel is hidden — guides user to re-open */}
        {!tradingPanelOpen && (
          <motion.span
            className="absolute inset-0 rounded"
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'rgba(168,85,247,0.12)', pointerEvents: 'none' }}
          />
        )}
      </motion.button>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* ── Connection status ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={isConnected ? 'pulse-live-dot' : ''}
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isConnected ? '#02c076' : '#848e9c',
          }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: isConnected ? '#02c076' : '#848e9c' }}
        >
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
