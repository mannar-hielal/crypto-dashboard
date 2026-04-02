/**
 * Bybit WebSocket Manager
 * Handles real-time data streaming with exponential backoff reconnection
 * Phase 1: Klines, Trades, and Order Book only
 */

import { EventEmitter } from 'events';
import { Kline, OrderBook, Trade, StreamData } from '../types';

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
          console.log('[Bybit WS] Connected');
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
          console.error('[Bybit WS] Error:', error);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[Bybit WS] Disconnected');
          this.stopHeartbeat();

          if (!this.isManuallyClosed) {
            this.reconnect();
          }

          this.emit('disconnected');
        };
      } catch (error) {
        console.error('[Bybit WS] Connection failed:', error);
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
    console.log('[Bybit WS] Manually closed');
  }

  /**
   * Subscribe to a channel (kline, orderBook, publicTrade)
   */
  subscribe(channel: string, symbol: string, interval?: string): void {
    const key = `${channel}|${symbol}${interval ? `|${interval}` : ''}`;

    if (this.subscriptions.has(key)) {
      console.log(`[Bybit WS] Already subscribed to ${key}`);
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
      console.log(`[Bybit WS] Not subscribed to ${key}`);
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
      console.log(`[Bybit WS] Subscribed to ${topic}`);
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
      console.log(`[Bybit WS] Unsubscribed from ${topic}`);
    }
  }

  /**
   * Private: Handle incoming WebSocket messages
   */
  private handleMessage(rawData: string): void {
    try {
      const data = JSON.parse(rawData);

      // Bybit sends op: "subscribe" confirmations - ignore these
      if (data.op === 'subscribe' || data.op === 'unsubscribe') {
        console.log(`[Bybit WS] ${data.op} confirmation:`, data.success);
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
      console.error('[Bybit WS] Failed to parse message:', error, rawData);
    }
  }

  /**
   * Private: Process stream data and emit typed events
   */
  private processStreamData(data: any): void {
    try {
      const { topic, type, data: streamData } = data;

      if (!topic || !streamData) return;

      // Parse topic: e.g., "kline.1.BTCUSDT", "orderbook.1.BTCUSDT", "publicTrade.BTCUSDT"
      const parts = topic.split('.');
      const channelType = parts[0];
      const symbol = parts[parts.length - 1];
      const interval = parts.length === 3 ? parts[1] : undefined;

      let eventData: StreamData | null = null;

      if (channelType === 'kline') {
        eventData = this.parseKline(streamData, symbol, interval);
      } else if (channelType === 'orderbook') {
        eventData = this.parseOrderBook(streamData, symbol);
      } else if (channelType === 'publicTrade') {
        eventData = this.parseTrade(streamData, symbol);
      }

      if (eventData) {
        this.emit('data', eventData);
        this.emit(`${channelType}:${symbol}`, eventData);
      }
    } catch (error) {
      console.error('[Bybit WS] Error processing stream data:', error, data);
    }
  }

  /**
   * Private: Parse kline (candle) data from Bybit
   */
  private parseKline(data: any, symbol: string, interval?: string): StreamData | null {
    try {
      const kline: Kline = {
        timestamp: parseInt(data[0]),
        open: parseFloat(data[1]),
        high: parseFloat(data[2]),
        low: parseFloat(data[3]),
        close: parseFloat(data[4]),
        volume: parseFloat(data[5]),
        quoteAssetVolume: parseFloat(data[6]),
      };

      return {
        symbol,
        dataType: 'kline',
        data: kline,
        timestamp: kline.timestamp,
      };
    } catch (error) {
      console.error('[Bybit WS] Failed to parse kline:', error, data);
      return null;
    }
  }

  /**
   * Private: Parse order book data from Bybit
   */
  private parseOrderBook(data: any, symbol: string): StreamData | null {
    try {
      const { b, a, ts } = data; // bids, asks, timestamp

      const orderBook: OrderBook = {
        symbol,
        bids: b.map((bid: any) => [parseFloat(bid[0]), parseFloat(bid[1])]),
        asks: a.map((ask: any) => [parseFloat(ask[0]), parseFloat(ask[1])]),
        timestamp: parseInt(ts),
      };

      return {
        symbol,
        dataType: 'orderBook',
        data: orderBook,
        timestamp: orderBook.timestamp,
      };
    } catch (error) {
      console.error('[Bybit WS] Failed to parse order book:', error, data);
      return null;
    }
  }

  /**
   * Private: Parse trade data from Bybit
   */
  private parseTrade(data: any, symbol: string): StreamData | null {
    try {
      // data is an array of trades: [[price, qty, side, timestamp], ...]
      if (Array.isArray(data) && data.length > 0) {
        const trade: Trade = {
          price: parseFloat(data[0]),
          quantity: parseFloat(data[1]),
          side: data[2].toUpperCase() as 'BUY' | 'SELL',
          timestamp: parseInt(data[3]),
        };

        return {
          symbol,
          dataType: 'trade',
          data: trade,
          timestamp: trade.timestamp,
        };
      }

      return null;
    } catch (error) {
      console.error('[Bybit WS] Failed to parse trade:', error, data);
      return null;
    }
  }

  /**
   * Private: Reconnect with exponential backoff
   */
  private reconnect(): void {
    if (this.isManuallyClosed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[Bybit WS] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`
      );
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(
      `[Bybit WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[Bybit WS] Reconnection failed:', error);
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

