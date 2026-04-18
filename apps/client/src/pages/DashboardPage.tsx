import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { usePaneFeeds } from '@/hooks/usePaneFeeds';
import { useTPSLMonitor } from '@/hooks/useTPSLMonitor';
import { usePendingOrderMonitor } from '@/hooks/usePendingOrderMonitor';
import { TradingSoundProvider, useTradingSoundCtx } from '@/hooks/TradingSoundContext';
import { useLayoutStore } from '@/store/layoutStore';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { MultiChartArea } from '@/components/dashboard/MultiChartArea';
import { PaperTradingPanel } from '@/components/dashboard/PaperTradingPanel';
import { TickerBar } from '@/components/dashboard/TickerBar';
import { SymbolBar } from '@/components/dashboard/SymbolBar';
import { TradingPanel } from '@/components/dashboard/TradingPanel';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

/** hidden = fully closed (h-0); collapsed = header-only; open = full height */
export type PanelSize = 'hidden' | 'collapsed' | 'open';

/** Pixel heights used by the Framer Motion spring — mirrors h-0 / h-9 / h-52 */
const PANEL_HEIGHTS: Record<PanelSize, number> = {
  hidden: 0,
  collapsed: 36,
  open: 208,
};

/**
 * DashboardPage
 *
 * Orchestrates the full trading layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │              AppHeader / TopBar (h-12)               │
 *   ├──────────────────────────────────────────────────────┤
 *   │              SymbolBar          (h-11)               │
 *   ├──────┬─────────────────────────────────┬────────────┤
 *   │      │                                 │            │
 *   │ Left │         ChartPanel              │ Trading    │
 *   │ Tool │         (flex-1)                │ Panel      │
 *   │ bar  │                                 │ (w-64)     │
 *   │(w-11)│                                 │            │
 *   ├──────┴─────────────────────────────────┴────────────┤
 *   │   PaperTradingPanel: positions + history (h-9/h-52) │
 *   ├──────────────────────────────────────────────────────┤
 *   │   TickerBar          (h-8)                          │
 *   ├──────────────────────────────────────────────────────┤
 *   │   DashboardFooter    (h-7)                          │
 *   └──────────────────────────────────────────────────────┘
 *
 * usePaneFeeds is called here (once) so all WebSocket lifecycles are tied
 * to the page, not to individual child components.
 */
export function DashboardPage() {
  return (
    <TradingSoundProvider>
      <DashboardInner />
    </TradingSoundProvider>
  );
}

function DashboardInner() {
  const sound = useTradingSoundCtx();

  usePaneFeeds();

  // Stable callback refs — memoized so they don't change on every render
  // and don't cause useTPSLMonitor / usePendingOrderMonitor effects to re-run.
  const handleTPSLClosed = useCallback(
    (pnl: number) => {
      if (pnl >= 0) sound.playProfit();
      else sound.playLoss();
    },
    [sound.playProfit, sound.playLoss],
  );
  const handleOrderFilled = useCallback(() => {
    sound.playOrderFilled();
  }, [sound.playOrderFilled]);

  useTPSLMonitor({ onClosed: handleTPSLClosed });
  usePendingOrderMonitor({ onFilled: handleOrderFilled });

  // Active pane symbol drives the TradingPanel key (resets form on symbol change)
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);

  const [panelSize, setPanelSize] = useState<PanelSize>('open');
  const [tradingPanelOpen, setTradingPanelOpen] = useState(true);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden" style={{ background: bg.page }}>
      <TopBar />
      <SymbolBar
        tradingPanelOpen={tradingPanelOpen}
        onToggleTrading={() => setTradingPanelOpen((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <LeftToolbar />

        <div className="relative min-w-0 flex-1">
          <MultiChartArea />

          <AnimatePresence>
            {panelSize === 'hidden' && (
              <motion.button
                key="reopen-pill"
                initial={{ opacity: 0, y: 12, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.92 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={() => setPanelSize('collapsed')}
                title="Show positions panel"
                className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full px-4 py-2 font-bold text-white transition-all hover:brightness-110 active:scale-95"
                style={{
                  fontSize: fontSize.xs11,
                  background: `linear-gradient(135deg, ${color.purpleDark} 0%, ${color.purple} 100%)`,
                  border: `1px solid ${color.purple}80`,
                  boxShadow: `0 0 18px 4px ${color.purpleDark}73, 0 4px 16px rgba(0,0,0,0.6)`,
                }}
              >
                <motion.span
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-1.5 w-1.5 rounded-full bg-white"
                />
                <BarChart2 className="h-3.5 w-3.5" />
                Positions &amp; History
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {tradingPanelOpen && (
            <motion.div
              key="trading-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden"
            >
              {/* key={`${activePane}-${symbol}`} resets form when active pane or symbol changes */}
              <TradingPanel
                key={`${activePane}-${symbol}`}
                onClose={() => setTradingPanelOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="shrink-0 overflow-hidden"
        initial={false}
        animate={{ height: PANEL_HEIGHTS[panelSize] }}
        transition={{ type: 'spring', stiffness: 380, damping: 35 }}
        inert={panelSize === 'hidden'}
      >
        <PaperTradingPanel size={panelSize} onSizeChange={setPanelSize} />
      </motion.div>

      <TickerBar />

      {/* ── Dashboard footer ─────────────────────────────────────────────── */}
      <div
        className="flex h-7 w-full shrink-0 items-center justify-between border-t border-white/5 px-4"
        style={{ background: bg.footer }}
      >
        <span style={{ fontSize: fontSize.xs10, color: `${color.muted}80` }}>
          ⚠️ Paper trading only — no real funds. For educational purposes.
        </span>
        <nav
          className="flex items-center gap-3"
          style={{ fontSize: fontSize.xs10, color: `${color.muted}60` }}
        >
          <Link to="/terms" className="transition-colors hover:text-white/50">
            Terms of Use
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="transition-colors hover:text-white/50">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Crypto Dashboard</span>
        </nav>
      </div>
    </div>
  );
}
