import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useMarketStore } from '@/store/marketStore';
import { usePaperStore } from '@/store/paperStore';
import type { PanelSize } from '@/pages/DashboardPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type InfoTab = 'positions' | 'history';

// ─── Stagger helpers ──────────────────────────────────────────────────────────

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2, ease: 'easeOut' as const },
  }),
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaperTradingPanelProps {
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PaperTradingPanel — Bottom panel
 *
 * Shows open positions and trade history.
 * Order entry lives in TradingPanel (right sidebar).
 */
export function PaperTradingPanel({ size, onSizeChange }: PaperTradingPanelProps) {
  const [infoTab, setInfoTab] = useState<InfoTab>('positions');

  const latestPrice = useMarketStore((s) => s.latestPrice);

  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const history = usePaperStore((s) => s.history);
  const closePosition = usePaperStore((s) => s.closePosition);

  const unrealizedPnl = positions.reduce((sum, pos) => {
    if (!latestPrice) return sum;
    const pnl =
      pos.side === 'long'
        ? (latestPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - latestPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  function handleClose(positionId: string) {
    if (!latestPrice) return;
    closePosition(positionId, latestPrice);
  }

  return (
    <div
      className="flex h-full w-full flex-col border-t border-white/[0.06]"
      style={{ background: '#0b0c1a' }}
    >
      {/* ── Header bar (always visible) ────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.05] px-3"
        style={{ background: '#0f1020' }}
      >
        {/* Left: quick stats */}
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-xs font-bold text-white/80 tracking-wide">Positions</span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="text-[11px] tabular-nums text-[#848e9c]">
            <span className="mr-1 text-[#848e9c]/60">Balance</span>
            <span className="text-white/70">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: unrealizedPnl >= 0 ? '#02c076' : '#f6465d' }}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)} P&amp;L
          </span>
        </div>

        {/* Right: collapse / expand + close */}
        <div className="flex items-center gap-0.5">
          {/* Collapse ↔ Expand: hidden when panel is fully closed (h-0) */}
          {size !== 'hidden' &&
            (size === 'open' ? (
              <motion.button
                onClick={() => onSizeChange('collapsed')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Collapse"
                className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-white"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.button>
            ) : (
              <motion.button
                onClick={() => onSizeChange('open')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Expand"
                className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-white"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </motion.button>
            ))}

          {/* Close: hides the panel entirely — floating pill re-opens it */}
          <motion.button
            onClick={() => onSizeChange('hidden')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Close panel"
            className="flex h-6 w-6 items-center justify-center rounded text-[#848e9c] hover:text-[#f6465d]"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>

      {/* ── Panel content ─────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {size !== 'collapsed' && (
          <motion.div
            key="panel-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Tab bar */}
            <div
              className="flex items-center border-b border-white/[0.06]"
              style={{ background: '#0f1020' }}
            >
              {(['positions', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  className="relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold capitalize transition-colors"
                  style={{ color: infoTab === tab ? '#a855f7' : '#848e9c' }}
                >
                  {infoTab === tab && (
                    <motion.span
                      layoutId="active-bottom-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: '#7b2ff7' }}
                    />
                  )}
                  {tab}
                  {tab === 'positions' && positions.length > 0 && (
                    <span
                      className="rounded-full px-1.5 py-px text-[9px] font-bold text-white"
                      style={{ background: '#7b2ff7' }}
                    >
                      {positions.length}
                    </span>
                  )}
                  {tab === 'history' && history.length > 0 && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[9px] font-semibold text-[#848e9c]">
                      {history.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Scrollable table area */}
            <div className="flex-1 overflow-y-auto">
              {/* ── Positions ───────────────────────────────────────────── */}
              {infoTab === 'positions' &&
                (positions.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full items-center justify-center text-xs text-[#848e9c]"
                  >
                    No open positions
                  </motion.div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr
                        className="border-b border-white/[0.04] text-[10px] text-[#848e9c]"
                        style={{ background: '#0f1020' }}
                      >
                        <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                          Symbol
                        </th>
                        <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                          Side
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Qty
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Entry
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Mark
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          PnL (USDT)
                        </th>
                        <th className="px-3 py-1.5 text-center font-semibold uppercase tracking-wider">
                          Close
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, i) => {
                        const markPrice = latestPrice ?? pos.entryPrice;
                        const pnl =
                          pos.side === 'long'
                            ? (markPrice - pos.entryPrice) * pos.quantity
                            : (pos.entryPrice - markPrice) * pos.quantity;
                        const pnlPct = (pnl / pos.entryUsdtAmount) * 100;
                        const isProfit = pnl >= 0;

                        return (
                          <motion.tr
                            key={pos.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-1.5 font-bold text-white">{pos.symbol}</td>
                            <td className="px-3 py-1.5">
                              <span
                                className="flex items-center gap-0.5 text-[10px] font-bold"
                                style={{ color: pos.side === 'long' ? '#02c076' : '#f6465d' }}
                              >
                                {pos.side === 'long' ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : (
                                  <TrendingDown className="h-3 w-3" />
                                )}
                                {pos.side === 'long' ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              {pos.quantity.toFixed(6)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              ${pos.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              ${markPrice.toFixed(2)}
                            </td>
                            <td
                              className="px-3 py-1.5 text-right tabular-nums font-semibold"
                              style={{ color: isProfit ? '#02c076' : '#f6465d' }}
                            >
                              {isProfit ? '+' : ''}
                              {pnl.toFixed(2)}{' '}
                              <span className="text-[10px] opacity-70">
                                ({isProfit ? '+' : ''}
                                {pnlPct.toFixed(2)}%)
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <motion.button
                                onClick={() => handleClose(pos.id)}
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                title="Close at market price"
                                className="mx-auto flex h-5 w-5 items-center justify-center rounded text-[#848e9c] transition-colors hover:text-[#f6465d]"
                              >
                                <X className="h-3 w-3" />
                              </motion.button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}

              {/* ── History ─────────────────────────────────────────────── */}
              {infoTab === 'history' &&
                (history.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full items-center justify-center text-xs text-[#848e9c]"
                  >
                    No closed trades yet
                  </motion.div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr
                        className="border-b border-white/[0.04] text-[10px] text-[#848e9c]"
                        style={{ background: '#0f1020' }}
                      >
                        <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                          Symbol
                        </th>
                        <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                          Side
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Qty
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Entry
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          Exit
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider">
                          PnL (USDT)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((trade, i) => {
                        const isProfit = trade.pnl >= 0;
                        return (
                          <motion.tr
                            key={trade.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-1.5 font-bold text-white">{trade.symbol}</td>
                            <td
                              className="px-3 py-1.5 text-[10px] font-bold"
                              style={{ color: trade.side === 'long' ? '#02c076' : '#f6465d' }}
                            >
                              {trade.side === 'long' ? 'LONG' : 'SHORT'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              {trade.quantity.toFixed(6)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              ${trade.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                              ${trade.exitPrice.toFixed(2)}
                            </td>
                            <td
                              className="px-3 py-1.5 text-right tabular-nums font-semibold"
                              style={{ color: isProfit ? '#02c076' : '#f6465d' }}
                            >
                              {isProfit ? '+' : ''}
                              {trade.pnl.toFixed(2)}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
