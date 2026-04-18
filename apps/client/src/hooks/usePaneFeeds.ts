/**
 * usePaneFeeds
 *
 * Manages up to 4 independent WebSocket + REST connections — one per chart pane.
 * Each connection feeds its data into the corresponding paneStore.
 *
 * Only panes within the current layout's pane count are connected;
 * inactive panes are disconnected and their store data is reset.
 *
 * Pattern: 4 unconditional useSinglePaneFeed calls (hooks rule compliant).
 * The `isActive` flag controls whether the feed connects or stays idle.
 */

import { useEffect, useRef } from 'react';
import { marketApi, type WsMessage } from '@crypto-dashboard/sdk';
import { useLayoutStore, LAYOUT_PANE_COUNT } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { INTERVAL_FETCH_LIMIT, type Interval } from '@/lib/markets';

const RECONNECT_DELAY_MS = 3_000;

// ─── Single pane feed ─────────────────────────────────────────────────────────

function useSinglePaneFeed(
  paneIndex: 0 | 1 | 2 | 3,
  symbol: string,
  interval: Interval,
  isActive: boolean
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Per-run cancellation flag captured by closure — NOT a shared ref.
    // isMountedRef.current was previously set to `true` at the START of every
    // effect run, including the inactive (cleanup-only) run that fires when
    // isActive becomes false. That meant an in-flight REST promise from the
    // previous active run would see isMountedRef.current === true and still
    // update the store. Using a closure variable avoids the race completely:
    // old async work captures its own `cancelled` and the new effect run
    // creates a fresh variable without disturbing the old closure.
    let cancelled = false;
    const store = paneStores[paneIndex];

    // ── Pane is not visible in current layout → disconnect + clear ──────────
    if (!isActive) {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      store.getState().reset();
      return () => {
        cancelled = true;
      };
    }

    // ── Active: reset stale data, then connect ───────────────────────────────
    store.getState().reset();

    // Step 1: historical REST fetch (fills chart before WS is ready)
    marketApi
      .getCandles(symbol, interval, INTERVAL_FETCH_LIMIT[interval])
      .then((res) => {
        if (!cancelled) store.getState().setSnapshot(res.candles, null);
      })
      .catch(() => {});

    // Step 2: WebSocket live feed
    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(marketApi.wsUrl(symbol, interval));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) store.getState().setConnected(true);
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          if (msg.type === 'snapshot') {
            const last = msg.bars[msg.bars.length - 1];
            store.getState().setSnapshot(
              msg.bars.map((b) => b.kline),
              last?.indicators ?? null
            );
          } else if (msg.type === 'bar') {
            store.getState().addBar(msg.bar);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        store.getState().setConnected(false);
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // 🔐 prevent reconnect on intentional close
        wsRef.current.close();
      }
      store.getState().setConnected(false);
    };
  }, [paneIndex, symbol, interval, isActive]);
}

// ─── Public hook — mounts 4 feeds (hook call count is always 4) ──────────────

export function usePaneFeeds() {
  const layout = useLayoutStore((s) => s.layout);
  const panes = useLayoutStore((s) => s.panes);
  const count = LAYOUT_PANE_COUNT[layout];

  useSinglePaneFeed(0, panes[0].symbol, panes[0].interval, count > 0);
  useSinglePaneFeed(1, panes[1].symbol, panes[1].interval, count > 1);
  useSinglePaneFeed(2, panes[2].symbol, panes[2].interval, count > 2);
  useSinglePaneFeed(3, panes[3].symbol, panes[3].interval, count > 3);
}
