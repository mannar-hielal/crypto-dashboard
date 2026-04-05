import { describe, it, expect, beforeEach } from 'vitest';
import { CandleAggregator } from '../CandleAggregator.js';
import type { Kline } from '../../types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal 1-minute Kline. minuteOffset = minutes from 2025-01-01T00:00:00Z */
function makeCandle(minuteOffset: number, close = 100): Kline {
  const base = new Date('2025-01-01T00:00:00Z').getTime();
  return {
    timestamp: base + minuteOffset * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
    quoteAssetVolume: close * 10,
  };
}

describe('CandleAggregator', () => {
  let agg: CandleAggregator;

  beforeEach(() => {
    agg = new CandleAggregator();
  });

  // ── process() ────────────────────────────────────────────────────────────────

  describe('process()', () => {
    it('returns the 1m candle immediately on every call', () => {
      const c = makeCandle(0);
      const r = agg.process(c, 'BTCUSDT');
      expect(r.has('1m')).toBe(true);
      expect(r.get('1m')).toEqual(c);
    });

    it('returns an empty map for an invalid symbol (🔐 format validation)', () => {
      expect(agg.process(makeCandle(0), 'btc-usdt').size).toBe(0);
    });

    it('does NOT emit a 5m candle on the first 1m candle (opens the period)', () => {
      expect(agg.process(makeCandle(0), 'BTCUSDT').has('5m')).toBe(false);
    });

    it('emits a 5m candle when the period boundary is crossed', () => {
      for (let i = 0; i < 5; i++) {
        agg.process(makeCandle(i), 'BTCUSDT');
      }
      // t=5 crosses the 5m boundary — the previous period's candle closes
      expect(agg.process(makeCandle(5), 'BTCUSDT').has('5m')).toBe(true);
    });

    it('aggregates high, low, and close correctly across a 5m period', () => {
      [100, 105, 98, 102, 101].forEach((close, i) => {
        agg.process(makeCandle(i, close), 'BTCUSDT');
      });
      const c5 = agg.process(makeCandle(5, 103), 'BTCUSDT').get('5m')!;
      expect(c5.high).toBe(105);
      expect(c5.low).toBe(98);
      // close must equal the last 1m candle of the period (minute 4, close=101)
      expect(c5.close).toBe(101);
    });

    it('accumulates volume correctly across a 5m period (5 × vol=10 = 50)', () => {
      for (let i = 0; i < 5; i++) {
        agg.process(makeCandle(i, 100), 'BTCUSDT');
      }
      expect(agg.process(makeCandle(5, 100), 'BTCUSDT').get('5m')?.volume).toBe(50);
    });

    it('tracks multiple symbols independently', () => {
      agg.process(makeCandle(0, 100), 'BTCUSDT');
      agg.process(makeCandle(0, 3000), 'ETHUSDT');
      expect(agg.process(makeCandle(1, 101), 'BTCUSDT').get('1m')?.close).toBe(101);
      expect(agg.process(makeCandle(1, 3050), 'ETHUSDT').get('1m')?.close).toBe(3050);
    });
  });

  // ── getHistory() ─────────────────────────────────────────────────────────────

  describe('getHistory()', () => {
    it('returns an empty array for an unknown symbol', () => {
      expect(agg.getHistory('BTCUSDT', '1m')).toHaveLength(0);
    });

    it('returns stored 1m candles after processing', () => {
      for (let i = 0; i < 3; i++) {
        agg.process(makeCandle(i), 'BTCUSDT');
      }
      expect(agg.getHistory('BTCUSDT', '1m')).toHaveLength(3);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        agg.process(makeCandle(i), 'BTCUSDT');
      }
      expect(agg.getHistory('BTCUSDT', '1m', 3)).toHaveLength(3);
    });
  });

  // ── getOpenCandle() ──────────────────────────────────────────────────────────

  describe('getOpenCandle()', () => {
    it('returns null before any candles are processed', () => {
      expect(agg.getOpenCandle('BTCUSDT', '5m')).toBeNull();
    });

    it('returns the forming open candle for the current period', () => {
      agg.process(makeCandle(0, 100), 'BTCUSDT');
      const open = agg.getOpenCandle('BTCUSDT', '5m');
      expect(open).not.toBeNull();
      expect(open!.open).toBe(100);
    });
  });

  // ── clear() ──────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all state for the cleared symbol', () => {
      agg.process(makeCandle(0), 'BTCUSDT');
      agg.clear('BTCUSDT');
      expect(agg.getHistory('BTCUSDT', '1m')).toHaveLength(0);
      expect(agg.getOpenCandle('BTCUSDT', '5m')).toBeNull();
    });

    it('does not affect other symbols', () => {
      agg.process(makeCandle(0), 'BTCUSDT');
      agg.process(makeCandle(0), 'ETHUSDT');
      agg.clear('BTCUSDT');
      expect(agg.getHistory('ETHUSDT', '1m')).toHaveLength(1);
    });
  });
});
