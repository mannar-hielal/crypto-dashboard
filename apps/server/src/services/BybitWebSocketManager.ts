/**
 * Bybit WebSocket Manager
 * Handles real-time data streaming with exponential backoff reconnection
 * Phase 1: Klines, Trades, and Order Book only
 */

import { EventEmitter } from 'events';
import { Kline, OrderBook, Trade, TickerData, StreamData } from '../types/index.js';
import type { BybitCategory } from '../constants.js';
import { logger } from '../logger.js';

const log = logger.child({ service: 'BybitWebSocketManager' });

// Bybit rejects a subscribe/unsubscribe request with more than 10 args on spot
// ("args size >10", checked live 2026-09-26); linear allows more, but one limit
// for both keeps the batching logic simple.
const MAX_ARGS_PER_REQUEST = 10;

/** Parse a Bybit numeric string field; undefined when absent or non-finite. */
function toFinite(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

interface WebSocketSubscription {
  channel: string;
  symbol: string;
  interval?: string;
}

export class BybitWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  /** Which Bybit public stream this manager reads (`/v5/public/{category}`). */
  readonly category: BybitCategory;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private reconnectAttempts = 0;
  private reconnectDelay = 1000; // Start with 1s
  private isManuallyClosed = false;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  /**
   * Last known quote state per symbol — Bybit sends a snapshot, then deltas that carry only the
   * changed fields, and spot splits lastPrice (`tickers`) from bid/ask (`orderbook.1`). Every
   * update is merged field by field into this state. Bounded by the subscription cap and
   * cleaned up in unsubscribe().
   */
  private tickerState: Map<string, Partial<TickerData>> = new Map();

  constructor(useTestnet: boolean = true, category: BybitCategory = 'spot') {
    super();
    this.category = category;
    this.url = useTestnet
      ? `wss://stream-testnet.bybit.com/v5/public/${category}`
      : `wss://stream.bybit.com/v5/public/${category}`;
  }

  /**
   * Connect to Bybit WebSocket with automatic reconnection
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isManuallyClosed = false;
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          log.info('Connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          // Resubscribe to all channels after reconnection
          this.resubscribeAll();

          // Start heartbeat
          this.startHeartbeat();

          resolve();
          this.emit('connected');
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          log.error({ err: error }, 'WebSocket error');
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          log.info({ category: this.category }, 'Disconnected');
          this.stopHeartbeat();
          // Quotes from before the drop are stale — start clean so the post-reconnect snapshot is
          // always emitted and spot never pairs a fresh lastPrice with a pre-drop bid/ask.
          this.tickerState.clear();

          if (!this.isManuallyClosed) {
            this.reconnect();
          }

          this.emit('disconnected');
        };
      } catch (error) {
        log.error({ err: error }, 'Connection failed');
        reject(error);
      }
    });
  }

  /**
   * Disconnect gracefully
   */
  disconnect(): void {
    this.isManuallyClosed = true;
    this.stopHeartbeat();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    this.subscriptions.clear();
    this.tickerState.clear(); // free cached ticker state for all symbols
    log.info('Manually closed');
  }

  /**
   * Subscribe to a channel (kline, orderBook, publicTrade)
   */
  // 🔐 Valid Bybit symbol format: uppercase letters + digits (e.g. BTCUSDT, ETH1000USDT)
  private static readonly VALID_SYMBOL = /^[A-Z0-9]{3,20}$/;
  // 🔐 Valid channels for Phase 1 only
  private static readonly VALID_CHANNELS = new Set([
    'kline',
    'orderbook',
    'publicTrade',
    'tickers',
  ]);
  // 🔐 Max subscriptions to prevent memory exhaustion
  private static readonly MAX_SUBSCRIPTIONS = 50;

  subscribe(channel: string, symbol: string, interval?: string): void {
    const key = this.register(channel, symbol, interval);
    if (key) this.sendOp('subscribe', [key]);
  }

  /**
   * Subscribe to several topics at once, sent in batches of at most MAX_ARGS_PER_REQUEST args
   * (Bybit spot rejects larger requests).
   */
  subscribeMany(topics: WebSocketSubscription[]): void {
    const keys: string[] = [];
    for (const { channel, symbol, interval } of topics) {
      const key = this.register(channel, symbol, interval);
      if (key) keys.push(key);
    }
    this.sendOp('subscribe', keys);
  }

  /**
   * Private: validate and store a subscription. Returns its key, or null when it was rejected or
   * is already stored.
   */
  private register(channel: string, symbol: string, interval?: string): string | null {
    // 🔐 Validate channel
    if (!BybitWebSocketManager.VALID_CHANNELS.has(channel)) {
      log.error({ channel }, 'Invalid channel');
      return null;
    }

    // 🔐 Validate symbol format
    if (!BybitWebSocketManager.VALID_SYMBOL.test(symbol)) {
      log.error({ symbol }, 'Invalid symbol format');
      return null;
    }

    // 🔐 Enforce subscription limit
    if (this.subscriptions.size >= BybitWebSocketManager.MAX_SUBSCRIPTIONS) {
      log.error({ limit: BybitWebSocketManager.MAX_SUBSCRIPTIONS }, 'Subscription limit reached');
      return null;
    }

    const key = `${channel}|${symbol}${interval ? `|${interval}` : ''}`;

    if (this.subscriptions.has(key)) {
      log.info({ key }, 'Already subscribed');
      return null;
    }

    this.subscriptions.set(key, { channel, symbol, interval });
    return key;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string, symbol: string, interval?: string): void {
    const key = `${channel}|${symbol}${interval ? `|${interval}` : ''}`;

    if (!this.subscriptions.has(key)) {
      log.info({ key }, 'Not subscribed');
      return;
    }

    this.sendOp('unsubscribe', [key]);

    this.subscriptions.delete(key);

    // Remove cached ticker state if no remaining subscriptions reference this symbol
    // — prevents unbounded memory growth when symbols are rotated at runtime.
    const symbolStillActive = [...this.subscriptions.keys()].some((k) => k.includes(`|${symbol}`));
    if (!symbolStillActive) {
      this.tickerState.delete(symbol);
    }
  }

  /**
   * Private: Send a subscribe/unsubscribe request for the given subscription keys, in batches of
   * at most MAX_ARGS_PER_REQUEST topics. No-op while the socket isn't open — resubscribeAll()
   * sends everything stored once it connects.
   */
  private sendOp(op: 'subscribe' | 'unsubscribe', keys: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const topics: string[] = [];
    for (const key of keys) {
      const subscription = this.subscriptions.get(key);
      if (!subscription) continue;
      const { channel, symbol, interval } = subscription;
      topics.push(interval ? `${channel}.${interval}.${symbol}` : `${channel}.${symbol}`);
    }

    for (let i = 0; i < topics.length; i += MAX_ARGS_PER_REQUEST) {
      const args = topics.slice(i, i + MAX_ARGS_PER_REQUEST);
      this.ws.send(JSON.stringify({ op, args }));
      log.info(
        { category: this.category, topics: args },
        op === 'subscribe' ? 'Subscribed' : 'Unsubscribed'
      );
    }
  }

  /**
   * Private: Handle incoming WebSocket messages
   */
  private handleMessage(rawData: string): void {
    // 🔐 Reject oversized messages — prevents DoS via large payload JSON.parse
    const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB — more than enough for market data
    if (rawData.length > MAX_MESSAGE_SIZE) {
      log.error({ size: rawData.length }, 'Message rejected: too large');
      return;
    }

    try {
      const data = JSON.parse(rawData);

      // Bybit sends op: "subscribe" confirmations - ignore these
      if (data.op === 'subscribe' || data.op === 'unsubscribe') {
        log.debug({ op: data.op, success: data.success }, 'Op confirmation');
        return;
      }

      // Heartbeat/ping
      if (data.op === 'ping') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'pong' }));
        }
        return;
      }

      // Stream data
      if (data.topic) {
        this.processStreamData(data);
      }
    } catch (error) {
      // 🔐 Never log rawData — could be large or contain sensitive market data
      log.error(
        { err: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to parse message'
      );
    }
  }

  /**
   * Private: Process stream data and emit typed events
   * data.ts is the top-level server timestamp from Bybit v5
   */
  private processStreamData(data: { topic: string; data: unknown; ts?: number }): void {
    try {
      const { topic, data: streamData, ts: streamTs } = data;

      if (!topic || !streamData) return;

      // Parse topic: e.g. "kline.1.BTCUSDT", "orderbook.1.BTCUSDT", "publicTrade.BTCUSDT".
      // The middle part is a kline interval only for kline topics — for orderbook it is the
      // book depth, so it is never passed on as an interval.
      const parts = topic.split('.');
      const channelType = parts[0];
      const symbol = parts[parts.length - 1];

      if (channelType === 'kline') {
        this.emitStream(channelType, this.parseKline(streamData, symbol));
      } else if (channelType === 'orderbook') {
        const orderBook = this.parseOrderBook(
          streamData as { b: string[][]; a: string[][] },
          symbol,
          streamTs ?? Date.now()
        );
        this.emitStream(channelType, orderBook);
        // Spot tickers carry no bid/ask (F2) — the best level of orderbook.1 supplies them.
        if (orderBook) {
          const book = orderBook.data as OrderBook;
          this.emitStream(
            'tickers',
            this.mergeTicker(symbol, {
              bid: toFinite(book.bids[0]?.[0]),
              ask: toFinite(book.asks[0]?.[0]),
            })
          );
        }
      } else if (channelType === 'publicTrade') {
        this.emitStream(channelType, this.parseTrade(streamData, symbol));
      } else if (channelType === 'tickers') {
        this.emitStream(channelType, this.parseTicker(streamData, symbol));
      }
    } catch (error) {
      log.error({ err: error }, 'Error processing stream data');
    }
  }

  /** Private: emit a parsed stream event (skips null). */
  private emitStream(channelType: string, eventData: StreamData | null): void {
    if (!eventData) return;
    this.emit('data', eventData);
    this.emit(`${channelType}:${eventData.symbol}`, eventData);
  }

  /**
   * Private: Parse kline (candle) data from Bybit v5
   * Bybit v5 sends an array of kline objects — we use the first (most recent) item
   */
  private parseKline(data: unknown, symbol: string): StreamData | null {
    try {
      const items = Array.isArray(data) ? data : [data];
      if (items.length === 0) return null;

      const item = items[0];
      // Runtime guard: reject anything that isn't a plain object
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;

      // Coerce all numeric fields and reject the message if any are non-finite
      // (guards against Bybit sending a string "NaN" or a missing field)
      const timestamp = Number(raw.start);
      const open = parseFloat(String(raw.open));
      const high = parseFloat(String(raw.high));
      const low = parseFloat(String(raw.low));
      const close = parseFloat(String(raw.close));
      const volume = parseFloat(String(raw.volume));
      const quoteAssetVolume = parseFloat(String(raw.turnover));

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume) ||
        !Number.isFinite(quoteAssetVolume)
      ) {
        log.warn({ symbol }, 'Kline message dropped: non-finite numeric field');
        return null;
      }

      const kline: Kline = {
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        quoteAssetVolume,
        confirm: Boolean(raw.confirm),
        interval: typeof raw.interval === 'string' ? raw.interval : undefined,
      };

      return {
        category: this.category,
        symbol,
        dataType: 'kline',
        data: kline,
        timestamp: kline.timestamp,
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to parse kline');
      return null;
    }
  }

  /**
   * Private: Parse order book data from Bybit v5
   * ts comes from the top-level message field (not inside data)
   */
  private parseOrderBook(
    data: { b: string[][]; a: string[][] },
    symbol: string,
    ts: number
  ): StreamData | null {
    try {
      const { b, a } = data; // bids, asks

      const orderBook: OrderBook = {
        symbol,
        bids: b.map((bid) => [parseFloat(bid[0]), parseFloat(bid[1])]),
        asks: a.map((ask) => [parseFloat(ask[0]), parseFloat(ask[1])]),
        timestamp: ts,
      };

      return {
        category: this.category,
        symbol,
        dataType: 'orderBook',
        data: orderBook,
        timestamp: orderBook.timestamp,
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to parse order book');
      return null;
    }
  }

  /**
   * Private: Parse ticker data from Bybit v5 tickers stream.
   * Spot: lastPrice only (bid/ask come from orderbook.1). Linear: lastPrice, bid/ask, mark/index
   * price and funding fields. Deltas carry only changed fields, so each one is merged into the
   * last known state.
   */
  private parseTicker(data: unknown, symbol: string): StreamData | null {
    try {
      if (!data || typeof data !== 'object') return null;
      const raw = data as Record<string, unknown>;

      return this.mergeTicker(symbol, {
        lastPrice: toFinite(raw.lastPrice),
        bid: toFinite(raw.bid1Price),
        ask: toFinite(raw.ask1Price),
        markPrice: toFinite(raw.markPrice),
        indexPrice: toFinite(raw.indexPrice),
        fundingRate: toFinite(raw.fundingRate),
        nextFundingTime: toFinite(raw.nextFundingTime),
        fundingIntervalHour: toFinite(raw.fundingIntervalHour),
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to parse ticker');
      return null;
    }
  }

  /**
   * Private: merge a partial quote update into the symbol's ticker state and return the merged
   * ticker event. Undefined fields keep their last known value. Returns null until a lastPrice is
   * known, and when the update changed nothing; bid/ask are null until the first quote arrives,
   * so a missing bid/ask never drops a lastPrice update (F2).
   */
  private mergeTicker(symbol: string, update: Partial<TickerData>): StreamData | null {
    const merged: Record<string, unknown> = { ...this.tickerState.get(symbol) };
    let changed = false;
    for (const [field, value] of Object.entries(update)) {
      // field comes from the fixed Partial<TickerData> keys above — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      if (value !== undefined && merged[field] !== value) {
        // eslint-disable-next-line security/detect-object-injection
        merged[field] = value;
        changed = true;
      }
    }
    const state = merged as Partial<TickerData>;
    this.tickerState.set(symbol, state);

    // Most orderbook.1 pushes only change the size at the best level — nothing to broadcast.
    if (!changed || state.lastPrice === undefined) return null;

    const ticker: TickerData = {
      symbol,
      lastPrice: state.lastPrice,
      bid: state.bid ?? null,
      ask: state.ask ?? null,
    };
    if (this.category === 'linear') {
      ticker.markPrice = state.markPrice;
      ticker.indexPrice = state.indexPrice;
      ticker.fundingRate = state.fundingRate;
      ticker.nextFundingTime = state.nextFundingTime;
      ticker.fundingIntervalHour = state.fundingIntervalHour;
    }
    return {
      category: this.category,
      symbol,
      dataType: 'ticker',
      data: ticker,
      timestamp: Date.now(),
    };
  }

  /**
   * Private: Parse trade data from Bybit v5
   * Bybit v5 sends an array of trade objects — we use the first item
   */
  private parseTrade(data: unknown, symbol: string): StreamData | null {
    try {
      const items = Array.isArray(data) ? data : [data];
      if (items.length === 0) return null;

      const item = items[0];
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;

      const timestamp = Number(raw.T);
      const price = parseFloat(String(raw.p));
      const quantity = parseFloat(String(raw.v));

      if (!Number.isFinite(timestamp) || !Number.isFinite(price) || !Number.isFinite(quantity)) {
        log.warn({ symbol }, 'Trade message dropped: non-finite numeric field');
        return null;
      }

      const trade: Trade = {
        price,
        quantity,
        side: raw.S === 'Buy' ? 'BUY' : 'SELL',
        timestamp,
      };

      return {
        category: this.category,
        symbol,
        dataType: 'trade',
        data: trade,
        timestamp: trade.timestamp,
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to parse trade');
      return null;
    }
  }

  /**
   * Private: Reconnect with exponential backoff.
   *
   * Reconnection is intentionally unbounded — this manager runs inside a
   * long-lived server process that must stay connected to Bybit 24/7.
   * Bybit can close the connection for any reason (maintenance, rate-limit,
   * network blip) and we want to recover automatically every time.
   * The delay is capped at 30 s so recovery is prompt even after many failures.
   */
  private reconnect(): void {
    if (this.isManuallyClosed) return;

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    log.info({ delay, attempt: this.reconnectAttempts }, 'Reconnecting');

    setTimeout(() => {
      this.connect().catch((error) => {
        log.error({ err: error }, 'Reconnection failed');
      });
    }, delay);
  }

  /**
   * Private: Resubscribe to all channels after reconnection
   */
  private resubscribeAll(): void {
    this.sendOp('subscribe', [...this.subscriptions.keys()]);
  }

  /**
   * Private: Start heartbeat — sends { op: "ping" } every 20 s.
   * Bybit v5 public streams require the client to ping at least every 20 s
   * or the server closes the connection without warning.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimeout = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20_000); // Every 20 seconds — required by Bybit v5
  }

  /**
   * Private: Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearInterval(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get number of active subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

export default BybitWebSocketManager;
