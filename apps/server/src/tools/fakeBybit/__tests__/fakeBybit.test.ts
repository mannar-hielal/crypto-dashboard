/**
 * The fake Bybit feed (TEST_IMPLEMENTATION_PLAN F3) read by the app's own Bybit clients, through the
 * BYBIT_REST_URL / BYBIT_WS_URL seam: if the app can't parse what the fake serves, T3 would be green
 * against a feed production never sees. Also checks the controls tests rely on.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Before config.ts loads: the seam points at the fake on a port of this run
const PORT = vi.hoisted(() => {
  const port = 41_000 + (process.pid % 10_000);
  process.env.BYBIT_REST_URL = `http://127.0.0.1:${port}`;
  process.env.BYBIT_WS_URL = `ws://127.0.0.1:${port}`;
  return port;
});

vi.mock('../../../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildFakeBybit } from '../server.js';
import type { FakeFeed, Recorded } from '../feed.js';
import { BybitWebSocketManager } from '../../../services/BybitWebSocketManager.js';
import {
  clearMarketInfoCache,
  getInstruments,
  getRiskLimit,
} from '../../../services/BybitMarketInfo.js';
import { fetchCandles, fetchFundingHistory } from '../../../trading/infra.js';
import { buildApp } from '../../../app.js';
import type { StreamData, TickerData } from '../../../types/index.js';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/bybit/recorded.json'
);

const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Recorded & {
  kline: Record<string, string[][]>;
  ws: Record<string, Record<string, { data: unknown }>>;
};

let fake: FastifyInstance;
let feed: FakeFeed;
const control = (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${PORT}/__control/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });

beforeAll(async () => {
  ({ app: fake, feed } = await buildFakeBybit({ recorded }));
  await fake.listen({ host: '127.0.0.1', port: PORT });
});

afterAll(async () => {
  await fake.close();
});

afterEach(async () => {
  await control('reset', {});
  clearMarketInfoCache();
});

/** The next ticker the manager emits for `symbol` that passes `when`. */
function nextTicker(
  manager: BybitWebSocketManager,
  symbol: string,
  when: (t: TickerData) => boolean = () => true,
  timeoutMs = 5_000
): Promise<TickerData> {
  return new Promise((resolveTicker, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no matching ticker in ${timeoutMs} ms`)),
      timeoutMs
    );
    const onData = (d: StreamData) => {
      if (d.dataType !== 'ticker' || d.symbol !== symbol) return;
      const t = d.data as TickerData;
      if (!when(t)) return;
      clearTimeout(timer);
      manager.off('data', onData);
      resolveTicker(t);
    };
    manager.on('data', onData);
  });
}

describe('fake Bybit — shapes (against the recorded Bybit answers)', () => {
  it('serves kline rows with the fields Bybit sends, newest first', async () => {
    for (const [source, path] of [
      ['last', 'kline'],
      ['mark', 'mark-price-kline'],
      ['index', 'index-price-kline'],
    ] as const) {
      const res = await fetch(
        `http://127.0.0.1:${PORT}/v5/market/${path}?category=linear&symbol=BTCUSDT&interval=1&limit=3`,
        { signal: AbortSignal.timeout(5_000) }
      );
      const body = (await res.json()) as { retCode: number; result: { list: string[][] } };
      expect(body.retCode).toBe(0);
      const rows = body.result.list;
      // eslint-disable-next-line security/detect-object-injection -- a fixed key
      expect(rows[0]?.length, source).toBe(recorded.kline[source]?.[0]?.length);
      expect(Number(rows[0]?.[0])).toBeGreaterThan(Number(rows[1]?.[0]));
    }
  });

  it('pushes WebSocket messages with the fields of the recorded ones', () => {
    const fields = (v: unknown) => Object.keys((Array.isArray(v) ? v[0] : v) as object).sort();
    for (const [category, topic, kind] of [
      ['spot', 'tickers.BTCUSDT', 'tickers'],
      ['spot', 'orderbook.1.BTCUSDT', 'orderbook.1'],
      ['spot', 'kline.1.BTCUSDT', 'kline.1'],
      ['linear', 'tickers.BTCUSDT', 'tickers'],
      ['linear', 'kline.1.BTCUSDT', 'kline.1'],
    ] as const) {
      const ours = feed.message(category, topic)?.data;
      // eslint-disable-next-line security/detect-object-injection -- fixed keys
      const theirs = recorded.ws[category]?.[kind]?.data;
      // Every field the fake sends is one Bybit sends
      for (const f of fields(ours))
        expect(fields(theirs), `${category} ${topic}.${f}`).toContain(f);
    }
  });
});

describe('fake Bybit — read by the app’s own clients', () => {
  it('instruments and risk-limit tiers parse into the app’s rules (9 symbols, both markets)', async () => {
    for (const category of ['spot', 'linear'] as const) {
      const rules = await getInstruments(category);
      expect(rules.map((r) => r.symbol).sort()).toHaveLength(9);
      expect(rules.every((r) => r.tickSize > 0 && r.qtyStep > 0)).toBe(true);
    }
    const tiers = await getRiskLimit('BTCUSDT');
    expect(tiers.length).toBeGreaterThan(5);
  });

  it('the WebSocket manager gets tickers, and a controlled quote within a push (linear)', async () => {
    const manager = new BybitWebSocketManager(false, 'linear');
    try {
      manager.subscribeMany([
        { channel: 'tickers', symbol: 'BTCUSDT' },
        { channel: 'kline', symbol: 'BTCUSDT', interval: '1' },
      ]);
      const first = nextTicker(manager, 'BTCUSDT');
      await manager.connect();
      const recordedLast = Number(recorded.tickers.linear.BTCUSDT?.lastPrice);
      expect((await first).lastPrice).toBeCloseTo(recordedLast, 1);

      const moved = nextTicker(manager, 'BTCUSDT', (t) => t.lastPrice === 50_000);
      await control('quote', { category: 'linear', symbol: 'BTCUSDT', last: 50_000, mark: 50_010 });
      const t = await moved;
      expect([t.bid, t.ask, t.markPrice, t.indexPrice]).toEqual([50_000, 50_000, 50_010, 50_000]);
      expect(manager.lastQuoteAt('BTCUSDT')).toBeGreaterThan(Date.now() - 2_000);
    } finally {
      manager.disconnect();
    }
  });

  it('spot bid / ask come from the order book, as on Bybit', async () => {
    const manager = new BybitWebSocketManager(false, 'spot');
    try {
      manager.subscribeMany([
        { channel: 'tickers', symbol: 'ETHUSDT' },
        { channel: 'orderbook', symbol: 'ETHUSDT', interval: '1' },
      ]);
      await manager.connect();
      const quoted = nextTicker(manager, 'ETHUSDT', (t) => t.bid === 2_999.99 && t.ask === 3_000);
      await control('quote', { category: 'spot', symbol: 'ETHUSDT', bid: 2_999.99, ask: 3_000 });
      expect((await quoted).lastPrice).toBe(3_000);
    } finally {
      manager.disconnect();
    }
  });

  it('a stall stops the pushes; a drop closes the socket and the manager reconnects', async () => {
    const manager = new BybitWebSocketManager(false, 'linear');
    try {
      manager.subscribeMany([{ channel: 'tickers', symbol: 'SOLUSDT' }]);
      await manager.connect();
      await nextTicker(manager, 'SOLUSDT');
      await control('stall', { category: 'linear', ms: 1_500 });
      const seen = manager.lastQuoteAt('SOLUSDT') ?? 0;
      await new Promise((r) => setTimeout(r, 1_200));
      expect(manager.lastQuoteAt('SOLUSDT')).toBe(seen);

      const disconnected = new Promise((r) => manager.once('disconnected', r));
      await control('drop', { category: 'linear' });
      await disconnected;
      // The manager reconnects on its own and resubscribes
      await control('quote', { category: 'linear', symbol: 'SOLUSDT', last: 150 });
      await nextTicker(manager, 'SOLUSDT', (t) => t.lastPrice === 150, 8_000);
    } finally {
      manager.disconnect();
    }
  }, 15_000);

  it('the engine’s backfill reads candles a test put in the gap, and funding once it is due', async () => {
    const now = Date.now();
    const minute = Math.floor(now / 60_000) * 60_000 - 5 * 60_000;
    await control('klines', {
      category: 'linear',
      symbol: 'BTCUSDT',
      source: 'mark',
      candles: [{ start: minute, open: 50_000, high: 50_100, low: 48_900, close: 49_000 }],
    });
    const candles = await fetchCandles('linear', 'BTCUSDT', minute - 60_000, now, 'mark');
    const put = candles.find((c) => c.start === minute);
    expect(put?.low.toString()).toBe('48900');
    expect(candles.every((c, i) => i === 0 || c.start > candles[i - 1]!.start)).toBe(true);

    const due = await control('funding', { symbol: 'BTCUSDT', rate: 0.0003, inSeconds: 0 });
    const { nextFundingTime } = (await due.json()) as { nextFundingTime: number };
    const rows = await fetchFundingHistory('BTCUSDT', nextFundingTime - 1, nextFundingTime);
    expect(rows.map((r) => [r.ts, r.rate.toString()])).toEqual([[nextFundingTime, '0.0003']]);
  });

  it('GET /api/market/candles answers from the fake, oldest first', async () => {
    const app = await buildApp();
    try {
      await app.ready();
      const res = await app.inject({
        method: 'GET',
        url: '/api/market/candles?category=spot&symbol=BTCUSDT&interval=1m&limit=5',
      });
      expect(res.statusCode).toBe(200);
      const { candles } = res.json<{ candles: { timestamp: number; close: number }[] }>();
      expect(candles).toHaveLength(5);
      expect(candles[4]!.timestamp).toBeGreaterThan(candles[0]!.timestamp);
    } finally {
      await app.close();
    }
  });

  it('refuses an unknown market in a control call (400)', async () => {
    const res = await control('quote', { category: 'linear', symbol: 'NOPEUSDT', last: 1 });
    expect(res.status).toBe(400);
  });
});
