/**
 * BybitMarketInfo — stale cache on a Bybit error (docs/TRADING_TEST_PLAN.md 12.3.5, SC-12.3-2).
 *
 * Instrument rules and risk-limit tiers are cached for 6 h. When a refresh after that fails
 * (here: Bybit answers HTTP 500 on every attempt), the last good value is served instead of an
 * error; with nothing cached, the route answers 502 with a fixed message and no upstream text.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../../services/EmailService.js', () => ({
  EmailService: { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) },
}));

// The market routes don't touch the DB, but buildApp() registers the prisma plugin
vi.mock('../../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../../app.js';
import { clearMarketInfoCache, getInstruments, getRiskLimit } from '../BybitMarketInfo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIX_HOURS = 6 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;

/** BTCUSDT risk-limit tiers as Bybit's /v5/market/risk-limit lists them (tier 1 first). */
const RISK_TIERS = [
  {
    id: 1,
    riskLimitValue: '2000000',
    maintenanceMargin: '0.005',
    initialMargin: '0.01',
    maxLeverage: '100.00',
    mmDeduction: '',
  },
  {
    id: 2,
    riskLimitValue: '2600000',
    maintenanceMargin: '0.0056',
    initialMargin: '0.0133',
    maxLeverage: '75.00',
    mmDeduction: '1200',
  },
];

function linearInstrument(symbol: string) {
  return {
    symbol,
    leverageFilter: { maxLeverage: '100.00' },
    priceFilter: { tickSize: '0.10' },
    lotSizeFilter: { minOrderQty: '0.001', qtyStep: '0.001', minNotionalValue: '5' },
    fundingInterval: 480,
  };
}

/** Bybit up: every call answers retCode 0 with the item for the requested path / symbol. */
function stubBybitUp() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const u = new URL(url);
    const list = u.pathname.endsWith('/risk-limit')
      ? RISK_TIERS
      : [linearInstrument(u.searchParams.get('symbol') ?? '')];
    return {
      ok: true,
      status: 200,
      json: async () => ({ retCode: 0, retMsg: 'OK', result: { list } }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Bybit down: HTTP 500 with an upstream error body on every call. */
function stubBybit500() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ retCode: 10016, retMsg: 'Internal server error: upstream detail' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ─── Service ──────────────────────────────────────────────────────────────────

describe('BybitMarketInfo — stale value on a Bybit error (12.3.5)', () => {
  let now: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearMarketInfoCache();
    now = vi.spyOn(Date, 'now').mockReturnValue(T0);
  });

  afterEach(() => {
    now.mockRestore();
    vi.unstubAllGlobals();
    clearMarketInfoCache();
  });

  it('should serve the cached risk-limit tiers when Bybit answers 500 after the 6 h TTL', async () => {
    stubBybitUp();
    const fresh = await getRiskLimit('BTCUSDT');
    expect(fresh.map((t) => t.maintenanceMarginRate)).toEqual([0.005, 0.0056]);

    now.mockReturnValue(T0 + SIX_HOURS + 1);
    const down = stubBybit500();

    await expect(getRiskLimit('BTCUSDT')).resolves.toEqual(fresh);
    // The refresh was really tried (HTTP 500 is retried) before falling back
    expect(down).toHaveBeenCalled();
    const calls = down.mock.calls.length;

    // Inside the 60 s back-off the stale value is served without asking Bybit again
    now.mockReturnValue(T0 + SIX_HOURS + 30_000);
    await expect(getRiskLimit('BTCUSDT')).resolves.toEqual(fresh);
    expect(down).toHaveBeenCalledTimes(calls);
  });

  it('should serve the cached instrument rules when every symbol call answers 500', async () => {
    stubBybitUp();
    const fresh = await getInstruments('linear');
    expect(fresh).toHaveLength(9);

    now.mockReturnValue(T0 + SIX_HOURS + 1);
    const down = stubBybit500();

    await expect(getInstruments('linear')).resolves.toEqual(fresh);
    expect(down).toHaveBeenCalled();
  });

  it('should fail when Bybit answers 500 and nothing is cached', async () => {
    stubBybit500();
    await expect(getRiskLimit('BTCUSDT')).rejects.toThrow();
    await expect(getInstruments('linear')).rejects.toThrow();
  });

  it('should keep the risk-limit and instruments caches apart', async () => {
    stubBybitUp();
    await getRiskLimit('BTCUSDT');

    // Only the risk-limit is cached: instruments with Bybit down have nothing to fall back to
    now.mockReturnValue(T0 + 1);
    stubBybit500();
    await expect(getRiskLimit('BTCUSDT')).resolves.toHaveLength(2);
    await expect(getInstruments('linear')).rejects.toThrow();
  });
});

// ─── Route ────────────────────────────────────────────────────────────────────

describe('GET /api/market/* — Bybit 500 with no cache (12.3.5)', () => {
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
    clearMarketInfoCache();
  });

  it.each(['/api/market/risk-limit?symbol=BTCUSDT', '/api/market/instruments?category=linear'])(
    'should answer %s with 502 and no upstream text',
    async (url) => {
      stubBybit500();

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ error: 'Failed to fetch market data' });
      expect(res.body).not.toMatch(/500|Bybit|upstream|retCode/i);
    }
  );

  it('should answer 200 with the stale tiers once they are cached', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0);
    try {
      stubBybitUp();
      const first = await app.inject({
        method: 'GET',
        url: '/api/market/risk-limit?symbol=BTCUSDT',
      });
      expect(first.statusCode).toBe(200);

      now.mockReturnValue(T0 + SIX_HOURS + 1);
      stubBybit500();
      const stale = await app.inject({
        method: 'GET',
        url: '/api/market/risk-limit?symbol=BTCUSDT',
      });

      expect(stale.statusCode).toBe(200);
      expect(stale.json()).toEqual(first.json());
    } finally {
      now.mockRestore();
    }
  });
});
