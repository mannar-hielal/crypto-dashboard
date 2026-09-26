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

  url: string;

  constructor(url: string) {
    this.url = url;
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
    vi.useFakeTimers(); // 🔐 prevents startHeartbeat()'s setInterval from leaking open handles
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  // ── Categories (BYBIT_PARITY_PLAN BP-0) ──────────────────────────────────────

  describe('category', () => {
    /** Connect a manager and return its (mock) socket. */
    async function connected(manager: BybitWebSocketManager): Promise<MockWebSocket> {
      const p = manager.connect();
      const ws = lastWs();
      ws.onopen?.();
      await p;
      return ws;
    }

    /** Collect ticker events emitted by the manager. */
    function tickers(manager: BybitWebSocketManager) {
      const events: { category: string; data: Record<string, unknown> }[] = [];
      manager.on(
        'data',
        (e: { dataType: string; category: string; data: Record<string, unknown> }) => {
          if (e.dataType === 'ticker') events.push(e);
        }
      );
      return events;
    }

    it('defaults to the spot stream', () => {
      const manager = new BybitWebSocketManager(false);
      void manager.connect();
      expect(lastWs().url).toBe('wss://stream.bybit.com/v5/public/spot');
      expect(manager.category).toBe('spot');
    });

    it('connects to the linear stream (mainnet and testnet)', () => {
      void new BybitWebSocketManager(false, 'linear').connect();
      expect(lastWs().url).toBe('wss://stream.bybit.com/v5/public/linear');
      void new BybitWebSocketManager(true, 'linear').connect();
      expect(lastWs().url).toBe('wss://stream-testnet.bybit.com/v5/public/linear');
    });

    it('tags every emitted event with its category', () => {
      const manager = new BybitWebSocketManager(false, 'linear');
      const listener = vi.fn();
      manager.on('data', listener);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'kline.1.BTCUSDT',
          data: [
            {
              start: 1700000000000,
              open: '1',
              high: '1',
              low: '1',
              close: '1',
              volume: '1',
              turnover: '1',
              confirm: false,
            },
          ],
        })
      );

      expect(listener.mock.calls[0][0]).toMatchObject({ category: 'linear', dataType: 'kline' });
    });

    it('sends subscriptions in batches of at most 10 args (Bybit spot limit)', async () => {
      const manager = new BybitWebSocketManager(false);
      const symbols = [
        'BTCUSDT',
        'ETHUSDT',
        'SOLUSDT',
        'BNBUSDT',
        'XRPUSDT',
        'DOGEUSDT',
        'ADAUSDT',
        'AVAXUSDT',
        'LINKUSDT',
      ];
      manager.subscribeMany(
        symbols.flatMap((symbol) => [
          { channel: 'kline', symbol, interval: '1' },
          { channel: 'tickers', symbol },
          { channel: 'orderbook', symbol, interval: '1' },
        ])
      );
      expect(manager.getSubscriptionCount()).toBe(27);

      const ws = await connected(manager);
      const requests = ws.sent
        .map((m) => JSON.parse(m) as { op: string; args?: string[] })
        .filter((m) => m.op === 'subscribe');

      expect(requests.map((r) => r.args?.length)).toEqual([10, 10, 7]);
      const topics = requests.flatMap((r) => r.args ?? []);
      expect(topics).toContain('orderbook.1.BTCUSDT');
      expect(topics).toContain('tickers.LINKUSDT');
      expect(topics).toContain('kline.1.ADAUSDT');
    });

    it('spot: emits a ticker with lastPrice even before any bid/ask is known (F2)', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);

      // Real spot tickers snapshot — no bid1Price/ask1Price (checked live 2026-09-26)
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          type: 'snapshot',
          data: { symbol: 'BTCUSDT', lastPrice: '83940', usdIndexPrice: '83922.04' },
        })
      );

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('spot');
      expect(events[0].data).toEqual({ symbol: 'BTCUSDT', lastPrice: 83940, bid: null, ask: null });
    });

    it('spot: merges orderbook.1 best bid/ask into the ticker', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          data: { symbol: 'BTCUSDT', lastPrice: '83940' },
        })
      );
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          ts: 1790374573529,
          type: 'snapshot',
          data: { s: 'BTCUSDT', b: [['83939.9', '0.79']], a: [['83940', '0.54']] },
        })
      );
      // A later tickers update keeps the book's bid/ask
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          data: { symbol: 'BTCUSDT', lastPrice: '83941' },
        })
      );

      expect(events.map((e) => e.data)).toEqual([
        { symbol: 'BTCUSDT', lastPrice: 83940, bid: null, ask: null },
        { symbol: 'BTCUSDT', lastPrice: 83940, bid: 83939.9, ask: 83940 },
        { symbol: 'BTCUSDT', lastPrice: 83941, bid: 83939.9, ask: 83940 },
      ]);
    });

    it('spot: an orderbook update before any lastPrice emits no ticker', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          data: { s: 'BTCUSDT', b: [['1', '1']], a: [['2', '1']] },
        })
      );

      expect(events).toHaveLength(0);
    });

    it('spot: an empty book side keeps the last known price for that side', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);

      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { symbol: 'BTCUSDT', lastPrice: '100' } })
      );
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          data: { b: [['99', '1']], a: [['101', '1']] },
        })
      );
      handleMessage(
        manager,
        JSON.stringify({ topic: 'orderbook.1.BTCUSDT', data: { b: [], a: [['102', '1']] } })
      );

      expect(events.at(-1)?.data).toMatchObject({ bid: 99, ask: 102 });
    });

    it('linear: parses mark/index price and funding, merging deltas field by field', () => {
      const manager = new BybitWebSocketManager(false, 'linear');
      const events = tickers(manager);

      // Trimmed from a real linear tickers snapshot + deltas (2026-09-26)
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          type: 'snapshot',
          data: {
            symbol: 'BTCUSDT',
            lastPrice: '83899.60',
            markPrice: '83896.67',
            indexPrice: '83936.07',
            fundingIntervalHour: '8',
            nextFundingTime: '1790380800000',
            fundingRate: '0.0001',
            bid1Price: '83899.50',
            ask1Price: '83899.60',
          },
        })
      );
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          type: 'delta',
          data: { symbol: 'BTCUSDT', bid1Price: '83899.40', bid1Size: '5.397' },
        })
      );
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'tickers.BTCUSDT',
          type: 'delta',
          data: { symbol: 'BTCUSDT', markPrice: '83899.60', indexPrice: '83937.54' },
        })
      );

      expect(events).toHaveLength(3);
      expect(events[0].data).toEqual({
        symbol: 'BTCUSDT',
        lastPrice: 83899.6,
        bid: 83899.5,
        ask: 83899.6,
        markPrice: 83896.67,
        indexPrice: 83936.07,
        fundingRate: 0.0001,
        nextFundingTime: 1790380800000,
        fundingIntervalHour: 8,
      });
      expect(events[1].data).toMatchObject({ bid: 83899.4, ask: 83899.6, markPrice: 83896.67 });
      expect(events[2].data).toMatchObject({
        lastPrice: 83899.6,
        bid: 83899.4,
        markPrice: 83899.6,
        indexPrice: 83937.54,
        fundingRate: 0.0001,
      });
    });

    it('emits nothing when an update changes no price (e.g. only the book size moved)', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);
      const book = (size: string) =>
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          data: { b: [['99', size]], a: [['101', size]] },
        });

      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: '100' } })
      );
      handleMessage(manager, book('1'));
      handleMessage(manager, book('2'));
      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: '100', volume24h: '5' } })
      );

      expect(events).toHaveLength(2);
    });

    it('ignores non-finite ticker fields instead of overwriting good state', () => {
      const manager = new BybitWebSocketManager(false, 'linear');
      const events = tickers(manager);

      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: '100', markPrice: '100' } })
      );
      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: 'NaN', markPrice: '' } })
      );

      expect(events.at(-1)?.data).toMatchObject({ lastPrice: 100, markPrice: 100 });
    });

    it('forgets quotes when the socket drops, so the post-reconnect snapshot is emitted fresh', async () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      const events = tickers(manager);
      const ws = await connected(manager);
      const snapshot = JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: '100' } });

      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          data: { b: [['99', '1']], a: [['101', '1']] },
        })
      );
      handleMessage(manager, snapshot);
      ws.close(); // abnormal drop → reconnect path

      // Same lastPrice as before the drop: still emitted, and without the pre-drop bid/ask
      handleMessage(manager, snapshot);

      expect(events).toHaveLength(2);
      expect(events[1].data).toEqual({ symbol: 'BTCUSDT', lastPrice: 100, bid: null, ask: null });
      manager.disconnect();
    });

    it('drops ticker state for a symbol once its last subscription is removed', () => {
      const manager = new BybitWebSocketManager(false, 'spot');
      manager.subscribe('tickers', 'BTCUSDT');
      const events = tickers(manager);

      handleMessage(
        manager,
        JSON.stringify({ topic: 'tickers.BTCUSDT', data: { lastPrice: '100' } })
      );
      manager.unsubscribe('tickers', 'BTCUSDT');
      // A book update now has no lastPrice to merge into → no ticker
      handleMessage(
        manager,
        JSON.stringify({
          topic: 'orderbook.1.BTCUSDT',
          data: { b: [['99', '1']], a: [['101', '1']] },
        })
      );

      expect(events).toHaveLength(1);
    });
  });
});
