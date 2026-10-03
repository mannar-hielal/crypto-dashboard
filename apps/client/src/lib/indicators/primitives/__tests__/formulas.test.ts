/**
 * The indicator formulas against hand-computed values (owner, 2026-10-03). Every expected number
 * below is worked out by hand in the comment next to it.
 */

import { describe, expect, it } from 'vitest';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { calculateMomentumIndicatorValues } from '../momentum-calculation';
import { calculateRocIndicatorValues } from '../roc-calculation';
import { calculateTypicalPriceIndicatorValues } from '../typical-price-calculation';
import { exponentialMovingAverage, simpleMovingAverage } from '../moving-average-calculation';

function bars(closes: number[]): CandlestickData<UTCTimestamp>[] {
  return closes.map((close, i) => ({
    time: (1_700_000_000 + i * 60) as UTCTimestamp,
    open: close,
    high: close + 2,
    low: close - 4,
    close,
  }));
}

function valuesOf(data: unknown[]): (number | undefined)[] {
  return data.map((d) => (d as { value?: number }).value);
}

describe('[10.6.12] Momentum', () => {
  it('should be src − src[n], blank for the first n bars', () => {
    // closes 10, 12, 15, 11 · n = 2 → 15 − 10 = 5, 11 − 12 = −1
    const out = calculateMomentumIndicatorValues(bars([10, 12, 15, 11]), {
      length: 2,
      source: 'close',
    });
    expect(valuesOf(out)).toEqual([undefined, undefined, 5, -1]);
  });
});

describe('[10.6.12] Rate of Change (ROC)', () => {
  it('should equal the old Percent Change at length 1', () => {
    // 100 × (110 − 100) / 100 = 10 · 100 × (99 − 110) / 110 = −10
    const out = calculateRocIndicatorValues(bars([100, 110, 99]), { length: 1 });
    expect(valuesOf(out)).toEqual([undefined, 10, -10]);
  });

  it('should compare with the close 9 bars back at the default length 9', () => {
    // closes 1 … 12: bar 9 → 100 × (10 − 1) / 1 = 900, bar 10 → 100 × (11 − 2) / 2 = 450,
    // bar 11 → 100 × (12 − 3) / 3 = 300
    const closes = Array.from({ length: 12 }, (_, i) => i + 1);
    const out = valuesOf(calculateRocIndicatorValues(bars(closes), { length: 9 }));
    expect(out.slice(0, 9).every((v) => v === undefined)).toBe(true);
    expect(out[9]).toBeCloseTo(900, 10);
    expect(out[10]).toBeCloseTo(450, 10);
    expect(out[11]).toBeCloseTo(300, 10);
  });

  it('should read the chosen source field', () => {
    // highs are close + 2: 102 → 112 · 100 × 10 / 102 ≈ 9.8039
    const out = valuesOf(
      calculateRocIndicatorValues(bars([100, 110]), { length: 1, source: 'high' })
    );
    expect(out[1]).toBeCloseTo(1000 / 102, 10);
  });

  it('should leave a bar blank instead of dividing by a zero src[n]', () => {
    const out = valuesOf(calculateRocIndicatorValues(bars([0, 5]), { length: 1 }));
    expect(out).toEqual([undefined, undefined]);
  });
});

describe('[10.6.12] Typical Price', () => {
  it('should be (H + L + C) / 3', () => {
    // close 11 → high 13, low 7 → (13 + 7 + 11) / 3 = 31 / 3
    const out = valuesOf(calculateTypicalPriceIndicatorValues(bars([11])));
    expect(out[0]).toBeCloseTo(31 / 3, 12);
  });

  it('should keep a whitespace bar blank', () => {
    const out = calculateTypicalPriceIndicatorValues([{ time: 1 as UTCTimestamp }]);
    expect(out).toEqual([{ time: 1 }]);
  });
});

describe('[10.6.12] moving averages after warm-up', () => {
  it('SMA 3 should average the last 3 values', () => {
    // (1+2+3)/3 = 2, (2+3+4)/3 = 3, (3+4+5)/3 = 4
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });

  it('EMA 3 should smooth with k = 2 / (3 + 1) = 0.5, seeded with the first value', () => {
    // 1 → 1.5 → 2.25 → 3.125 → 4.0625 (each = 0.5 × v + 0.5 × previous); first 2 blank
    expect(exponentialMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([
      undefined,
      undefined,
      2.25,
      3.125,
      4.0625,
    ]);
  });
});
