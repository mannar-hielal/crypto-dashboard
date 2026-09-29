/**
 * The cross-phase regression suite (TRADING_TEST_PLAN Section 18) on a real Postgres — row 18.7.
 * 18.1–18.6 are pinned at the unit level with in-memory fakes; here the same interactions run
 * through the production objects: TradingService → AccountRepository → Postgres, the
 * MatchingEngine on the Prisma lease row. Only the market is fake: quotes, 1m candles and the
 * funding history are what each test says Bybit served.
 *
 * The clock is faked (Date only — timers stay real) so fills, funding timestamps and restarts land
 * on exact minutes; Postgres stores whatever time the app writes.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRepository } from '../../trading/AccountRepository.js';
import { MatchingEngine, type TickUpdate } from '../../trading/MatchingEngine.js';
import { PaperEventBus } from '../../trading/PaperEventBus.js';
import {
  TradingService,
  type MarketSource,
  type TimedQuote,
} from '../../trading/TradingService.js';
import { fallbackRiskTiers, fallbackRules } from '../../trading/bybitSpec.js';
import type { Candle } from '../../trading/engine/index.js';
import { prismaLeaseStore } from '../../trading/infra.js';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();
const D = (v: number | string) => new Decimal(v);

/** 2030-01-01T00:00:00Z — a funding timestamp (every 8 h from midnight UTC) */
const TS = 1_893_456_000_000;
const MIN = 60_000;
const FUNDING_EVERY = 8 * 3_600_000;

// ─── The stack ──────────────────────────────────────────────────────────────────

interface FundingRow {
  ts: number;
  rate: Decimal;
}

interface Feed {
  quotes: Map<string, Omit<TimedQuote, 'seenAt'>>;
  last: Candle[];
  mark: Candle[];
  /** Bybit's settled funding history; a function to model "not published yet" */
  funding: (from: number, to: number) => Promise<FundingRow[]>;
}

let feed: Feed;
let listeners: Set<(u: TickUpdate) => void>;
let repo: AccountRepository;
let events: PaperEventBus;
let trading: TradingService;
let engines: MatchingEngine[];

const market: MarketSource = {
  quote: (category, symbol) => {
    const q = feed.quotes.get(`${category}:${symbol}`);
    return q ? { ...q, seenAt: Date.now() } : undefined;
  },
  rules: (category, symbol) => fallbackRules(category, symbol),
  riskTiers: (symbol) => fallbackRiskTiers(symbol),
};

function setPrice(price: number): void {
  const p = D(price);
  feed.quotes.set('linear:BTCUSDT', { last: p, bid: p, ask: p, mark: p, index: p });
}

const inRange = (candles: Candle[], from: number, to: number) =>
  candles.filter((c) => c.start >= from && c.start < to);

function engine(holder: string): MatchingEngine {
  const e = new MatchingEngine({
    trading,
    events,
    loadOpenTriggers: () => repo.loadOpenTriggers(),
    reloadUser: (userId) => repo.loadIfExists(userId),
    subscribeTicker: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchCandles: async (_category, _symbol, from, to, source) =>
      inRange(source === 'mark' ? feed.mark : source === 'index' ? [] : feed.last, from, to),
    fetchFundingHistory: async (_symbol, from, to) =>
      (await feed.funding(from, to)).filter((f) => f.ts > from && f.ts <= to),
    closedPositionsAt: (symbol, ts) => repo.closedPositionsAt(symbol, ts),
    riskTiers: fallbackRiskTiers,
    lease: prismaLeaseStore(db),
    holder,
    now: () => Date.now(),
    // Heartbeats, resyncs and the funding clock are driven by the test
    renewEveryMs: 1_000_000_000,
    resyncEveryMs: 1_000_000_000,
    fundingCheckMs: 1_000_000_000,
    fundingRetryMs: 0,
  });
  engines.push(e);
  return e;
}

function tick(update: Omit<TickUpdate, 'category' | 'symbol'>): void {
  for (const l of listeners) l({ category: 'linear', symbol: 'BTCUSDT', ...update });
}

/** Isolated 10× long 0.1 BTC at 50,000 (IM 500, liquidation ≈ 45,149) */
async function openLong(userId: string, extra: { stopLoss?: Decimal } = {}): Promise<string> {
  await trading.setMarginMode(userId, 'ISOLATED_MARGIN');
  await trading.setSymbolLeverage(userId, 'BTCUSDT', 10);
  setPrice(50_000);
  await trading.placeOrder(userId, {
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'market',
    size: { qty: D('0.1') },
    ...extra,
  });
  const [pos] = (await repo.load(userId)).state.positions;
  return pos!.id;
}

async function balance(userId: string): Promise<string> {
  return (await repo.load(userId)).state.balance.toString();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await cleanDatabase(db);
  feed = { quotes: new Map(), last: [], mark: [], funding: async () => [] };
  listeners = new Set();
  repo = new AccountRepository(db, fallbackRiskTiers);
  events = new PaperEventBus();
  trading = new TradingService(repo, market, events, () => Date.now());
  engines = [];
});

afterEach(async () => {
  for (const e of engines) await e.stop();
  vi.useRealTimers();
});

afterAll(async () => {
  await cleanDatabase(db);
  await db.$disconnect();
});

// ─── 18.1–18.6 ──────────────────────────────────────────────────────────────────

describe('Section 18 regression suite on Postgres [18.7]', () => {
  it('[18.1] a backfilled fill is stamped at its candle, so a later candle of the gap still hits its TP', async () => {
    const T = TS + 10 * MIN;
    vi.setSystemTime(T);
    const user = await createUser(db);
    setPrice(50_000);
    await trading.placeOrder(user, {
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      size: { margin: D(1_000) },
      triggerPrice: D(49_000),
      takeProfit: D(52_000),
    });
    // The engine was down for 10 minutes: the limit filled in minute 1, the TP hit in minute 2
    feed.last = [
      { start: T + MIN, low: D(48_900), high: D(49_500) },
      { start: T + 2 * MIN, low: D(51_000), high: D(52_100) },
    ];
    vi.setSystemTime(T + 10 * MIN);
    const e = engine('a');
    await e.start();
    await e.backfill('linear', 'BTCUSDT', T, T + 10 * MIN);

    expect(await db.position.count({ where: { userId: user } })).toBe(0);
    const [close] = await db.trade.findMany({ where: { userId: user, execType: 'Trade' } });
    expect(close?.openedAt?.getTime()).toBeGreaterThanOrEqual(T + MIN);
    expect(close?.openedAt?.getTime()).toBeLessThan(T + 2 * MIN);
    expect(close?.executedAt.getTime()).toBeLessThan(T + 3 * MIN);
    expect(close?.executedPrice.toString()).toBe('52000');
    const orders = await db.order.findMany({ where: { userId: user }, orderBy: { seq: 'asc' } });
    expect(orders.map((o) => [o.orderType, o.status])).toEqual([
      ['LIMIT', 'FILLED'],
      ['TAKE_PROFIT', 'FILLED'],
    ]);
  });

  it('[18.2] a restart just after a funding timestamp settles it, though Bybit had not listed it at takeover', async () => {
    vi.setSystemTime(TS - 30 * MIN);
    const user = await createUser(db);
    await openLong(user);
    // The previous engine crashed 5 s before the timestamp; its lease has expired
    await db.engineLease.create({
      data: {
        id: 'matching-engine',
        holder: 'crashed',
        expiresAt: new Date(TS - 1),
        lastTickAt: new Date(TS - 5_000),
      },
    });
    let reads = 0;
    feed.funding = async () => (++reads > 1 ? [{ ts: TS, rate: D('0.0001') }] : []);
    feed.mark = [{ start: TS, open: D(49_990), high: D(50_000), low: D(49_980) }];
    vi.setSystemTime(TS + 3_000);
    const e = engine('b');
    await e.start();
    expect(e.isActive()).toBe(true);
    await vi.waitFor(() => expect(reads).toBeGreaterThanOrEqual(1)); // the takeover backfill
    // The first ticker already announces the next period
    tick({
      lastPrice: 50_100,
      markPrice: 50_100,
      fundingRate: 0.0002,
      nextFundingTime: TS + FUNDING_EVERY,
      fundingIntervalHour: 8,
    });
    await vi.waitFor(async () =>
      expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(1)
    );
    const [funding] = await db.trade.findMany({ where: { userId: user, execType: 'Funding' } });
    // 0.1 × 49,990 (the mark at the timestamp) × 0.01%
    expect(funding?.commission.toString()).toBe('0.4999');
    expect(funding?.executedAt.getTime()).toBe(TS);
    const setting = await db.symbolSetting.findFirst({ where: { symbol: 'BTCUSDT' } });
    expect(setting?.lastFundingAt?.getTime()).toBe(TS);

    // A second takeover over the same minutes never charges it twice
    await e.stop();
    await db.engineLease.update({
      where: { id: 'matching-engine' },
      data: { lastTickAt: new Date(TS - 5_000) },
    });
    const again = engine('c');
    await again.start();
    await again.backfill('linear', 'BTCUSDT', TS - 5_000, TS + 3_000);
    expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(1);
  });

  it('[18.2] skips an inferred takeover timestamp that Bybit’s history never lists', async () => {
    vi.setSystemTime(TS - 30 * MIN);
    const user = await createUser(db);
    await openLong(user);
    await db.engineLease.create({
      data: {
        id: 'matching-engine',
        holder: 'crashed',
        expiresAt: new Date(TS - 1),
        lastTickAt: new Date(TS - 5_000),
      },
    });
    let reads = 0;
    feed.funding = async () => {
      reads++;
      return [];
    };
    vi.setSystemTime(TS + 3_000);
    const runFunding = vi.spyOn(trading, 'runFunding');
    const e = engine('b');
    await e.start();
    tick({
      lastPrice: 50_100,
      markPrice: 50_100,
      nextFundingTime: TS + FUNDING_EVERY,
      fundingIntervalHour: 8,
    });
    await vi.waitFor(() => expect(reads).toBeGreaterThan(12));
    await new Promise((r) => setTimeout(r, 50));
    const settled = reads;
    await new Promise((r) => setTimeout(r, 50));
    expect(reads).toBe(settled); // gave up, not retried forever
    expect(runFunding).not.toHaveBeenCalled();
    expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(0);
  });

  it('[18.3] drops a deleted account’s settlement, and the lease’s progress moves past it', async () => {
    vi.setSystemTime(TS - 30 * MIN);
    const user = await createUser(db);
    const keeper = await createUser(db);
    await openLong(user);
    await openLong(keeper);
    feed.funding = async () => [{ ts: TS, rate: D('0.0001') }];
    const e = engine('a');
    await e.start();
    vi.setSystemTime(TS - 1_000);
    tick({ lastPrice: 50_000, markPrice: 50_000, fundingRate: 0.0001, nextFundingTime: TS });
    // The user deletes their account right after the timestamp, before the settlement is written
    await db.user.delete({ where: { id: user } });
    vi.setSystemTime(TS + 1_000);
    tick({
      lastPrice: 50_100,
      markPrice: 50_100,
      fundingRate: 0.0002,
      nextFundingTime: TS + FUNDING_EVERY,
    });
    // The other account is settled; the deleted one is dropped, not retried forever
    await vi.waitFor(async () =>
      expect(await db.trade.count({ where: { userId: keeper, execType: 'Funding' } })).toBe(1)
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.trade.count({ where: { userId: user } })).toBe(0);
    await (e as unknown as { heartbeat(): Promise<void> }).heartbeat();
    const lease = await db.engineLease.findUniqueOrThrow({ where: { id: 'matching-engine' } });
    expect(lease.holder).toBe('a');
    expect(lease.lastTickAt?.getTime()).toBe(TS + 1_000);
  });

  it('[18.4] a backfilled minute crossing a stop-loss set past the liquidation price liquidates', async () => {
    vi.setSystemTime(TS);
    const user = await createUser(db);
    // Liquidation ≈ 45,149; a stop-loss at 44,000 is accepted, as on Bybit
    await openLong(user, { stopLoss: D(44_000) });
    feed.last = [{ start: TS + MIN, low: D(43_900), high: D(46_000) }];
    feed.mark = [{ start: TS + MIN, low: D(43_950), high: D(45_950) }];
    vi.setSystemTime(TS + 5 * MIN);
    const e = engine('a');
    await e.start();
    await e.backfill('linear', 'BTCUSDT', TS, TS + 5 * MIN);

    expect(await db.position.count({ where: { userId: user } })).toBe(0);
    const trades = await db.trade.findMany({ where: { userId: user } });
    expect(trades.map((t) => t.execType)).toEqual(['BustTrade']);
    // Closed at the bankruptcy price (45,000), never at the stop-loss past it
    expect(trades[0]?.executedPrice.toString()).toBe('45000');
    expect(
      await db.order.count({ where: { userId: user, orderType: 'STOP_LOSS', status: 'FILLED' } })
    ).toBe(0);
  });

  it('[18.5] a reset between the timestamp and its settlement is not charged', async () => {
    vi.setSystemTime(TS - 30 * MIN);
    const user = await createUser(db);
    await openLong(user);
    let release!: () => void;
    const published = new Promise<void>((r) => (release = r));
    let asked = false;
    feed.funding = async () => {
      asked = true;
      await published; // Bybit publishes the rate a few seconds late
      return [{ ts: TS, rate: D('0.0001') }];
    };
    const runFunding = vi.spyOn(trading, 'runFunding');
    const e = engine('a');
    await e.start();
    vi.setSystemTime(TS - 1_000);
    tick({ lastPrice: 50_000, markPrice: 50_000, fundingRate: 0.0001, nextFundingTime: TS });
    vi.setSystemTime(TS + 1_000);
    tick({ lastPrice: 50_000, markPrice: 50_000, nextFundingTime: TS + FUNDING_EVERY });
    await vi.waitFor(() => expect(asked).toBe(true)); // the position was snapshotted at TS
    vi.setSystemTime(TS + 2_000);
    await trading.reset(user);
    release();
    // The settlement ran with the TS snapshot, on the account as the reset left it
    await vi.waitFor(() => expect(runFunding).toHaveBeenCalledTimes(1));
    expect(runFunding.mock.calls[0]?.[1].positions).toHaveLength(1);
    await runFunding.mock.results[0]?.value;

    expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(0);
    expect(await balance(user)).toBe('10000');
    const account = await db.account.findUniqueOrThrow({ where: { userId: user } });
    expect(account.lastReset.getTime()).toBe(TS + 2_000);
  });

  it('[18.5] a reset before the timestamp still settles it', async () => {
    vi.setSystemTime(TS - 60 * MIN);
    const user = await createUser(db);
    await trading.reset(user);
    vi.setSystemTime(TS - 30 * MIN);
    await openLong(user);
    feed.funding = async () => [{ ts: TS, rate: D('0.0001') }];
    const e = engine('a');
    await e.start();
    vi.setSystemTime(TS - 1_000);
    tick({ lastPrice: 50_000, markPrice: 50_000, fundingRate: 0.0001, nextFundingTime: TS });
    vi.setSystemTime(TS + 1_000);
    tick({ lastPrice: 50_000, markPrice: 50_000, nextFundingTime: TS + FUNDING_EVERY });
    await vi.waitFor(async () =>
      expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(1)
    );
  });

  it('[18.6] a late fee for a position closed in two parts is split over both closes by quantity', async () => {
    vi.setSystemTime(TS - 30 * MIN);
    const user = await createUser(db);
    const positionId = await openLong(user);
    // The engine is down across the timestamp; the user closes 0.025 then the remaining 0.075
    vi.setSystemTime(TS + MIN);
    await trading.placeOrder(user, {
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'sell',
      type: 'market',
      size: { qty: D('0.025') },
      reduceOnly: true,
    });
    vi.setSystemTime(TS + 2 * MIN);
    await trading.closePosition(user, positionId);
    const before = await balance(user);

    // A new engine takes over and backfills the gap: the timestamp is settled for the position
    // that no longer exists
    await db.engineLease.create({
      data: {
        id: 'matching-engine',
        holder: 'crashed',
        expiresAt: new Date(TS - 1),
        lastTickAt: new Date(TS - 5 * MIN),
      },
    });
    feed.funding = async () => [{ ts: TS, rate: D('0.0001') }];
    feed.mark = [{ start: TS, open: D(50_000), high: D(50_000), low: D(50_000) }];
    vi.setSystemTime(TS + 10 * MIN);
    const e = engine('b');
    await e.start();
    await e.backfill('linear', 'BTCUSDT', TS - 5 * MIN, TS + 10 * MIN);

    // 0.1 × 50,000 × 0.01% = 0.5, from the balance, split 0.125 / 0.375 over the two closes
    await vi.waitFor(async () =>
      expect(await db.trade.count({ where: { userId: user, execType: 'Funding' } })).toBe(1)
    );
    expect(await balance(user)).toBe(D(before).minus('0.5').toString());
    const closes = await db.trade.findMany({
      where: { userId: user, execType: 'Trade' },
      orderBy: { executedAt: 'asc' },
    });
    expect(closes.map((t) => [t.quantity.toString(), t.funding.toString()])).toEqual([
      ['0.025', '0.125'],
      ['0.075', '0.375'],
    ]);
  });
});
