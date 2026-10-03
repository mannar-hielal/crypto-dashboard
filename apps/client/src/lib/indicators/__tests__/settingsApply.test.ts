/**
 * Regression: a settings change used to apply only after a reload. The primitives read their
 * params into consts at creation (EMA, MACD), the generic factories closed over the creation-time
 * params, series titles never changed, and `Object.assign(params, …)` mutated the persisted
 * layoutStore object in place. Each primitive must now recompute from the new params on
 * `applyOptions`, without being re-created, and leave the caller's objects untouched.
 */

import { describe, expect, it } from 'vitest';
import { getIndicatorMeta } from '../catalog';
import type { IndicatorStyle, ParamValues } from '../types';
import { candles, fakeChart, fakeSource, values } from './fakeChart';

const STYLE: IndicatorStyle = { color: '#94a3b8', lineWidth: 2, lineStyle: 'solid' };

// 120 rising-then-falling closes: long enough for EMA 50 and MACD 12/26/9 to warm up
const CLOSES = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 7) + i * 0.1);

function build(id: string, params: ParamValues) {
  const meta = getIndicatorMeta(id)!;
  const chart = fakeChart();
  const source = fakeSource(candles(CLOSES));
  const frozenParams = Object.freeze({ ...params });
  const frozenStyle = Object.freeze({ ...STYLE });
  const prim = meta.factory({
    chart: chart.api,
    source: source.api,
    params: frozenParams,
    style: frozenStyle,
    paneIndex: 0,
  });
  return { prim, chart, source, frozenParams };
}

describe('indicator settings apply without a remount', () => {
  it('[10.6.8] should recompute EMA from the new length when it changes 20 → 50', () => {
    const { prim, chart } = build('ema', { length: 20, source: 'close' });
    const series = chart.series[0];
    const before = values(series.data());
    expect(before.findIndex((v) => v !== undefined)).toBe(19);
    expect(series.options.title).toBe('EMA 20');

    prim.applyOptions({ length: 50, source: 'close' });

    const after = values(series.data());
    expect(after.findIndex((v) => v !== undefined)).toBe(49);
    expect(after.at(-1)).not.toBeCloseTo(before.at(-1)!, 6);
    expect(series.options.title).toBe('EMA 50');
    // Same series object — nothing was re-created
    expect(chart.series).toHaveLength(1);
  });

  it('should not mutate the params or style objects it was created with', () => {
    // Frozen objects: an in-place Object.assign would throw in strict mode
    const { prim, frozenParams } = build('ema', { length: 20, source: 'close' });
    expect(() => prim.applyOptions({ length: 50 })).not.toThrow();
    expect(() => prim.applyStyle({ ...STYLE, color: '#ffffff' })).not.toThrow();
    expect(frozenParams.length).toBe(20);
  });

  it('should keep using the new params when later candles arrive', () => {
    const { prim, chart, source } = build('ema', { length: 20, source: 'close' });
    prim.applyOptions({ length: 50 });
    source.push(candles([...CLOSES, 130]));
    const after = values(chart.series[0].data());
    expect(after.findIndex((v) => v !== undefined)).toBe(49);
  });

  it.each([
    ['sma', { length: 20, source: 'close' }, { length: 50 }, 'SMA 50'],
    ['momentum', { length: 10, source: 'close' }, { length: 3 }, undefined],
  ] as const)(
    'should recompute the generic %s primitive from the new params',
    (id, initial, next, title) => {
      const { prim, chart } = build(id, initial);
      const series = chart.series[0];
      const before = values(series.data());
      prim.applyOptions(next);
      const after = values(series.data());
      expect(after).not.toEqual(before);
      if (title) expect(series.options.title).toBe(title);
    }
  );

  it('should recompute MACD from the new fast/slow/signal lengths', () => {
    const { prim, chart } = build('macd', {
      fast: 12,
      slow: 26,
      signalLength: 9,
      source: 'close',
      oscMaType: 'ema',
      signalMaType: 'ema',
    });
    const macdLine = chart.series[0];
    const before = values(macdLine.data());
    expect(before.findIndex((v) => v !== undefined)).toBe(25);

    prim.applyOptions({ fast: 5, slow: 10 });

    const after = values(macdLine.data());
    expect(after.findIndex((v) => v !== undefined)).toBe(9);
  });

  it('should recompute VWAP from the new source', () => {
    const { prim, chart } = build('vwap', { source: 'hlc3', anchor: 'session' });
    // The fake candles carry no volume, so VWAP is all whitespace — the point is that
    // applyOptions re-runs the calculation instead of throwing or no-oping.
    const calls = chart.series[0].setDataCalls.length;
    prim.applyOptions({ source: 'close' });
    expect(chart.series[0].setDataCalls.length).toBe(calls + 1);
  });
});
