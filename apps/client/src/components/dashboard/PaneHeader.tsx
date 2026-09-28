/**
 * PaneHeader
 *
 * Thin bar rendered above each chart pane in multi-chart mode.
 * Shows: CryptoIcon · symbol name · interval quick-switch · live dot.
 * Clicking anywhere activates this pane (highlights it with purple border).
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from 'zustand';
import { ChevronDown, Search } from 'lucide-react';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { SYMBOLS } from '@/lib/markets';
import { IntervalDropdown } from '@/components/dashboard/IntervalDropdown';
import { CryptoIcon } from '@/components/ui/CryptoIcon';
import { bg, color, fontSize } from '@/lib/tokens';
import { guide } from '@/lib/guideAnchors';

interface PaneHeaderProps {
  paneIndex: 0 | 1 | 2 | 3;
  isActive: boolean;
  onActivate: () => void;
}

export function PaneHeader({ paneIndex, isActive, onActivate }: PaneHeaderProps) {
  const paneConfig = useLayoutStore((s) => s.panes[paneIndex]);
  const setPaneSymbol = useLayoutStore((s) => s.setPaneSymbol);
  const setPaneInterval = useLayoutStore((s) => s.setPaneInterval);
  const setPaneTimeRangePreset = useLayoutStore((s) => s.setPaneTimeRangePreset);

  const latestPrice = useStore(paneStores[paneIndex], (s) => s.latestPrice);
  const priceChange = useStore(paneStores[paneIndex], (s) => s.priceChange);
  const isConnected = useStore(paneStores[paneIndex], (s) => s.isConnected);

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');

  const { symbol, interval } = paneConfig;
  const activeEntry = SYMBOLS.find((s) => s.symbol === symbol);
  const baseAsset = activeEntry?.base ?? symbol.replace('USDT', '');

  const isPositive = (priceChange ?? 0) >= 0;
  const prevClose = latestPrice !== null && priceChange !== null ? latestPrice - priceChange : null;
  const changePercent =
    prevClose !== null && prevClose !== 0 && priceChange !== null
      ? (priceChange / prevClose) * 100
      : null;

  const filteredSymbols = SYMBOLS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
      s.label.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  function handleSymbolSelect(sym: string) {
    if (sym !== symbol) setPaneSymbol(paneIndex, sym);
    setSymbolOpen(false);
    setSymbolSearch('');
  }

  return (
    <div
      className="relative flex h-7 shrink-0 cursor-pointer items-center gap-2 border-b border-white/5 px-2"
      style={{ background: isActive ? `${color.purpleDark}15` : bg.page }}
      onClick={onActivate}
    >
      {/* Active indicator stripe */}
      {isActive && (
        <motion.div
          layoutId="active-pane-stripe"
          className="absolute left-0 top-0 h-full w-0.5 rounded-r"
          style={{ background: color.purple }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}

      {/* Symbol picker trigger */}
      <div className="relative shrink-0">
        <button
          {...guide('pane.header.symbol')}
          onClick={(e) => {
            e.stopPropagation();
            onActivate();
            setSymbolOpen((p) => !p);
            setSymbolSearch('');
          }}
          className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/6"
        >
          <CryptoIcon symbol={baseAsset} size={13} />
          <span className="font-bold text-white" style={{ fontSize: fontSize.xs10 }}>
            {baseAsset}
          </span>
          <span style={{ fontSize: '9px', color: color.muted }}>/USDT</span>
          <span style={{ fontSize: fontSize.xxs, color: color.muted }}>
            {paneConfig.category === 'spot' ? 'Spot' : 'Perpetual'}
          </span>
          <ChevronDown className="h-2.5 w-2.5" style={{ color: color.muted }} />
        </button>

        <AnimatePresence>
          {symbolOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setSymbolOpen(false);
                }}
              />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.13 }}
                className="absolute left-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-white/8 shadow-2xl"
                style={{ background: bg.panel }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Search */}
                <div className="flex items-center gap-1.5 border-b border-white/6 px-2.5 py-1.5">
                  <Search className="h-2.5 w-2.5 shrink-0" style={{ color: color.muted }} />
                  <input
                    autoFocus
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-white outline-none"
                    style={{ fontSize: fontSize.xs10, caretColor: color.purple }}
                  />
                </div>
                {/* List */}
                <div className="max-h-52 overflow-y-auto py-0.5">
                  {filteredSymbols.map((entry) => {
                    const isSelected = entry.symbol === symbol;
                    return (
                      <button
                        key={entry.symbol}
                        {...guide('pane.header.symbol-option', entry.symbol)}
                        onClick={() => handleSymbolSelect(entry.symbol)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-white/5"
                      >
                        <CryptoIcon symbol={entry.base} size={16} />
                        <span
                          className="font-semibold"
                          style={{
                            fontSize: fontSize.xs11,
                            color: isSelected ? color.purple : 'white',
                          }}
                        >
                          {entry.base}/USDT
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <span className="h-3 w-px shrink-0 bg-white/7" />

      {/* Interval quick-switch */}
      <div onClick={(e) => e.stopPropagation()}>
        <IntervalDropdown
          value={interval}
          onChange={(tf) => {
            onActivate();
            setPaneTimeRangePreset(paneIndex, null);
            setPaneInterval(paneIndex, tf);
          }}
          compact
          triggerAnchor="pane.header.interval-picker"
          optionAnchor="pane.header.interval"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Live price */}
      {latestPrice !== null && (
        <span
          {...guide('pane.header.price')}
          className="shrink-0 tabular-nums font-semibold"
          style={{
            fontSize: fontSize.xs10,
            color:
              changePercent !== null ? (isPositive ? color.green : color.red) : `${color.white}99`,
          }}
        >
          {latestPrice.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          {changePercent !== null && (
            <span {...guide('pane.header.change')} className="ml-1" style={{ fontSize: '9px' }}>
              {isPositive ? '+' : ''}
              {changePercent.toFixed(2)}%
            </span>
          )}
        </span>
      )}

      {/* Connection dot */}
      <span
        {...guide('pane.header.dot')}
        className={isConnected ? 'pulse-live-dot shrink-0' : 'shrink-0'}
        style={{
          display: 'inline-block',
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isConnected ? color.green : `${color.muted}50`,
        }}
      />
    </div>
  );
}
