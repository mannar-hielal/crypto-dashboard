---
name: paper-trading-logic
description: Use for any work involving paperStore, paper trading, order placement/fill/cancel, TP/SL monitoring, bracket orders, journal entries, leverage, commission accounting, balance/PnL math, OrderAccountManagementPanel, TradingPanel, PositionEditPanel, PendingOrderEditPanel, the server engine (apps/server/src/trading: MatchingEngine, TradingService, engine/actions), usePaperFeed, or Bybit real-money integration. Covers exact business rules from docs/APP_LOG.md so logic bugs don't regress.
---

# Paper Trading — Business Rules (cryptopapertrade.com)

Source of truth: `docs/APP_LOG.md` (sections "Business Logic Rules", "paperStore", "Right TradingPanel", "Bottom Panel"). Cross-reference: `docs/TRADING_TEST_PLAN.md` (Part A test strategy + Part B case catalogue, ordered by learning stage).

## Files

**Since BP-1 (2026-09-26) the server executes every trade** (`docs/APP_LOG.md` Bybit Parity BP-1). Change trading
rules in `apps/server/src/trading/engine/`, never in the client. **Since BP-2 there are two markets** (`category`):
`'spot'` (coin balances, 1×, no shorting) and `'linear'` = USDT Perpetual (positions, per-symbol leverage). Every
position, order, trade and trigger names its market. **Since BP-3** a USDT Perpetual symbol has **one** position
(one-way mode: same-side fills merge), is valued at the **mark** price, and is **liquidated** when the mark reaches
its liquidation price (isolated margin, Bybit's formulas). **Since BP-5** the margin mode is account-wide (`Account.marginMode`:
`REGULAR_MARGIN` = cross — new accounts — or `ISOLATED_MARGIN`); TP / SL / stops trigger on Last / Mark / Index;
orders can be reduce-only / close-on-trigger; a risk-limit cap (110090) and partial liquidation by tier apply.

| File                                                                                       | Role                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/trading/engine/actions.ts`                                                | **USDT Perpetual rules**: pure, Decimal. Market with netting / flip, close, limit / stop (crossing = taker now), cancel / edit / exit legs, fills, per-symbol leverage, notes, reset         |
| `apps/server/src/trading/engine/spot.ts`                                                   | **Spot rules**: buy / sell, limit (USDT or coin lock), TP / SL OCO legs, fees in the received asset, average cost                                                                            |
| `apps/server/src/trading/engine/draft.ts`                                                  | Shared working copy (incl. coin balances), order sizing (`qty` / `value` / legacy margin), book prices, record builders                                                                      |
| `apps/server/src/trading/bybitSpec.ts`                                                     | Bybit VIP-0 fee rates, rejection wording, qty-step / tick / minimum checks, fallback instrument rules; BP-3 isolated margin: `feeToClose`, `positionRisk` (liq / bust / IM / MM), risk tiers |
| `apps/server/src/trading/engine/margin.ts`                                                 | `riskOf(position, tiers)`, `tiersFor(ctx, symbol)` — engine adapter over the bybitSpec margin maths                                                                                          |
| `apps/server/src/trading/engine/cross.ts`                                                  | BP-5 cross margin: `accountLiquidatable`, `liquidateAccount` (contract order, tier steps), `switchMarginMode` (Bybit's checks)                                                               |
| `apps/server/src/trading/engine/orderRules.ts`                                             | BP-5 reduce-only (`reduceOnlyTarget`, `trimReduceOnly`), O9 TP / SL side check (`exitSideProblem`), risk-limit cap (`effectiveValue`, `riskLimitProblem`)                                    |
| `apps/server/src/trading/bybitParity.ts` / `src/tools/bybitParity.ts`                      | BP-5 G: DTO → Bybit v5 field adapter + diff; the manual testnet parity run (`parity:testnet`)                                                                                                |
| `apps/server/src/trading/engine/triggers.ts`                                               | `checkTPSL`, `checkPendingTrigger`, `evaluateTick` (live, tick price) and `evaluateCandle` (backfill sweep)                                                                                  |
| `apps/server/src/trading/engine/journal.ts` / `format.ts`                                  | Journal wording and `fmtPrice` (kept word for word from the browser engine)                                                                                                                  |
| `apps/server/src/trading/TradingService.ts`                                                | Intent → live quote (ask / bid, refused if > 10 s old) + instrument rules → engine → `AccountRepository` → `PaperEventBus`                                                                   |
| `apps/server/src/trading/MatchingEngine.ts`                                                | 24/7 TP/SL + pending triggers per market (`category:symbol`); the `EngineLease` single executor; gap backfill per market                                                                     |
| `apps/server/src/trading/AccountRepository.ts`                                             | One transaction per action, `Account.version` optimistic guard, `refId` for pre-BP-1 rows                                                                                                    |
| `apps/server/src/routes/paper/index.ts` / `ws.ts`                                          | Intent-only REST API and the private WS `/api/paper/ws`                                                                                                                                      |
| `apps/client/src/store/paperStore.ts`                                                      | **Read model**: `hydrate` / `applyDelta` (version-gated) / `clear`; actions call `paperApi`                                                                                                  |
| `apps/client/src/hooks/usePaperFeed.ts`                                                    | Private WS: snapshot + deltas, server-decided sounds                                                                                                                                         |
| `apps/client/src/components/dashboard/TradingPanel.tsx`                                    | Order entry: market tabs, BTC / USDT amount, `1x ▾` leverage chip, per-market estimates (`lib/orderMath.ts`) — pre-validation only                                                           |
| `apps/client/src/lib/marketRoutes.ts` / `hooks/useMarketUrlSync.ts`                        | Market URLs (`/dashboard/spot/BTC/USDT`, `/dashboard/usdt/BTCUSDT`) ↔ the active pane; D7 hand-off                                                                                           |
| `apps/client/src/components/dashboard/OrderAccountManagementPanel.tsx`                     | Positions · Orders · Order History · Balance History · Journal tabs + Account Settings modal                                                                                                 |
| `apps/client/src/components/dashboard/PositionEditPanel.tsx` / `PendingOrderEditPanel.tsx` | TV-style edit panels                                                                                                                                                                         |

Tests: engine `apps/server/src/trading/engine/__tests__/` (the ported store and monitor cases), services
`apps/server/src/trading/__tests__/`, routes / WS `apps/server/src/__tests__/paper.test.ts`.

## State

The server holds everything: `Account` (balance = `availableBalance` = the USDT wallet, `realizedPnl`, default
`leverage`, `version`), `SymbolSetting` (per-symbol leverage), `SpotBalance` (`free`, `locked`, `avgCost` per coin),
`Position` (USDT Perpetual; `leverage`, `entryFee`, `closeFeeReserve`), `Order` (PENDING rows = pending orders with
`reserved`, other rows = order history with `feeRate` / `feeAsset` / `isMaker`), `Trade`, `JournalEntry` and
`BalanceEvent` (capped at 200 per user). The client mirrors it, not persisted:

```
balance            free USDT (margin, fees and reserves already deducted)
spotBalances[]     coin balances (free / locked / avgCost)
symbolLeverage     per-symbol leverage (leverageFor(state, symbol); `leverage` = default)
positions[]        open positions
pendingOrders[]    limit/stop orders awaiting trigger (carry their placement leverage)
history[]          closed trades (MAX_HISTORY = 100)
orders[]           HistoricalOrder records (200)
realizedPnl        net of all commissions
balanceLog[]       balance change log (200)
journal[]          trading journal (MAX_JOURNAL = 200)
version            server account version — applyDelta ignores anything not newer
```

**Every client list is capped on every change (`prepend(..., MAX_*)`) — no unbounded growth.** `bug-sweep` P4-59 enforces this for new fields.

## Fees (exact — do not approximate; BP-2, Bybit VIP-0)

- Rates: `bybitSpec.ts` `FEE_RATES` (server) = `FEE_RATES` in `generated/CDSDK/spec/bybit.ts` (client estimates) — a
  server test keeps them identical. **USDT Perpetual** taker 0.055% / maker 0.02%; **Spot** 0.1%.
- **Liquidity:** market, stop, TP/SL and a limit that crosses the book at placement → taker; a resting limit → maker.
- **Perp open:** `balance -= IM + openFee + estCloseFee` — IM = `qty × price / leverage`, fees on notional; the close
  estimate is stored as `closeFeeReserve` and comes back at close.
- **Perp close:** `balance += IM + closeFeeReserve + pnl − closeFee` (floored at 0);
  `realizedPnl += pnl − closeFee − entryFee` (the **stored** entry fee).
- **Resting order:** reserves IM + taker open + taker close at the trigger (`reserved`); cancel / edit / fill refund
  exactly `reserved`.
- **Spot:** a buy pays `qty × price` USDT and the fee comes out of the coins (rounded up to 8 dp); a sell needs
  `free ≥ qty` and pays the fee in USDT. Realized = `(price − avgCost) × qty − fee`.
- `BalanceEvent.pnl` = `pnl − closeFee` (net balance impact at close).
- **Never recompute past fees:** pre-BP-2 rows carry the 0.07% they paid (migration backfill), and a row with no
  stored fee is read at that legacy rate.
- **Fill prices:** market buy at the ask, sell at the bid; a resting limit at its own price; stops / TP / SL trigger on
  the last price and fill at the ask / bid; a backfilled trigger at the level it crossed.
- **Size rules:** qty rounded down to `qtyStep`; below `minOrderQty` / `minNotional` or off the tick grid → 422 with
  Bybit's wording, nothing written.
- **Leverage:** per symbol, max 10×. Changing it with a position / active orders **re-margins** them (BP-3): IM =
  `qty × entry / newLev`, fee to close re-estimated; lowering needs the extra margin in the wallet, raising is refused
  without a fresh mark or when the mark is already past the new liquidation price (422, nothing written).

## Isolated margin & liquidation (BP-3 — exact, see `bybitSpec.ts` for the source and the worked example)

- **Fee to close** (reserved at open, Bybit's estimate): `qty × entry × (1 ∓ 1/leverage) × taker` (− long, + short) —
  priced at the bankruptcy price. A 1× long reserves 0.
- **Liq. price** long `= (entry × qty − IM − extra/(1 − taker) − mmDeduction) / (qty × (1 − MMR))`; short
  `= (entry × qty + IM + extra/(1 + taker) + mmDeduction) / (qty × (1 + MMR))`. IM is the position's **stored**
  margin. 0 = can't be liquidated (1× long). **Bankruptcy** = `entry ∓ (IM + extra) / qty`.
- **Tier** = the risk-limit tier the position **value** falls in (not always tier 1). Live tiers refresh hourly;
  `FALLBACK_RISK_TIERS` must equal the SDK copy.
- **Derived, never stored:** liq / bust / positionIM / positionMM / mmr are computed when evaluated or sent.
- **Trigger:** mark ≤ liq (long) / ≥ liq (short), on a mark ≤ 10 s old. Liquidation is checked before TP / SL on a
  live tick; in a candle backfill TP / SL first (a stop sits before the liquidation price).
- **Settlement:** cancel + refund the symbol's active orders; close all at the bankruptcy price; fee = the whole
  close-fee reserve; nothing returns to the wallet; `realizedPnl += −(IM + extra) − reserve − entryFee`. Records:
  Trade `execType 'BustTrade'`, close order `createType 'CreateByLiq'`, TP / SL cancel rows, journal + balance event,
  sound `'liquidation'`.
- **Funding (BP-4):** at each symbol's funding timestamp every position held then pays `size × mark × rate` (+ rate:
  long pays, short receives), Bybit's settled rate; from the balance, shortfall from that position's margin; realized
  PnL + `cumFunding`; `execType 'Funding'` row + journal + balance event; once per account/symbol/timestamp
  (`SymbolSetting.lastFundingAt`); closes carry `funding` (Closed P&L), never charged twice. Engine:
  `MatchingEngine` funding clock + `settleFunding` in `actions.ts`.
- **Cross margin (BP-5 E):** `bybitSpec.accountFigures` — margin balance = wallet + Σ UPL at mark; IM / MM are
  **mark-based** (`size × mark / lev + fee to close`, `size × mark × MMR − ded + fee to close`); available = margin
  balance − total IM (orders' reserves count). Wallet = `balance` + what positions / linear orders hold (the same
  bookkeeping as isolated; `balance` may go below 0 in cross). An order needs `cost ≤ available` (unrealised profit
  counts); a close's loss beyond its margin and funding come out of the wallet; no per-position liquidation — at an
  MM rate ≥ 100% `liquidateAccount` cancels linear orders and steps positions down in `CROSS_LIQUIDATION_ORDER` at
  the estimated bankruptcy price, re-checking after each step. The client estimates cross liq prices
  (`crossLiqPriceEstimate`); the server omits them for cross positions. The SDK mirror must stay parity-tested.
- **Isolated extras (BP-5):** `extraMargin` (add / reduce; released on a leverage change or a switch to cross);
  partial liquidation above tier 1 (`stepDownTiers`); a clamped close books only what was lost.
- **Order flags (BP-5 B):** `tpTriggerBy` / `slTriggerBy` / `triggerBy` absent = LastPrice (only non-defaults are
  stored on the engine objects / DTOs); `reduceOnly` / `closeOnTrigger` hold no margin, never open or flip, and are
  trimmed by `trimReduceOnly` after every fill / close. New / changed TP / SL go through `exitSideProblem`.
- **One-way merge:** a same-side fill adds to the position — qty-weighted entry (8 dp), margin / entryFee /
  closeFeeReserve summed; a TP / SL attached to the new order replaces the position's.
- **Client:** perp PnL uses the mark (`getLastKnownMarkPrice` / pane `markPrice`, falling back to last); helpers in
  `lib/positionMath.ts`; order-form estimate `orderMath.estimateLiqPrice`; chart lines `lib/tradeLines.ts` +
  `hooks/useTradeLines.ts`.

## TP/SL bracket lifecycle (TV-style — easy to break)

- **Long**: TP when `price >= takeProfit`; SL when `price <= stopLoss`.
- **Short**: TP when `price <= takeProfit`; SL when `price >= stopLoss`.
- `checkTPSL()` is **pure + exported + unit-tested** — keep doing that for any new pure logic (`bug-sweep` P6-84).
- The `MatchingEngine` evaluates a tick only against that symbol's accounts (`evaluateTick(symbol, …)`) — cross-symbol false triggers are the 4.18 regression; `triggers.test.ts` guards it.
- **Bracket**: placing limit/stop with TP + SL creates 3 linked rows in the Orders tab: parent + TP child + SL child.
  - Pre-fill/trigger: parent = Working, children = Inactive.
  - Cancelling parent cancels all 3 (`cancelPendingOrder`).
  - Post-fill: parent → historical Filled; children become Working and are individually cancellable (`cancelExitOrder`).
- **Position close — sibling cancel** (in `closePosition`): builds `siblingCancelOrders: HistoricalOrder[]`.
  - `closeType === 'take-profit'` → cancel SL sibling.
  - `closeType === 'stop-loss'` → cancel TP sibling.
  - Manual close (no closeType) → cancel both remaining exit legs.
  - Each cancelled record: `type: 'take-profit' | 'stop-loss'`, `status: 'cancelled'`, `commission: 0`, `placingTime = pos.openedAt`, `closingTime = now`, `limitPrice`/`stopPrice` filled with the exit level. They land in `orders[]` → visible in Orders → Cancelled and Order History → Cancelled. **No journal note** for auto-cancelled siblings.

## Order placement + monitor

- `placeOrder` (market): no trigger price, exec at `latestPrice`; deducts entry commission.
- `placeLimitOrder` / `placeStopOrder`: deduct `usdtAmount + commission` immediately; reserve `usdtAmount` in `pendingOrders`; no historical fill row yet.
- `cancelPendingOrder`: refunds `usdtAmount + commission`; writes cancelled parent `HistoricalOrder` + cancelled child TP/SL rows when present.
- `cancelExitOrder`: cancels ONE active exit leg for an open position; keeps sibling leg active; writes cancelled `HistoricalOrder`.
- Execution (pending → open position) is `fillPending` in the server engine, run 24/7 by the `MatchingEngine` ✅. It uses the order's placement leverage (S2) and records a rejected fill instead of dropping it (S1).

## Journal

- `JournalEntry` has `id, time, text, isUserNote?, pnl?`.
- `isUserNote: true` → user-added/editable (`editJournalEntry` allowed).
- `isUserNote: false` → system-generated, read-only (`editJournalEntry` guards at store level).
- `pnl` (net = gross − exit commission) lives only on close entries — undefined on open/pending/user notes.
- `closePosition` attaches it to the exec entry; a TP/SL close (`closeOnExit`) attaches it to its "Auto-closed …" reason entry.

## Edit panels (`editTarget` state in `DashboardPage`)

- `editTarget: null | { kind: 'position'; positionId } | { kind: 'pending'; orderId }`.
- Right column renders `PositionEditPanel` or `PendingOrderEditPanel` instead of `TradingPanel`, using the same width-spring `AnimatePresence` pattern.
- Pencil icons reveal on hover in `OrderAccountManagementPanel`:
  - Positions tab: TP and SL cells open `PositionEditPanel`.
  - Orders tab pending rows: limit-price pencil only when `type === 'limit'`; stop-price pencil only when `type === 'stop'` (duplicate-pencil bug already fixed — KEEP THE GUARD).
  - Inactive TP/SL exit rows: pencil opens `PendingOrderEditPanel(ex.positionId)` (`positionId` stores the parent pending order ID).
- Price/qty inputs are `type="text" inputMode="decimal"` and run `.replace(/,/g, '')` on parse — `fmtMktPrice` returns locale-formatted strings with commas that `type="number"` silently rejects.
- Phantom button guard: render pencil buttons ONLY when `onEdit*` callbacks wired by the parent — use explicit `onEditPosition && <button ...>` rather than optional-chain `onClick?:`. Don't regress this.
- `updatePositionExits()` / `editPendingOrder()` produce delta-aware multi-entry journal logs and write cancel records when TP/SL removed. Match the structure when extending.

## Sanity-warnings before submit (TradingPanel)

- Blocking confirm modal when SL deviates >80% from live price, or `SL > 10% below entry` (large-distance warning). User must confirm explicitly; state tracked by `slConfirmPending` / `slConfirmBypassed`. Don't bypass.

## Testing

- Tests use Vitest (`environment: 'jsdom'` for client). Mock Prisma via `Symbol.for('skip-override')`.
- Pure helpers (`checkTPSL`) are extracted and unit-tested directly.
- `beforeEach` resets stores via `reset()` — never partial `setState` (`bug-sweep` P6-85: partial resets silently leave new fields at previous values).
- Reference matrix: `docs/TRADING_TEST_PLAN.md` Part B, ordered by learning stage (its "Where did Section N go?" table maps each section) — sections 1 (market), 2 (limit + bracket), 3 (stop), 4 (cross-cutting: panels, journal, TP/SL edits), 7 (Order History), 8 (Account Settings), 14.6 (Spot), 14.2–14.5 (perp fees, fills, size, leverage), 15 (mark, liquidation), 16 (funding), 17 (cross margin, risk tiers, Closed P&L). Each row carries a Status (`⬜ ✅ ❌ ⚠️ ⏳ ➖`) and a Tier (`T1 · Vitest`, `T2 · RTL`, …); open rows are collected in A10.

## When extending paperStore

1. Bump `cd-paper-trading` `version` and write `migrate` for new fields.
2. Update `MAX_*` cap if any new array grows.
3. Add unit tests for the new action; at least happy-path + one error/edge.
4. Add a row to `docs/TRADING_TEST_PLAN.md` and mark `⬜` until verified.
5. Update `docs/APP_LOG.md` Actions list and state interface snippet.
