/**
 * Heikin Ashi candles — the smoothed candle type Bybit/TradingView offer as a
 * chart style. Display-only: orders, fills and PnL always use real prices.
 *
 *   haClose = (open + high + low + close) / 4
 *   haOpen  = (prevHaOpen + prevHaClose) / 2      — first bar: (open + close) / 2
 *   haHigh  = max(high, haOpen, haClose)
 *   haLow   = min(low,  haOpen, haClose)
 *
 * Each bar depends on the previous HA bar, so a live update to the last real
 * bar must be recomputed from the preceding HA bar — callers convert the whole
 * series and take its last element rather than converting one bar in isolation.
 */
export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function toHeikinAshi<T extends OhlcBar>(bars: readonly T[]): T[] {
  const out: T[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      ...b,
      open,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      close,
    });
    prevOpen = open;
    prevClose = close;
  }
  return out;
}
