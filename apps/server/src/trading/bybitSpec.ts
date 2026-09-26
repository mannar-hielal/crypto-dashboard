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
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { Category, InstrumentRules } from './engine/types.js';

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
