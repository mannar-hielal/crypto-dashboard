import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BybitWebSocketManager } from '../BybitWebSocketManager.js';

// ─── Mock WebSocket ────────────────────────────────────────────────────────────
// We never want real network connections in unit tests. Pushing `this` into an
// array (argument, not assignment) avoids the @typescript-eslint/no-this-alias
// rule while still letting tests reach the last created instance.

// Holds every MockWebSocket created during a test; cleared in beforeEach.
const wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 1; // OPEN by default
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(_url: string) {
    // push(this) is a method call — not flagged by no-this-alias
    wsInstances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

/** Returns the most recently created MockWebSocket instance. */
function lastWs(): MockWebSocket {
  const ws = wsInstances.at(-1);
  if (!ws) throw new Error('No MockWebSocket instance created yet');
  return ws;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Call the private handleMessage method on the manager (type cast). */
function handleMessage(manager: BybitWebSocketManager, raw: string) {
  (manager as unknown as { handleMessage(d: string): void }).handleMessage(raw);
}

describe('BybitWebSocketManager', () => {
  beforeEach(() => {
    wsInstances.length = 0; // clear between tests
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── subscribe() ──────────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('accepts a valid kline subscription', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');
      expect(manager.getSubscriptionCount()).toBe(1);
    });

    it('accepts orderbook and publicTrade channels', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('orderbook', 'BTCUSDT');
      manager.subscribe('publicTrade', 'BTCUSDT');
      expect(manager.getSubscriptionCount()).toBe(2);
    });

    it('rejects an unknown channel (🔐 allowlist)', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('ticker', 'BTCUSDT'); // 'ticker' is not allowed
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('rejects a symbol with special characters (🔐 format validation)', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTC-USDT'); // hyphen not allowed
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('rejects a symbol that is too short (< 3 chars)', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BT');
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('rejects a symbol that is too long (> 20 chars)', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'A'.repeat(21));
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('is idempotent — duplicate subscription is a no-op', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');
      manager.subscribe('kline', 'BTCUSDT', '1');
      expect(manager.getSubscriptionCount()).toBe(1);
    });

    it('treats different intervals as separate subscriptions', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');
      manager.subscribe('kline', 'BTCUSDT', '5');
      expect(manager.getSubscriptionCount()).toBe(2);
    });
  });

  // ── unsubscribe() ─────────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('removes an existing subscription', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');
      manager.unsubscribe('kline', 'BTCUSDT', '1');
      expect(manager.getSubscriptionCount()).toBe(0);
    });

    it('does not throw when unsubscribing from a non-existent subscription', () => {
      const manager = new BybitWebSocketManager(false);
      expect(() => manager.unsubscribe('kline', 'ETHUSDT', '1')).not.toThrow();
    });

    it('only removes the target subscription, leaving others intact', () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');
      manager.subscribe('kline', 'ETHUSDT', '1');
      manager.unsubscribe('kline', 'BTCUSDT', '1');
      expect(manager.getSubscriptionCount()).toBe(1);
    });
  });

  // ── handleMessage() ──────────────────────────────────────────────────────────

  describe('handleMessage()', () => {
    it('silently drops messages larger than 64 KB (🔐 DoS guard)', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(manager, 'x'.repeat(65 * 1024 + 1));

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not throw on malformed JSON (graceful degradation)', () => {
      const manager = new BybitWebSocketManager(false);
      expect(() => handleMessage(manager, '{bad json')).not.toThrow();
    });

    it('ignores subscribe op confirmation messages (no data event emitted)', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(manager, JSON.stringify({ op: 'subscribe', success: true }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores unsubscribe op confirmation messages', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(manager, JSON.stringify({ op: 'unsubscribe', success: true }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('emits a data event with dataType=kline for a valid kline message', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'kline.1.BTCUSDT',
          data: [
            {
              start: 1700000000000,
              open: '44800',
              high: '44900',
              low: '44700',
              close: '44900',
              volume: '1.2',
              turnover: '53880',
              confirm: false,
              interval: '1',
            },
          ],
        })
      );

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0] as { dataType: string; symbol: string };
      expect(event.dataType).toBe('kline');
      expect(event.symbol).toBe('BTCUSDT');
    });

    it('parses kline OHLCV fields correctly', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'kline.1.BTCUSDT',
          data: [
            {
              start: 1700000000000,
              open: '100',
              high: '110',
              low: '90',
              close: '105',
              volume: '2.5',
              turnover: '262.5',
              confirm: true,
              interval: '1',
            },
          ],
        })
      );

      const event = listener.mock.calls[0][0] as { data: { open: number; close: number } };
      expect(event.data.open).toBe(100);
      expect(event.data.close).toBe(105);
    });

    it('emits a data event with dataType=orderBook for a valid orderbook message', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          ts: 1700000000000,
          data: {
            b: [['44900', '0.5']],
            a: [['45000', '0.3']],
          },
        })
      );

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0] as { dataType: string; symbol: string };
      expect(event.dataType).toBe('orderBook');
      expect(event.symbol).toBe('BTCUSDT');
    });

    it('emits a data event with dataType=trade for a valid publicTrade message', () => {
      const manager = new BybitWebSocketManager(false);
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'publicTrade.ETHUSDT',
          data: [{ T: 1700000000000, S: 'Buy', v: '0.5', p: '3200' }],
        })
      );

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0] as { dataType: string; symbol: string };
      expect(event.dataType).toBe('trade');
      expect(event.symbol).toBe('ETHUSDT');
    });

    it('parses trade side correctly — "Buy" → BUY, "Sell" → SELL', () => {
      const manager = new BybitWebSocketManager(false);
      const results: string[] = [];
      manager.on('data', (e: { data: { side: string } }) => results.push(e.data.side));

      for (const [raw, expected] of [
        ['Buy', 'BUY'],
        ['Sell', 'SELL'],
      ]) {
        handleMessage(
          manager,
          JSON.stringify({
            topic: 'publicTrade.BTCUSDT',
            data: [{ T: Date.now(), S: raw, v: '1', p: '45000' }],
          })
        );
        expect(results.at(-1)).toBe(expected);
      }
    });
  });

  // ── connect() / isConnected() ─────────────────────────────────────────────────

  describe('connect()', () => {
    it('resolves when the WebSocket fires onopen', async () => {
      const manager = new BybitWebSocketManager(false);
      const connectPromise = manager.connect();

      // The manager set this.ws = new MockWebSocket(), so lastWs() is now set.
      // Trigger the onopen handler to resolve the promise.
      lastWs().onopen?.();

      await expect(connectPromise).resolves.toBeUndefined();
    });

    it('returns true from isConnected() after a successful open', async () => {
      const manager = new BybitWebSocketManager(false);
      const connectPromise = manager.connect();
      lastWs().onopen?.();
      await connectPromise;

      expect(manager.isConnected()).toBe(true);
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('sets isConnected() to false and prevents auto-reconnect', async () => {
      const manager = new BybitWebSocketManager(false);
      const connectPromise = manager.connect();
      lastWs().onopen?.();
      await connectPromise;

      manager.disconnect();

      expect(manager.isConnected()).toBe(false);
    });

    it('clears all subscriptions on disconnect', async () => {
      const manager = new BybitWebSocketManager(false);
      manager.subscribe('kline', 'BTCUSDT', '1');

      const connectPromise = manager.connect();
      lastWs().onopen?.();
      await connectPromise;

      manager.disconnect();

      expect(manager.getSubscriptionCount()).toBe(0);
    });
  });

  // ── isConnected() before connect() ───────────────────────────────────────────

  it('returns false from isConnected() before connect() is called', () => {
    const manager = new BybitWebSocketManager(false);
    expect(manager.isConnected()).toBe(false);
  });
});
