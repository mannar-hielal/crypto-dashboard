/**
 * marketStore tests
 *
 * Tests cover data-pipeline state transitions:
 *   - setSnapshot(): bulk replacement with MAX_BARS cap
 *   - addBar(): upsert logic (same timestamp → update, new timestamp → append)
 *   - derived state: latestPrice, priceChange, indicators
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMarketStore } from '../marketStore';
import type { CandleBar, IndicatorSnapshot, LiveBar } from '@crypto-dashboard/sdk';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_BARS = 500;

function makeBar(timestamp: number, close: number): CandleBar {
  return {
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
    quoteAssetVolume: 0,
  };
}

function makeLiveBar(timestamp: number, close: number): LiveBar {
  const indicators: IndicatorSnapshot = {
    ema9: close * 0.99,
    ema21: close * 0.98,
    ema200: close * 0.95,
    macd: { macd: 10, signal: 8, histogram: 2 },
    vwap: close * 1.001,
  };
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    kline: makeBar(timestamp, close),
    indicators,
  };
}

function makeSnapshot(count: number, startPrice = 100): CandleBar[] {
  return Array.from({ length: count }, (_, i) => makeBar(i * 60_000, startPrice + i));
}

/** Resets the store to its initial state between tests. */
function resetStore() {
  useMarketStore.setState({
    bars: [],
    indicators: null,
    latestPrice: null,
    priceChange: null,
    isConnected: false,
    symbol: 'BTCUSDT', // reset so setSymbol() tests don't leak into others
    interval: '1m', // reset so setInterval() tests don't leak into others
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('marketStore', () => {
  beforeEach(() => resetStore());

  // ── setSnapshot() ─────────────────────────────────────────────────────────

  describe('setSnapshot()', () => {
    it('stores bars from the snapshot', () => {
      const bars = makeSnapshot(5);
      useMarketStore.getState().setSnapshot(bars, null);
      expect(useMarketStore.getState().bars).toHaveLength(5);
    });

    it('caps bars at MAX_BARS (500) when given a larger array', () => {
      const bars = makeSnapshot(MAX_BARS + 50);
      useMarketStore.getState().setSnapshot(bars, null);
      expect(useMarketStore.getState().bars).toHaveLength(MAX_BARS);
    });

    it('keeps the MOST RECENT bars (slices from the end)', () => {
      const bars = makeSnapshot(MAX_BARS + 10, 0);
      useMarketStore.getState().setSnapshot(bars, null);
      const stored = useMarketStore.getState().bars;
      // The last bar should be the newest one
      expect(stored[stored.length - 1].close).toBe(bars[bars.length - 1].close);
    });

    it('sets latestPrice to the close of the last bar', () => {
      const bars = makeSnapshot(3, 100); // closes: 100, 101, 102
      useMarketStore.getState().setSnapshot(bars, null);
      expect(useMarketStore.getState().latestPrice).toBe(102);
    });

    it('sets priceChange as last close minus second-to-last close', () => {
      const bars = makeSnapshot(3, 100); // 100, 101, 102
      useMarketStore.getState().setSnapshot(bars, null);
      expect(useMarketStore.getState().priceChange).toBeCloseTo(1); // 102 - 101
    });

    it('sets priceChange to null when given fewer than 2 bars', () => {
      useMarketStore.getState().setSnapshot([makeBar(0, 100)], null);
      expect(useMarketStore.getState().priceChange).toBeNull();
    });

    it('stores the provided indicator snapshot', () => {
      const indicators: IndicatorSnapshot = {
        ema9: 100,
        ema21: 99,
        ema200: 95,
        macd: null,
        vwap: 100.5,
      };
      useMarketStore.getState().setSnapshot(makeSnapshot(2), indicators);
      expect(useMarketStore.getState().indicators).toEqual(indicators);
    });

    it('handles an empty bars array gracefully (no crash)', () => {
      expect(() => useMarketStore.getState().setSnapshot([], null)).not.toThrow();
      expect(useMarketStore.getState().latestPrice).toBeNull();
    });
  });

  // ── addBar() ──────────────────────────────────────────────────────────────

  describe('addBar()', () => {
    it('appends a bar when the timestamp is new', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(3, 100), null);
      useMarketStore.getState().addBar(makeLiveBar(3 * 60_000, 103));
      expect(useMarketStore.getState().bars).toHaveLength(4);
    });

    it('updates the last bar in-place when the timestamp matches (forming candle)', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(3, 100), null);
      const lastTs = useMarketStore.getState().bars[2].timestamp;

      // Same timestamp → update in place, no new bar
      useMarketStore.getState().addBar(makeLiveBar(lastTs, 999));
      const bars = useMarketStore.getState().bars;
      expect(bars).toHaveLength(3); // length unchanged
      expect(bars[2].close).toBe(999); // last bar updated
    });

    it('caps total bars at MAX_BARS when appending new candles', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(MAX_BARS, 100), null);
      // Append one new bar (new timestamp)
      useMarketStore.getState().addBar(makeLiveBar(MAX_BARS * 60_000, 600));
      expect(useMarketStore.getState().bars).toHaveLength(MAX_BARS);
    });

    it('updates latestPrice to the close of the incoming bar', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(2, 100), null);
      useMarketStore.getState().addBar(makeLiveBar(2 * 60_000, 200));
      expect(useMarketStore.getState().latestPrice).toBe(200);
    });

    it('updates indicators from the live bar', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(2, 100), null);
      const liveBar = makeLiveBar(2 * 60_000, 102);
      useMarketStore.getState().addBar(liveBar);
      expect(useMarketStore.getState().indicators).toEqual(liveBar.indicators);
    });

    it('updates priceChange relative to the previous bar', () => {
      useMarketStore.getState().setSnapshot(makeSnapshot(2, 100), null);
      // bars[1].close = 101; new bar close = 110 → priceChange = 110 - 101 = 9
      useMarketStore.getState().addBar(makeLiveBar(2 * 60_000, 110));
      expect(useMarketStore.getState().priceChange).toBeCloseTo(9);
    });
  });

  // ── setConnected() ────────────────────────────────────────────────────────

  describe('setConnected()', () => {
    it('sets isConnected to true', () => {
      useMarketStore.getState().setConnected(true);
      expect(useMarketStore.getState().isConnected).toBe(true);
    });

    it('sets isConnected to false', () => {
      useMarketStore.getState().setConnected(true);
      useMarketStore.getState().setConnected(false);
      expect(useMarketStore.getState().isConnected).toBe(false);
    });
  });

  // ── setSymbol() / setInterval() ───────────────────────────────────────────

  describe('setSymbol() / setInterval()', () => {
    it('updates the active symbol', () => {
      useMarketStore.getState().setSymbol('ETHUSDT');
      expect(useMarketStore.getState().symbol).toBe('ETHUSDT');
    });

    it('updates the active interval', () => {
      useMarketStore.getState().setInterval('4h');
      expect(useMarketStore.getState().interval).toBe('4h');
    });
  });
});
