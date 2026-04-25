/**
 * usePendingOrderMonitor
 *
 * Subscribes directly to paneStores[0] (vanilla Zustand, outside React's
 * render cycle) so EVERY price tick is evaluated — React 18 automatic batching
 * can coalesce rapid ticks into a single render and cause the useEffect-based
 * approach to skip over a trigger level entirely.
 *
 * Two-price check per tick:
 *   1. latestPrice  — the most recent last-trade / ticker price
 *   2. currentBar.low / .high — the forming candle's extreme so a price sweep
 *      within a single candle is never missed (e.g. BTC dips to 77 547 intra-
 *      candle but the close settles at 77 560 — close-only check would miss it)
 *
 * Trigger rules:
 *   Limit Buy  — executes when effective price <= triggerPrice  (buy below market)
 *   Limit Sell — executes when effective price >= triggerPrice  (sell above market)
 *   Stop  Buy  — executes when effective price >= triggerPrice  (buy above market breakout)
 *   Stop  Sell — executes when effective price <= triggerPrice  (sell below market breakdown)
 *
 * Fill price:
 *   - latestPrice if latestPrice alone already satisfies the trigger
 *   - triggerPrice otherwise (candle-sweep fill — best approximation of the
 *     actual crossing price when the exact tick is not available)
 *
 * Must be mounted once at the dashboard level alongside usePaneFeeds and
 * useTPSLMonitor.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import type { PendingOrder } from '@/store/paperStore';
import { fmtPrice } from '@/lib/utils';

// ─── Pure trigger-check — exported for unit testing ──────────────────────────

/**
 * Determines whether a pending order should execute at `price`.
 * Pure function — no side effects, safe to unit-test in isolation.
 */
export function checkPendingTrigger(
  order: Pick<PendingOrder, 'side' | 'type' | 'triggerPrice'>,
  price: number
): boolean {
  if (order.type === 'limit') {
    // Limit Buy: price has fallen to or below the limit price → fill
    // Limit Sell: price has risen to or above the limit price → fill
    return order.side === 'buy' ? price <= order.triggerPrice : price >= order.triggerPrice;
  }
  // Stop Buy: price has risen to or above the stop price → fill
  // Stop Sell: price has fallen to or below the stop price → fill
  return order.side === 'buy' ? price >= order.triggerPrice : price <= order.triggerPrice;
}

/**
 * Returns the most conservative check-price for a pending order given the
 * current tick and the forming candle's extreme prices.
 *
 * Orders that trigger on a price DROP (limit buy, stop sell): use candle low —
 *   the lowest price reached this candle, maximising trigger sensitivity.
 * Orders that trigger on a price RISE (stop buy, limit sell): use candle high —
 *   the highest price reached this candle.
 */
export function effectiveCheckPrice(
  order: Pick<PendingOrder, 'side' | 'type'>,
  latestPrice: number,
  candleLow: number,
  candleHigh: number
): number {
  // Orders that trigger on a price DROP use the candle low:
  //   - Limit Buy  (triggers when price falls to/below limit)
  //   - Stop  Sell (triggers when price falls to/below stop)
  // Orders that trigger on a price RISE use the candle high:
  //   - Stop  Buy  (triggers when price rises to/above stop)
  //   - Limit Sell (triggers when price rises to/above limit)
  const useCandleLow =
    (order.side === 'buy' && order.type === 'limit') ||
    (order.side === 'sell' && order.type === 'stop');
  if (useCandleLow) return Math.min(latestPrice, candleLow);
  return Math.max(latestPrice, candleHigh);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface PendingOrderMonitorOptions {
  /** Called when a pending order is successfully filled. */
  onFilled?: () => void;
}

export function usePendingOrderMonitor({ onFilled }: PendingOrderMonitorOptions = {}) {
  const onFilledRef = useRef(onFilled);
  useLayoutEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);

  useEffect(() => {
    // Subscribe directly to the vanilla Zustand store — bypasses React 18
    // automatic batching so every individual price tick is evaluated.
    const unsubscribe = paneStores[0].subscribe((state) => {
      const { latestPrice, bars } = state;
      if (latestPrice === null) return;

      const symbol = useLayoutStore.getState().panes[0].symbol;
      const pending = usePaperStore.getState().pendingOrders.filter((o) => o.symbol === symbol);
      if (pending.length === 0) return;

      const currentBar = bars[bars.length - 1];
      const candleLow = currentBar?.low ?? latestPrice;
      const candleHigh = currentBar?.high ?? latestPrice;

      for (const order of pending) {
        const checkPrice = effectiveCheckPrice(order, latestPrice, candleLow, candleHigh);

        if (!checkPendingTrigger(order, checkPrice)) continue;

        // Fill price: use latestPrice if it alone crosses the trigger
        // (real-time tick fill). Fall back to triggerPrice for candle-sweep fills
        // so the position opens at the order's requested price.
        const fillPrice = checkPendingTrigger(order, latestPrice)
          ? latestPrice
          : order.triggerPrice;

        // Remove from pending without creating a cancellation record — refunds
        // the reserved balance so placeOrder can deduct it again immediately.
        usePaperStore.getState().fillPendingOrder(order.id);

        // Re-open as a live position at the fill price.
        // skipJournal=true — we write our own human-readable entry below.
        const posId = usePaperStore.getState().placeOrder(
          order.symbol,
          order.side,
          fillPrice,
          order.usdtAmount,
          order.takeProfit,
          order.stopLoss,
          true // skipJournal
        );

        const typeLabel = order.type === 'limit' ? 'Limit' : 'Stop';
        const sideLabel = order.side === 'buy' ? 'Long' : 'Short';

        if (posId) {
          onFilledRef.current?.();
          usePaperStore
            .getState()
            .addJournalNote(
              `${typeLabel} order filled — ${sideLabel} ${order.symbol} @ $${fillPrice.toFixed(4)} ` +
                `(trigger: $${order.triggerPrice.toFixed(4)}, qty: ${order.qty.toFixed(6)})`,
              false
            );
          // TV-style activation entries for bracket TP/SL legs
          if (order.takeProfit) {
            usePaperStore
              .getState()
              .addJournalNote(
                `Take-Profit order activated — ${sideLabel} ${order.symbol} @ $${fmtPrice(order.takeProfit)}`,
                false
              );
          }
          if (order.stopLoss) {
            usePaperStore
              .getState()
              .addJournalNote(
                `Stop-Loss order activated — ${sideLabel} ${order.symbol} @ $${fmtPrice(order.stopLoss)}`,
                false
              );
          }
        } else {
          // Fill failed (e.g. balance check failed after cancel refund — edge case).
          usePaperStore
            .getState()
            .addJournalNote(
              `${typeLabel} order for ${order.symbol} triggered @ $${fillPrice.toFixed(4)} but could not be filled`,
              false
            );
        }
      }
    });

    return unsubscribe;
  }, []); // Mount once — reads fresh state from getState() on every tick
}
