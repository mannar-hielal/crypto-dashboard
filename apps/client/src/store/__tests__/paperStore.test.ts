/**
 * paperStore tests — the read model of the server engine (BYBIT_PARITY_PLAN BP-1, BP-2).
 *
 * The trading maths (fills, fees, PnL, netting, journal wording) moved to the server and is
 * tested against the real engine there: apps/server/src/trading/engine/__tests__. These tests
 * cover what stays on the client:
 *   - mapServerState(): snapshot DTO → view numbers
 *   - applyDelta(): upsert / remove / prepend, newest first, capped, idempotent, version-gated
 *   - clear(): nothing of a previous user survives
 *   - actions: send intent only, apply the returned delta, never throw into the UI
 *   - sounds: played once per change, not again for the WS echo of the same change
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PaperDeltaDTO } from '@crypto-dashboard/sdk';
import { leverageFor, mapServerState, setPaperSoundHandler, usePaperStore } from '../paperStore';
import { getLastKnownMarkPrice, getLastKnownPrice } from '../paneStore';
import { useAuthStore } from '../authStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

function delta(version: number, changes: Partial<PaperDeltaDTO> = {}): PaperDeltaDTO {
  return {
    account: { balance: '9000', realizedPnl: '5', leverage: 2, symbolLeverage: {}, version },
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
    ...changes,
  };
}

const position = (id: string, qty = '0.1') => ({
  id,
  category: 'linear' as const,
  symbol: 'BTCUSDT',
  side: 'long' as const,
  quantity: qty,
  entryPrice: '50000',
  entryUsdtAmount: '5000',
  leverage: 1,
  marginMode: 'isolated' as const,
  entryFee: '2.75',
  closeFeeReserve: '2.75',
  extraMargin: '0',
  liqPrice: '45148.99',
  bustPrice: '45000',
  positionIM: '502.75',
  positionMM: '19.25',
  mmr: '0.0033',
  openedAt: 1,
});

const journal = (id: string, text = id, isUserNote = false) => ({
  id,
  time: 1,
  text,
  isUserNote,
});

beforeEach(() => {
  usePaperStore.getState().clear();
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  setPaperSoundHandler(null);
});

// ─── mapServerState / hydrate ─────────────────────────────────────────────────

describe('hydrate()', () => {
  it('maps a snapshot to view numbers and marks the store in sync', () => {
    usePaperStore.getState().hydrate(
      emptyState({
        account: {
          balance: '8999.3',
          realizedPnl: '-1.25',
          leverage: 5,
          symbolLeverage: {},
          version: 7,
        },
        positions: [{ ...position('p1'), takeProfit: '55000' }],
        journal: [{ ...journal('j1'), pnl: '12.5' }],
      })
    );
    const s = usePaperStore.getState();
    expect(s.balance).toBe(8999.3);
    expect(s.realizedPnl).toBe(-1.25);
    expect(s.leverage).toBe(5);
    expect(s.version).toBe(7);
    expect(s.positions[0]).toMatchObject({ quantity: 0.1, entryPrice: 50_000, takeProfit: 55_000 });
    // BP-3: the server's liquidation figures come through as numbers
    expect(s.positions[0]).toMatchObject({
      liqPrice: 45_148.99,
      bustPrice: 45_000,
      positionMM: 19.25,
    });
    expect(s.positions[0].stopLoss).toBeUndefined();
    expect(s.journal[0].pnl).toBe(12.5);
    expect(s.isSyncing).toBe(false);
  });

  it('a pre-BP-3 server’s position (no risk figures) reads as unknown, never as safe', () => {
    // Rolling deploy: the DTO type says these always come, an old server sends none of them
    const old: Record<string, unknown> = { ...position('p1') };
    for (const k of ['liqPrice', 'bustPrice', 'positionIM', 'positionMM']) delete old[k];
    usePaperStore
      .getState()
      .hydrate(emptyState({ positions: [old as unknown as ReturnType<typeof position>] }));
    const p = usePaperStore.getState().positions[0];
    expect(p.liqPrice).toBeNull(); // not 0 = "can't be liquidated"
    expect(p.bustPrice).toBeNull();
    expect(p.positionMM).toBeNull(); // not 0 = "no maintenance margin"
    // positionIM = IM + fee to close, rebuilt from the stored parts
    expect(p.positionIM).toBeCloseTo(
      Number(position('p1').entryUsdtAmount) + Number(position('p1').closeFeeReserve)
    );
  });

  it('mapServerState caps the history lists at the client limits', () => {
    const orders = Array.from({ length: 250 }, (_, i) => ({
      id: `o${i}`,
      category: 'linear' as const,
      symbol: 'BTCUSDT',
      side: 'buy' as const,
      type: 'market' as const,
      qty: '1',
      status: 'filled' as const,
      commission: '0',
      placingTime: i,
      closingTime: i,
    }));
    expect(mapServerState(emptyState({ orders })).orders).toHaveLength(200);
  });
});

// ─── applyDelta ────────────────────────────────────────────────────────────────

describe('applyDelta()', () => {
  beforeEach(() => usePaperStore.getState().hydrate(emptyState()));

  it('applies account, position upserts / removes and prepends records newest first', () => {
    const store = usePaperStore.getState();
    store.applyDelta(delta(1, { positionsUpsert: [position('p1')], journal: [journal('j1')] }));
    store.applyDelta(
      delta(2, {
        positionsUpsert: [position('p1', '0.05'), position('p2')],
        journal: [journal('j3'), journal('j2')],
      })
    );
    usePaperStore.getState().applyDelta(delta(3, { positionsRemove: ['p2'] }));

    const s = usePaperStore.getState();
    expect(s.balance).toBe(9000);
    expect(s.leverage).toBe(2);
    expect(s.positions.map((p) => [p.id, p.quantity])).toEqual([['p1', 0.05]]);
    expect(s.journal.map((j) => j.id)).toEqual(['j3', 'j2', 'j1']);
  });

  it('ignores a delta that is not newer than the shown version (WS echo / late response)', () => {
    const store = usePaperStore.getState();
    expect(store.applyDelta(delta(1, { positionsUpsert: [position('p1')] }))).toBe(true);
    // A newer change closed p1 …
    usePaperStore.getState().applyDelta(delta(2, { positionsRemove: ['p1'] }));
    // … then the (older) response of the first change arrives late: it must not resurrect p1
    expect(
      usePaperStore.getState().applyDelta(delta(1, { positionsUpsert: [position('p1')] }))
    ).toBe(false);
    expect(usePaperStore.getState().positions).toHaveLength(0);
  });

  it('a version gap (a change never received) reloads the account instead of applying', async () => {
    usePaperStore.getState().applyDelta(delta(1));
    fakePaperApi.getState.mockResolvedValueOnce(
      emptyState({
        account: { balance: '7777', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 3 },
        positions: [position('from-resync')],
      })
    );
    // v3 arrives but v2 was never seen
    expect(
      usePaperStore.getState().applyDelta(delta(3, { positionsUpsert: [position('p3')] }))
    ).toBe(false);
    await vi.waitFor(() => expect(usePaperStore.getState().version).toBe(3));
    expect(fakePaperApi.getState).toHaveBeenCalledTimes(1);
    expect(usePaperStore.getState().balance).toBe(7777);
    expect(usePaperStore.getState().positions.map((p) => p.id)).toEqual(['from-resync']);
  });

  it('a snapshot older than the shown state is ignored (slow GET /state vs WS)', () => {
    usePaperStore.getState().applyDelta(delta(1, { positionsUpsert: [position('p1')] }));
    usePaperStore.getState().hydrate(emptyState()); // version 0 < 1
    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('a reset delta clears every list before applying', () => {
    const store = usePaperStore.getState();
    store.applyDelta(delta(1, { positionsUpsert: [position('p1')], journal: [journal('j1')] }));
    usePaperStore.getState().applyDelta({
      ...delta(2),
      account: { balance: '10000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 2 },
      positionsRemove: ['p1'],
      reset: true,
    });
    const s = usePaperStore.getState();
    expect(s.balance).toBe(10_000);
    expect(s.positions).toHaveLength(0);
    expect(s.journal).toHaveLength(0);
  });

  it('journal edits change only the user’s own notes', () => {
    const store = usePaperStore.getState();
    store.applyDelta(
      delta(1, { journal: [journal('mine', 'old', true), journal('sys', 'system')] })
    );
    usePaperStore.getState().applyDelta(
      delta(2, {
        journalEdits: [
          { id: 'mine', text: 'new' },
          { id: 'sys', text: 'hacked' },
        ],
      })
    );
    const texts = usePaperStore.getState().journal.map((j) => j.text);
    expect(texts).toEqual(['new', 'system']);
  });

  it('plays the change’s sound once, and not for the duplicate', () => {
    const played = vi.fn();
    setPaperSoundHandler(played);
    const d = delta(1);
    usePaperStore.getState().applyDelta(d, 'filled');
    usePaperStore.getState().applyDelta(d, 'filled');
    expect(played).toHaveBeenCalledTimes(1);
    expect(played).toHaveBeenCalledWith('filled');
  });
});

describe('applyDelta() before the account is loaded (review fix)', () => {
  it('reloads the whole account instead of building on an empty view', async () => {
    // Not hydrated yet (version -1): an order response arrives first
    fakePaperApi.getState.mockResolvedValueOnce(
      emptyState({
        account: { balance: '8000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 5 },
        positions: [position('existing')],
      })
    );
    expect(
      usePaperStore.getState().applyDelta(delta(5, { positionsUpsert: [position('new')] }))
    ).toBe(false);
    await vi.waitFor(() => expect(usePaperStore.getState().version).toBe(5));
    expect(usePaperStore.getState().positions.map((p) => p.id)).toEqual(['existing']);
  });
});

// ─── clear ─────────────────────────────────────────────────────────────────────

describe('clear()', () => {
  it('drops everything, so a new user never sees the previous account', () => {
    usePaperStore.getState().hydrate(
      emptyState({
        account: { balance: '1', realizedPnl: '0', leverage: 3, symbolLeverage: {}, version: 9 },
        positions: [position('p1')],
      })
    );
    usePaperStore.getState().clear();
    const s = usePaperStore.getState();
    expect(s.balance).toBe(10_000);
    expect(s.positions).toHaveLength(0);
    expect(s.version).toBe(-1);
    expect(s.isSyncing).toBe(true);
  });
});

// ─── actions → API ─────────────────────────────────────────────────────────────

describe('actions', () => {
  beforeEach(() => usePaperStore.getState().hydrate(emptyState()));

  const market = {
    category: 'linear' as const,
    symbol: 'BTCUSDT',
    side: 'buy' as const,
    type: 'market' as const,
  };

  it('placeOrder sends intent only (market, size — no price) and applies the delta', async () => {
    const res = await usePaperStore
      .getState()
      .placeOrder({ ...market, size: { value: 1_000 }, takeProfit: 55_000 });
    expect(fakePaperApi.placeOrder).toHaveBeenCalledWith(
      {
        category: 'linear',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        value: '1000',
        takeProfit: '55000',
      },
      'test-token'
    );
    expect(res.id).toBeTruthy();
    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('a coin-quantity order sends qty, and a limit its trigger price', async () => {
    await usePaperStore.getState().placeOrder({
      category: 'spot',
      symbol: 'ETHUSDT',
      side: 'sell',
      type: 'limit',
      size: { qty: 0.25 },
      triggerPrice: 3_100.5,
    });
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      category: 'spot',
      type: 'limit',
      triggerPrice: '3100.5',
      qty: '0.25',
    });
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).not.toHaveProperty('usdtAmount');
    expect(usePaperStore.getState().pendingOrders[0]).toMatchObject({ symbol: 'ETHUSDT' });
  });

  it('a market order never sends a trigger price', async () => {
    await usePaperStore.getState().placeOrder({ ...market, size: { qty: 1 }, triggerPrice: 1 });
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).not.toHaveProperty('triggerPrice');
  });

  it('a failed order request returns the server message instead of throwing', async () => {
    fakePaperApi.placeOrder.mockRejectedValueOnce(new Error('Waiting for live price…'));
    const res = await usePaperStore.getState().placeOrder({ ...market, size: { value: 100 } });
    expect(res).toEqual({ id: null, error: 'Waiting for live price…' });
  });

  it('fire-and-forget actions never reject into the UI', async () => {
    fakePaperApi.closePosition.mockRejectedValueOnce(new Error('boom'));
    await expect(usePaperStore.getState().closePosition('p1')).resolves.toBe('boom');
  });

  it('editPendingOrder sends a coin qty and returns the result, not-found, or the error', async () => {
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 0.02, null, null)
    ).resolves.toEqual({ result: 'ok' });
    expect(fakePaperApi.editOrder.mock.calls[0][1]).toMatchObject({ qty: '0.02' });
    fakePaperApi.editOrder.mockRejectedValueOnce(new Error('Not found'));
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 0.02, null, null)
    ).resolves.toEqual({ result: 'not-found' });
    fakePaperApi.editOrder.mockRejectedValueOnce(
      new Error('Order quantity lower than the minimum (0.001)')
    );
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 0.0001, null, null)
    ).resolves.toEqual({
      result: 'error',
      error: 'Order quantity lower than the minimum (0.001)',
    });
  });

  it('fire-and-forget actions report the failure instead of pretending success', async () => {
    fakePaperApi.addNote.mockRejectedValueOnce(
      new Error('text must NOT have more than 500 characters')
    );
    await expect(usePaperStore.getState().addJournalNote('x')).resolves.toBe(
      'text must NOT have more than 500 characters'
    );
    await expect(usePaperStore.getState().addJournalNote('ok')).resolves.toBeNull();
  });

  it('setSymbolLeverage clamps to 1..10 and sends it for that symbol', async () => {
    await usePaperStore.getState().setSymbolLeverage('ETHUSDT', 25);
    expect(fakePaperApi.setSymbolLeverage).toHaveBeenCalledWith('ETHUSDT', 10, 'test-token');
  });

  it('placeSpotExits sends the coin qty and the legs', async () => {
    const res = await usePaperStore.getState().placeSpotExits('BTCUSDT', 0.05, undefined, 45_000);
    expect(fakePaperApi.placeSpotExits).toHaveBeenCalledWith(
      { symbol: 'BTCUSDT', qty: '0.05', stopLoss: '45000' },
      'test-token'
    );
    expect(res.id).toBe('oco-1');
  });

  it('signed out: order requests fail cleanly without calling the API', async () => {
    useAuthStore.setState({ accessToken: null });
    const res = await usePaperStore.getState().placeOrder({ ...market, size: { value: 100 } });
    expect(res).toEqual({ id: null, error: 'Not signed in' });
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
  });
});

// ─── BP-2: spot balances, per-symbol leverage, live prices ────────────────────

describe('BP-2 read model', () => {
  it('maps spot balances and per-symbol leverage from a snapshot', () => {
    usePaperStore.getState().hydrate(
      emptyState({
        account: {
          balance: '5000',
          realizedPnl: '0',
          leverage: 1,
          symbolLeverage: { BTCUSDT: 10 },
          version: 1,
        },
        spotBalances: [{ coin: 'BTC', free: '0.0999', locked: '0', avgCost: '50050.05' }],
      })
    );
    const s = usePaperStore.getState();
    expect(s.spotBalances).toEqual([{ coin: 'BTC', free: 0.0999, locked: 0, avgCost: 50_050.05 }]);
    expect(leverageFor(s, 'BTCUSDT')).toBe(10);
    expect(leverageFor(s, 'ETHUSDT')).toBe(1); // the account default
  });

  it('applyDelta replaces changed coin balances; a reset clears them', () => {
    usePaperStore.getState().hydrate(
      emptyState({
        spotBalances: [
          { coin: 'BTC', free: '1', locked: '0', avgCost: '1' },
          { coin: 'ETH', free: '2', locked: '0', avgCost: '1' },
        ],
      })
    );
    usePaperStore
      .getState()
      .applyDelta(
        delta(1, { spotUpsert: [{ coin: 'BTC', free: '0.5', locked: '0.5', avgCost: '1' }] })
      );
    expect(usePaperStore.getState().spotBalances).toEqual([
      { coin: 'BTC', free: 0.5, locked: 0.5, avgCost: 1 },
      { coin: 'ETH', free: 2, locked: 0, avgCost: 1 },
    ]);
    usePaperStore.getState().applyDelta(delta(2, { reset: true }));
    expect(usePaperStore.getState().spotBalances).toEqual([]);
  });

  it('applyPrices feeds the last known price of each market', () => {
    usePaperStore.getState().applyPrices([
      { category: 'linear', symbol: 'SOLUSDT', last: 150 },
      { category: 'spot', symbol: 'SOLUSDT', last: 149.9 },
    ]);
    expect(getLastKnownPrice('SOLUSDT', 'linear')).toBe(150);
    expect(getLastKnownPrice('SOLUSDT', 'spot')).toBe(149.9);
  });

  it('applyPrices keeps the USDT Perpetual mark price apart from the last price (BP-3)', () => {
    usePaperStore
      .getState()
      .applyPrices([{ category: 'linear', symbol: 'AVAXUSDT', last: 30, mark: 29.95 }]);
    expect(getLastKnownPrice('AVAXUSDT', 'linear')).toBe(30);
    expect(getLastKnownMarkPrice('AVAXUSDT')).toBe(29.95);
  });
});
