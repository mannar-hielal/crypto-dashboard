import { describe, it, expect, beforeEach } from 'vitest';
import { EMACalculator, VWAPCalculator } from '../IndicatorCalculator.js';
import type { Kline } from '../../types/index.js';

// Helper — builds a minimal candle with a given close price
function makeCandle(close: number, timestamp = Date.now()): Kline {
  return {
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    quoteAssetVolume: 0,
  };
}

// ─── EMACalculator ────────────────────────────────────────────────────────────

describe('EMACalculator', () => {
  let ema: EMACalculator;

  beforeEach(() => {
    // period = 3, multiplier = 2 / (3 + 1) = 0.5
    ema = new EMACalculator(3);
  });

  it('returns the close price before enough candles arrive', () => {
    const result = ema.update(makeCandle(10));
    expect(result.value).toBe(10); // not enough data — falls back to close
  });

  it('initialises EMA as SMA once the first full period is reached', () => {
    ema.update(makeCandle(10));
    ema.update(makeCandle(11));
    const result = ema.update(makeCandle(12)); // SMA = (10 + 11 + 12) / 3 = 11
    expect(result.value).toBe(11);
  });

  it('applies the EMA formula on subsequent candles', () => {
    ema.update(makeCandle(10));
    ema.update(makeCandle(11));
    ema.update(makeCandle(12)); // EMA seeded = 11
    const result = ema.update(makeCandle(13)); // EMA = (13 - 11) * 0.5 + 11 = 12
    expect(result.value).toBe(12);
  });

  it('reset() clears state so EMA restarts from scratch', () => {
    ema.update(makeCandle(10));
    ema.update(makeCandle(11));
    ema.update(makeCandle(12));
    ema.reset();
    expect(ema.getValue()).toBeNull();
  });

  it('attaches the correct period and timestamp to each result', () => {
    const ts = 1_700_000_000_000;
    const result = ema.update(makeCandle(10, ts));
    expect(result.period).toBe(3);
    expect(result.timestamp).toBe(ts);
  });
});

// ─── VWAPCalculator ───────────────────────────────────────────────────────────

describe('VWAPCalculator', () => {
  let vwap: VWAPCalculator;

  beforeEach(() => {
    vwap = new VWAPCalculator();
  });

  it('calculates VWAP correctly for a single candle', () => {
    // TP = (10 + 8 + 9) / 3 = 9 → VWAP = (9 × 100) / 100 = 9
    const candle: Kline = {
      timestamp: Date.now(),
      open: 9,
      high: 10,
      low: 8,
      close: 9,
      volume: 100,
      quoteAssetVolume: 0,
    };
    const result = vwap.update(candle);
    expect(result.vwap).toBeCloseTo(9);
  });

  it('accumulates VWAP across multiple candles in the same day', () => {
    const ts = new Date('2025-01-01T10:00:00Z').getTime();
    // Both candles: TP = close = 10, volume = 100 each
    // VWAP = (10×100 + 10×100) / 200 = 10
    vwap.update({
      timestamp: ts,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 100,
      quoteAssetVolume: 0,
    });
    const result = vwap.update({
      timestamp: ts + 60_000,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 100,
      quoteAssetVolume: 0,
    });
    expect(result.vwap).toBeCloseTo(10);
  });

  it('resets at UTC midnight (new trading day)', () => {
    const day1 = new Date('2025-01-01T23:59:00Z').getTime();
    const day2 = new Date('2025-01-02T00:00:00Z').getTime();

    // Day 1 candle — high VWAP
    vwap.update({
      timestamp: day1,
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 500,
      quoteAssetVolume: 0,
    });

    // Day 2 candle — only this one should count after reset
    // TP = (210 + 190 + 200) / 3 = 200 → VWAP = 200
    const result = vwap.update({
      timestamp: day2,
      open: 200,
      high: 210,
      low: 190,
      close: 200,
      volume: 200,
      quoteAssetVolume: 0,
    });

    expect(result.vwap).toBeCloseTo(200);
  });
});
