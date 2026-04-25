/**
 * useTPSLMonitor
 *
 * Subscribes directly to paneStores[0] (vanilla Zustand, outside React's
 * render cycle) so EVERY price tick is evaluated — React 18 automatic batching
 * can coalesce rapid ticks into a single render and cause the useEffect-based
 * approach to skip over a TP/SL level entirely.
 *
 * Two-price check per tick:
 *   1. latestPrice  — most recent last-trade / ticker price
 *   2. currentBar.high / .low — forming candle extremes so a sweep through the
 *      TP or SL level within a single candle is never missed
 *
 * Rules:
 *   Long  — TP hit when effective high  >= takeProfit
 *           SL hit when effective low   <= stopLoss
 *   Short — TP hit when effective low   <= takeProfit
 *           SL hit when effective high  >= stopLoss
 *
 * Close price used: latestPrice if it already satisfies the breach, otherwise
 * the exact TP/SL level (candle-sweep — best approximation).
 *
 * Must be mounted once at the app/dashboard level alongside usePaneFeeds.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';

// Local price formatter (mirrors paperStore's fmtPrice)
function fmtPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

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
  const onClosedRef = useRef(onClosed);
  useLayoutEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    // Subscribe directly to the vanilla Zustand store — bypasses React 18
    // automatic batching so every individual price tick is evaluated.
    const unsubscribe = paneStores[0].subscribe((state) => {
      const { latestPrice, bars } = state;
      if (latestPrice === null) return;

      const symbol = useLayoutStore.getState().panes[0].symbol;
      // Only evaluate positions for the currently active symbol — other symbols
      // have no live price feed active so we must not close them on a different ticker.
      const positions = usePaperStore.getState().positions.filter((p) => p.symbol === symbol);
      if (positions.length === 0) return;

      const currentBar = bars[bars.length - 1];
      const candleLow = currentBar?.low ?? latestPrice;
      const candleHigh = currentBar?.high ?? latestPrice;

      // Compute candle extremes once — shared across all position checks this tick.
      const checkHigh = Math.max(latestPrice, candleHigh);
      const checkLow = Math.min(latestPrice, candleLow);

      for (const pos of positions) {
        // For long positions: TP uses high path, SL uses low path.
        // For short positions: TP uses low path, SL uses high path.
        // We check with the candle extreme first; if triggered, determine
        // whether it was a real-time tick or a candle-sweep for the close price.

        // Build a synthetic "worst case" position view for breach detection.
        // Use high for TP-long / SL-short, low for TP-short / SL-long.
        let triggered: 'TP' | 'SL' | null = null;
        if (pos.side === 'long') {
          if (pos.takeProfit !== undefined && checkHigh >= pos.takeProfit) triggered = 'TP';
          else if (pos.stopLoss !== undefined && checkLow <= pos.stopLoss) triggered = 'SL';
        } else {
          if (pos.takeProfit !== undefined && checkLow <= pos.takeProfit) triggered = 'TP';
          else if (pos.stopLoss !== undefined && checkHigh >= pos.stopLoss) triggered = 'SL';
        }

        if (!triggered) continue;

        // Determine close price: use latestPrice if it satisfies the breach,
        // else use the exact TP/SL level (candle-sweep approximation).
        const level = triggered === 'TP' ? pos.takeProfit! : pos.stopLoss!;
        const closePrice = checkTPSL(pos, latestPrice) ? latestPrice : level;

        const label = triggered === 'TP' ? 'Take-Profit' : 'Stop-Loss';
        const reason = `Auto-closed ${pos.side.toUpperCase()} ${pos.symbol} — ${label} hit at $${fmtPrice(closePrice)}`;
        const closeType = triggered === 'TP' ? 'take-profit' : 'stop-loss';

        usePaperStore.getState().closePosition(pos.id, closePrice, reason, closeType);

        const grossPnl =
          pos.side === 'long'
            ? (closePrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - closePrice) * pos.quantity;
        onClosedRef.current?.(grossPnl);
      }
    });

    return unsubscribe;
  }, []); // Mount once — reads fresh state from getState() on every tick
}
