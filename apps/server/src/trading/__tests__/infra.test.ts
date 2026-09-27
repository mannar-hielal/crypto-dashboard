/**
 * Backfill candle source: pagination over Bybit's newest-first kline pages (BP-1 review fix).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCandles, fetchFundingHistory } from '../infra.js';
import { resetBybitBreakers } from '../../lib/fetchWithRetry.js';

/** Fake Bybit kline endpoint over a fixed series of 1m candles. */
function stubKlines(fromMs: number, count: number) {
  const all = Array.from({ length: count }, (_, i) => fromMs + i * 60_000);
  const fetchMock = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams;
    const start = Number(q.get('start'));
    const end = Number(q.get('end'));
    const limit = Number(q.get('limit'));
    const inRange = all.filter((t) => t >= start && t <= end);
    const page = inRange.slice(-limit).reverse(); // newest first, like Bybit
    return {
      ok: true,
      json: async () => ({
        retCode: 0,
        retMsg: 'OK',
        result: { list: page.map((t) => [String(t), '1', '2', '0.5', '1', '1', '1']) },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBybitBreakers();
});

describe('fetchCandles()', () => {
  it('returns the whole range oldest first when it fits in one page', async () => {
    stubKlines(0, 10);
    const candles = await fetchCandles('linear', 'BTCUSDT', 0, 9 * 60_000);
    expect(candles.map((c) => c.start)).toEqual(Array.from({ length: 10 }, (_, i) => i * 60_000));
  });

  it('pages backwards so a gap longer than 1000 minutes is replayed from its start', async () => {
    const fetchMock = stubKlines(0, 2_500);
    const candles = await fetchCandles('linear', 'BTCUSDT', 0, 2_499 * 60_000);
    expect(candles).toHaveLength(2_500);
    expect(candles[0].start).toBe(0); // the oldest minutes are not lost
    expect(candles.at(-1)?.start).toBe(2_499 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetches the candles of the market being backfilled', async () => {
    const fetchMock = stubKlines(0, 10);
    await fetchCandles('spot', 'BTCUSDT', 0, 9 * 60_000);
    await fetchCandles('linear', 'BTCUSDT', 0, 9 * 60_000);
    const categories = fetchMock.mock.calls.map(([url]) =>
      new URL(url).searchParams.get('category')
    );
    expect(categories).toEqual(['spot', 'linear']);
  });

  it('reads mark-price candles from the mark-price kline endpoint (liquidation backfill, BP-3)', async () => {
    const fetchMock = stubKlines(0, 10);
    const candles = await fetchCandles('linear', 'BTCUSDT', 0, 9 * 60_000, 'mark');
    expect(candles).toHaveLength(10);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v5/market/mark-price-kline');
  });

  it('retries a transient upstream failure', async () => {
    const fetchMock = stubKlines(0, 10);
    const impl = fetchMock.getMockImplementation();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('ECONNRESET');
    });
    if (impl) fetchMock.mockImplementation(impl);
    const candles = await fetchCandles('linear', 'BTCUSDT', 0, 9 * 60_000);
    expect(candles).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFundingHistory() (BP-4)', () => {
  /** Fake funding history: one settlement every 8 h, newest first, ≤ limit per page */
  function stubFunding(count: number) {
    const every = 8 * 3_600_000;
    const all = Array.from({ length: count }, (_, i) => (i + 1) * every);
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams;
      const start = Number(q.get('startTime'));
      const end = Number(q.get('endTime'));
      const limit = Number(q.get('limit'));
      const page = all
        .filter((t) => t >= start && t <= end)
        .slice(-limit)
        .reverse();
      return {
        ok: true,
        json: async () => ({
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: page.map((t) => ({
              symbol: 'BTCUSDT',
              fundingRate: '0.0001',
              fundingRateTimestamp: String(t),
            })),
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, every };
  }

  it('returns the settlements in the gap oldest first, capped at the last 7 days', async () => {
    const { fetchMock, every } = stubFunding(250);
    const out = await fetchFundingHistory('BTCUSDT', 0, 250 * every);
    expect(out).toHaveLength(22); // the 7-day cap, both ends: 22 settlements at 8 h
    expect(out[0].ts).toBeLessThan(out[21].ts);
    expect(out[0].rate.toString()).toBe('0.0001');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v5/market/funding/history');
    expect(url.searchParams.get('startTime')).not.toBeNull(); // startTime alone is an error
    expect(url.searchParams.get('endTime')).not.toBeNull();
  });

  it('finds one timestamp exactly (the live settlement lookup)', async () => {
    const { every } = stubFunding(5);
    const out = await fetchFundingHistory('BTCUSDT', 3 * every - 1, 3 * every);
    expect(out.map((f) => f.ts)).toEqual([3 * every]);
  });
});
