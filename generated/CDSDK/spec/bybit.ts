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

export type RiskTierRow = [
  limit: string,
  mmr: string,
  mmDeduction: string,
  imr: string,
  maxLeverage: string,
];

/** Snapshot of Bybit mainnet risk-limit tiers (fetched 2026-09-27) — same as the server's. */
// prettier-ignore
export const FALLBACK_RISK_TIERS: Record<string, RiskTierRow[]> = {
  BTCUSDT: [['300000', '0.0033', '0', '0.0066', '150'], ['2000000', '0.005', '510', '0.01', '100'], ['2600000', '0.0056', '1710', '0.0111', '90'], ['3200000', '0.0063', '3530', '0.0125', '80'], ['3800000', '0.0067', '4810', '0.0133', '75'], ['4400000', '0.0071', '6330', '0.0143', '70'], ['5000000', '0.0077', '8970', '0.0154', '65'], ['5600000', '0.0091', '15970', '0.0182', '55'], ['8500000', '0.01', '21010', '0.02', '50'], ['10000000', '0.013', '46510', '0.0222', '45'], ['14000000', '0.015', '66510', '0.025', '40'], ['20000000', '0.016', '80510', '0.0286', '35'], ['28000000', '0.02', '160510', '0.0333', '30'], ['38000000', '0.025', '300510', '0.04', '25'], ['50000000', '0.029', '452510', '0.05', '20'], ['55000000', '0.03', '502510', '0.0526', '19'], ['60000000', '0.035', '777510', '0.0556', '18'], ['65000000', '0.036', '837510', '0.0588', '17'], ['70000000', '0.038', '967510', '0.0625', '16'], ['75000000', '0.04', '1107510', '0.0667', '15'], ['80000000', '0.045', '1482510', '0.0714', '14'], ['85000000', '0.05', '1882510', '0.0769', '13'], ['90000000', '0.055', '2307510', '0.0833', '12'], ['95000000', '0.06', '2757510', '0.0909', '11'], ['100000000', '0.065', '3232510', '0.1', '10'], ['105000000', '0.07', '3732510', '0.1111', '9']],
  ETHUSDT: [['300000', '0.0033', '0', '0.0066', '150'], ['900000', '0.005', '510', '0.01', '100'], ['1200000', '0.0056', '1050', '0.0111', '90'], ['1500000', '0.0063', '1890', '0.0125', '80'], ['1800000', '0.0067', '2490', '0.0133', '75'], ['2400000', '0.0071', '3210', '0.0143', '70'], ['3200000', '0.0077', '4650', '0.0154', '65'], ['4000000', '0.0091', '9130', '0.0182', '55'], ['5000000', '0.01', '12730', '0.02', '50'], ['8000000', '0.012', '22730', '0.0222', '45'], ['12000000', '0.013', '30730', '0.025', '40'], ['16000000', '0.014', '42730', '0.0286', '35'], ['22000000', '0.015', '58730', '0.0333', '30'], ['28000000', '0.02', '168730', '0.04', '25'], ['32000000', '0.025', '308730', '0.05', '20'], ['34000000', '0.03', '468730', '0.0526', '19'], ['36000000', '0.033', '570730', '0.0556', '18'], ['38000000', '0.035', '642730', '0.0588', '17'], ['40000000', '0.038', '756730', '0.0625', '16'], ['42000000', '0.039', '796730', '0.0667', '15'], ['44000000', '0.042', '922730', '0.0714', '14'], ['46000000', '0.045', '1054730', '0.0769', '13'], ['48000000', '0.05', '1284730', '0.0833', '12'], ['50000000', '0.055', '1524730', '0.0909', '11'], ['52000000', '0.06', '1774730', '0.1', '10'], ['54000000', '0.068', '2190730', '0.1111', '9']],
  SOLUSDT: [['50000', '0.005', '0', '0.01', '100'], ['100000', '0.0056', '30', '0.0111', '90'], ['250000', '0.0063', '100', '0.0125', '80'], ['400000', '0.0067', '200', '0.0133', '75'], ['550000', '0.0071', '360', '0.0143', '70'], ['700000', '0.0077', '690', '0.0154', '65'], ['850000', '0.0091', '1670', '0.0182', '55'], ['1000000', '0.01', '2435', '0.02', '50'], ['2000000', '0.0111', '3535', '0.0222', '45'], ['3000000', '0.0125', '6335', '0.025', '40'], ['4000000', '0.0143', '11735', '0.0286', '35'], ['6000000', '0.0167', '21335', '0.0333', '30'], ['8000000', '0.02', '41135', '0.04', '25'], ['10000000', '0.025', '81135', '0.05', '20'], ['12000000', '0.0263', '94135', '0.0526', '19'], ['14000000', '0.0278', '112135', '0.0556', '18'], ['16000000', '0.0294', '134535', '0.0588', '17'], ['18000000', '0.0313', '164935', '0.0625', '16'], ['20000000', '0.0333', '200935', '0.0667', '15'], ['22000000', '0.0357', '248935', '0.0714', '14'], ['24000000', '0.0385', '310535', '0.0769', '13'], ['26000000', '0.0417', '387335', '0.0833', '12'], ['28000000', '0.0455', '486135', '0.0909', '11'], ['30000000', '0.05', '612135', '0.1', '10'], ['35000000', '0.0556', '780135', '0.1111', '9']],
  XRPUSDT: [['50000', '0.005', '0', '0.01', '100'], ['100000', '0.0056', '30', '0.0111', '90'], ['250000', '0.0063', '100', '0.0125', '80'], ['400000', '0.0067', '200', '0.0133', '75'], ['550000', '0.0071', '360', '0.0143', '70'], ['700000', '0.0077', '690', '0.0154', '65'], ['850000', '0.0091', '1670', '0.0182', '55'], ['1000000', '0.01', '2435', '0.02', '50'], ['2000000', '0.0111', '3535', '0.0222', '45'], ['3000000', '0.0125', '6335', '0.025', '40'], ['4000000', '0.0143', '11735', '0.0286', '35'], ['6000000', '0.0167', '21335', '0.0333', '30'], ['8000000', '0.02', '41135', '0.04', '25'], ['10000000', '0.025', '81135', '0.05', '20'], ['12000000', '0.0263', '94135', '0.0526', '19'], ['14000000', '0.0278', '112135', '0.0556', '18'], ['16000000', '0.0294', '134535', '0.0588', '17'], ['18000000', '0.0313', '164935', '0.0625', '16'], ['20000000', '0.0333', '200935', '0.0667', '15'], ['22000000', '0.0357', '248935', '0.0714', '14'], ['24000000', '0.0385', '310535', '0.0769', '13'], ['26000000', '0.0417', '387335', '0.0833', '12'], ['28000000', '0.0455', '486135', '0.0909', '11'], ['30000000', '0.05', '612135', '0.1', '10'], ['35000000', '0.0556', '780135', '0.1111', '9']],
  BNBUSDT: [['10000', '0.0067', '0', '0.0133', '75'], ['50000', '0.0071', '4', '0.0143', '70'], ['100000', '0.0077', '34', '0.0154', '65'], ['150000', '0.0091', '174', '0.0182', '55'], ['200000', '0.01', '309', '0.02', '50'], ['300000', '0.0111', '529', '0.0222', '45'], ['400000', '0.0125', '949', '0.025', '40'], ['500000', '0.0143', '1669', '0.0286', '35'], ['600000', '0.0167', '2869', '0.0333', '30'], ['700000', '0.02', '4849', '0.04', '25'], ['900000', '0.025', '8349', '0.05', '20'], ['1100000', '0.0263', '9519', '0.0526', '19'], ['1300000', '0.0278', '11169', '0.0556', '18'], ['1500000', '0.0294', '13249', '0.0588', '17'], ['1700000', '0.0313', '16099', '0.0625', '16'], ['1900000', '0.0333', '19499', '0.0667', '15'], ['2100000', '0.0357', '24059', '0.0714', '14'], ['2800000', '0.0385', '29939', '0.0769', '13'], ['3000000', '0.0417', '38899', '0.0833', '12'], ['3200000', '0.0455', '50299', '0.0909', '11'], ['4000000', '0.05', '64699', '0.1', '10'], ['4500000', '0.0556', '87099', '0.1111', '9']],
  DOGEUSDT: [['250000', '0.0075', '0', '0.0133', '75'], ['500000', '0.01', '625', '0.02', '50'], ['750000', '0.015', '3125', '0.03', '33.33'], ['1500000', '0.02', '6875', '0.04', '25'], ['3000000', '0.025', '14375', '0.05', '20'], ['5000000', '0.03', '29375', '0.06', '16.67'], ['7000000', '0.035', '54375', '0.07', '14.29'], ['10000000', '0.04', '89375', '0.08', '12.5'], ['12000000', '0.045', '139375', '0.09', '11.11'], ['15000000', '0.05', '199375', '0.1', '10'], ['16000000', '0.055', '274375', '0.11', '9.09']],
  ADAUSDT: [['200000', '0.0075', '0', '0.0133', '75'], ['300000', '0.01', '500', '0.02', '50'], ['500000', '0.015', '2000', '0.03', '33.33'], ['900000', '0.02', '4500', '0.04', '25'], ['1300000', '0.025', '9000', '0.05', '20'], ['1700000', '0.03', '15500', '0.06', '16.67'], ['2100000', '0.035', '24000', '0.07', '14.29'], ['2500000', '0.04', '34500', '0.08', '12.5'], ['2900000', '0.045', '47000', '0.09', '11.11'], ['3300000', '0.05', '61500', '0.1', '10'], ['3700000', '0.055', '78000', '0.11', '9.09']],
  AVAXUSDT: [['10000', '0.0067', '0', '0.0133', '75'], ['15000', '0.0071', '4', '0.0143', '70'], ['20000', '0.0077', '13', '0.0154', '65'], ['30000', '0.0091', '41', '0.0182', '55'], ['50000', '0.01', '68', '0.02', '50'], ['100000', '0.0111', '123', '0.0222', '45'], ['200000', '0.0125', '263', '0.025', '40'], ['300000', '0.0143', '623', '0.0286', '35'], ['400000', '0.0167', '1343', '0.0333', '30'], ['500000', '0.02', '2663', '0.04', '25'], ['1000000', '0.025', '5163', '0.05', '20'], ['1100000', '0.0263', '6463', '0.0526', '19'], ['1200000', '0.0278', '8113', '0.0556', '18'], ['1300000', '0.0294', '10033', '0.0588', '17'], ['1400000', '0.0313', '12503', '0.0625', '16'], ['1500000', '0.0333', '15303', '0.0667', '15'], ['2000000', '0.0357', '18903', '0.0714', '14'], ['2500000', '0.0385', '24503', '0.0769', '13'], ['3000000', '0.0417', '32503', '0.0833', '12'], ['4000000', '0.0455', '43903', '0.0909', '11'], ['5000000', '0.05', '61903', '0.1', '10'], ['6500000', '0.0556', '89903', '0.1111', '9']],
  LINKUSDT: [['10000', '0.0067', '0', '0.0133', '75'], ['50000', '0.0071', '4', '0.0143', '70'], ['100000', '0.0077', '34', '0.0154', '65'], ['150000', '0.0091', '174', '0.0182', '55'], ['200000', '0.01', '309', '0.02', '50'], ['300000', '0.0111', '529', '0.0222', '45'], ['400000', '0.0125', '949', '0.025', '40'], ['500000', '0.0143', '1669', '0.0286', '35'], ['600000', '0.0167', '2869', '0.0333', '30'], ['700000', '0.02', '4849', '0.04', '25'], ['900000', '0.025', '8349', '0.05', '20'], ['1100000', '0.0263', '9519', '0.0526', '19'], ['1300000', '0.0278', '11169', '0.0556', '18'], ['1500000', '0.0294', '13249', '0.0588', '17'], ['1700000', '0.0313', '16099', '0.0625', '16'], ['1900000', '0.0333', '19499', '0.0667', '15'], ['2100000', '0.0357', '24059', '0.0714', '14'], ['2800000', '0.0385', '29939', '0.0769', '13'], ['3000000', '0.0417', '38899', '0.0833', '12'], ['3200000', '0.0455', '50299', '0.0909', '11'], ['4000000', '0.05', '64699', '0.1', '10'], ['4500000', '0.0556', '87099', '0.1111', '9']],
};

export interface RiskTierEstimate {
  riskLimitValue: number;
  mmr: number;
  mmDeduction: number;
  imr: number;
  maxLeverage: number;
}

const DEFAULT_TIER: RiskTierEstimate = {
  riskLimitValue: 1_000_000_000,
  mmr: 0.005,
  mmDeduction: 0,
  imr: 0.01,
  maxLeverage: 100,
};

/** A symbol's tiers from the bundled snapshot, lowest first. */
export function riskTiersFor(symbol: string): RiskTierEstimate[] {
  const rows = Object.hasOwn(FALLBACK_RISK_TIERS, symbol) ? FALLBACK_RISK_TIERS[symbol] : [];
  return rows.map(([limit, mmr, ded, imr, maxLev]) => ({
    riskLimitValue: Number(limit),
    mmr: Number(mmr),
    mmDeduction: Number(ded),
    imr: Number(imr),
    maxLeverage: Number(maxLev),
  }));
}

/** The largest position value (USDT) allowed at `leverage` — the server's positionCap. */
export function positionCapEstimate(tiers: RiskTierEstimate[], leverage: number): number | null {
  let cap: number | null = null;
  for (const t of tiers) {
    if (t.maxLeverage >= leverage && (cap === null || t.riskLimitValue > cap))
      cap = t.riskLimitValue;
  }
  return cap;
}

/** Index (0-based) of the tier a position of `positionValue` USDT is in — the server's tierFor. */
export function tierIndexEstimate(tiers: RiskTierEstimate[], positionValue: number): number {
  const i = tiers.findIndex((t) => positionValue <= t.riskLimitValue);
  return i === -1 ? tiers.length - 1 : i;
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

// ─── Cross margin (BP-5 E) ─────────────────────────────────────────────────────
// Mirrors the server's bybitSpec.accountFigures (a parity test holds them together).

export interface CrossPositionEstimate {
  side: 'long' | 'short';
  qty: number;
  entryPrice: number;
  leverage: number;
  /** Live mark (the entry price when unknown) */
  mark: number;
  tiers: RiskTierEstimate[];
}

export interface AccountFiguresEstimate {
  walletBalance: number;
  unrealisedPnl: number;
  marginBalance: number;
  totalIM: number;
  totalMM: number;
  /** Infinity when the margin balance is 0 or less */
  imRate: number;
  mmRate: number;
  available: number;
}

const tierAt = (tiers: RiskTierEstimate[], value: number) =>
  tiers.find((t) => value <= t.riskLimitValue) ?? tiers[tiers.length - 1] ?? DEFAULT_TIER;

/** Bybit's mark-based position IM in cross: size × mark / leverage + fee to close at mark. */
export function crossPositionIMEstimate(p: CrossPositionEstimate): number {
  return (p.qty * p.mark) / p.leverage + feeToCloseEstimate(p.side, p.qty, p.mark, p.leverage);
}

/** Bybit's mark-based position MM in cross. */
export function crossPositionMMEstimate(p: CrossPositionEstimate): number {
  const value = p.qty * p.mark;
  const tier = tierAt(p.tiers, value);
  return (
    value * tier.mmr - tier.mmDeduction + feeToCloseEstimate(p.side, p.qty, p.mark, p.leverage)
  );
}

const upnl = (p: CrossPositionEstimate) =>
  p.side === 'long' ? (p.mark - p.entryPrice) * p.qty : (p.entryPrice - p.mark) * p.qty;

/** Margin balance, IM, MM, the rates and the available balance of a cross account. */
export function accountFiguresEstimate(
  walletBalance: number,
  positions: CrossPositionEstimate[],
  ordersIM: number
): AccountFiguresEstimate {
  let unrealisedPnl = 0;
  let totalIM = ordersIM;
  let totalMM = 0;
  for (const p of positions) {
    unrealisedPnl += upnl(p);
    totalIM += crossPositionIMEstimate(p);
    totalMM += crossPositionMMEstimate(p);
  }
  const marginBalance = walletBalance + unrealisedPnl;
  const rate = (part: number) => (marginBalance <= 0 ? Infinity : part / marginBalance);
  return {
    walletBalance,
    unrealisedPnl,
    marginBalance,
    totalIM,
    totalMM,
    imRate: rate(totalIM),
    mmRate: rate(totalMM),
    available: marginBalance - totalIM,
  };
}

/**
 * Estimated liquidation price of one position in cross (Bybit shows an estimate): the mark at which
 * the account's margin balance falls to its maintenance margin, every other position held constant
 * and the position's tier held at its current one. 0 = it can't be liquidated by its own price.
 */
export function crossLiqPriceEstimate(
  p: CrossPositionEstimate,
  figures: Pick<AccountFiguresEstimate, 'marginBalance' | 'totalMM'>
): number {
  const tier = tierAt(p.tiers, p.qty * p.mark);
  const taker = Number(FEE_RATES.linear.taker);
  const q = p.qty;
  if (q <= 0) return 0;
  // MM of this position at price x: x · q · k − deduction (tier and fee factor fixed)
  const k = tier.mmr + (p.side === 'long' ? 1 - 1 / p.leverage : 1 + 1 / p.leverage) * taker;
  const mmOthers = figures.totalMM - crossPositionMMEstimate(p);
  const liq =
    p.side === 'long'
      ? (mmOthers - tier.mmDeduction - figures.marginBalance + q * p.mark) / (q * (1 - k))
      : (figures.marginBalance + q * p.mark - mmOthers + tier.mmDeduction) / (q * (1 + k));
  return Number.isFinite(liq) && liq > 0 ? liq : 0;
}
