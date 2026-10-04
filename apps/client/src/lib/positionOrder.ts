/**
 * "Create limit order…" on a Long / Short Position drawing (TradingView): the order the drawing
 * describes — its side, the entry as the limit price, the target as TP, the stop as SL and the
 * qty its label shows — for the order form to prefill.
 */

import { positionLevels, positionQty, type Drawing } from 'lightweight-charts-drawing';
import { capabilitiesOf } from '@/lib/drawingCapabilities';
import { floorToStep } from '@/lib/orderMath';
import { roundToTick } from '@/lib/tradeLines';

export interface PositionOrder {
  side: 'buy' | 'sell';
  /** The limit price (the entry) */
  price: number;
  takeProfit: number;
  stopLoss: number;
  /** Base-coin quantity */
  qty: number;
}

/**
 * The order a position drawing describes, prices on the tick and the qty floored to the step; null
 * for any other drawing, or one with no usable price or qty.
 */
export function positionOrderFromDrawing(
  d: Drawing,
  instrument: { tickSize: number; qtyStep: number }
): PositionOrder | null {
  if (!capabilitiesOf(d.kind).limitOrder) return null;
  const entry = d.points[0]?.price;
  if (entry === undefined || !Number.isFinite(entry) || entry <= 0) return null;
  const sign = d.kind === 'long-position' ? 1 : -1;
  const { stop, profit } = positionLevels(d, instrument.tickSize);
  const price = roundToTick(entry, instrument.tickSize);
  const takeProfit = roundToTick(entry + sign * profit, instrument.tickSize);
  const stopLoss = roundToTick(entry - sign * stop, instrument.tickSize);
  // The qty the tool computes (risk ÷ stop distance, capped by its leverage), in coins
  const qty = floorToStep(positionQty(d.style, entry, stop).qty, instrument.qtyStep);
  if (![takeProfit, stopLoss, qty].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { side: sign === 1 ? 'buy' : 'sell', price, takeProfit, stopLoss, qty };
}
