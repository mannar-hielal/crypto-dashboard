/**
 * Private paper-trading WebSocket — GET /api/paper/ws (BYBIT_PARITY_PLAN BP-1).
 *
 * Pushes the user's account snapshot on auth, then every committed delta (orders, fills, TP/SL
 * hits, funding later) to all of that user's open tabs — including changes the engine makes
 * while no tab is open, which the next connection picks up in its snapshot.
 *
 * BP-2: also pushes, at most once a second, the live price of every market the user holds or has
 * orders on (`prices`), so PnL is live for symbols no chart pane is showing.
 *
 * 🔐 Auth: the first message must be `{ type: 'auth', token }` (the same JWT as REST) within
 *    AUTH_TIMEOUT_MS. Never a token in the URL — URLs end up in logs and browser history
 *    (web.md). A refreshed token can be re-sent at any time; when the current one expires the
 *    socket closes with 4401 and the client reconnects with a fresh token.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { Decimal } from '@prisma/client/runtime/client';
import type { MarketCategory, PaperPriceDTO, WsPaperMessage } from '@crypto-dashboard/sdk';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const log = logger.child({ route: 'paperWs' });

// 🔐 Caps: the socket is reachable before auth, so bound it globally, per IP and per user
const MAX_CONNECTIONS = 500;
const MAX_PER_IP = 20;
const MAX_PER_USER = 5;
const AUTH_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_BYTES = 4 * 1024; // an auth message is well under 1 KB
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const PRICES_EVERY_MS = 1_000;

type MarketKey = `${MarketCategory}:${string}`;

/** The markets an account's PnL depends on: its positions, resting orders and coin balances. */
export function marketsOf(account: {
  positions: { category: MarketCategory; symbol: string }[];
  pendingOrders: { category: MarketCategory; symbol: string }[];
  spot: { coin: string; free: { toString(): string }; locked: { toString(): string } }[];
}): Set<MarketKey> {
  const keys = new Set<MarketKey>();
  for (const p of account.positions) keys.add(`${p.category}:${p.symbol}`);
  for (const o of account.pendingOrders) keys.add(`${o.category}:${o.symbol}`);
  for (const h of account.spot) {
    // Decimal, never Number: a tiny balance must not round to zero and drop its price feed
    if (new Decimal(h.free.toString()).plus(h.locked.toString()).gt(0)) {
      keys.add(`spot:${h.coin}USDT`);
    }
  }
  return keys;
}

export const WS_CLOSE_UNAUTHORIZED = 4401;

const active = new Set<WebSocket>();
const perIp = new Map<string, number>();
const perUser = new Map<string, number>();

function bump(map: Map<string, number>, key: string, by: number): void {
  const next = (map.get(key) ?? 0) + by;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}

export async function privatePaperWs(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    const ip = request.ip;

    // 🔐 Cross-site WebSocket hijacking guard for browsers (which always send Origin): another site's
    //    page can't open this socket. Non-browser clients can omit Origin — that's fine: the real
    //    gate is the JWT in the first message, which a third-party page can't obtain.
    const origin = request.headers.origin;
    if (origin && origin !== config.corsOrigin) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    if (active.size >= MAX_CONNECTIONS || (perIp.get(ip) ?? 0) >= MAX_PER_IP) {
      socket.close(1013, 'Connection limit reached');
      return;
    }
    active.add(socket);
    bump(perIp, ip, 1);

    let userId: string | null = null;
    let unsubscribe: (() => void) | null = null;
    // Markets this account's PnL depends on, and the last price sent for each — bounded by
    // 2 categories × ALLOWED_SYMBOLS (the only markets an account can hold)
    let markets = new Set<MarketKey>();
    const sentPrices = new Map<MarketKey, string>();
    let pricesTimer: NodeJS.Timeout | null = null;
    let expiryTimer: NodeJS.Timeout | null = null;
    let pongTimer: NodeJS.Timeout | null = null;
    let released = false;

    const send = (message: WsPaperMessage) => {
      if (socket.readyState === 1 /* OPEN */) socket.send(JSON.stringify(message));
    };

    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(authTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      if (pongTimer) clearTimeout(pongTimer);
      if (pricesTimer) clearInterval(pricesTimer);
      clearInterval(pingTimer);
      unsubscribe?.();
      unsubscribe = null;
      active.delete(socket);
      bump(perIp, ip, -1);
      if (userId) bump(perUser, userId, -1);
    };

    /** Send the prices that changed since the last push (nothing when none did). */
    const pushPrices = () => {
      const items: PaperPriceDTO[] = [];
      for (const key of markets) {
        const [category, symbol] = key.split(':') as [MarketCategory, string];
        const t = app.bybit.getTicker(category, symbol);
        if (!t || !Number.isFinite(t.lastPrice)) continue;
        const mark = category === 'linear' ? t.markPrice : undefined;
        const stamp = `${t.lastPrice}|${mark ?? ''}`;
        if (sentPrices.get(key) === stamp) continue;
        sentPrices.set(key, stamp);
        items.push({ category, symbol, last: t.lastPrice, ...(mark ? { mark } : {}) });
      }
      for (const key of sentPrices.keys()) if (!markets.has(key)) sentPrices.delete(key);
      if (items.length) send({ type: 'prices', items });
    };

    const closeUnauthorized = (reason: string) => {
      socket.close(WS_CLOSE_UNAUTHORIZED, reason);
      release();
    };

    const authTimer = setTimeout(() => {
      if (!userId) closeUnauthorized('Auth timeout');
    }, AUTH_TIMEOUT_MS);

    // Keepalive: ping every 30 s, drop the socket if no pong within 10 s
    const pingTimer = setInterval(() => {
      if (socket.readyState !== 1) return;
      socket.ping();
      pongTimer = setTimeout(() => socket.terminate(), PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
    socket.on('pong', () => {
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = null;
    });

    const authenticate = async (token: string) => {
      let payload: { userId?: unknown; exp?: unknown };
      try {
        payload = app.jwt.verify<{ userId?: unknown; exp?: unknown }>(token);
      } catch {
        closeUnauthorized('Invalid token');
        return;
      }
      if (typeof payload.userId !== 'string') {
        closeUnauthorized('Invalid token');
        return;
      }
      if (userId && payload.userId !== userId) {
        closeUnauthorized('Token belongs to another user'); // 🔐 no account switching mid-socket
        return;
      }

      // Close when this token expires, unless a refreshed one arrives first
      if (expiryTimer) clearTimeout(expiryTimer);
      if (typeof payload.exp === 'number') {
        const ms = Math.max(0, payload.exp * 1000 - Date.now());
        expiryTimer = setTimeout(() => closeUnauthorized('Token expired'), ms);
      }
      if (userId) return; // re-auth with a fresh token: nothing else to do

      if ((perUser.get(payload.userId) ?? 0) >= MAX_PER_USER) {
        socket.close(1013, 'Too many open tabs');
        release();
        return;
      }
      userId = payload.userId;
      bump(perUser, userId, 1);
      clearTimeout(authTimer);

      // Subscribe before loading the snapshot, buffering deltas until it's sent, so nothing
      // committed in between is lost. The client applies deltas idempotently.
      const buffered: WsPaperMessage[] = [];
      let snapshotSent = false;
      unsubscribe = app.paperEvents.subscribe(userId, (event) => {
        markets = marketsOf(event.state);
        const message: WsPaperMessage = {
          type: 'delta',
          delta: event.delta,
          ...(event.sound ? { sound: event.sound } : {}),
        };
        if (snapshotSent) send(message);
        else buffered.push(message);
      });
      try {
        const state = await app.paperRepository.snapshot(userId);
        if (released) return; // closed while the snapshot loaded — start no timer
        send({ type: 'snapshot', state });
        snapshotSent = true;
        for (const message of buffered) send(message);
        if (!buffered.length) {
          markets = marketsOf({ ...state, spot: state.spotBalances });
        }
        pushPrices();
        pricesTimer = setInterval(pushPrices, PRICES_EVERY_MS);
      } catch (err) {
        log.error({ err }, 'Paper WS snapshot failed');
        socket.close(1011, 'Internal error');
        release();
      }
    };

    socket.on('message', (raw: Buffer) => {
      // 🔐 Size guard before JSON.parse
      if (raw.length > MAX_MESSAGE_BYTES) {
        socket.close(1009, 'Message too large');
        release();
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.close(1008, 'Malformed message');
        release();
        return;
      }
      const m = message as { type?: unknown; token?: unknown };
      if (m.type === 'auth' && typeof m.token === 'string' && m.token.length <= 2048) {
        void authenticate(m.token);
        return;
      }
      socket.close(1008, 'Unexpected message');
      release();
    });

    socket.on('close', release);
    socket.on('error', (err: Error) => {
      log.error({ err }, 'Paper WS error');
      release();
    });
  });
}
