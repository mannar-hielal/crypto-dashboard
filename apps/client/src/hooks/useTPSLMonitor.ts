/**
 * useTPSLMonitor
 *
 * Subscribes directly to ALL four paneStores (vanilla Zustand, outside React's
 * render cycle) so EVERY price tick is evaluated — React 18 automatic batching
 * can coalesce rapid ticks into a single render and cause the useEffect-based
 * approach to skip over a TP/SL level entirely.
 *
 * Each pane store subscription is matched to the symbol of THAT pane
 * (layoutStore.panes[i].symbol), not the active pane. This prevents a
 * symbol-switch timing bug where switching away from a pane could leave
 * positions in that symbol monitored against the wrong price feed.
 *
 * Root cause fix (4.18 incident):
 *   The original hook subscribed only to paneStores[0]. After switching the
 *   active pane away from BTC, paneStores[0] could be showing a different
 *   symbol — meaning BTC positions were evaluated against a non-BTC price.
 *   Combined with a manual SL typo (7800 instead of 78000), a non-BTC price
 *   satisfied the wrong SL level and closed the BTC position incorrectly.
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
 * NOTE: A symbol with no active pane showing it will NOT be evaluated in
 * real-time. The SL/TP close requires a live pane feed for that symbol.
 *
 * Must be mounted once at the app/dashboard level alongside usePaneFeeds.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { fmtPrice } from '@/lib/utils';

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

// ─── Per-pane evaluation helper ───────────────────────────────────────────────

/**
 * Evaluates TP/SL for all positions whose symbol matches the given pane's
 * current symbol. Called on every price tick from that pane's store.
 *
 * Exported for unit testing — allows tests to directly invoke the evaluation
 * logic without mounting the React hook or setting up store subscriptions.
 *
 * @param paneIndex  Index into paneStores[] and layoutStore.panes[]
 * @param latestPrice  Latest trade price from this pane's store
 * @param bars         Candle bars array from this pane's store
 * @param onClosed     Optional callback invoked with gross PnL when a position closes
 */
export function evaluatePanePositions(
  paneIndex: number,
  latestPrice: number,
  bars: { high: number; low: number }[],
  onClosed?: (pnl: number) => void
) {
  const symbol = useLayoutStore.getState().panes[paneIndex].symbol;

  // Only evaluate positions whose symbol matches THIS pane — prevents a
  // cross-symbol SL trigger when panes show different symbols.
  const positions = usePaperStore.getState().positions.filter((p) => p.symbol === symbol);
  if (positions.length === 0) return;

  const currentBar = bars[bars.length - 1];
  const candleLow = currentBar?.low ?? latestPrice;
  const candleHigh = currentBar?.high ?? latestPrice;

  const checkHigh = Math.max(latestPrice, candleHigh);
  const checkLow = Math.min(latestPrice, candleLow);

  for (const pos of positions) {
    let triggered: 'TP' | 'SL' | null = null;
    if (pos.side === 'long') {
      if (pos.takeProfit !== undefined && checkHigh >= pos.takeProfit) triggered = 'TP';
      else if (pos.stopLoss !== undefined && checkLow <= pos.stopLoss) triggered = 'SL';
    } else {
      if (pos.takeProfit !== undefined && checkLow <= pos.takeProfit) triggered = 'TP';
      else if (pos.stopLoss !== undefined && checkHigh >= pos.stopLoss) triggered = 'SL';
    }

    if (!triggered) continue;

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
    onClosed?.(grossPnl);
  }
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
    // Subscribe to ALL four pane stores independently — each subscription reads
    // the symbol of ITS OWN pane (not the active pane) so BTC positions are
    // always evaluated against the BTC price feed, never against ETH/SOL/etc.
    const unsubscribers = paneStores.map((store, paneIndex) =>
      store.subscribe((state) => {
        const { latestPrice, bars } = state;
        if (latestPrice === null) return;
        evaluatePanePositions(paneIndex, latestPrice, bars, onClosedRef.current);
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []); // Mount once — reads fresh state from getState() on every tick
}
