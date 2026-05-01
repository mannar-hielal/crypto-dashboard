import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock EmailService ────────────────────────────────────────────────────────
vi.mock('../services/EmailService.js', () => ({
  EmailService: { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) },
}));

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
// Market routes don't touch the DB, but buildApp() registers the prisma plugin.
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

// Note: the bybit plugin is already a noop in NODE_ENV=test (see plugins/bybit.ts).
// No extra mocking needed here.

import { buildApp } from '../app.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bybit REST kline list format (newest candle first):
 * [startTime, open, high, low, close, volume, turnover]
 */
const SAMPLE_LIST = [
  ['1700000120000', '45000', '45100', '44900', '45050', '1.5', '67500'],
  ['1700000060000', '44900', '45000', '44800', '45000', '2.0', '90000'],
  ['1700000000000', '44800', '44900', '44700', '44900', '1.2', '53880'],
];

/** Stub global.fetch to return a successful Bybit kline response. */
function stubFetchOk(list = SAMPLE_LIST) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list } }),
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/market/candles', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 with candles in chronological order (oldest first)', async () => {
    stubFetchOk();

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(200);

    const body = res.json<{ symbol: string; interval: string; candles: { timestamp: number }[] }>();
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.interval).toBe('1m');
    expect(body.candles).toHaveLength(3);

    // Bybit sends newest-first — the route must reverse to chronological order
    expect(body.candles[0].timestamp).toBeLessThan(body.candles[2].timestamp);
  });

  it('uses BTCUSDT and 1m as defaults when no query params are given', async () => {
    stubFetchOk();

    const res = await app.inject({ method: 'GET', url: '/api/market/candles' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ symbol: string; interval: string }>();
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.interval).toBe('1m');
  });

  it('accepts ETHUSDT as an allowed symbol', async () => {
    stubFetchOk();
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=ETHUSDT&interval=1h',
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts SOLUSDT, BNBUSDT, DOGEUSDT and other added symbols', async () => {
    for (const sym of ['SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT']) {
      stubFetchOk();
      const res = await app.inject({
        method: 'GET',
        url: `/api/market/candles?symbol=${sym}&interval=1m`,
      });
      expect(res.statusCode, `expected 200 for ${sym}`).toBe(200);
    }
  });

  it('parses OHLCV fields correctly from the Bybit kline format', async () => {
    stubFetchOk([['1700000000000', '44800', '44900', '44700', '44900', '1.2', '53880']]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    const body = res.json<{
      candles: {
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }[];
    }>();
    const c = body.candles[0];
    expect(c.timestamp).toBe(1700000000000);
    expect(c.open).toBe(44800);
    expect(c.high).toBe(44900);
    expect(c.low).toBe(44700);
    expect(c.close).toBe(44900);
    expect(c.volume).toBeCloseTo(1.2);
  });

  it('caps the limit at 1000 even if a larger value is requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: SAMPLE_LIST } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m&limit=9999',
    });

    // The URL called must contain limit=1000, not 9999
    const calledUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('limit=1000');
  });

  it('maps app intervals to Bybit format and uses spot category first', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: SAMPLE_LIST } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1h&limit=200',
    });

    expect(res.statusCode).toBe(200);
    const calledUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('category=spot');
    expect(calledUrl).toContain('interval=60');
  });

  it('retries with linear category when spot kline returns params error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ retCode: 10001, retMsg: 'params error', result: { list: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: SAMPLE_LIST } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = (fetchMock.mock.calls[0] as [string])[0];
    const secondUrl = (fetchMock.mock.calls[1] as [string])[0];
    expect(firstUrl).toContain('category=spot');
    expect(secondUrl).toContain('category=linear');
  });

  // ── Validation (🔐 allowlist enforcement) ──────────────────────────────────

  it('returns 400 for an unsupported symbol', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=PEPEUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/symbol not supported/i);
  });

  it('returns 400 for an unsupported interval', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=2m',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/interval not supported/i);
  });

  // ── Bybit API errors → 502 ─────────────────────────────────────────────────

  it('returns 502 when Bybit returns a non-zero retCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ retCode: 10001, retMsg: 'params error', result: { list: [] } }),
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(502);
    expect(res.json<{ error: string }>().error).toMatch(/failed to fetch/i);
  });

  it('returns 502 when the upstream fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(502);
    expect(res.json<{ error: string }>().error).toMatch(/failed to fetch/i);
  });

  it('returns 502 when the upstream HTTP status is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(502);
  });
});
