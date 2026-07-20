---
name: paper-trading-logic
description: Use for any work involving paperStore, paper trading, order placement/fill/cancel, TP/SL monitoring, bracket orders, journal entries, leverage, commission accounting, balance/PnL math, OrderAccountManagementPanel, TradingPanel, PositionEditPanel, PendingOrderEditPanel, useTPSLMonitor, usePendingOrderMonitor, or Bybit real-money integration. Covers exact business rules from docs/APP_LOG.md so logic bugs don't regress.
---

# Paper Trading — Business Rules (cryptopapertrade.com)

Source of truth: `docs/APP_LOG.md` (sections "Business Logic Rules", "paperStore", "Right TradingPanel", "Bottom Panel"). Cross-reference: `docs/TRADING_TEST_PLAN.md` (478-line manual + vitest matrix).

## Files

| File                                                                                       | Role                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `apps/client/src/store/paperStore.ts`                                                      | All paper trading state + actions; exports `COMMISSION_RATE = 0.0007`                        |
| `apps/client/src/hooks/useTPSLMonitor.ts`                                                  | Auto-close positions on TP/SL hit; exports pure `checkTPSL()` (unit-tested)                  |
| `apps/client/src/hooks/usePendingOrderMonitor.ts`                                          | Executes limit/stop pending orders on price trigger                                          |
| `apps/client/src/components/dashboard/TradingPanel.tsx`                                    | Right sidebar order entry; exports `OrderTab`                                                |
| `apps/client/src/components/dashboard/OrderAccountManagementPanel.tsx`                     | Positions · Orders · Order History · Balance History · Journal tabs + Account Settings modal |
| `apps/client/src/components/dashboard/PositionEditPanel.tsx` / `PendingOrderEditPanel.tsx` | TV-style edit panels wired via `editTarget` state in `DashboardPage`                         |

## State (`paperStore.ts`, persisted key `cd-paper-trading`, version 1 + `migrate`)

```
balance            free cash (entryUsdtAmount deducted at open)
positions[]        open positions
pendingOrders[]    limit/stop orders awaiting trigger
history[]          closed trades (MAX_HISTORY = 100)
orders[]           all HistoricalOrder records (MAX_HISTORY * 2)
realizedPnl        net of all commissions
balanceLog[]       balance change log (MAX_HISTORY * 2)
journal[]          trading journal (MAX_JOURNAL = 200)
```

**Every array cap uses `.slice(0, MAX_*)` on every `set` — no unbounded growth.** `bug-sweep` P4-59 enforces this for new fields.

## Commission (exact — do not approximate)

- `COMMISSION_RATE = 0.0007` (0.07% taker) — exported from `paperStore.ts`.
- **Open**: `balance -= usdtAmount + usdtAmount * COMMISSION_RATE`.
- **Close**: `commission = qty * exitPrice * COMMISSION_RATE`.
- **Balance check**: `usdtAmount + usdtAmount * COMMISSION_RATE > balance` → reject.
- `realizedPnl` = `gross_pnl − exitCommission − entryCommission` (both legs).
- `BalanceEvent.pnl` = `pnl − exitCommission` (net balance impact at close).
- Leverage: paper learning-app cap **max 10×** (`paperStore.leverage`, persisted via Account Settings modal). Trade value = `usdtAmount * leverage`.

## TP/SL bracket lifecycle (TV-style — easy to break)

- **Long**: TP when `price >= takeProfit`; SL when `price <= stopLoss`.
- **Short**: TP when `price <= takeProfit`; SL when `price >= stopLoss`.
- `checkTPSL()` is **pure + exported + unit-tested** — keep doing that for any new pure logic (`bug-sweep` P6-84).
- `useTPSLMonitor` evaluates positions matching the active symbol only — cross-symbol false triggers are a known bug risk; never extend the filter without a test.
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
- Execution (pending → open position) is handled by `usePendingOrderMonitor` ✅.

## Journal

- `JournalEntry` has `id, time, text, isUserNote?, pnl?`.
- `isUserNote: true` → user-added/editable (`editJournalEntry` allowed).
- `isUserNote: false` → system-generated, read-only (`editJournalEntry` guards at store level).
- `pnl` (net = gross − exit commission) lives only on close entries — undefined on open/pending/user notes.
- `closePosition` attaches it to the exec entry; `useTPSLMonitor` passes via `addJournalNote(text, false, netPnl)`.

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
- Reference matrix: `docs/TRADING_TEST_PLAN.md` — sections 1 (market), 2 (limit + bracket), 3 (stop), 4 (TP/SL auto), 5+ (close/edit), 7 (Order History), 8 (Balance History), 9 (Journal). Each row carries a Status (`⬜ ✅ ❌ ⚠️`) and a Tier (`T1 · Vitest`, `T2 · RTL`).

## When extending paperStore

1. Bump `cd-paper-trading` `version` and write `migrate` for new fields.
2. Update `MAX_*` cap if any new array grows.
3. Add unit tests for the new action; at least happy-path + one error/edge.
4. Add a row to `docs/TRADING_TEST_PLAN.md` and mark `⬜` until verified.
5. Update `docs/APP_LOG.md` Actions list and state interface snippet.
