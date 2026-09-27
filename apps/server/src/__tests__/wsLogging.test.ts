/**
 * WebSocket connection logging: the market feed's connect / disconnect lines and the trading
 * socket's open / close lines carry the upgrade request's reqId and the visitor IP, so a
 * lingering or churning socket in `fly logs` can be tied to its request line and to a device.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PaperStateDTO } from '@crypto-dashboard/sdk';

// Every child logger shares one set of spies, so route logs can be inspected
const logSpy = vi.hoisted(() => {
  const calls: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  const make = (level: string) =>
    vi.fn((obj: Record<string, unknown>, msg: string) => void calls.push({ level, obj, msg }));
  const child: Record<string, unknown> = {
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    debug: make('debug'),
    trace: make('trace'),
    fatal: make('fatal'),
  };
  child.child = () => child;
  return { calls, child };
});

vi.mock('../logger.js', () => ({ logger: logSpy.child, default: logSpy.child }));

vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';

const STATE: PaperStateDTO = {
  account: { balance: '10000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 0 },
  positions: [],
  spotBalances: [],
  pendingOrders: [],
  orders: [],
  trades: [],
  journal: [],
  balanceEvents: [],
};

const linesFor = (msg: string) => logSpy.calls.filter((c) => c.msg === msg).map((c) => c.obj);

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
}

describe('WebSocket connection logging', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    logSpy.calls.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('market feed: connect and disconnect carry the reqId and visitor IP, with the close code and duration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const ws = await app.injectWS('/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m');
    await until(() => linesFor('Client connected to live feed').length > 0);
    const [connected] = linesFor('Client connected to live feed');
    // The field is always there (injected sockets have no peer address, so its value is empty here)
    expect(connected).toHaveProperty('clientIp');
    expect(connected).toMatchObject({
      reqId: expect.any(String),
      category: 'linear',
      symbol: 'BTCUSDT',
      interval: '1m',
    });
    ws.terminate();
    await until(() => linesFor('Client disconnected from live feed').length > 0);
    const [disconnected] = linesFor('Client disconnected from live feed');
    expect(disconnected).toMatchObject({
      reqId: connected.reqId,
      clientIp: connected.clientIp,
      symbol: 'BTCUSDT',
      durationMs: expect.any(Number),
    });
    expect(disconnected).toHaveProperty('code');
  });

  it('trading socket: logs the authenticated open and the close, tied by reqId', async () => {
    vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue(STATE);
    const ws = await app.injectWS('/api/paper/ws');
    ws.send(
      JSON.stringify({ type: 'auth', token: app.jwt.sign({ userId: 'u-log', email: 'u@x.test' }) })
    );
    await until(() => linesFor('Paper WS connected').length > 0);
    const [opened] = linesFor('Paper WS connected');
    expect(opened).toMatchObject({
      reqId: expect.any(String),
      userId: 'u-log',
    });
    expect(opened).toHaveProperty('clientIp');
    ws.terminate();
    await until(() => linesFor('Paper WS closed').length > 0);
    expect(linesFor('Paper WS closed')[0]).toMatchObject({
      reqId: opened.reqId,
      clientIp: opened.clientIp,
      authenticated: true,
      userId: 'u-log',
      durationMs: expect.any(Number),
    });
  });

  it('trading socket: an invalid token logs the 4401 close code and its reason', async () => {
    const ws = await app.injectWS('/api/paper/ws');
    ws.send(JSON.stringify({ type: 'auth', token: 'not-a-jwt' }));
    await until(() => linesFor('Paper WS closed').length > 0);
    expect(linesFor('Paper WS closed')).toEqual([
      expect.objectContaining({ authenticated: false, code: 4401, reason: expect.any(String) }),
    ]);
    ws.terminate();
  });

  it('trading socket: a server-closed socket logs one unauthenticated close with the code and reason', async () => {
    const ws = await app.injectWS('/api/paper/ws');
    ws.send(JSON.stringify({ type: 'subscribe' })); // unexpected first message → 1008
    await until(() => linesFor('Paper WS closed').length > 0);
    const closes = linesFor('Paper WS closed');
    expect(closes).toHaveLength(1);
    // A close the server initiates carries the code and reason it sent (review #154)
    expect(closes[0]).toMatchObject({
      authenticated: false,
      code: 1008,
      reason: 'Unexpected message',
    });
    expect(closes[0]).not.toHaveProperty('userId');
    expect(linesFor('Paper WS connected')).toHaveLength(0);
    ws.terminate();
  });
});
