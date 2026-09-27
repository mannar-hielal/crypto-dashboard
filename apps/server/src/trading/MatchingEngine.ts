/**
 * Matching engine — watches live prices 24/7 and executes TP/SL and pending-order triggers for
 * every account, whether or not the user has a tab open (BYBIT_PARITY_PLAN BP-1, F10).
 *
 * - Exactly one executor: the engine runs only while it holds the EngineLease row (see
 *   EngineLease). Other machines serve the API and WebSockets but never execute triggers.
 * - Index: every account with an open trigger (any open position — it can be liquidated, BP-3 — or
 *   a pending order), keyed by
 *   market (`category:symbol`, e.g. `linear:BTCUSDT`), so a tick only evaluates that market's
 *   accounts — a USDT Perpetual position never triggers on a spot price (BP-2). It is loaded on
 *   activation and kept current from every committed delta on the event bus.
 * - Ticks: live last price of each market, evaluated on the tick price (S3); a USDT Perpetual tick
 *   also carries the mark price, which liquidation is checked on (BP-3). A trigger is
 *   re-validated and executed through TradingService, so it serializes with the user's own
 *   clicks; TradingService picks the fill price (limit at its price, stop / TP / SL at ask / bid).
 * - Gaps: if a market's ticks stop for longer than GAP_MS (Bybit outage), or the engine starts
 *   after downtime (EngineLease.lastTickAt), the missed minutes are backfilled from 1m candles —
 *   last-price candles, plus mark-price candles for USDT Perpetual liquidation checks.
 * - Funding (BP-4): a clock per USDT Perpetual symbol (the ticker's `nextFundingTime`) snapshots,
 *   at the timestamp itself, every position open then, and settles it at Bybit's settled rate for
 *   that timestamp (funding history; the last ticker rate as a fallback) and the mark at that
 *   instant. A backfill replays missed timestamps in time order with the candle sweep.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { logger } from '../logger.js';
import { fallbackRiskTiers, type RiskTier } from './bybitSpec.js';
import type { FundingRate } from './infra.js';
import {
  evaluateCandle,
  evaluateTick,
  type AccountState,
  type Candle,
  type Category,
  type FundingSnapshot,
  type FundingSpec,
  type Trigger,
} from './engine/index.js';
import type { PaperEventBus } from './PaperEventBus.js';
import type { TradingService } from './TradingService.js';

const log = logger.child({ service: 'MatchingEngine' });

export interface TickUpdate {
  category: string;
  symbol: string;
  lastPrice: number;
  /** USDT Perpetual mark price */
  markPrice?: number;
  /** USDT Perpetual: the rate for the next funding settlement, and when it is (Unix ms) */
  fundingRate?: number;
  nextFundingTime?: number;
  /** USDT Perpetual: hours between funding timestamps (the ticker's fundingIntervalHour) */
  fundingIntervalHour?: number;
}

export interface MatchingEngineDeps {
  trading: Pick<TradingService, 'runTrigger' | 'runFunding'>;
  events: PaperEventBus;
  loadOpenTriggers: () => Promise<Map<string, AccountState>>;
  /** One account's current state, or null if it no longer exists (deleted user) */
  reloadUser: (userId: string) => Promise<AccountState | null>;
  subscribeTicker: (listener: (u: TickUpdate) => void) => () => void;
  fetchCandles: (
    category: Category,
    symbol: string,
    fromMs: number,
    toMs: number,
    source?: 'last' | 'mark'
  ) => Promise<Candle[]>;
  /** USDT Perpetual risk-limit tiers (default: the bundled Bybit snapshot) */
  riskTiers?: (symbol: string) => RiskTier[];
  /** Settled funding rates of a symbol with fromMs < ts ≤ toMs, oldest first (BP-4) */
  fetchFundingHistory?: (symbol: string, fromMs: number, toMs: number) => Promise<FundingRate[]>;
  /** How often the funding clock checks for a due timestamp */
  fundingCheckMs?: number;
  /** Wait between attempts to read a just-settled rate from Bybit's history */
  fundingRetryMs?: number;
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

/** Reads of Bybit's funding history for a just-settled rate before falling back to the ticker's */
const FUNDING_RATE_ATTEMPTS = 12;

/**
 * How long a due funding timestamp keeps being retried when, at the timestamp, there is no mark
 * price yet or a position filled at that instant isn't indexed yet — instead of being dropped
 */
const FUNDING_SNAPSHOT_GRACE_MS = 60_000;

/** A funding timestamp that has passed and waits to be settled. */
interface DueFunding {
  ts: number;
  /** The rate the ticker announced for it */
  rate?: Decimal;
  /** The mark seen at the timestamp (the latest one is used if none was seen yet) */
  mark?: Decimal;
  /**
   * Inferred after a takeover from the first ticker (its next timestamp − the interval), not seen
   * live: the mark comes from that minute's mark-price candle, and if Bybit's history never lists
   * the timestamp it was not one (the interval changed) and is dropped
   */
  inferred?: boolean;
}

/** What the live ticker says about a symbol's next funding (BP-4). */
interface FundingClock {
  /** The next funding timestamp (Unix ms) */
  nextTs: number;
  /** The rate announced for it (the ticker's fundingRate while nextTs is ahead) */
  rate?: Decimal;
  /** The latest mark price */
  mark?: Decimal;
  /** A passed timestamp not settled yet — kept when the ticker already moved on to the next one */
  due?: DueFunding;
}

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

/** Any open position can be liquidated (BP-3), so every position is a trigger. */
function hasTriggers(state: AccountState): boolean {
  return state.pendingOrders.length > 0 || state.positions.length > 0;
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
  private readonly riskTiers: (symbol: string) => RiskTier[];
  /** Funding clock per USDT Perpetual symbol — bounded: ALLOWED_SYMBOLS */
  private readonly fundingClocks = new Map<string, FundingClock>();
  /** Last funding timestamp started per symbol (the DB marker is the real once-only guard) */
  private readonly fundingStarted = new Map<string, number>();
  private fundingTimer: NodeJS.Timeout | null = null;
  /** Funding timestamp being settled per symbol, until every account is written — bounded */
  private readonly fundingInFlight = new Map<string, number>();
  /** A timer at each symbol's next funding timestamp — bounded: ALLOWED_SYMBOLS */
  private readonly fundingAlarms = new Map<string, NodeJS.Timeout>();
  private readonly fundingCheckMs: number;
  private readonly fundingRetryMs: number;
  /** The previous holder's last recorded tick, on a takeover (downtime starts there) */
  private resumeFrom: number | null = null;

  constructor(private readonly deps: MatchingEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.renewEveryMs = deps.renewEveryMs ?? 10_000;
    this.leaseTtlMs = deps.leaseTtlMs ?? 30_000;
    this.gapMs = deps.gapMs ?? DEFAULT_GAP_MS;
    this.resyncEveryMs = deps.resyncEveryMs ?? 30_000;
    this.riskTiers = deps.riskTiers ?? fallbackRiskTiers;
    this.fundingCheckMs = deps.fundingCheckMs ?? 1_000;
    this.fundingRetryMs = deps.fundingRetryMs ?? 10_000;
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

  /**
   * The progress recorded on the lease — where the next holder's downtime backfill starts. Held
   * back to just before the oldest funding timestamp still being settled (BP-4): a deploy, crash or
   * lease handoff in the middle of a settlement makes the next holder replay it (the per-symbol
   * marker keeps accounts already written from being charged twice).
   */
  private latestTick(): Date | null {
    let latest = 0;
    for (const t of this.lastTick.values()) latest = Math.max(latest, t);
    for (const ts of this.fundingInFlight.values()) latest = Math.min(latest, ts - 1);
    return latest > 0 ? new Date(latest) : null;
  }

  private async activate(lastTickAt: Date | null): Promise<void> {
    this.resumeFrom = lastTickAt ? lastTickAt.getTime() : null;
    // Subscribe before loading: a change committed while the index loads is buffered and
    // replayed on top of the load instead of being lost.
    this.unsubscribeEvents = this.deps.events.subscribeAll((e) => this.onEvent(e.userId, e.state));
    await this.rebuildIndex();
    this.unsubscribeTicks = this.deps.subscribeTicker((u) => this.onTick(u));
    this.active = true;
    this.resyncTimer = setInterval(() => void this.rebuildIndex(), this.resyncEveryMs);
    this.fundingTimer = setInterval(() => this.checkFunding(), this.fundingCheckMs);
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
    // 🔐 A funding timestamp that has passed is snapshotted from the positions as they were before
    // this change — a close (or an add) committed just after the timestamp can't dodge (or add to)
    // that settlement
    if (this.active) this.checkFunding();
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
    if (this.fundingTimer) clearInterval(this.fundingTimer);
    this.fundingTimer = null;
    this.fundingClocks.clear();
    this.fundingStarted.clear();
    this.fundingInFlight.clear();
    for (const alarm of this.fundingAlarms.values()) clearTimeout(alarm);
    this.fundingAlarms.clear();
    this.resumeFrom = null;
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
    if (category === 'linear') this.updateFundingClock(u);
    const previous = this.lastTick.get(key);
    this.lastTick.set(key, now);
    if (previous !== undefined && now - previous > this.gapMs) {
      void this.backfill(category, symbol, previous, now);
    }

    const userIds = this.symbolUsers.get(key);
    if (!userIds?.size) return;
    const price = new Decimal(u.lastPrice.toString());
    const mark =
      category === 'linear' &&
      u.markPrice !== undefined &&
      Number.isFinite(u.markPrice) &&
      u.markPrice > 0
        ? { price: new Decimal(u.markPrice.toString()), tiers: this.riskTiers(symbol) }
        : undefined;
    for (const userId of userIds) {
      const state = this.users.get(userId);
      if (!state) continue;
      for (const trigger of evaluateTick(
        category,
        symbol,
        price,
        state.positions,
        state.pendingOrders,
        mark
      )) {
        void this.fire(userId, trigger);
      }
    }
  }

  /** Execute one trigger; a trigger already executing (a burst of ticks) is not re-fired. */
  private async fire(userId: string, trigger: Trigger): Promise<void> {
    const key = `${userId}:${trigger.kind === 'fill' ? trigger.orderId : trigger.positionId}`;
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

  // ─── Funding (BP-4) ─────────────────────────────────────────────────────────

  private updateFundingClock(u: TickUpdate): void {
    // A timestamp that has just passed is settled before the ticker's values move on to the next
    // period (the new rate belongs to the next timestamp)
    this.checkFunding();
    const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
    const clock = this.fundingClocks.get(u.symbol) ?? { nextTs: 0 };
    if (clock.nextTs === 0) this.inferMissedFunding(u, clock);
    if (finite(u.nextFundingTime) && u.nextFundingTime > clock.nextTs) {
      // Moving on to the next period: a passed timestamp still unsettled stays due
      const passed = clock.nextTs;
      if (passed && passed <= this.now() && this.fundingStarted.get(u.symbol) !== passed) {
        clock.due ??= { ts: passed, rate: clock.rate, mark: clock.mark };
      }
      clock.nextTs = u.nextFundingTime;
      // Snapshot at the timestamp itself, not at the next tick or check
      const previous = this.fundingAlarms.get(u.symbol);
      if (previous) clearTimeout(previous);
      const alarm = setTimeout(
        () => {
          this.fundingAlarms.delete(u.symbol);
          if (this.active) this.checkFunding();
        },
        Math.max(0, u.nextFundingTime - this.now())
      );
      alarm.unref?.();
      this.fundingAlarms.set(u.symbol, alarm);
    }
    if (finite(u.fundingRate)) clock.rate = new Decimal(u.fundingRate.toString());
    if (finite(u.markPrice) && u.markPrice > 0) clock.mark = new Decimal(u.markPrice.toString());
    this.fundingClocks.set(u.symbol, clock);
    // A due timestamp that was only waiting for a mark price can go now
    if (clock.due) this.checkFunding();
  }

  /**
   * After a takeover, the symbol's first ticker already names the *next* timestamp. The one before
   * it (next − interval) may have passed during the downtime, and the takeover backfill can miss it:
   * Bybit's funding history lists a timestamp only a little after it (and a restart in the middle
   * of a settlement is exactly then). Mark it due; the per-account marker makes it a no-op for any
   * account the backfill (or the previous holder) already settled.
   */
  private inferMissedFunding(u: TickUpdate, clock: FundingClock): void {
    const { nextFundingTime, fundingIntervalHour } = u;
    if (this.resumeFrom === null || nextFundingTime === undefined || !fundingIntervalHour) return;
    if (!Number.isFinite(nextFundingTime) || !Number.isFinite(fundingIntervalHour)) return;
    const previous = nextFundingTime - fundingIntervalHour * 3_600_000;
    if (previous <= this.resumeFrom || previous > this.now()) return;
    if (this.fundingStarted.get(u.symbol) === previous) return;
    clock.due = { ts: previous, inferred: true };
  }

  /**
   * Start the settlement of every funding timestamp that is due. A timestamp is only marked started
   * once it is dispatched: with no mark yet, or no indexed position yet (a fill at that very instant
   * not reindexed), it is retried on the next check for up to FUNDING_SNAPSHOT_GRACE_MS.
   */
  private checkFunding(): void {
    const now = this.now();
    for (const [symbol, clock] of this.fundingClocks) {
      const due: DueFunding | undefined =
        clock.due ??
        (clock.nextTs && clock.nextTs <= now
          ? { ts: clock.nextTs, rate: clock.rate, mark: clock.mark }
          : undefined);
      if (!due) continue;
      if (this.fundingStarted.get(symbol) === due.ts) {
        clock.due = undefined;
        continue;
      }
      // The positions and the mark as they are at the timestamp, before anything moves on
      const snapshots = this.fundingSnapshots(symbol, due.ts);
      // An inferred timestamp was never seen live: today's mark isn't the mark at it
      const mark = due.inferred ? undefined : (due.mark ?? clock.mark);
      const expired = now - due.ts > FUNDING_SNAPSHOT_GRACE_MS;
      // Nobody held a position at the timestamp: nothing to settle once the grace is over
      if (snapshots.size === 0) {
        if (expired) {
          this.fundingStarted.set(symbol, due.ts);
          clock.due = undefined;
        }
        continue;
      }
      // Positions but no live mark: wait for one during the grace, then settle at Bybit's
      // mark-price candle for that minute (never dropped)
      if (!mark && !expired && !due.inferred) continue;
      this.fundingStarted.set(symbol, due.ts);
      clock.due = undefined;
      void this.settleFundingAt(
        symbol,
        due.ts,
        mark,
        { announced: due.rate },
        snapshots,
        due.inferred
      );
    }
  }

  /** Every indexed account's positions on `symbol` that were open at `ts`. */
  private fundingSnapshots(symbol: string, ts: number): Map<string, FundingSnapshot[]> {
    const out = new Map<string, FundingSnapshot[]>();
    for (const userId of this.symbolUsers.get(marketKey('linear', symbol)) ?? []) {
      const positions = (this.users.get(userId)?.positions ?? [])
        .filter((p) => p.category === 'linear' && p.symbol === symbol && p.openedAt <= ts)
        .map((p) => ({ positionId: p.id, side: p.side, qty: p.quantity }));
      if (positions.length) out.set(userId, positions);
    }
    return out;
  }

  /** The mark price at `ts` from Bybit's 1m mark-price candle for that minute (its open). */
  private async markAt(symbol: string, ts: number): Promise<Decimal | undefined> {
    const minute = Math.floor(ts / 60_000) * 60_000;
    try {
      const candles = await this.deps.fetchCandles(
        'linear',
        symbol,
        minute,
        minute + 60_000,
        'mark'
      );
      return candles.find((c) => c.start === minute)?.open;
    } catch (err) {
      log.warn({ err, symbol, ts }, 'Mark-price candle read failed');
      return undefined;
    }
  }

  /** The rate Bybit settled at `ts` (funding history), else the ticker's announced rate. */
  private async settledRate(
    symbol: string,
    ts: number,
    fallback?: Decimal
  ): Promise<Decimal | null> {
    const fetchHistory = this.deps.fetchFundingHistory;
    for (let attempt = 1; fetchHistory && attempt <= FUNDING_RATE_ATTEMPTS; attempt++) {
      try {
        const settled = (await fetchHistory(symbol, ts - 1, ts)).find((f) => f.ts === ts);
        if (settled) return settled.rate;
      } catch (err) {
        log.warn({ err, symbol, ts, attempt }, 'Funding history read failed');
      }
      if (this.stopped || !this.active) return null;
      await new Promise((resolve) => setTimeout(resolve, this.fundingRetryMs));
    }
    if (fallback) {
      log.warn({ symbol, ts }, 'Funding settled at the ticker rate (history had no record)');
      return fallback;
    }
    return null;
  }

  /**
   * Settle one funding timestamp for the snapshotted accounts — the one path for live settlements
   * and backfills. Money is never dropped: a missing rate (Bybit's history failing and no ticker
   * rate), a missing mark (read from Bybit's mark-price candle instead) or an account whose write
   * fails is retried for as long as this engine is active. Until everything is written the
   * timestamp stays in flight, which holds the lease's recorded progress before it, so a restart or
   * handoff replays it; accounts already written are no-ops (SymbolSetting.lastFundingAt).
   */
  private async settleFundingAt(
    symbol: string,
    ts: number,
    knownMark: Decimal | undefined,
    rates: { settled?: Decimal; announced?: Decimal },
    snapshots: Map<string, FundingSnapshot[]>,
    inferred = false
  ): Promise<void> {
    const pause = () => new Promise((resolve) => setTimeout(resolve, this.fundingRetryMs));
    const live = () => !this.stopped && this.active;
    this.fundingInFlight.set(symbol, ts);
    try {
      // The rate first: an inferred timestamp Bybit never settled is dropped before any mark read
      let rate = rates.settled ?? (await this.settledRate(symbol, ts, rates.announced));
      if (!rate && inferred) {
        log.warn({ symbol, ts }, 'Inferred funding timestamp not in Bybit history — skipped');
        return;
      }
      while (!rate) {
        if (!live()) return;
        log.error({ symbol, ts }, 'Funding not settled yet: no settled rate — retrying');
        await pause();
        rate = await this.settledRate(symbol, ts, rates.announced);
      }
      let mark = knownMark ?? (await this.markAt(symbol, ts));
      while (!mark) {
        if (!live()) return;
        log.error({ symbol, ts }, 'Funding not settled yet: no mark price — retrying');
        await pause();
        mark = await this.markAt(symbol, ts);
      }
      let pending = snapshots;
      for (;;) {
        pending = await this.runFunding(symbol, ts, rate, mark, pending);
        if (pending.size === 0 || !live()) return;
        log.error(
          { symbol, ts, accounts: pending.size },
          'Funding not written for some accounts — retrying'
        );
        await pause();
      }
    } finally {
      if (this.fundingInFlight.get(symbol) === ts) this.fundingInFlight.delete(symbol);
    }
  }

  /**
   * Settle each account; returns the accounts whose write still failed after two attempts. An
   * account that no longer exists (deleted after the timestamp) is dropped, not returned: its
   * write can never succeed, and retrying it would hold the lease's recorded progress forever.
   */
  private async runFunding(
    symbol: string,
    ts: number,
    rate: Decimal,
    mark: Decimal,
    snapshots: Map<string, FundingSnapshot[]>
  ): Promise<Map<string, FundingSnapshot[]>> {
    log.info({ symbol, ts, rate: rate.toString(), accounts: snapshots.size }, 'Settling funding');
    const failed = new Map<string, FundingSnapshot[]>();
    for (const [userId, positions] of snapshots) {
      const spec: FundingSpec = { symbol, ts, rate, mark, positions };
      for (let attempt = 1; attempt <= TRIGGER_ATTEMPTS; attempt++) {
        try {
          await this.deps.trading.runFunding(userId, spec);
          break;
        } catch (err) {
          if (attempt === TRIGGER_ATTEMPTS) {
            if (await this.accountGone(userId)) {
              log.info({ userId, symbol, ts }, 'Funding dropped: the account no longer exists');
              this.evict(userId);
            } else {
              log.error({ err, userId, symbol, ts }, 'Funding settlement failed');
              failed.set(userId, positions);
            }
          }
        }
      }
    }
    return failed;
  }

  /** True only when the account is confirmed deleted (a failed lookup is not proof). */
  private async accountGone(userId: string): Promise<boolean> {
    try {
      return (await this.deps.reloadUser(userId)) === null;
    } catch {
      return false;
    }
  }

  /** Bybit's funding history for a gap, retried while this engine is active (never skipped). */
  private async fundingHistoryFor(
    symbol: string,
    fromMs: number,
    toMs: number
  ): Promise<FundingRate[]> {
    const fetchHistory = this.deps.fetchFundingHistory;
    if (!fetchHistory) return [];
    for (;;) {
      try {
        return await fetchHistory(symbol, fromMs, toMs);
      } catch (err) {
        log.error({ err, symbol }, 'Backfill funding history fetch failed — retrying');
        if (this.stopped || !this.active) return [];
        await new Promise((resolve) => setTimeout(resolve, this.fundingRetryMs));
      }
    }
  }

  /**
   * Replay 1m candles for a gap, in time order, for every account watching one market. USDT
   * Perpetual also replays the same minutes' mark-price candles, for liquidation (BP-3), and the
   * funding timestamps in the gap (BP-4). If the mark candles can't be fetched the gap is still
   * replayed for TP / SL and fills; liquidation then waits for the next live mark tick. Funding is
   * never skipped: its history is retried, and a timestamp with no candle mark reads its minute.
   */
  async backfill(category: Category, symbol: string, fromMs: number, toMs: number): Promise<void> {
    const key = marketKey(category, symbol);
    if (!this.symbolUsers.get(key)?.size) return;
    // Funding timestamps missed in the gap (BP-4) — fetched first: they are settled even if the
    // candles can't be read (their mark then comes from the mark-price candle of that minute)
    const fundings: FundingRate[] =
      category === 'linear' ? await this.fundingHistoryFor(symbol, fromMs, toMs) : [];
    let candles: Candle[] = [];
    try {
      candles = await this.deps.fetchCandles(category, symbol, fromMs, toMs);
    } catch (err) {
      log.error({ err, category, symbol }, 'Backfill candle fetch failed');
    }
    const markByStart = new Map<number, Candle>();
    if (category === 'linear') {
      try {
        for (const c of await this.deps.fetchCandles(category, symbol, fromMs, toMs, 'mark')) {
          markByStart.set(c.start, c);
        }
      } catch (err) {
        log.error({ err, category, symbol }, 'Backfill mark-price candle fetch failed');
      }
    }
    // Settled in time order with the candles
    const settleFundingUpTo = async (upTo: number) => {
      while (fundings.length && fundings[0].ts <= upTo) {
        const f = fundings.shift() as FundingRate;
        const minute = Math.floor(f.ts / 60_000) * 60_000;
        const snapshots = this.fundingSnapshots(symbol, f.ts);
        this.fundingStarted.set(symbol, Math.max(this.fundingStarted.get(symbol) ?? 0, f.ts));
        if (!snapshots.size) continue;
        await this.settleFundingAt(
          symbol,
          f.ts,
          markByStart.get(minute)?.open,
          { settled: f.rate },
          snapshots
        );
      }
    };
    const tiers = this.riskTiers(symbol);
    log.info(
      { category, symbol, fromMs, toMs, candles: candles.length, markCandles: markByStart.size },
      'Backfilling price gap'
    );
    for (const candle of candles) {
      await settleFundingUpTo(candle.start);
      const markCandle = markByStart.get(candle.start);
      const mark = markCandle ? { candle: markCandle, tiers } : undefined;
      for (const userId of [...(this.symbolUsers.get(key) ?? [])]) {
        const state = this.users.get(userId);
        if (!state) continue;
        // Sequential: each execution updates the index before the next candle is evaluated
        for (const trigger of evaluateCandle(
          category,
          symbol,
          candle,
          state.positions,
          state.pendingOrders,
          mark
        )) {
          await this.fire(userId, trigger);
        }
      }
    }
    await settleFundingUpTo(toMs);
  }
}
