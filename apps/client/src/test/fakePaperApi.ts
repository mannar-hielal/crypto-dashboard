/**
 * Fake paperApi for component tests (BYBIT_PARITY_PLAN BP-1).
 *
 * Trading runs on the server, so component tests check that the UI sends the right *intent*
 * and shows the server's answer. This fake records every call and answers with a small but
 * realistic delta: a market order opens a position at the active pane's price, a limit / stop
 * order adds a pending order, everything else answers with an unchanged account. The trading
 * maths itself is tested against the real engine in apps/server/src/trading.
 *
 * paperStore is read lazily (dynamic import at call time): importing it at the top would make
 * the mocked SDK module wait on itself (paperStore → sdk mock → this file → paperStore).
 *
 * Usage (vi.mock is hoisted, so import the fake inside the factory):
 *   vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
 *     ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
 *     paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
 *   }));
 */

import { vi } from 'vitest';
import type {
  PaperActionResponse,
  PaperDeltaDTO,
  PaperStateDTO,
  EditPendingOrderRequest,
  PlaceOrderRequest,
} from '@crypto-dashboard/sdk';
import { paneStores } from '@/store/paneStore';

let seq = 0;

/** A delta that keeps the account as it is, one version newer, plus `changes`. */
export async function fakeDelta(changes: Partial<PaperDeltaDTO> = {}): Promise<PaperDeltaDTO> {
  const { usePaperStore } = await import('@/store/paperStore');
  const s = usePaperStore.getState();
  return {
    account: {
      balance: String(s.balance),
      realizedPnl: String(s.realizedPnl),
      leverage: s.leverage,
      symbolLeverage: {},
      version: Math.max(s.version, 0) + 1,
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
    ...changes,
  };
}

/** An empty account snapshot (what a brand-new user gets). */
export function emptyState(overrides: Partial<PaperStateDTO> = {}): PaperStateDTO {
  return {
    account: { balance: '10000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 0 },
    positions: [],
    spotBalances: [],
    pendingOrders: [],
    orders: [],
    trades: [],
    journal: [],
    balanceEvents: [],
    ...overrides,
  };
}

async function ok<R>(result: R, delta?: Promise<PaperDeltaDTO>): Promise<PaperActionResponse<R>> {
  return { result, delta: await (delta ?? fakeDelta()) };
}

export const fakePaperApi = {
  getState: vi.fn(() => Promise.resolve(emptyState())),

  placeOrder: vi.fn((body: PlaceOrderRequest): Promise<PaperActionResponse<string | null>> => {
    const id = `fake-${++seq}`;
    const tp = body.takeProfit ? { takeProfit: body.takeProfit } : {};
    const sl = body.stopLoss ? { stopLoss: body.stopLoss } : {};
    const price = paneStores[0].getState().latestPrice ?? 1;
    const trigger = Number(body.triggerPrice ?? price);
    const at = body.type === 'market' ? price : trigger;
    // Size as the real server takes it: qty, a USDT value, or (pre-BP-2) margin at 1×
    const qty =
      body.qty !== undefined ? Number(body.qty) : Number(body.value ?? body.usdtAmount ?? '0') / at;
    const margin = String(qty * at);
    if (body.type === 'market') {
      return ok(
        id,
        fakeDelta({
          positionsUpsert: [
            {
              id,
              category: 'linear',
              symbol: body.symbol,
              side: body.side === 'buy' ? 'long' : 'short',
              quantity: String(qty),
              entryPrice: String(price),
              entryUsdtAmount: margin,
              leverage: 1,
              marginMode: 'isolated',
              entryFee: '0',
              closeFeeReserve: '0',
              extraMargin: '0',
              liqPrice: '0',
              bustPrice: '0',
              positionMM: '0',
              mmr: '0.0033',
              positionIM: margin,
              openedAt: Date.now(),
              ...tp,
              ...sl,
            },
          ],
        })
      );
    }
    return ok(
      id,
      fakeDelta({
        pendingUpsert: [
          {
            id,
            category: body.category ?? 'linear',
            symbol: body.symbol,
            side: body.side,
            type: body.type,
            usdtAmount: margin,
            reserved: margin,
            triggerPrice: String(trigger),
            qty: String(qty),
            leverage: 1,
            placedAt: Date.now(),
            ...tp,
            ...sl,
          },
        ],
      })
    );
  }),

  cancelOrder: vi.fn(() => ok(true)),
  editOrder: vi.fn<
    (orderId: string, body: EditPendingOrderRequest) => Promise<PaperActionResponse<'ok'>>
  >(() => ok('ok' as const)),
  cancelOrderExit: vi.fn(() => ok(true)),
  updatePositionExits: vi.fn(() => ok(true)),
  cancelPositionExit: vi.fn(() => ok(true)),
  closePosition: vi.fn(() => ok('0')),
  setLeverage: vi.fn((leverage: number) => ok(leverage)),
  setSymbolLeverage: vi.fn((_symbol: string, leverage: number) => ok(leverage)),
  placeSpotExits: vi.fn(() => ok('oco-1' as string | null)),
  resetAccount: vi.fn(() => ok(true)),
  addNote: vi.fn(() => ok('note')),
  editNote: vi.fn(() => ok(true)),
  wsUrl: vi.fn(() => 'ws://localhost:3001/api/paper/ws'),
};

/** Reset recorded calls between tests. */
export function resetFakePaperApi(): void {
  for (const fn of Object.values(fakePaperApi)) fn.mockClear();
}
