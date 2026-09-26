import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { BybitWebSocketManager } from '../services/BybitWebSocketManager.js';
import { CandleAggregator } from '../services/CandleAggregator.js';
import { IndicatorManager } from '../services/IndicatorCalculator.js';
import type { Kline, StreamData, TickerData } from '../types/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ALLOWED_CATEGORIES, ALLOWED_SYMBOLS, type BybitCategory } from '../constants.js';

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
  category: BybitCategory;
  symbol: string;
  interval: string; // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  kline: Kline;
  indicators: IndicatorSnapshot;
}

export interface BybitService {
  /** Returns the last SNAPSHOT_SIZE bars for a category+symbol+interval */
  getSnapshot(category: BybitCategory, symbol: string, interval: string): LiveBar[];
  /** Subscribe to live bar updates. Returns an unsubscribe function. */
  subscribe(listener: (bar: LiveBar) => void): () => void;
  /** Latest quote for a category+symbol, so a new client doesn't wait for the next change. */
  getTicker(category: BybitCategory, symbol: string): TickerUpdate | undefined;
  /** Subscribe to best bid/ask + last-price updates in real time (no throttle). Returns an unsubscribe function. */
  subscribeTicker(listener: (update: TickerUpdate) => void): () => void;
}

/**
 * Quote update for one symbol in one category. Spot: lastPrice from `tickers` + bid/ask from
 * `orderbook.1`. Linear: everything from `tickers`, including mark/index price and funding.
 * bid/ask are null until the first quote arrives.
 */
export interface TickerUpdate extends TickerData {
  category: BybitCategory;
}

// Extend FastifyInstance so TypeScript knows about fastify.bybit
declare module 'fastify' {
  interface FastifyInstance {
    bybit: BybitService;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Topics per category: spot needs orderbook.1 for bid/ask (its tickers stream has none — F2);
// linear tickers already carry bid/ask plus mark price and funding.
// 9 symbols × 3 = 27 (spot) and × 2 = 18 (linear) — under the manager's MAX_SUBSCRIPTIONS (50).
const CATEGORY_CHANNELS: Record<BybitCategory, readonly string[]> = {
  spot: ['tickers', 'orderbook'],
  linear: ['tickers'],
};

const SNAPSHOT_SIZE = 1000; // ~16 hours of 1m candles — matches client's INTERVAL_FETCH_LIMIT

// ─── Plugin ───────────────────────────────────────────────────────────────────

async function bybitPlugin(fastify: FastifyInstance): Promise<void> {
  // Skip real connection in test environment
  if (config.nodeEnv === 'test') {
    const noopService: BybitService = {
      getSnapshot: () => [],
      getTicker: () => undefined,
      subscribe: () => () => undefined,
      subscribeTicker: () => () => undefined,
    };
    fastify.decorate('bybit', noopService);
    return;
  }

  // One Bybit connection + aggregator per category — each market reads its own stream, so spot
  // and perp candles never mix. Memory is exactly 2× the single-market buffers.
  const managers = new Map<BybitCategory, BybitWebSocketManager>();
  const aggregators = new Map<BybitCategory, CandleAggregator>();
  for (const category of ALLOWED_CATEGORIES) {
    managers.set(category, new BybitWebSocketManager(config.bybitTestnet, category));
    aggregators.set(category, new CandleAggregator());
  }

  // One IndicatorManager per "category:symbol:interval" key
  const indicatorManagers = new Map<string, IndicatorManager>();
  // Ring-buffer of recent bars per "category:symbol:interval" key
  const snapshots = new Map<string, LiveBar[]>();
  // Active browser WebSocket listeners
  const listeners = new Set<(bar: LiveBar) => void>();
  // Ticker (lastPrice/bid/ask/mark/funding) listeners
  const tickerListeners = new Set<(update: TickerUpdate) => void>();
  // Latest ticker per "category:symbol" — bounded: 2 categories × ALLOWED_SYMBOLS
  const latestTickers = new Map<string, TickerUpdate>();

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

  function handleStreamData(streamData: StreamData): void {
    const { category, symbol } = streamData;

    // ── Kline → bars pipeline ─────────────────────────────────────────────
    if (streamData.dataType === 'kline') {
      const kline = streamData.data as Kline;
      const aggregated = aggregators.get(category)?.process(kline, symbol);
      if (!aggregated) return;

      for (const [interval, aggregatedKline] of aggregated) {
        const key = `${category}:${symbol}:${interval}`;
        const indicatorManager = getOrCreateManager(key);
        const iv = indicatorManager.update(aggregatedKline);

        const bar: LiveBar = {
          category,
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

    // ── Tickers → lastPrice / bid / ask / mark / funding (real-time) ─────
    if (streamData.dataType === 'ticker') {
      const update: TickerUpdate = { category, ...(streamData.data as TickerData) };
      latestTickers.set(`${category}:${symbol}`, update);
      for (const listener of tickerListeners) {
        try {
          listener(update);
        } catch (err) {
          log.error({ err }, 'Ticker listener error');
        }
      }
    }
  }

  // ─── Connect in the background ───────────────────────────────────────────
  // Fire-and-forget: don't await so Fastify boots and serves health/auth
  // endpoints even when Bybit is temporarily unreachable.
  // ALLOWED_SYMBOLS is the single source of truth (src/constants.ts) — also
  // used by the market routes allowlist, so both stay in sync automatically.

  for (const [category, manager] of managers) {
    manager.on('data', handleStreamData);
    manager.on('error', (err) => {
      log.error({ err, category }, 'Bybit WebSocket error');
    });
    // A cached quote is only valid while the stream is live — never hand a new client a stale
    // bid/ask after Bybit dropped us (BP-2 fills at these prices).
    manager.on('disconnected', () => {
      for (const symbol of ALLOWED_SYMBOLS) latestTickers.delete(`${category}:${symbol}`);
    });

    // Subscriptions are registered before connecting; onopen → resubscribeAll() sends them in
    // batches of ≤10 args, and re-sends them after every reconnect.
    // eslint-disable-next-line security/detect-object-injection -- category is a typed BybitCategory key
    const channels = CATEGORY_CHANNELS[category];
    manager.subscribeMany(
      ALLOWED_SYMBOLS.flatMap((symbol) => [
        { channel: 'kline', symbol, interval: '1' },
        // orderbook.1 = best bid/ask level only
        ...channels.map((channel) => ({
          channel,
          symbol,
          interval: channel === 'orderbook' ? '1' : undefined,
        })),
      ])
    );

    void manager
      .connect()
      .then(() => {
        log.info(
          { category, testnet: config.bybitTestnet, symbols: ALLOWED_SYMBOLS },
          `Bybit ${category} connected — ${manager.getSubscriptionCount()} topics for ${ALLOWED_SYMBOLS.length} symbols`
        );
      })
      .catch((err: unknown) => {
        // Auto-reconnect will retry; don't crash startup
        log.error({ err, category }, 'Bybit initial connection failed — auto-reconnect will retry');
      });
  }

  // ─── Decorate fastify ─────────────────────────────────────────────────────

  const service: BybitService = {
    getTicker: (category, symbol) => latestTickers.get(`${category}:${symbol}`),
    getSnapshot: (category, symbol, interval) =>
      snapshots.get(`${category}:${symbol}:${interval}`) ?? [],
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
    for (const manager of managers.values()) manager.disconnect();
    log.info('Bybit disconnected');
  });
}

export default fp(bybitPlugin, { name: 'bybit' });
