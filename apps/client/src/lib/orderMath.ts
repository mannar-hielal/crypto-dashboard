/**
 * Order estimates shown before an order is sent (APP_LOG Bybit Parity BP-2, BP-3) — pure, no React.
 *
 * Mirrors the server engine's rules (apps/server/src/trading) with the SDK's copy of Bybit's fee
 * rates and isolated-margin maths. The server re-computes everything and charges the real fee;
 * these are previews.
 *
 * USDT Perpetual: cost = initial margin (value / leverage) + open fee + Bybit's fee to close,
 * both taker; the fee to close is priced at the bankruptcy price value × (1 ∓ 1/leverage) (BP-3) —
 * exactly what the server reserves for a resting order. The estimated liquidation price is that of
 * the position the order would leave (one-way mode: a same-side order adds to it).
 * Spot: a buy pays qty × price USDT and the 0.1% fee comes out of the coins received; a sell
 * receives qty × price USDT minus 0.1%.
 */

import {
  FEE_RATES,
  estimatePositionRisk,
  linearTickSize,
  feeToCloseEstimate,
  riskTiersFor,
  type MarketCategory,
} from '@crypto-dashboard/sdk';

const TAKER = Number(FEE_RATES.linear.taker);
const SPOT_FEE = Number(FEE_RATES.spot.taker);

export interface OrderPreview {
  /** Notional value, USDT */
  value: number;
  /** USDT Perpetual only */
  margin?: number;
  openFee?: number;
  closeFee?: number;
  /**
   * USDT Perpetual only: the liquidation price of the position this order leaves (0 = can't be
   * liquidated; undefined = the order only reduces a position, or leaves none)
   */
  liqPrice?: number;
  /** What the order takes from the USDT balance (a spot sell takes none) */
  cost: number;
  /** Spot fee, in `feeAsset` */
  fee?: number;
  feeAsset?: string;
  /** Spot: what arrives — coins for a buy, USDT for a sell */
  received?: number;
}

/** The symbol's open USDT Perpetual position, as the liquidation estimate needs it. */
export interface OpenPositionForPreview {
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  /** Initial margin */
  entryUsdtAmount: number;
  closeFeeReserve: number;
  extraMargin: number;
}

/**
 * Liquidation price of the position left after an order of `qty` on `side` at `price` fills,
 * given the symbol's current position (one-way mode). Undefined when the order only reduces the
 * position or closes it exactly.
 */
export function estimateLiqPrice(p: {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  leverage: number;
  existing?: OpenPositionForPreview;
  /** The live instrument tick; the SDK snapshot when absent */
  tickSize?: number;
}): number | undefined {
  const tickSize = p.tickSize && p.tickSize > 0 ? p.tickSize : linearTickSize(p.symbol);
  if (!(p.qty > 0) || !(p.price > 0)) return undefined;
  const lev = Math.max(1, p.leverage);
  const side = p.side === 'buy' ? 'long' : 'short';
  const tiers = riskTiersFor(p.symbol);
  const ex = p.existing;
  if (ex && ex.side === side) {
    // Adds to the position: averaged entry, margins and reserves summed (as the server merges)
    const qty = ex.quantity + p.qty;
    const entryPrice = (ex.entryPrice * ex.quantity + p.price * p.qty) / qty;
    return estimatePositionRisk(
      {
        side,
        qty,
        entryPrice,
        leverage: lev,
        im: ex.entryUsdtAmount + (p.qty * p.price) / lev,
        closeFeeReserve: ex.closeFeeReserve + feeToCloseEstimate(side, p.qty, p.price, lev),
        extraMargin: ex.extraMargin,
        tickSize,
      },
      tiers
    ).liqPrice;
  }
  // Opposite side: reduces the position first; only a flip leaves a new one
  const remainder = ex ? p.qty - ex.quantity : p.qty;
  if (remainder <= 1e-12) return undefined;
  return estimatePositionRisk(
    {
      side,
      qty: remainder,
      entryPrice: p.price,
      leverage: lev,
      tickSize,
    },
    tiers
  ).liqPrice;
}

export function orderPreview(p: {
  category: MarketCategory;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  leverage: number;
  baseAsset: string;
  /** USDT Perpetual: the symbol (for its risk-limit tiers) and its open position, if any */
  symbol?: string;
  existing?: OpenPositionForPreview;
  /** The symbol's live price tick (instruments-info), for the liquidation price */
  tickSize?: number;
}): OrderPreview {
  const value = p.qty * p.price;
  if (p.category === 'linear') {
    const lev = Math.max(1, p.leverage);
    const margin = value / lev;
    const openFee = value * TAKER;
    const closeFee = feeToCloseEstimate(p.side === 'buy' ? 'long' : 'short', p.qty, p.price, lev);
    const liqPrice = p.symbol
      ? estimateLiqPrice({
          symbol: p.symbol,
          side: p.side,
          qty: p.qty,
          price: p.price,
          leverage: lev,
          existing: p.existing,
          tickSize: p.tickSize,
        })
      : undefined;
    return {
      value,
      margin,
      openFee,
      closeFee,
      cost: margin + openFee + closeFee,
      ...(liqPrice !== undefined ? { liqPrice } : {}),
    };
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
 * The largest quantity the account can afford at `price`: USDT Perpetual after margin, the open
 * fee and the fee to close (at the bankruptcy price); a spot buy from USDT; a spot sell from the
 * free coins (no shorting).
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
    const lev = Math.max(1, p.leverage);
    const closeFactor = p.side === 'buy' ? 1 - 1 / lev : 1 + 1 / lev;
    raw = p.usdtAvailable / (p.price * (1 / lev + TAKER + TAKER * closeFactor));
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
