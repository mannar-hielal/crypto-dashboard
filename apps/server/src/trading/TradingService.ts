/**
 * Executes paper-trading intents for a user (BYBIT_PARITY_PLAN BP-1).
 *
 * The browser sends intent only (symbol, side, amount, trigger price, TP/SL). The server picks
 * the fill price from its own live feed, runs the pure engine and persists the result. Every
 * change for one user is serialized: an in-process per-user queue, plus the Account.version check
 * in AccountRepository against other machines. After each commit the delta goes on the event bus.
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
import {
  addNote,
  applyDelta,
  cancelExitLeg,
  cancelPending,
  cancelPendingExitLeg,
  checkPendingTrigger,
  checkTPSL,
  closePosition,
  editNote,
  editPending,
  executeTrigger,
  placeMarket,
  placePending,
  resetAccount,
  setLeverage,
  updatePositionExits,
  type AccountState,
  type ActionResult,
  type EngineContext,
  type ExitLeg,
  type OrderSide,
  type Trigger,
} from './engine/index.js';

const log = logger.child({ service: 'TradingService' });

const MAX_ATTEMPTS = 3;
export const WAITING_FOR_PRICE = 'Waiting for live price…';

/** A request the engine can't serve — mapped to an HTTP status by the routes. */
export class TradingError extends Error {
  constructor(
    readonly statusCode: 404 | 409 | 503,
    message: string
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

/** Live last price per symbol (the spot feed every pane shows in BP-1). */
export interface PriceSource {
  lastPrice(symbol: string): Decimal | undefined;
}

export interface Executed<R> {
  result: R;
  delta: PaperDeltaDTO;
  sound?: PaperSound;
}

export interface PlaceOrderIntent {
  symbol: string;
  side: OrderSide;
  type: 'market' | 'limit' | 'stop';
  usdtAmount: Decimal;
  triggerPrice?: Decimal;
  takeProfit?: Decimal;
  stopLoss?: Decimal;
}

function engineContext(): EngineContext {
  const now = Date.now();
  // `${now}-${random}` like the browser engine's ids, with more entropy: ids are primary keys
  // shared by every account.
  return { now, newId: () => `${now}-${randomBytes(6).toString('base64url')}` };
}

export class TradingService {
  /** Per-user promise chain — one mutation at a time per account on this machine. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: AccountRepository,
    private readonly prices: PriceSource,
    private readonly events: PaperEventBus
  ) {}

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
            decide(loaded.state, engineContext())
          );
          if (!outcome) return null;
          const dto = deltaDTO(outcome.delta, outcome.version);
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

  private livePrice(symbol: string): Decimal {
    const price = this.prices.lastPrice(symbol);
    if (!price || price.lte(0)) throw new TradingError(409, WAITING_FOR_PRICE);
    return price;
  }

  // ─── Intents ─────────────────────────────────────────────────────────────────

  async placeOrder(userId: string, intent: PlaceOrderIntent): Promise<Executed<string | null>> {
    if (intent.type === 'market') {
      // 🔐 The fill price is the server's live price — the client never supplies one (F11).
      //    Fail fast when there is none, then read it again at execution time (inside decide):
      //    the order may wait in the per-user queue or be retried after a version conflict.
      this.livePrice(intent.symbol);
      return this.act(userId, (state, ctx) =>
        placeMarket(state, intent, this.livePrice(intent.symbol), ctx)
      );
    }
    const { triggerPrice } = intent;
    if (!triggerPrice) throw new TradingError(409, 'Trigger price required');
    return this.act(userId, (state, ctx) =>
      placePending(state, { ...intent, type: intent.type as 'limit' | 'stop', triggerPrice }, ctx)
    );
  }

  cancelOrder(userId: string, orderId: string): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelPending(state, orderId, ctx));
  }

  editOrder(
    userId: string,
    orderId: string,
    triggerPrice: Decimal,
    usdtAmount: Decimal,
    takeProfit: Decimal | null,
    stopLoss: Decimal | null
  ): Promise<Executed<'ok' | 'rejected' | 'not-found'>> {
    return this.act(userId, (state, ctx) =>
      editPending(state, orderId, triggerPrice, usdtAmount, takeProfit, stopLoss, ctx)
    );
  }

  cancelOrderExit(userId: string, orderId: string, leg: ExitLeg): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelPendingExitLeg(state, orderId, leg, ctx));
  }

  updatePositionExits(
    userId: string,
    positionId: string,
    takeProfit: Decimal | null,
    stopLoss: Decimal | null
  ): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) =>
      updatePositionExits(state, positionId, takeProfit, stopLoss, ctx)
    );
  }

  cancelPositionExit(userId: string, positionId: string, leg: ExitLeg): Promise<Executed<boolean>> {
    return this.act(userId, (state, ctx) => cancelExitLeg(state, positionId, leg, ctx));
  }

  /** Close at the live price of the position's symbol. Result: gross PnL, or null if not found. */
  closePosition(userId: string, positionId: string): Promise<Executed<Decimal | null>> {
    return this.act(userId, (state, ctx) => {
      const pos = state.positions.find((p) => p.id === positionId);
      if (!pos) return closePosition(state, positionId, new Decimal(0), ctx); // not found → no-op
      return closePosition(state, positionId, this.livePrice(pos.symbol), ctx);
    });
  }

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
   * Execute an engine trigger (TP/SL hit or pending fill). It is re-checked against the account's
   * current state first — an edit, cancel or earlier trigger may have made it stale — and
   * dropped if no longer valid.
   */
  runTrigger(userId: string, trigger: Trigger): Promise<Executed<unknown> | null> {
    return this.run(userId, (state, ctx) => {
      if (trigger.kind === 'exit') {
        const pos = state.positions.find((p) => p.id === trigger.positionId);
        const expected = trigger.leg === 'take-profit' ? 'TP' : 'SL';
        if (!pos || checkTPSL(pos, trigger.price) !== expected) return null;
      } else {
        const order = state.pendingOrders.find((o) => o.id === trigger.orderId);
        if (!order || !checkPendingTrigger(order, trigger.price)) return null;
      }
      return executeTrigger(state, trigger, ctx);
    });
  }
}
