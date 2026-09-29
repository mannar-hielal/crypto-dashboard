/**
 * The fake Bybit server (TEST_IMPLEMENTATION_PLAN F3): Bybit v5's public REST and WebSocket, the parts
 * the app reads, served from FakeFeed — plus `/__control/*` for tests to set prices. A test tool: it
 * listens on 127.0.0.1 only and never runs in production (config.ts refuses BYBIT_*_URL there).
 *
 *   REST  /v5/market/{kline,mark-price-kline,index-price-kline,instruments-info,risk-limit,funding/history}
 *   WS    /v5/public/{spot,linear}: subscribe / ping; pushes every subscribed topic once a second
 *   POST  /__control/{quote,path,funding,klines,drop,stall,reset}
 */

import Fastify, { type FastifyInstance } from 'fastify';
import websocket, { type WebSocket } from '@fastify/websocket';
import { FakeFeed, INTERVAL_MS, type Category, type KlineSource, type Recorded } from './feed.js';

const CATEGORIES = ['spot', 'linear'] as const;
const PUSH_EVERY_MS = 1_000;

interface Client {
  category: Category;
  socket: WebSocket;
  topics: Set<string>;
}

const ok = (result: unknown) => ({
  retCode: 0,
  retMsg: 'OK',
  result,
  retExtInfo: {},
  time: Date.now(),
});
const categoryEnum = { type: 'string', enum: [...CATEGORIES] } as const;
const num = { type: 'number' } as const;

export interface FakeBybitOptions {
  recorded: Recorded;
  now?: () => number;
}

export async function buildFakeBybit(
  opts: FakeBybitOptions
): Promise<{ app: FastifyInstance; feed: FakeFeed }> {
  const feed = new FakeFeed(opts.recorded, opts.now);
  const clients = new Set<Client>();
  const paths = new Map<string, NodeJS.Timeout>();
  const app = Fastify({ logger: false });
  await app.register(websocket);

  const send = (client: Client, msg: unknown) => {
    if (client.socket.readyState === 1) client.socket.send(JSON.stringify(msg));
  };

  /** Push every subscribed topic of `category` (or only `symbol`'s) to every client. */
  const push = (category: Category, symbol?: string) => {
    if (feed.isStalled(category)) return;
    for (const client of clients) {
      if (client.category !== category) continue;
      for (const topic of client.topics) {
        if (symbol && !topic.endsWith(`.${symbol}`)) continue;
        const msg = feed.message(category, topic);
        if (msg) send(client, msg);
      }
    }
  };

  const pushClosedBar = (
    category: Category,
    symbol: string,
    closed?: Parameters<FakeFeed['closedKlineMessage']>[2]
  ) => {
    if (!closed) return;
    const msg = feed.closedKlineMessage(category, symbol, closed);
    for (const client of clients) {
      if (client.category === category && client.topics.has(`kline.1.${symbol}`)) send(client, msg);
    }
  };

  const timer = setInterval(() => {
    for (const category of CATEGORIES) {
      // Keep the forming candle's minute current even when nothing moves
      for (const symbol of feed.symbols(category)) {
        const m = feed.market(category, symbol);
        if (m)
          pushClosedBar(
            category,
            symbol,
            feed.setQuote(category, symbol, {
              bid: m.bid,
              ask: m.ask,
              last: m.last,
              mark: m.mark,
              index: m.index,
            }).closed
          );
      }
      push(category);
    }
  }, PUSH_EVERY_MS);
  timer.unref();

  app.addHook('onClose', async () => {
    clearInterval(timer);
    for (const t of paths.values()) clearInterval(t);
    for (const c of clients) c.socket.close();
  });

  // ─── WebSocket ───────────────────────────────────────────────────────────────

  app.get<{ Params: { category: string } }>(
    '/v5/public/:category',
    { websocket: true },
    (socket, req) => {
      const category = req.params.category as Category;
      if (!CATEGORIES.includes(category)) {
        socket.close();
        return;
      }
      const client: Client = { category, socket, topics: new Set() };
      clients.add(client);
      const connId = `fake-${Math.random().toString(36).slice(2, 10)}`;
      socket.on('message', (raw: Buffer) => {
        let msg: { op?: string; args?: unknown[]; req_id?: string };
        try {
          msg = JSON.parse(raw.toString()) as typeof msg;
        } catch {
          return;
        }
        if (msg.op === 'ping') {
          send(client, { success: true, ret_msg: 'pong', conn_id: connId, op: 'ping' });
          return;
        }
        if (msg.op === 'subscribe' || msg.op === 'unsubscribe') {
          const topics = (msg.args ?? []).filter((a): a is string => typeof a === 'string');
          for (const t of topics) {
            if (msg.op === 'subscribe') client.topics.add(t);
            else client.topics.delete(t);
          }
          send(client, {
            success: true,
            ret_msg: '',
            conn_id: connId,
            req_id: msg.req_id ?? '',
            op: msg.op,
          });
          // Bybit answers a subscription with a snapshot of each topic
          if (msg.op === 'subscribe' && !feed.isStalled(category)) {
            for (const t of topics) {
              const snapshot = feed.message(category, t);
              if (snapshot) send(client, snapshot);
            }
          }
        }
      });
      const drop = () => clients.delete(client);
      socket.on('close', drop);
      socket.on('error', drop);
    }
  );

  // ─── REST ────────────────────────────────────────────────────────────────────

  const klineRoute = (path: string, source: KlineSource) =>
    app.get<{
      Querystring: {
        category?: string;
        symbol: string;
        interval: string;
        start?: string;
        end?: string;
        limit?: string;
      };
    }>(path, async (req, reply) => {
      const { symbol, interval } = req.query;
      const category = (req.query.category ?? 'linear') as Category;
      if (
        !CATEGORIES.includes(category) ||
        !feed.market(category, symbol) ||
        !Object.hasOwn(INTERVAL_MS, interval)
      ) {
        return reply.send({
          retCode: 10001,
          retMsg: 'params error',
          result: {},
          retExtInfo: {},
          time: Date.now(),
        });
      }
      const list = feed.klines(category, symbol, source, interval, {
        ...(req.query.start ? { start: Number(req.query.start) } : {}),
        ...(req.query.end ? { end: Number(req.query.end) } : {}),
        ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
      });
      return ok({ category, symbol, list });
    });
  klineRoute('/v5/market/kline', 'last');
  klineRoute('/v5/market/mark-price-kline', 'mark');
  klineRoute('/v5/market/index-price-kline', 'index');

  app.get<{ Querystring: { category: string; symbol?: string } }>(
    '/v5/market/instruments-info',
    async (req) =>
      ok({
        category: req.query.category,
        list: feed.instruments(req.query.category as Category, req.query.symbol),
        nextPageCursor: '',
      })
  );

  app.get<{ Querystring: { category: string; symbol?: string } }>(
    '/v5/market/risk-limit',
    async (req) =>
      ok({ category: 'linear', list: feed.riskLimit(req.query.symbol), nextPageCursor: '' })
  );

  app.get<{
    Querystring: { symbol: string; startTime?: string; endTime?: string; limit?: string };
  }>('/v5/market/funding/history', async (req) =>
    ok({
      category: 'linear',
      list: feed.fundingHistory(
        req.query.symbol,
        req.query.startTime ? Number(req.query.startTime) : undefined,
        req.query.endTime ? Number(req.query.endTime) : undefined,
        req.query.limit ? Number(req.query.limit) : undefined
      ),
    })
  );

  // ─── Controls ────────────────────────────────────────────────────────────────

  const control = <B>(
    path: string,
    properties: Record<string, unknown>,
    required: string[],
    run: (body: B) => unknown
  ) =>
    app.post<{ Body: B }>(
      `/__control/${path}`,
      { schema: { body: { type: 'object', additionalProperties: false, required, properties } } },
      async (req, reply) => {
        try {
          return { ok: true, ...((run(req.body as B) as object | undefined) ?? {}) };
        } catch (err) {
          return reply.status(400).send({ ok: false, error: (err as Error).message });
        }
      }
    );

  type QuoteBody = {
    category: Category;
    symbol: string;
    bid?: number;
    ask?: number;
    last?: number;
    mark?: number;
    index?: number;
  };
  control<QuoteBody>(
    'quote',
    {
      category: categoryEnum,
      symbol: { type: 'string', maxLength: 20 },
      bid: num,
      ask: num,
      last: num,
      mark: num,
      index: num,
    },
    ['category', 'symbol'],
    (b) => {
      const { category, symbol, ...q } = b;
      pushClosedBar(category, symbol, feed.setQuote(category, symbol, q).closed);
      push(category, symbol);
    }
  );

  type PathBody = { category: Category; symbol: string; points: number[]; stepMs: number };
  control<PathBody>(
    'path',
    {
      category: categoryEnum,
      symbol: { type: 'string', maxLength: 20 },
      points: { type: 'array', minItems: 1, maxItems: 1_000, items: num },
      stepMs: { type: 'integer', minimum: 10, maximum: 60_000 },
    },
    ['category', 'symbol', 'points', 'stepMs'],
    (b) => {
      if (!feed.market(b.category, b.symbol))
        throw new Error(`unknown market ${b.category}:${b.symbol}`);
      const id = `${b.category}:${b.symbol}`;
      const running = paths.get(id);
      if (running) clearInterval(running);
      const points = [...b.points];
      const stepOnce = () => {
        const p = points.shift();
        if (p === undefined) {
          clearInterval(paths.get(id));
          paths.delete(id);
          return;
        }
        pushClosedBar(
          b.category,
          b.symbol,
          feed.setQuote(b.category, b.symbol, { last: p }).closed
        );
        push(b.category, b.symbol);
      };
      stepOnce();
      paths.set(id, setInterval(stepOnce, b.stepMs));
      return { steps: b.points.length };
    }
  );

  type FundingBody = { symbol: string; rate: number; inSeconds: number; intervalHour?: number };
  control<FundingBody>(
    'funding',
    {
      symbol: { type: 'string', maxLength: 20 },
      rate: num,
      inSeconds: { type: 'number', minimum: 0, maximum: 86_400 },
      intervalHour: { type: 'integer', minimum: 1, maximum: 8 },
    },
    ['symbol', 'rate', 'inSeconds'],
    (b) => {
      const ts = feed.setFunding(b.symbol, b.rate, b.inSeconds, b.intervalHour);
      push('linear', b.symbol);
      return { nextFundingTime: ts };
    }
  );

  type KlinesBody = {
    category: Category;
    symbol: string;
    source?: KlineSource;
    candles: { start: number; open: number; high: number; low: number; close: number }[];
  };
  control<KlinesBody>(
    'klines',
    {
      category: categoryEnum,
      symbol: { type: 'string', maxLength: 20 },
      source: { type: 'string', enum: ['last', 'mark', 'index'] },
      candles: {
        type: 'array',
        minItems: 1,
        maxItems: 1_000,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['start', 'open', 'high', 'low', 'close'],
          properties: { start: { type: 'integer' }, open: num, high: num, low: num, close: num },
        },
      },
    },
    ['category', 'symbol', 'candles'],
    (b) => {
      if (!feed.market(b.category, b.symbol))
        throw new Error(`unknown market ${b.category}:${b.symbol}`);
      feed.setCandles(b.category, b.symbol, b.source ?? 'last', b.candles);
      return { candles: b.candles.length };
    }
  );

  control<{ category: Category }>('drop', { category: categoryEnum }, ['category'], (b) => {
    let dropped = 0;
    for (const c of clients) {
      if (c.category === b.category) {
        c.socket.close();
        dropped++;
      }
    }
    return { dropped };
  });

  control<{ category: Category; ms: number }>(
    'stall',
    { category: categoryEnum, ms: { type: 'integer', minimum: 0, maximum: 600_000 } },
    ['category', 'ms'],
    (b) => feed.stall(b.category, b.ms)
  );

  control<Record<string, never>>('reset', {}, [], () => {
    for (const t of paths.values()) clearInterval(t);
    paths.clear();
    feed.reset();
    for (const category of CATEGORIES) push(category);
  });

  return { app, feed };
}
