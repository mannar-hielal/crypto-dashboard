/**
 * Service-layer tests for the server engine (BP-1, BP-2): TradingService, MatchingEngine,
 * AccountRepository. No database, network or Bybit feed: every dependency is an in-memory fake.
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
import {
  MAX_QUOTE_AGE_MS,
  TradingError,
  TradingService,
  WAITING_FOR_PRICE,
  type MarketSource,
  type TimedQuote,
} from '../TradingService.js';
import { fallbackRiskTiers, fallbackRules } from '../bybitSpec.js';
import { REJECT_LEVERAGE_LIQUIDATION, REJECT_LEVERAGE_NO_MARK } from '../engine/index.js';
import { MatchingEngine, type LeaseStore, type TickUpdate } from '../MatchingEngine.js';

const D = (n: number) => new Decimal(n);

function freshState(): AccountState {
  return {
    balance: D(STARTING_BALANCE),
    realizedPnl: D(0),
    leverage: 1,
    symbolLeverage: {},
    spot: [],
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
  /** The live quote the fake market serves (bid = ask = last unless a test says otherwise) */
  let price: Decimal | undefined;
  let book: Partial<TimedQuote>;
  let now: number;
  let trading: TradingService;

  const market: MarketSource = {
    quote: () =>
      price ? { last: price, bid: price, ask: price, seenAt: now, ...book } : undefined,
    rules: () => ({
      tickSize: D(0),
      qtyStep: D(0),
      minOrderQty: D(0),
      minNotional: D(0),
    }),
    riskTiers: (symbol) => fallbackRiskTiers(symbol),
  };

  /** A USDT Perpetual market order sized by margin (the BP-1 client's usdtAmount) */
  const market$ = (margin: number, extra: Record<string, unknown> = {}) => ({
    category: 'linear' as const,
    symbol: 'BTCUSDT',
    side: 'buy' as const,
    type: 'market' as const,
    size: { margin: D(margin) },
    ...extra,
  });

  beforeEach(() => {
    repo = new FakeRepo();
    events = new PaperEventBus();
    published = [];
    events.subscribeAll((e) => published.push(e));
    price = D(50_000);
    book = {};
    now = 1_000_000;
    trading = new TradingService(repo as unknown as AccountRepository, market, events, () => now);
  });

  it('fills a market order at the server price (not a client one) and publishes the delta', async () => {
    const out = await trading.placeOrder('u1', market$(1_000));
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
    await expect(trading.placeOrder('u1', market$(100))).rejects.toEqual(
      new TradingError(409, WAITING_FOR_PRICE)
    );
    expect(repo.writes).toBe(0);
  });

  it(`does not trade on a quote older than ${MAX_QUOTE_AGE_MS / 1000} s (stalled feed)`, async () => {
    book = { seenAt: now - MAX_QUOTE_AGE_MS - 1 };
    await expect(trading.placeOrder('u1', market$(100))).rejects.toEqual(
      new TradingError(409, WAITING_FOR_PRICE)
    );
    book = { seenAt: now - MAX_QUOTE_AGE_MS };
    await expect(trading.placeOrder('u1', market$(100))).resolves.toBeTruthy();
  });

  it('does not trade on a quote with no bid / ask yet', async () => {
    book = { bid: D(0) };
    await expect(trading.placeOrder('u1', market$(100))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('buys at the ask and sells at the bid', async () => {
    book = { bid: D(49_990), ask: D(50_010) };
    await trading.placeOrder('u1', market$(1_000));
    await trading.placeOrder('u1', market$(1_000, { symbol: 'ETHUSDT', side: 'sell' }));
    expect(repo.state.positions.map((p) => p.entryPrice.toNumber())).toEqual([50_010, 49_990]);
  });

  it('routes a spot order to the spot engine: buys coins at the ask, no position', async () => {
    book = { ask: D(50_010) };
    await trading.placeOrder('u1', {
      ...market$(0),
      category: 'spot',
      size: { qty: D('0.1') },
    });
    expect(repo.state.positions).toHaveLength(0);
    expect(repo.state.spot[0].coin).toBe('BTC');
    expect(repo.state.spot[0].free.toString()).toBe('0.0999');
    expect(repo.state.balance.toNumber()).toBeCloseTo(10_000 - 5_001);
  });

  it('refuses a spot stop order (spot takes market and limit only)', async () => {
    await expect(
      trading.placeOrder('u1', {
        ...market$(100),
        category: 'spot',
        type: 'stop',
        triggerPrice: D(51_000),
      })
    ).rejects.toEqual(new TradingError(422, 'Spot supports market and limit orders'));
    expect(repo.writes).toBe(0);
  });

  it('a spot sell with no coins is refused (no shorting, F8)', async () => {
    await expect(
      trading.placeOrder('u1', {
        ...market$(0),
        category: 'spot',
        side: 'sell',
        size: { qty: D('0.1') },
      })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.writes).toBe(0);
  });

  it("answers 422 with Bybit's message when the size rules refuse an order", async () => {
    const strict = new TradingService(
      repo as unknown as AccountRepository,
      { ...market, rules: () => fallbackRules('linear', 'BTCUSDT') },
      events,
      () => now
    );
    await expect(
      strict.placeOrder('u1', { ...market$(0), size: { qty: D('0.0001') } })
    ).rejects.toEqual(new TradingError(422, 'Order quantity lower than the minimum (0.001)'));
    expect(repo.writes).toBe(0);
    expect(published).toHaveLength(0);
  });

  it('re-margins an open position on a leverage change, using the live mark price (BP-3)', async () => {
    await trading.placeOrder('u1', market$(1_000)); // 1×: qty 0.02 @ 50,000
    // Raising leverage lowers the margin: it needs a fresh mark price to check liquidation
    await expect(trading.setSymbolLeverage('u1', 'BTCUSDT', 5)).rejects.toEqual(
      new TradingError(422, REJECT_LEVERAGE_NO_MARK)
    );
    book = { mark: D(50_000) };
    const before = repo.state.balance;
    await expect(trading.setSymbolLeverage('u1', 'BTCUSDT', 5)).resolves.toMatchObject({
      result: 5,
    });
    const pos = repo.state.positions[0];
    expect(pos.leverage).toBe(5);
    expect(pos.entryUsdtAmount.toNumber()).toBe(200);
    expect(repo.state.balance.gt(before.plus(790))).toBe(true); // ~800 of margin released
    expect(repo.state.symbolLeverage).toEqual({ BTCUSDT: 5 });
  });

  it('refuses a leverage raise the live mark price would liquidate (422)', async () => {
    await trading.placeOrder('u1', market$(1_000)); // long 0.02 @ 50,000
    // At 10× the liquidation price would be ≈ 45,149 — the mark is already below it
    book = { mark: D(45_100) };
    await expect(trading.setSymbolLeverage('u1', 'BTCUSDT', 10)).rejects.toEqual(
      new TradingError(422, REJECT_LEVERAGE_LIQUIDATION)
    );
    expect(repo.state.positions[0].leverage).toBe(1);
  });

  it('retries on a version conflict and succeeds', async () => {
    repo.conflictsLeft = 2;
    const out = await trading.placeOrder('u1', {
      ...market$(100),
      type: 'limit',
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
      trading.placeOrder('u1', market$(1_000)),
      trading.placeOrder('u1', market$(2_000)),
    ]);
    // One-way mode: both fills end up in one position (BP-3)
    expect(repo.state.positions).toHaveLength(1);
    expect(repo.state.positions[0].quantity.toNumber()).toBeCloseTo(0.06);
    // 10000 − (1000 + 0.55) − (2000 + 1.1): margin + open fee. At 1× a long's bankruptcy price is
    // 0, so Bybit's fee to close (priced there) is 0
    expect(repo.state.balance.toNumber()).toBeCloseTo(6_998.35);
    expect(published.map((e) => e.delta.account.version)).toEqual([1, 2]);
  });

  it('runTrigger drops a stale trigger without writing (TP changed since the tick)', async () => {
    await trading.placeOrder('u1', market$(1_000, { takeProfit: D(55_000) }));
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
    await trading.placeOrder('u1', market$(1_000, { takeProfit: D(55_000) }));
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

  it('runTrigger fills a stop at the live ask, and a limit at its own price', async () => {
    await trading.placeOrder('u1', { ...market$(1_000), type: 'stop', triggerPrice: D(51_000) });
    await trading.placeOrder('u1', {
      ...market$(1_000, { symbol: 'ETHUSDT' }),
      type: 'limit',
      triggerPrice: D(49_000),
    });
    const [stop, limit] = repo.state.pendingOrders;
    price = D(51_000);
    book = { ask: D(51_020) };
    await trading.runTrigger('u1', { kind: 'fill', orderId: stop.id, price: D(51_000) });
    price = D(48_900);
    book = {};
    await trading.runTrigger('u1', { kind: 'fill', orderId: limit.id, price: D(48_900) });
    expect(repo.state.positions.map((p) => p.entryPrice.toNumber())).toEqual([51_020, 49_000]);
  });

  it('runTrigger fills a backfilled trigger at the level it crossed, not the live quote', async () => {
    await trading.placeOrder('u1', { ...market$(1_000), type: 'stop', triggerPrice: D(51_000) });
    const [stop] = repo.state.pendingOrders;
    book = { ask: D(60_000) }; // today's price, long after the gap
    price = D(60_000);
    await trading.runTrigger('u1', {
      kind: 'fill',
      orderId: stop.id,
      price: D(51_000),
      fillAt: D(51_000),
    });
    expect(repo.state.positions[0].entryPrice.toNumber()).toBe(51_000);
  });

  it('runTrigger liquidates on a fresh mark past the liquidation price, never on a stale one (BP-3)', async () => {
    await trading.setSymbolLeverage('u1', 'BTCUSDT', 10);
    await trading.placeOrder('u1', market$(500)); // long 0.1 @ 50,000 at 10×: liq ≈ 45,149
    const [pos] = repo.state.positions;
    const trigger = { kind: 'liquidation' as const, positionId: pos.id, price: D(45_100) };

    book = { mark: D(45_100), seenAt: now - MAX_QUOTE_AGE_MS - 1 }; // stalled feed
    await expect(trading.runTrigger('u1', trigger)).resolves.toBeNull();
    book = { mark: D(46_000) }; // the mark moved back above the liquidation price
    await expect(trading.runTrigger('u1', trigger)).resolves.toBeNull();
    expect(repo.state.positions).toHaveLength(1);

    book = { mark: D(45_100) };
    const out = await trading.runTrigger('u1', trigger);
    expect(out?.sound).toBe('liquidation');
    expect(repo.state.positions).toHaveLength(0);
    expect(out?.delta.trades[0]).toMatchObject({ execType: 'BustTrade', exitPrice: '45000' });
  });

  it('sends the liquidation figures with every position (Bybit field names)', async () => {
    await trading.setSymbolLeverage('u1', 'BTCUSDT', 10);
    const out = await trading.placeOrder('u1', market$(500));
    expect(out.delta.positionsUpsert[0]).toMatchObject({
      liqPrice: expect.stringMatching(/^45148\.9/),
      bustPrice: '45000',
      positionIM: '502.475',
      mmr: '0.0033',
      extraMargin: '0',
    });
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
    const order = trading.placeOrder('u1', market$(1_000));
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

  it('closePosition sells a long into the live bid of the position’s market', async () => {
    await trading.placeOrder('u1', market$(1_000));
    price = D(55_010);
    book = { bid: D(55_000) };
    const out = await trading.closePosition('u1', repo.state.positions[0].id);
    // 0.02 BTC × (55,000 − 50,000)
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
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      usdtAmount: D(100),
      reserved: D(100.11),
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

  const tick = (symbol: string, lastPrice: number, category = 'linear') =>
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

  it('a spot tick never triggers a USDT Perpetual order (per-market index)', async () => {
    const e = engine();
    await e.start();
    tick('BTCUSDT', 1, 'spot');
    expect(runTrigger).not.toHaveBeenCalled();
    tick('BTCUSDT', 48_000, 'linear');
    expect(runTrigger).toHaveBeenCalledTimes(1);
    await e.stop();
  });

  it('tracks gaps per market: a live spot feed does not hide a stalled linear one', async () => {
    const e = engine();
    await e.start();
    tick('BTCUSDT', 49_500, 'linear');
    clock += 120_000;
    tick('BTCUSDT', 49_500, 'spot'); // spot keeps ticking
    expect(fetchCandles).not.toHaveBeenCalled();
    tick('BTCUSDT', 49_600, 'linear');
    await vi.waitFor(() =>
      expect(fetchCandles).toHaveBeenCalledWith('linear', 'BTCUSDT', 1_000_000, 1_120_000)
    );
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
      expect(fetchCandles).toHaveBeenCalledWith('linear', 'BTCUSDT', 1_000_000, 1_120_000)
    );
    await vi.waitFor(() =>
      expect(runTrigger).toHaveBeenCalledWith('u1', {
        kind: 'fill',
        orderId: 'o1',
        price: D(49_000),
        fillAt: D(49_000), // backfill fills at the crossed level
      })
    );
    await e.stop();
  });

  it('indexes a position with no TP / SL and liquidates it on the mark price (BP-3)', async () => {
    const state = freshState();
    state.positions.push({
      id: 'p1',
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'long',
      quantity: D('0.1'),
      entryPrice: D(50_000),
      entryUsdtAmount: D(500),
      leverage: 10,
      entryFee: D('2.75'),
      closeFeeReserve: D('2.475'),
      openedAt: 0,
    });
    open = new Map([['u1', state]]);
    const e = engine();
    await e.start();
    tickListener?.({ category: 'linear', symbol: 'BTCUSDT', lastPrice: 45_300, markPrice: 45_200 });
    expect(runTrigger).not.toHaveBeenCalled(); // above the liquidation price (≈ 45,149)
    tick('BTCUSDT', 45_300); // no mark on this tick: nothing to check
    expect(runTrigger).not.toHaveBeenCalled();
    tickListener?.({ category: 'linear', symbol: 'BTCUSDT', lastPrice: 45_300, markPrice: 45_100 });
    await vi.waitFor(() =>
      expect(runTrigger).toHaveBeenCalledWith('u1', {
        kind: 'liquidation',
        positionId: 'p1',
        price: D(45_100),
      })
    );
    await e.stop();
  });

  it('backfills a linear gap with mark-price candles too, for liquidation', async () => {
    const e = engine();
    await e.start();
    tick('BTCUSDT', 49_500);
    clock += 120_000;
    tick('BTCUSDT', 49_600);
    await vi.waitFor(() =>
      expect(fetchCandles).toHaveBeenCalledWith('linear', 'BTCUSDT', 1_000_000, 1_120_000, 'mark')
    );
    await e.stop();
  });

  it('backfills downtime from the previous holder’s last tick on activation', async () => {
    lease.tryAcquire = vi.fn(async () => ({ acquired: true, lastTickAt: new Date(900_000) }));
    const e = engine();
    await e.start();
    expect(fetchCandles).toHaveBeenCalledWith('linear', 'BTCUSDT', 900_000, 1_000_000);
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

  it('retries a failed trigger once immediately instead of waiting for the next tick', async () => {
    runTrigger.mockRejectedValueOnce(new Error('Account changed — please retry'));
    runTrigger.mockResolvedValueOnce({ result: 'pos' });
    const e = engine();
    await e.start();
    tick('BTCUSDT', 48_000);
    await vi.waitFor(() => expect(runTrigger).toHaveBeenCalledTimes(2));
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
      symbolSetting: model('symbolSetting'),
      spotBalance: model('spotBalance'),
    };
    const prisma = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { prisma, calls, tx };
  }

  const placeDelta = (): Delta => ({
    account: { balance: D(8_998.9), realizedPnl: D(0), leverage: 1, symbolLeverage: {} },
    positionsUpsert: [
      {
        id: 'p1',
        category: 'linear',
        symbol: 'BTCUSDT',
        side: 'long',
        quantity: D(0.02),
        entryPrice: D(50_000),
        entryUsdtAmount: D(1_000),
        leverage: 1,
        entryFee: D(0.55),
        closeFeeReserve: D(0.55),
        openedAt: 1,
      },
    ],
    positionsRemove: [],
    spotUpsert: [],
    pendingUpsert: [],
    pendingRemove: [],
    orders: [
      {
        id: 'o-new',
        category: 'linear',
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
        category: 'linear',
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
    for (const table of [
      'position',
      'trade',
      'order',
      'journalEntry',
      'balanceEvent',
      'symbolSetting',
      'spotBalance',
    ]) {
      expect(calls).toContain(`${table}.deleteMany`);
    }
    expect(calls).not.toContain('position.create');
  });

  it('writes a changed per-symbol leverage as a SymbolSetting upsert', async () => {
    const { prisma, tx } = fakePrisma(1);
    const repo = new AccountRepository(prisma as never);
    const empty = { ...placeDelta(), positionsUpsert: [], orders: [] };
    await repo.mutate('u1', () => ({
      delta: { ...empty, account: { ...empty.account, symbolLeverage: { ETHUSDT: 5 } } },
      result: 5,
    }));
    expect(tx.symbolSetting.upsert).toHaveBeenCalledWith({
      where: { accountId_symbol: { accountId: 'acc', symbol: 'ETHUSDT' } },
      create: { accountId: 'acc', symbol: 'ETHUSDT', leverage: 5 },
      update: { leverage: 5 },
    });
  });
});

describe('AccountRepository — spot balances', () => {
  it('upserts each changed coin balance by (account, coin)', async () => {
    const calls: { where: unknown; create: unknown; update: unknown }[] = [];
    const model = () =>
      new Proxy(
        {},
        {
          get: (_t, method: string) =>
            vi.fn(async (args: { where: unknown; create: unknown; update: unknown }) => {
              if (method === 'upsert') calls.push(args);
              if (method === 'updateMany') return { count: 1 };
              if (method === 'findMany') return [];
              return {
                id: 'acc',
                availableBalance: '10000',
                realizedPnl: '0',
                leverage: 1,
                version: 0,
              };
            }),
        }
      );
    const tx = {
      account: model(),
      position: model(),
      order: model(),
      trade: model(),
      journalEntry: model(),
      balanceEvent: model(),
      symbolSetting: model(),
      spotBalance: model(),
    };
    const repo = new AccountRepository({
      ...tx,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as never);
    const holding = { coin: 'BTC', free: D(0.0999), locked: D(0), avgCost: D(50_050.05) };
    await repo.mutate('u1', (loaded) => ({
      delta: {
        account: { ...loaded.state, symbolLeverage: {} },
        positionsUpsert: [],
        positionsRemove: [],
        spotUpsert: [holding],
        pendingUpsert: [],
        pendingRemove: [],
        orders: [],
        trades: [],
        balanceEvents: [],
        journal: [],
        journalEdits: [],
      },
      result: true,
    }));
    expect(calls).toContainEqual({
      where: { accountId_coin: { accountId: 'acc', coin: 'BTC' } },
      create: {
        coin: 'BTC',
        free: D(0.0999),
        locked: D(0),
        avgCost: D(50_050.05),
        accountId: 'acc',
      },
      update: { coin: 'BTC', free: D(0.0999), locked: D(0), avgCost: D(50_050.05) },
    });
  });
});

describe('isEmptyDelta', () => {
  const noChange = (state: AccountState): Delta => ({
    account: {
      balance: state.balance,
      realizedPnl: state.realizedPnl,
      leverage: state.leverage,
      symbolLeverage: { ...state.symbolLeverage },
    },
    positionsUpsert: [],
    positionsRemove: [],
    spotUpsert: [],
    pendingUpsert: [],
    pendingRemove: [],
    orders: [],
    trades: [],
    balanceEvents: [],
    journal: [],
    journalEdits: [],
  });

  it('is empty when nothing changed', () => {
    const state = { ...freshState(), symbolLeverage: { BTCUSDT: 3 } };
    expect(isEmptyDelta(noChange(state), state)).toBe(true);
  });

  it('is not empty when only a coin balance changed (it must be written)', () => {
    const state = freshState();
    const delta = noChange(state);
    delta.spotUpsert = [{ coin: 'BTC', free: D(1), locked: D(0), avgCost: D(1) }];
    expect(isEmptyDelta(delta, state)).toBe(false);
  });

  it('is not empty when only a per-symbol leverage changed (it must be written)', () => {
    const state = freshState();
    const delta = noChange(state);
    delta.account.symbolLeverage = { BTCUSDT: 3 };
    expect(isEmptyDelta(delta, state)).toBe(false);
  });
});
