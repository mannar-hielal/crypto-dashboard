import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { LiveBar, TickerUpdate } from '../../plugins/bybit.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { ALLOWED_SYMBOLS } from '../../constants.js';

const log = logger.child({ route: 'market' });

// ─── Validation ───────────────────────────────────────────────────────────────

// Derive the narrow union type from the allowlist array
type AllowedSymbol = (typeof ALLOWED_SYMBOLS)[number];

// 🔐 Allowlist: single source of truth lives in src/constants.ts
// Typed as Set<string> so .has() accepts any string without TypeScript complaints.
const ALLOWED_SYMBOLS_SET = new Set<string>(ALLOWED_SYMBOLS);
const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);

/** Type guard: narrows a raw string to AllowedSymbol after the Set check. */
function isAllowedSymbol(s: string): s is AllowedSymbol {
  return ALLOWED_SYMBOLS_SET.has(s);
}

// Maps our interval notation → Bybit REST API notation
const BYBIT_INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

// ─── Bybit REST helper ────────────────────────────────────────────────────────

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: string[][];
  };
}

async function fetchHistoricalCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<LiveBar['kline'][]> {
  const bybitInterval = BYBIT_INTERVAL_MAP[interval];
  const baseUrl = config.bybitTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';

  const url = `${baseUrl}/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    throw new Error(`Bybit REST error: ${res.status}`);
  }

  const data = (await res.json()) as BybitKlineResponse;

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  // Bybit returns newest first — reverse for chronological chart order
  // Each item: [startTime, open, high, low, close, volume, turnover]
  return data.result.list
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
      const interval = request.query.interval ?? '1m';
      const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '200', 10) || 200), 1000);

      // 🔐 Validate against allowlist — guard also narrows type to AllowedSymbol
      if (!isAllowedSymbol(symbolRaw)) {
        return reply.status(400).send({ error: `Symbol not supported: ${symbolRaw}` });
      }
      if (!ALLOWED_INTERVALS.has(interval)) {
        return reply.status(400).send({ error: `Interval not supported: ${interval}` });
      }
      const symbol = symbolRaw; // AllowedSymbol

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
      const interval = request.query.interval ?? '1m';

      // 🔐 Validate against allowlist — guard also narrows type to AllowedSymbol
      if (!isAllowedSymbol(symbolRaw) || !ALLOWED_INTERVALS.has(interval)) {
        socket.close(1008, 'Invalid symbol or interval');
        return;
      }
      const symbol = symbolRaw; // AllowedSymbol

      log.info({ symbol, interval }, 'Client connected to live feed');

      // ① Send the cached snapshot immediately so the chart isn't blank
      const snapshot = fastify.bybit.getSnapshot(symbol, interval);
      if (snapshot.length > 0) {
        socket.send(JSON.stringify({ type: 'snapshot', bars: snapshot }));
      }

      // ② Subscribe to live bar updates and forward to this client
      const unsubscribe = fastify.bybit.subscribe((bar: LiveBar) => {
        if (bar.symbol !== symbol || bar.interval !== interval) return;
        if (socket.readyState === 1 /* WebSocket.OPEN */) {
          socket.send(JSON.stringify({ type: 'bar', bar }));
        }
      });

      // ③ Subscribe to ticker (bid/ask) updates and forward to this client
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
        log.info({ symbol, interval }, 'Client disconnected from live feed');
      });

      socket.on('error', (err: Error) => {
        log.error({ err }, 'Client WebSocket error');
        unsubscribe();
        unsubscribeTicker();
      });
    }
  );
}
