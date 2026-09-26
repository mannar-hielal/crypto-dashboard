/**
 * Bybit trading rules the paper engine follows (BYBIT_PARITY_PLAN BP-2) — the client's copy, for
 * estimates shown before an order is sent. The server charges from its own copy
 * (apps/server/src/trading/bybitSpec.ts); a server test keeps the two identical.
 *
 * Fees: Bybit VIP-0 rates. Spot 0.1% maker / 0.1% taker; USDT Perpetual 0.02% maker / 0.055% taker.
 */

import type { MarketCategory } from '../types/index.js';

export const FEE_RATES: Record<MarketCategory, { maker: string; taker: string }> = {
  spot: { maker: '0.001', taker: '0.001' },
  linear: { maker: '0.0002', taker: '0.00055' },
};

/** The flat rate every pre-BP-2 fill was charged */
export const LEGACY_FEE_RATE = '0.0007';

export const STARTING_BALANCE = 10_000;
export const MAX_LEVERAGE = 10;
