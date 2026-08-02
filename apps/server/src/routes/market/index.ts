import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { LiveBar, IndicatorSnapshot, TickerUpdate } from '../../plugins/bybit.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { ALLOWED_SYMBOLS } from '../../constants.js';

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

/** Type guard: narrows a raw string to AllowedInterval after the Set check. */
function isAllowedInterval(interval: string): interval is AllowedInterval {
  return ALLOWED_INTERVALS_SET.has(interval);
}

type BybitCategory = 'spot' | 'linear';
const BYBIT_KLINE_CATEGORY_ORDER: readonly BybitCategory[] = ['linear', 'spot'];

// ─── Bybit REST helper ────────────────────────────────────────────────────────

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result?: {
    list?: string[][];
  };
}

async function fetchHistoricalCandles(
  symbol: string,
  interval: AllowedInterval,
  limit: number
): Promise<LiveBar['kline'][]> {
  // interval is a typed AllowedInterval key — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  const bybitInterval = BYBIT_INTERVAL_MAP[interval];
  const baseUrl = config.bybitTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';

  for (const category of BYBIT_KLINE_CATEGORY_ORDER) {
    const params = new URLSearchParams({
      category,
      symbol,
      interval: bybitInterval,
      limit: String(limit),
    });
    const url = `${baseUrl}/v5/market/kline?${params.toString()}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
      throw new Error(`Bybit REST error: ${res.status}`);
    }

    const data = (await res.json()) as BybitKlineResponse;
    const list = data.result?.list;

    if (data.retCode === 0 && Array.isArray(list)) {
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

    const isParamsError = data.retCode === 10001 || /params error/i.test(data.retMsg ?? '');
    const hasFallback =
      category !== BYBIT_KLINE_CATEGORY_ORDER[BYBIT_KLINE_CATEGORY_ORDER.length - 1];
    if (isParamsError && hasFallback) {
      log.warn(
        {
          symbol,
          interval,
          bybitInterval,
          limit,
          category,
          retCode: data.retCode,
          retMsg: data.retMsg,
        },
        'Bybit kline rejected params for category; retrying with fallback category'
      );
      continue;
    }

    throw new Error(
      `Bybit API error: ${data.retMsg ?? 'unknown'} [symbol=${symbol}, interval=${bybitInterval}, limit=${limit}, category=${category}]`
    );
  }

  throw new Error(
    `Bybit API error: no valid kline response [symbol=${symbol}, interval=${bybitInterval}, limit=${limit}]`
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

interface CandleQuerystring {
  symbol?: string;
  interval?: string;
  limit?: string;
}

interface WsQuerystring {
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
        summary: 'Historical OHLCV candles',
        querystring: {
          type: 'object',
          properties: {
            symbol: { type: 'string', default: 'BTCUSDT' },
            interval: { type: 'string', default: '1m' },
            limit: { type: 'string', default: '200' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              interval: { type: 'string' },
              candles: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
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
        const candles = await fetchHistoricalCandles(symbol, interval, limit);
        return reply.send({ symbol, interval, candles });
      } catch (err) {
        log.error({ err, symbol, interval }, 'Failed to fetch historical candles');
        return reply.status(502).send({ error: 'Failed to fetch market data' });
      }
    }
  );

  // ── WebSocket: live price feed ──────────────────────────────────────────────
  fastify.get<{ Querystring: WsQuerystring }>(
    '/ws',
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest<{ Querystring: WsQuerystring }>) => {
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

      const releaseConnection = () => {
        activeWs.delete(socket);
        const remaining = (ipCounts.get(clientIp) ?? 1) - 1;
        if (remaining <= 0) {
          ipCounts.delete(clientIp);
        } else {
          ipCounts.set(clientIp, remaining);
        }
      };

      // 🔐 Validate against allowlist — guard also narrows type to AllowedSymbol
      if (!isAllowedSymbol(symbolRaw) || !isAllowedInterval(intervalRaw)) {
        releaseConnection();
        socket.close(1008, 'Invalid symbol or interval');
        return;
      }
      const symbol = symbolRaw; // AllowedSymbol
      const interval = intervalRaw; // AllowedInterval

      log.info({ symbol, interval }, 'Client connected to live feed');

      // ① Send the cached snapshot immediately so the chart isn't blank.
      //    If the aggregator is too cold (< 50 bars) use the REST fallback
      //    instead so the client gets a full history on first connect.
      const MIN_SNAPSHOT = 50;
      const snapshot = fastify.bybit.getSnapshot(symbol, interval);
      if (snapshot.length >= MIN_SNAPSHOT) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'snapshot', bars: snapshot }));
        }
      } else if (snapshot.length > 0) {
        // Aggregator has a few bars — send them as a preview, then replace
        // with a full REST-backed snapshot.
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'snapshot', bars: snapshot }));
        }
        fetchHistoricalCandles(symbol, interval, 1000)
          .then((candles) => {
            if (candles.length > 0 && socket.readyState === 1) {
              socket.send(
                JSON.stringify({
                  type: 'snapshot',
                  bars: candles.map((kline) => ({
                    symbol,
                    interval,
                    kline,
                    indicators: null as unknown as IndicatorSnapshot,
                  })),
                })
              );
            }
          })
          .catch((err) => {
            log.error({ err, symbol, interval }, 'REST fallback for WS snapshot failed');
          });
      } else {
        // Completely cold aggregator — fetch from Bybit REST to fill the gap.
        fetchHistoricalCandles(symbol, interval, 1000)
          .then((candles) => {
            if (candles.length > 0 && socket.readyState === 1) {
              socket.send(
                JSON.stringify({
                  type: 'snapshot',
                  bars: candles.map((kline) => ({
                    symbol,
                    interval,
                    kline,
                    indicators: null as unknown as IndicatorSnapshot,
                  })),
                })
              );
            }
          })
          .catch((err) => {
            log.error({ err, symbol, interval }, 'REST fallback for WS snapshot failed');
          });
      }

      // ② Subscribe to live bar updates and forward to this client
      const unsubscribe = fastify.bybit.subscribe((bar: LiveBar) => {
        if (bar.symbol !== symbol || bar.interval !== interval) return;
        if (socket.readyState === 1 /* WebSocket.OPEN */) {
          socket.send(JSON.stringify({ type: 'bar', bar }));
        }
      });

      // ③ Subscribe to ticker (lastPrice/bid/ask) updates and forward to this client
      const unsubscribeTicker = fastify.bybit.subscribeTicker((update: TickerUpdate) => {
        if (update.symbol !== symbol) return;
        if (socket.readyState === 1 /* WebSocket.OPEN */) {
          socket.send(JSON.stringify({ type: 'ticker', ...update }));
        }
      });

      // ④ Clean up listeners when client disconnects
      socket.on('close', () => {
        unsubscribe();
        unsubscribeTicker();
        releaseConnection();
        log.info({ symbol, interval }, 'Client disconnected from live feed');
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
