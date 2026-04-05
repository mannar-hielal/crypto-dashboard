import { useState } from 'react';
import { usePriceFeed } from '@/hooks/usePriceFeed';
import { TopBar } from '@/components/dashboard/TopBar';
import { LeftToolbar } from '@/components/dashboard/LeftToolbar';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaperTradingPanel } from '@/components/dashboard/PaperTradingPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelSize = 'collapsed' | 'open' | 'maximized';

const PANEL_HEIGHT: Record<PanelSize, string> = {
  collapsed: 'h-9', // 36px — header bar only
  open: 'h-52', // 208px — default view
  maximized: '', // handled separately — takes full content area
};

/**
 * DashboardPage
 *
 * Orchestrates the full trading layout:
 *   ┌─────────────────────────────────────────┐
 *   │              TopBar (h-12)              │
 *   ├──────┬──────────────────────────────────┤
 *   │      │                                  │
 *   │ Left │         ChartPanel               │
 *   │ Tool │         (flex-1)                 │
 *   │ bar  │                                  │
 *   │(w-11)│                                  │
 *   ├──────┴──────────────────────────────────┤
 *   │   PaperTradingPanel (h-9 / h-52 / h-80)│
 *   └─────────────────────────────────────────┘
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
    <div className="flex h-screen flex-col overflow-hidden bg-[#1e2235]">
      {/* ── Top bar: logo, symbol, timeframes, price, user menu ── */}
      <TopBar />

      {/* ── Middle: left toolbar + chart ─────────────────────── */}
      <div
        className={`flex min-h-0 transition-all duration-200 ease-in-out ${
          panelSize === 'maximized' ? 'h-0 overflow-hidden' : 'flex-1'
        }`}
      >
        <LeftToolbar />
        <ChartPanel />
      </div>

      {/* ── Bottom: paper trading panel (animated height) ──────── */}
      <div
        className={`transition-all duration-200 ease-in-out ${
          panelSize === 'maximized' ? 'flex-1 min-h-0' : `shrink-0 ${PANEL_HEIGHT[panelSize]}`
        }`}
      >
        <PaperTradingPanel size={panelSize} onSizeChange={setPanelSize} />
      </div>
    </div>
  );
}
