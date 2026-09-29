/**
 * /api/paper on a real Postgres (T2i, test plan roadmap P1): the concurrency and atomicity the
 * route tests can't see with a mocked Prisma.
 *
 * Two app instances on one database stand in for two Fly machines: each has its own
 * TradingService, so its per-user queue can't serialise the other's writes and only the
 * `Account.version` check keeps them apart. The market is the test's: `bybit.getTicker` serves a
 * fixed book.
 */

import type { FastifyInstance } from 'fastify';
import { Decimal } from '@prisma/client/runtime/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { cleanDatabase, createUser } from './db.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

let a: FastifyInstance;
let b: FastifyInstance;
let db: PrismaClient;
let userId: string;
let headers: { authorization: string };

/** A fixed Bybit book on both instances: last = bid = ask = mark = index = 50,000 */
function serveBook(app: FastifyInstance, price = 50_000): void {
  vi.spyOn(app.bybit, 'getTicker').mockImplementation((category, symbol) => ({
    category,
    symbol,
    lastPrice: price,
    bid: price,
    ask: price,
    markPrice: price,
    indexPrice: price,
  }));
  vi.spyOn(app.bybit, 'quoteSeenAt').mockImplementation(() => Date.now());
}

const order = (qty: string, extra: Record<string, unknown> = {}) => ({
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'market',
  qty,
  ...extra,
});

async function account() {
  return db.account.findUniqueOrThrow({ where: { userId } });
}

beforeAll(async () => {
  a = await buildApp();
  b = await buildApp();
  await Promise.all([a.ready(), b.ready()]);
  db = a.prisma;
});

afterAll(async () => {
  await cleanDatabase(db);
  await Promise.all([a.close(), b.close()]);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  serveBook(a);
  serveBook(b);
  await cleanDatabase(db);
  userId = await createUser(db);
  headers = { authorization: `Bearer ${a.jwt.sign({ userId, email: 'int@example.test' })}` };
  // The account exists before the race (first use creates it)
  expect((await a.inject({ method: 'GET', url: '/api/paper/state', headers })).statusCode).toBe(
    200
  );
});

describe('/api/paper on Postgres — concurrent writes (NEW-13-2)', () => {
  const place = (app: FastifyInstance) =>
    app.inject({ method: 'POST', url: '/api/paper/orders', headers, payload: order('0.01') });
  const versionOf = (r: { json(): unknown }) =>
    (r.json() as { delta: { account: { version: number } } }).delta.account.version;

  it('[13.3.8] two orders for one account sent at once to two machines both apply, a version each', async () => {
    const before = await account();
    const results = await Promise.all([place(a), place(b)]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results.map(versionOf).sort()).toEqual([before.version + 1, before.version + 2]);
    expect((await account()).version).toBe(before.version + 2);
    const positions = await db.position.findMany({ where: { userId } });
    expect(positions.map((p) => p.quantity.toString())).toEqual(['0.02']);
  });

  it('[13.3.8] a burst across two machines loses no update: each accepted order applied once, a refused one left nothing', async () => {
    const before = await account();
    const results = await Promise.all([a, b, a, b, a, b].map(place));
    // Under this contention an order can run out of retries: 409 "Account changed — please retry"
    for (const r of results) expect([200, 409], r.body).toContain(r.statusCode);
    const accepted = results.filter((r) => r.statusCode === 200);
    expect(accepted.length).toBeGreaterThanOrEqual(2);

    const after = await account();
    expect(after.version).toBe(before.version + accepted.length);
    // Every accepted write was based on a different account version
    expect(new Set(accepted.map(versionOf)).size).toBe(accepted.length);
    expect(await db.order.count({ where: { userId, status: 'FILLED' } })).toBe(accepted.length);
    const [position] = await db.position.findMany({ where: { userId } });
    expect(position?.quantity.toString()).toBe(
      (0.01 * accepted.length).toFixed(2).replace(/0$/, '')
    );
  });
});

describe('/api/paper on Postgres — a manual close racing the TP (NEW-1-2)', () => {
  it('[1.7.13] closes the position once: one Closed P&L row, the balance counted once', async () => {
    const placed = await a.inject({
      method: 'POST',
      url: '/api/paper/orders',
      headers,
      payload: order('0.1', { takeProfit: '52000' }),
    });
    expect(placed.statusCode).toBe(200);
    const [pos] = await db.position.findMany({ where: { userId } });
    const positionId = pos!.refId ?? pos!.id;
    const opened = await account();

    // The price reaches the TP: machine B's engine fires it while the user closes on machine A
    serveBook(a, 52_000);
    serveBook(b, 52_000);
    const [close, tp] = await Promise.all([
      a.inject({ method: 'POST', url: `/api/paper/positions/${positionId}/close`, headers }),
      b.trading.runTrigger(userId, {
        kind: 'exit',
        positionId,
        leg: 'take-profit',
        price: new Decimal(52_000),
      }),
    ]);
    // Exactly one of them closed it; the other found no position (a 404, or no trigger)
    const closedByUser = close.statusCode === 200;
    expect(Number(closedByUser) + Number(tp !== null)).toBe(1);
    if (!closedByUser) expect(close.statusCode).toBe(404);

    expect(await db.position.count({ where: { userId } })).toBe(0);
    const closes = await db.trade.findMany({ where: { userId, execType: 'Trade' } });
    expect(closes).toHaveLength(1);
    const after = await account();
    // Realised P&L moved by exactly one close (the row's P&L is net of the close fee, the
    // account's also of the open fee)
    expect(after.realizedPnl.toString()).toBe(
      opened.realizedPnl.plus(closes[0]!.pnl).minus(closes[0]!.openFee).toString()
    );
    expect(after.version).toBe(opened.version + 1);
  });
});

describe('/api/paper on Postgres — a write failing inside the transaction (NEW-18-2)', () => {
  it('[18.9] rolls every write back, answers a bare 500, and the retry works', async () => {
    const placed = await a.inject({
      method: 'POST',
      url: '/api/paper/orders',
      headers,
      payload: order('0.1'),
    });
    expect(placed.statusCode).toBe(200);
    const [pos] = await db.position.findMany({ where: { userId } });
    const positionId = pos!.refId ?? pos!.id;
    const before = await account();
    const tradesBefore = await db.trade.count({ where: { userId } });

    // The close's last write (its journal line) fails, after the position, trade, order and
    // account writes in the same transaction already ran
    const realTransaction = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
      ...rest: unknown[]
    ) =>
      realTransaction(
        (tx: PrismaClient) =>
          fn(
            new Proxy(tx, {
              get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (prop !== 'journalEntry') return value;
                return new Proxy(value as object, {
                  get(model, method, r) {
                    if (method === 'create') {
                      return async () => {
                        throw new Error('injected write failure');
                      };
                    }
                    return Reflect.get(model, method, r);
                  },
                });
              },
            })
          ),
        ...rest
      )) as never);

    const failed = await a.inject({
      method: 'POST',
      url: `/api/paper/positions/${positionId}/close`,
      headers,
    });
    expect(spy).toHaveBeenCalled();
    expect(failed.statusCode).toBe(500);
    // 🔐 Nothing about the failure reaches the client
    expect(failed.json()).toEqual({ error: 'Internal Server Error' });

    // Nothing half-applied
    const after = await account();
    expect(after.version).toBe(before.version);
    expect(after.availableBalance.toString()).toBe(before.availableBalance.toString());
    expect(after.realizedPnl.toString()).toBe(before.realizedPnl.toString());
    expect(await db.position.count({ where: { userId } })).toBe(1);
    expect(await db.trade.count({ where: { userId } })).toBe(tradesBefore);

    // The same request succeeds once the database does
    const retried = await a.inject({
      method: 'POST',
      url: `/api/paper/positions/${positionId}/close`,
      headers,
    });
    expect(retried.statusCode).toBe(200);
    expect(await db.position.count({ where: { userId } })).toBe(0);
  });
});
