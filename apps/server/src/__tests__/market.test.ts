import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
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
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

// Note: the bybit plugin is already a noop in NODE_ENV=test (see plugins/bybit.ts).
// No extra mocking needed here.

import { buildApp } from '../app.js';
import { clearMarketInfoCache } from '../services/BybitMarketInfo.js';

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

  it('maps app intervals to Bybit format and uses spot category first (matches the spot live feed)', async () => {
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

  it('fetches linear history when category=linear', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: SAMPLE_LIST } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?category=linear&symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ category: string }>().category).toBe('linear');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('category=linear');
  });

  it('defaults to category=spot and echoes it in the response', async () => {
    stubFetchOk();
    const res = await app.inject({ method: 'GET', url: '/api/market/candles?symbol=BTCUSDT' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ category: string }>().category).toBe('spot');
  });

  it('never falls back to another category when Bybit rejects the request (F1)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retCode: 10001, retMsg: 'params error', result: { list: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('category=spot');
  });

  it('returns 400 for an unsupported category (🔐 schema enum)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/candles?category=inverse&symbol=BTCUSDT&interval=1m',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
    expect(fetchMock).not.toHaveBeenCalled();
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

// ─── Instruments / risk limit ────────────────────────────────────────────────

/** Bybit instruments-info item shapes, trimmed from live responses (2026-09-26). */
function spotInstrument(symbol: string) {
  return {
    symbol,
    lotSizeFilter: { basePrecision: '0.000001', minOrderQty: '0.000001', minOrderAmt: '5' },
    priceFilter: { tickSize: '0.1' },
  };
}

function linearInstrument(symbol: string) {
  return {
    symbol,
    leverageFilter: { minLeverage: '1', maxLeverage: '150.00', leverageStep: '0.01' },
    priceFilter: { minPrice: '0.10', tickSize: '0.10' },
    lotSizeFilter: { minOrderQty: '0.001', qtyStep: '0.001', minNotionalValue: '5' },
    fundingInterval: 480,
  };
}

/** Stub fetch so every instruments-info call returns the item for the requested symbol. */
function stubInstrumentsFetch(make: (symbol: string) => unknown) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const symbol = new URL(url).searchParams.get('symbol') ?? '';
    return {
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: [make(symbol)] } }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GET /api/market/instruments', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearMarketInfoCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalises spot rules (basePrecision → qtyStep, minOrderAmt → minNotional)', async () => {
    const fetchMock = stubInstrumentsFetch(spotInstrument);

    const res = await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ category: string; instruments: Record<string, unknown>[] }>();
    expect(body.category).toBe('spot');
    expect(body.instruments).toHaveLength(9);
    expect(body.instruments[0]).toEqual({
      symbol: 'BTCUSDT',
      category: 'spot',
      tickSize: 0.1,
      qtyStep: 0.000001,
      minOrderQty: 0.000001,
      minNotional: 5,
      maxLeverage: null,
      fundingIntervalMin: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('category=spot');
  });

  it('normalises linear rules including max leverage and funding interval', async () => {
    stubInstrumentsFetch(linearInstrument);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market/instruments?category=linear',
    });

    expect(res.statusCode).toBe(200);
    const first = res.json<{ instruments: Record<string, unknown>[] }>().instruments[0];
    expect(first).toMatchObject({
      symbol: 'BTCUSDT',
      category: 'linear',
      tickSize: 0.1,
      qtyStep: 0.001,
      minOrderQty: 0.001,
      minNotional: 5,
      maxLeverage: 150,
      fundingIntervalMin: 480,
    });
  });

  it('serves repeat requests from the cache (no second upstream fetch)', async () => {
    const fetchMock = stubInstrumentsFetch(spotInstrument);

    await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });
    const res = await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('skips a malformed instrument instead of returning bad rules', async () => {
    stubInstrumentsFetch((symbol) =>
      symbol === 'ETHUSDT' ? { symbol, priceFilter: {} } : spotInstrument(symbol)
    );

    const res = await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });

    const symbols = res
      .json<{ instruments: { symbol: string }[] }>()
      .instruments.map((i) => i.symbol);
    expect(symbols).toHaveLength(8);
    expect(symbols).not.toContain('ETHUSDT');
  });

  it('serves the stale value on a failed refresh and backs off before retrying upstream', async () => {
    const t0 = 1_800_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      stubInstrumentsFetch(spotInstrument);
      await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });

      // 6 h + 1 ms later Bybit is down
      now.mockReturnValue(t0 + 6 * 60 * 60 * 1000 + 1);
      const failing = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
      vi.stubGlobal('fetch', failing);

      const stale = await app.inject({
        method: 'GET',
        url: '/api/market/instruments?category=spot',
      });
      expect(stale.statusCode).toBe(200);
      expect(stale.json<{ instruments: unknown[] }>().instruments).toHaveLength(9);
      const callsAfterFirstFailure = failing.mock.calls.length;

      // Within the 60 s back-off: stale value, no new upstream calls
      now.mockReturnValue(t0 + 6 * 60 * 60 * 1000 + 30_000);
      await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });
      await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });
      expect(failing).toHaveBeenCalledTimes(callsAfterFirstFailure);

      // After the back-off: exactly one new upstream attempt
      now.mockReturnValue(t0 + 6 * 60 * 60 * 1000 + 61_000);
      await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });
      expect(failing.mock.calls.length).toBe(callsAfterFirstFailure * 2);
    } finally {
      now.mockRestore();
    }
  });

  it('serves the symbols that loaded when one symbol call fails, and retries it soon', async () => {
    const t0 = 1_800_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      let ethFails = true;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        const symbol = new URL(url).searchParams.get('symbol') ?? '';
        if (symbol === 'ETHUSDT' && ethFails) throw new Error('rate limited');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            retCode: 0,
            retMsg: 'OK',
            result: { list: [spotInstrument(symbol)] },
          }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const partial = await app.inject({
        method: 'GET',
        url: '/api/market/instruments?category=spot',
      });
      expect(partial.statusCode).toBe(200);
      const symbols = partial
        .json<{ instruments: { symbol: string }[] }>()
        .instruments.map((i) => i.symbol);
      expect(symbols).toHaveLength(8);
      expect(symbols).not.toContain('ETHUSDT');

      // Partial result is cached only briefly (5 min), not 6 h
      now.mockReturnValue(t0 + 4 * 60_000);
      await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });
      expect(fetchMock).toHaveBeenCalledTimes(9);

      ethFails = false;
      now.mockReturnValue(t0 + 5 * 60_000 + 1);
      const full = await app.inject({
        method: 'GET',
        url: '/api/market/instruments?category=spot',
      });
      expect(fetchMock).toHaveBeenCalledTimes(18);
      expect(full.json<{ instruments: unknown[] }>().instruments).toHaveLength(9);
    } finally {
      now.mockRestore();
    }
  });

  it('returns 400 for an unsupported category', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/instruments?category=option',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 without upstream details when Bybit fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ retCode: 10006, retMsg: 'Too many visits!' }),
      })
    );

    const res = await app.inject({ method: 'GET', url: '/api/market/instruments?category=spot' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'Failed to fetch market data' });
  });
});

describe('GET /api/market/risk-limit', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearMarketInfoCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns linear risk-limit tiers, lowest tier first, with mmDeduction "" → 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        retMsg: 'OK',
        result: {
          list: [
            {
              id: 2,
              riskLimitValue: '2000000',
              maintenanceMargin: '0.005',
              initialMargin: '0.01',
              maxLeverage: '100.00',
              mmDeduction: '510',
            },
            {
              id: 1,
              riskLimitValue: '300000',
              maintenanceMargin: '0.0033',
              initialMargin: '0.0066',
              maxLeverage: '150.00',
              mmDeduction: '',
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'GET', url: '/api/market/risk-limit?symbol=BTCUSDT' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ symbol: string; tiers: { id: number; mmDeduction: number }[] }>();
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.tiers.map((t) => t.id)).toEqual([1, 2]);
    expect(body.tiers[0]).toEqual({
      id: 1,
      riskLimitValue: 300000,
      maintenanceMarginRate: 0.0033,
      initialMarginRate: 0.0066,
      maxLeverage: 150,
      mmDeduction: 0,
    });
    const calledUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('/v5/market/risk-limit');
    expect(calledUrl).toContain('category=linear');
  });

  it('returns 400 for a symbol outside the allowlist (🔐 schema enum)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({ method: 'GET', url: '/api/market/risk-limit?symbol=PEPEUSDT' });

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when symbol is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/market/risk-limit' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 when Bybit returns no tiers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: [] } }),
      })
    );

    const res = await app.inject({ method: 'GET', url: '/api/market/risk-limit?symbol=ETHUSDT' });

    expect(res.statusCode).toBe(502);
  });
});

describe('WS /api/market/ws — category', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Resolve with the close code the server sends. */
  function closeCode(ws: { on(ev: 'close', cb: (code: number) => void): void }) {
    return new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  }

  it('closes with 1008 for an unsupported category (🔐 allowlist)', async () => {
    const ws = await app.injectWS('/api/market/ws?category=inverse&symbol=BTCUSDT&interval=1m');
    expect(await closeCode(ws)).toBe(1008);
  });

  it('sends the cached quote for the requested category on connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const getTicker = vi.fn().mockReturnValue({
      category: 'linear',
      symbol: 'ETHUSDT',
      lastPrice: 2000,
      bid: 1999.9,
      ask: 2000.1,
      markPrice: 2000.05,
    });
    const service = app.bybit as { getTicker: typeof app.bybit.getTicker };
    const original = service.getTicker;
    service.getTicker = getTicker;

    try {
      let resolveMsg: (m: Record<string, unknown>) => void = () => undefined;
      const received = new Promise<Record<string, unknown>>((resolve) => {
        resolveMsg = resolve;
      });
      const ws = await app.injectWS(
        '/api/market/ws?category=linear&symbol=ETHUSDT&interval=1m',
        {},
        {
          onInit: (socket) =>
            socket.on('message', (data: Buffer) => resolveMsg(JSON.parse(data.toString()))),
        }
      );
      const msg = await received;
      ws.terminate();

      expect(getTicker).toHaveBeenCalledWith('linear', 'ETHUSDT');
      expect(msg).toMatchObject({
        type: 'ticker',
        category: 'linear',
        bid: 1999.9,
        markPrice: 2000.05,
      });
    } finally {
      service.getTicker = original;
    }
  });

  it('fetches the REST-backed snapshot from the requested category', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list: SAMPLE_LIST } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Attach the listener in onInit — the snapshot can arrive before injectWS resolves.
    let resolveMsg: (m: { type: string; bars: { category: string }[] }) => void = () => undefined;
    const received = new Promise<{ type: string; bars: { category: string }[] }>((resolve) => {
      resolveMsg = resolve;
    });
    const ws = await app.injectWS(
      '/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m',
      {},
      {
        onInit: (socket) =>
          socket.on('message', (data: Buffer) => resolveMsg(JSON.parse(data.toString()))),
      }
    );
    const msg = await received;
    ws.terminate();

    expect(msg.type).toBe('snapshot');
    expect(msg.bars[0].category).toBe('linear');
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('category=linear');
  });
});
