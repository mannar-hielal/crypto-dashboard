/**
 * useTPSLMonitor
 *
 * Watches `latestPrice` from marketStore every time it updates and
 * auto-closes any open paper-trading position whose Take-Profit or
 * Stop-Loss level has been breached.
 *
 * Rules:
 *   Long  — TP hit when price >= takeProfit
 *           SL hit when price <= stopLoss
 *   Short — TP hit when price <= takeProfit
 *           SL hit when price >= stopLoss
 *
 * A journal entry is automatically added describing the auto-close reason.
 * Must be mounted once at the app/dashboard level alongside usePriceFeed.
 */

import { useEffect, useRef } from 'react';
import { useMarketStore } from '@/store/marketStore';
import { usePaperStore } from '@/store/paperStore';

export function useTPSLMonitor() {
  const latestPrice = useMarketStore((s) => s.latestPrice);
  const symbol = useMarketStore((s) => s.symbol);

  // Use refs so the effect closure always reads the latest store state
  // without needing to re-subscribe and re-attach the effect.
  const getPositions = () => usePaperStore.getState().positions;
  const closePosition = useRef(usePaperStore.getState().closePosition);
  const addJournalNote = useRef(usePaperStore.getState().addJournalNote);

  useEffect(() => {
    if (latestPrice === null) return;

    const price = latestPrice;
    // Only evaluate positions for the currently active symbol — other symbols
    // have no live price feed active so we must not close them on a different ticker.
    const positions = getPositions().filter((p) => p.symbol === symbol);

    for (const pos of positions) {
      let triggered: 'TP' | 'SL' | null = null;

      if (pos.side === 'long') {
        if (pos.takeProfit !== undefined && price >= pos.takeProfit) triggered = 'TP';
        else if (pos.stopLoss !== undefined && price <= pos.stopLoss) triggered = 'SL';
      } else {
        // short
        if (pos.takeProfit !== undefined && price <= pos.takeProfit) triggered = 'TP';
        else if (pos.stopLoss !== undefined && price >= pos.stopLoss) triggered = 'SL';
      }

      if (triggered) {
        closePosition.current(pos.id, price);
        const label = triggered === 'TP' ? 'Take-Profit' : 'Stop-Loss';
        // isUserNote: false — system-generated entries must not be user-editable
        addJournalNote.current(
          `Auto-closed ${pos.side.toUpperCase()} ${pos.symbol} — ${label} hit at $${price.toFixed(4)}`,
          false
        );
      }
    }
  }, [latestPrice, symbol]);
}
