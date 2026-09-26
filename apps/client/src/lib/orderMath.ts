/**
 * Order estimates shown before an order is sent (BYBIT_PARITY_PLAN BP-2) — pure, no React.
 *
 * Mirrors the server engine's rules (apps/server/src/trading) with the SDK's copy of Bybit's fee
 * rates. The server re-computes everything and charges the real fee; these are previews.
 *
 * USDT Perpetual: cost = initial margin (value / leverage) + open fee + estimated close fee, both
 * fees taker on notional — exactly what the server reserves for a resting order.
 * Spot: a buy pays qty × price USDT and the 0.1% fee comes out of the coins received; a sell
 * receives qty × price USDT minus 0.1%.
 */

import { FEE_RATES, type MarketCategory } from '@crypto-dashboard/sdk';

const TAKER = Number(FEE_RATES.linear.taker);
const SPOT_FEE = Number(FEE_RATES.spot.taker);

export interface OrderPreview {
  /** Notional value, USDT */
  value: number;
  /** USDT Perpetual only */
  margin?: number;
  openFee?: number;
  closeFee?: number;
  /** What the order takes from the USDT balance (a spot sell takes none) */
  cost: number;
  /** Spot fee, in `feeAsset` */
  fee?: number;
  feeAsset?: string;
  /** Spot: what arrives — coins for a buy, USDT for a sell */
  received?: number;
}

export function orderPreview(p: {
  category: MarketCategory;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  leverage: number;
  baseAsset: string;
}): OrderPreview {
  const value = p.qty * p.price;
  if (p.category === 'linear') {
    const margin = value / Math.max(1, p.leverage);
    const openFee = value * TAKER;
    const closeFee = value * TAKER;
    return { value, margin, openFee, closeFee, cost: margin + openFee + closeFee };
  }
  if (p.side === 'buy') {
    const fee = p.qty * SPOT_FEE;
    return { value, cost: value, fee, feeAsset: p.baseAsset, received: p.qty - fee };
  }
  const fee = value * SPOT_FEE;
  return { value, cost: 0, fee, feeAsset: 'USDT', received: value - fee };
}

/** Round a quantity down to the qty step (as the server does). A step of 0 leaves it as is. */
export function floorToStep(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  // Work in step units, with a tiny epsilon so 0.3 / 0.1 = 2.9999… still floors to 3
  const units = Math.floor(qty / step + 1e-9);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number((units * step).toFixed(decimals));
}

/**
 * The largest quantity the account can afford at `price`: USDT Perpetual after margin and both
 * fee estimates; a spot buy from USDT; a spot sell from the free coins (no shorting).
 */
export function maxQty(p: {
  category: MarketCategory;
  side: 'buy' | 'sell';
  price: number;
  leverage: number;
  usdtAvailable: number;
  coinFree: number;
  step: number;
}): number {
  if (!(p.price > 0)) return 0;
  let raw: number;
  if (p.category === 'linear') {
    raw = p.usdtAvailable / (p.price * (1 / Math.max(1, p.leverage) + 2 * TAKER));
  } else if (p.side === 'buy') {
    raw = p.usdtAvailable / p.price;
  } else {
    raw = p.coinFree;
  }
  return floorToStep(Math.max(0, raw), p.step);
}

/** Fee rates line for the order summary, e.g. "Fees: taker 0.055% · maker 0.02%". */
export function feeRatesLabel(category: MarketCategory): string {
  const pct = (rate: string) => `${Number((Number(rate) * 100).toFixed(4))}%`;
  // category is a typed union key — safe, controlled access
  const rates = FEE_RATES[category];
  return category === 'spot'
    ? `Fee: ${pct(rates.taker)}`
    : `Fees: taker ${pct(rates.taker)} · maker ${pct(rates.maker)}`;
}

/** "0.055% taker" / "0.02% maker" / "0.07%" — an order-history fee line. */
export function feeRateLine(order: { feeRate?: number; isMaker?: boolean }): string | null {
  if (order.feeRate === undefined) return null;
  const pct = `${Number((order.feeRate * 100).toFixed(4))}%`;
  return order.isMaker === undefined ? pct : `${pct} ${order.isMaker ? 'maker' : 'taker'}`;
}
