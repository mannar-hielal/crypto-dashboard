/**
 * A one-shot request to prefill the order form (APP_LOG Bybit Parity BP-2): the Assets tab's "Sell"
 * puts a coin balance into the Spot form; a Long / Short Position drawing's "Create limit order…"
 * puts its limit order (price, TP, SL, qty). TradingPanel takes the request when it matches its
 * market and symbol, then clears it. Not persisted.
 */

import { create } from 'zustand';
import type { MarketCategory } from '@crypto-dashboard/sdk';

export interface OrderPrefill {
  category: MarketCategory;
  symbol: string;
  side: 'buy' | 'sell';
  /** Base-coin quantity */
  qty: number;
  /** A limit order: the form opens on the Limit tab with this price, and TP / SL when given */
  type?: 'limit';
  price?: number;
  takeProfit?: number;
  stopLoss?: number;
}

interface OrderPrefillState {
  request: OrderPrefill | null;
  /**
   * Counts the requests and is never cleared, with the side of the last one: the mobile layout
   * opens the (undocked) form on each new request, which TradingPanel may already have taken
   */
  seq: number;
  lastSide: 'buy' | 'sell';
  /** Whether the last request was a limit order — the docked form opens for one too */
  lastLimit: boolean;
  prefill: (request: OrderPrefill) => void;
  clear: () => void;
}

export const useOrderPrefillStore = create<OrderPrefillState>()((set) => ({
  request: null,
  seq: 0,
  lastSide: 'buy',
  lastLimit: false,
  prefill: (request) =>
    set((s) => ({
      request,
      seq: s.seq + 1,
      lastSide: request.side,
      lastLimit: request.type === 'limit',
    })),
  clear: () => set({ request: null }),
}));
