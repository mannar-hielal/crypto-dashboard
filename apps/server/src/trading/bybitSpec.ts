/**
 * Bybit trading rules the paper engine follows (APP_LOG Bybit Parity BP-2).
 *
 * Fees: Bybit VIP-0 (non-VIP) rates, as in docs/APP_LOG.md "Bybit Parity" reference values (D4):
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
  /** Initial margin rate of the tier (BP-5) */
  imr: Decimal;
  /** Highest leverage a position may use in this tier (BP-5: caps the position value) */
  maxLeverage: Decimal;
}

type TierRow = [limit: string, mmr: string, mmDeduction: string, imr: string, maxLeverage: string];

/**
 * Snapshot of Bybit mainnet /v5/market/risk-limit?category=linear, fetched 2026-09-27 — used only
 * when the live cache is empty and Bybit is unreachable. Each row: [riskLimitValue, MMR,
 * mmDeduction, IMR, maxLeverage]. Every tier up to the first whose max leverage is below our 10×
 * cap is kept, so the position cap at any allowed leverage can be read from it (BP-5).
 */
// prettier-ignore
export const FALLBACK_RISK_TIERS: Record<string, TierRow[]> = {
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

/** Used for an unknown symbol: Bybit's most common tier-1 MMR. */
const DEFAULT_TIERS: TierRow[] = [['1000000000', '0.005', '0', '0.01', '100']];

/** Fallback tiers for a symbol, lowest first. */
export function fallbackRiskTiers(symbol: string): RiskTier[] {
  const rows = Object.hasOwn(FALLBACK_RISK_TIERS, symbol)
    ? // symbol only indexes a fixed literal table (own keys checked) — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      FALLBACK_RISK_TIERS[symbol]
    : DEFAULT_TIERS;
  return rows.map(([limit, mmr, ded, imr, maxLev]) => ({
    riskLimitValue: new Decimal(limit),
    mmr: new Decimal(mmr),
    mmDeduction: new Decimal(ded),
    imr: new Decimal(imr),
    maxLeverage: new Decimal(maxLev),
  }));
}

/** Engine tiers from live risk-limit rows (numbers, as BybitMarketInfo parses them), lowest first. */
export function riskTiersFromBybit(
  rows: {
    riskLimitValue: number;
    maintenanceMarginRate: number;
    mmDeduction: number;
    initialMarginRate: number;
    maxLeverage: number;
  }[]
): RiskTier[] {
  return rows
    .map((r) => ({
      riskLimitValue: new Decimal(r.riskLimitValue.toString()),
      mmr: new Decimal(r.maintenanceMarginRate.toString()),
      mmDeduction: new Decimal(r.mmDeduction.toString()),
      imr: new Decimal(r.initialMarginRate.toString()),
      maxLeverage: new Decimal(r.maxLeverage.toString()),
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

/**
 * The largest position value (USDT) Bybit allows at `leverage`: the risk limit of the highest tier
 * whose max leverage is at least `leverage` (source: help centre "Risk limit (perpetual and
 * futures)", checked 2026-09-27). Null when no tier allows that leverage.
 */
export function positionCap(tiers: RiskTier[], leverage: number): Decimal | null {
  let cap: Decimal | null = null;
  for (const t of tiers) {
    if (t.maxLeverage.gte(leverage) && (!cap || t.riskLimitValue.gt(cap))) cap = t.riskLimitValue;
  }
  return cap;
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
  /**
   * The symbol's price tick. When given, the liquidation price is rounded to it on the safe side
   * (a long's up, a short's down), as Bybit reports it (testnet parity run, 2026-09-28: long liq
   * 75,742.94 shown as 75,743). Omitted or 0 = unrounded.
   */
  tickSize?: Decimal;
}

export interface PositionRisk {
  positionValue: Decimal;
  mmr: Decimal;
  /**
   * Bybit positionIM: initial margin + fee to close + margin added by hand (testnet parity run,
   * 2026-09-28: IM 8.43 + 10 added = positionIM 18.43)
   */
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
  const positionIM = p.im.plus(p.closeFeeReserve).plus(p.extraMargin);
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
  const tick = p.tickSize;
  if (tick && tick.gt(0)) {
    const ticks = liqPrice.div(tick);
    liqPrice = (p.side === 'long' ? ticks.ceil() : ticks.floor()).times(tick);
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

// ─── Cross margin (BP-5 E) ─────────────────────────────────────────────────────
/*
 * Bybit UTA cross-margin account figures (help centre "Margin calculations", 2026-08-07; API
 * get-wallet-balance), for USDT Perpetual with USDT collateral (collateral ratio 1, no haircut):
 *
 *   margin balance = wallet balance + Σ unrealised PnL at mark          (totalMarginBalance)
 *   position IM    = size × mark / leverage + fee to close (at mark)     (mark-based since 2025-09)
 *   position MM    = size × mark × MMR − mmDeduction + fee to close
 *   total IM       = Σ position IM + active orders' IM                   (totalInitialMargin)
 *   IM rate        = total IM ÷ margin balance; MM rate = total MM ÷ margin balance
 *   available      = margin balance − total IM                           (totalAvailableBalance)
 *
 * An order is accepted while it fits in the available balance (IM rate ≤ 100%); the account is
 * liquidated when the MM rate reaches 100%.
 */

/** One position for the account figures, valued at `mark`. */
export interface CrossPositionInput {
  side: PositionSide;
  quantity: Decimal;
  entryPrice: Decimal;
  leverage: number;
  mark: Decimal;
  tiers: RiskTier[];
}

export interface AccountFigures {
  walletBalance: Decimal;
  unrealisedPnl: Decimal;
  marginBalance: Decimal;
  totalIM: Decimal;
  totalMM: Decimal;
  /** Infinity when the margin balance is 0 or less */
  imRate: Decimal;
  mmRate: Decimal;
  available: Decimal;
}

/** Bybit's mark-based position IM in cross. */
export function crossPositionIM(p: CrossPositionInput): Decimal {
  return p.quantity
    .times(p.mark)
    .div(p.leverage)
    .plus(feeToClose(p.side, p.quantity, p.mark, p.leverage));
}

/** Bybit's mark-based position MM in cross (its tier chosen by the value at mark). */
export function crossPositionMM(p: CrossPositionInput): Decimal {
  const value = p.quantity.times(p.mark);
  const tier = tierFor(p.tiers, value);
  return value
    .times(tier.mmr)
    .minus(tier.mmDeduction)
    .plus(feeToClose(p.side, p.quantity, p.mark, p.leverage));
}

export function unrealisedPnl(
  p: Pick<CrossPositionInput, 'side' | 'quantity' | 'entryPrice' | 'mark'>
): Decimal {
  return p.side === 'long'
    ? p.mark.minus(p.entryPrice).times(p.quantity)
    : p.entryPrice.minus(p.mark).times(p.quantity);
}

const rate = (part: Decimal, of: Decimal) => (of.lte(0) ? new Decimal(Infinity) : part.div(of));

/** The account figures from the wallet balance, the positions at mark and the orders' IM. */
export function accountFigures(
  walletBalance: Decimal,
  positions: CrossPositionInput[],
  ordersIM: Decimal
): AccountFigures {
  let upnl = new Decimal(0);
  let im = ordersIM;
  let mm = new Decimal(0);
  for (const p of positions) {
    upnl = upnl.plus(unrealisedPnl(p));
    im = im.plus(crossPositionIM(p));
    mm = mm.plus(crossPositionMM(p));
  }
  const marginBalance = walletBalance.plus(upnl);
  return {
    walletBalance,
    unrealisedPnl: upnl,
    marginBalance,
    totalIM: im,
    totalMM: mm,
    imRate: rate(im, marginBalance),
    mmRate: rate(mm, marginBalance),
    available: marginBalance.minus(im),
  };
}

/**
 * Bybit's liquidation order across contracts in cross (most liquid first — UTA liquidation
 * process, 2026-08-07); a symbol not listed goes last.
 */
export const CROSS_LIQUIDATION_ORDER = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'BNBUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
] as const;
