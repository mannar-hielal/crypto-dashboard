/**
 * Paper Trading Store — read model of the server-side engine (BYBIT_PARITY_PLAN BP-1, BP-2).
 *
 * BP-2: two markets — Spot (coin balances, `spotBalances`) and USDT Perpetual (positions, per-symbol
 * leverage). Every record names its market (`category`). Fees shown before an order is sent are
 * estimates from the SDK's copy of Bybit's rates (FEE_RATES); the server charges the real fee.
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
  MAX_LEVERAGE,
  STARTING_BALANCE,
  paperApi,
  type MarketCategory,
  type PaperDeltaDTO,
  type PaperExitLeg,
  type PaperOrderDTO,
  type PaperPendingOrderDTO,
  type PaperPendingType,
  type PaperPositionDTO,
  type PaperPriceDTO,
  type PaperSound,
  type PaperSpotBalanceDTO,
  type PaperStateDTO,
} from '@crypto-dashboard/sdk';
import { useAuthStore } from './authStore';
import { setLastKnownMarkPrice, setLastKnownPrice } from './paneStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 100;
const MAX_ORDERS = 200;
const MAX_BALANCE_LOG = 200;
const MAX_JOURNAL = 200;

export { MAX_LEVERAGE };

/** Leverage presets for the USDT Perpetual leverage picker (capped at MAX_LEVERAGE). */
export const CRYPTO_LEVERAGE_OPTIONS = [1, 2, 3, 5, MAX_LEVERAGE] as const;
export type CryptoLeverage = (typeof CRYPTO_LEVERAGE_OPTIONS)[number];

/** Pre-BP-1 persisted trading state — the server is the only source now. */
const LEGACY_STORAGE_KEY = 'cd-paper-trading';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A USDT Perpetual position (spot holds coin balances instead) — one per symbol (one-way mode).
 * The margin figures are the server's, from Bybit's isolated-margin maths (BP-3).
 */
export interface Position {
  id: string;
  category: 'linear';
  symbol: string;
  side: 'long' | 'short';
  quantity: number; // base-asset qty (e.g. BTC)
  entryPrice: number; // fill price (USD)
  entryUsdtAmount: number; // initial margin
  leverage: number;
  /** Open fee charged (USDT) */
  entryFee: number;
  /** Estimated close fee held with the margin (position margin = entryUsdtAmount + this) */
  closeFeeReserve: number;
  /** Margin added on top of IM (0 until add / remove margin exists) */
  extraMargin: number;
  /**
   * Mark price at or past which it is liquidated; 0 = can't be liquidated (a 1× long); null =
   * unknown (a pre-BP-3 server sent none — never shown as "safe")
   */
  liqPrice: number | null;
  /** Price it closes at when liquidated — the whole position margin is lost there; null = unknown */
  bustPrice: number | null;
  /** Bybit positionIM: initial margin + fee to close */
  positionIM: number;
  /** Bybit positionMM: maintenance margin (liquidation when equity falls to it); null = unknown */
  positionMM: number | null;
  openedAt: number; // Unix ms
  takeProfit?: number;
  stopLoss?: number;
}

/** A spot coin balance. The USDT wallet is `balance`. */
export interface SpotBalance {
  coin: string;
  /** Sellable now */
  free: number;
  /** Backing resting sell / TP / SL orders */
  locked: number;
  /** Average cost per coin in USDT, fees included */
  avgCost: number;
}

export interface ClosedTrade {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number; // gross realized PnL in USDT (negative = loss)
  openedAt: number;
  closedAt: number;
  /** True when it was closed by liquidation at the bankruptcy price (Bybit BustTrade) */
  liquidated?: boolean;
}

export type OrderStatus = 'filled' | 'cancelled' | 'rejected';
export type OrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';

export interface PendingOrder {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: 'buy' | 'sell';
  /** take-profit / stop-loss: a spot TP / SL leg protecting a coin balance */
  type: PaperPendingType;
  usdtAmount: number; // perpetual: initial margin at the trigger; spot: order value
  /** What placing it set aside: USDT, or the locked coin quantity for a spot sell / TP / SL */
  reserved: number;
  triggerPrice: number; // limit or trigger price
  qty: number; // base-asset qty
  /** Leverage captured at placement — the fill uses it (1 on spot) */
  leverage: number;
  /** Spot TP / SL pair id: filling one leg cancels the other */
  ocoGroup?: string;
  takeProfit?: number;
  stopLoss?: number;
  placedAt: number;
}

export interface HistoricalOrder {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: 'buy' | 'sell';
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  fillPrice?: number;
  status: OrderStatus;
  /** Fee charged, in `feeAsset` */
  commission: number;
  /** Fee rate of a fill; absent on cancel / reject rows (and on pre-BP-2 cancels) */
  feeRate?: number;
  feeAsset?: string;
  /** True for a maker (resting limit) fill */
  isMaker?: boolean;
  /** USDT margin used for this order entry (omitted for closing orders) */
  margin?: number;
  /** Leverage of a USDT Perpetual entry */
  leverage?: number;
  placingTime: number;
  closingTime: number;
  /** Why the order was rejected (only set when status === 'rejected') */
  rejectionReason?: string;
  /** The system order that closed a liquidated position (Bybit createType CreateByLiq) */
  liquidation?: boolean;
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

/**
 * An order as the user entered it. Size is a base-coin `qty` or a USDT notional `value`
 * (Bybit's "by value"); the server converts a value at the fill / trigger price and rounds to
 * the instrument's qty step.
 */
export interface OrderRequest {
  category: MarketCategory;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  size: { qty: number } | { value: number };
  /** Limit price, or stop trigger */
  triggerPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
}

// ─── DTO → view mappers ───────────────────────────────────────────────────────

const toNum = (v: string) => Number(v);
const optNum = (v: string | undefined) => (v === undefined ? undefined : Number(v));
/** A BP-3 risk figure — optional on the DTO: a pre-BP-3 server sends none (unknown, not 0) */
const optRisk = (v: string | undefined): number | null => (v === undefined ? null : Number(v));

function positionFrom(p: PaperPositionDTO): Position {
  return {
    id: p.id,
    category: 'linear',
    symbol: p.symbol,
    side: p.side,
    quantity: toNum(p.quantity),
    entryPrice: toNum(p.entryPrice),
    entryUsdtAmount: toNum(p.entryUsdtAmount),
    leverage: p.leverage,
    entryFee: toNum(p.entryFee),
    closeFeeReserve: toNum(p.closeFeeReserve),
    extraMargin: toNum(p.extraMargin ?? '0'),
    // A pre-BP-3 server (rolling deploy) sends no risk figures: they stay unknown (null), never
    // "0", which would read as "can't be liquidated" / "no maintenance margin" — falsely safe
    liqPrice: optRisk(p.liqPrice),
    bustPrice: optRisk(p.bustPrice),
    // positionIM = IM + fee to close (server formula), so it can be rebuilt from the stored parts
    positionIM:
      p.positionIM !== undefined
        ? toNum(p.positionIM)
        : toNum(p.entryUsdtAmount) + toNum(p.closeFeeReserve),
    positionMM: optRisk(p.positionMM),
    openedAt: p.openedAt,
    ...(p.takeProfit !== undefined ? { takeProfit: toNum(p.takeProfit) } : {}),
    ...(p.stopLoss !== undefined ? { stopLoss: toNum(p.stopLoss) } : {}),
  };
}

function spotFrom(h: PaperSpotBalanceDTO): SpotBalance {
  return {
    coin: h.coin,
    free: toNum(h.free),
    locked: toNum(h.locked),
    avgCost: toNum(h.avgCost),
  };
}

function pendingFrom(o: PaperPendingOrderDTO): PendingOrder {
  return {
    id: o.id,
    category: o.category,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    usdtAmount: toNum(o.usdtAmount),
    reserved: toNum(o.reserved),
    triggerPrice: toNum(o.triggerPrice),
    qty: toNum(o.qty),
    leverage: o.leverage,
    placedAt: o.placedAt,
    ...(o.ocoGroup ? { ocoGroup: o.ocoGroup } : {}),
    ...(o.takeProfit !== undefined ? { takeProfit: toNum(o.takeProfit) } : {}),
    ...(o.stopLoss !== undefined ? { stopLoss: toNum(o.stopLoss) } : {}),
  };
}

function orderFrom(o: PaperOrderDTO): HistoricalOrder {
  return {
    id: o.id,
    category: o.category,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: toNum(o.qty),
    limitPrice: optNum(o.limitPrice),
    stopPrice: optNum(o.stopPrice),
    fillPrice: optNum(o.fillPrice),
    status: o.status,
    commission: toNum(o.commission),
    feeRate: optNum(o.feeRate),
    ...(o.feeAsset ? { feeAsset: o.feeAsset } : {}),
    ...(o.isMaker !== undefined ? { isMaker: o.isMaker } : {}),
    margin: optNum(o.margin),
    ...(o.leverage !== undefined ? { leverage: o.leverage } : {}),
    placingTime: o.placingTime,
    closingTime: o.closingTime,
    ...(o.rejectionReason ? { rejectionReason: o.rejectionReason } : {}),
    ...(o.createType === 'CreateByLiq' ? { liquidation: true } : {}),
  };
}

function tradeFrom(t: PaperStateDTO['trades'][number]): ClosedTrade {
  return {
    id: t.id,
    category: t.category,
    symbol: t.symbol,
    side: t.side,
    quantity: toNum(t.quantity),
    entryPrice: toNum(t.entryPrice),
    exitPrice: toNum(t.exitPrice),
    pnl: toNum(t.pnl),
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    ...(t.execType === 'BustTrade' ? { liquidated: true } : {}),
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
    symbolLeverage: { ...state.account.symbolLeverage },
    spotBalances: state.spotBalances.map(spotFrom),
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

/** Replace changed coin balances by coin (a reset starts from none). */
function upsertSpot(list: SpotBalance[], changed: SpotBalance[]): SpotBalance[] {
  if (changed.length === 0) return list;
  const byCoin = new Map(list.map((h) => [h.coin, h]));
  for (const h of changed) byCoin.set(h.coin, h);
  return [...byCoin.values()];
}

/** The leverage a new USDT Perpetual order on `symbol` gets. */
export function leverageFor(
  state: { leverage: number; symbolLeverage: Record<string, number> },
  symbol: string
): number {
  // symbol comes from the allow-listed SYMBOLS — safe, controlled access
  return state.symbolLeverage[symbol] ?? state.leverage;
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
  /** Default USDT Perpetual leverage, for a symbol with no setting of its own */
  leverage: number;
  /** USDT Perpetual leverage per symbol (read through leverageFor) */
  symbolLeverage: Record<string, number>;
  /** Spot coin balances */
  spotBalances: SpotBalance[];
  /** When the server last pushed prices (they go to lastKnownPrices; this lets views re-render) */
  pricesAt: number;
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
  /** Live prices the server pushes for markets the account holds (feeds lastKnownPrices). */
  applyPrices: (items: PaperPriceDTO[]) => void;

  /** Market / limit / stop order (the server picks the fill price). */
  placeOrder: (order: OrderRequest) => Promise<PlaceResult>;
  /** Spot TP / SL on coins already held (locks `qty`). */
  placeSpotExits: (
    symbol: string,
    qty: number,
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
  /** Edit a pending order's price, base-coin qty and TP / SL. */
  editPendingOrder: (
    orderId: string,
    newTriggerPrice: number,
    newQty: number,
    newTakeProfit: number | null,
    newStopLoss: number | null
  ) => Promise<{ result: 'ok' | 'rejected' | 'not-found' | 'error'; error?: string }>;
  addJournalNote: (text: string) => Promise<ActionError>;
  editJournalEntry: (entryId: string, text: string) => Promise<ActionError>;
  /** USDT Perpetual leverage for one symbol (refused while it has open trades). */
  setSymbolLeverage: (symbol: string, v: number) => Promise<ActionError>;
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
  symbolLeverage: {} as Record<string, number>,
  spotBalances: [] as SpotBalance[],
  pricesAt: 0,
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

  return {
    ...EMPTY,

    hydrate: (state) => {
      // A snapshot older than what's shown (a slow GET /state racing the WS) must not roll back
      if (state.account.version < get().version) return;
      set({ ...mapServerState(state), isSyncing: false, lastSyncAt: Date.now() });
    },

    applyDelta: (delta, sound) => {
      const s = get();
      // Already applied (HTTP response + WS push of the same change) or stale (late response)
      if (delta.account.version <= s.version) return false;
      // Not loaded yet, or a skipped version (a change we never saw — e.g. an HTTP response that
      // overtook the WS push before it): applying this delta onto an empty or incomplete view would
      // hide the user's positions / history — reload the whole account instead.
      if (s.version < 0 || delta.account.version > s.version + 1) {
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
        symbolLeverage: { ...delta.account.symbolLeverage },
        spotBalances: upsertSpot(delta.reset ? [] : s.spotBalances, delta.spotUpsert.map(spotFrom)),
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

    applyPrices: (items) => {
      for (const p of items) {
        setLastKnownPrice(p.category, p.symbol, p.last);
        if (p.category === 'linear' && p.mark !== undefined)
          setLastKnownMarkPrice(p.symbol, p.mark);
      }
      if (items.length) set({ pricesAt: Date.now() });
    },

    placeOrder: async (order) => {
      const { takeProfit, stopLoss, triggerPrice } = order;
      try {
        const res = await paperApi.placeOrder(
          {
            category: order.category,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            ...('qty' in order.size
              ? { qty: dec(order.size.qty) }
              : { value: dec(order.size.value) }),
            ...(order.type !== 'market' && triggerPrice ? { triggerPrice: dec(triggerPrice) } : {}),
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

    placeSpotExits: async (symbol, qty, takeProfit, stopLoss) => {
      try {
        const res = await paperApi.placeSpotExits(
          {
            symbol,
            qty: dec(qty),
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

    editPendingOrder: async (orderId, newTriggerPrice, newQty, newTakeProfit, newStopLoss) => {
      try {
        const res = await paperApi.editOrder(
          orderId,
          {
            triggerPrice: dec(newTriggerPrice),
            qty: dec(newQty),
            takeProfit: newTakeProfit === null ? null : dec(newTakeProfit),
            stopLoss: newStopLoss === null ? null : dec(newStopLoss),
          },
          token()
        );
        applyResponse(res);
        return { result: res.result };
      } catch (err) {
        const message = errorMessage(err);
        if (message === 'Not found') return { result: 'not-found' };
        if (import.meta.env.DEV) console.error('[paperStore] edit failed:', err);
        // Refused (Bybit's size / tick rules) or the request failed — nothing changed
        return { result: 'error', error: message };
      }
    },

    addJournalNote: (text) => settle(() => paperApi.addNote({ text }, token())),

    editJournalEntry: (entryId, text) =>
      settle(() => paperApi.editNote(entryId, { text }, token())),

    setSymbolLeverage: (symbol, v) => {
      const leverage = Math.min(Math.max(Number.isFinite(v) ? Math.round(v) : 1, 1), MAX_LEVERAGE);
      return settle(() => paperApi.setSymbolLeverage(symbol, leverage, token()));
    },

    reset: () => settle(() => paperApi.resetAccount(token())),
  };
});
