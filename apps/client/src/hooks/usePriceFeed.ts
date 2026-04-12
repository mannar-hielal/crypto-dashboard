/**
 * usePriceFeed
 *
 * Manages the full lifecycle of the market data connection:
 *   1. Fetches historical candles via REST on mount
 *   2. Opens a WebSocket for live updates
 *   3. Auto-reconnects on disconnect
 *   4. Cleans up on unmount
 *
 * All data lands in marketStore — components just read from the store.
 */

import { useEffect, useRef } from 'react'; // useRef kept for wsRef + reconnectTimerRef
import { marketApi, type WsMessage } from '@crypto-dashboard/sdk';
import { useMarketStore } from '@/store/marketStore';

const RECONNECT_DELAY_MS = 3_000;

export function usePriceFeed() {
  // Individual selectors: this hook re-renders ONLY when symbol or interval
  // change (user switches timeframe). Bar updates land in the store but don't
  // cause usePriceFeed itself to re-render.
  const symbol = useMarketStore((state) => state.symbol);
  const interval = useMarketStore((state) => state.interval);
  const setSnapshot = useMarketStore((state) => state.setSnapshot);
  const addBar = useMarketStore((state) => state.addBar);
  const setConnected = useMarketStore((state) => state.setConnected);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Per-run cancellation flag — captured by closure, NOT a shared ref.
    // isMountedRef.current was set to `true` at the START of each effect run,
    // so when symbol/interval changed the cleanup set it false but the new run
    // immediately set it back to true — letting the old REST .then() fire and
    // overwrite the new symbol's data. A closure variable avoids this race.
    let cancelled = false;

    // ── Step 1: fetch historical candles (fills chart before WS is ready) ──
    marketApi
      .getCandles(symbol, interval, 500)
      .then((res) => {
        if (!cancelled) setSnapshot(res.candles, null);
      })
      .catch(() => {
        // Non-fatal — the WS snapshot will fill the chart once connected
      });

    // ── Step 2: open WebSocket ──────────────────────────────────────────────
    function connect() {
      if (cancelled) return;

      const url = marketApi.wsUrl(symbol, interval);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;

        try {
          const msg = JSON.parse(event.data) as WsMessage;

          if (msg.type === 'snapshot') {
            // Replace REST data with the richer server snapshot (includes indicators)
            const last = msg.bars[msg.bars.length - 1];
            setSnapshot(
              msg.bars.map((b) => b.kline),
              last?.indicators ?? null
            );
          } else if (msg.type === 'bar') {
            addBar(msg.bar);
          }
        } catch {
          // Ignore malformed messages — never crash on bad data
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);

        // Auto-reconnect after a delay
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        // onclose fires right after onerror — reconnect logic is handled there
        ws.close();
      };
    }

    connect();

    // ── Cleanup: close WS and cancel any pending reconnect ─────────────────
    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect firing during intentional close
        wsRef.current.close();
      }
      setConnected(false);
    };
  }, [symbol, interval, setSnapshot, addBar, setConnected]);
  // Re-runs if the user switches symbol or interval (future feature)
}
