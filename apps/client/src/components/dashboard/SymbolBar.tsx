import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import NumberFlow from '@number-flow/react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import {
  Menu,
  Star,
  ChevronDown,
  ChevronUp,
  Search,
  TrendingUp,
  TrendingDown,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { SYMBOLS } from '@/lib/markets';
import { bg, color, fontSize } from '@/lib/tokens';

import { SymbolPair } from '@/components/ui/CryptoIcon';
import { ChartLayoutPicker } from '@/components/dashboard/ChartLayoutPicker';
import { IntervalDropdown } from '@/components/dashboard/IntervalDropdown';

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
  const statColor =
    positive === true ? color.green : positive === false ? color.red : `${color.white}99`;
  return (
    <div className="flex flex-col gap-px">
      <span
        className="font-semibold uppercase tracking-wider"
        style={{ fontSize: fontSize.xxs, color: color.muted }}
      >
        {label}
      </span>
      <span
        className="tabular-nums font-semibold"
        style={{ fontSize: fontSize.xs11, color: statColor }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── SymbolBar ────────────────────────────────────────────────────────────────

interface SymbolBarProps {
  tradingPanelOpen: boolean;
  onToggleTrading: () => void;
  leftToolbarOpen: boolean;
  onToggleLeftToolbar: () => void;
}

export function SymbolBar({
  tradingPanelOpen,
  onToggleTrading,
  leftToolbarOpen,
  onToggleLeftToolbar,
}: SymbolBarProps) {
  // ── Active pane config from layoutStore ──────────────────────────────────
  const activePane = useLayoutStore((s) => s.activePane);
  const paneConfig = useLayoutStore((s) => s.panes[s.activePane]);
  const setPaneSymbol = useLayoutStore((s) => s.setPaneSymbol);
  const setPaneInterval = useLayoutStore((s) => s.setPaneInterval);
  const setPaneTimeRangePreset = useLayoutStore((s) => s.setPaneTimeRangePreset);

  const { symbol, interval } = paneConfig;

  // ── Market data — subscribe to all 4 pane stores, pick the active one ────
  // (4 unconditional hook calls — hooks rule compliant)
  const d0 = useStore(
    paneStores[0],
    useShallow((s) => ({
      latestPrice: s.latestPrice,
      priceChange: s.priceChange,
      bars: s.bars,
      isConnected: s.isConnected,
    }))
  );
  const d1 = useStore(
    paneStores[1],
    useShallow((s) => ({
      latestPrice: s.latestPrice,
      priceChange: s.priceChange,
      bars: s.bars,
      isConnected: s.isConnected,
    }))
  );
  const d2 = useStore(
    paneStores[2],
    useShallow((s) => ({
      latestPrice: s.latestPrice,
      priceChange: s.priceChange,
      bars: s.bars,
      isConnected: s.isConnected,
    }))
  );
  const d3 = useStore(
    paneStores[3],
    useShallow((s) => ({
      latestPrice: s.latestPrice,
      priceChange: s.priceChange,
      bars: s.bars,
      isConnected: s.isConnected,
    }))
  );

  const allData = [d0, d1, d2, d3];
  const { latestPrice, priceChange, bars, isConnected } = allData[activePane];

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolMenuPos, setSymbolMenuPos] = useState({ top: 0, left: 0 });
  const symbolTriggerRef = useRef<HTMLButtonElement>(null);

  const isSyncing = usePaperStore((s) => s.isSyncing);
  const lastSyncAt = usePaperStore((s) => s.lastSyncAt);

  // ── Derived price stats ──────────────────────────────────────────────────
  const prevClose = latestPrice !== null && priceChange !== null ? latestPrice - priceChange : null;
  const changePercent =
    prevClose !== null && prevClose !== 0 && priceChange !== null
      ? (priceChange / prevClose) * 100
      : null;
  const isPositive = (priceChange ?? 0) >= 0;

  // ── Stats from loaded bars — single O(n) pass, memoized ──────────────────
  const { periodHigh, periodLow, periodVol } = useMemo(() => {
    if (bars.length === 0) return { periodHigh: null, periodLow: null, periodVol: null };
    let high = -Infinity;
    let low = Infinity;
    let vol = 0;
    for (const b of bars) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      vol += b.volume;
    }
    return { periodHigh: high, periodLow: low, periodVol: vol };
  }, [bars]);

  const activeEntry = SYMBOLS.find((s) => s.symbol === symbol);
  const filteredSymbols = SYMBOLS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
      s.label.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  function handleSymbolSelect(sym: string) {
    if (sym !== symbol) setPaneSymbol(activePane, sym);
    setSymbolOpen(false);
    setSymbolSearch('');
  }

  return (
    <div
      className="flex h-11 w-full shrink-0 items-center gap-3 overflow-x-auto border-b border-white/6 px-3 scrollbar-none"
      style={{ background: bg.panel }}
    >
      {/* ── Toolbar toggle (mobile) ──────────────────────────────────────── */}
      <button
        onClick={onToggleLeftToolbar}
        title={leftToolbarOpen ? 'Hide toolbar' : 'Show toolbar'}
        className="shrink-0 transition-colors hover:text-white lg:hidden"
        style={{ color: leftToolbarOpen ? color.purple : color.muted }}
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* ── Star ──────────────────────────────────────────────────────────── */}
      <button
        title="Add to favourites"
        className="shrink-0 transition-colors hover:text-brand-amber"
        style={{ color: color.muted }}
      >
        <Star className="h-3.5 w-3.5" />
      </button>

      {/* ── Symbol picker ─────────────────────────────────────────────────── */}
      <div className="relative shrink-0">
        <motion.button
          ref={symbolTriggerRef}
          onClick={() => {
            setSymbolOpen((p) => !p);
            setSymbolSearch('');
            const rect = symbolTriggerRef.current?.getBoundingClientRect();
            if (rect) setSymbolMenuPos({ top: rect.bottom + 6, left: rect.left });
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-bold text-white transition-colors"
          style={{
            background: symbolOpen ? bg.surface : 'transparent',
            border: `1px solid color-mix(in srgb, ${color.white} 6%, transparent)`,
          }}
        >
          <SymbolPair
            base={activeEntry?.base ?? symbol.replace('USDT', '')}
            quote="USDT"
            baseSize={18}
          />
          <span className="tracking-wide">{activeEntry?.base ?? symbol.replace('USDT', '')}</span>
          <span style={{ fontSize: fontSize.xs11, color: color.muted }}>/USDT</span>
          {symbolOpen ? (
            <ChevronUp className="h-3 w-3" style={{ color: color.muted }} />
          ) : (
            <ChevronDown className="h-3 w-3" style={{ color: color.muted }} />
          )}
        </motion.button>

        {symbolOpen &&
          createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSymbolOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="fixed z-50 w-52 overflow-hidden rounded-xl border border-white/8 shadow-2xl"
                style={{
                  background: bg.panel,
                  top: symbolMenuPos.top,
                  left: symbolMenuPos.left,
                }}
              >
                <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
                  <Search className="h-3 w-3 shrink-0" style={{ color: color.muted }} />
                  <input
                    autoFocus
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-xs text-white outline-none"
                    style={{ caretColor: color.purple }}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredSymbols.length === 0 ? (
                    <p
                      className="px-3 py-2"
                      style={{ fontSize: fontSize.xs11, color: color.muted }}
                    >
                      No results
                    </p>
                  ) : (
                    filteredSymbols.map((entry) => {
                      const isActive = entry.symbol === symbol;
                      return (
                        <motion.button
                          key={entry.symbol}
                          onClick={() => handleSymbolSelect(entry.symbol)}
                          whileHover={{ background: bg.surface }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <SymbolPair base={entry.base} quote="USDT" baseSize={20} />
                            <div>
                              <p
                                className="text-xs font-bold"
                                style={{ color: isActive ? color.purple : 'white' }}
                              >
                                {entry.base}/USDT
                              </p>
                              <p style={{ fontSize: fontSize.xs10, color: color.muted }}>
                                {entry.label}
                              </p>
                            </div>
                          </div>
                          {isActive && (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background: color.purpleDark,
                                boxShadow: `0 0 4px 2px ${color.purpleDark}60`,
                              }}
                            />
                          )}
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </>,
            document.body
          )}
      </div>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Live price + change% ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={symbol}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="flex shrink-0 items-center gap-2 tabular-nums"
        >
          {latestPrice !== null ? (
            <>
              <NumberFlow
                value={latestPrice}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                className="text-sm font-bold text-white"
              />
              {changePercent !== null && (
                <span
                  className="flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold"
                  style={{
                    fontSize: fontSize.xs11,
                    background: isPositive ? `${color.green}18` : `${color.red}18`,
                    color: isPositive ? color.green : color.red,
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
        </motion.div>
      </AnimatePresence>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="hidden items-center gap-5 overflow-hidden lg:flex">
        <StatItem
          label="Change"
          value={
            changePercent !== null ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%` : '—'
          }
          positive={changePercent !== null ? isPositive : undefined}
        />
        <StatItem
          label="Period High"
          value={
            periodHigh !== null
              ? periodHigh.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'
          }
        />
        <StatItem
          label="Period Low"
          value={
            periodLow !== null
              ? periodLow.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'
          }
        />
        <StatItem label="Volume (base)" value={periodVol !== null ? formatVol(periodVol) : '—'} />
      </div>

      <div className="flex-1" />

      {/* ── Layout picker ────────────────────────────────────────────────── */}
      <ChartLayoutPicker />

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Sync status ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5 pr-2">
        {isSyncing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="h-3 w-3" style={{ color: color.purple }} />
          </motion.div>
        ) : lastSyncAt ? (
          <span title={`Last synced: ${new Date(lastSyncAt).toLocaleTimeString()}`}>
            <Cloud className="h-3 w-3" style={{ color: color.green, opacity: 0.7 }} />
          </span>
        ) : (
          <span title="Not synced">
            <CloudOff className="h-3 w-3" style={{ color: color.red, opacity: 0.7 }} />
          </span>
        )}
      </div>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Timeframe dropdown ────────────────────────────────────────────── */}
      <IntervalDropdown
        value={interval}
        onChange={(tf) => {
          setPaneTimeRangePreset(activePane, null);
          setPaneInterval(activePane, tf);
        }}
      />

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Trade panel toggle ────────────────────────────────────────────── */}
      <motion.button
        type="button"
        onClick={onToggleTrading}
        disabled={tradingPanelOpen}
        aria-disabled={tradingPanelOpen}
        whileHover={tradingPanelOpen ? undefined : { scale: 1.04 }}
        whileTap={tradingPanelOpen ? undefined : { scale: 0.96 }}
        title={tradingPanelOpen ? 'Trade panel already open' : 'Open trade panel'}
        className="relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-70"
        style={{
          fontSize: fontSize.xs11,
          background: tradingPanelOpen
            ? 'transparent'
            : `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
          border: tradingPanelOpen ? `1px solid ${color.purple}40` : `1px solid ${color.purple}80`,
          boxShadow: tradingPanelOpen
            ? 'none'
            : `0 0 14px 3px ${color.purpleDark}60, 0 2px 8px rgba(0,0,0,0.5)`,
          color: tradingPanelOpen ? `${color.purple}cc` : 'white',
        }}
      >
        {!tradingPanelOpen && (
          /* pulse glow when closed */
          <motion.span
            className="absolute inset-0 rounded-full"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
              filter: 'blur(6px)',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Trade label */}
        <span className="relative">Trade</span>
      </motion.button>

      {/* Divider */}
      <span className="h-4 w-px shrink-0 bg-white/8" />

      {/* ── Connection status ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={isConnected ? 'pulse-live-dot' : ''}
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isConnected ? color.green : color.muted,
          }}
        />
        <span
          className="font-bold uppercase tracking-widest"
          style={{ fontSize: fontSize.xs10, color: isConnected ? color.green : color.muted }}
        >
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
