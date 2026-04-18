/**
 * useTPSLMonitor
 *
 * Watches `latestPrice` from paneStores[0] (primary trading pane) every time
 * it updates and auto-closes any open paper-trading position whose
 * Take-Profit or Stop-Loss level has been breached.
 *
 * Rules:
 *   Long  — TP hit when price >= takeProfit
 *           SL hit when price <= stopLoss
 *   Short — TP hit when price <= takeProfit
 *           SL hit when price >= stopLoss
 *
 * A journal entry is automatically added describing the auto-close reason.
 * Must be mounted once at the app/dashboard level alongside usePaneFeeds.
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore, COMMISSION_RATE } from '@/store/paperStore';

// ─── Pure breach-check — exported for unit testing ───────────────────────────

/**
 * Determines whether a position's TP or SL has been breached at `price`.
 * Pure function — no side effects, safe to unit-test in isolation.
 */
export function checkTPSL(
  pos: { side: 'long' | 'short'; takeProfit?: number; stopLoss?: number },
  price: number
): 'TP' | 'SL' | null {
  if (pos.side === 'long') {
    if (pos.takeProfit !== undefined && price >= pos.takeProfit) return 'TP';
    if (pos.stopLoss !== undefined && price <= pos.stopLoss) return 'SL';
  } else {
    // short
    if (pos.takeProfit !== undefined && price <= pos.takeProfit) return 'TP';
    if (pos.stopLoss !== undefined && price >= pos.stopLoss) return 'SL';
  }
  return null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface TPSLMonitorOptions {
  /** Called when a position is auto-closed. pnl > 0 = profit, pnl < 0 = loss. */
  onClosed?: (pnl: number) => void;
}

export function useTPSLMonitor({ onClosed }: TPSLMonitorOptions = {}) {
  // Monitor pane 0 (primary trading pane) — scoped to active symbol only
  const latestPrice = useStore(paneStores[0], (s) => s.latestPrice);
  const symbol = useLayoutStore((s) => s.panes[0].symbol);

  // Use refs so the effect closure always reads the latest store state
  // without needing to re-subscribe and re-attach the effect.
  const closePosition = useRef(usePaperStore.getState().closePosition);
  const addJournalNote = useRef(usePaperStore.getState().addJournalNote);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (latestPrice === null) return;

    const price = latestPrice;
    // Only evaluate positions for the currently active symbol — other symbols
    // have no live price feed active so we must not close them on a different ticker.
    const positions = usePaperStore.getState().positions.filter((p) => p.symbol === symbol);

    for (const pos of positions) {
      const triggered = checkTPSL(pos, price);

      if (triggered) {
        closePosition.current(pos.id, price);
        // Gross PnL (same formula as closePosition)
        const grossPnl =
          pos.side === 'long'
            ? (price - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - price) * pos.quantity;
        // Net PnL = gross − exit commission — matches Balance History and the
        // badge shown on the manual-close exec journal entry.
        const exitCommission = pos.quantity * price * COMMISSION_RATE;
        const netPnl = grossPnl - exitCommission;
        onClosedRef.current?.(grossPnl);
        const label = triggered === 'TP' ? 'Take-Profit' : 'Stop-Loss';
        // isUserNote: false — system-generated entries must not be user-editable
        addJournalNote.current(
          `Auto-closed ${pos.side.toUpperCase()} ${pos.symbol} — ${label} hit at $${price.toFixed(4)}`,
          false,
          netPnl
        );
      }
    }
  }, [latestPrice, symbol]);
}
