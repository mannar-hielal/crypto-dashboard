/**
 * The legend's text and values (owner decision H, 2026-10-03): `<short title> <inputs>`, then one
 * value per series in its colour — the crosshair's bar, or the last bar's without one.
 */

import { describe, expect, it } from 'vitest';
import { getIndicatorMeta } from '../catalog';
import { formatLegendValue, legendTitle, legendValues } from '../legend';
import type { IndicatorSeries } from '../types';

function meta(id: string) {
  const m = getIndicatorMeta(id);
  if (!m) throw new Error(`no ${id}`);
  return m;
}

/** A series stand-in: its data and its options().color */
function series(color: string, data: object[]): IndicatorSeries {
  return { options: () => ({ color }), data: () => data } as unknown as IndicatorSeries;
}

describe('[10.6.1][10.6.2] legendTitle', () => {
  it.each([
    ['momentum', { length: 10, source: 'close' }, 'Mom 10 close'],
    ['roc', { length: 9, source: 'close' }, 'ROC 9 close'],
    [
      'macd',
      {
        fast: 12,
        slow: 26,
        signalLength: 9,
        source: 'close',
        oscMaType: 'ema',
        signalMaType: 'ema',
      },
      'MACD 12 26 close 9 EMA EMA',
    ],
    ['ema', { length: 20, source: 'close' }, 'EMA 20 close'],
    ['sma', { length: 50, source: 'high' }, 'SMA 50 high'],
    ['typical-price', {}, 'Typical Price'],
    ['vwap', { source: 'hlc3', anchor: 'session' }, 'VWAP hlc3 session'],
  ])('%s → %s', (id, params, expected) => {
    expect(legendTitle(meta(id), params)).toBe(expected);
  });

  it('should fill a missing input from its default', () => {
    expect(legendTitle(meta('roc'), {})).toBe('ROC 9 close');
    expect(legendTitle(meta('macd'), { fast: 5 })).toBe('MACD 5 26 close 9 EMA EMA');
  });

  it('should follow a settings change', () => {
    expect(legendTitle(meta('momentum'), { length: 14, source: 'high' })).toBe('Mom 14 high');
  });
});

describe('[10.6.7] legendValues', () => {
  const line = series('#ec4899', [{ time: 1, value: 1.5 }, { time: 2, value: -2.25 }, { time: 3 }]);

  it('should show the last bar that has a value when there is no crosshair', () => {
    expect(legendValues([line], null)).toEqual([{ text: '-2.25', color: '#ec4899' }]);
  });

  it('should show the crosshair bar when there is one', () => {
    const atCrosshair = new Map([[line, { time: 1, value: 1.5 }]]);
    expect(legendValues([line], atCrosshair)).toEqual([{ text: '1.50', color: '#ec4899' }]);
  });

  it('should show — for a series with no value at the crosshair bar (warm-up)', () => {
    expect(legendValues([line], new Map())).toEqual([{ text: '—', color: '#ec4899' }]);
  });

  it('should colour a histogram value with its bar colour', () => {
    const hist = series('#26a69a', [{ time: 1, value: -0.5, color: '#ff5252' }]);
    expect(legendValues([hist], null)).toEqual([{ text: '-0.5000', color: '#ff5252' }]);
  });

  it('should keep the series order (MACD: histogram, MACD, signal)', () => {
    const h = series('#26a69a', [{ time: 1, value: 3, color: '#26a69a' }]);
    const m = series('#2962ff', [{ time: 1, value: 10 }]);
    const s = series('#ff6d00', [{ time: 1, value: 7 }]);
    expect(legendValues([h, m, s], null).map((v) => v.text)).toEqual(['3.00', '10.00', '7.00']);
  });

  it('should show — for an empty series', () => {
    expect(legendValues([series('#fff', [])], null)).toEqual([{ text: '—', color: '#fff' }]);
  });
});

describe('formatLegendValue', () => {
  it.each([
    [65432.1, '65,432.10'],
    [0, '0.00'],
    [-12.345, '-12.35'],
    [0.012345, '0.0123'],
  ])('%s → %s', (value, expected) => {
    expect(formatLegendValue(value)).toBe(expected);
  });
});
