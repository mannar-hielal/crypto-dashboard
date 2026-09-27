/**
 * Executes paper-trading intents for a user (BYBIT_PARITY_PLAN BP-1, BP-2, BP-3).
 *
 * The browser sends intent only (market, symbol, side, size, trigger price, TP/SL). The server
 * picks the fill price from its own live quote (ask / bid of that market), applies Bybit's
 * instrument rules, runs the pure engine and persists the result. Every change for one user is
 * serialized: an in-process per-user queue, plus the Account.version check in AccountRepository
 * against other machines. After each commit the delta goes on the event bus.
 */

import { randomBytes } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/client';
import type { PaperDeltaDTO, PaperSound } from '@crypto-dashboard/sdk';
import { logger } from '../logger.js';
import {
  AccountRepository,
  RecordNotFoundError,
  VersionConflictError,
} from './AccountRepository.js';
import { PaperEventBus } from './PaperEventBus.js';
import { deltaDTO } from './mappers.js';
import type { RiskTier } from './bybitSpec.js';
import {
  addNote,
  adjustMargin,
  applyDelta,
  cancelExitLeg,
  cancelPending,
  cancelPendingExitLeg,
  checkPendingTrigger,
  closePosition,
  editNote,
  editPending,
  editSpotLimit,
  executeTrigger,
  isLiquidatable,
  legHit,
  legTriggerBy,
  orderTriggerBy,
  placeMarket,
  placePending,
  placeSpotExits,
  placeSpotLimit,
  placeSpotMarket,
  resetAccount,
  setLeverage,
  setSymbolLeverage,
  settleFunding,
  updatePositionExits,
  type AccountState,
  type ActionResult,
  type Category,
  type EngineContext,
  type ExitLeg,
  type FundingSpec,
  type InstrumentRules,
  type OrderSide,
  type OrderSize,
  type PendingEdit,
  type Quote,
  type SpotExitsIntent,
  type Trigger,
  type TriggerBy,
} from './engine/index.js';

const log = logger.child({ service: 'TradingService' });

const MAX_ATTEMPTS = 3;
export const WAITING_FOR_PRICE = 'Waiting for live price…';
/** A quote older than this is not traded on (the market feed may have stalled) — plan Q14 */
export const MAX_QUOTE_AGE_MS = 10_000;

/** A request the engine can't serve — mapped to an HTTP status by the routes. */
export class TradingError extends Error {
  constructor(
    readonly statusCode: 404 | 409 | 422 | 503,
    message: string
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

/** A live quote, with when the market feed last confirmed it (Unix ms). */
export interface TimedQuote extends Quote {
  seenAt: number;
}

/** Live quotes, instrument rules and risk-limit tiers per market (the server's Bybit feed and cache). */
export interface MarketSource {
  quote(category: Category, symbol: string): TimedQuote | undefined;
  rules(category: Category, symbol: string): InstrumentRules;
  /** USDT Perpetual risk-limit tiers, lowest first (BP-3) */
  riskTiers(symbol: string): RiskTier[];
}

export interface Executed<R> {
  result: R;
  delta: PaperDeltaDTO;
  sound?: PaperSound;
}

export interface PlaceOrderIntent {
  category: Category;
  symbol: string;
  side: OrderSide;
  type: 'market' | 'limit' | 'stop';
  size: OrderSize;
  triggerPrice?: Decimal;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
  /** BP-5 B: trigger sources, reduce-only and close-on-trigger (USDT Perpetual) */
  triggerBy?: TriggerBy;
  tpTriggerBy?: TriggerBy;
  slTriggerBy?: TriggerBy;
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
}

export class TradingService {
  /** Per-user promise chain — one mutation at a time per account on this machine. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: AccountRepository,
    private readonly market: MarketSource,
    private readonly events: PaperEventBus,
    private readonly now: () => number = Date.now
  ) {}

  private engineContext(): EngineContext {
    const now = Date.now();
    // `${now}-${random}` like the browser engine's ids, with more entropy: ids are primary keys
    // shared by every account.
    return {
      now,
      newId: () => `${now}-${randomBytes(6).toString('base64url')}`,
      riskTiers: (symbol) => this.market.riskTiers(symbol),
    };
  }

  private withUserQueue<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(userId, settled);
    // Bounded: forget the chain once nothing is queued behind this call
    void settled.then(() => {
      if (this.queues.get(userId) === settled) this.queues.delete(userId);
    });
    return run;
  }

  /** Load → decide → persist, retrying on a concurrent change; then publish. */
  private run<R>(
    userId: string,
    decide: (state: AccountState, ctx: EngineContext) => ActionResult<R> | null
  ): Promise<Executed<R> | null> {
    return this.withUserQueue(userId, async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const outcome = await this.repo.mutate(userId, (loaded) =>
            decide(loaded.state, this.engineContext())
          );
          if (!outcome) return null;
          // Refused by Bybit's rules before anything changed (nothing was written)
          if (outcome.invalid) throw new TradingError(422, outcome.invalid);
          const dto = deltaDTO(outcome.delta, outcome.version, (symbol) =>
            this.market.riskTiers(symbol)
          );
          if (!outcome.changed) return { result: outcome.result, delta: dto }; // no-op: nothing to push
          this.events.publish({
            userId,
            delta: dto,
            sound: outcome.sound,
            state: applyDelta(outcome.before, outcome.delta),
          });
          return { result: outcome.result, delta: dto, sound: outcome.sound };
        } catch (err) {
          if (err instanceof VersionConflictError && attempt < MAX_ATTEMPTS) {
            log.warn({ userId, attempt }, 'Paper account version conflict — retrying');
            continue;
          }
          if (err instanceof VersionConflictError) {
            throw new TradingError(409, 'Account changed — please retry');
          }
          if (err instanceof RecordNotFoundError) throw new TradingError(404, 'Not found');
          throw err;
        }
      }
    });
  }

  /** Like run(), for actions that always produce a delta. */
  private async act<R>(
    userId: string,
    decide: (state: AccountState, ctx: EngineContext) => ActionResult<R>
  ): Promise<Executed<R>> {
    const executed = await this.run(userId, decide);
    // decide never returns null here, so run() always returns an outcome
    return executed as Executed<R>;
  }

  /** The live quote if it is complete and fresh, else undefined. */
  private currentQuote(category: Category, symbol: string): Quote | undefined {
    const q = this.market.quote(category, symbol);
    if (!q || q.bid.lte(0) || q.ask.lte(0) || q.last.lte(0)) return undefined;
    if (this.now() - q.seenAt > MAX_QUOTE_AGE_MS) return undefined;
    return q;
  }

  /** The fresh USDT Perpetual mark price, else undefined (never liquidate on a stale mark). */
  private currentMark(symbol: string): Decimal | undefined {
    const mark = this.currentQuote('linear', symbol)?.mark;
    return mark && mark.gt(0) ? mark : undefined;
  }

  /** 🔐 The quote a fill uses — the client never supplies a price (F11). */
  private liveQuote(category: Category, symbol: string): Quote {
    const q = this.currentQuote(category, symbol);
    if (!q) throw new TradingError(409, WAITING_FOR_PRICE);
    return q;
  }

  // ─── Intents ─────────────────────────────────────────────────────────────────

  async placeOrder(userId: string, intent: PlaceOrderIntent): Promise<Executed<string | null>> {
    return intent.category === 'spot'
      ? this.placeSpotOrder(userId, intent)
      : this.placeLinearOrder(userId, intent);
  }

  /** Spot: market and limit (a limit needs the book to know whether it crosses). */
  private placeSpotOrder(
    userId: string,
    intent: PlaceOrderIntent
  ): Promise<Executed<string | null>> {
    const { symbol, type } = intent;
    if (type === 'stop') throw new TradingError(422, 'Spot supports market and limit orders');
    const rules = this.market.rules('spot', symbol);
    this.liveQuote('spot', symbol); // fail fast; read again at execution time
    if (type === 'market') {
      return this.act(userId, (state, ctx) =>
        placeSpotMarket(state, intent, this.liveQuote('spot', symbol), rules, ctx)
      );
    }
    const { triggerPrice } = intent;
    if (!triggerPrice) throw new TradingError(422, 'Limit price required');
    return this.act(userId, (state, ctx) =>
      placeSpotLimit(state, { ...intent, triggerPrice }, this.liveQuote('spot', symbol), rules, ctx)
    );
  }

  /** Spot TP / SL on coins already held. Result: the OCO pair id. */
  async placeSpotExits(userId: string, intent: SpotExitsIntent): Promise<Executed<string | null>> {
    const rules = this.market.rules('spot', intent.symbol);
    this.liveQuote('spot', intent.symbol);
    return this.act(userId, (state, ctx) =>
      placeSpotExits(state, intent, this.liveQuote('spot', intent.symbol), rules, ctx)
    );
  }

  private placeLinearOrder(
    userId: string,
    intent: PlaceOrderIntent
  ): Promise<Executed<string | null>> {
    const { category, symbol } = intent;
    const rules = this.market.rules(category, symbol);
    if (intent.type === 'market') {
      // Fail fast with no quote, then read it again at execution time (inside decide): the order
      // may wait in the per-user queue or be retried after a version conflict.
      this.liveQuote(category, symbol);
      return this.act(userId, (state, ctx) =>
        placeMarket(state, intent, this.liveQuote(category, symbol), rules, ctx)
      );
    }
    const { triggerPrice } = intent;
    if (!triggerPrice) throw new TradingError(422, 'Trigger price required');
    const type = intent.type;
    // A limit needs the book to know whether it crosses (fills now as a taker) or rests
    if (type === 'limit') this.liveQuote(category, symbol);
    return this.act(userId, (state, ctx) =>
      placePending(
        state,
        { ...intent, type, triggerPrice },
        type === 'limit' ? this.liveQuote(category, symbol) : undefined,
        rules,
        ctx
      )
    );
  }

  cancelOrder(userId: string, orderId: string): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelPending(state, orderId, ctx));
  }

  editOrder(
    userId: string,
    orderId: string,
    edit: PendingEdit
  ): Promise<Executed<'ok' | 'rejected' | 'not-found'>> {
    return this.act(userId, (state, ctx) => {
      const order = state.pendingOrders.find((o) => o.id === orderId);
      if (!order)
        return editPending(state, orderId, edit, undefined, this.market.rules('linear', ''), ctx);
      const { category, symbol } = order;
      if (category === 'spot') {
        return editSpotLimit(
          state,
          orderId,
          edit,
          this.liveQuote(category, symbol),
          this.market.rules(category, symbol),
          ctx
        );
      }
      return editPending(
        state,
        orderId,
        edit,
        order.type === 'limit' ? this.liveQuote(category, symbol) : undefined,
        this.market.rules(category, symbol),
        ctx
      );
    });
  }

  cancelOrderExit(userId: string, orderId: string, leg: ExitLeg): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelPendingExitLeg(state, orderId, leg, ctx));
  }

  /**
   * Set / change / remove a position's TP and SL. A new or changed leg is checked against the
   * current price of its trigger source (O9) — with no fresh quote it waits for one.
   */
  updatePositionExits(
    userId: string,
    positionId: string,
    takeProfit: Decimal | null,
    stopLoss: Decimal | null,
    by: { tpTriggerBy?: TriggerBy; slTriggerBy?: TriggerBy } = {}
  ): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => {
      const pos = state.positions.find((p) => p.id === positionId);
      const q = pos ? this.currentQuote(pos.category, pos.symbol) : undefined;
      return updatePositionExits(state, positionId, takeProfit, stopLoss, ctx, {
        ...by,
        prices: { last: q?.last, mark: q?.mark, index: q?.index },
      });
    });
  }

  cancelPositionExit(userId: string, positionId: string, leg: ExitLeg): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelExitLeg(state, positionId, leg, ctx));
  }

  /** Market close: a long at the bid, a short at the ask. Result: gross PnL, or null if not found. */
  closePosition(userId: string, positionId: string): Promise<Executed<Decimal | null>> {
    return this.act(userId, (state, ctx) => {
      const pos = state.positions.find((p) => p.id === positionId);
      const zero = new Decimal(0);
      if (!pos) return closePosition(state, positionId, { last: zero, bid: zero, ask: zero }, ctx);
      return closePosition(state, positionId, this.liveQuote(pos.category, pos.symbol), ctx);
    });
  }

  /**
   * Add (amount > 0) or reduce (amount < 0) an isolated position's margin (BP-5 A). A reduction is
   * checked against the live mark price. Result: the position's new extra margin.
   */
  adjustMargin(
    userId: string,
    positionId: string,
    amount: Decimal
  ): Promise<Executed<Decimal | null>> {
    return this.act(userId, (state, ctx) => {
      const pos = state.positions.find((p) => p.id === positionId);
      return adjustMargin(
        state,
        positionId,
        amount,
        ctx,
        pos ? this.currentMark(pos.symbol) : undefined
      );
    });
  }

  /** Per-symbol leverage; an open position / active orders are re-margined (BP-3). */
  setSymbolLeverage(userId: string, symbol: string, leverage: number): Promise<Executed<number>> {
    return this.act(userId, (state, ctx) =>
      setSymbolLeverage(state, symbol, leverage, ctx, this.currentMark(symbol))
    );
  }

  /** Default leverage (pre-BP-2 clients' account-wide leverage). */
  setLeverage(userId: string, leverage: number): Promise<Executed<number>> {
    return this.act(userId, (state) => setLeverage(state, leverage));
  }

  reset(userId: string): Promise<Executed<boolean>> {
    return this.act(userId, (state) => resetAccount(state));
  }

  addNote(userId: string, text: string): Promise<Executed<string>> {
    return this.act(userId, (state, ctx) => addNote(state, text, ctx));
  }

  editNote(userId: string, entryId: string, text: string): Promise<Executed<boolean>> {
    return this.act(userId, (state) => editNote(state, entryId, text));
  }

  /**
   * Settle one funding timestamp for one account (BP-4). The engine supplies the settled rate, the
   * mark at the timestamp and the account's positions as they were then; the action is a no-op if
   * that timestamp was already settled. Result: the number of positions settled.
   */
  runFunding(userId: string, spec: FundingSpec): Promise<Executed<number> | null> {
    return this.run(userId, (state, ctx) => settleFunding(state, spec, ctx));
  }

  /**
   * Execute an engine trigger (liquidation, TP/SL hit or pending fill). It is re-checked against
   * the account's current state first — an edit, cancel or earlier trigger may have made it
   * stale — and dropped if no longer valid. A stop / TP / SL fills at the live ask / bid when there
   * is a fresh quote, otherwise at the level it triggered on. A live liquidation is re-checked on
   * the current, fresh mark price (a backfilled one on the mark candle that triggered it).
   */
  runTrigger(userId: string, trigger: Trigger): Promise<Executed<unknown> | null> {
    return this.run(userId, (state, liveCtx) => {
      // A backfilled trigger happened in the past: its records (and a position it opens) are
      // stamped at its candle, never later than now
      const ctx =
        trigger.at !== undefined ? { ...liveCtx, now: Math.min(trigger.at, liveCtx.now) } : liveCtx;
      let market: { category: Category; symbol: string };
      if (trigger.kind === 'liquidation') {
        const pos = state.positions.find((p) => p.id === trigger.positionId);
        if (!pos) return null;
        // A backfilled one runs at the minute's worst mark: every tier step it reached (BP-5 C)
        const mark = trigger.fillAt
          ? (trigger.worstMark ?? trigger.price)
          : this.currentMark(pos.symbol);
        if (!mark || !isLiquidatable(pos, mark, this.market.riskTiers(pos.symbol))) return null;
        return executeTrigger(state, { ...trigger, price: mark }, undefined, ctx);
      }
      if (trigger.kind === 'exit') {
        const pos = state.positions.find((p) => p.id === trigger.positionId);
        // Still set, still on the source it triggered on, and still reached
        if (
          !pos ||
          legTriggerBy(pos, trigger.leg) !== (trigger.by ?? 'LastPrice') ||
          !legHit(pos, trigger.leg, trigger.price)
        ) {
          return null;
        }
        market = pos;
      } else {
        const order = state.pendingOrders.find((o) => o.id === trigger.orderId);
        if (
          !order ||
          orderTriggerBy(order) !== (trigger.by ?? 'LastPrice') ||
          !checkPendingTrigger(order, trigger.price)
        ) {
          return null;
        }
        market = order;
      }
      const quote = trigger.fillAt ? undefined : this.currentQuote(market.category, market.symbol);
      return executeTrigger(state, trigger, quote, ctx);
    });
  }
}
