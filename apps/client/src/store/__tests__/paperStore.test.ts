/**
 * paperStore tests — the read model of the server engine (BYBIT_PARITY_PLAN BP-1).
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
import { mapServerState, setPaperSoundHandler, usePaperStore } from '../paperStore';
import { useAuthStore } from '../authStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

function delta(version: number, changes: Partial<PaperDeltaDTO> = {}): PaperDeltaDTO {
  return {
    account: { balance: '9000', realizedPnl: '5', leverage: 2, version },
    positionsUpsert: [],
    positionsRemove: [],
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
  symbol: 'BTCUSDT',
  side: 'long' as const,
  quantity: qty,
  entryPrice: '50000',
  entryUsdtAmount: '5000',
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
        account: { balance: '8999.3', realizedPnl: '-1.25', leverage: 5, version: 7 },
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
    expect(s.positions[0].stopLoss).toBeUndefined();
    expect(s.journal[0].pnl).toBe(12.5);
    expect(s.isSyncing).toBe(false);
  });

  it('mapServerState caps the history lists at the client limits', () => {
    const orders = Array.from({ length: 250 }, (_, i) => ({
      id: `o${i}`,
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
        account: { balance: '7777', realizedPnl: '0', leverage: 1, version: 3 },
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
      account: { balance: '10000', realizedPnl: '0', leverage: 1, version: 2 },
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
        account: { balance: '8000', realizedPnl: '0', leverage: 1, version: 5 },
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
        account: { balance: '1', realizedPnl: '0', leverage: 3, version: 9 },
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

  it('placeOrder sends intent only (no price) and applies the response delta', async () => {
    const res = await usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 1_000, 55_000);
    expect(fakePaperApi.placeOrder).toHaveBeenCalledWith(
      { symbol: 'BTCUSDT', side: 'buy', type: 'market', usdtAmount: '1000', takeProfit: '55000' },
      'test-token'
    );
    expect(res.id).toBeTruthy();
    expect(usePaperStore.getState().positions).toHaveLength(1);
  });

  it('placeLimitOrder sends the trigger price', async () => {
    await usePaperStore.getState().placeLimitOrder('ETHUSDT', 'sell', 3_100.5, 200);
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      type: 'limit',
      triggerPrice: '3100.5',
      usdtAmount: '200',
    });
    expect(usePaperStore.getState().pendingOrders[0]).toMatchObject({ symbol: 'ETHUSDT' });
  });

  it('a failed order request returns the server message instead of throwing', async () => {
    fakePaperApi.placeOrder.mockRejectedValueOnce(new Error('Waiting for live price…'));
    const res = await usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 100);
    expect(res).toEqual({ id: null, error: 'Waiting for live price…' });
  });

  it('fire-and-forget actions never reject into the UI', async () => {
    fakePaperApi.closePosition.mockRejectedValueOnce(new Error('boom'));
    await expect(usePaperStore.getState().closePosition('p1')).resolves.toBe('boom');
  });

  it('editPendingOrder returns the server result, not-found, or error on a failed request', async () => {
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 100, null, null)
    ).resolves.toBe('ok');
    fakePaperApi.editOrder.mockRejectedValueOnce(new Error('Not found'));
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 100, null, null)
    ).resolves.toBe('not-found');
    fakePaperApi.editOrder.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(
      usePaperStore.getState().editPendingOrder('o1', 50_000, 100, null, null)
    ).resolves.toBe('error');
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

  it('setLeverage clamps to 1..10 before sending', async () => {
    await usePaperStore.getState().setLeverage(25);
    expect(fakePaperApi.setLeverage).toHaveBeenCalledWith(10, 'test-token');
  });

  it('signed out: order requests fail cleanly without calling the API', async () => {
    useAuthStore.setState({ accessToken: null });
    const res = await usePaperStore.getState().placeOrder('BTCUSDT', 'buy', 100);
    expect(res).toEqual({ id: null, error: 'Not signed in' });
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
  });
});
