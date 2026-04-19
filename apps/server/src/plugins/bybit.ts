import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { BybitWebSocketManager } from '../services/BybitWebSocketManager.js';
import { CandleAggregator } from '../services/CandleAggregator.js';
import { IndicatorManager } from '../services/IndicatorCalculator.js';
import type { Kline } from '../types/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ALLOWED_SYMBOLS } from '../constants.js';

const log = logger.child({ plugin: 'bybit' });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IndicatorSnapshot {
  ema9: number | null;
  ema21: number | null;
  ema200: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  vwap: number | null;
}

export interface LiveBar {
  symbol: string;
  interval: string; // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  kline: Kline;
  indicators: IndicatorSnapshot;
}

export interface BybitService {
  /** Returns the last SNAPSHOT_SIZE bars for a symbol+interval pair */
  getSnapshot(symbol: string, interval: string): LiveBar[];
  /** Subscribe to live bar updates. Returns an unsubscribe function. */
  subscribe(listener: (bar: LiveBar) => void): () => void;
  /** Subscribe to best bid/ask updates (throttled ~500ms). Returns an unsubscribe function. */
  subscribeTicker(listener: (update: TickerUpdate) => void): () => void;
}

/** Best bid/ask for a symbol, broadcast from orderbook.1 stream */
export interface TickerUpdate {
  symbol: string;
  bid: number;
  ask: number;
}

// Extend FastifyInstance so TypeScript knows about fastify.bybit
declare module 'fastify' {
  interface FastifyInstance {
    bybit: BybitService;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAPSHOT_SIZE = 500; // ~8 hours of 1m candles in memory

// ─── Plugin ───────────────────────────────────────────────────────────────────

async function bybitPlugin(fastify: FastifyInstance): Promise<void> {
  // Skip real connection in test environment
  if (config.nodeEnv === 'test') {
    const noopService: BybitService = {
      getSnapshot: () => [],
      subscribe: () => () => undefined,
      subscribeTicker: () => () => undefined,
    };
    fastify.decorate('bybit', noopService);
    return;
  }

  const manager = new BybitWebSocketManager(config.bybitTestnet);
  const aggregator = new CandleAggregator();

  // One IndicatorManager per "symbol:interval" key
  const indicatorManagers = new Map<string, IndicatorManager>();
  // Ring-buffer of recent bars per "symbol:interval" key
  const snapshots = new Map<string, LiveBar[]>();
  // Active browser WebSocket listeners
  const listeners = new Set<(bar: LiveBar) => void>();
  // Ticker (bid/ask) listeners
  const tickerListeners = new Set<(update: TickerUpdate) => void>();
  // Throttle: last broadcast time per symbol (prevent >2/s per symbol)
  const tickerThrottle = new Map<string, number>();
  const TICKER_THROTTLE_MS = 500;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function getOrCreateManager(key: string): IndicatorManager {
    if (!indicatorManagers.has(key)) {
      indicatorManagers.set(key, new IndicatorManager());
    }
    return indicatorManagers.get(key)!;
  }

  function upsertSnapshot(key: string, bar: LiveBar): void {
    if (!snapshots.has(key)) snapshots.set(key, []);
    const snap = snapshots.get(key)!;
    const last = snap[snap.length - 1];
    // Update the forming (unconfirmed) candle in-place instead of appending
    if (last?.kline.timestamp === bar.kline.timestamp) {
      snap[snap.length - 1] = bar;
    } else {
      snap.push(bar);
      if (snap.length > SNAPSHOT_SIZE) snap.shift();
    }
  }

  // ─── Data pipeline: Bybit → Aggregator → Indicators → Broadcast ───────────

  manager.on('data', (streamData) => {
    // ── Kline → bars pipeline ─────────────────────────────────────────────
    if (streamData.dataType === 'kline') {
      const kline = streamData.data as Kline;
      const symbol = streamData.symbol;

      const aggregated = aggregator.process(kline, symbol);

      for (const [interval, aggregatedKline] of aggregated) {
        const key = `${symbol}:${interval}`;
        const indicatorManager = getOrCreateManager(key);
        const iv = indicatorManager.update(aggregatedKline);

        const bar: LiveBar = {
          symbol,
          interval,
          kline: aggregatedKline,
          indicators: {
            ema9: iv.ema9.value,
            ema21: iv.ema21.value,
            ema200: iv.ema200.value,
            macd: {
              macd: iv.macd.macd,
              signal: iv.macd.signal,
              histogram: iv.macd.histogram,
            },
            vwap: iv.vwap.vwap,
          },
        };

        upsertSnapshot(key, bar);

        for (const listener of listeners) {
          try {
            listener(bar);
          } catch (err) {
            log.error({ err }, 'Broadcast listener error');
          }
        }
      }
      return;
    }

    // ── OrderBook → bid/ask ticker (throttled) ────────────────────────────
    if (streamData.dataType === 'orderBook') {
      const ob = streamData.data as { bids: [number, number][]; asks: [number, number][] };
      const symbol = streamData.symbol;
      const bid = ob.bids?.[0]?.[0];
      const ask = ob.asks?.[0]?.[0];
      if (bid === null || bid === undefined || ask === null || ask === undefined || !Number.isFinite(bid) || !Number.isFinite(ask)) return;

      const now = Date.now();
      const lastSent = tickerThrottle.get(symbol) ?? 0;
      if (now - lastSent < TICKER_THROTTLE_MS) return;
      tickerThrottle.set(symbol, now);

      const update: TickerUpdate = { symbol, bid, ask };
      for (const listener of tickerListeners) {
        try {
          listener(update);
        } catch (err) {
          log.error({ err }, 'Ticker listener error');
        }
      }
    }
  });

  manager.on('error', (err) => {
    log.error({ err }, 'Bybit WebSocket error');
  });

  // ─── Connect in the background ───────────────────────────────────────────
  // Fire-and-forget: don't await so Fastify boots and serves health/auth
  // endpoints even when Bybit is temporarily unreachable.
  // ALLOWED_SYMBOLS is the single source of truth (src/constants.ts) — also
  // used by the market routes allowlist, so both stay in sync automatically.

  void manager
    .connect()
    .then(() => {
      for (const sym of ALLOWED_SYMBOLS) {
        manager.subscribe('kline', sym, '1');
        manager.subscribe('orderbook', sym, '1'); // orderbook.1.{symbol} — best bid/ask
      }
      log.info(
        { testnet: config.bybitTestnet, symbols: ALLOWED_SYMBOLS },
        `Bybit connected — subscribed to 1m klines + orderbook.1 for ${ALLOWED_SYMBOLS.length} symbols`
      );
    })
    .catch((err: unknown) => {
      // Auto-reconnect will retry; don't crash startup
      log.error({ err }, 'Bybit initial connection failed — auto-reconnect will retry');
    });

  // ─── Decorate fastify ─────────────────────────────────────────────────────

  const service: BybitService = {
    getSnapshot: (symbol, interval) => snapshots.get(`${symbol}:${interval}`) ?? [],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeTicker: (listener) => {
      tickerListeners.add(listener);
      return () => tickerListeners.delete(listener);
    },
  };

  fastify.decorate('bybit', service);

  // Clean disconnect on server close (prevents zombie connections)
  fastify.addHook('onClose', async () => {
    manager.disconnect();
    log.info('Bybit disconnected');
  });
}

export default fp(bybitPlugin, { name: 'bybit' });
