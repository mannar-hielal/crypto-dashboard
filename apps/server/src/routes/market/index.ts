import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { LiveBar, IndicatorSnapshot, TickerUpdate } from '../../plugins/bybit.js';
import { logger } from '../../logger.js';
import { ALLOWED_CATEGORIES, ALLOWED_SYMBOLS, type BybitCategory } from '../../constants.js';
import { bybitRestBaseUrl, getInstruments, getRiskLimit } from '../../services/BybitMarketInfo.js';
import { bybitBreakers, fetchWithRetry } from '../../lib/fetchWithRetry.js';

const log = logger.child({ route: 'market' });

// ─── WebSocket connection caps ────────────────────────────────────────────────
// 🔐 The WS feed is unauthenticated and each cold connection can trigger a Bybit
//    REST fetch — cap concurrent connections globally and per-IP so a single
//    attacker cannot exhaust sockets or hammer the upstream API.
const MAX_WS_CONNECTIONS = 500;
const MAX_WS_PER_IP = 20;
const activeWs = new Set<WebSocket>();
const ipCounts = new Map<string, number>();

// ─── Validation ───────────────────────────────────────────────────────────────

// Derive the narrow union type from the allowlist array
type AllowedSymbol = (typeof ALLOWED_SYMBOLS)[number];

// 🔐 Allowlist: single source of truth lives in src/constants.ts
// Typed as Set<string> so .has() accepts any string without TypeScript complaints.
const ALLOWED_SYMBOLS_SET = new Set<string>(ALLOWED_SYMBOLS);
// Maps our interval notation → Bybit REST API notation
const BYBIT_INTERVAL_MAP = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
  '1M': 'M',
} as const;

type AllowedInterval = keyof typeof BYBIT_INTERVAL_MAP;
const ALLOWED_INTERVALS = Object.keys(BYBIT_INTERVAL_MAP) as AllowedInterval[];
const ALLOWED_INTERVALS_SET = new Set<string>(ALLOWED_INTERVALS);

/** Type guard: narrows a raw string to AllowedSymbol after the Set check. */
function isAllowedSymbol(s: string): s is AllowedSymbol {
  return ALLOWED_SYMBOLS_SET.has(s);
}

const ALLOWED_CATEGORIES_SET = new Set<string>(ALLOWED_CATEGORIES);

/** Type guard: narrows a raw string to BybitCategory after the Set check. */
function isAllowedCategory(c: string): c is BybitCategory {
  return ALLOWED_CATEGORIES_SET.has(c);
}

/** Type guard: narrows a raw string to AllowedInterval after the Set check. */
function isAllowedInterval(interval: string): interval is AllowedInterval {
  return ALLOWED_INTERVALS_SET.has(interval);
}

// ─── Shared schema objects ────────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
} as const;

// Each market reads history from its own Bybit category (BYBIT_PARITY_PLAN F1) — there is no
// cross-category fallback, so a spot chart can never be filled with perp candles. Defaults to
// spot so a client that predates the category param keeps working.
const categoryParam = {
  type: 'string',
  enum: [...ALLOWED_CATEGORIES],
  default: 'spot',
} as const;

// ─── Bybit REST helper ────────────────────────────────────────────────────────

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result?: {
    list?: string[][];
  };
}

// 🔐 Coalesce concurrent requests for the same category/symbol/interval/limit
//    into a single upstream fetch — a burst of reconnecting clients (e.g. after
//    a server restart, before the aggregator warms up) would otherwise each
//    fire their own REST call and risk tripping Bybit's rate limit.
const inFlightCandleFetches = new Map<string, Promise<LiveBar['kline'][]>>();

function fetchHistoricalCandles(
  category: BybitCategory,
  symbol: string,
  interval: AllowedInterval,
  limit: number
): Promise<LiveBar['kline'][]> {
  const cacheKey = `${category}:${symbol}:${interval}:${limit}`;
  const existing = inFlightCandleFetches.get(cacheKey);
  if (existing) return existing;

  const promise = fetchHistoricalCandlesFromBybit(category, symbol, interval, limit).finally(() => {
    inFlightCandleFetches.delete(cacheKey);
  });
  inFlightCandleFetches.set(cacheKey, promise);
  return promise;
}

async function fetchHistoricalCandlesFromBybit(
  category: BybitCategory,
  symbol: string,
  interval: AllowedInterval,
  limit: number
): Promise<LiveBar['kline'][]> {
  // interval is a typed AllowedInterval key — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  const bybitInterval = BYBIT_INTERVAL_MAP[interval];
  const params = new URLSearchParams({
    category,
    symbol,
    interval: bybitInterval,
    limit: String(limit),
  });
  const url = `${bybitRestBaseUrl()}/v5/market/kline?${params.toString()}`;

  const res = await fetchWithRetry(url, bybitBreakers.kline, { timeoutMs: 10_000, attempts: 2 });

  if (!res.ok) {
    throw new Error(`Bybit REST error: ${res.status}`);
  }

  const data = (await res.json()) as BybitKlineResponse;
  const list = data.result?.list;

  if (data.retCode !== 0 || !Array.isArray(list)) {
    throw new Error(
      `Bybit API error: ${data.retMsg ?? 'unknown'} [category=${category}, symbol=${symbol}, interval=${bybitInterval}, limit=${limit}]`
    );
  }

  // Bybit returns newest first — reverse for chronological chart order
  // Each item: [startTime, open, high, low, close, volume, turnover]
  return list
    .map((item) => ({
      timestamp: parseInt(item[0], 10),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      quoteAssetVolume: parseFloat(item[6]),
    }))
    .reverse();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

interface CandleQuerystring {
  category?: BybitCategory;
  symbol?: string;
  interval?: string;
  limit?: string;
}

interface WsQuerystring {
  category?: string;
  symbol?: string;
  interval?: string;
}

export async function marketRoutes(fastify: FastifyInstance): Promise<void> {
  // ── REST: historical candles ────────────────────────────────────────────────
  fastify.get<{ Querystring: CandleQuerystring }>(
    '/candles',
    {
      schema: {
        tags: ['Market'],
        summary: 'Historical OHLCV candles for one market (spot or linear)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: categoryParam,
            symbol: { type: 'string', maxLength: 20, default: 'BTCUSDT' },
            interval: { type: 'string', maxLength: 3, default: '1m' },
            limit: { type: 'string', maxLength: 5, default: '200' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              symbol: { type: 'string' },
              interval: { type: 'string' },
              candles: { type: 'array' },
            },
          },
          400: errorResponse,
          502: errorResponse,
        },
      },
    },
    async (request, reply) => {
      // 🔐 category is enum-validated by the schema above
      const category = request.query.category ?? 'spot';
      const symbolRaw = (request.query.symbol ?? 'BTCUSDT').toUpperCase();
      const intervalRaw = request.query.interval ?? '1m';
      const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '200', 10) || 200), 1000);

      // 🔐 Validate against allowlist — guard also narrows type to AllowedSymbol
      if (!isAllowedSymbol(symbolRaw)) {
        return reply.status(400).send({ error: `Symbol not supported: ${symbolRaw}` });
      }
      if (!isAllowedInterval(intervalRaw)) {
        return reply.status(400).send({ error: `Interval not supported: ${intervalRaw}` });
      }
      const symbol = symbolRaw; // AllowedSymbol
      const interval = intervalRaw; // AllowedInterval

      try {
        const candles = await fetchHistoricalCandles(category, symbol, interval, limit);
        return reply.send({ category, symbol, interval, candles });
      } catch (err) {
        log.error({ err, category, symbol, interval }, 'Failed to fetch historical candles');
        return reply.status(502).send({ error: 'Failed to fetch market data' });
      }
    }
  );

  // ── REST: instrument rules (tick size, qty step, min size, max leverage) ───
  fastify.get<{ Querystring: { category?: BybitCategory } }>(
    '/instruments',
    {
      schema: {
        tags: ['Market'],
        summary: 'Trading rules for the supported symbols in one market (cached 6 h)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { category: categoryParam },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              instruments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    symbol: { type: 'string' },
                    category: { type: 'string' },
                    tickSize: { type: 'number' },
                    qtyStep: { type: 'number' },
                    minOrderQty: { type: 'number' },
                    minNotional: { type: 'number' },
                    maxLeverage: { type: ['number', 'null'] },
                    fundingIntervalMin: { type: ['number', 'null'] },
                  },
                },
              },
            },
          },
          400: errorResponse,
          502: errorResponse,
        },
      },
    },
    async (request, reply) => {
      // 🔐 category is enum-validated by the schema above
      const category = request.query.category ?? 'spot';
      try {
        const instruments = await getInstruments(category);
        return reply.send({ category, instruments });
      } catch (err) {
        log.error({ err, category }, 'Failed to fetch instruments');
        return reply.status(502).send({ error: 'Failed to fetch market data' });
      }
    }
  );

  // ── REST: risk-limit tiers (USDT Perpetual only) ────────────────────────────
  fastify.get<{ Querystring: { symbol: string } }>(
    '/risk-limit',
    {
      schema: {
        tags: ['Market'],
        summary: 'Risk-limit tiers (maintenance margin) of a USDT Perpetual symbol (cached 6 h)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['symbol'],
          properties: {
            // 🔐 allowlist encoded in the schema — Fastify rejects anything else
            symbol: { type: 'string', enum: [...ALLOWED_SYMBOLS] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              tiers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    riskLimitValue: { type: 'number' },
                    maintenanceMarginRate: { type: 'number' },
                    initialMarginRate: { type: 'number' },
                    maxLeverage: { type: 'number' },
                    mmDeduction: { type: 'number' },
                  },
                },
              },
            },
          },
          400: errorResponse,
          502: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { symbol } = request.query;
      if (!isAllowedSymbol(symbol)) {
        return reply.status(400).send({ error: `Symbol not supported: ${symbol}` });
      }
      try {
        const tiers = await getRiskLimit(symbol);
        return reply.send({ symbol, tiers });
      } catch (err) {
        log.error({ err, symbol }, 'Failed to fetch risk limit');
        return reply.status(502).send({ error: 'Failed to fetch market data' });
      }
    }
  );

  // ── WebSocket: live price feed ──────────────────────────────────────────────
  fastify.get<{ Querystring: WsQuerystring }>(
    '/ws',
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest<{ Querystring: WsQuerystring }>) => {
      const categoryRaw = request.query.category ?? 'spot';
      const symbolRaw = (request.query.symbol ?? 'BTCUSDT').toUpperCase();
      const intervalRaw = request.query.interval ?? '1m';

      // 🔐 Enforce connection caps before any work — reject excess connections.
      const clientIp = request.ip;
      const currentIpCount = ipCounts.get(clientIp) ?? 0;
      if (activeWs.size >= MAX_WS_CONNECTIONS || currentIpCount >= MAX_WS_PER_IP) {
        fastify.log.warn({ clientIp }, 'WS connection limit reached — rejecting');
        socket.close(1013, 'Connection limit reached');
        return;
      }
      activeWs.add(socket);
      ipCounts.set(clientIp, currentIpCount + 1);

      let released = false;
      const releaseConnection = () => {
        if (released) return;
        released = true;
        activeWs.delete(socket);
        const remaining = (ipCounts.get(clientIp) ?? 1) - 1;
        if (remaining <= 0) {
          ipCounts.delete(clientIp);
        } else {
          ipCounts.set(clientIp, remaining);
        }
      };

      // 🔐 Validate against allowlist — guard also narrows type to AllowedSymbol
      if (
        !isAllowedCategory(categoryRaw) ||
        !isAllowedSymbol(symbolRaw) ||
        !isAllowedInterval(intervalRaw)
      ) {
        releaseConnection();
        socket.close(1008, 'Invalid category, symbol or interval');
        return;
      }
      const category = categoryRaw; // BybitCategory
      const symbol = symbolRaw; // AllowedSymbol
      const interval = intervalRaw; // AllowedInterval

      log.info({ category, symbol, interval }, 'Client connected to live feed');

      // ① Subscribe to live bar updates and forward to this client. Buffer bars
      //    matching this connection while a REST-backed snapshot is in flight
      //    (below) so that snapshot can't roll back bars already forwarded.
      let restFetchInFlight = false;
      const barsDuringRestFetch = new Map<number, LiveBar['kline']>();
      const unsubscribe = fastify.bybit.subscribe((bar: LiveBar) => {
        if (bar.category !== category || bar.symbol !== symbol || bar.interval !== interval) {
          return;
        }
        if (restFetchInFlight) {
          barsDuringRestFetch.set(bar.kline.timestamp, bar.kline);
        }
        if (socket.readyState === 1 /* WebSocket.OPEN */) {
          socket.send(JSON.stringify({ type: 'bar', bar }));
        }
      });

      // ② Subscribe to ticker (lastPrice/bid/ask/mark/funding) updates and forward to this client
      const unsubscribeTicker = fastify.bybit.subscribeTicker((update: TickerUpdate) => {
        if (update.category !== category || update.symbol !== symbol) return;
        if (socket.readyState === 1 /* WebSocket.OPEN */) {
          socket.send(JSON.stringify({ type: 'ticker', ...update }));
        }
      });

      // Send the latest quote right away — tickers are only broadcast when a price changes, so a
      // quiet market could otherwise leave this client without bid/ask for a while.
      const latestTicker = fastify.bybit.getTicker(category, symbol);
      if (latestTicker && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'ticker', ...latestTicker }));
      }

      // ③ Send the cached snapshot immediately so the chart isn't blank.
      //    If the aggregator is too cold (< 50 bars) use the REST fallback
      //    instead so the client gets a full history on first connect.
      const MIN_SNAPSHOT = 50;
      const snapshot = fastify.bybit.getSnapshot(category, symbol, interval);

      const sendRestBackedSnapshot = () => {
        restFetchInFlight = true;
        void fetchHistoricalCandles(category, symbol, interval, 1000)
          .then((candles) => {
            if (candles.length === 0 || socket.readyState !== 1) return;
            // Merge in any bars forwarded live while this fetch was in flight so
            // the snapshot doesn't roll the chart back past what the client
            // already has.
            const byTimestamp = new Map(candles.map((kline) => [kline.timestamp, kline]));
            for (const [timestamp, kline] of barsDuringRestFetch) {
              byTimestamp.set(timestamp, kline);
            }
            const mergedCandles = [...byTimestamp.values()].sort(
              (a, b) => a.timestamp - b.timestamp
            );
            socket.send(
              JSON.stringify({
                type: 'snapshot',
                bars: mergedCandles.map((kline) => ({
                  category,
                  symbol,
                  interval,
                  kline,
                  indicators: null as unknown as IndicatorSnapshot,
                })),
              })
            );
          })
          .catch((err) => {
            log.error({ err, category, symbol, interval }, 'REST fallback for WS snapshot failed');
          })
          .finally(() => {
            restFetchInFlight = false;
            barsDuringRestFetch.clear();
          });
      };

      if (snapshot.length >= MIN_SNAPSHOT) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'snapshot', bars: snapshot }));
        }
      } else {
        if (snapshot.length > 0 && socket.readyState === 1) {
          // Aggregator has a few bars — send them as a preview, then replace
          // with a full REST-backed snapshot.
          socket.send(JSON.stringify({ type: 'snapshot', bars: snapshot }));
        }
        // Thin or completely cold aggregator — fetch from Bybit REST to fill the gap.
        sendRestBackedSnapshot();
      }

      // ④ Clean up listeners when client disconnects
      socket.on('close', () => {
        unsubscribe();
        unsubscribeTicker();
        releaseConnection();
        log.info({ category, symbol, interval }, 'Client disconnected from live feed');
      });

      socket.on('error', (err: Error) => {
        log.error({ err }, 'Client WebSocket error');
        unsubscribe();
        unsubscribeTicker();
        releaseConnection();
      });
    }
  );
}
