import { useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { usePriceFeed } from '@/hooks/usePriceFeed';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaperTradingPanel } from '@/components/dashboard/PaperTradingPanel';
import { TickerBar } from '@/components/dashboard/TickerBar';
import { SymbolBar } from '@/components/dashboard/SymbolBar';
import { TradingPanel } from '@/components/dashboard/TradingPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

/** hidden = fully closed (h-0); collapsed = header-only; open = full height */
export type PanelSize = 'hidden' | 'collapsed' | 'open';

const PANEL_HEIGHT: Record<PanelSize, string> = {
  hidden: 'h-0 overflow-hidden',
  collapsed: 'h-9',
  open: 'h-52',
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
 * usePriceFeed is called here (once) so the WebSocket lifecycle
 * is tied to the page, not to individual child components.
 */
export function DashboardPage() {
  usePriceFeed();
  useTPSLMonitor();
  const [panelSize, setPanelSize] = useState<PanelSize>('open');
  // TradingPanel is open by default on desktop; users can toggle it
  const [tradingPanelOpen, setTradingPanelOpen] = useState(true);

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden"
      style={{ background: '#0b0c1a' }}
    >
      {/* ── App header ───────────────────────────────────────────────────── */}
      <TopBar />

      {/* ── Symbol / trading sub-header ──────────────────────────────────── */}
      <SymbolBar
        tradingPanelOpen={tradingPanelOpen}
        onToggleTrading={() => setTradingPanelOpen((v) => !v)}
      />

      {/* ── Middle: left toolbar + chart + right trade panel ─────────────── */}
      <div className="flex min-h-0 flex-1">
        <LeftToolbar />

        {/* Chart area — relative so the re-open pill can float inside it */}
        <div className="relative min-w-0 flex-1">
          <ChartPanel />

          {/* Floating pill: re-opens the positions panel when it's fully closed */}
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
                className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #7b2ff7 0%, #a855f7 100%)',
                  border: '1px solid rgba(168,85,247,0.5)',
                  boxShadow: '0 0 18px 4px rgba(123,47,247,0.45), 0 4px 16px rgba(0,0,0,0.6)',
                }}
              >
                {/* Pulsing dot to draw the eye */}
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

        {/* TradingPanel: animated open/close — preserves chart width on close */}
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
              <TradingPanel onClose={() => setTradingPanelOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom: positions + history panel ────────────────────────────── */}
      {/* inert when hidden: removes h-0 content from tab order + a11y tree  */}
      <div
        className={`shrink-0 transition-all duration-200 ease-in-out ${PANEL_HEIGHT[panelSize]}`}
        inert={panelSize === 'hidden'}
      >
        <PaperTradingPanel size={panelSize} onSizeChange={setPanelSize} />
      </div>

      {/* ── Ticker bar — always pinned above the footer ───────────────────── */}
      <TickerBar />

      {/* ── Dashboard footer ─────────────────────────────────────────────── */}
      <div
        className="flex h-7 w-full shrink-0 items-center justify-between border-t border-white/[0.05] px-4"
        style={{ background: '#06070f' }}
      >
        <span className="text-[10px]" style={{ color: '#848e9c80' }}>
          ⚠️ Paper trading only — no real funds. For educational purposes.
        </span>
        <nav className="flex items-center gap-3 text-[10px]" style={{ color: '#848e9c60' }}>
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
