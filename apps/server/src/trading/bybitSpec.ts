/**
 * Bybit trading rules the paper engine follows (BYBIT_PARITY_PLAN BP-2).
 *
 * Fees: Bybit VIP-0 (non-VIP) rates, as recorded in docs/BYBIT_PARITY_PLAN.md §2 (D4):
 *   Spot 0.1% maker / 0.1% taker; USDT Perpetual 0.02% maker / 0.055% taker.
 *
 * The client shows estimates from its own copy in generated/CDSDK/spec/bybit.ts (the server
 * build can't import SDK runtime code); bybitSpec.test.ts keeps the two identical.
 *
 * Instrument rules (tick size, qty step, minimums) come from Bybit's instruments-info through
 * services/BybitMarketInfo.ts. FALLBACK_INSTRUMENTS is a dated snapshot used only when that cache
 * is empty and Bybit REST is unreachable, so trading never blocks on it.
 *
 * Isolated margin (BP-3): maintenance margin, liquidation and bankruptcy prices follow Bybit's
 * UTA isolated-mode formulas. Risk-limit tiers come from /v5/market/risk-limit (same cache), with
 * FALLBACK_RISK_TIERS as the dated snapshot.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { Category, InstrumentRules, PositionSide } from './engine/types.js';

export type Liquidity = 'maker' | 'taker';

export const FEE_RATES: Record<Category, Record<Liquidity, string>> = {
  spot: { maker: '0.001', taker: '0.001' },
  linear: { maker: '0.0002', taker: '0.00055' },
};

/** The flat rate every pre-BP-2 fill was charged (for history rows that carry no rate). */
export const LEGACY_FEE_RATE = '0.0007';

export function feeRate(category: Category, liquidity: Liquidity): Decimal {
  // category / liquidity are typed union keys — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  return new Decimal(FEE_RATES[category][liquidity]);
}

// ─── Rejection wording ─────────────────────────────────────────────────────────
// Bybit's documented messages for the same checks (https://bybit-exchange.github.io/docs/v5/error,
// checked 2026-09-26): spot 170136 / 170140, derivatives 110094; the price-decimals message follows
// spot 170137 ("…decimal too long"). The minimum is appended so the user knows what to enter.

export const REJECT_MIN_QTY = (min: Decimal) =>
  `Order quantity lower than the minimum (${min.toString()})`;
export const REJECT_MIN_VALUE = (category: Category, min: Decimal) =>
  category === 'spot'
    ? `Order value exceeded lower limit (${min.toString()} USDT)`
    : `Order notional value below the lower limit (${min.toString()} USDT)`;
export const REJECT_PRICE_TICK = (tick: Decimal) =>
  `Order price decimal too long (tick size ${tick.toString()})`;

// ─── Rounding and minimums ─────────────────────────────────────────────────────

/** Round a quantity down to the instrument's qty step (Bybit truncates, never rounds up). */
export function floorToStep(qty: Decimal, step: Decimal): Decimal {
  if (step.lte(0)) return qty;
  return qty.div(step).floor().times(step);
}

/** True when `price` is a whole number of ticks. */
export function isOnTick(price: Decimal, tick: Decimal): boolean {
  if (tick.lte(0)) return true;
  return price.mod(tick).eq(0);
}

/** Bybit's order-size checks. Returns the rejection message, or null when the order is valid. */
export function checkOrderSize(
  category: Category,
  rules: InstrumentRules,
  qty: Decimal,
  price: Decimal
): string | null {
  if (qty.lte(0) || qty.lt(rules.minOrderQty)) return REJECT_MIN_QTY(rules.minOrderQty);
  if (qty.times(price).lt(rules.minNotional)) return REJECT_MIN_VALUE(category, rules.minNotional);
  return null;
}

// ─── Fallback instrument rules ─────────────────────────────────────────────────

type RuleRow = { tickSize: string; qtyStep: string; minOrderQty: string; minNotional: string };

/**
 * Snapshot of Bybit mainnet /v5/market/instruments-info, fetched 2026-09-26 — used only if the live cache is empty
 * and Bybit is unreachable. Spot qtyStep is basePrecision, spot minNotional is minOrderAmt.
 */
const FALLBACK: Record<Category, Record<string, RuleRow>> = {
  spot: {
    BTCUSDT: { tickSize: '0.1', qtyStep: '0.000001', minOrderQty: '0.000001', minNotional: '5' },
    ETHUSDT: { tickSize: '0.01', qtyStep: '0.00001', minOrderQty: '0.00001', minNotional: '5' },
    SOLUSDT: { tickSize: '0.01', qtyStep: '0.0001', minOrderQty: '0.0001', minNotional: '5' },
    XRPUSDT: { tickSize: '0.0001', qtyStep: '0.01', minOrderQty: '0.01', minNotional: '5' },
    BNBUSDT: { tickSize: '0.1', qtyStep: '0.0001', minOrderQty: '0.0001', minNotional: '5' },
    DOGEUSDT: { tickSize: '0.00001', qtyStep: '0.1', minOrderQty: '0.1', minNotional: '5' },
    ADAUSDT: { tickSize: '0.0001', qtyStep: '0.01', minOrderQty: '0.01', minNotional: '5' },
    AVAXUSDT: { tickSize: '0.001', qtyStep: '0.001', minOrderQty: '0.001', minNotional: '5' },
    LINKUSDT: { tickSize: '0.001', qtyStep: '0.001', minOrderQty: '0.001', minNotional: '5' },
  },
  linear: {
    BTCUSDT: { tickSize: '0.1', qtyStep: '0.001', minOrderQty: '0.001', minNotional: '5' },
    ETHUSDT: { tickSize: '0.01', qtyStep: '0.01', minOrderQty: '0.01', minNotional: '5' },
    SOLUSDT: { tickSize: '0.01', qtyStep: '0.1', minOrderQty: '0.1', minNotional: '5' },
    XRPUSDT: { tickSize: '0.0001', qtyStep: '0.1', minOrderQty: '0.1', minNotional: '5' },
    BNBUSDT: { tickSize: '0.1', qtyStep: '0.01', minOrderQty: '0.01', minNotional: '5' },
    DOGEUSDT: { tickSize: '0.00001', qtyStep: '1', minOrderQty: '1', minNotional: '5' },
    ADAUSDT: { tickSize: '0.0001', qtyStep: '1', minOrderQty: '1', minNotional: '5' },
    AVAXUSDT: { tickSize: '0.001', qtyStep: '0.1', minOrderQty: '0.1', minNotional: '5' },
    LINKUSDT: { tickSize: '0.001', qtyStep: '0.1', minOrderQty: '0.1', minNotional: '5' },
  },
};

function toRules(row: RuleRow): InstrumentRules {
  return {
    tickSize: new Decimal(row.tickSize),
    qtyStep: new Decimal(row.qtyStep),
    minOrderQty: new Decimal(row.minOrderQty),
    minNotional: new Decimal(row.minNotional),
  };
}

/** Fallback rules for a symbol; permissive (no rounding, no minimum) for an unknown symbol. */
export function fallbackRules(category: Category, symbol: string): InstrumentRules {
  // category is a typed union key, symbol only indexes a fixed literal table — safe
  // eslint-disable-next-line security/detect-object-injection
  const row = FALLBACK[category][symbol];
  if (row) return toRules(row);
  return {
    tickSize: new Decimal(0),
    qtyStep: new Decimal(0),
    minOrderQty: new Decimal(0),
    minNotional: new Decimal(0),
  };
}

/** Engine rules from a live instruments-info row (numbers, as BybitMarketInfo parses them). */
export function rulesFromInstrument(i: {
  tickSize: number;
  qtyStep: number;
  minOrderQty: number;
  minNotional: number;
}): InstrumentRules {
  return {
    tickSize: new Decimal(i.tickSize.toString()),
    qtyStep: new Decimal(i.qtyStep.toString()),
    minOrderQty: new Decimal(i.minOrderQty.toString()),
    minNotional: new Decimal(i.minNotional.toString()),
  };
}

// ─── Isolated margin: maintenance margin, liquidation, bankruptcy (BP-3) ──────
// source: https://www.bybit.com/en/help-center/article/Liquidation-Price-Calculation-under-Isolated-Mode-Unified-Trading-Account
// checked 2026-09-27. Worked example there: long 1 BTC @ 40,000, 50×, MMR 0.5%, 3,000 USDT extra
// margin → fee to close 21.56, IM 821.56, MM 221.56, liquidation price 36,380.25 (bybitSpec.test).
//
//   Fee to close        = qty × entry × (1 ∓ 1 / leverage) × taker   (− long, + short: at bankruptcy)
//   Position IM         = qty × entry / leverage + fee to close
//   Position MM         = qty × entry × MMR − mmDeduction + fee to close
//   Liq. price (long)   = [entry × qty − IM − extra / (1 − taker) − mmDeduction] / [qty × (1 − MMR)]
//   Liq. price (short)  = [entry × qty + IM + extra / (1 + taker) + mmDeduction] / [qty × (1 + MMR)]
//
// IM here is the margin the position actually holds (its stored initial margin, not recomputed):
// the fee-to-close terms of IM and MM cancel out of the liquidation price. When the mark price
// reaches the liquidation price the position is closed at the bankruptcy price — where the whole
// position margin is gone:
//   Bankruptcy (long)  = entry − (IM + extra) / qty          Bankruptcy (short) = entry + (IM + extra) / qty

const TAKER_LINEAR = feeRate('linear', 'taker');

/** One risk-limit tier: positions valued up to `riskLimitValue` USDT use this MMR / deduction. */
export interface RiskTier {
  riskLimitValue: Decimal;
  mmr: Decimal;
  mmDeduction: Decimal;
}

type TierRow = [limit: string, mmr: string, mmDeduction: string];

/**
 * Snapshot of Bybit mainnet /v5/market/risk-limit?category=linear, fetched 2026-09-27, tiers up to
 * ~2M USDT position value — used only when the live cache is empty and Bybit is unreachable.
 */
// prettier-ignore
export const FALLBACK_RISK_TIERS: Record<string, TierRow[]> = {
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

/** Used for an unknown symbol: Bybit's most common tier-1 MMR. */
const DEFAULT_TIERS: TierRow[] = [['1000000000', '0.005', '0']];

/** Fallback tiers for a symbol, lowest first. */
export function fallbackRiskTiers(symbol: string): RiskTier[] {
  const rows = Object.hasOwn(FALLBACK_RISK_TIERS, symbol)
    ? // symbol only indexes a fixed literal table (own keys checked) — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      FALLBACK_RISK_TIERS[symbol]
    : DEFAULT_TIERS;
  return rows.map(([limit, mmr, ded]) => ({
    riskLimitValue: new Decimal(limit),
    mmr: new Decimal(mmr),
    mmDeduction: new Decimal(ded),
  }));
}

/** Engine tiers from live risk-limit rows (numbers, as BybitMarketInfo parses them), lowest first. */
export function riskTiersFromBybit(
  rows: { riskLimitValue: number; maintenanceMarginRate: number; mmDeduction: number }[]
): RiskTier[] {
  return rows
    .map((r) => ({
      riskLimitValue: new Decimal(r.riskLimitValue.toString()),
      mmr: new Decimal(r.maintenanceMarginRate.toString()),
      mmDeduction: new Decimal(r.mmDeduction.toString()),
    }))
    .sort((a, b) => a.riskLimitValue.comparedTo(b.riskLimitValue));
}

/**
 * The tier a position of `positionValue` USDT falls in — Bybit UTA moves a position between tiers
 * automatically as its value changes. Above the last known tier, the last tier applies.
 */
export function tierFor(tiers: RiskTier[], positionValue: Decimal): RiskTier {
  const found = tiers.find((t) => positionValue.lte(t.riskLimitValue));
  return found ?? tiers[tiers.length - 1] ?? fallbackRiskTiers('')[0];
}

/** Bybit's estimated fee to close, priced at the bankruptcy price (entry × (1 ∓ 1/leverage)). */
export function feeToClose(
  side: PositionSide,
  qty: Decimal,
  entryPrice: Decimal,
  leverage: number
): Decimal {
  const factor =
    side === 'long'
      ? new Decimal(1).minus(new Decimal(1).div(leverage))
      : new Decimal(1).plus(new Decimal(1).div(leverage));
  return qty.times(entryPrice).times(factor).times(TAKER_LINEAR);
}

/** What the liquidation maths needs from a position. */
export interface MarginInput {
  side: PositionSide;
  quantity: Decimal;
  entryPrice: Decimal;
  /** Initial margin the position holds (qty × entry / leverage) */
  im: Decimal;
  /** Close-fee estimate held with it (Bybit's fee to close) */
  closeFeeReserve: Decimal;
  /** Margin added by hand (BP-5; 0 until then) */
  extraMargin: Decimal;
}

export interface PositionRisk {
  positionValue: Decimal;
  mmr: Decimal;
  /** Bybit positionIM: initial margin + fee to close */
  positionIM: Decimal;
  /** Bybit positionMM: value × MMR − deduction + fee to close */
  positionMM: Decimal;
  /** 0 when the position can't be liquidated (a 1× long) */
  liqPrice: Decimal;
  bustPrice: Decimal;
}

/** Bybit's isolated-margin figures for one position (formulas above). */
export function positionRisk(p: MarginInput, tiers: RiskTier[]): PositionRisk {
  const value = p.quantity.times(p.entryPrice);
  const tier = tierFor(tiers, value);
  const zero = new Decimal(0);
  const positionIM = p.im.plus(p.closeFeeReserve);
  const positionMM = value.times(tier.mmr).minus(tier.mmDeduction).plus(p.closeFeeReserve);
  if (p.quantity.lte(0)) {
    return {
      positionValue: value,
      mmr: tier.mmr,
      positionIM,
      positionMM,
      liqPrice: zero,
      bustPrice: zero,
    };
  }
  const one = new Decimal(1);
  let liqPrice: Decimal;
  let bustPrice: Decimal;
  if (p.side === 'long') {
    liqPrice = value
      .minus(p.im)
      .minus(p.extraMargin.div(one.minus(TAKER_LINEAR)))
      .minus(tier.mmDeduction)
      .div(p.quantity.times(one.minus(tier.mmr)));
    bustPrice = p.entryPrice.minus(p.im.plus(p.extraMargin).div(p.quantity));
  } else {
    liqPrice = value
      .plus(p.im)
      .plus(p.extraMargin.div(one.plus(TAKER_LINEAR)))
      .plus(tier.mmDeduction)
      .div(p.quantity.times(one.plus(tier.mmr)));
    bustPrice = p.entryPrice.plus(p.im.plus(p.extraMargin).div(p.quantity));
  }
  return {
    positionValue: value,
    mmr: tier.mmr,
    positionIM,
    positionMM,
    liqPrice: Decimal.max(zero, liqPrice),
    bustPrice: Decimal.max(zero, bustPrice),
  };
}

/** True when `mark` has reached the liquidation price (a liqPrice of 0 never liquidates). */
export function markHitsLiquidation(side: PositionSide, liqPrice: Decimal, mark: Decimal): boolean {
  if (liqPrice.lte(0) || mark.lte(0)) return false;
  return side === 'long' ? mark.lte(liqPrice) : mark.gte(liqPrice);
}
