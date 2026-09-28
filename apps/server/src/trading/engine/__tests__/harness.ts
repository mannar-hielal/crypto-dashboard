/**
 * Test harness: the browser store's API (paperStore.ts) on top of the pure server engine, with
 * plain numbers in the read view. It lets the old store tests port over nearly unchanged, which
 * is the evidence that the BP-1 port didn't change behaviour.
 *
 * BP-2: a test's `price` is the whole quote (last = bid = ask), sizes are given as margin (the
 * browser's usdtAmount), and the instrument rules are permissive unless a test sets `rules`, so
 * only the fee numbers differ from BP-1 (Bybit's USDT Perpetual rates, see fees below).
 *
 * `apply()` folds each Delta into client-style lists (newest first, capped), the same way the
 * browser read model does.
 */

import { Decimal } from '@prisma/client/runtime/client';
import {
  MAX_BALANCE_EVENTS,
  MAX_HISTORY,
  MAX_JOURNAL,
  MAX_ORDERS,
  STARTING_BALANCE,
  addNote,
  applyDelta,
  cancelExitLeg,
  cancelPending,
  cancelPendingExitLeg,
  closePositionAs,
  editNote,
  editPending,
  fillPending,
  placeMarket,
  placePending,
  resetAccount,
  updatePositionExits,
  type AccountState,
  type ActionResult,
  type EngineContext,
  type ExitLeg,
  type HistoricalOrder,
  type InstrumentRules,
  type OrderSide,
  type PendingOrder,
  type Position,
  type Quote,
} from '../index.js';

/** USDT Perpetual fee rates the engine charges (bybitSpec.ts) */
export const TAKER = 0.00055;
export const MAKER = 0.0002;

/** No rounding, no minimum — the BP-1 cases size orders freely */
export const OPEN_RULES: InstrumentRules = {
  tickSize: new Decimal(0),
  qtyStep: new Decimal(0),
  minOrderQty: new Decimal(0),
  minNotional: new Decimal(0),
};

export function flatQuote(price: number): Quote {
  const p = new Decimal(price);
  return { last: p, bid: p, ask: p };
}

// ─── Number views (what the client shows) ──────────────────────────────────────

const num = (d: Decimal) => d.toNumber();
const optNum = (d: Decimal | undefined) => (d === undefined ? undefined : d.toNumber());
const dec = (v: number | undefined | null) =>
  v === undefined || v === null ? undefined : new Decimal(v);

export function positionView(p: Position) {
  return {
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    quantity: num(p.quantity),
    entryPrice: num(p.entryPrice),
    entryUsdtAmount: num(p.entryUsdtAmount),
    leverage: p.leverage,
    entryFee: num(p.entryFee),
    closeFeeReserve: num(p.closeFeeReserve),
    openedAt: p.openedAt,
    takeProfit: optNum(p.takeProfit),
    stopLoss: optNum(p.stopLoss),
  };
}

export function pendingView(o: PendingOrder) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    usdtAmount: num(o.usdtAmount),
    reserved: num(o.reserved),
    triggerPrice: num(o.triggerPrice),
    qty: num(o.qty),
    leverage: o.leverage,
    takeProfit: optNum(o.takeProfit),
    stopLoss: optNum(o.stopLoss),
    placedAt: o.placedAt,
  };
}

function orderView(o: HistoricalOrder) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: num(o.qty),
    limitPrice: optNum(o.limitPrice),
    stopPrice: optNum(o.stopPrice),
    fillPrice: optNum(o.fillPrice),
    status: o.status,
    commission: num(o.commission),
    feeRate: optNum(o.feeRate),
    isMaker: o.isMaker,
    margin: optNum(o.margin),
    placingTime: o.placingTime,
    closingTime: o.closingTime,
    rejectionReason: o.rejectionReason,
  };
}

export type OrderView = ReturnType<typeof orderView>;

export interface HistoryView {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
}

export interface JournalView {
  id: string;
  time: number;
  text: string;
  isUserNote: boolean;
  pnl?: number;
}

export interface BalanceView {
  id: string;
  time: number;
  balanceBefore: number;
  balanceAfter: number;
  pnl: number;
  action: string;
}

// ─── Harness ───────────────────────────────────────────────────────────────────

export class PaperHarness {
  private state: AccountState = PaperHarness.freshState();
  history: HistoryView[] = [];
  orders: OrderView[] = [];
  balanceLog: BalanceView[] = [];
  journal: JournalView[] = [];
  /** Advancing clock and id counter: deterministic, unique, increasing */
  private clock = 1_700_000_000_000;
  private seq = 0;
  /** Sound of the last action (what every tab would play) */
  lastSound: string | undefined;
  /** Refusal message of the last action (Bybit rules), if any */
  lastInvalid: string | undefined;
  /** Instrument rules the next actions use */
  rules: InstrumentRules = OPEN_RULES;
  /** Book the next limit placement / edit checks for crossing (none = never crosses) */
  book: Quote | undefined;

  static freshState(): AccountState {
    return {
      balance: new Decimal(STARTING_BALANCE),
      realizedPnl: new Decimal(0),
      leverage: 1,
      symbolLeverage: {},
      symbolFundingAt: {},
      spot: [],
      positions: [],
      pendingOrders: [],
    };
  }

  private ctx(): EngineContext {
    this.clock += 1;
    return {
      now: this.clock,
      newId: () => `${this.clock}-${(++this.seq).toString(36).padStart(5, '0')}`,
    };
  }

  get raw(): AccountState {
    return this.state;
  }
  get balance(): number {
    return num(this.state.balance);
  }
  get realizedPnl(): number {
    return num(this.state.realizedPnl);
  }
  get leverage(): number {
    return this.state.leverage;
  }
  get positions() {
    return this.state.positions.map(positionView);
  }
  get pendingOrders() {
    return this.state.pendingOrders.map(pendingView);
  }

  /** Fold a delta into the state and the client-style lists (newest first, capped). */
  apply<R>(res: ActionResult<R>): R {
    const { delta } = res;
    this.lastSound = res.sound;
    this.lastInvalid = res.invalid;
    if (delta.reset) {
      this.history = [];
      this.orders = [];
      this.balanceLog = [];
      this.journal = [];
    }
    this.state = applyDelta(this.state, delta);
    this.orders = [...delta.orders.map(orderView), ...this.orders].slice(0, MAX_ORDERS);
    this.history = [
      ...delta.trades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        quantity: num(t.quantity),
        entryPrice: num(t.entryPrice),
        exitPrice: num(t.exitPrice),
        pnl: num(t.pnl),
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      ...this.history,
    ].slice(0, MAX_HISTORY);
    this.balanceLog = [
      ...delta.balanceEvents.map((b) => ({
        id: b.id,
        time: b.time,
        balanceBefore: num(b.balanceBefore),
        balanceAfter: num(b.balanceAfter),
        pnl: num(b.pnl),
        action: b.action,
      })),
      ...this.balanceLog,
    ].slice(0, MAX_BALANCE_EVENTS);
    this.journal = [
      ...delta.journal.map((j) => ({
        id: j.id,
        time: j.time,
        text: j.text,
        isUserNote: j.isUserNote,
        ...(j.pnl !== undefined ? { pnl: num(j.pnl) } : {}),
      })),
      ...this.journal,
    ].slice(0, MAX_JOURNAL);
    for (const edit of delta.journalEdits) {
      this.journal = this.journal.map((e) =>
        e.id === edit.id && e.isUserNote ? { ...e, text: edit.text } : e
      );
    }
    return res.result;
  }

  // ─── The browser store's action API ──────────────────────────────────────────

  placeOrder(
    symbol: string,
    side: OrderSide,
    price: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ): string | null {
    return this.apply(
      placeMarket(
        this.state,
        {
          symbol,
          side,
          size: { margin: new Decimal(usdtAmount) },
          takeProfit: dec(takeProfit),
          stopLoss: dec(stopLoss),
        },
        flatQuote(price),
        this.rules,
        this.ctx()
      )
    );
  }

  closePosition(positionId: string, exitPrice: number, reason?: string, closeType?: ExitLeg): void {
    this.apply(
      closePositionAs(this.state, positionId, new Decimal(exitPrice), this.ctx(), reason, closeType)
    );
  }

  placeLimitOrder(
    symbol: string,
    side: OrderSide,
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ): string | null {
    return this.placePendingOrder(
      'limit',
      symbol,
      side,
      triggerPrice,
      usdtAmount,
      takeProfit,
      stopLoss
    );
  }

  placeStopOrder(
    symbol: string,
    side: OrderSide,
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ): string | null {
    return this.placePendingOrder(
      'stop',
      symbol,
      side,
      triggerPrice,
      usdtAmount,
      takeProfit,
      stopLoss
    );
  }

  private placePendingOrder(
    type: 'limit' | 'stop',
    symbol: string,
    side: OrderSide,
    triggerPrice: number,
    usdtAmount: number,
    takeProfit?: number,
    stopLoss?: number
  ): string | null {
    return this.apply(
      placePending(
        this.state,
        {
          symbol,
          side,
          type,
          triggerPrice: new Decimal(triggerPrice),
          size: { margin: new Decimal(usdtAmount) },
          takeProfit: dec(takeProfit),
          stopLoss: dec(stopLoss),
        },
        this.book,
        this.rules,
        this.ctx()
      )
    );
  }

  /**
   * The monitor's fill (fillPendingOrder + placeOrder + journal notes) in one engine action, at
   * `fillPrice`. Limits fill as maker, stops as taker (as executeTrigger decides).
   */
  fillPending(orderId: string, fillPrice: number): string | null {
    const order = this.state.pendingOrders.find((o) => o.id === orderId);
    return this.apply(
      fillPending(
        this.state,
        orderId,
        { price: new Decimal(fillPrice), isMaker: order?.type === 'limit' },
        this.ctx()
      )
    );
  }

  cancelPendingOrder(orderId: string): void {
    this.apply(cancelPending(this.state, orderId, this.ctx()));
  }

  cancelExitOrder(positionId: string, leg: ExitLeg): void {
    this.apply(cancelExitLeg(this.state, positionId, leg, this.ctx()));
  }

  cancelPendingExitLeg(orderId: string, leg: ExitLeg): void {
    this.apply(cancelPendingExitLeg(this.state, orderId, leg, this.ctx()));
  }

  updatePositionExits(
    positionId: string,
    takeProfit: number | null,
    stopLoss: number | null
  ): void {
    this.apply(
      updatePositionExits(
        this.state,
        positionId,
        dec(takeProfit) ?? null,
        dec(stopLoss) ?? null,
        this.ctx()
      )
    );
  }

  editPendingOrder(
    orderId: string,
    triggerPrice: number,
    usdtAmount: number,
    takeProfit: number | null,
    stopLoss: number | null
  ): 'ok' | 'rejected' | 'not-found' {
    return this.apply(
      editPending(
        this.state,
        orderId,
        {
          triggerPrice: new Decimal(triggerPrice),
          size: { margin: new Decimal(usdtAmount) },
          takeProfit: dec(takeProfit) ?? null,
          stopLoss: dec(stopLoss) ?? null,
        },
        this.book,
        this.rules,
        this.ctx()
      )
    );
  }

  addJournalNote(text: string): string {
    return this.apply(addNote(this.state, text, this.ctx()));
  }

  editJournalEntry(entryId: string, text: string): void {
    this.apply(editNote(this.state, entryId, text));
  }

  /** Test fixture: the account's default leverage for symbols without their own setting. */
  setDefaultLeverage(value: number): void {
    this.state = { ...this.state, leverage: value };
  }

  reset(): void {
    this.apply(resetAccount(this.state));
  }
}
