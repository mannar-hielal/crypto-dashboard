/**
 * Bybit trading rules the paper engine follows (BYBIT_PARITY_PLAN BP-2, BP-3) — the client's copy,
 * for estimates shown before an order is sent. The server charges from its own copy
 * (apps/server/src/trading/bybitSpec.ts); a server test keeps the two identical.
 *
 * Fees: Bybit VIP-0 rates. Spot 0.1% maker / 0.1% taker; USDT Perpetual 0.02% maker / 0.055% taker.
 * Isolated margin (BP-3): Bybit's UTA isolated-mode liquidation / bankruptcy formulas — see the
 * server copy for the formulas and their source.
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

// ─── Isolated margin (BP-3) ────────────────────────────────────────────────────

export type RiskTierRow = [limit: string, mmr: string, mmDeduction: string];

/** Snapshot of Bybit mainnet risk-limit tiers (fetched 2026-09-27) — same as the server's. */
// prettier-ignore
export const FALLBACK_RISK_TIERS: Record<string, RiskTierRow[]> = {
  BTCUSDT: [['300000', '0.0033', '0'], ['2000000', '0.005', '510']],
  ETHUSDT: [['300000', '0.0033', '0'], ['900000', '0.005', '510'], ['1200000', '0.0056', '1050'], ['1500000', '0.0063', '1890'], ['1800000', '0.0067', '2490'], ['2400000', '0.0071', '3210']],
  SOLUSDT: [['50000', '0.005', '0'], ['100000', '0.0056', '30'], ['250000', '0.0063', '100'], ['400000', '0.0067', '200'], ['550000', '0.0071', '360'], ['700000', '0.0077', '690'], ['850000', '0.0091', '1670'], ['1000000', '0.01', '2435'], ['2000000', '0.0111', '3535']],
  XRPUSDT: [['50000', '0.005', '0'], ['100000', '0.0056', '30'], ['250000', '0.0063', '100'], ['400000', '0.0067', '200'], ['550000', '0.0071', '360'], ['700000', '0.0077', '690'], ['850000', '0.0091', '1670'], ['1000000', '0.01', '2435'], ['2000000', '0.0111', '3535']],
  BNBUSDT: [['10000', '0.0067', '0'], ['50000', '0.0071', '4'], ['100000', '0.0077', '34'], ['150000', '0.0091', '174'], ['200000', '0.01', '309'], ['300000', '0.0111', '529'], ['400000', '0.0125', '949'], ['500000', '0.0143', '1669'], ['600000', '0.0167', '2869'], ['700000', '0.02', '4849'], ['900000', '0.025', '8349'], ['1100000', '0.0263', '9519'], ['1300000', '0.0278', '11169'], ['1500000', '0.0294', '13249'], ['1700000', '0.0313', '16099'], ['1900000', '0.0333', '19499'], ['2100000', '0.0357', '24059']],
  DOGEUSDT: [['250000', '0.0075', '0'], ['500000', '0.01', '625'], ['750000', '0.015', '3125'], ['1500000', '0.02', '6875'], ['3000000', '0.025', '14375']],
  ADAUSDT: [['200000', '0.0075', '0'], ['300000', '0.01', '500'], ['500000', '0.015', '2000'], ['900000', '0.02', '4500'], ['1300000', '0.025', '9000'], ['1700000', '0.03', '15500'], ['2100000', '0.035', '24000']],
  AVAXUSDT: [['10000', '0.0067', '0'], ['15000', '0.0071', '4'], ['20000', '0.0077', '13'], ['30000', '0.0091', '41'], ['50000', '0.01', '68'], ['100000', '0.0111', '123'], ['200000', '0.0125', '263'], ['300000', '0.0143', '623'], ['400000', '0.0167', '1343'], ['500000', '0.02', '2663'], ['1000000', '0.025', '5163'], ['1100000', '0.0263', '6463'], ['1200000', '0.0278', '8113'], ['1300000', '0.0294', '10033'], ['1400000', '0.0313', '12503'], ['1500000', '0.0333', '15303'], ['2000000', '0.0357', '18903']],
  LINKUSDT: [['10000', '0.0067', '0'], ['50000', '0.0071', '4'], ['100000', '0.0077', '34'], ['150000', '0.0091', '174'], ['200000', '0.01', '309'], ['300000', '0.0111', '529'], ['400000', '0.0125', '949'], ['500000', '0.0143', '1669'], ['600000', '0.0167', '2869'], ['700000', '0.02', '4849'], ['900000', '0.025', '8349'], ['1100000', '0.0263', '9519'], ['1300000', '0.0278', '11169'], ['1500000', '0.0294', '13249'], ['1700000', '0.0313', '16099'], ['1900000', '0.0333', '19499'], ['2100000', '0.0357', '24059']],
};

export interface RiskTierEstimate {
  riskLimitValue: number;
  mmr: number;
  mmDeduction: number;
}

const DEFAULT_TIER: RiskTierEstimate = {
  riskLimitValue: 1_000_000_000,
  mmr: 0.005,
  mmDeduction: 0,
};

/** A symbol's tiers from the bundled snapshot, lowest first. */
export function riskTiersFor(symbol: string): RiskTierEstimate[] {
  const rows = Object.hasOwn(FALLBACK_RISK_TIERS, symbol) ? FALLBACK_RISK_TIERS[symbol] : [];
  return rows.map(([limit, mmr, ded]) => ({
    riskLimitValue: Number(limit),
    mmr: Number(mmr),
    mmDeduction: Number(ded),
  }));
}

/** Bybit's estimated fee to close, priced at the bankruptcy price entry × (1 ∓ 1/leverage). */
export function feeToCloseEstimate(
  side: 'long' | 'short',
  qty: number,
  entryPrice: number,
  leverage: number
): number {
  const factor = side === 'long' ? 1 - 1 / leverage : 1 + 1 / leverage;
  return qty * entryPrice * factor * Number(FEE_RATES.linear.taker);
}

export interface PositionRiskEstimate {
  positionValue: number;
  mmr: number;
  positionIM: number;
  positionMM: number;
  /** 0 = can't be liquidated (a 1× long) */
  liqPrice: number;
  bustPrice: number;
}

/**
 * Bybit's isolated-margin figures for a position (or the position an order would leave).
 * `im` defaults to qty × entry / leverage; `closeFeeReserve` to the fee to close at bankruptcy.
 */
export function estimatePositionRisk(
  p: {
    side: 'long' | 'short';
    qty: number;
    entryPrice: number;
    leverage: number;
    im?: number;
    closeFeeReserve?: number;
    extraMargin?: number;
  },
  tiers: RiskTierEstimate[]
): PositionRiskEstimate {
  const value = p.qty * p.entryPrice;
  const tier =
    tiers.find((t) => value <= t.riskLimitValue) ?? tiers[tiers.length - 1] ?? DEFAULT_TIER;
  const im = p.im ?? value / p.leverage;
  const reserve = p.closeFeeReserve ?? feeToCloseEstimate(p.side, p.qty, p.entryPrice, p.leverage);
  const extra = p.extraMargin ?? 0;
  const taker = Number(FEE_RATES.linear.taker);
  const positionIM = im + reserve;
  const positionMM = value * tier.mmr - tier.mmDeduction + reserve;
  if (p.qty <= 0) {
    return {
      positionValue: value,
      mmr: tier.mmr,
      positionIM,
      positionMM,
      liqPrice: 0,
      bustPrice: 0,
    };
  }
  const long = p.side === 'long';
  const liqPrice = long
    ? (value - im - extra / (1 - taker) - tier.mmDeduction) / (p.qty * (1 - tier.mmr))
    : (value + im + extra / (1 + taker) + tier.mmDeduction) / (p.qty * (1 + tier.mmr));
  const bustPrice = long
    ? p.entryPrice - (im + extra) / p.qty
    : p.entryPrice + (im + extra) / p.qty;
  return {
    positionValue: value,
    mmr: tier.mmr,
    positionIM,
    positionMM,
    liqPrice: Math.max(0, liqPrice),
    bustPrice: Math.max(0, bustPrice),
  };
}
