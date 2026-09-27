/**
 * Backfill candle source: pagination over Bybit's newest-first kline pages (BP-1 review fix).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCandles } from '../infra.js';
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
