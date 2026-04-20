/**
 * Bybit WebSocket Manager
 * Handles real-time data streaming with exponential backoff reconnection
 * Phase 1: Klines, Trades, and Order Book only
 */

import { EventEmitter } from 'events';
import { Kline, OrderBook, Trade, TickerData, StreamData } from '../types/index.js';
import { logger } from '../logger.js';

const log = logger.child({ service: 'BybitWebSocketManager' });

interface WebSocketSubscription {
  channel: string;
  symbol: string;
  interval?: string;
}

export class BybitWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 1000; // Start with 1s
  private isManuallyClosed = false;
  private heartbeatTimeout: NodeJS.Timeout | null = null;

  constructor(useTestnet: boolean = true) {
    super();
    this.url = useTestnet
      ? 'wss://stream-testnet.bybit.com/v5/public/spot'
      : 'wss://stream.bybit.com/v5/public/spot';
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
          log.info('Disconnected');
          this.stopHeartbeat();

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
    // 🔐 Validate channel
    if (!BybitWebSocketManager.VALID_CHANNELS.has(channel)) {
      log.error({ channel }, 'Invalid channel');
      return;
    }

    // 🔐 Validate symbol format
    if (!BybitWebSocketManager.VALID_SYMBOL.test(symbol)) {
      log.error({ symbol }, 'Invalid symbol format');
      return;
    }

    // 🔐 Enforce subscription limit
    if (this.subscriptions.size >= BybitWebSocketManager.MAX_SUBSCRIPTIONS) {
      log.error({ limit: BybitWebSocketManager.MAX_SUBSCRIPTIONS }, 'Subscription limit reached');
      return;
    }

    const key = `${channel}|${symbol}${interval ? `|${interval}` : ''}`;

    if (this.subscriptions.has(key)) {
      log.info({ key }, 'Already subscribed');
      return;
    }

    const subscription: WebSocketSubscription = { channel, symbol, interval };
    this.subscriptions.set(key, subscription);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(key);
    }
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

    this.subscriptions.delete(key);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendUnsubscription(key);
    }
  }

  /**
   * Private: Send subscription message to Bybit
   */
  private sendSubscription(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (!subscription) return;

    const { channel, symbol, interval } = subscription;
    const topic = interval ? `${channel}.${interval}.${symbol}` : `${channel}.${symbol}`;

    const message = {
      op: 'subscribe',
      args: [topic],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      log.info({ topic }, 'Subscribed');
    }
  }

  /**
   * Private: Send unsubscription message to Bybit
   */
  private sendUnsubscription(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (!subscription) return;

    const { channel, symbol, interval } = subscription;
    const topic = interval ? `${channel}.${interval}.${symbol}` : `${channel}.${symbol}`;

    const message = {
      op: 'unsubscribe',
      args: [topic],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      log.info({ topic }, 'Unsubscribed');
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

      // Parse topic: e.g. "kline.1.BTCUSDT", "orderbook.1.BTCUSDT", "publicTrade.BTCUSDT"
      const parts = topic.split('.');
      const channelType = parts[0];
      const symbol = parts[parts.length - 1];
      const interval = parts.length === 3 ? parts[1] : undefined;

      let eventData: StreamData | null = null;

      if (channelType === 'kline') {
        eventData = this.parseKline(streamData, symbol, interval);
      } else if (channelType === 'orderbook') {
        eventData = this.parseOrderBook(
          streamData as { b: string[][]; a: string[][] },
          symbol,
          streamTs ?? Date.now()
        );
      } else if (channelType === 'publicTrade') {
        eventData = this.parseTrade(streamData, symbol);
      } else if (channelType === 'tickers') {
        eventData = this.parseTicker(streamData, symbol);
      }

      if (eventData) {
        this.emit('data', eventData);
        this.emit(`${channelType}:${symbol}`, eventData);
      }
    } catch (error) {
      log.error({ err: error }, 'Error processing stream data');
    }
  }

  /**
   * Private: Parse kline (candle) data from Bybit v5
   * Bybit v5 sends an array of kline objects — we use the first (most recent) item
   */
  private parseKline(data: unknown, symbol: string, _interval?: string): StreamData | null {
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
   * Private: Parse ticker data from Bybit v5 tickers stream
   * Provides real-time lastPrice, best bid, and best ask — no aggregation lag.
   */
  private parseTicker(data: unknown, symbol: string): StreamData | null {
    try {
      if (!data || typeof data !== 'object') return null;
      const raw = data as Record<string, unknown>;

      const lastPrice = parseFloat(String(raw.lastPrice));
      const bid = parseFloat(String(raw.bid1Price));
      const ask = parseFloat(String(raw.ask1Price));

      if (!Number.isFinite(lastPrice) || !Number.isFinite(bid) || !Number.isFinite(ask)) {
        return null;
      }

      const ticker: TickerData = { symbol, lastPrice, bid, ask };
      return { symbol, dataType: 'ticker', data: ticker, timestamp: Date.now() };
    } catch (error) {
      log.error({ err: error }, 'Failed to parse ticker');
      return null;
    }
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
   * Private: Reconnect with exponential backoff
   */
  private reconnect(): void {
    if (this.isManuallyClosed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error(
        { maxAttempts: this.maxReconnectAttempts },
        'Max reconnection attempts reached, giving up'
      );
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    log.info(
      { delay, attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts },
      'Reconnecting'
    );

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
    for (const key of this.subscriptions.keys()) {
      this.sendSubscription(key);
    }
  }

  /**
   * Private: Start heartbeat to detect stale connections
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimeout = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Bybit's public streams automatically send pings, but we can also ping
        // This is mostly for keeping the connection alive
      }
    }, 30000); // Every 30 seconds
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
