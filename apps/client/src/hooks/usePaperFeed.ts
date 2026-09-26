/**
 * usePaperFeed — the private paper-trading WebSocket (BYBIT_PARITY_PLAN BP-1).
 *
 * Opens /api/paper/ws for the signed-in user, authenticates with the first message (never a
 * token in the URL), hydrates paperStore from the snapshot and applies every pushed delta:
 * the user's own actions from other tabs, and fills / TP-SL hits the server executed — even
 * while the tab was closed. Server-decided sounds (fill, profit, loss) play here, once per change.
 *
 * Reconnects with backoff. A 4401 close (token expired/invalid) refreshes the token first.
 * Mount once in DashboardPage, inside TradingSoundProvider.
 */

import { useEffect, useRef } from 'react';
import { paperApi, type PaperSound, type WsPaperMessage } from '@crypto-dashboard/sdk';
import { useAuthStore } from '@/store/authStore';
import { setPaperSoundHandler, usePaperStore } from '@/store/paperStore';
import { refreshAccessToken } from '@/lib/session';
import { useSoundActions } from '@/hooks/TradingSoundContext';

const WS_CLOSE_UNAUTHORIZED = 4401;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function usePaperFeed(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { playOrderPlaced, playOrderQueued, playOrderFilled, playProfit, playLoss } =
    useSoundActions();

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef(accessToken);

  // ── Sounds decided by the server ──────────────────────────────────────────
  useEffect(() => {
    setPaperSoundHandler((sound: PaperSound) => {
      switch (sound) {
        case 'placed':
          return playOrderPlaced();
        case 'queued':
          return playOrderQueued();
        case 'filled':
          return playOrderFilled();
        case 'profit':
          return playProfit();
        case 'loss':
          return playLoss();
      }
    });
    return () => setPaperSoundHandler(null);
  }, [playOrderPlaced, playOrderQueued, playOrderFilled, playProfit, playLoss]);

  // ── Keep the socket's auth current when the token is refreshed ────────────
  useEffect(() => {
    tokenRef.current = accessToken;
    const ws = wsRef.current;
    if (accessToken && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
    }
  }, [accessToken]);

  // ── One socket per signed-in user ─────────────────────────────────────────
  useEffect(() => {
    // 🔐 A new (or no) user never sees the previous user's account
    usePaperStore.getState().clear();
    if (!userId) return;

    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Expired / invalid token: reconnect only once a fresh token exists — reconnecting with the
     * same token would just be rejected again. A transient refresh failure retries with backoff;
     * a 401 signs the user out and the user effect tears this down.
     */
    const recoverAuth = () => {
      void refreshAccessToken().then((token) => {
        if (cancelled) return;
        if (token) {
          attempt = 0;
          connect();
        } else if (useAuthStore.getState().user) {
          const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
          attempt += 1;
          reconnectTimer = setTimeout(recoverAuth, delay);
        }
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(paperApi.wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const token = tokenRef.current;
        if (token) ws.send(JSON.stringify({ type: 'auth', token }));
        else ws.close();
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        if (cancelled) return;
        let msg: WsPaperMessage;
        try {
          msg = JSON.parse(e.data) as WsPaperMessage;
        } catch {
          return; // ignore malformed messages
        }
        const store = usePaperStore.getState();
        if (msg.type === 'snapshot') {
          attempt = 0;
          store.hydrate(msg.state);
        } else if (msg.type === 'delta') {
          store.applyDelta(msg.delta, msg.sound);
        } else if (msg.type === 'prices' && Array.isArray(msg.items)) {
          store.applyPrices(msg.items);
        }
      };

      ws.onclose = (e: CloseEvent) => {
        if (cancelled) return;
        wsRef.current = null;
        usePaperStore.setState({ isSyncing: true });
        if (e.code === WS_CLOSE_UNAUTHORIZED) {
          recoverAuth();
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // REST fallback: load the account even if the socket can't connect (blocked proxy, …),
    // retrying with backoff until something has loaded it. hydrate() is version-gated, so
    // whichever of this and the WS snapshot is newer wins.
    let loadAttempt = 0;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;
    const loadAccount = () => {
      if (cancelled || !usePaperStore.getState().isSyncing) return;
      void usePaperStore
        .getState()
        .resync()
        .then(() => {
          if (cancelled || !usePaperStore.getState().isSyncing) return;
          const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** loadAttempt);
          loadAttempt += 1;
          loadTimer = setTimeout(loadAccount, delay);
        });
    };
    loadAccount();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (loadTimer) clearTimeout(loadTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        // 🔐 Null the handlers first so the intentional close can't schedule a reconnect
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) ws.close();
        else if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      }
    };
  }, [userId]);
}
