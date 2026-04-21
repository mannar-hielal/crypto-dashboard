/**
 * usePendingOrderMonitor
 *
 * Watches `latestPrice` from paneStores[0] (primary trading pane) every time
 * it updates and executes any pending limit/stop orders whose trigger price
 * has been breached for the active symbol.
 *
 * Trigger rules:
 *   Limit Buy  — executes when price <= triggerPrice  (buy below market)
 *   Limit Sell — executes when price >= triggerPrice  (sell above market)
 *   Stop  Buy  — executes when price >= triggerPrice  (buy above market breakout)
 *   Stop  Sell — executes when price <= triggerPrice  (sell below market breakdown)
 *
 * On execution the pending order is removed from `pendingOrders`, a real
 * position is opened via `placeOrder` (balance was already reserved at
 * placement, so we pass the reserved amount back in), and a journal entry
 * is added.
 *
 * Must be mounted once at the dashboard level alongside usePaneFeeds and
 * useTPSLMonitor.
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import type { PendingOrder } from '@/store/paperStore';

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

// ─── Hook ────────────────────────────────────────────────────────────────────

interface PendingOrderMonitorOptions {
  /** Called when a pending order is successfully filled. */
  onFilled?: () => void;
}

export function usePendingOrderMonitor({ onFilled }: PendingOrderMonitorOptions = {}) {
  // Monitor pane 0 (primary trading pane) — scoped to active symbol only
  const latestPrice = useStore(paneStores[0], (s) => s.latestPrice);
  const symbol = useLayoutStore((s) => s.panes[0].symbol);

  // Stable refs so the effect closure always reads the latest store state
  // without re-attaching the effect on every store mutation.
  const placeOrderRef = useRef(usePaperStore.getState().placeOrder);
  const fillPendingRef = useRef(usePaperStore.getState().fillPendingOrder);
  const addJournalNoteRef = useRef(usePaperStore.getState().addJournalNote);
  const onFilledRef = useRef(onFilled);
  onFilledRef.current = onFilled;

  useEffect(() => {
    if (latestPrice === null) return;

    const price = latestPrice;
    // Only evaluate pending orders for the currently active symbol.
    const pending = usePaperStore.getState().pendingOrders.filter((o) => o.symbol === symbol);

    for (const order of pending) {
      if (!checkPendingTrigger(order, price)) continue;

      // Remove from pending without creating a cancellation record — refunds
      // the reserved balance so placeOrder can deduct it again immediately.
      fillPendingRef.current(order.id);

      // Re-open as a live market position at the execution price.
      // Pass skipJournal=true — this hook adds its own human-readable journal entry below.
      const posId = placeOrderRef.current(
        order.symbol,
        order.side,
        price, // fill at current market price
        order.usdtAmount,
        order.takeProfit,
        order.stopLoss,
        true // skipJournal
      );

      const typeLabel = order.type === 'limit' ? 'Limit' : 'Stop';
      const sideLabel = order.side === 'buy' ? 'Long' : 'Short';

      if (posId) {
        onFilledRef.current?.();
        addJournalNoteRef.current(
          `${typeLabel} order filled — ${sideLabel} ${order.symbol} @ $${price.toFixed(4)} ` +
            `(trigger: $${order.triggerPrice.toFixed(4)}, qty: ${order.qty.toFixed(6)})`,
          false
        );
      } else {
        // Fill failed (e.g. balance check failed after cancel refund — edge case).
        addJournalNoteRef.current(
          `${typeLabel} order for ${order.symbol} triggered @ $${price.toFixed(4)} but could not be filled`,
          false
        );
      }
    }
  }, [latestPrice, symbol]);
}
