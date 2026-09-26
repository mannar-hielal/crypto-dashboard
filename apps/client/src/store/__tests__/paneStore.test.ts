import { afterEach, describe, expect, it } from 'vitest';
import type { TickerMessage } from '@crypto-dashboard/sdk';
import { getLastKnownPrice, lastKnownPrices, paneStores, setLastKnownPrice } from '../paneStore';

// historyLoaded gates which panes may drive multi-pane time-range sync — a
// pane still on the WS cold snapshot (or the previous symbol's bars) must
// never broadcast its visible range. See lib/chartSync.ts.
describe('paneStore historyLoaded', () => {
  const store = paneStores[0];
  afterEach(() => store.getState().reset());

  it('starts false', () => {
    expect(store.getState().historyLoaded).toBe(false);
  });

  it('is set by setHistoryLoaded', () => {
    store.getState().setHistoryLoaded(true);
    expect(store.getState().historyLoaded).toBe(true);
  });

  it('is not implied by receiving bars (a WS snapshot is not full history)', () => {
    store.getState().setSnapshot(
      [
        {
          timestamp: 1_790_000_000_000,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volume: 1,
          quoteAssetVolume: 1,
        },
      ],
      null
    );
    expect(store.getState().historyLoaded).toBe(false);
  });

  it('is cleared by reset()', () => {
    store.getState().setHistoryLoaded(true);
    store.getState().reset();
    expect(store.getState().historyLoaded).toBe(false);
  });
});

// ─── Ticker (BYBIT_PARITY_PLAN BP-0) ─────────────────────────────────────────

const spotTicker = (over: Partial<TickerMessage> = {}): TickerMessage => ({
  category: 'spot',
  symbol: 'BTCUSDT',
  lastPrice: 100,
  bid: 99.9,
  ask: 100.1,
  ...over,
});

describe('paneStore setTicker', () => {
  const store = paneStores[1];
  afterEach(() => store.getState().reset());

  it('applies lastPrice and bid/ask', () => {
    store.getState().setTicker(spotTicker());
    const s = store.getState();
    expect(s.latestPrice).toBe(100);
    expect(s.bid).toBe(99.9);
    expect(s.ask).toBe(100.1);
    expect(s.markPrice).toBeNull();
  });

  it('keeps the last known bid/ask when the update has none (spot before orderbook.1)', () => {
    store.getState().setTicker(spotTicker());
    store.getState().setTicker(spotTicker({ lastPrice: 101, bid: null, ask: null }));
    const s = store.getState();
    expect(s.latestPrice).toBe(101);
    expect(s.bid).toBe(99.9);
    expect(s.ask).toBe(100.1);
  });

  it('leaves bid/ask null until the first quote arrives', () => {
    store.getState().setTicker(spotTicker({ bid: null, ask: null }));
    expect(store.getState().bid).toBeNull();
    expect(store.getState().latestPrice).toBe(100);
  });

  it('stores linear mark/index price and funding', () => {
    store.getState().setTicker(
      spotTicker({
        category: 'linear',
        markPrice: 100.05,
        indexPrice: 100.2,
        fundingRate: 0.0001,
        nextFundingTime: 1_790_380_800_000,
        fundingIntervalHour: 8,
      })
    );
    const s = store.getState();
    expect(s.markPrice).toBe(100.05);
    expect(s.indexPrice).toBe(100.2);
    expect(s.fundingRate).toBe(0.0001);
    expect(s.nextFundingTime).toBe(1_790_380_800_000);
  });

  it('recomputes priceChange against the previous candle close', () => {
    const bar = (timestamp: number, close: number) => ({
      timestamp,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
      quoteAssetVolume: 1,
    });
    store.getState().setSnapshot([bar(1_000, 90), bar(61_000, 95)], null);
    store.getState().setTicker(spotTicker({ lastPrice: 97 }));
    expect(store.getState().priceChange).toBe(7);
  });

  it('reset() clears quote and perp fields', () => {
    store.getState().setTicker(spotTicker({ markPrice: 1, fundingRate: 0.1, nextFundingTime: 5 }));
    store.getState().reset();
    const s = store.getState();
    expect([s.bid, s.ask, s.markPrice, s.indexPrice, s.fundingRate, s.nextFundingTime]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('lastKnownPrices', () => {
  afterEach(() => lastKnownPrices.clear());

  it('keeps spot and linear prices for the same symbol apart', () => {
    setLastKnownPrice('spot', 'BTCUSDT', 100);
    setLastKnownPrice('linear', 'BTCUSDT', 99);
    expect(getLastKnownPrice('BTCUSDT', 'spot')).toBe(100);
    expect(getLastKnownPrice('BTCUSDT', 'linear')).toBe(99);
  });

  it('defaults reads to spot (positions have no category until BP-2)', () => {
    setLastKnownPrice('spot', 'ETHUSDT', 2000);
    setLastKnownPrice('linear', 'SOLUSDT', 150);
    expect(getLastKnownPrice('ETHUSDT')).toBe(2000);
    expect(getLastKnownPrice('SOLUSDT')).toBeUndefined();
  });
});
