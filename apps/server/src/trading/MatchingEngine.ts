/**
 * Matching engine — watches live prices 24/7 and executes TP/SL and pending-order triggers for
 * every account, whether or not the user has a tab open (BYBIT_PARITY_PLAN BP-1, F10).
 *
 * - Exactly one executor: the engine runs only while it holds the EngineLease row (see
 *   EngineLease). Other machines serve the API and WebSockets but never execute triggers.
 * - Index: every account with an open trigger (a position with TP/SL, or a pending order), keyed by
 *   market (`category:symbol`, e.g. `linear:BTCUSDT`), so a tick only evaluates that market's
 *   accounts — a USDT Perpetual position never triggers on a spot price (BP-2). It is loaded on
 *   activation and kept current from every committed delta on the event bus.
 * - Ticks: live last price of each market, evaluated on the tick price (S3). A trigger is
 *   re-validated and executed through TradingService, so it serializes with the user's own
 *   clicks; TradingService picks the fill price (limit at its price, stop / TP / SL at ask / bid).
 * - Gaps: if a market's ticks stop for longer than GAP_MS (Bybit outage), or the engine starts
 *   after downtime (EngineLease.lastTickAt), the missed minutes are backfilled from 1m candles.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { logger } from '../logger.js';
import {
  evaluateCandle,
  evaluateTick,
  type AccountState,
  type Candle,
  type Category,
  type Trigger,
} from './engine/index.js';
import type { PaperEventBus } from './PaperEventBus.js';
import type { TradingService } from './TradingService.js';

const log = logger.child({ service: 'MatchingEngine' });

export interface TickUpdate {
  category: string;
  symbol: string;
  lastPrice: number;
}

export interface MatchingEngineDeps {
  trading: Pick<TradingService, 'runTrigger'>;
  events: PaperEventBus;
  loadOpenTriggers: () => Promise<Map<string, AccountState>>;
  /** One account's current state, or null if it no longer exists (deleted user) */
  reloadUser: (userId: string) => Promise<AccountState | null>;
  subscribeTicker: (listener: (u: TickUpdate) => void) => () => void;
  fetchCandles: (
    category: Category,
    symbol: string,
    fromMs: number,
    toMs: number
  ) => Promise<Candle[]>;
  lease: LeaseStore;
  holder: string;
  now?: () => number;
  renewEveryMs?: number;
  leaseTtlMs?: number;
  gapMs?: number;
  /** Full index rebuild interval — picks up changes committed on other machines */
  resyncEveryMs?: number;
}

export interface LeaseStore {
  /** Take the lease if free or expired. Returns the last evaluated tick time if acquired. */
  tryAcquire(
    holder: string,
    ttlMs: number
  ): Promise<{ acquired: boolean; lastTickAt: Date | null }>;
  /** Extend our lease (and record progress). False if someone else holds it now. */
  renew(holder: string, ttlMs: number, lastTickAt: Date | null): Promise<boolean>;
  release(holder: string): Promise<void>;
}

/** Attempts per trigger before waiting for the next tick */
const TRIGGER_ATTEMPTS = 2;

/** Longest a symbol may go without a tick before the gap is backfilled from candles. */
const DEFAULT_GAP_MS = 60_000;

/** Index key of one market */
type MarketKey = `${Category}:${string}`;

const marketKey = (category: Category, symbol: string): MarketKey => `${category}:${symbol}`;

function parseKey(key: MarketKey): { category: Category; symbol: string } {
  const [category, symbol] = key.split(':') as [Category, string];
  return { category, symbol };
}

function isCategory(v: string): v is Category {
  return v === 'spot' || v === 'linear';
}

function hasTriggers(state: AccountState): boolean {
  return (
    state.pendingOrders.length > 0 ||
    state.positions.some((p) => p.takeProfit !== undefined || p.stopLoss !== undefined)
  );
}

export class MatchingEngine {
  private readonly users = new Map<string, AccountState>();
  /** Users with an open trigger per market — bounded by open positions / orders */
  private readonly symbolUsers = new Map<MarketKey, Set<string>>();
  private readonly inFlight = new Set<string>();
  /** Last tick time per market — bounded: 2 categories × ALLOWED_SYMBOLS */
  private readonly lastTick = new Map<MarketKey, number>();
  private unsubscribeTicks: (() => void) | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private resyncTimer: NodeJS.Timeout | null = null;
  private beating = false;
  private active = false;
  /** Events received while the index is being (re)loaded — replayed on top of the load */
  private buffered: { userId: string; state: AccountState }[] | null = null;
  private stopped = false;
  private readonly now: () => number;
  private readonly renewEveryMs: number;
  private readonly leaseTtlMs: number;
  private readonly gapMs: number;
  private readonly resyncEveryMs: number;

  constructor(private readonly deps: MatchingEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.renewEveryMs = deps.renewEveryMs ?? 10_000;
    this.leaseTtlMs = deps.leaseTtlMs ?? 30_000;
    this.gapMs = deps.gapMs ?? DEFAULT_GAP_MS;
    this.resyncEveryMs = deps.resyncEveryMs ?? 30_000;
  }

  /** Start competing for the lease; activates as soon as this instance holds it. */
  async start(): Promise<void> {
    this.stopped = false;
    // Arm renewal first: activation (index load) must never delay lease renewals
    this.timer = setInterval(() => void this.heartbeat(), this.renewEveryMs);
    await this.heartbeat();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const wasActive = this.active;
    this.deactivate();
    if (wasActive) {
      await this.deps.lease.release(this.deps.holder).catch((err: unknown) => {
        log.warn({ err }, 'Engine lease release failed');
      });
    }
  }

  isActive(): boolean {
    return this.active;
  }

  /** Renew (or try to take) the lease; activate / deactivate on change. */
  private async heartbeat(): Promise<void> {
    if (this.stopped || this.beating) return;
    this.beating = true;
    try {
      if (this.active) {
        const kept = await this.deps.lease.renew(
          this.deps.holder,
          this.leaseTtlMs,
          this.latestTick()
        );
        if (!kept) {
          log.warn('Engine lease lost — another instance took over; deactivating');
          this.deactivate();
        }
        return;
      }
      const { acquired, lastTickAt } = await this.deps.lease.tryAcquire(
        this.deps.holder,
        this.leaseTtlMs
      );
      if (acquired && !this.stopped) await this.activate(lastTickAt);
    } catch (err) {
      log.error({ err }, 'Engine lease heartbeat failed');
    } finally {
      this.beating = false;
    }
  }

  private latestTick(): Date | null {
    let latest = 0;
    for (const t of this.lastTick.values()) latest = Math.max(latest, t);
    return latest > 0 ? new Date(latest) : null;
  }

  private async activate(lastTickAt: Date | null): Promise<void> {
    // Subscribe before loading: a change committed while the index loads is buffered and
    // replayed on top of the load instead of being lost.
    this.unsubscribeEvents = this.deps.events.subscribeAll((e) => this.onEvent(e.userId, e.state));
    await this.rebuildIndex();
    this.unsubscribeTicks = this.deps.subscribeTicker((u) => this.onTick(u));
    this.active = true;
    this.resyncTimer = setInterval(() => void this.rebuildIndex(), this.resyncEveryMs);
    log.info(
      { accounts: this.users.size, markets: this.symbolUsers.size },
      'Matching engine active'
    );

    // Downtime backfill: everything between the previous holder's last tick and now. Off the
    // heartbeat path, so a slow backfill can't let the lease expire.
    if (lastTickAt) {
      const now = this.now();
      // Markets are independent (separate fetches, separate triggers): catch up in parallel.
      // Within one market, candles stay in time order (backfill()).
      void Promise.all(
        [...this.symbolUsers.keys()].map((key) => {
          const { category, symbol } = parseKey(key);
          return this.backfill(category, symbol, lastTickAt.getTime(), now);
        })
      );
    }
  }

  private onEvent(userId: string, state: AccountState): void {
    if (this.buffered) this.buffered.push({ userId, state });
    else this.reindex(userId, state);
  }

  /**
   * (Re)load every open trigger from the database. Runs on activation and every resyncEveryMs,
   * which also picks up changes committed on other machines (the event bus is in-process) and
   * drops accounts deleted by a cascade.
   */
  private async rebuildIndex(): Promise<void> {
    if (this.buffered) return; // a rebuild is already running
    this.buffered = [];
    try {
      const open = await this.deps.loadOpenTriggers();
      this.users.clear();
      this.symbolUsers.clear();
      for (const [userId, state] of open) this.reindex(userId, state);
      for (const { userId, state } of this.buffered) this.reindex(userId, state);
    } catch (err) {
      log.error({ err }, 'Engine index rebuild failed');
    } finally {
      this.buffered = null;
    }
  }

  private deactivate(): void {
    this.unsubscribeTicks?.();
    this.unsubscribeEvents?.();
    this.unsubscribeTicks = null;
    this.unsubscribeEvents = null;
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.resyncTimer = null;
    this.users.clear();
    this.symbolUsers.clear();
    this.lastTick.clear();
    this.active = false;
  }

  /** Keep only accounts with open triggers in the index. Bounded by open positions/orders. */
  private reindex(userId: string, state: AccountState): void {
    for (const set of this.symbolUsers.values()) set.delete(userId);
    if (!hasTriggers(state)) {
      this.users.delete(userId);
    } else {
      this.users.set(userId, state);
      const keys = new Set<MarketKey>([
        ...state.positions.map((p) => marketKey(p.category, p.symbol)),
        ...state.pendingOrders.map((o) => marketKey(o.category, o.symbol)),
      ]);
      for (const key of keys) {
        let set = this.symbolUsers.get(key);
        if (!set) {
          set = new Set();
          this.symbolUsers.set(key, set);
        }
        set.add(userId);
      }
    }
    for (const [key, set] of this.symbolUsers) {
      if (set.size === 0) this.symbolUsers.delete(key);
    }
  }

  private onTick(u: TickUpdate): void {
    if (!isCategory(u.category) || !Number.isFinite(u.lastPrice) || u.lastPrice <= 0) return;
    const { category, symbol } = u;
    const key = marketKey(category, symbol);
    const now = this.now();
    const previous = this.lastTick.get(key);
    this.lastTick.set(key, now);
    if (previous !== undefined && now - previous > this.gapMs) {
      void this.backfill(category, symbol, previous, now);
    }

    const userIds = this.symbolUsers.get(key);
    if (!userIds?.size) return;
    const price = new Decimal(u.lastPrice.toString());
    for (const userId of userIds) {
      const state = this.users.get(userId);
      if (!state) continue;
      for (const trigger of evaluateTick(
        category,
        symbol,
        price,
        state.positions,
        state.pendingOrders
      )) {
        void this.fire(userId, trigger);
      }
    }
  }

  /** Execute one trigger; a trigger already executing (a burst of ticks) is not re-fired. */
  private async fire(userId: string, trigger: Trigger): Promise<void> {
    const key = `${userId}:${trigger.kind === 'exit' ? trigger.positionId : trigger.orderId}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    let executed = false;
    try {
      // A crossed level must not wait for the next tick because a user action held the account
      // at the same moment: one immediate retry after a failure (e.g. repeated version conflicts).
      for (let attempt = 1; attempt <= TRIGGER_ATTEMPTS; attempt++) {
        try {
          executed = (await this.deps.trading.runTrigger(userId, trigger)) !== null;
          break;
        } catch (err) {
          if (attempt === TRIGGER_ATTEMPTS) {
            log.error({ err, userId, kind: trigger.kind }, 'Trigger execution failed');
          }
        }
      }
    } finally {
      this.inFlight.delete(key);
    }
    // A trigger that didn't execute means the index is stale for this account (edited on another
    // machine, or the account was deleted): refresh it so it isn't re-fired on every tick.
    if (!executed) await this.refreshUser(userId);
  }

  private async refreshUser(userId: string): Promise<void> {
    try {
      const state = await this.deps.reloadUser(userId);
      if (state) this.reindex(userId, state);
      else this.evict(userId);
    } catch (err) {
      log.error({ err, userId }, 'Engine index refresh failed');
    }
  }

  private evict(userId: string): void {
    this.users.delete(userId);
    for (const [key, set] of this.symbolUsers) {
      set.delete(userId);
      if (set.size === 0) this.symbolUsers.delete(key);
    }
  }

  /** Replay 1m candles for a gap, in time order, for every account watching one market. */
  async backfill(category: Category, symbol: string, fromMs: number, toMs: number): Promise<void> {
    const key = marketKey(category, symbol);
    if (!this.symbolUsers.get(key)?.size) return;
    let candles: Candle[];
    try {
      candles = await this.deps.fetchCandles(category, symbol, fromMs, toMs);
    } catch (err) {
      log.error({ err, category, symbol }, 'Backfill candle fetch failed');
      return;
    }
    log.info({ category, symbol, fromMs, toMs, candles: candles.length }, 'Backfilling price gap');
    for (const candle of candles) {
      for (const userId of [...(this.symbolUsers.get(key) ?? [])]) {
        const state = this.users.get(userId);
        if (!state) continue;
        // Sequential: each execution updates the index before the next candle is evaluated
        for (const trigger of evaluateCandle(
          category,
          symbol,
          candle,
          state.positions,
          state.pendingOrders
        )) {
          await this.fire(userId, trigger);
        }
      }
    }
  }
}
