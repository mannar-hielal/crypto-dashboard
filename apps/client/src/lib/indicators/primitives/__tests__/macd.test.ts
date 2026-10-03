/**
 * MACD against hand-computed values, the histogram's four colours with TradingView's strict
 * "grow" rule, and the zero line (owner decisions B and C, 2026-10-03).
 */

import { describe, expect, it } from 'vitest';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { chart as chartTokens } from '@/lib/tokens';
import { calculateMacd, macdHistogramColor } from '../macd-calculation';
import { createMacdPrimitive } from '../macd';
import { candles, fakeChart, fakeSource } from '../../__tests__/fakeChart';

function bars(closes: number[]): CandlestickData<UTCTimestamp>[] {
  return closes.map((close, i) => ({
    time: (1_700_000_000 + i * 60) as UTCTimestamp,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

const EMA_INPUTS = { source: 'close', oscMaType: 'ema', signalMaType: 'ema' };

describe('[10.6.12] calculateMacd', () => {
  it('should start MACD at bar slow − 1 and the signal / histogram signal − 1 bars later (12/26/9)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const { macd, signal, histogram } = calculateMacd(bars(closes), {
      fast: 12,
      slow: 26,
      signalLength: 9,
      ...EMA_INPUTS,
    });
    const first = (xs: (number | undefined)[]) => xs.findIndex((v) => v !== undefined);
    expect(first(macd)).toBe(25); // EMA 26 is blank for its first 25 bars
    expect(first(signal)).toBe(33); // EMA 9 of MACD: 8 more bars
    expect(first(histogram)).toBe(33);
  });

  it('should match a hand-computed MACD 2 / 3 / 2', () => {
    // closes 1, 2, 4, 8, 16
    // EMA 2 (k = 2/3), seeded 1: 1, 5/3, 29/9, 173/27, 1037/81  (blank at bar 0)
    // EMA 3 (k = 1/2), seeded 1: 1, 3/2, 11/4, 43/8, 171/16      (blank at bars 0–1)
    // MACD from bar 2: 29/9 − 11/4, 173/27 − 43/8, 1037/81 − 171/16
    // signal = EMA 2 of MACD, seeded with MACD[2], blank for its first value:
    //   s3 = (2/3)·m3 + (1/3)·m2, s4 = (2/3)·m4 + (1/3)·s3
    const m2 = 29 / 9 - 11 / 4;
    const m3 = 173 / 27 - 43 / 8;
    const m4 = 1037 / 81 - 171 / 16;
    const s3 = (2 / 3) * m3 + (1 / 3) * m2;
    const s4 = (2 / 3) * m4 + (1 / 3) * s3;

    const { macd, signal, histogram } = calculateMacd(bars([1, 2, 4, 8, 16]), {
      fast: 2,
      slow: 3,
      signalLength: 2,
      ...EMA_INPUTS,
    });
    expect(macd.slice(0, 2)).toEqual([undefined, undefined]);
    expect(macd[2]).toBeCloseTo(m2, 12);
    expect(macd[3]).toBeCloseTo(m3, 12);
    expect(macd[4]).toBeCloseTo(m4, 12);
    expect(signal.slice(0, 3)).toEqual([undefined, undefined, undefined]);
    expect(signal[3]).toBeCloseTo(s3, 12);
    expect(signal[4]).toBeCloseTo(s4, 12);
    expect(histogram[3]).toBeCloseTo(m3 - s3, 12);
    expect(histogram[4]).toBeCloseTo(m4 - s4, 12);
  });
});

describe('[10.6.9] macdHistogramColor (TradingView: grow only when hist[1] < hist)', () => {
  it.each([
    ['above zero, growing', 1, 2, chartTokens.macdHistBull],
    ['above zero, falling', 2, 1, chartTokens.macdHistBullDim],
    ['above zero, equal → fall', 2, 2, chartTokens.macdHistBullDim],
    ['below zero, growing (towards zero)', -2, -1, chartTokens.macdHistBearDim],
    ['below zero, falling', -1, -2, chartTokens.macdHistBear],
    ['below zero, equal → fall', -1, -1, chartTokens.macdHistBear],
    ['first bar, no previous → fall', undefined, 3, chartTokens.macdHistBullDim],
    ['zero counts as above', -1, 0, chartTokens.macdHistBull],
  ] as const)('%s', (_name, previous, current, expected) => {
    expect(macdHistogramColor(previous, current)).toBe(expected);
  });
});

describe('[10.6.9] MACD primitive', () => {
  const PARAMS = { fast: 12, slow: 26, signalLength: 9, ...EMA_INPUTS };
  const STYLE = { color: chartTokens.macdLine, lineWidth: 2 as const, lineStyle: 'solid' as const };

  it('should draw the zero line as a dashed price line, not a fourth series', () => {
    const chart = fakeChart();
    const source = fakeSource(candles(Array.from({ length: 50 }, (_, i) => 100 + i)));
    const prim = createMacdPrimitive(chart.api, source.api, PARAMS, STYLE, 1);

    expect(chart.series).toHaveLength(3); // MACD, signal, histogram
    const lines = chart.series.flatMap((s) => s.priceLines);
    expect(lines).toEqual([
      expect.objectContaining({
        price: 0,
        color: chartTokens.zeroLine,
        lineStyle: 2, // LineStyle.Dashed
        axisLabelVisible: false,
      }),
    ]);
    expect(prim.getSeries()).toHaveLength(3);
  });

  it('should list histogram, MACD and signal for the legend, in that order', () => {
    const chart = fakeChart();
    const source = fakeSource(candles([1, 2, 3]));
    const prim = createMacdPrimitive(chart.api, source.api, PARAMS, STYLE, 1);
    const [macdLine, signalLine, hist] = chart.series;
    expect(prim.legendSeries()).toEqual([hist, macdLine, signalLine]);
  });

  it('should put all three series in the pane it is given', () => {
    const chart = fakeChart();
    createMacdPrimitive(chart.api, fakeSource(candles([1])).api, PARAMS, STYLE, 3);
    expect(chart.series.map((s) => s.paneIndex)).toEqual([3, 3, 3]);
  });
});
