/**
 * AccountRepository on a real Postgres (T2i, test plan roadmap P1): every write it makes must read
 * back as the same engine state. The unit tests mock Prisma, so a column the repository forgets to
 * write, a Decimal that loses precision or a mapping that drops a field only shows up here.
 *
 * Each step runs an engine action through `repo.mutate` and compares what the engine computed
 * (`applyDelta(before, delta)`) with what a fresh `repo.load` reads back from the database.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import { AccountRepository } from '../../trading/AccountRepository.js';
import { fallbackRiskTiers, fallbackRules } from '../../trading/bybitSpec.js';
import {
  addNote,
  adjustMargin,
  applyDelta,
  closePosition,
  placeMarket,
  placePending,
  placeSpotMarket,
  setSymbolLeverage,
  settleFunding,
  switchMarginMode,
  updatePositionExits,
  type AccountState,
  type EngineContext,
  type Quote,
} from '../../trading/engine/index.js';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();
const repo = new AccountRepository(db, fallbackRiskTiers);

const D = (v: number | string) => new Decimal(v);
const quote = (price: number): Quote => ({
  last: D(price),
  bid: D(price),
  ask: D(price),
  mark: D(price),
  index: D(price),
});

// After the account's creation (its reset time): a funding timestamp before it is never charged
let clock = Date.now() + 60_000;
let ids = 0;
const ctx = (): EngineContext => ({
  now: (clock += 1_000),
  newId: () => `it-${++ids}`,
  riskTiers: fallbackRiskTiers,
  markPrice: () => D(50_000),
});

/** Engine state with every Decimal as its canonical string and arrays in id order, for equality. */
function canonical(state: AccountState): unknown {
  const walk = (v: unknown): unknown => {
    if (Decimal.isDecimal(v)) return (v as Decimal).toString();
    if (Array.isArray(v)) {
      const items = v.map(walk);
      const byId = (x: unknown) =>
        String((x as { id?: unknown; coin?: unknown }).id ?? (x as { coin?: unknown }).coin ?? '');
      return [...items].sort((a, b) => byId(a).localeCompare(byId(b)));
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, walk(x)])
      );
    }
    return v;
  };
  return walk(state);
}

let userId: string;

beforeAll(async () => {
  await cleanDatabase(db);
  userId = await createUser(db);
});

afterAll(async () => {
  await cleanDatabase(db);
  await db.$disconnect();
});

/** Run `action` through the repository and check the database reads back what the engine computed. */
async function roundTrip<R>(
  step: string,
  action: (state: AccountState) => {
    delta: Parameters<typeof applyDelta>[1];
    result: R;
    invalid?: string;
  }
): Promise<{ result: R; state: AccountState }> {
  const out = await repo.mutate(userId, (loaded) => action(loaded.state));
  expect(out, step).not.toBeNull();
  expect(out?.invalid, step).toBeUndefined();
  const expected = applyDelta(out!.before, out!.delta);
  const loaded = await repo.load(userId);
  expect(canonical(loaded.state), step).toEqual(canonical(expected));
  return { result: out!.result, state: loaded.state };
}

describe('AccountRepository round-trip on Postgres', () => {
  const btcRules = fallbackRules('linear', 'BTCUSDT');
  let positionId = '';

  it('creates the account on first load (10,000 USDT, isolated for no account yet → cross default)', async () => {
    const loaded = await repo.load(userId);
    expect(loaded.state.balance.toString()).toBe('10000');
    expect(loaded.version).toBe(0);
  });

  it('per-symbol leverage', async () => {
    const { state } = await roundTrip('leverage', (s) =>
      setSymbolLeverage(s, 'BTCUSDT', 10, ctx())
    );
    expect(state.symbolLeverage).toEqual({ BTCUSDT: 10 });
  });

  it('switches to isolated so the position keeps its own margin', async () => {
    const { state } = await roundTrip('isolated', (s) =>
      switchMarginMode(s, 'ISOLATED_MARGIN', ctx())
    );
    expect(state.marginMode ?? 'ISOLATED_MARGIN').toBe('ISOLATED_MARGIN');
  });

  it('a linear market buy with TP on mark and SL on index', async () => {
    const { result, state } = await roundTrip('market buy', (s) =>
      placeMarket(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          size: { qty: D('0.1') },
          takeProfit: D(60_000),
          stopLoss: D(45_500),
          tpTriggerBy: 'MarkPrice',
          slTriggerBy: 'IndexPrice',
        },
        quote(50_000),
        btcRules,
        ctx()
      )
    );
    expect(result).toBeTruthy();
    const pos = state.positions[0];
    positionId = pos.id;
    expect(pos.tpTriggerBy).toBe('MarkPrice');
    expect(pos.slTriggerBy).toBe('IndexPrice');
  });

  it('a limit order and a reduce-only close-on-trigger stop', async () => {
    await roundTrip('limit', (s) =>
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'limit',
          triggerPrice: D(49_000),
          size: { qty: D('0.01') },
        },
        quote(50_000),
        btcRules,
        ctx()
      )
    );
    const { state } = await roundTrip('reduce-only stop', (s) =>
      placePending(
        s,
        {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'stop',
          triggerPrice: D(48_000),
          size: { qty: D('0.05') },
          triggerBy: 'MarkPrice',
          closeOnTrigger: true,
        },
        quote(50_000),
        btcRules,
        ctx()
      )
    );
    const stop = state.pendingOrders.find((o) => o.type === 'stop');
    expect(stop?.closeOnTrigger).toBe(true);
    expect(stop?.reduceOnly).toBe(true);
    expect(stop?.triggerBy).toBe('MarkPrice');
  });

  it('added margin and an edited stop-loss', async () => {
    await roundTrip('add margin', (s) => adjustMargin(s, positionId, D(100), ctx(), D(50_000)));
    const { state } = await roundTrip('edit SL', (s) =>
      updatePositionExits(s, positionId, D(60_000), D(46_000), ctx(), { slTriggerBy: 'MarkPrice' })
    );
    const pos = state.positions.find((p) => p.id === positionId);
    expect(pos?.extraMargin?.toString()).toBe('100');
    expect(pos?.stopLoss?.toString()).toBe('46000');
  });

  it('a funding settlement and its per-symbol marker', async () => {
    const ts = clock + 1;
    const { state } = await roundTrip('funding', (s) =>
      settleFunding(
        s,
        {
          symbol: 'BTCUSDT',
          ts,
          rate: D('0.0001'),
          mark: D(50_000),
          positions: [{ positionId, side: 'long', qty: D('0.1') }],
        },
        ctx()
      )
    );
    expect(state.symbolFundingAt.BTCUSDT).toBe(ts);
    expect(state.positions[0].cumFunding?.toString()).toBe('0.5');
  });

  it('a spot market buy and a journal note', async () => {
    const { state } = await roundTrip('spot buy', (s) =>
      placeSpotMarket(
        s,
        { symbol: 'ETHUSDT', side: 'buy', size: { qty: D('0.5') } },
        quote(3_000),
        fallbackRules('spot', 'ETHUSDT'),
        ctx()
      )
    );
    expect(state.spot.find((c) => c.coin === 'ETH')?.free.toString()).toBe('0.4995');
    await roundTrip('note', (s) => addNote(s, 'Round-trip test note', ctx()));
  });

  it('closing the position writes a Closed P&L trade with its open fee and funding share', async () => {
    const { state } = await roundTrip('close', (s) =>
      closePosition(s, positionId, quote(51_000), ctx())
    );
    expect(state.positions.find((p) => p.id === positionId)).toBeUndefined();
    const snap = await repo.snapshot(userId);
    const closed = snap.trades.find(
      (t) => t.category === 'linear' && t.symbol === 'BTCUSDT' && t.execType === undefined
    );
    expect(closed).toBeDefined();
    // 0.1 BTC: open fee 0.1 × 50,000 × 0.055% = 2.75; close fee 0.1 × 51,000 × 0.055% = 2.805;
    // funding 0.1 × 50,000 × 0.01% = 0.5; closed P&L = 100 − 2.75 − 2.805 − 0.5 = 93.945
    expect(closed?.openFee).toBe('2.75');
    expect(closed?.closeFee).toBe('2.805');
    expect(closed?.funding).toBe('0.5');
    expect(closed?.closedPnl).toBe('93.945');
    expect(snap.journal.some((j) => j.text === 'Round-trip test note')).toBe(true);
  });

  it('switching to cross margin is stored on the account', async () => {
    const { state } = await roundTrip('cross', (s) => switchMarginMode(s, 'REGULAR_MARGIN', ctx()));
    expect(state.marginMode).toBe('REGULAR_MARGIN');
  });
});
