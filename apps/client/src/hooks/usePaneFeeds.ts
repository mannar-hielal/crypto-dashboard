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
import { marketApi, type MarketCategory, type WsMessage } from '@crypto-dashboard/sdk';
import { useLayoutStore, LAYOUT_PANE_COUNT } from '@/store/layoutStore';
import { paneStores, setLastKnownPrice } from '@/store/paneStore';
import { INTERVAL_FETCH_LIMIT, type Interval } from '@/lib/markets';

const RECONNECT_DELAY_MS = 3_000;

/**
 * If no bar or ticker message arrives within this window the client-side WS is
 * force-closed so the onclose handler can trigger a reconnect and pick up a
 * fresh snapshot.  This handles the case where the server's upstream Bybit
 * connection is dead (no data flows but the client TCP socket stays open).
 */
const DATA_TIMEOUT_MS = 30_000; // 30 s — well below any proxy idle-timeout

/**
 * 🔐 Historical REST fetch retry schedule. Previously a failed fetch (network
 * blip, transient 5xx, timeout) had no retry at all: `restDataApplied` would
 * stay false for the lifetime of the connection, permanently stranding the
 * pane on the WebSocket's tiny cold-aggregator snapshot (~2-9 bars) — which
 * then renders as a compressed sliver of candles once cross-pane time-range
 * sync stretches the visible window to match a sibling pane that *did* load
 * full history. These are the fast, short-backoff retries that ride out
 * transient failures within a few seconds.
 */
const REST_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/**
 * If every fast retry above is exhausted, keep retrying at this fixed,
 * gentler cadence in the background for as long as the pane stays mounted —
 * so a longer backend/network outage still self-heals once it clears,
 * instead of requiring the user to switch symbols or reload the page.
 */
const REST_HEALING_RETRY_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Single pane feed ─────────────────────────────────────────────────────────

function useSinglePaneFeed(
  paneIndex: 0 | 1 | 2 | 3,
  category: MarketCategory,
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
    let restDataApplied = false;
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
      // 🔐 Clear the data-watchdog too — a stale watchdog firing later could
      //    close a re-created socket for a different symbol/interval.
      if (dataWatchdogRef.current) {
        clearTimeout(dataWatchdogRef.current);
        dataWatchdogRef.current = null;
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

    // Reset the WS snapshot flag so the fresh REST fetch is accepted.
    // On interval/symbol change the old flag from the previous connection
    // would block the REST response (wsSnapshotReceived && currentBars >=
    // REST count), leaving only the cold-aggregator WS snapshot (~2 bars).
    store.getState().setWsSnapshotReceived(false);
    store.getState().setHistoryLoaded(false);

    // Step 1: historical REST fetch (fills chart before WS is ready), with
    // retry — a REST failure must never permanently strand this pane on the
    // WebSocket's tiny cold-aggregator snapshot. See REST_RETRY_DELAYS_MS /
    // REST_HEALING_RETRY_DELAY_MS above for the backoff schedule.
    // Only applies if the WS hasn't already sent its initial snapshot — the
    // WS snapshot is authoritative (it includes indicators) and we don't want
    // to overwrite live bars the WS may have already sent.
    async function fetchHistoricalCandles() {
      let attempt = 0;
      while (!cancelled && !restDataApplied) {
        try {
          const res = await marketApi.getCandles(
            symbol,
            interval,
            INTERVAL_FETCH_LIMIT[interval],
            category
          );
          if (cancelled) return;
          // Use REST if the WS snapshot hasn't arrived yet, or if it has fewer
          // bars — common for higher intervals (1h/4h/1d) where the server-side
          // aggregator needs hours/days to build up history.
          const currentBars = store.getState().bars.length;
          if (!store.getState().wsSnapshotReceived || res.candles.length > currentBars) {
            const last = res.candles[res.candles.length - 1];
            if (last) setLastKnownPrice(category, symbol, last.close);
            store.getState().setSnapshot(res.candles, null);
            restDataApplied = true;
          }
          // Applied or not (the WS may already hold at least as many bars),
          // this pane now has its full history for this symbol/interval.
          store.getState().setHistoryLoaded(true);
          // Success (whether or not the data was applied) — nothing more to do.
          return;
        } catch (err) {
          const delay = REST_RETRY_DELAYS_MS[attempt] ?? REST_HEALING_RETRY_DELAY_MS;
          console.error(
            `[usePaneFeeds] Failed to fetch historical candles for ${category}:${symbol} ` +
              `(attempt ${attempt}, retrying in ${delay}ms):`,
            err
          );
          attempt++;
          if (cancelled) return;
          await sleep(delay);
        }
      }
    }
    fetchHistoricalCandles();

    // Step 2: WebSocket live feed
    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(marketApi.wsUrl(symbol, interval, category));
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
            if (last) setLastKnownPrice(category, symbol, last.kline.close);
            // If REST already loaded data (1000 bars), only update indicators
            // — don't overwrite with the WS cold-aggregator snapshot (~2-9 bars).
            // restDataApplied is a closure variable: reset per effect run (i.e. on
            // interval/symbol change), so a fresh feed always accepts the WS data.
            if (restDataApplied) {
              store.getState().setIndicators(last?.indicators ?? null);
            } else {
              store.getState().setSnapshot(
                msg.bars.map((b) => b.kline),
                last?.indicators ?? null
              );
            }
          } else if (msg.type === 'bar') {
            setLastKnownPrice(category, symbol, msg.bar.kline.close);
            store.getState().addBar(msg.bar);
          } else if (msg.type === 'ticker') {
            setLastKnownPrice(category, symbol, msg.lastPrice);
            store.getState().setTicker(msg);
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
  }, [paneIndex, category, symbol, interval, isActive]);
}

// ─── Public hook — mounts 4 feeds (hook call count is always 4) ──────────────

export function usePaneFeeds() {
  const layout = useLayoutStore((s) => s.layout);
  // Per-pane selectors — a category/symbol/interval change on one pane must not
  // re-render the feed hook (and restart effects) for the other three.
  const category0 = useLayoutStore((s) => s.panes[0].category);
  const category1 = useLayoutStore((s) => s.panes[1].category);
  const category2 = useLayoutStore((s) => s.panes[2].category);
  const category3 = useLayoutStore((s) => s.panes[3].category);
  const symbol0 = useLayoutStore((s) => s.panes[0].symbol);
  const interval0 = useLayoutStore((s) => s.panes[0].interval);
  const symbol1 = useLayoutStore((s) => s.panes[1].symbol);
  const interval1 = useLayoutStore((s) => s.panes[1].interval);
  const symbol2 = useLayoutStore((s) => s.panes[2].symbol);
  const interval2 = useLayoutStore((s) => s.panes[2].interval);
  const symbol3 = useLayoutStore((s) => s.panes[3].symbol);
  const interval3 = useLayoutStore((s) => s.panes[3].interval);
  const count = LAYOUT_PANE_COUNT[layout];

  useSinglePaneFeed(0, category0, symbol0, interval0, count > 0);
  useSinglePaneFeed(1, category1, symbol1, interval1, count > 1);
  useSinglePaneFeed(2, category2, symbol2, interval2, count > 2);
  useSinglePaneFeed(3, category3, symbol3, interval3, count > 3);
}
