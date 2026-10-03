import { describe, it, expect } from 'vitest';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { calculateMedianPriceIndicatorValues } from '../median-price-calculation';
import { calculateAveragePriceIndicatorValues } from '../average-price-calculation';

// 🔐 Regression coverage for an off-by-one that left the newest (last) bar's
// value blank with the default offset: endIndex was computed as
// `data.length - 1`, so the main value loop (`i < endIndex`) never reached
// the final index, and the last bar only ever hit the trailing
// whitespace-only loop.
const bars: CandlestickData<UTCTimestamp>[] = [
  { time: 1 as UTCTimestamp, open: 10, high: 12, low: 8, close: 11 },
  { time: 2 as UTCTimestamp, open: 11, high: 13, low: 9, close: 12 },
  { time: 3 as UTCTimestamp, open: 12, high: 14, low: 10, close: 13 },
];

describe('offset-based indicator calculations — default offset (0)', () => {
  it.each([
    ['median price', calculateMedianPriceIndicatorValues],
    ['average price', calculateAveragePriceIndicatorValues],
  ])('%s: the last (most recent) bar has a defined value', (_name, calculate) => {
    const result = calculate(bars, {});
    const last = result[result.length - 1];
    expect('value' in last && typeof last.value === 'number').toBe(true);
  });

  it.each([
    ['median price', calculateMedianPriceIndicatorValues],
    ['average price', calculateAveragePriceIndicatorValues],
  ])('%s: returns one entry per input bar', (_name, calculate) => {
    const result = calculate(bars, {});
    expect(result).toHaveLength(bars.length);
  });
});
