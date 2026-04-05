import { useState } from 'react';
import { Link } from 'react-router';
import { usePriceFeed } from '@/hooks/usePriceFeed';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaperTradingPanel } from '@/components/dashboard/PaperTradingPanel';
import { TickerBar } from '@/components/dashboard/TickerBar';
import { SymbolBar } from '@/components/dashboard/SymbolBar';
import { TradingPanel } from '@/components/dashboard/TradingPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelSize = 'collapsed' | 'open';

const PANEL_HEIGHT: Record<PanelSize, string> = {
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
  // Opens the WebSocket connection and feeds live bars into marketStore.
  // Called once here — all child components read from the store.
  usePriceFeed();
  const [panelSize, setPanelSize] = useState<PanelSize>('open');

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden"
      style={{ background: '#0b0c1a' }}
    >
      {/* ── App header ───────────────────────────────────────────────────── */}
      <TopBar />

      {/* ── Symbol / trading sub-header ──────────────────────────────────── */}
      <SymbolBar />

      {/* ── Middle: left toolbar + chart + right trade panel ─────────────── */}
      <div className="flex min-h-0 flex-1">
        <LeftToolbar />
        <ChartPanel />
        <TradingPanel />
      </div>

      {/* ── Bottom: positions + history panel ────────────────────────────── */}
      <div
        className={`shrink-0 transition-all duration-200 ease-in-out ${PANEL_HEIGHT[panelSize]}`}
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
