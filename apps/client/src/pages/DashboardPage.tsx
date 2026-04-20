import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { usePaneFeeds } from '@/hooks/usePaneFeeds';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
import type { OrderTab } from '@/components/dashboard/TradingPanel';
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
 *   ├──────┬──────────────────────────────────┬────────────┤
 *   │      │  ChartPanel (flex-1)              │            │
 *   │ Left │  ──────────────────────────────  │ Trading    │
 *   │ Tool │  PaperTradingPanel               │ Panel      │
 *   │ bar  │  (animated height / flex-1 when  │ (w-64,     │
 *   │(w-11)│   maximized)                     │ full h) ✓  │
 *   ├──────┴──────────────────────────────────┴────────────┤
 *   │   TickerBar          (h-8)                           │
 *   ├──────────────────────────────────────────────────────┤
 *   │   DashboardFooter    (h-7)                           │
 *   └──────────────────────────────────────────────────────┘
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
  useDocumentTitle();

  // Stable callback refs — memoized so they don't change on every render.
  // Depend on `sound` (the whole object) — React Compiler infers the object-level
  // dependency from property accesses and cannot preserve narrower method deps.
  const handleTPSLClosed = useCallback(
    (pnl: number) => {
      if (pnl >= 0) sound.playProfit();
      else sound.playLoss();
    },
    [sound]
  );
  const handleOrderFilled = useCallback(() => {
    sound.playOrderFilled();
  }, [sound]);

  useTPSLMonitor({ onClosed: handleTPSLClosed });
  usePendingOrderMonitor({ onFilled: handleOrderFilled });

  // Active pane symbol drives the TradingPanel key (resets form on symbol change)
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);

  const [panelSize, setPanelSize] = useState<PanelSize>('open');
  const [tradingPanelOpen, setTradingPanelOpen] = useState(true);
  /** Persisted across symbol changes so the user stays on their chosen tab */
  const [tradingTab, setTradingTab] = useState<OrderTab>('market');
  /** When true the PaperTradingPanel fills the entire center column */
  const [isMaximized, setIsMaximized] = useState(false);

  function handleToggleMaximize() {
    setIsMaximized((v) => !v);
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden" style={{ background: bg.page }}>
      <TopBar />
      <SymbolBar
        tradingPanelOpen={tradingPanelOpen}
        onToggleTrading={() => setTradingPanelOpen((v) => !v)}
      />

      {/* ── Main content row ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <LeftToolbar />

        {/* Center column: chart on top + paper trading panel on bottom.
            By making this a flex-col sibling of TradingPanel, the TradingPanel
            now spans the full height of this row (chart + bottom panel). */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Chart area — animates flex-shrink to 0 when the panel is maximized */}
          <motion.div
            className="relative min-h-0 min-w-0 overflow-hidden"
            animate={{ flex: isMaximized ? '0 0 0px' : '1 1 0%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            <MultiChartArea />

            <AnimatePresence>
              {panelSize === 'hidden' && !isMaximized && (
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
          </motion.div>

          {/* Paper trading panel.
              Normal: fixed pixel height animated via spring.
              Maximized: flex-1 fills the center column (chart has collapsed to 0). */}
          <motion.div
            className={`shrink-0 overflow-hidden${isMaximized ? ' flex-1' : ''}`}
            animate={{ height: isMaximized ? 'auto' : PANEL_HEIGHTS[panelSize] }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            // @ts-expect-error inert is a valid HTML attribute not yet typed in React
            inert={!isMaximized && panelSize === 'hidden' ? '' : undefined}
          >
            <PaperTradingPanel
              size={panelSize}
              onSizeChange={setPanelSize}
              isMaximized={isMaximized}
              onToggleMaximize={handleToggleMaximize}
            />
          </motion.div>
        </div>

        {/* Trading panel — sibling of the entire center column so it spans
            the full height from SymbolBar down to TickerBar */}
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
              {/* key={`${activePane}-${symbol}`} resets form inputs when active pane or symbol
                  changes. Tab selection is preserved via initialTab + onTabChange (lifted state). */}
              <TradingPanel
                key={`${activePane}-${symbol}`}
                onClose={() => setTradingPanelOpen(false)}
                initialTab={tradingTab}
                onTabChange={setTradingTab}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
