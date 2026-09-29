/**
 * A one-shot request to prefill the order form (APP_LOG Bybit Parity BP-2): the Assets tab's "Sell"
 * puts a coin balance into the Spot form. TradingPanel takes the request when it matches its
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
}

interface OrderPrefillState {
  request: OrderPrefill | null;
  /**
   * Counts the requests and is never cleared, with the side of the last one: the mobile layout
   * opens the (undocked) form on each new request, which TradingPanel may already have taken
   */
  seq: number;
  lastSide: 'buy' | 'sell';
  prefill: (request: OrderPrefill) => void;
  clear: () => void;
}

export const useOrderPrefillStore = create<OrderPrefillState>()((set) => ({
  request: null,
  seq: 0,
  lastSide: 'buy',
  prefill: (request) => set((s) => ({ request, seq: s.seq + 1, lastSide: request.side })),
  clear: () => set({ request: null }),
}));
