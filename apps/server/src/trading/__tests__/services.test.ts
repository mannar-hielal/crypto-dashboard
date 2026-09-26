/**
 * Service-layer tests for the BP-1 engine: TradingService, MatchingEngine, AccountRepository.
 * No database, network or Bybit feed: every dependency is an in-memory fake.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  STARTING_BALANCE,
  applyDelta,
  type AccountState,
  type Candle,
  type Delta,
} from '../engine/index.js';
import {
  AccountRepository,
  RecordNotFoundError,
  VersionConflictError,
  isEmptyDelta,
  type LoadedAccount,
} from '../AccountRepository.js';
import { PaperEventBus, type PaperEvent } from '../PaperEventBus.js';
import { TradingError, TradingService, WAITING_FOR_PRICE } from '../TradingService.js';
import { MatchingEngine, type LeaseStore, type TickUpdate } from '../MatchingEngine.js';

const D = (n: number) => new Decimal(n);

function freshState(): AccountState {
  return {
    balance: D(STARTING_BALANCE),
    realizedPnl: D(0),
    leverage: 1,
    positions: [],
    pendingOrders: [],
  };
}

/** In-memory AccountRepository.mutate: one account, optimistic version, optional forced conflicts. */
class FakeRepo {
  state = freshState();
  version = 0;
  conflictsLeft = 0;
  writes = 0;

  async mutate<T extends { delta: Delta }>(
    _userId: string,
    decide: (loaded: LoadedAccount) => T | null
  ): Promise<(T & { before: AccountState; version: number; changed: boolean }) | null> {
    const loaded = { accountId: 'acc', version: this.version, state: this.state };
    const outcome = decide(loaded);
    if (!outcome) return null;
    if (isEmptyDelta(outcome.delta, this.state)) {
      return { ...outcome, before: this.state, version: this.version, changed: false };
    }
    if (this.conflictsLeft > 0) {
      this.conflictsLeft--;
      throw new VersionConflictError();
    }
    this.writes++;
    this.version++;
    const before = this.state;
    this.state = applyDelta(this.state, outcome.delta);
    return { ...outcome, before, version: this.version, changed: true };
  }
}

// ─── TradingService ────────────────────────────────────────────────────────────

describe('TradingService', () => {
  let repo: FakeRepo;
  let events: PaperEventBus;
  let published: PaperEvent[];
  let price: Decimal | undefined;
  let trading: TradingService;

  beforeEach(() => {
    repo = new FakeRepo();
    events = new PaperEventBus();
    published = [];
    events.subscribeAll((e) => published.push(e));
    price = D(50_000);
    trading = new TradingService(
      repo as unknown as AccountRepository,
      { lastPrice: () => price },
      events
    );
  });

  it('fills a market order at the server price (not a client one) and publishes the delta', async () => {
    const out = await trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      usdtAmount: D(1_000),
    });
    expect(out.result).toBeTruthy();
    expect(repo.state.positions[0].entryPrice.toNumber()).toBe(50_000);
    expect(out.delta.account.version).toBe(1);
    expect(out.sound).toBe('placed');
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ userId: 'u1', sound: 'placed' });
    // The published state is the account after the change (for the engine's index)
    expect(published[0].state.positions).toHaveLength(1);
  });

  it('rejects a market order with 409 while there is no live price', async () => {
    price = undefined;
    await expect(
      trading.placeOrder('u1', {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: D(100),
      })
    ).rejects.toEqual(new TradingError(409, WAITING_FOR_PRICE));
    expect(repo.writes).toBe(0);
  });

  it('retries on a version conflict and succeeds', async () => {
    repo.conflictsLeft = 2;
    const out = await trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      usdtAmount: D(100),
      triggerPrice: D(49_000),
    });
    expect(out.result).toBeTruthy();
    expect(repo.writes).toBe(1);
  });

  it('gives up after 3 conflicting attempts with a 409', async () => {
    repo.conflictsLeft = 3;
    await expect(trading.setLeverage('u1', 5)).rejects.toMatchObject({ statusCode: 409 });
    expect(published).toHaveLength(0);
  });

  it('serializes one user’s concurrent actions (no lost update)', async () => {
    await Promise.all([
      trading.placeOrder('u1', {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: D(1_000),
      }),
      trading.placeOrder('u1', {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: D(2_000),
      }),
    ]);
    expect(repo.state.positions).toHaveLength(2);
    // 10000 − 1000 − 0.7 − 2000 − 1.4
    expect(repo.state.balance.toNumber()).toBeCloseTo(6_997.9);
    expect(published.map((e) => e.delta.account.version)).toEqual([1, 2]);
  });

  it('runTrigger drops a stale trigger without writing (TP changed since the tick)', async () => {
    await trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      usdtAmount: D(1_000),
      takeProfit: D(55_000),
    });
    const positionId = repo.state.positions[0].id;
    await trading.updatePositionExits('u1', positionId, D(60_000), null);
    const writesBefore = repo.writes;

    const out = await trading.runTrigger('u1', {
      kind: 'exit',
      positionId,
      leg: 'take-profit',
      price: D(55_500), // crossed the old TP, not the new one
    });
    expect(out).toBeNull();
    expect(repo.writes).toBe(writesBefore);
    expect(repo.state.positions).toHaveLength(1);
  });

  it('runTrigger executes a valid TP and plays profit', async () => {
    await trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      usdtAmount: D(1_000),
      takeProfit: D(55_000),
    });
    const positionId = repo.state.positions[0].id;
    const out = await trading.runTrigger('u1', {
      kind: 'exit',
      positionId,
      leg: 'take-profit',
      price: D(55_100),
    });
    expect(out?.sound).toBe('profit');
    expect(repo.state.positions).toHaveLength(0);
  });

  it('a queued market order fills at the price live when it executes, not when it was received', async () => {
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const blockerRunning = new Promise<void>((r) => (entered = r));
    const originalMutate = repo.mutate.bind(repo);
    let first = true;
    repo.mutate = (async (userId: string, decide: never) => {
      if (first) {
        first = false;
        entered();
        await new Promise<void>((r) => (release = r)); // an earlier action still running
      }
      return originalMutate(userId, decide);
    }) as never;

    const blocker = trading.setLeverage('u1', 2); // occupies the user's queue
    const order = trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      usdtAmount: D(1_000),
    });
    await blockerRunning;
    price = D(51_000); // the market moves while the order waits
    release();
    await blocker;
    await order;
    expect(repo.state.positions[0].entryPrice.toNumber()).toBe(51_000);
  });

  it('a no-op (cancel of an unknown order) writes nothing and pushes nothing', async () => {
    const out = await trading.cancelOrder('u1', 'does-not-exist');
    expect(out.result).toBe(false);
    expect(repo.writes).toBe(0);
    expect(repo.version).toBe(0);
    expect(published).toHaveLength(0);
  });

  it('closePosition uses the live price of the position’s symbol', async () => {
    await trading.placeOrder('u1', {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      usdtAmount: D(1_000),
    });
    price = D(55_000);
    const out = await trading.closePosition('u1', repo.state.positions[0].id);
    // 0.02 BTC × 5000
    expect(out.result?.toNumber()).toBeCloseTo(100);
  });
});

// ─── MatchingEngine ────────────────────────────────────────────────────────────

describe('MatchingEngine', () => {
  let events: PaperEventBus;
  let tickListener: ((u: TickUpdate) => void) | null;
  let runTrigger: ReturnType<typeof vi.fn>;
  let lease: LeaseStore & { holderNow: string | null };
  let fetchCandles: ReturnType<typeof vi.fn>;
  let open: Map<string, AccountState>;
  let clock: number;
  let reload: (userId: string) => AccountState | null;

  function withLimit(state: AccountState, orderId: string, trigger: number, placedAt = 0) {
    state.pendingOrders.push({
      id: orderId,
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      usdtAmount: D(100),
      triggerPrice: D(trigger),
      qty: D(0.002),
      leverage: 1,
      placedAt,
    });
    return state;
  }

  function engine(overrides: Partial<ConstructorParameters<typeof MatchingEngine>[0]> = {}) {
    return new MatchingEngine({
      trading: { runTrigger } as never,
      events,
      loadOpenTriggers: async () => open,
      reloadUser: async (userId: string) => reload(userId),
      subscribeTicker: (l) => {
        tickListener = l;
        return () => {
          tickListener = null;
        };
      },
      fetchCandles,
      lease,
      holder: 'me',
      now: () => clock,
      renewEveryMs: 1_000_000, // heartbeats driven by the test
      ...overrides,
    });
  }

  const tick = (symbol: string, lastPrice: number, category = 'spot') =>
    tickListener?.({ category, symbol, lastPrice });

  beforeEach(() => {
    events = new PaperEventBus();
    tickListener = null;
    runTrigger = vi.fn().mockResolvedValue(null);
    fetchCandles = vi.fn().mockResolvedValue([]);
    open = new Map([['u1', withLimit(freshState(), 'o1', 49_000)]]);
    clock = 1_000_000;
    reload = () => null;
    lease = {
      holderNow: null,
      tryAcquire: vi.fn(async (holder: string) => {
        if (lease.holderNow && lease.holderNow !== holder)
          return { acquired: false, lastTickAt: null };
        lease.holderNow = holder;
        return { acquired: true, lastTickAt: null };
      }),
      renew: vi.fn(async (holder: string) => lease.holderNow === holder),
      release: vi.fn(async () => {
        lease.holderNow = null;
      }),
    };
  });

  afterEach(() => vi.useRealTimers());

  it('stays inactive while another instance holds the lease (single executor)', async () => {
    lease.holderNow = 'other';
    const e = engine();
    await e.start();
    expect(e.isActive()).toBe(false);
    expect(tickListener).toBeNull();
    await e.stop();
  });

  it('fires a pending fill only for ticks of that symbol, at the tick price', async () => {
    const e = engine();
    await e.start();
    tick('ETHUSDT', 1);
    expect(runTrigger).not.toHaveBeenCalled();
    tick('BTCUSDT', 48_990);
    expect(runTrigger).toHaveBeenCalledWith('u1', {
      kind: 'fill',
      orderId: 'o1',
      price: D(48_990),
    });
    await e.stop();
  });

  it('ignores linear ticks in BP-1 (every pane trades spot)', async () => {
    const e = engine();
    await e.start();
    tick('BTCUSDT', 1, 'linear');
    expect(runTrigger).not.toHaveBeenCalled();
    await e.stop();
  });

  it('does not re-fire a trigger that is still executing (tick burst)', async () => {
    let finish: () => void = () => undefined;
    runTrigger.mockImplementation(() => new Promise<null>((r) => (finish = () => r(null))));
    const e = engine();
    await e.start();
    tick('BTCUSDT', 48_000);
    tick('BTCUSDT', 47_999);
    tick('BTCUSDT', 47_998);
    expect(runTrigger).toHaveBeenCalledTimes(1);
    finish();
    await e.stop();
  });

  it('indexes new orders from committed deltas and drops filled ones', async () => {
    open = new Map();
    const e = engine();
    await e.start();
    events.publish({
      userId: 'u2',
      delta: {} as never,
      state: withLimit(freshState(), 'o2', 30_000),
    });
    tick('BTCUSDT', 29_000);
    expect(runTrigger).toHaveBeenCalledWith('u2', expect.objectContaining({ orderId: 'o2' }));

    runTrigger.mockClear();
    events.publish({ userId: 'u2', delta: {} as never, state: freshState() });
    tick('BTCUSDT', 28_000);
    expect(runTrigger).not.toHaveBeenCalled();
    await e.stop();
  });

  it('backfills a price gap from 1m candles when ticks stop for over a minute', async () => {
    const candle: Candle = { start: 1_030_000, low: D(48_500), high: D(49_500) };
    fetchCandles.mockResolvedValue([candle]);
    const e = engine();
    await e.start();
    tick('BTCUSDT', 49_500); // no trigger
    clock += 120_000; // 2 minutes of silence
    tick('BTCUSDT', 49_600);
    await vi.waitFor(() =>
      expect(fetchCandles).toHaveBeenCalledWith('BTCUSDT', 1_000_000, 1_120_000)
    );
    await vi.waitFor(() =>
      expect(runTrigger).toHaveBeenCalledWith('u1', {
        kind: 'fill',
        orderId: 'o1',
        price: D(49_000), // backfill fills at the crossed level
      })
    );
    await e.stop();
  });

  it('backfills downtime from the previous holder’s last tick on activation', async () => {
    lease.tryAcquire = vi.fn(async () => ({ acquired: true, lastTickAt: new Date(900_000) }));
    const e = engine();
    await e.start();
    expect(fetchCandles).toHaveBeenCalledWith('BTCUSDT', 900_000, 1_000_000);
    await e.stop();
  });

  it('deactivates when the lease is lost', async () => {
    vi.useFakeTimers();
    const e = engine({ renewEveryMs: 10 });
    await e.start();
    expect(e.isActive()).toBe(true);
    lease.holderNow = 'someone-else';
    await vi.advanceTimersByTimeAsync(15);
    expect(e.isActive()).toBe(false);
    expect(tickListener).toBeNull();
    await e.stop();
  });

  it('evicts a stale trigger that did not execute (deleted account) so it is not re-fired', async () => {
    runTrigger.mockResolvedValue(null); // e.g. the account was deleted by a cascade
    reload = () => null;
    const e = engine();
    await e.start();
    tick('BTCUSDT', 48_000);
    await vi.waitFor(() => expect(runTrigger).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    tick('BTCUSDT', 47_000);
    expect(runTrigger).toHaveBeenCalledTimes(1);
    await e.stop();
  });

  it('refreshes a stale entry from the DB instead of evicting a live account', async () => {
    runTrigger.mockResolvedValue(null); // the order was edited on another machine
    reload = () => withLimit(freshState(), 'o1', 40_000);
    const e = engine();
    await e.start();
    tick('BTCUSDT', 48_000);
    await vi.waitFor(() => expect(runTrigger).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    tick('BTCUSDT', 45_000); // above the new 40k limit — no trigger
    expect(runTrigger).toHaveBeenCalledTimes(1);
    tick('BTCUSDT', 39_000);
    expect(runTrigger).toHaveBeenCalledTimes(2);
    await e.stop();
  });

  it('keeps a change committed while the index is loading (buffered, not lost)', async () => {
    let release: () => void = () => undefined;
    const e = engine({
      loadOpenTriggers: () =>
        new Promise<Map<string, AccountState>>((resolve) => {
          release = () => resolve(new Map());
        }),
    });
    const starting = e.start();
    await new Promise((r) => setTimeout(r, 0));
    // An order placed mid-load
    events.publish({
      userId: 'u3',
      delta: {} as never,
      state: withLimit(freshState(), 'o3', 30_000),
    });
    release();
    await starting;
    tick('BTCUSDT', 29_000);
    expect(runTrigger).toHaveBeenCalledWith('u3', expect.objectContaining({ orderId: 'o3' }));
    await e.stop();
  });

  it('periodically rebuilds the index from the DB (changes made on other machines)', async () => {
    vi.useFakeTimers();
    open = new Map();
    const e = engine({ resyncEveryMs: 100 });
    await e.start();
    tick('BTCUSDT', 29_000);
    expect(runTrigger).not.toHaveBeenCalled();
    open = new Map([['u9', withLimit(freshState(), 'o9', 30_000)]]); // placed via machine B
    await vi.advanceTimersByTimeAsync(150);
    tick('BTCUSDT', 29_000);
    expect(runTrigger).toHaveBeenCalledWith('u9', expect.objectContaining({ orderId: 'o9' }));
    await e.stop();
  });

  it('releases the lease on stop', async () => {
    const e = engine();
    await e.start();
    await e.stop();
    expect(lease.release).toHaveBeenCalledWith('me');
  });
});

// ─── AccountRepository ─────────────────────────────────────────────────────────

describe('AccountRepository', () => {
  function fakePrisma(accountVersionCount: number) {
    const calls: string[] = [];
    const model = (name: string) => {
      const fns = new Map<string, ReturnType<typeof vi.fn>>();
      return new Proxy(
        {},
        {
          get: (_t, method: string) => {
            let fn = fns.get(method);
            if (!fn) {
              fn = vi.fn(async (args?: { where?: unknown }) => {
                calls.push(`${name}.${method}`);
                if (name === 'account' && (method === 'findUnique' || method === 'upsert')) {
                  return {
                    id: 'acc',
                    userId: 'u1',
                    availableBalance: '10000',
                    realizedPnl: '0',
                    leverage: 1,
                    version: 3,
                  };
                }
                if (name === 'account' && method === 'updateMany') {
                  return { count: accountVersionCount, args };
                }
                if (method === 'findMany') return [];
                if (method === 'updateMany' || method === 'deleteMany') return { count: 0 };
                return {};
              });
              fns.set(method, fn);
            }
            return fn;
          },
        }
      );
    };
    const tx = {
      account: model('account'),
      position: model('position'),
      order: model('order'),
      trade: model('trade'),
      journalEntry: model('journalEntry'),
      balanceEvent: model('balanceEvent'),
    };
    const prisma = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { prisma, calls, tx };
  }

  const placeDelta = (): Delta => ({
    account: { balance: D(8_999.3), realizedPnl: D(0), leverage: 1 },
    positionsUpsert: [
      {
        id: 'p1',
        symbol: 'BTCUSDT',
        side: 'long',
        quantity: D(0.02),
        entryPrice: D(50_000),
        entryUsdtAmount: D(1_000),
        openedAt: 1,
      },
    ],
    positionsRemove: [],
    pendingUpsert: [],
    pendingRemove: [],
    orders: [
      {
        id: 'o-new',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        qty: D(0.02),
        status: 'filled',
        commission: D(0.7),
        placingTime: 1,
        closingTime: 1,
      },
      {
        id: 'o-old',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        qty: D(0.02),
        status: 'filled',
        commission: D(0.7),
        placingTime: 1,
        closingTime: 1,
      },
    ],
    trades: [],
    balanceEvents: [],
    journal: [],
    journalEdits: [],
  });

  it('bumps the account version with a where-version guard and returns the new version', async () => {
    const { prisma, tx } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    const out = await repo.mutate('u1', () => ({ delta: placeDelta(), result: 'ok' }));
    expect(out?.version).toBe(4);
    expect(tx.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc', version: 3 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      })
    );
  });

  it('throws VersionConflictError when the account changed concurrently (count 0)', async () => {
    const { prisma } = fakePrisma(0);
    const repo = new AccountRepository(prisma as never);
    await expect(
      repo.mutate('u1', () => ({ delta: placeDelta(), result: 'ok' }))
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('writes nothing when decide returns null', async () => {
    const { prisma, tx } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    expect(await repo.mutate('u1', () => null)).toBeNull();
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it('inserts history oldest-first so the newest row gets the highest seq', async () => {
    const { prisma, tx } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    await repo.mutate('u1', () => ({ delta: placeDelta(), result: 'ok' }));
    const ids = (tx.order.create as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: [{ data: { id: string } }]) => c[0].data.id
    );
    expect(ids).toEqual(['o-old', 'o-new']);
  });

  it('addresses pre-BP-1 rows by refId as well as id', async () => {
    const { prisma, tx } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    await repo.mutate('u1', () => ({
      delta: { ...placeDelta(), positionsUpsert: [], orders: [], positionsRemove: ['legacy-1'] },
      result: 'ok',
    }));
    expect(tx.position.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', OR: [{ id: { in: ['legacy-1'] } }, { refId: { in: ['legacy-1'] } }] },
    });
  });

  it('editing a note that no longer exists rolls back with RecordNotFoundError (→ 404)', async () => {
    const { prisma } = fakePrisma(1); // journalEntry.updateMany → { count: 0 }
    const repo = new AccountRepository(prisma as never);
    await expect(
      repo.mutate('u1', () => ({
        delta: {
          ...placeDelta(),
          positionsUpsert: [],
          orders: [],
          journalEdits: [{ id: 'gone', text: 'x' }],
        },
        result: true,
      }))
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('a reset wipes positions, orders, trades, journal and balance history', async () => {
    const { prisma, calls } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    await repo.mutate('u1', () => ({ delta: { ...placeDelta(), reset: true }, result: true }));
    for (const table of ['position', 'trade', 'order', 'journalEntry', 'balanceEvent']) {
      expect(calls).toContain(`${table}.deleteMany`);
    }
    expect(calls).not.toContain('position.create');
  });
});
