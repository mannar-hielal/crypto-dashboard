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
import { paneStores, lastKnownPrices } from '@/store/paneStore';
import { INTERVAL_FETCH_LIMIT, type Interval } from '@/lib/markets';

const RECONNECT_DELAY_MS = 3_000;

/**
 * If no bar or ticker message arrives within this window the client-side WS is
 * force-closed so the onclose handler can trigger a reconnect and pick up a
 * fresh snapshot.  This handles the case where the server's upstream Bybit
 * connection is dead (no data flows but the client TCP socket stays open).
 */
const DATA_TIMEOUT_MS = 30_000; // 30 s — well below any proxy idle-timeout

// ─── Single pane feed ─────────────────────────────────────────────────────────

function useSinglePaneFeed(
  paneIndex: 0 | 1 | 2 | 3,
  symbol: string,
  interval: Interval,
  isActive: boolean
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        }
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

    // ── Active: connect — old candles stay visible until new data arrives ────
    // Intentionally NOT calling reset() here: clearing bars synchronously
    // would flash a blank canvas before WS/REST data loads.  setSnapshot
    // replaces old bars atomically when the first response arrives.

    // Step 1: historical REST fetch (fills chart before WS is ready)
    // Only applies if the WS hasn't already sent its initial snapshot — the
    // WS snapshot is authoritative (it includes indicators) and we don't want
    // to overwrite live bars the WS may have already sent.
    marketApi
      .getCandles(symbol, interval, INTERVAL_FETCH_LIMIT[interval])
      .then((res) => {
        if (!cancelled && !store.getState().wsSnapshotReceived) {
          const last = res.candles[res.candles.length - 1];
          if (last) lastKnownPrices.set(symbol, last.close);
          store.getState().setSnapshot(res.candles, null);
        }
      })
      .catch((err) => {
        console.error('[usePaneFeeds] Failed to fetch historical candles:', err);
      });

    // Step 2: WebSocket live feed
    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(marketApi.wsUrl(symbol, interval));
      wsRef.current = ws;

      // ── Data-staleness watchdog ──────────────────────────────────────────────
      // If no bar/ticker message arrives within DATA_TIMEOUT_MS the upstream
      // Bybit connection on the server is likely dead.  Force-close so onclose
      // triggers a reconnect and fetches a fresh snapshot.
      // A self-resetting setTimeout is used instead of setInterval — it only
      // fires once after a period of silence, eliminating continuous polling.
      function scheduleWatchdog() {
        dataWatchdogRef.current = setTimeout(() => {
          ws.close(); // onclose → reconnect
        }, DATA_TIMEOUT_MS);
      }
      scheduleWatchdog();

      ws.onopen = () => {
        if (!cancelled) store.getState().setConnected(true);
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        if (cancelled) return;
        // Reset the watchdog on every message — push the deadline forward.
        clearTimeout(dataWatchdogRef.current ?? undefined);
        scheduleWatchdog();
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          if (msg.type === 'snapshot') {
            store.getState().setWsSnapshotReceived(true);
            const last = msg.bars[msg.bars.length - 1];
            if (last) lastKnownPrices.set(symbol, last.kline.close);
            store.getState().setSnapshot(
              msg.bars.map((b) => b.kline),
              last?.indicators ?? null
            );
          } else if (msg.type === 'bar') {
            lastKnownPrices.set(symbol, msg.bar.kline.close);
            store.getState().addBar(msg.bar);
          } else if (msg.type === 'ticker') {
            lastKnownPrices.set(symbol, msg.lastPrice);
            store.getState().setBidAsk(msg.bid, msg.ask, msg.lastPrice);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (dataWatchdogRef.current) {
          clearTimeout(dataWatchdogRef.current);
          dataWatchdogRef.current = null;
        }
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
      if (dataWatchdogRef.current) {
        clearTimeout(dataWatchdogRef.current);
        dataWatchdogRef.current = null;
      }
      if (wsRef.current) {
        // 🔐 Null ALL handlers before closing so no stale callback (onopen,
        // onmessage, onerror, onclose) can fire on the old socket after cleanup.
        // onclose = null specifically prevents the auto-reconnect timer from
        // firing after an intentional teardown.
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null; // prevents reconnect; dataWatchdog already cleared above
        // For OPEN sockets, close immediately.
        // For CONNECTING sockets, setting a one-shot onopen that closes after
        // the handshake avoids the "WebSocket closed before the connection is
        // established" warning that browsers (and MetaMask's inpage.js) emit
        // when .close() is called while readyState is still 0.
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close(); // close cleanly once handshake completes
        }
        wsRef.current = null;
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
