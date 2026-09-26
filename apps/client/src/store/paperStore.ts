/**
 * Paper Trading Store — read model of the server-side engine (BYBIT_PARITY_PLAN BP-1).
 *
 * The server executes every trade and checks TP/SL and pending orders 24/7
 * (apps/server/src/trading). This store only mirrors the account:
 *   - hydrate(): from the private WebSocket snapshot (GET /api/paper/state shape)
 *   - applyDelta(): every change, whether from our own request or pushed by the server
 *   - actions: send an *intent* to the API and apply the returned delta
 *
 * Every delta carries the account version, so a change received twice (HTTP response + WS push)
 * or out of order is applied once. Nothing is persisted: the old `cd-paper-trading` localStorage
 * cache is deleted on load, and clear() runs on logout so no data outlives the session.
 *
 * ⚠️  This is for paper/practice trading only. No real money involved.
 */

import { create } from 'zustand';
import {
  paperApi,
  type PaperDeltaDTO,
  type PaperExitLeg,
  type PaperOrderDTO,
  type PaperPendingOrderDTO,
  type PaperPositionDTO,
  type PaperSound,
  type PaperStateDTO,
} from '@crypto-dashboard/sdk';
import { useAuthStore } from './authStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 10_000; // $10,000 USDT
const MAX_HISTORY = 100;
const MAX_ORDERS = 200;
const MAX_BALANCE_LOG = 200;
const MAX_JOURNAL = 200;
/** 0.07% taker fee — used for UI estimates only; the server charges the real fee */
export const COMMISSION_RATE = 0.0007;

/** Maximum allowed leverage for paper trading (learning-app safety cap). */
export const MAX_LEVERAGE = 10;

/** Leverage options available in the Account Settings selector (capped at MAX_LEVERAGE). */
export const CRYPTO_LEVERAGE_OPTIONS = [1, 2, 3, 5, MAX_LEVERAGE] as const;
export type CryptoLeverage = (typeof CRYPTO_LEVERAGE_OPTIONS)[number];

/** Pre-BP-1 persisted trading state — the server is the only source now. */
const LEGACY_STORAGE_KEY = 'cd-paper-trading';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number; // base-asset qty (e.g. BTC)
  entryPrice: number; // fill price (USD)
  entryUsdtAmount: number; // margin reserved at entry
  openedAt: number; // Unix ms
  takeProfit?: number;
  stopLoss?: number;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number; // gross realized PnL in USDT (negative = loss)
  openedAt: number;
  closedAt: number;
}

export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type OrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop';
  usdtAmount: number; // reserved at placement
  triggerPrice: number; // limit or stop trigger price
  qty: number; // leveraged base-asset qty at placement
  /** Leverage captured at placement — the fill uses it */
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  placedAt: number;
}

export interface HistoricalOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  fillPrice?: number;
  status: OrderStatus;
  commission: number;
  /** USDT margin used for this order entry (omitted for closing orders) */
  margin?: number;
  placingTime: number;
  closingTime: number;
  /** Why the order was rejected (only set when status === 'rejected') */
  rejectionReason?: string;
}

export interface BalanceEvent {
  id: string;
  time: number;
  balanceBefore: number;
  balanceAfter: number;
  pnl: number;
  action: string;
}

export interface JournalEntry {
  id: string;
  time: number;
  text: string;
  /** true only for notes the user wrote; system entries are read-only */
  isUserNote?: boolean;
  /** Net realized PnL (USDT) on close entries; undefined for open / user entries */
  pnl?: number;
}

/** null when the request succeeded, otherwise the server / network error message. */
export type ActionError = string | null;

/** Outcome of an order request: the new id, or why it was not placed. */
export interface PlaceResult {
  id: string | null;
  /** Server message when the request itself failed (e.g. "Waiting for live price…") */
  error?: string;
}

// ─── DTO → view mappers ───────────────────────────────────────────────────────

const toNum = (v: string) => Number(v);
const optNum = (v: string | undefined) => (v === undefined ? undefined : Number(v));

function positionFrom(p: PaperPositionDTO): Position {
  return {
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    quantity: toNum(p.quantity),
    entryPrice: toNum(p.entryPrice),
    entryUsdtAmount: toNum(p.entryUsdtAmount),
    openedAt: p.openedAt,
    ...(p.takeProfit !== undefined ? { takeProfit: toNum(p.takeProfit) } : {}),
    ...(p.stopLoss !== undefined ? { stopLoss: toNum(p.stopLoss) } : {}),
  };
}

function pendingFrom(o: PaperPendingOrderDTO): PendingOrder {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    usdtAmount: toNum(o.usdtAmount),
    triggerPrice: toNum(o.triggerPrice),
    qty: toNum(o.qty),
    leverage: o.leverage,
    placedAt: o.placedAt,
    ...(o.takeProfit !== undefined ? { takeProfit: toNum(o.takeProfit) } : {}),
    ...(o.stopLoss !== undefined ? { stopLoss: toNum(o.stopLoss) } : {}),
  };
}

function orderFrom(o: PaperOrderDTO): HistoricalOrder {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: toNum(o.qty),
    limitPrice: optNum(o.limitPrice),
    stopPrice: optNum(o.stopPrice),
    fillPrice: optNum(o.fillPrice),
    status: o.status,
    commission: toNum(o.commission),
    margin: optNum(o.margin),
    placingTime: o.placingTime,
    closingTime: o.closingTime,
    ...(o.rejectionReason ? { rejectionReason: o.rejectionReason } : {}),
  };
}

function tradeFrom(t: PaperStateDTO['trades'][number]): ClosedTrade {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    quantity: toNum(t.quantity),
    entryPrice: toNum(t.entryPrice),
    exitPrice: toNum(t.exitPrice),
    pnl: toNum(t.pnl),
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  };
}

function journalFrom(j: PaperStateDTO['journal'][number]): JournalEntry {
  return {
    id: j.id,
    time: j.time,
    text: j.text,
    isUserNote: j.isUserNote,
    ...(j.pnl !== undefined ? { pnl: toNum(j.pnl) } : {}),
  };
}

function balanceEventFrom(b: PaperStateDTO['balanceEvents'][number]): BalanceEvent {
  return {
    id: b.id,
    time: b.time,
    balanceBefore: toNum(b.balanceBefore),
    balanceAfter: toNum(b.balanceAfter),
    pnl: toNum(b.pnl),
    action: b.action,
  };
}

/** Map a server snapshot to the store's view state (exported for tests). */
export function mapServerState(state: PaperStateDTO) {
  return {
    version: state.account.version,
    balance: toNum(state.account.balance),
    realizedPnl: toNum(state.account.realizedPnl),
    leverage: state.account.leverage,
    positions: state.positions.map(positionFrom),
    pendingOrders: state.pendingOrders.map(pendingFrom),
    orders: state.orders.map(orderFrom).slice(0, MAX_ORDERS),
    history: state.trades.map(tradeFrom).slice(0, MAX_HISTORY),
    journal: state.journal.map(journalFrom).slice(0, MAX_JOURNAL),
    balanceLog: state.balanceEvents.map(balanceEventFrom).slice(0, MAX_BALANCE_LOG),
  };
}

/** Upsert by id, keeping list order (new items appended). */
function upsert<T extends { id: string }>(list: T[], removed: string[], changed: T[]): T[] {
  let next = removed.length ? list.filter((x) => !removed.includes(x.id)) : list;
  for (const item of changed) {
    next = next.some((x) => x.id === item.id)
      ? next.map((x) => (x.id === item.id ? item : x))
      : [...next, item];
  }
  return next;
}

/** Prepend new records (newest first), skipping ids already present, and cap the list. */
function prepend<T extends { id: string }>(list: T[], incoming: T[], max: number): T[] {
  if (incoming.length === 0) return list;
  const known = new Set(list.map((x) => x.id));
  const fresh = incoming.filter((x) => !known.has(x.id));
  return fresh.length ? [...fresh, ...list].slice(0, max) : list;
}

// ─── Sound bridge ─────────────────────────────────────────────────────────────

/** The dashboard registers its sound player here (hooks can't be called from the store). */
let soundHandler: ((sound: PaperSound) => void) | null = null;

export function setPaperSoundHandler(handler: ((sound: PaperSound) => void) | null): void {
  soundHandler = handler;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface PaperState {
  balance: number;
  positions: Position[];
  pendingOrders: PendingOrder[];
  history: ClosedTrade[];
  orders: HistoricalOrder[];
  realizedPnl: number;
  balanceLog: BalanceEvent[];
  journal: JournalEntry[];
  /** Account-wide leverage (1–MAX_LEVERAGE); per-symbol leverage arrives in BP-2 */
  leverage: number;
  /** Server account version of the state shown (-1 = nothing loaded yet) */
  version: number;

  /** True until the first snapshot for this session has arrived */
  isSyncing: boolean;
  /** Last time anything was received from the server */
  lastSyncAt: number | null;

  /** Replace everything with a server snapshot. */
  hydrate: (state: PaperStateDTO) => void;
  /** Apply one change; ignored if not newer than the shown version. Returns true if applied. */
  applyDelta: (delta: PaperDeltaDTO, sound?: PaperSound) => boolean;
  /** Forget the account (logout / user switch). */
  clear: () => void;
  /** Reload the whole account from the server (after a missed change). */
  resync: () => Promise<void>;

  /** Market order at the server's live price. */
  placeOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => Promise<PlaceResult>;
  placeLimitOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => Promise<PlaceResult>;
  placeStopOrder: (
    symbol: string,
    side: 'buy' | 'sell',
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ) => Promise<PlaceResult>;
  /** Close at the server's live price. */
  closePosition: (positionId: string) => Promise<ActionError>;
  cancelPendingOrder: (orderId: string) => Promise<ActionError>;
  /** Cancel one TP/SL leg of an open position. */
  cancelExitOrder: (positionId: string, exitType: PaperExitLeg) => Promise<ActionError>;
  /** Cancel one TP/SL leg of a pending order (the order keeps its reserve). */
  cancelPendingExitLeg: (pendingOrderId: string, exitType: PaperExitLeg) => Promise<ActionError>;
  /** Set / change / remove TP and SL on an open position (null removes a leg). */
  updatePositionExits: (
    positionId: string,
    takeProfit: number | null,
    stopLoss: number | null
  ) => Promise<ActionError>;
  editPendingOrder: (
    orderId: string,
    newTriggerPrice: number,
    newUsdtAmount: number,
    newTakeProfit: number | null,
    newStopLoss: number | null
  ) => Promise<'ok' | 'rejected' | 'not-found' | 'error'>;
  addJournalNote: (text: string) => Promise<ActionError>;
  editJournalEntry: (entryId: string, text: string) => Promise<ActionError>;
  setLeverage: (v: number) => Promise<ActionError>;
  /** Reset the account back to the starting balance. */
  reset: () => Promise<ActionError>;
}

const EMPTY = {
  balance: STARTING_BALANCE,
  positions: [] as Position[],
  pendingOrders: [] as PendingOrder[],
  history: [] as ClosedTrade[],
  orders: [] as HistoricalOrder[],
  realizedPnl: 0,
  balanceLog: [] as BalanceEvent[],
  journal: [] as JournalEntry[],
  leverage: 1,
  version: -1,
  isSyncing: true,
  lastSyncAt: null as number | null,
};

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

/** Decimal-string form the API expects (finite, non-negative, ≤ 8 dp). */
function dec(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(8)).toString() : '0';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

// 🔐 Drop the pre-BP-1 local copy of trading state — it survived logout and could leak to the
//    next user of the browser.
try {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {
  // storage unavailable (private mode) — nothing to clean up
}

export const usePaperStore = create<PaperState>()((set, get) => {
  /** Apply an API response's delta (the WS push of the same change is then ignored). */
  function applyResponse(res: { delta: PaperDeltaDTO; sound?: PaperSound }) {
    get().applyDelta(res.delta, res.sound);
  }

  /**
   * Run a fire-and-forget action: apply its delta, never reject. A failed request changes
   * nothing — the account view stays on the last server state.
   */
  async function settle(
    request: () => Promise<{ delta: PaperDeltaDTO; sound?: PaperSound }>
  ): Promise<ActionError> {
    try {
      applyResponse(await request());
      return null;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[paperStore] request failed:', err);
      return errorMessage(err);
    }
  }

  let resyncing: Promise<void> | null = null;

  async function placePending(
    type: 'limit' | 'stop',
    symbol: string,
    side: 'buy' | 'sell',
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ): Promise<PlaceResult> {
    try {
      const res = await paperApi.placeOrder(
        {
          symbol,
          side,
          type,
          usdtAmount: dec(usdtAmount),
          triggerPrice: dec(triggerPrice),
          ...(takeProfit && takeProfit > 0 ? { takeProfit: dec(takeProfit) } : {}),
          ...(stopLoss && stopLoss > 0 ? { stopLoss: dec(stopLoss) } : {}),
        },
        token()
      );
      applyResponse(res);
      return { id: res.result };
    } catch (err) {
      return { id: null, error: errorMessage(err) };
    }
  }

  return {
    ...EMPTY,

    hydrate: (state) => {
      set({ ...mapServerState(state), isSyncing: false, lastSyncAt: Date.now() });
    },

    applyDelta: (delta, sound) => {
      const s = get();
      // Already applied (HTTP response + WS push of the same change) or stale (late response)
      if (delta.account.version <= s.version) return false;
      // A skipped version means a change we never saw (e.g. an HTTP response overtook the WS
      // push before it): applying this one would leave the gap on screen — reload instead.
      if (s.version >= 0 && delta.account.version > s.version + 1) {
        void get().resync();
        return false;
      }
      const base = delta.reset
        ? { orders: [], history: [], journal: [], balanceLog: [] }
        : { orders: s.orders, history: s.history, journal: s.journal, balanceLog: s.balanceLog };
      let journal = prepend(base.journal, delta.journal.map(journalFrom), MAX_JOURNAL);
      for (const edit of delta.journalEdits) {
        journal = journal.map((e) =>
          e.id === edit.id && e.isUserNote ? { ...e, text: edit.text } : e
        );
      }
      set({
        version: delta.account.version,
        balance: toNum(delta.account.balance),
        realizedPnl: toNum(delta.account.realizedPnl),
        leverage: delta.account.leverage,
        positions: upsert(
          delta.reset ? [] : s.positions,
          delta.positionsRemove,
          delta.positionsUpsert.map(positionFrom)
        ),
        pendingOrders: upsert(
          delta.reset ? [] : s.pendingOrders,
          delta.pendingRemove,
          delta.pendingUpsert.map(pendingFrom)
        ),
        orders: prepend(base.orders, delta.orders.map(orderFrom), MAX_ORDERS),
        history: prepend(base.history, delta.trades.map(tradeFrom), MAX_HISTORY),
        balanceLog: prepend(
          base.balanceLog,
          delta.balanceEvents.map(balanceEventFrom),
          MAX_BALANCE_LOG
        ),
        journal,
        lastSyncAt: Date.now(),
      });
      if (sound) soundHandler?.(sound);
      return true;
    },

    clear: () => set({ ...EMPTY }),

    resync: () => {
      if (!resyncing) {
        resyncing = (async () => {
          try {
            get().hydrate(await paperApi.getState(token()));
          } catch (err) {
            if (import.meta.env.DEV) console.error('[paperStore] resync failed:', err);
          } finally {
            resyncing = null;
          }
        })();
      }
      return resyncing;
    },

    placeOrder: async (symbol, side, usdtAmount, takeProfit, stopLoss) => {
      try {
        const res = await paperApi.placeOrder(
          {
            symbol,
            side,
            type: 'market',
            usdtAmount: dec(usdtAmount),
            ...(takeProfit && takeProfit > 0 ? { takeProfit: dec(takeProfit) } : {}),
            ...(stopLoss && stopLoss > 0 ? { stopLoss: dec(stopLoss) } : {}),
          },
          token()
        );
        applyResponse(res);
        return { id: res.result };
      } catch (err) {
        return { id: null, error: errorMessage(err) };
      }
    },

    placeLimitOrder: (...args) => placePending('limit', ...args),
    placeStopOrder: (...args) => placePending('stop', ...args),

    closePosition: (positionId) => settle(() => paperApi.closePosition(positionId, token())),

    cancelPendingOrder: (orderId) => settle(() => paperApi.cancelOrder(orderId, token())),

    cancelExitOrder: (positionId, exitType) =>
      settle(() => paperApi.cancelPositionExit(positionId, exitType, token())),

    cancelPendingExitLeg: (pendingOrderId, exitType) =>
      settle(() => paperApi.cancelOrderExit(pendingOrderId, exitType, token())),

    updatePositionExits: (positionId, takeProfit, stopLoss) =>
      settle(() =>
        paperApi.updatePositionExits(
          positionId,
          {
            takeProfit: takeProfit === null ? null : dec(takeProfit),
            stopLoss: stopLoss === null ? null : dec(stopLoss),
          },
          token()
        )
      ),

    editPendingOrder: async (
      orderId,
      newTriggerPrice,
      newUsdtAmount,
      newTakeProfit,
      newStopLoss
    ) => {
      try {
        const res = await paperApi.editOrder(
          orderId,
          {
            triggerPrice: dec(newTriggerPrice),
            usdtAmount: dec(newUsdtAmount),
            takeProfit: newTakeProfit === null ? null : dec(newTakeProfit),
            stopLoss: newStopLoss === null ? null : dec(newStopLoss),
          },
          token()
        );
        applyResponse(res);
        return res.result;
      } catch (err) {
        if (errorMessage(err) === 'Not found') return 'not-found';
        if (import.meta.env.DEV) console.error('[paperStore] edit failed:', err);
        return 'error'; // request failed — nothing changed on the server
      }
    },

    addJournalNote: (text) => settle(() => paperApi.addNote({ text }, token())),

    editJournalEntry: (entryId, text) =>
      settle(() => paperApi.editNote(entryId, { text }, token())),

    setLeverage: (v) => {
      const leverage = Math.min(Math.max(Number.isFinite(v) ? Math.round(v) : 1, 1), MAX_LEVERAGE);
      return settle(() => paperApi.setLeverage(leverage, token()));
    },

    reset: () => settle(() => paperApi.resetAccount(token())),
  };
});
