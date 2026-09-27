/**
 * Paper-account persistence for the server engine (BYBIT_PARITY_PLAN BP-1).
 *
 * Loads an account's engine state and applies an engine Delta in one interactive transaction.
 * Every write bumps Account.version with `updateMany({ where: { id, version } })`, so two
 * mutations of the same account (a user click and an engine trigger, or two machines) can never
 * both commit on the same starting state. The loser gets VersionConflictError and retries.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { PaperStateDTO } from '@crypto-dashboard/sdk';
import {
  MAX_BALANCE_EVENTS,
  MAX_FUNDINGS,
  MAX_HISTORY,
  MAX_JOURNAL,
  MAX_ORDERS,
  STARTING_BALANCE,
  type AccountState,
  type Delta,
} from './engine/index.js';
import {
  balanceEventData,
  balanceEventFromRow,
  fundingData,
  fundingFromRow,
  historyOrderData,
  historyOrderFromRow,
  journalData,
  journalFromRow,
  pendingData,
  pendingDTO,
  pendingFromRow,
  positionData,
  positionDTO,
  positionFromRow,
  spotData,
  spotDTO,
  spotFromRow,
  tradeData,
  tradeFromRow,
  type RiskTiersFor,
} from './mappers.js';
import { fallbackRiskTiers } from './bybitSpec.js';

/** Symbols whose settled-funding marker differs between two maps (BP-4). */
function changedFundingAt(before: Record<string, number>, after: Record<string, number>): string[] {
  return (
    Object.entries(after)
      // symbol is a key of `after` itself (allow-listed symbols only) — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      .filter(([symbol, ts]) => before[symbol] !== ts)
      .map(([s]) => s)
  );
}

/** Symbols whose leverage setting differs between two maps. */
function changedLeverage(
  before: Record<string, number>,
  after: Record<string, number>
): [string, number][] {
  // symbol is a key of `after` itself (allow-listed symbols only) — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  return Object.entries(after).filter(([symbol, lev]) => before[symbol] !== lev);
}

/**
 * True when a delta changes nothing (the account values are unchanged and every list is empty).
 * Every Delta field must be compared here — a field left out makes a change that only touches it
 * look like a no-op, and it would never be written.
 */
export function isEmptyDelta(delta: Delta, before: AccountState): boolean {
  return (
    !delta.reset &&
    delta.account.balance.eq(before.balance) &&
    delta.account.realizedPnl.eq(before.realizedPnl) &&
    delta.account.leverage === before.leverage &&
    changedLeverage(before.symbolLeverage, delta.account.symbolLeverage).length === 0 &&
    changedFundingAt(before.symbolFundingAt, delta.account.symbolFundingAt).length === 0 &&
    delta.account.marginMode === (before.marginMode ?? 'ISOLATED_MARGIN') &&
    delta.positionsUpsert.length === 0 &&
    delta.positionsRemove.length === 0 &&
    delta.spotUpsert.length === 0 &&
    delta.pendingUpsert.length === 0 &&
    delta.pendingRemove.length === 0 &&
    delta.orders.length === 0 &&
    delta.trades.length === 0 &&
    delta.fundings.length === 0 &&
    delta.balanceEvents.length === 0 &&
    delta.journal.length === 0 &&
    delta.journalEdits.length === 0
  );
}

/** A write targeted a row that doesn't exist for this user (the transaction is rolled back). */
export class RecordNotFoundError extends Error {
  constructor() {
    super('Record not found');
    this.name = 'RecordNotFoundError';
  }
}

export class VersionConflictError extends Error {
  constructor() {
    super('Paper account changed concurrently');
    this.name = 'VersionConflictError';
  }
}

export interface LoadedAccount {
  accountId: string;
  version: number;
  state: AccountState;
  /** The account was isolated before cross existed: show the one-time notice (BP-5 E, O2) */
  marginModeNotice: boolean;
}

type Tx = Prisma.TransactionClient;

/** Match a row by its public id: new rows use `id`, pre-BP-1 rows are addressed by `refId`. */
const byPublicId = (userId: string, ids: string[]) => ({
  userId,
  OR: [{ id: { in: ids } }, { refId: { in: ids } }],
});

export class AccountRepository {
  constructor(
    private readonly prisma: PrismaClient,
    /** Risk-limit tiers for the positions' liquidation figures in the snapshot (BP-3) */
    private readonly riskTiers: RiskTiersFor = fallbackRiskTiers
  ) {}

  /** The account's engine state (creates the account on first use, as GET /account always did). */
  async load(userId: string, tx: Tx | PrismaClient = this.prisma): Promise<LoadedAccount> {
    // upsert, not findUnique ?? create: two first-use loads (two tabs) must not race into P2002
    const account = await tx.account.upsert({ where: { userId }, create: { userId }, update: {} });
    const [positions, pending, settings, spot] = await Promise.all([
      tx.position.findMany({ where: { userId }, orderBy: [{ openedAt: 'asc' }, { id: 'asc' }] }),
      tx.order.findMany({ where: { userId, status: 'PENDING' }, orderBy: { seq: 'asc' } }),
      tx.symbolSetting.findMany({ where: { accountId: account.id } }),
      tx.spotBalance.findMany({ where: { accountId: account.id }, orderBy: { coin: 'asc' } }),
    ]);
    return {
      accountId: account.id,
      version: account.version,
      marginModeNotice: account.marginModeNotice,
      state: {
        balance: new Decimal(account.availableBalance.toString()),
        realizedPnl: new Decimal(account.realizedPnl.toString()),
        leverage: account.leverage,
        // Only a real per-symbol choice pins leverage — a funding-marker-only row doesn't (BP-4)
        symbolLeverage: Object.fromEntries(
          settings.filter((st) => st.leveragePinned).map((st) => [st.symbol, st.leverage])
        ),
        symbolFundingAt: Object.fromEntries(
          settings.flatMap((st) =>
            st.lastFundingAt ? [[st.symbol, st.lastFundingAt.getTime()] as const] : []
          )
        ),
        resetAt: account.lastReset.getTime(),
        spot: spot.map(spotFromRow),
        positions: positions.map(positionFromRow),
        pendingOrders: pending.map(pendingFromRow),
        ...(account.marginMode === 'REGULAR_MARGIN'
          ? { marginMode: 'REGULAR_MARGIN' as const }
          : {}),
      },
    };
  }

  /**
   * Run `decide` on the current state and persist its delta atomically. `decide` may return
   * null to write nothing (e.g. a trigger that is no longer valid).
   * Throws VersionConflictError if the account changed since it was loaded.
   */
  async mutate<T extends { delta: Delta }>(
    userId: string,
    decide: (loaded: LoadedAccount) => T | null
  ): Promise<(T & { before: AccountState; version: number; changed: boolean }) | null> {
    return this.prisma.$transaction(async (tx) => {
      const loaded = await this.load(userId, tx);
      const outcome = decide(loaded);
      if (!outcome) return null;
      // A no-op (not found, nothing to change) writes nothing and keeps the version
      if (isEmptyDelta(outcome.delta, loaded.state)) {
        return { ...outcome, before: loaded.state, version: loaded.version, changed: false };
      }
      await this.apply(tx, userId, loaded, outcome.delta);
      return { ...outcome, before: loaded.state, version: loaded.version + 1, changed: true };
    });
  }

  /** The account's engine state, or null if the user / account no longer exists (never creates). */
  async loadIfExists(userId: string): Promise<AccountState | null> {
    const account = await this.prisma.account.findUnique({ where: { userId } });
    if (!account) return null;
    return (await this.load(userId)).state;
  }

  private async apply(tx: Tx, userId: string, loaded: LoadedAccount, delta: Delta): Promise<void> {
    const { accountId, version } = loaded;
    const { balance, realizedPnl, leverage } = delta.account;

    const bumped = await tx.account.updateMany({
      where: { id: accountId, version },
      data: {
        availableBalance: balance,
        // Same formula the browser engine synced (balance + realizedPnl)
        totalBalance: balance.plus(realizedPnl),
        realizedPnl,
        leverage,
        marginMode: delta.account.marginMode,
        // A mode switch answers the one-time cross notice (BP-5 E)
        ...(delta.account.marginMode !== (loaded.state.marginMode ?? 'ISOLATED_MARGIN')
          ? { marginModeNotice: false }
          : {}),
        version: { increment: 1 },
        ...(delta.reset ? { lastReset: new Date(), resetCount: { increment: 1 } } : {}),
      },
    });
    if (bumped.count === 0) throw new VersionConflictError();

    if (delta.reset) {
      await Promise.all([
        tx.position.deleteMany({ where: { userId } }),
        tx.trade.deleteMany({ where: { userId } }),
        tx.order.deleteMany({ where: { userId } }),
        tx.journalEntry.deleteMany({ where: { userId } }),
        tx.balanceEvent.deleteMany({ where: { userId } }),
        tx.symbolSetting.deleteMany({ where: { accountId } }),
        tx.spotBalance.deleteMany({ where: { accountId } }),
      ]);
      return;
    }

    for (const h of delta.spotUpsert) {
      const data = spotData(h);
      await tx.spotBalance.upsert({
        where: { accountId_coin: { accountId, coin: h.coin } },
        create: { ...data, accountId },
        update: data,
      });
    }

    for (const [symbol, lev] of changedLeverage(
      loaded.state.symbolLeverage,
      delta.account.symbolLeverage
    )) {
      await tx.symbolSetting.upsert({
        where: { accountId_symbol: { accountId, symbol } },
        create: { accountId, symbol, leverage: lev },
        update: { leverage: lev, leveragePinned: true },
      });
    }
    for (const symbol of changedFundingAt(
      loaded.state.symbolFundingAt,
      delta.account.symbolFundingAt
    )) {
      // symbol is a key of the delta's own map (allow-listed symbols only) — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      const lastFundingAt = new Date(delta.account.symbolFundingAt[symbol]);
      await tx.symbolSetting.upsert({
        where: { accountId_symbol: { accountId, symbol } },
        // A row created just for the marker doesn't pin leverage: the symbol keeps following the
        // account default (the leverage value is a placeholder, never read)
        create: {
          accountId,
          symbol,
          // eslint-disable-next-line security/detect-object-injection
          leverage: delta.account.symbolLeverage[symbol] ?? delta.account.leverage,
          // eslint-disable-next-line security/detect-object-injection
          leveragePinned: delta.account.symbolLeverage[symbol] !== undefined,
          lastFundingAt,
        },
        update: { lastFundingAt },
      });
    }

    if (delta.positionsRemove.length) {
      await tx.position.deleteMany({ where: byPublicId(userId, delta.positionsRemove) });
    }
    for (const p of delta.positionsUpsert) {
      const data = positionData(p);
      const updated = await tx.position.updateMany({ where: byPublicId(userId, [p.id]), data });
      if (updated.count === 0) {
        await tx.position.create({ data: { ...data, id: p.id, userId, accountId } });
      }
    }

    if (delta.pendingRemove.length) {
      await tx.order.deleteMany({
        where: { ...byPublicId(userId, delta.pendingRemove), status: 'PENDING' },
      });
    }
    for (const o of delta.pendingUpsert) {
      const data = pendingData(o);
      const updated = await tx.order.updateMany({
        where: { ...byPublicId(userId, [o.id]), status: 'PENDING' },
        data,
      });
      if (updated.count === 0) {
        await tx.order.create({ data: { ...data, id: o.id, userId, accountId } });
      }
    }

    // Lists are newest-first; insert oldest-first so `seq` grows toward the newest row.
    for (const o of [...delta.orders].reverse()) {
      await tx.order.create({ data: { ...historyOrderData(o), id: o.id, userId, accountId } });
    }
    for (const t of [...delta.trades].reverse()) {
      await tx.trade.create({ data: { ...tradeData(t), id: t.id, userId, accountId } });
    }
    for (const f of [...delta.fundings].reverse()) {
      await tx.trade.create({ data: { ...fundingData(f), id: f.id, userId, accountId } });
    }
    for (const b of [...delta.balanceEvents].reverse()) {
      await tx.balanceEvent.create({
        data: { ...balanceEventData(b), id: b.id, userId, accountId },
      });
    }
    for (const j of [...delta.journal].reverse()) {
      await tx.journalEntry.create({ data: { ...journalData(j), id: j.id, userId, accountId } });
    }
    for (const edit of delta.journalEdits) {
      // 🔐 Only the user's own notes are editable — system entries are read-only
      const edited = await tx.journalEntry.updateMany({
        where: { id: edit.id, userId, isUserNote: true },
        data: { text: edit.text.slice(0, 500) },
      });
      // Missing, pruned, someone else's or a system entry: nothing was edited — roll back (404)
      if (edited.count === 0) throw new RecordNotFoundError();
    }

    if (delta.journal.length) await this.prune(tx, 'journalEntry', userId, MAX_JOURNAL);
    if (delta.balanceEvents.length) {
      await this.prune(tx, 'balanceEvent', userId, MAX_BALANCE_EVENTS);
    }
  }

  /** Keep only the newest `keep` rows of a capped per-user log. */
  private async prune(
    tx: Tx,
    table: 'journalEntry' | 'balanceEvent',
    userId: string,
    keep: number
  ): Promise<void> {
    const query = { where: { userId }, orderBy: { seq: 'desc' as const }, skip: keep, take: 1 };
    if (table === 'journalEntry') {
      const [cutoff] = await tx.journalEntry.findMany({ ...query, select: { seq: true } });
      if (cutoff) await tx.journalEntry.deleteMany({ where: { userId, seq: { lte: cutoff.seq } } });
    } else {
      const [cutoff] = await tx.balanceEvent.findMany({ ...query, select: { seq: true } });
      if (cutoff) await tx.balanceEvent.deleteMany({ where: { userId, seq: { lte: cutoff.seq } } });
    }
  }

  /** Full account view for GET /api/paper/state and the private WS snapshot. */
  async snapshot(userId: string): Promise<PaperStateDTO> {
    const { state, version, marginModeNotice } = await this.load(userId);
    const [orders, trades, journal, balanceEvents, fundings] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId, status: { not: 'PENDING' } },
        orderBy: { seq: 'desc' },
        take: MAX_ORDERS,
      }),
      // Closed trades only — funding settlements are their own list, so they can't crowd out
      // MAX_HISTORY (BP-4)
      this.prisma.trade.findMany({
        where: { userId, execType: { not: 'Funding' } },
        orderBy: { seq: 'desc' },
        take: MAX_HISTORY,
      }),
      this.prisma.journalEntry.findMany({
        where: { userId },
        orderBy: { seq: 'desc' },
        take: MAX_JOURNAL,
      }),
      this.prisma.balanceEvent.findMany({
        where: { userId },
        orderBy: { seq: 'desc' },
        take: MAX_BALANCE_EVENTS,
      }),
      this.prisma.trade.findMany({
        where: { userId, execType: 'Funding' },
        orderBy: { seq: 'desc' },
        take: MAX_FUNDINGS,
      }),
    ]);
    return {
      account: {
        balance: state.balance.toString(),
        realizedPnl: state.realizedPnl.toString(),
        leverage: state.leverage,
        symbolLeverage: state.symbolLeverage,
        marginMode: state.marginMode ?? 'ISOLATED_MARGIN',
        ...(marginModeNotice ? { marginModeNotice: true } : {}),
        version,
      },
      positions: state.positions.map((p) =>
        positionDTO(p, this.riskTiers(p.symbol), state.marginMode)
      ),
      spotBalances: state.spot.map(spotDTO),
      pendingOrders: state.pendingOrders.map(pendingDTO),
      orders: orders.map(historyOrderFromRow),
      trades: trades.map(tradeFromRow),
      journal: journal.map(journalFromRow),
      balanceEvents: balanceEvents.map(balanceEventFromRow),
      fundings: fundings.map(fundingFromRow),
    };
  }

  /**
   * Every open trigger, grouped by user — engine boot. Every open position is one: besides its
   * TP / SL, any USDT Perpetual position can be liquidated (BP-3). Plus every pending order.
   */
  async loadOpenTriggers(): Promise<Map<string, AccountState>> {
    const [positions, pending] = await Promise.all([
      this.prisma.position.findMany({ orderBy: [{ openedAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.order.findMany({ where: { status: 'PENDING' }, orderBy: { seq: 'asc' } }),
    ]);
    const byUser = new Map<string, AccountState>();
    const entry = (userId: string) => {
      let st = byUser.get(userId);
      if (!st) {
        st = {
          balance: new Decimal(STARTING_BALANCE),
          realizedPnl: new Decimal(0),
          leverage: 1,
          symbolLeverage: {},
          symbolFundingAt: {},
          spot: [],
          positions: [],
          pendingOrders: [],
        };
        byUser.set(userId, st);
      }
      return st;
    };
    for (const p of positions) entry(p.userId).positions.push(positionFromRow(p));
    for (const o of pending) entry(o.userId).pendingOrders.push(pendingFromRow(o));
    return byUser;
  }
}
