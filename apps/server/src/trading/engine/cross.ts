/**
 * Cross margin (APP_LOG Bybit Parity BP-5 E): account liquidation and the margin-mode switch.
 *
 * The account figures (bybitSpec.accountFigures) value every USDT Perpetual position at its mark
 * price. The context's `markPrice` supplies the marks; a symbol with no mark is valued at its entry
 * price.
 *
 * Account liquidation (Bybit "UTA liquidation process", 2026-08-07): when the account MM rate
 * reaches 100%, the account's USDT Perpetual orders are cancelled, then positions are liquidated in
 * Bybit's contract order (most liquid first), each stepping its risk-limit tier down as in BP-5 C,
 * re-checking the MM rate after every step and stopping as soon as it is below 100%. A step closes
 * at the position's estimated bankruptcy price — the price at which, every other position held
 * constant, closing the whole position (with the taker fee) would leave the account's margin
 * balance at 0. So each step loses the closed part's share of the account equity, as a bankruptcy
 * close does. Whatever tiny negative wallet balance rounding leaves once nothing is open is written
 * off (Bybit's insurance fund).
 *
 * Mode switch (O3 — Bybit's rules, `POST /v5/account/set-margin-mode`):
 * - Isolated → Cross: margin added by hand returns to the wallet (cross has no per-position
 *   margin); refused if the account IM rate would pass 100%.
 * - Cross → Isolated: refused if the wallet can't hold the positions' isolated margin (a negative
 *   free balance), or if a position's mark is already at or past its isolated liquidation price.
 * A refusal lists every reason, like Bybit's 3400045.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { CROSS_LIQUIDATION_ORDER, feeRate, markHitsLiquidation, tierFor } from '../bybitSpec.js';
import { closingSide, settle } from './actions.js';
import {
  Draft,
  ZERO,
  cancelledLegRow,
  pendingLegCancels,
  refused,
  triggerPriceField,
} from './draft.js';
import { fmtPrice, pendingSideLabel, pendingTypeLabel } from './format.js';
import { systemEntry } from './journal.js';
import { crossFigures, riskOf, tiersFor } from './margin.js';
import type {
  AccountState,
  ActionResult,
  EngineContext,
  HistoricalOrder,
  MarginMode,
  Position,
} from './types.js';

const TAKER = feeRate('linear', 'taker');

const figuresOf = (d: Draft, ctx: EngineContext) =>
  crossFigures({ balance: d.balance, positions: d.positions, orders: d.pending }, ctx);

/** True when a cross account's MM rate has reached 100% (it has something left to liquidate). */
export function accountLiquidatable(
  state: AccountState,
  ctx: Pick<EngineContext, 'riskTiers' | 'markPrice'>
): boolean {
  if (state.marginMode !== 'REGULAR_MARGIN' || state.positions.length === 0) return false;
  return crossFigures(
    { balance: state.balance, positions: state.positions, orders: state.pendingOrders },
    ctx
  ).mmRate.gte(1);
}

/** Bybit's contract order for cross liquidation; unknown symbols last, alphabetically. */
function liquidationRank(symbol: string): number {
  const i = (CROSS_LIQUIDATION_ORDER as readonly string[]).indexOf(symbol);
  return i === -1 ? CROSS_LIQUIDATION_ORDER.length : i;
}

/**
 * The estimated bankruptcy price of `pos` in cross: closing all of it there, with the taker fee,
 * leaves the margin balance at 0 (every other position held constant).
 */
function crossBustPrice(pos: Position, mark: Decimal, marginBalance: Decimal): Decimal {
  const one = new Decimal(1);
  const q = pos.quantity;
  const p =
    pos.side === 'long'
      ? mark
          .times(q)
          .minus(marginBalance)
          .div(q.times(one.minus(TAKER)))
      : mark
          .times(q)
          .plus(marginBalance)
          .div(q.times(one.plus(TAKER)));
  return Decimal.max(ZERO, p);
}

/** One liquidation step: close `closeQty` of `pos` at `price` (a BustTrade), from the wallet. */
function liquidationStepInto(
  d: Draft,
  pos: Position,
  closeQty: Decimal,
  price: Decimal,
  mark: Decimal,
  ctx: EngineContext
): void {
  const s = settle(pos, closeQty, price, TAKER, true);
  const now = ctx.now;
  const stepId = ctx.newId();
  const full = closeQty.gte(pos.quantity);
  const label = pos.side === 'long' ? 'LONG' : 'SHORT';

  d.prependTrade({
    id: full ? pos.id : `${pos.id}-liq-${stepId}`,
    category: 'linear',
    symbol: pos.symbol,
    side: pos.side,
    quantity: closeQty,
    entryPrice: pos.entryPrice,
    exitPrice: price,
    pnl: s.pnl,
    exitCommission: s.fee,
    openFee: s.entryFee,
    margin: s.margin,
    openedAt: pos.openedAt,
    closedAt: now,
    execType: 'BustTrade',
    ...(s.funding.eq(0) ? {} : { funding: s.funding }),
  });
  const legCancels: HistoricalOrder[] = [];
  if (full) {
    for (const [leg, level] of [
      ['take-profit', pos.takeProfit],
      ['stop-loss', pos.stopLoss],
    ] as const) {
      if (!level) continue;
      legCancels.push(
        cancelledLegRow(
          `o-cancel-${leg}-${pos.id}-${now}`,
          leg,
          pos.symbol,
          closingSide(pos),
          pos.quantity,
          level,
          pos.openedAt,
          now
        )
      );
    }
  }
  d.prependOrders(
    {
      id: `o-liq-${stepId}`,
      category: 'linear',
      symbol: pos.symbol,
      side: closingSide(pos),
      type: 'market',
      qty: closeQty,
      fillPrice: price,
      status: 'filled',
      commission: s.fee,
      feeRate: TAKER,
      feeAsset: 'USDT',
      isMaker: false,
      placingTime: now,
      closingTime: now,
      createType: 'CreateByLiq',
      reduceOnly: true,
    },
    ...legCancels
  );
  d.prependBalanceEvent({
    id: `bl-liq-${stepId}`,
    time: now,
    balanceBefore: d.balance,
    balanceAfter: d.balance.plus(s.returnAmount),
    pnl: s.netPnl,
    action: `Cross liquidation of ${pos.side} position for ${pos.symbol} at bankruptcy price ${price.toFixed(4)} for ${closeQty.toFixed(6)} units`,
  });
  d.prependJournal(
    systemEntry(
      `j-liq-${stepId}`,
      now,
      `${full ? 'Liquidated' : 'Partially liquidated'} ${label} ${pos.symbol} (cross) — the account's ` +
        `maintenance margin rate reached 100% at mark $${fmtPrice(mark)}; ${closeQty.toFixed(6)} closed at ` +
        `the estimated bankruptcy price $${fmtPrice(price)}`,
      s.netPnl
    )
  );
  d.balance = d.balance.plus(s.returnAmount);
  d.realizedPnl = d.realizedPnl.plus(s.realized);
  if (full) {
    d.removePosition(pos.id);
  } else {
    d.setPosition({
      ...pos,
      quantity: pos.quantity.minus(closeQty),
      entryUsdtAmount: pos.entryUsdtAmount.minus(s.margin),
      entryFee: pos.entryFee.minus(s.entryFee),
      closeFeeReserve: pos.closeFeeReserve.minus(s.reserve),
      ...(pos.cumFunding ? { cumFunding: pos.cumFunding.minus(s.funding) } : {}),
      ...(pos.extraMargin ? { extraMargin: pos.extraMargin.minus(s.extra) } : {}),
    });
  }
}

/**
 * Liquidate a cross account whose MM rate reached 100% at the context's marks. A no-op (null)
 * when it isn't cross or the rate is below 100% now. Result: the number of liquidation steps.
 */
export function liquidateAccount(
  state: AccountState,
  ctx: EngineContext
): ActionResult<number | null> {
  const d = new Draft(state);
  if (!accountLiquidatable(state, ctx)) return { delta: d.toDelta(), result: null };
  const now = ctx.now;

  // 1. Cancel the account's USDT Perpetual orders (refund their reserves)
  for (const order of d.pending.filter((o) => o.category === 'linear')) {
    d.prependOrders(
      {
        id: `o-cancel-liq-${order.id}`,
        category: 'linear',
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        qty: order.qty,
        ...triggerPriceField(order.type, order.triggerPrice),
        status: 'cancelled',
        commission: ZERO,
        placingTime: order.placedAt,
        closingTime: now,
      },
      ...pendingLegCancels(order, (leg) => `o-cancel-liq-${leg}-${order.id}`, now)
    );
    d.prependJournal(
      systemEntry(
        `j-cancel-liq-${order.id}`,
        now,
        `Cancelled ${pendingTypeLabel(order.type)} ${pendingSideLabel(order.side)} ${order.symbol} @ $${fmtPrice(order.triggerPrice)}` +
          ` before cross liquidation (refunded: $${order.reserved.toFixed(2)})`
      )
    );
    d.balance = d.balance.plus(order.reserved);
    d.removePending(order.id);
  }

  // 2. Step the positions down, in contract order, until the MM rate is below 100%
  let steps = 0;
  const symbols = [...new Set(d.positions.map((p) => p.symbol))].sort(
    (a, b) => liquidationRank(a) - liquidationRank(b) || a.localeCompare(b)
  );
  for (const symbol of symbols) {
    for (;;) {
      const figures = figuresOf(d, ctx);
      if (figures.mmRate.lt(1)) return { delta: d.toDelta(), result: steps, sound: 'liquidation' };
      const pos = d.positions.find((p) => p.symbol === symbol);
      if (!pos) break;
      const mark = ctx.markPrice?.(symbol) ?? pos.entryPrice;
      const tiers = tiersFor(ctx, symbol);
      const tier = tierFor(tiers, pos.quantity.times(mark));
      const idx = tiers.indexOf(tier);
      // Above the lowest tier: reduce to the next lower tier's limit; in it: close in full
      const keep =
        idx > 0
          ? tiers[idx - 1].riskLimitValue.div(mark).toDecimalPlaces(8, Decimal.ROUND_DOWN)
          : ZERO;
      const closeQty =
        keep.gt(0) && keep.lt(pos.quantity) ? pos.quantity.minus(keep) : pos.quantity;
      liquidationStepInto(
        d,
        pos,
        closeQty,
        crossBustPrice(pos, mark, figures.marginBalance),
        mark,
        ctx
      );
      steps += 1;
    }
  }
  // Nothing left open: a rounding shortfall is written off (Bybit's insurance fund)
  if (!d.positions.length && d.balance.lt(0)) d.balance = ZERO;
  return { delta: d.toDelta(), result: steps, sound: 'liquidation' };
}

// ─── Mode switch ───────────────────────────────────────────────────────────────

/** Bybit 3400045 — the switch's checks failed; every reason is listed */
export const REJECT_MARGIN_MODE = (reasons: string[]) =>
  `Set margin mode failed: ${reasons.join('; ')}`;
export const MODE_REASON_IM_RATE =
  "The account's initial margin rate would exceed 100% in cross margin";
export const MODE_REASON_BALANCE =
  'Insufficient available balance to hold the positions in isolated margin';
export const MODE_REASON_LIQUIDATION = (symbol: string) =>
  `The ${symbol} position would be liquidated immediately in isolated margin`;
export const MODE_REASON_NO_MARK = (symbol: string) => `Waiting for the ${symbol} mark price`;

const modeLabel = (m: MarginMode) => (m === 'REGULAR_MARGIN' ? 'Cross' : 'Isolated');

/** Switch the account's margin mode (Bybit set-margin-mode). Result: the mode now in force. */
export function switchMarginMode(
  state: AccountState,
  mode: MarginMode,
  ctx: EngineContext
): ActionResult<MarginMode> {
  const d = new Draft(state);
  const from = d.marginMode;
  if (mode === from) return { delta: d.toDelta(), result: from };
  const now = ctx.now;
  // 🔐 Ids are primary keys shared by every account: never built from the time alone
  const id = ctx.newId();
  const reasons: string[] = [];

  if (mode === 'REGULAR_MARGIN') {
    // Cross has no per-position margin: what was added by hand returns to the wallet
    let released = ZERO;
    for (const pos of d.positions) {
      const extra = pos.extraMargin ?? ZERO;
      if (extra.gt(0)) {
        released = released.plus(extra);
        d.setPosition({ ...pos, extraMargin: ZERO });
      }
    }
    if (released.gt(0)) {
      d.prependBalanceEvent({
        id: `bl-mode-${id}`,
        time: now,
        balanceBefore: d.balance,
        balanceAfter: d.balance.plus(released),
        pnl: ZERO,
        action: `Release added margin on switching to cross margin: +$${released.toFixed(2)}`,
      });
      d.balance = d.balance.plus(released);
    }
    if (figuresOf(d, ctx).imRate.gt(1)) reasons.push(MODE_REASON_IM_RATE);
  } else {
    if (d.balance.lt(0)) reasons.push(MODE_REASON_BALANCE);
    for (const pos of d.positions) {
      const mark = ctx.markPrice?.(pos.symbol);
      if (!mark) {
        reasons.push(MODE_REASON_NO_MARK(pos.symbol));
        continue;
      }
      const { liqPrice } = riskOf(pos, tiersFor(ctx, pos.symbol));
      if (markHitsLiquidation(pos.side, liqPrice, mark)) {
        reasons.push(MODE_REASON_LIQUIDATION(pos.symbol));
      }
    }
  }
  if (reasons.length) return refused(state, from, REJECT_MARGIN_MODE(reasons));

  d.marginMode = mode;
  d.prependJournal(
    systemEntry(
      `j-mode-${id}`,
      now,
      `Margin mode changed: ${modeLabel(from)} → ${modeLabel(mode)} (applies to the whole account)`
    )
  );
  return { delta: d.toDelta(), result: mode };
}
