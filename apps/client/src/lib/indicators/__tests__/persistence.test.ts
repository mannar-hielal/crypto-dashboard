/**
 * 🔐 Saved indicator params are range-checked, not just type-checked (PR #232 review): a tampered
 * `cd-layout` value such as `length: 1e9`, `fast: -5` or `slow: 0.5` must never reach the
 * moving-average / ROC / MACD maths, which would loop over it on every load.
 */

import { describe, expect, it } from 'vitest';
import { getIndicatorMeta } from '../catalog';
import { normalizeIndicatorInstances, sanitizeParams } from '../persistence';

const meta = (id: string) => getIndicatorMeta(id)!;

function loaded(indicatorId: string, params: unknown) {
  const [inst] = normalizeIndicatorInstances([{ instanceId: 'i_1', indicatorId, params }]);
  return inst.params;
}

describe('[10.6.10] sanitizeParams', () => {
  it('should clamp a number to the catalog min / max', () => {
    expect(loaded('ema', { length: 1e9, source: 'close' }).length).toBe(500);
    expect(loaded('momentum', { length: 1e9 }).length).toBe(200);
    expect(loaded('macd', { fast: -5 }).fast).toBe(1);
    expect(loaded('roc', { length: 0 }).length).toBe(1);
  });

  it('should fall back to the default for a non-integer where lengths are whole', () => {
    expect(loaded('macd', { slow: 0.5 }).slow).toBe(26);
    expect(loaded('sma', { length: 20.7 }).length).toBe(20);
  });

  it('should fall back to the default for a non-number, NaN or Infinity', () => {
    expect(loaded('ema', { length: '50' }).length).toBe(20);
    expect(loaded('ema', { length: Number.NaN }).length).toBe(20);
    expect(loaded('macd', { signalLength: Number.POSITIVE_INFINITY }).signalLength).toBe(9);
    expect(loaded('ema', { length: { valueOf: 50 } }).length).toBe(20);
  });

  it('should drop keys the catalog does not declare', () => {
    const params = loaded('ema', { length: 50, source: 'close', offset: 3, __proto__x: 1 });
    expect(params).toEqual({ length: 50, source: 'close' });
  });

  it('should replace a select value that is not one of its options', () => {
    expect(loaded('ema', { length: 50, source: 'volume' }).source).toBe('close');
    expect(loaded('macd', { oscMaType: 'wma' }).oscMaType).toBe('ema');
    expect(loaded('vwap', { anchor: 'decade' }).anchor).toBe('session');
  });

  it('should keep valid values and fill missing ones from the defaults', () => {
    expect(loaded('macd', { fast: 5, slow: 35, source: 'hl2' })).toEqual({
      fast: 5,
      slow: 35,
      signalLength: 9,
      source: 'hl2',
      oscMaType: 'ema',
      signalMaType: 'ema',
    });
    expect(loaded('typical-price', { anything: 1 })).toEqual({});
  });

  it('should treat params that are not an object as all defaults', () => {
    expect(loaded('roc', 'oops')).toEqual({ length: 9, source: 'close' });
    expect(loaded('roc', [1, 2])).toEqual({ length: 9, source: 'close' });
  });

  it('should check a settings save the same way', () => {
    expect(sanitizeParams(meta('ema'), { length: 100000, source: 'close' })).toEqual({
      length: 500,
      source: 'close',
    });
  });
});
