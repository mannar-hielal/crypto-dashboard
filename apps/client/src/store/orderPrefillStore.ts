/**
 * A one-shot request to prefill the order form (BYBIT_PARITY_PLAN BP-2): the Assets tab's "Sell"
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
  prefill: (request: OrderPrefill) => void;
  clear: () => void;
}

export const useOrderPrefillStore = create<OrderPrefillState>()((set) => ({
  request: null,
  prefill: (request) => set({ request }),
  clear: () => set({ request: null }),
}));
