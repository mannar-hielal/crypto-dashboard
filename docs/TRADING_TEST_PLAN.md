# Trading Panel — Manual UI Test Plan

> Status legend: ⬜ Not tested · ✅ Pass · ❌ Fail · ⚠️ Partial
>
> **TV ✓** column = cross-check against TVP Paper Trading (Bybit BTCUSDT Spot · 1m).
> Present only for numerically comparable tests. Leave blank if not dual-platform; mark ✅/❌ when testing both.
>
> **Tier legend:**

- `T1 · Vitest` — unit test (store only, jsdom)
- `T2 · RTL` — component integration test (@testing-library/react)
- `T3 · Playwright` — e2e test (real browser, live WebSocket)

> **Since BP-1 (2026-09-26) trading runs on the server.**
>
> - **T1 · Vitest rows** for Sections 1–4 and 7: the engine maths, fills, netting, journal and TP/SL / pending triggers
>   are now tested against the real engine in `apps/server/src/trading/engine/__tests__/` (`actions.test.ts`,
>   `triggers.test.ts`). They used to live in `apps/client/src/store/__tests__/paperStore.test.ts` and the two monitor
>   test files, which are gone.
> - **T2 · RTL rows:** component tests still render the real panels. They mock `paperApi` (`src/test/fakePaperApi.ts`)
>   and assert the intent sent to the server.

> **Since BP-2 (2026-09-26) there are two markets.** Sections 1–4 and 7–9 describe the leveraged form, which is now
> **USDT Perpetual** — open `/dashboard/usdt/BTCUSDT` (or pick USDT Perpetual in the header Trade menu). Spot is
> Section 14. Fees are Bybit's: USDT Perpetual 0.055% taker / 0.02% maker on notional (qty × price), Spot 0.1% in the
> asset received; BP-1's flat 0.07% only survives on rows placed before BP-2. Numbers in older ✅ notes below were
> taken at 0.07% and are kept as the record of that run. The engine's fee / fill / spot maths has worked-number
> tests in `apps/server/src/trading/engine/__tests__/fees.test.ts` and `spot.test.ts`.

**Test environment:** Local dev (`pnpm dev`). Symbol: BTCUSDT (live feed).
**Reset account between sections** using the ⚙️ gear → Reset? button.

---

## Dual-platform setup (run when doing cross-platform checks)

1. Open cryptopapertrade.com at `localhost:5173/dashboard/usdt/BTCUSDT` (or `/dashboard/spot/BTC/USDT` for Spot) — reset account
2. Open TVP → Paper Trading → Bybit BTCUSDT Spot · 1m
3. Reset TVP account
4. Place identical orders in both apps within the same second
5. Tolerance: entry prices within $1 (one SELL/BUY spread for BTC)
6. PnL formula (USDT Perpetual, BP-2): `(exit − entry) × qty − entry × qty × fee₁ − exit × qty × 0.00055`, with
   fee₁ = 0.00055 (market / stop / crossing limit) or 0.0002 (resting limit). Spot: `(exit − avgCost) × qty − exit × qty × 0.001`.

---

## Setup checklist (run before every section)

- [ ] Dev server running; price updating in TradingPanel header and browser tab
- [ ] TradingPanel Sell/Buy parity vs TVP at same moment: `abs(CD Sell - TV SELL) <= 1.00` and `abs(CD Buy - TV BUY) <= 1.00`
- [ ] Order & Account Management panel open; balance = $10,000.00
- [ ] Account reset
- [ ] Journal empty

---

## Section 1 — Market Orders

> **Automation status (02.05.2026):** T1 & T2 fully automated — ~340 tests green (38 T2 RTL + ~20 T1 Vitest + 21 SLTP sanity + remaining). T3 Playwright pending. **New (02.05.2026):** SL typo safety rail tests added (1.7.11).

### 1.1 Basic Buy (USD mode)

| #     | Action                                                            | Expected                                                                                                                                                | Status | TV ✓ | Tier        | Notes                                                                               |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ----------------------------------------------------------------------------------- |
| 1.1.1 | Select **Buy**, tab = **Market**, qty mode = **USD**, enter `100` | Order info shows Margin ≈ lot-rounded fill, Trade value ≈ Margin, Commission ≈ $0.068                                                                   | ✅     |      | T2 · RTL    | Margin $98.31, Commission $0.0688                                                   |
| 1.1.2 | Click **Buy** button                                              | Button pulses; qty input clears                                                                                                                         | ✅     |      | T2 · RTL    |                                                                                     |
| 1.1.3 | Go to **Positions** tab                                           | 1 LONG row appears: Entry ≈ live price, Qty > 0, TP = —, SL = —                                                                                         | ✅     | ✅   | T1 · Vitest | Entry $75,625.20, Qty 0.001300, TP=—, SL=—. TV: $75,625.20, 1 s apart — within $1 ✓ |
| 1.1.4 | Check balance                                                     | Balance = $10,000 − actualFillAmount − commission (lot-rounded, not exactly $100)                                                                       | ✅     | ✅   | T1 · Vitest | $10,000 − $98.31 − $0.0688 = $9,901.62 ✓. TV Available $9,901.65 — diff $0.03 ✓     |
| 1.1.5 | Go to **Journal** tab                                             | Auto entry: `Opened LONG BTCUSDT @ $X.XX`                                                                                                               | ✅     |      | T1 · Vitest | ✅ Entry correct. Auto-logs all events (TV journal is manual-only).                 |
| 1.1.6 | Go to **Order History** tab → **Filled** sub-tab                  | 1 row: Type = MARKET, Side = BUY, Fill Price ≈ entry, Status = Filled. Also visible in **Orders → Filled** while in bench TTL. Top badge = active-only. | ✅     |      | T1 · Vitest | Orders badge excludes historical rows. Bench TTL: 2 min (see 4.21).                 |
| 1.1.7 | Check **Orders** tab → **All** sub-tab                            | Same row visible (within TTL); count badge = 1                                                                                                          | ✅     |      | T2 · RTL    | Badge drops to 0 after 2 min (only active rows).                                    |
| 1.1.8 | Check **Orders** tab → **Working** sub-tab                        | Empty — market orders instantly filled, never Working                                                                                                   | ✅     |      | T1 · Vitest | Working only counts pending; market orders are historical.                          |

> **TV cross-check 1.1.3:** Entry price in cryptopapertrade.com vs TVP should differ by ≤ $1 (one SELL/BUY spread).
> **TV cross-check 1.1.4:** Available balance after commission deduction should match within $0.10.

### 1.2 Basic Sell (USD mode)

| #     | Action                                                                  | Expected                                                            | Status | TV ✓ | Tier        | Notes |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ---- | ----------- | ----- |
| 1.2.1 | Reset account. Select **Sell**, tab = **Market**, USD mode, enter `200` | Order info updates for Sell side                                    | ✅     |      | T2 · RTL    |       |
| 1.2.2 | Click **Sell** button                                                   | Position opens                                                      | ✅     |      | T1 · Vitest |       |
| 1.2.3 | Positions tab                                                           | 1 SHORT row. PnL updates live (green if price dropped, red if rose) | ✅     | ⬜   | T1 · Vitest |       |

> **TV cross-check 1.2.3:** Unrealised PnL sign and approximate magnitude should match TVP's SHORT position PnL.

### 1.3 Units mode

| #     | Action                                 | Expected                                                  | Status | Tier        | Notes                    |
| ----- | -------------------------------------- | --------------------------------------------------------- | ------ | ----------- | ------------------------ |
| 1.3.1 | Click `⇄ Units` button                 | Label changes to `Quantity (BTC)`, placeholder `0.000000` | ✅     | T2 · RTL    |                          |
| 1.3.2 | Enter `0.001` units                    | Equivalent below shows ≈ live_price × 0.001 USD           | ✅     | T2 · RTL    |                          |
| 1.3.3 | Click `⇄ USD`                          | Input converts to USD value; equivalent shows 0.001 BTC   | ✅     | T2 · RTL    |                          |
| 1.3.4 | Place order in Units mode with `0.001` | Position qty ≈ 0.001                                      | ✅     | T1 · Vitest | Trailing zeros stripped. |

### 1.4 Buy with Take-Profit only

| #     | Action                                                                               | Expected                                                                            | Status | TV ✓ | Tier        | Notes                                                                                             |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------- |
| 1.4.1 | Reset. Buy $500, enable TP toggle, enter a price **above** live price (e.g. live+5%) | TP input has green border                                                           | ✅     |      | T2 · RTL    |                                                                                                   |
| 1.4.2 | Submit                                                                               | Position appears with TP = your price, SL = —                                       | ✅     |      | T1 · Vitest |                                                                                                   |
| 1.4.3 | _(wait or set TP very close)_ When live price crosses TP                             | Position closes; appears in History with profit; Orders → Filled shows entry + exit | ✅     | ✅   | T1 · Vitest | ✅ TP triggered correctly. Known: exit Type = `MARKET` not `Take Profit` (cosmetic).              |
| 1.4.4 | Journal tab                                                                          | Entry + Auto-close entries with green PnL badge `+$X.XX`                            | ✅     | ✅   | T1 · Vitest | Clean 2-line audit trail. PnL sign matches. TV shows verbose system log (intentional divergence). |

> **TV cross-check 1.4.3:** TP should trigger at the same price level in both apps (same candle).
> **TV cross-check 1.4.4:** Net PnL in Journal badge should match TVP's realised PnL within $0.10.
> **Known cosmetic gap (non-blocking):** Exit order Type in Order History shows `MARKET` in cryptopapertrade.com vs `Take Profit` in TVP. Fix labelling in a future pass.

### 1.5 Sell with Stop-Loss only

| #     | Action                                                                                          | Expected                                                                            | Status | TV ✓ | Tier        | Notes                                                                    |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------ |
| 1.5.1 | Reset. Sell $500, enable SL toggle, enter a price **above** live price (SHORT SL = above entry) | SL input red border                                                                 | ✅     |      | T2 · RTL    | SL input correctly red. SHORT position ~$75,545.9.                       |
| 1.5.2 | Submit                                                                                          | SHORT position with SL = price; **Orders → Working shows 1 synthetic SL BUY order** | ✅     |      | T1 · Vitest | Synthetic exit order renders correctly. Matches TV parity.               |
| 1.5.3 | When price rises to SL                                                                          | Auto-closed; Journal red PnL badge `−$X.XX`; Working order disappears               | ✅     | ✅   | T1 · Vitest | Position closed. SL order evicts from Working. Journal shows loss badge. |

> **TV cross-check 1.5.3:** Loss magnitude should match TVP's realised PnL within $0.10.
> **TV parity note (1.5.2):** TV shows TP/SL as separate child "Working" orders in the Orders tab (Type = "Take Profit" or "Stop Loss"). cryptopapertrade.com now does the same — synthetic exit orders are derived from open positions and shown in Working sub-tab with correct Type label, Side (opposite of position), and price in Limit/Stop Price column. They disappear automatically when the position closes.

### 1.6 Buy with both TP and SL

| #     | Action                                      | Expected                                                                               | Status | TV ✓ | Tier        | Notes                                                                                   |
| ----- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------ | ---- | ----------- | --------------------------------------------------------------------------------------- |
| 1.6.1 | Reset. Buy $300, TP = live+3%, SL = live−2% | Both inputs active                                                                     | ✅     |      | T2 · RTL    | Both TP and SL active with correct borders.                                             |
| 1.6.2 | Submit                                      | Position shows both TP and SL                                                          | ✅     |      | T1 · Vitest | LONG opened @ $75,429.10. Order History shows 1 BUY Filled.                             |
| 1.6.3 | Manual close via **✕** in Positions tab     | Position removed; History row appears; PnL correct; Journal shows close with PnL badge | ✅     | ✅   | T1 · Vitest | Manual ✕ close executed. TP auto-cancelled. Journal: `Closed LONG ... @ $X` with badge. |

> **TV cross-check 1.6.3:** Manually close the mirrored TVP position at the same moment; PnL values should match within $0.10.

### 1.7 Edge cases

| #      | Scenario                                              | Expected                                                                      | Status | Tier            | Notes                                                                                                                                                                   |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.7.1  | Submit with **empty** qty                             | Submit button disabled                                                        | ✅     | T2 · RTL        | No inline error text; button disabled.                                                                                                                                  |
| 1.7.2  | Submit with qty **> balance** (e.g. $99,999)          | Error: "Insufficient balance"                                                 | ✅     | T1+T2           | T1: `placeOrder` returns `null`. T2: error message renders in component.                                                                                                |
| 1.7.3  | TP below entry for a Buy (e.g. live−1%)               | Error: "Take-Profit must be above entry price for Long"                       | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.4  | SL above entry for a Buy (e.g. live+1%)               | Error: "Stop-Loss must be below entry price for Long"                         | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.5  | TP above entry for a Sell                             | Error: "Take-Profit must be below entry price for Short"                      | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.6  | SL below entry for a Sell                             | Error: "Stop-Loss must be above entry price for Short"                        | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.7  | Enter qty `0` or negative                             | Submit button disabled (opacity 30%)                                          | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.8  | Disconnect from internet, submit market order         | Error: "Waiting for live price…"                                              | ✅     | T3 · Playwright | Requires `page.context().setOffline(true)`. Fixed: added `navigator.onLine` check alongside `isConnected` in both `validate()` and the submit button's `disabled` prop. |
| 1.7.9  | Place multiple positions, close them in reverse order | Each closes at correct mark price; History accumulates                        | ✅     | T1 · Vitest     | Fixed: `placeOrder` nets against existing opposite-side positions before opening new ones.                                                                              |
| 1.7.10 | Reset account mid-open position                       | Positions cleared, balance = $10,000                                          | ✅     | T1 · Vitest     |                                                                                                                                                                         |
| 1.7.11 | Enter SL = 7800 for a BTC order (live ≈ $78,000)      | Blocking confirm modal: typo warning; order not placed until explicit confirm | ✅     | T2 · RTL        | SL deviating >80% from live price flagged.                                                                                                                              |
| 1.7.12 | Enter SL > 10% below entry (e.g. 11% for BTC)         | Blocking confirm modal; large-distance warning; user must confirm             | ✅     | T2 · RTL        | SL_MAX_DISTANCE = 0.1 threshold.                                                                                                                                        |

---

## Section 2 — Limit Orders _(run after Section 1 passes)_

> **Automation status (01.05.2026):** T1 & T2 fully automated — ~45 tests green. T3 Playwright pending.

### 2.1 Limit Buy below market

| #     | Action                                                          | Expected                                                                                          | Status | TV ✓ | Tier        | Notes                                          |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ---------------------------------------------- |
| 2.1.1 | Tab = **Limit**. Price input appears pre-filled with live price | Price field pre-filled slightly below the current live quote for a Buy; no immediate-fill warning | ✅     |      | T2 · RTL    | After fix: no warning on tab switch.           |
| 2.1.2 | Set price to live − 2%, qty $200, click **Buy**                 | Pending order; balance decreases by $200 + commission                                             | ✅     | ✅   | T1 · Vitest | LIMIT BUY 0.025 @ $78,800, reserved $197.00.   |
| 2.1.3 | Go to **Orders** tab → **Working** sub-tab                      | 1 row: LIMIT / BUY / Limit Price = price; Status = Working                                        | ✅     |      | T2 · RTL    | Type, Side, Qty, Status all correct.           |
| 2.1.4 | Check **All** sub-tab count badge                               | Badge shows **1**; row visible                                                                    | ✅     |      | T2 · RTL    | Sub-tab badges: All 1 / Working 1.             |
| 2.1.5 | When price drops to trigger                                     | Order moves to **Filled**; Journal entry added                                                    | ✅     | ✅   | T1 · Vitest | Filled @ $77,673.8. TV: ~$77,677.4. Within $5. |
| 2.1.6 | Check **All** sub-tab after fill                                | Badge count unchanged (1); row status = Filled                                                    | ✅     |      | T2 · RTL    | All still shows 1; status pill: amber → green. |

> **TV cross-check 2.1.5:** Both apps should fill on the same candle; entry prices should be within $5.

### 2.2 Limit Buy cancel

| #     | Action                                        | Expected                                                                                                  | Status | Tier        | Notes                                                 |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------- |
| 2.2.1 | Place limit buy far below market (live − 10%) | Order in **Working**; badge shows 1; **Journal shows `"Placed LIMIT Long …`**                             | ✅     | T1+T2       | T1: pendingOrders + journal. T2: badge + Working row. |
| 2.2.2 | Click **✕** cancel in Working sub-tab         | Order moves to **Cancelled**; balance fully refunded; badge disappears; **Journal shows cancel + refund** | ✅     | T1 · Vitest | Refund, order array, journal entry all verified.      |

### 2.3 Limit Sell above market

| #     | Action                                    | Expected              | Status | TV ✓ | Tier        | Notes                                          |
| ----- | ----------------------------------------- | --------------------- | ------ | ---- | ----------- | ---------------------------------------------- |
| 2.3.1 | Tab = Limit, price = live + 2%, Sell $200 | Pending SHORT created | ✅     | ✅   | T1 · Vitest | LIMIT / SELL, Qty 0.0025, Limit Price $77,750. |
| 2.3.2 | When price rises to trigger               | SHORT position opens  | ✅     | ✅   | T1 · Vitest | Filled @ ~$77,754.5.                           |

### 2.4 Limit with TP + SL — Pre-fill

| #     | Action                                                                                      | Expected                                                                                                                              | Status | TV ✓ | Tier        | Notes                                                                              |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ---------------------------------------------------------------------------------- |
| 2.4.1 | Limit buy $300 at live−1%, TP = live+3%, SL = live−4%                                       | 3-row bracket: parent LIMIT BUY (Working) + TP (Inactive) + SL (Inactive). Journal: `"Placed LIMIT …"`                                | ✅     |      | T1 · Vitest | Working = 1 / Inactive = 2. Journal on placement (intentional divergence from TV). |
| 2.4.2 | Cancel the **SL** inactive child leg (✕ on SL row) while limit is still pending             | SL row gone. **Order History → Cancelled** gains 1 row (Stop Loss). **Journal**: cancel entry. Balance unchanged.                     | ✅     | ✅   | T1 · Vitest | `cancelPendingExitLeg`. When limit fills, position opens with TP only.             |
| 2.4.3 | Cancel the **TP** inactive child leg (✕ on TP row) while limit is still pending             | TP row gone. **Order History → Cancelled** gains 1 row (Take Profit). **Journal**: cancel entry. Balance unchanged.                   | ✅     |      | T1 · Vitest | `cancelPendingExitLeg`. When limit fills, position opens with SL only.             |
| 2.4.4 | Cancel the **parent** limit order (✕ on Working parent row) while both TP + SL are inactive | All 3 rows move to Cancelled. **Order History → Cancelled** gains 3 rows. **Journal**: cancel + refund entry. Balance fully refunded. | ✅     | ✅   | T1 · Vitest | `cancelPendingOrder`. Builds child cancel records. Only parent margin refunded.    |

> **Pre-fill note:** Balance reserved at parent placement only. Child leg cancel has no balance effect. Parent cancel refunds full reserved amount.

### 2.4 Limit with TP + SL — Post-fill

| #      | Action                                                            | Expected                                                                                                                                    | Status | TV ✓ | Tier        | Notes                                                                                                              |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 2.4.5  | Wait for limit to trigger (price reaches limit price)             | Parent → Filled. TP + SL children: Inactive → Working. Position in Positions with TP/SL shown. 3 Journal entries (fill + TP/SL activation). | ✅     | ⬜   | T1 · Vitest | All entries emitted in correct order. Fill price = latestPrice.                                                    |
| 2.4.6  | Cancel the **Working TP** exit leg (✕ on TP row) after fill       | TP gone from Working. **Order History → Cancelled** gains 1 row (Take Profit). **Journal**: cancel entry. Position stays with SL only.      | ✅     |      | T1 · Vitest | TP moved to Cancelled. SL remains Working.                                                                         |
| 2.4.7  | Cancel the **Working SL** exit leg (✕ on SL row) after fill       | SL gone from Working. **Order History → Cancelled** gains 1 row (Stop Loss). **Journal**: cancel entry. Position stays with TP only.        | ✅     |      | T1 · Vitest | SL moved to Cancelled. TP remains Working.                                                                         |
| 2.4.8  | After limit fills, check Orders tab immediately                   | Filled parent row in **Orders → Filled** and **Order History → Filled**; active TP/SL in Working                                            | ✅     | ✅   | T1 · Vitest | Parent visible in Orders → Filled. Top badge counts active only.                                                   |
| 2.4.9  | **TP triggers** and closes the LONG (both TP + SL were active)    | Position closed. Order History → Cancelled gains SL row (no commission). Journal: auto-close with PnL badge.                                | ✅     | ✅   | T1 · Vitest | Order History shows BUY + TP (Filled) + SL (Cancelled). Placing Time = pos.openedAt (cosmetic divergence from TV). |
| 2.4.10 | **SL triggers** and closes the LONG (both TP + SL were active)    | Position closed. Order History → Cancelled gains TP row (no commission). Journal: auto-close with PnL badge.                                | ✅     |      | T1 · Vitest | SL triggered. TP sibling-cancelled. Journal red PnL badge.                                                         |
| 2.4.11 | **Manually close** (✕ position row) while both TP + SL are active | Position closed. Order History → Cancelled gains 2 TP + SL rows (no commission).                                                            | ✅     | ✅   | T1 · Vitest | Both exits cancelled. Manual close lifecycle verified.                                                             |

> **Bracket lifecycle note:** Entry, TP, and SL are three linked orders. Pre-fill: parent cancel kills the whole bracket. Post-fill: manage the trade from Positions; manage exits from the Working order rows.
> **Auto-archive note (2.4.8):** Filled parent orders are visible in **Orders → Filled** for up to 2 minutes after fill (`closingTime + BENCH_TTL_MS > now`), and permanently in **Order History → Filled**. After 2 min the row auto-evicts from the Orders bench — no manual action required. The top Orders badge reflects only active rows (pending + active exits), so parent fills never inflate the headline count.
> **Sibling-cancel note (2.4.9–2.4.11):** `closePosition` builds `siblingCancelOrders` — `placingTime = pos.openedAt`, `closingTime = close timestamp`. Known minor divergence vs TV: TV records Placing Time as original bracket placement (before limit fill); cryptopapertrade.com uses position `openedAt` (limit-fill time). Difference = limit order pending duration; cosmetic only.

### 2.5 Edge cases

| #     | Scenario                                  | Expected                                             | Status | Tier        | Notes                                                                                                                                                                      |
| ----- | ----------------------------------------- | ---------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5.1 | Limit Buy with TP **below** trigger price | Validation error before placement                    | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: TP below trigger is blocked pre-submit with `Take-Profit must be above entry price for Long`.                                    |
| 2.5.2 | Limit Buy with SL **above** trigger price | Validation error before placement                    | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: SL above trigger is blocked pre-submit with `Stop-Loss must be below entry price for Long`.                                      |
| 2.5.3 | Place limit, then switch symbol           | Order stays in Orders tab (scoped to its own symbol) | ✅     | T1 · Vitest | ✅ 01.05.2026 — user verified and screenshot-backed: symbol switch + additional order on another symbol worked; existing order/positions remained correctly symbol-scoped. |
| 2.5.4 | Place limit order that exceeds balance    | Error: `Insufficient balance`                        | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: oversized ETH limit order (`$20,000`) shows `Insufficient balance` and red margin-over-balance state before submission.          |

---

## Section 3 — Stop Orders _(run after Section 2 passes)_

> **Manual verification status (01.05.2026):** 3.1.1–3.5.3 manually verified against TVP Paper Trading (Bybit BTCUSDT Spot · 1m) — all ✅.
>
> **Automation status (01.05.2026):** T1 + T2 tests written and passing (211/211 total suite). New tests live in:
>
> - `paperStore.test.ts` — `Section 3 — Stop Orders` describe block (15 T1 tests): placement, fill flow with slippage, cancel, bracket TP/SL, multiple concurrent orders, insufficient-balance guard.
> - `TradingPanel.test.tsx` — `Section 3 — Stop Orders (T2 · RTL)` describe block (5 T2 tests): direction warning banners (3.5.1 / 3.5.2), no-warning negatives, insufficient balance on stop tab.

### 3.1 Stop Buy above market (breakout)

| #     | Action                                      | Expected                                                                                                | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                    |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1.1 | Tab = **Stop**, price = live + 1%, Buy $200 | Pending order in Orders tab: STOP / BUY; amber tab badge shows 1                                        | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — STOP BUY BTCUSDT 0.0025 @ $77,350 (CD) / $77,400 (TV); Working sub-tab badge = 1, CD reserved $193.38, TV orders margin $193.48 ✅                                                                 |
| 3.1.2 | Check **Working** sub-tab                   | 1 row visible with STOP type pill                                                                       | ✅     | ✅   | T2 · RTL    | Verified 01.05.2026 — Working sub-tab shows 1 row with STOP type pill in both CD and TV ✅                                                                                                                               |
| 3.1.3 | When price rises to trigger                 | Order moves to **Filled** sub-tab; amber badge disappears; position opens; journal: `Stop order filled` | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — LONG 0.0025 opened @ avg fill $77,358.6; Order History shows Filled (type = Market, correct — stop converts to market on trigger), commission $0.1354; unrealized PnL −$0.02; Journal 2 entries ✅ |

### 3.2 Stop Sell below market (breakdown)

| #     | Action                                   | Expected                                        | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------- | ----------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.2.1 | Tab = Stop, price = live − 1%, Sell $200 | Pending order: STOP / SELL; amber badge shows 1 | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — STOP SELL BTCUSDT 0.0025 @ $77,250; Working sub-tab badge = 1, balance $9,806.74, reserved $193.13. TV: same order Working, orders margin $193.10 ✅                                                                       |
| 3.2.2 | When price drops to trigger              | SHORT position opens; order in Filled sub-tab   | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — SHORT 0.0025 opened @ avg fill $77,348 (CD) vs $77,385.5 (TV); ~$37 gap is within stop-market slippage tolerance (different trigger moments). Unrealized PnL +$0.01 in CD, +$0.03 in TV. Order History = 1, Journal = 2 ✅ |

### 3.3 Stop cancel

| #     | Action                           | Expected            | Status | Tier        | Notes                                                                                                                                                                                                                   |
| ----- | -------------------------------- | ------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3.1 | Place stop order far from market | Order in Orders tab | ✅     | T1 · Vitest | Verified 01.05.2026 — STOP SELL BTCUSDT 0.0025 @ $77,300 (far above market); Working sub-tab shows 1 row, amber badge = 1, balance drops to $9,806.61 (reserved $193.25)                                                |
| 3.3.2 | Cancel it                        | Balance refunded    | ✅     | T1 · Vitest | Verified 01.05.2026 — order moves to Cancelled sub-tab; badge clears; journal: `Cancelled STOP Short BTCUSDT @ $77300.00 (refunded: $193.39)`; balance restored to $10,000.00. TV order history also shows Cancelled ✅ |

### 3.4 Stop with TP + SL

| #     | Action                                          | Expected                                                                                                                                                                                              | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.4.1 | Stop Buy at live+1%, TP = live+4%, SL = live−1% | Orders creates a 3-row bracket: parent STOP BUY + TP child + SL child (linked)                                                                                                                        | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 (screenshots): pre-trigger state matches TV — Orders badge = 3, parent STOP BUY is Working, TP+SL child legs are Inactive (Working 1 / Inactive 2). Cancelling parent before trigger cancels all 3 rows.                                                                                              |
| 3.4.2 | When triggered, position shows correct TP/SL    | Parent moves to **Orders → Filled** (and remains in **Order History → Filled**); TP/SL children become active exits; **Orders top badge = 2** active child orders; position closes from Positions tab | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 (screenshots): post-trigger matches TV — Positions shows LONG with TP $78,000 / SL $76,000; Orders top badge shows **2** (only active TP/SL). Parent STOP appears as historical Filled while TP+SL remain Working. CD avg fill $77,385.4 vs TV $77,399.7 (~$14.3 drift from trigger timing/slippage). |

### 3.5 Edge cases

| #     | Scenario                                      | Expected                                                                                           | Status | Tier        | Notes                                                                                                                                                                  |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.5.1 | Stop Buy price **below** market               | Validation error before placement (TV parity): Stop Buy must be above the current BUY/market level | ✅     | T1 · Vitest | ✅ 01.05.2026 — matched TV behavior in manual check: below-market Stop Buy is rejected; use Limit Buy for below-market entry.                                          |
| 3.5.2 | Multiple pending orders (mix of limit + stop) | All show in Orders tab; each cancels/fills independently                                           | ✅     | T1 · Vitest | ✅ 01.05.2026 — screenshot-backed pass: multiple simultaneous pending stop orders rendered correctly with independent working rows and counts in both CD and TV views. |
| 3.5.3 | Reset account with pending orders             | All pending orders cleared; balance restored to $10,000                                            | ✅     | T1 · Vitest | ✅ 01.05.2026 — user verified pass after reset flow; pending orders cleared and account returned to default state.                                                     |

---

## Section 4 — Cross-cutting / Regression

| #    | Scenario                                                                        | Expected                                                                                                                                                                                                                                                                                                                                                                                            | Status | Tier            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Switch pane symbol while TradingPanel open                                      | Header updates to new symbol; form resets (qty/price cleared); **tab stays on current selection** (Market/Limit/Stop preserved)                                                                                                                                                                                                                                                                     | ✅     | T2 · RTL        | Verified 01.05.2026 — symbol switch triggers `key` remount; form inputs cleared; tab preserved via `initialTab` + `onTabChange` lifted state in DashboardPage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4.2  | Switch symbol while on **Limit** tab                                            | Tab remains Limit; price input updates to new symbol's live price                                                                                                                                                                                                                                                                                                                                   | ✅     | T2 · RTL        | Verified 01.05.2026 — Limit tab preserved across remount; Buy defaults slightly below market and Sell defaults slightly above market on the new symbol, matching the live on-screen quotes as designed (`displayPrice` logic).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4.3  | Switch symbol while on **Stop** tab                                             | Tab remains Stop; price input updates to new symbol's live price                                                                                                                                                                                                                                                                                                                                    | ✅     | T2 · RTL        | Verified 01.05.2026 — same as 4.2: Stop tab preserved; Stop Buy defaults above market and Stop Sell defaults below market on the new symbol — correct pending-side default as designed.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4.4  | Close TradingPanel (✕), reopen via **Trade** button in SymbolBar                | Panel reopens on **last-used tab + side** (e.g. Limit+Sell stays Limit+Sell); **all form inputs (qty, price, TP/SL) preserved exactly as left**                                                                                                                                                                                                                                                     | ✅     | T2 · RTL        | Updated 01.05.2026 (form state) — `TradingPanel` is now always mounted; `DashboardPage` animates its wrapper width to 0 instead of unmounting; component never loses local React state on close. Tab + side lifted state unchanged. Symbol change (key reset) still clears form inputs as before. The SymbolBar toggle button reads **"Trade"** (no "CD" prefix).                                                                                                                                                                                                                                                                                  |
| 4.5  | Collapse Order & Account Management panel (↓), then expand (↑)                  | All tabs still functional; panel has **no ✕ close button** — header controls: Sound · ⚙️ · Collapse/Expand · Maximize/Restore                                                                                                                                                                                                                                                                       | ✅     | T2 · RTL        | ✅ 01.05.2026 — collapse (↓) and expand (↑) work correctly; all tabs (Positions, Orders, History, Journal, Order History) remain fully functional after resize; no ✕ close button present in header as designed.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4.6  | Place order, refresh browser                                                    | Position/pending order persists (localStorage)                                                                                                                                                                                                                                                                                                                                                      | ✅     | T1 · Vitest     | ✅ 01.05.2026 — positions and pending orders survive a hard browser refresh; Zustand `persist` middleware correctly hydrates state from `cd-paper` localStorage key. Balance, positions, orders, journal, and order history all restored as-left.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4.7  | History tab after mix of wins and losses                                        | PnL signs correct; green/red colors correct                                                                                                                                                                                                                                                                                                                                                         | ✅     | T1 · Vitest     | ✅ 01.05.2026 — History tab shows correct PnL signs and green/red color coding after a session with multiple profitable and losing closes. PnL formula `(exit − entry) × qty − commissions` verified correct.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4.8  | Journal tab shows all system entries in order                                   | Timestamps descending (newest first); system entries cover full lifecycle: placement (`Placed LIMIT/STOP …`), fill (`Limit/Stop order filled …`), cancel (`Cancelled LIMIT/STOP …`), position open/close; auto-entries not editable, manual notes editable                                                                                                                                          | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Journal entries display **newest first** (descending timestamp order confirmed); full lifecycle covered: placement, fill, cancel, open/close entries all present and correctly ordered; auto-generated entries are read-only; manually added notes are editable.                                                                                                                                                                                                                                                                                                                                                                   |
| 4.9  | Journal PnL badge — profitable close                                            | Manual ✕ close: exec journal entry shows green `+$X.XX` pill inline after text; no badge on open/pending entries                                                                                                                                                                                                                                                                                    | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `attaches net PnL badge to the exec journal entry on a profitable close` passes (211/211). Manually verified in UI: Journal shows green `+$X.XX` pill on close entry; open/pending entries have no badge.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4.10 | Journal PnL badge — losing close                                                | Auto-closed TP/SL entry shows red `−$X.XX` pill; badge value matches Balance History net PnL for that trade                                                                                                                                                                                                                                                                                         | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `attaches negative net PnL badge to the exec journal entry on a losing close` passes (211/211). Note: a direction-profitable close still shows a red badge when net P&L is negative after commissions (fees > gross gain) — this is correct behaviour, not a bug.                                                                                                                                                                                                                                                                                                                                                |
| 4.11 | Journal PnL badge — user note                                                   | Manually added journal note has no PnL badge regardless of balance state                                                                                                                                                                                                                                                                                                                            | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `addJournalNote pnl is undefined when not provided` passes (211/211). Manually verified: manually added notes render with no PnL pill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4.12 | Maximize Order & Account Management panel (⤢)                                   | Chart area collapses (height → 0); panel fills full center column; Minimize2 icon shown; TradingPanel still visible                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: maximize (⤢) collapses chart area, panel fills full center column, Minimize2 icon appears, TradingPanel remains visible alongside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4.13 | Restore Order & Account Management panel (⤡)                                    | Chart area expands back; panel returns to previous height; Maximize2 icon shown                                                                                                                                                                                                                                                                                                                     | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: restore (⤡) expands chart area back to previous height, Maximize2 icon reappears in panel header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4.14 | Sound — order placed                                                            | Crisp double-tick plays when a market/limit/stop order is submitted                                                                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: double-tick sound plays correctly on market, limit, and stop order submission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4.15 | Sound — TP/SL auto-close                                                        | Ascending jingle (profit) or descending beep (loss) plays when position auto-closes                                                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: correct profit/loss sound plays on TP/SL-triggered auto-close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4.16 | Sound — mute toggle                                                             | Clicking mute in SoundSettings silences all subsequent sounds; unmuting restores them                                                                                                                                                                                                                                                                                                               | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: mute toggle in SoundSettings popover (portal-rendered, visible above panel) silences all sounds; unmuting restores them. Popover fixed to render via React portal so it is no longer clipped by the panel's overflow:hidden container.                                                                                                                                                                                                                                                                                                                                                                          |
| 4.17 | Edit **pending** bracket order via pencil                                       | Journal gets a **summary** entry with parent deltas (price / qty / reserved / TP / SL) plus separate child-leg entries (`Take-Profit/Stop-Loss modification confirmed`, `... added`, or `... cancelled`) for each changed exit leg                                                                                                                                                                  | ✅     | T1 · Vitest     | ✅ 01.05.2026 — screenshots confirm the real UI flow for the pending-order **summary** journal row (`Modified LIMIT Long BTCUSDT — price $78400.00 → $78440.00, reserved $1999.20 → $2000.22`) before fill. Vitest also confirms the pending child-leg journal paths in `paperStore.test.ts`: `writes detailed parent and child journal entries when editing a pending order` and `writes cancel history and a descriptive journal entry when removing a pending TP child`.                                                                                                                                                                        |
| 4.18 | Edit **open position** TP/SL via pencil                                         | Journal gets a **summary** entry (`Modified LONG/SHORT ... exits — ...`) plus separate child-leg entries for each changed exit leg; toggling TP/SL off writes a `... cancelled ...` journal entry and also creates a Cancelled row in Order History                                                                                                                                                 | ✅     | T1 · Vitest     | ✅ 01.05.2026 — screenshots confirm the real UI flow for editing an **open position**: Journal shows the summary row `Modified LONG BTCUSDT exits — TP $78800.00 → $78900.00, SL $78100.00 → $7800.00` plus separate `Take-Profit modification confirmed` and `Stop-Loss modification confirmed` entries; Orders shows the updated Working TP/SL child rows; Positions shows the new TP/SL values on the live position. Vitest also confirms both store paths in `paperStore.test.ts`: `writes detailed confirmation entries when editing position TP/SL` and `writes cancel history and a descriptive journal entry when removing a position TP`. |
| 4.19 | Multi-pane: pane 0 = ETHUSDT, pane 1 = BTCUSDT. BTC price drops to SL on pane 1 | BTC position closes; ETH position is **not** affected                                                                                                                                                                                                                                                                                                                                               | ✅     | T1 · Vitest     | Regression for 4.18 incident (symbol-switch bug). `useTPSLMonitor` now subscribes to all 4 pane stores independently; each evaluated against its own pane's symbol. Automated in `useTPSLMonitor.test.ts` — multi-pane isolation describe block.                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4.20 | Multi-pane: pane 0 = ETHUSDT price tick at ~7500 with BTC SL typo=7800          | ETH tick does **not** close BTC position (wrong-symbol isolation)                                                                                                                                                                                                                                                                                                                                   | ✅     | T1 · Vitest     | Direct 4.18 incident replay. ETH price satisfies the typo SL level numerically, but pane 0 only evaluates ETHUSDT positions — BTC position is immune. Automated in `useTPSLMonitor.test.ts` — wrong-symbol SL typo regression describe block.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4.21 | TV-style Orders bench TTL — terminal rows auto-evict after 2 minutes            | Filled / Cancelled / Rejected rows appear in **Orders** tab immediately after the event (rendered at 65% opacity + amber Clock icon). After 2 minutes from `closingTime` they disappear from Orders while remaining permanently in Order History. **All / Filled / Cancelled sub-tab counts drop live as rows expire.** Top Orders badge (working + inactive only) is never inflated by bench rows. | ✅     | T2 · RTL        | ✅ 02.05.2026 — TV-style bench lifecycle implemented in `OrderAccountManagementPanel.tsx`. Module-level `SESSION_START = Date.now()` evaluated once per page load; `BENCH_TTL_MS = 120_000` (2 min, hardcoded). Predicate: `closingTime >= SESSION_START && closingTime + BENCH_TTL_MS > now`. `now` clock state ticks every 30 s via `setInterval`. Automated in `OrderAccountManagementPanel.test.tsx` — 28 tests, 340/340 green.                                                                                                                                                                                                                |
| 4.22 | Orders bench — page refresh clears terminal rows immediately                    | After a hard browser refresh, previously Filled / Cancelled / Rejected rows that were on the Orders bench are **gone immediately** — the 2-min window does not carry over. Only Working / Inactive pending rows (persisted in localStorage) survive the refresh.                                                                                                                                    | ✅     | T1+T2           | ✅ 02.05.2026 — `SESSION_START` is a module-level `const` evaluated fresh on every page load. Any `closingTime < SESSION_START` fails the bench predicate instantly — free page-refresh reset with zero store changes. Validated by test fixtures: using hardcoded May-2024 `closingTime` caused 3 tests to fail (orders evicted immediately), confirming the mechanism; fixed by switching to `FIXTURE_NOW = Date.now()`.                                                                                                                                                                                                                         |

---

## Section 5 — Symbol Pair Icons (visual regression)

> **Manual verification status (02.05.2026):** 5.1–5.7 manually verified — all ✅.
> **Automated (02.05.2026):** 5.1–5.5, 5.7 automated as T2 · RTL in `Section5SymbolPairIcons.test.tsx` (16 tests, all green). Tier upgraded from T3 · Playwright.

| #   | Scenario                                                              | Expected                                                                                                                                                                                | Status | Tier     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Open symbol picker dropdown in SymbolBar                              | Each row shows stacked base/quote coin pair — base icon (20 px) + USDT badge (13 px) bottom-right                                                                                       | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated in `Section5SymbolPairIcons.test.tsx`: 3 tests verify all SYMBOLS bases appear in dropdown, quote="USDT" on every row, at least 1 pair before dropdown opens. 340/340 green.                                                                                                                                                                                                                    |
| 5.2 | Active symbol trigger button (e.g. `BTC /USDT`)                       | Trigger shows stacked pair (18 px base) alongside symbol name, not a single icon                                                                                                        | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 2 tests verify base="BTC" for BTCUSDT pane and base="ETH" when pane symbol switches to ETHUSDT. 340/340 green.                                                                                                                                                                                                                                                                                 |
| 5.3 | Positions tab with an open position                                   | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — correct base="BTC", quote="USDT", and graceful empty state (no crash). 340/340 green.                                                                                                                                                                                                                                                                                                |
| 5.4 | Orders tab with a pending order                                       | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 2 tests — correct base="BTC" and quote="USDT" for a BTCUSDT pending order. 340/340 green.                                                                                                                                                                                                                                                                                                      |
| 5.5 | History tab (Order History) with a closed trade                       | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — base="BTC" for a filled order, quote="USDT", and also renders for cancelled orders. 340/340 green.                                                                                                                                                                                                                                                                                   |
| 5.6 | Unknown symbol (no icon in map) used as base or quote in `SymbolPair` | `CryptoIcon` falls back to a 2-letter text badge (first 2 chars, uppercased) — no crash. **Note:** USDT has a real icon in `CRYPTO_ICON_URLS` and renders as `<img>`, not a text badge. | ✅     | T2 · RTL | ✅ 02.05.2026 — covered by `CryptoIcon.test.tsx > unknown symbol` (3 existing tests: renders span not img, shows first 2 uppercase letters, applies size) + `SymbolPair — unknown symbol fallback (5.6)` describe block (7 new tests): both-unknown renders 'FO'+'NE' text badges, case-insensitive uppercase, known base + unknown quote (1 img + 1 badge), 1-letter symbol, USDT renders as `<img>` (has real icon). Tests: 340/340 green. |
| 5.7 | Multi-symbol: open positions in BTC and ETH simultaneously            | Each row shows the correct base icon (BTC vs ETH), not the active-pane symbol                                                                                                           | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — both bases present with BTC+ETH positions, correct base for each row even when active pane is ETH, exactly 2 SymbolPair instances for 2 positions. 340/340 green.                                                                                                                                                                                                                    |

---

## Section 6 — Cross-Platform Price Parity _(dual-platform setup required)_

> Run this section to validate the price feed fix end-to-end. Both apps open side by side.
> Tolerance for all price comparisons: **<= $1.00** (one SELL/BUY spread for BTC).
> Lot-size note: cryptopapertrade.com now floors qty to the same step TV uses (BTC: 0.0001, ETH: 0.001, etc.) so Trade value and qty shown on the button should match TV within the spread tolerance.
> **TVP quote mapping:** `TV SELL` = best **bid**; `TV BUY` = best **ask**.
> **Parity rule (same timestamp snapshot):** `abs(CD Sell - TV SELL) <= 1.00` and `abs(CD Buy - TV BUY) <= 1.00`.

| #   | Scenario                                                            | Expected                                                                                                     | Status | Tier            | Notes                                                                                                                                   |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Compare TradingPanel Sell/Buy vs TVP SELL/BUY at rest               | **Both** checks pass at the same moment: `abs(CD Sell - TV SELL) <= 1.00` and `abs(CD Buy - TV BUY) <= 1.00` | ⬜     | T3 · Playwright | In TVP UI, `SELL` = bid and `BUY` = ask. All Section 6 tests require a live WebSocket feed and real-time clock — cannot be unit-tested. |
| 6.2 | Watch both prices for 30 s during normal market activity            | cryptopapertrade.com tracks TVP tick-for-tick; no sustained lag > $1                                         | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.3 | Watch both prices during a fast move (news spike or breakout)       | cryptopapertrade.com catches up within 1–2 s; no freeze or stuck price                                       | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.4 | Place identical $200 market Buy in both apps within the same second | Entry prices differ by ≤ $1; qty in cryptopapertrade.com ≈ qty in TVP                                        | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.5 | Let position run for 2 min, compare Unrealised PnL                  | PnL sign matches (both green or both red); magnitude within $0.50                                            | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.6 | Close both positions manually at the same moment                    | Realised PnL matches within $0.50; commission deducted in both                                               | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.7 | Place identical Limit Buy at live − 1% in both apps                 | Both fill on the same candle; entry prices within $1                                                         | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.8 | Place identical Stop Buy at live + 0.5% in both apps                | Both trigger on the same candle; entry prices within $1                                                      | ⬜     | T3 · Playwright |                                                                                                                                         |
| 6.9 | Browser tab title during test                                       | Tab shows `▲ BTC/USDT {price} +x.xx%` or `▼ …` updating live; arrow flips on reversal                        | ⬜     | T3 · Playwright |                                                                                                                                         |

---

## Section 7 — Order History Tab _(run after Sections 2 & 3 pass)_

> Covers the **Order History** tab (5th tab in the **Order & Account Management** panel). Shows all `HistoricalOrder[]` records — market + limit + stop, all statuses. **Market orders appear here** (not in the Orders tab).

### 7.1 Market order appears in Order History

| #     | Action                                        | Expected                                                                                                                                                                                                                                                                              | Status | Tier        | Notes                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1.1 | Reset account. Place a market Buy $100        | Go to **Order History** tab — 1 row: Type = MARKET / Side = BUY / Status = Filled (green)                                                                                                                                                                                             | ⬜     | T1 · Vitest |                                                                                                                                                                                                                                                                             |
| 7.1.2 | Check **All** and **Filled** sub-tabs         | Row visible in both; count badge on tab shows 1                                                                                                                                                                                                                                       | ⬜     | T2 · RTL    |                                                                                                                                                                                                                                                                             |
| 7.1.3 | Check **Cancelled** and **Rejected** sub-tabs | Empty (no rows)                                                                                                                                                                                                                                                                       | ⬜     | T2 · RTL    |                                                                                                                                                                                                                                                                             |
| 7.1.4 | Check **Orders** tab (all sub-tabs)           | Market order **appears in Orders → Filled** sub-tab while within the 2-min bench TTL; after 2 min the row evicts from Orders and only remains in Order History. Orders top-level badge = 0 (no active rows). Orders → All shows 1 row (while in TTL); → Working / Inactive are empty. | ⬜     | T2 · RTL    | Updated 02.05.2026: bench TTL governs visibility of terminal rows in Orders tab (see 4.21). Verify `All 1` / `Filled 1` counts in Orders immediately post-fill and `Orders` badge = 0 (active-only). After 2 min: `All 0` / `Filled 0` in Orders; Order History unaffected. |

### 7.2 Limit order fill appears in Order History

| #     | Action                                              | Expected                                                                                                                                                                                     | Status | Tier        | Notes                                                                                                                                                                         |
| ----- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.2.1 | Place limit buy at live − 2%; wait for fill         | Order History → Filled sub-tab: 1 row LIMIT / BUY / Fill Price ≈ trigger price                                                                                                               | ⬜     | T1 · Vitest |                                                                                                                                                                               |
| 7.2.2 | Verify columns: Limit Price, Fill Price, Commission | Limit Price = your trigger; **Fill Price = trigger** (a resting limit fills at its own price, BP-2 F4); Commission = qty × price × 0.0002 with "0.02% maker" under it                        | ⬜     | T1 · Vitest |                                                                                                                                                                               |
| 7.2.3 | Orders tab — Filled sub-tab                         | Filled limit row is **also** visible in **Orders → Filled** sub-tab (TV-style), not only in Order History. Orders top-level badge remains at 0 after the limit entry fill (no active order). | ⬜     | T2 · RTL    | Updated 01.05.2026: Orders tab now has a Filled sub-tab (restored). Verify the filled limit row appears in both Orders → Filled and Order History → Filled; Orders badge = 0. |

### 7.3 Cancelled order appears in Order History

| #     | Action                                                      | Expected                                                             | Status | Tier        | Notes |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------- | ------ | ----------- | ----- |
| 7.3.1 | Place limit buy far below market; cancel via Orders tab (✕) | Order History → Cancelled sub-tab: 1 row, Status = Cancelled (muted) | ⬜     | T1 · Vitest |       |
| 7.3.2 | Check All sub-tab count                                     | Count includes this cancelled record                                 | ⬜     | T2 · RTL    |       |

### 7.4 Rejected orders (if any) appear in Order History, not History tab

| #     | Action                                                | Expected                                                                            | Status | Tier        | Notes |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ----------- | ----- |
| 7.4.1 | Simulate rejection (e.g. submit order with 0 balance) | If order reaches rejected state: Order History → Rejected sub-tab shows red ⚠ badge | ⬜     | T1 · Vitest |       |
| 7.4.2 | Check History tab (closed trades)                     | Rejected orders do **not** appear in the History / Trade History tab                | ⬜     | T2 · RTL    |       |

### 7.5 Placing Time and Closing Time columns

| #     | Action                                           | Expected                                                                    | Status | Tier     | Notes                                                                               |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| 7.5.1 | Open column picker (⊟ icon) in Order History tab | Placing Time and Closing Time are on by default; other columns toggleable   | ⬜     | T2 · RTL |                                                                                     |
| 7.5.2 | Disable Closing Time; re-enable it               | Column disappears then reappears; preference persists after browser refresh | ⬜     | T2 · RTL | jsdom localStorage can simulate the persist/hydrate cycle — no real refresh needed. |

### 7.6 Mix of all order types

| #     | Action                                                                  | Expected                                                                            | Status | Tier        | Notes |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ----------- | ----- |
| 7.6.1 | Place market buy, limit buy (fill), stop sell (cancel) in sequence      | Order History All sub-tab shows 3 rows: MARKET/Filled, LIMIT/Filled, STOP/Cancelled | ⬜     | T1 · Vitest |       |
| 7.6.2 | Each status badge uses correct color: Filled = green, Cancelled = muted | Visual check                                                                        | ⬜     | T2 · RTL    |       |

---

## Section 8 — Account Settings Modal

> Open via the **⚙️ gear** button in the **Order & Account Management** panel header.

| #    | Action                                                               | Expected                                                                                                    | Status | Tier     | Notes                                                                   |
| ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| 8.1  | Click ⚙️ gear button                                                 | Modal opens; "Account Settings" title visible                                                               | ⬜     | T2 · RTL |                                                                         |
| 8.2  | Account name field                                                   | Shows logged-in username; field is **read-only** (cannot type)                                              | ⬜     | T2 · RTL |                                                                         |
| 8.3  | Leverage                                                             | **No leverage field** (BP-2): leverage is per symbol, set with the `1x ▾` chip in the trading panel (§14.5) | ⬜     | T2 · RTL | Removed with the per-symbol leverage.                                   |
| 8.4  | Fees field                                                           | Displays `Spot 0.1%` and `Perpetual 0.055% taker · 0.02% maker` — read-only                                 | ⬜     | T2 · RTL |                                                                         |
| 8.5  | Footer button                                                        | Reads **Done** and just closes the modal (nothing left to save)                                             | ⬜     | T2 · RTL | Was "Save" (it committed the account leverage).                         |
| 8.6  | Click "Reset account" once                                           | Button changes to a confirm state (e.g. "Confirm reset?"); 3 s auto-cancel timer starts                     | ⬜     | T2 · RTL |                                                                         |
| 8.7  | Wait 3 s without confirming                                          | Button reverts to default "Reset account" text; no reset occurred                                           | ⬜     | T2 · RTL | Use `vi.useFakeTimers()` to advance the clock 3 s without real waiting. |
| 8.8  | Click "Reset account" → immediately click confirm within 3 s         | Modal closes; balance resets to $10,000; positions/orders/journal cleared                                   | ⬜     | T1+T2    | T1: `reset()` clears store state. T2: modal close + UI reflects reset.  |
| 8.9  | Click ✕ (close) button on modal                                      | Modal dismisses; no reset; no changes                                                                       | ⬜     | T2 · RTL |                                                                         |
| 8.10 | Click backdrop (outside modal)                                       | Modal dismisses; confirm state cleared if it was pending                                                    | ⬜     | T2 · RTL |                                                                         |
| 8.11 | Open modal while in mid-confirm state; dismiss via backdrop; re-open | Confirm state is cleared on re-open — button shows default "Reset account"                                  | ⬜     | T2 · RTL |                                                                         |

---

## Section 9 — Sell/Buy Prices & Spread in TradingPanel

| #   | Action                                                                          | Expected                                                                                                     | Status | Tier            | Notes                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | Open TradingPanel with a live symbol (e.g. BTCUSDT)                             | Spread badge between Sell/Buy buttons shows a numeric value (e.g. `0.10`)                                    | ⬜     | T3 · Playwright | Requires live two-sided quote feed from WebSocket. Spot bid/ask come from `orderbook.1` since BP-0 (F2) — before, spot `tickers` had no bid/ask and this badge always showed `—`. |
| 9.2 | Hover spread badge                                                              | Tooltip shows raw bid and ask values (e.g. `Bid: 75,000.00 · Ask: 75,000.10`)                                | ⬜     | T3 · Playwright |                                                                                                                                                                                   |
| 9.3 | Sell button price                                                               | Matches the live **SELL** quote shown for the symbol, not a mid-price                                        | ⬜     | T3 · Playwright | Technical mapping: `SELL` corresponds to the best bid.                                                                                                                            |
| 9.4 | Buy button price                                                                | Matches the live **BUY** quote shown for the symbol, not a mid-price                                         | ⬜     | T3 · Playwright | Technical mapping: `BUY` corresponds to the best ask.                                                                                                                             |
| 9.5 | Spread value decimal places                                                     | If spread < 1: 4 decimal places (e.g. `0.1000`); if ≥ 1: 2 decimal places (e.g. `1.25`)                      | ⬜     | T2 · RTL        | Spread formatting logic is pure JS — render `TradingPanel` with mocked SELL/BUY quote props and assert the badge text.                                                            |
| 9.6 | Disconnect WebSocket (network tab block) — wait for SELL/BUY quotes to go stale | Sell/Buy prices fall back to `latestPrice`; spread badge shows `—`                                           | ⬜     | T3 · Playwright | `page.context().setOffline(true)` + await WS stale timeout.                                                                                                                       |
| 9.7 | Switch active pane symbol (e.g. BTC → ETH in multi-pane mode)                   | Sell/Buy prices update to ETH SELL/BUY quotes immediately; spread re-renders for ETH                         | ⬜     | T3 · Playwright |                                                                                                                                                                                   |
| 9.8 | Compare Sell/Buy vs TVP SELL/BUY at rest                                        | **Both** checks pass at the same moment: `abs(CD Sell - TV SELL) <= 1.00` and `abs(CD Buy - TV BUY) <= 1.00` | ⬜     | T3 · Playwright | In TVP UI, `SELL` = bid and `BUY` = ask.                                                                                                                                          |

---

## Section 10.1 — Multi-Chart Layout: Layout switching

> Run with single-chart `1` layout first, then test each split layout. No TV cross-check column needed.

| #      | Action                                                        | Expected                                                                | Status | Tier        | Notes                                                                                            |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------ |
| 10.1.1 | Open `ChartLayoutPicker` (grid icon in SymbolBar, right side) | Popover shows 5 SVG layout icons: `1 · 2h · 2v · 3h · 4`                | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.2 | Select **2h** (2 columns)                                     | Chart area splits into 2 side-by-side panes; PaneHeader visible on each | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.3 | Select **2v** (2 rows)                                        | 2 stacked panes                                                         | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.4 | Select **3h** (3 columns)                                     | 3 side-by-side panes                                                    | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.5 | Select **4** (2×2 grid)                                       | 4 panes in grid                                                         | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.6 | Switch back to **1** (single)                                 | Single pane; PaneHeader hidden                                          | ⬜     | T2 · RTL    |                                                                                                  |
| 10.1.7 | Refresh browser with 2h layout active                         | Layout persists (loaded from `cd-layout` localStorage)                  | ⬜     | T1 · Vitest | Test `layoutStore` hydration from mocked localStorage in jsdom — no real browser refresh needed. |

---

## Section 10.2 — Multi-Chart Layout: Active pane selection

| #      | Action                                           | Expected                                                                                        | Status | Tier        | Notes                                                                               |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------- |
| 10.2.1 | In 2h layout: click right pane                   | Right pane gets animated purple border + inner glow; TradingPanel reacts to right pane's symbol | ⬜     | T2 · RTL    |                                                                                     |
| 10.2.2 | Click left pane                                  | Purple border moves to left pane (animated)                                                     | ⬜     | T2 · RTL    |                                                                                     |
| 10.2.3 | Switch to 4-pane layout; click pane 3            | Pane 3 becomes active; animated left stripe in PaneHeader moves to pane 3                       | ⬜     | T2 · RTL    |                                                                                     |
| 10.2.4 | Switch to a smaller layout while active pane = 3 | `activePane` clamps to `paneCount − 1`; no crash                                                | ⬜     | T1 · Vitest | `layoutStore.setLayout()` clamping logic is pure store logic — no rendering needed. |

---

## Section 10.3 — Multi-Chart Layout: Per-pane symbol + interval

| #      | Action                                                             | Expected                                                              | Status | Tier     | Notes |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ | -------- | ----- |
| 10.3.1 | In 2h layout: open PaneHeader symbol picker for pane 0; select ETH | Pane 0 switches to ETH; pane 1 stays on BTC; each shows correct price | ⬜     | T2 · RTL |       |
| 10.3.2 | Use interval buttons in PaneHeader for pane 1: click 5m            | Pane 1 fetches 5m bars; pane 0 stays on its interval                  | ⬜     | T2 · RTL |       |
| 10.3.3 | Use SymbolBar to change active pane symbol                         | Only the active pane updates                                          | ⬜     | T2 · RTL |       |

---

## Section 10.4 — Multi-Chart Layout: Sync options

| #      | Action                                                          | Expected                                                                                                        | Status | Tier            | Notes                                                                                               |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ | --------------- | --------------------------------------------------------------------------------------------------- |
| 10.4.1 | Enable **Sync Symbol** toggle (in ChartLayoutPicker)            | All panes immediately snap to the active pane's symbol                                                          | ⬜     | T1 · Vitest     | Snap-on-enable logic lives in `layoutStore.toggleSync('symbol')` — pure store, no rendering needed. |
| 10.4.2 | Disable **Sync Symbol**; change pane 0 symbol                   | Other panes remain on their current symbols                                                                     | ⬜     | T1 · Vitest     |                                                                                                     |
| 10.4.3 | Enable **Sync Interval** toggle                                 | All panes immediately snap to the active pane's interval                                                        | ⬜     | T1 · Vitest     |                                                                                                     |
| 10.4.4 | Enable **Sync Crosshair**; hover over pane 0 chart              | Crosshair line appears on all other panes at the same time position; Y position maps to each pane's price scale | ⬜     | T3 · Playwright | Requires real chart canvas + mouse hover events — cannot be tested in jsdom.                        |
| 10.4.5 | Move cursor off chart (pane 0 loses cursor)                     | Crosshair clears from all follower panes                                                                        | ⬜     | T3 · Playwright |                                                                                                     |
| 10.4.6 | Enable **Sync Time Range**; pan or zoom pane 0                  | All other panes adjust visible range to match                                                                   | ⬜     | T3 · Playwright |                                                                                                     |
| 10.4.7 | Enable Sync Time Range while panes are at different zoom levels | All panes snap to active pane's visible range immediately on toggle-on                                          | ⬜     | T3 · Playwright |                                                                                                     |
| 10.4.8 | Sync options persist after browser refresh                      | Toggle states restored from `cd-layout` localStorage                                                            | ⬜     | T1 · Vitest     | `layoutStore` persist/hydrate via jsdom localStorage.                                               |

---

## Section 10.5 — Multi-Chart Layout: PaneHeader visual elements

| #      | Action                                 | Expected                                                                                  | Status | Tier            | Notes                                                                       |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------- | ------ | --------------- | --------------------------------------------------------------------------- |
| 10.5.1 | Multi-pane mode: each PaneHeader shows | Symbol name, interval buttons (1m/5m/15m/1h/4h/1d), live price, ±% change badge, 5 px dot | ⬜     | T3 · Playwright | Live price + change badge require WS feed. Structure-only assertable at T2. |
| 10.5.2 | Connection dot state                   | Green pulse when connected; grey/off when disconnected                                    | ⬜     | T3 · Playwright | WS connected/disconnected state requires real network.                      |
| 10.5.3 | Single-pane mode (`1` layout)          | PaneHeader is **hidden** (not rendered)                                                   | ⬜     | T2 · RTL        | Asserting PaneHeader absent from DOM when `layout === '1'`.                 |

---

## Section 11 — Multi-Symbol PnL (`lastKnownPrices`)

> Verifies that positions in non-active symbols retain correct mark price and PnL display.
> **BP-3:** USDT Perpetual PnL now uses the **mark** price (`lastKnownMarkPrices` via `setLastKnownMarkPrice`, fed by
> linear pane tickers and the server's `prices` push), falling back to the last price until a mark arrives (15.1).
> Since BP-0, `lastKnownPrices` is keyed `category:symbol` (`spot:BTCUSDT`, `linear:BTCUSDT`) via
> `setLastKnownPrice` / `getLastKnownPrice` in `paneStore.ts`. Positions have no category until BP-2,
> so readers default to spot — seed `spot:` keys in these tests.

| #    | Action                                                                     | Expected                                                                                            | Status | Tier        | Notes                                                                                        |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------- |
| 11.1 | In 2h layout: set pane 0 = BTCUSDT, pane 1 = ETHUSDT. Set pane 0 as active | TradingPanel shows BTCUSDT                                                                          | ⬜     | T1 · Vitest |                                                                                              |
| 11.2 | Place a market Buy $100 on BTCUSDT (active pane)                           | BTCUSDT position appears in Positions tab                                                           | ⬜     | T1 · Vitest |                                                                                              |
| 11.3 | Switch active pane to pane 1 (ETHUSDT). Place a market Buy $100 on ETHUSDT | ETHUSDT position appears; Positions tab now shows 2 rows                                            | ⬜     | T1 · Vitest |                                                                                              |
| 11.4 | Switch active pane back to pane 0 (BTCUSDT)                                | Both positions still visible; ETHUSDT row shows a valid mark price (not $0 or stale)                | ⬜     | T1 · Vitest | Seed `lastKnownPrices` map in paneStore and assert PnL helper uses it for non-active symbol. |
| 11.5 | Watch ETHUSDT PnL while BTCUSDT is the active pane                         | ETHUSDT PnL updates live (from `lastKnownPrices`, not the active pane price)                        | ⬜     | T1 · Vitest |                                                                                              |
| 11.6 | Switch to single-pane layout (`1`) showing only BTCUSDT                    | ETHUSDT position mark price still updates (pane WS closes but `lastKnownPrices` retains last value) | ⬜     | T1 · Vitest |                                                                                              |
| 11.7 | Account Summary Bar — Unrealized P&L                                       | Reflects the **combined** PnL of BTC + ETH positions, not just the active pane's position           | ⬜     | T1 · Vitest |                                                                                              |
| 11.8 | Close ETHUSDT position manually while BTCUSDT is active                    | ETHUSDT position closes; History tab shows the correct exit price and PnL                           | ⬜     | T1 · Vitest |                                                                                              |

---

## Section 12 — Market data per category (Bybit Parity BP-0)

> Each pane reads history, live candles and quotes from its own Bybit market: `spot` (Spot) or
> `linear` (USDT Perpetual). There is no market switch UI until BP-2 — every pane is `spot`, so the
> visible app must behave exactly as before, **except** that spot bid/ask now arrive (F2).
> Linear checks go against the API/WS directly (curl / `wscat`) or by setting a pane's category in the
> store (`useLayoutStore.getState().setPaneCategory(0, 'linear')` in the devtools console).
> Reference values: `docs/APP_LOG.md` Bybit Parity reference values.

### 12.1 Spot feed (default)

| #      | Action                                                                   | Expected                                                                                                    | Status | Tier            | Notes                                                                                                                                              |
| ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.1.1 | Open dashboard, BTCUSDT 1m                                               | Spread badge shows a number, not `—`; Sell = best bid, Buy = best ask (differ by one tick most of the time) | ⬜     | T3 · Playwright | Feed verified 2026-09-26 on the WS (badge not yet checked in a browser): spot tickers carry `bid`/`ask` from `orderbook.1` (e.g. 83969.9 / 83970). |
| 12.1.2 | Compare last 1m candle close with Bybit **Spot** BTCUSDT chart           | Closes match exactly; no step where history meets live bars                                                 | ⬜     | T3 · Playwright | History is spot-only now — no linear fallback (F1).                                                                                                |
| 12.1.3 | Reload in a quiet market (no price change for a few seconds)             | Bid/ask appear immediately after connect, not only after the next price change                              | ⬜     | T3 · Playwright | Server sends its cached quote on connect; cache is cleared when the Bybit stream disconnects.                                                      |
| 12.1.4 | Returning user: load the app with a `cd-layout` v3 entry in localStorage | Layout, symbols, intervals, chart types unchanged; every pane has `category: 'spot'`                        | ✅     | T1 · Vitest     | `layoutStore.test.ts` "v3 → v4 migration". The D7 move of existing layouts to linear ships with BP-2.                                              |
| 12.1.5 | Tamper `cd-layout` → set a pane's `category` to `"inverse"`, reload      | App loads; that pane falls back to `spot`                                                                   | ✅     | T1 · Vitest     | `merge` validation — category ends up in a server request.                                                                                         |

### 12.2 USDT Perpetual feed (API / store level)

| #      | Action                                                               | Expected                                                                                                                                                | Status | Tier            | Notes                                                                                            |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------ |
| 12.2.1 | `GET /api/market/candles?category=linear&symbol=BTCUSDT&interval=1m` | 200, `category: "linear"`; closes match Bybit's **Perpetual** BTCUSDT chart (a few $ to tens of $ off spot)                                             | ✅     | T1 · Vitest     | Verified live 2026-09-26: linear 83929.4 vs spot 83970 on the same minute.                       |
| 12.2.2 | `GET /api/market/candles?category=inverse`                           | 400 `{ error }`, no upstream call                                                                                                                       | ✅     | T1 · Vitest     |                                                                                                  |
| 12.2.3 | WS `/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m`       | Snapshot bars tagged `linear`; `ticker` messages carry `bid`, `ask`, `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime`, `fundingIntervalHour` | ✅     | T3 · Playwright | Verified live with a WS probe 2026-09-26.                                                        |
| 12.2.4 | WS with `category=inverse`                                           | Socket closed with code 1008                                                                                                                            | ✅     | T1 · Vitest     |                                                                                                  |
| 12.2.5 | Set pane 0 to linear in devtools (`setPaneCategory(0, 'linear')`)    | Chart reloads with perp candles; spread badge shows perp bid/ask; paneStore `markPrice`/`fundingRate` populated                                         | ⬜     | T3 · Playwright | Store-only until BP-2 adds the switch. With symbol sync on, every pane switches market together. |
| 12.2.6 | Positions tab while pane 0 is linear                                 | ⚠️ Known BP-0 gap: open positions still price from spot `lastKnownPrices`, but the live pane price is perp                                              | ⬜     | —               | Positions get a category in BP-2; not reachable without devtools in BP-0.                        |

### 12.3 Instrument rules & risk limits

| #      | Action                                                   | Expected                                                                                                                   | Status | Tier        | Notes                                                                                    |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------- |
| 12.3.1 | `GET /api/market/instruments?category=spot`              | 9 instruments; BTCUSDT `tickSize 0.1`, `qtyStep 0.000001`, `minOrderQty 0.000001`, `minNotional 5`, `maxLeverage null`     | ✅     | T1 · Vitest | Values checked live 2026-09-26. Cached 6 h server-side.                                  |
| 12.3.2 | `GET /api/market/instruments?category=linear`            | BTCUSDT `tickSize 0.1`, `qtyStep 0.001`, `minOrderQty 0.001`, `minNotional 5`, `maxLeverage 150`, `fundingIntervalMin 480` | ✅     | T1 · Vitest | Not yet used by the order form (lot/tick rounding moves to these in BP-2, F9).           |
| 12.3.3 | `GET /api/market/risk-limit?symbol=BTCUSDT`              | Tiers lowest first; tier 1 `maintenanceMarginRate 0.0033`, `mmDeduction 0`                                                 | ✅     | T1 · Vitest | Live tier-1 MMR is 0.33%, not the 0.5% the parity plan §2 quoted — re-check before BP-3. |
| 12.3.4 | `GET /api/market/risk-limit?symbol=PEPEUSDT` / no symbol | 400, no upstream call                                                                                                      | ✅     | T1 · Vitest |                                                                                          |
| 12.3.5 | Bybit returns an error / rate limit                      | 502 `{ error: 'Failed to fetch market data' }` — no upstream text; a stale cached value is served if one exists            | ✅     | T1 · Vitest | Stale-on-error path is covered by code review, not a dedicated test.                     |

---

## Section 13 — Server trading engine (Bybit Parity BP-1)

> Trades are executed and watched on the server (`apps/server/src/trading`). The browser sends intent only and mirrors
> the account over the private WebSocket `/api/paper/ws`. Reference: `docs/APP_LOG.md` Bybit Parity BP-1.

### 13.1 Intent only (F11)

| #      | Action                                                                                           | Expected                                                                                | Status | Tier        | Notes                                                                  |
| ------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------- |
| 13.1.1 | Market Buy $100                                                                                  | Request body has symbol / side / type / usdtAmount only; fill price = server live price | ✅     | T2 · RTL    | `TradingPanel.test` "sends intent only"; `services.test` server price. |
| 13.1.2 | `curl -X POST /api/paper/orders` with an extra `price` / `balance` field                         | The fields are stripped and never reach the engine; the order fills at the server price | ✅     | T1 · Vitest | `paper.test` "a client-supplied price never reaches the engine".       |
| 13.1.3 | Old endpoints: `PATCH /api/paper/account`, `POST /api/paper/trades`, `POST /api/paper/positions` | 404                                                                                     | ✅     | T1 · Vitest | Removed in BP-1.                                                       |
| 13.1.4 | Market order while the server has no live price (feed down)                                      | 409 "Waiting for live price…", shown in the order form; form keeps its values           | ✅     | T1 + T2     | `paper.test` + `TradingPanel.test` "server rejection".                 |

### 13.2 24/7 execution (F10)

| #      | Action                                                                             | Expected                                                                                            | Status | Tier            | Notes                                                              |
| ------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | --------------- | ------------------------------------------------------------------ |
| 13.2.1 | Place a limit a few $ past the price, **close the tab**, wait for the fill, reopen | Position open; journal has "Limit order filled — …"; Order History has the filled limit row         | ⬜     | T3 · Playwright | Needs live feed + a running server.                                |
| 13.2.2 | Open a position with a TP near the price, close the tab, wait, reopen              | Position closed; "Auto-closed … Take-Profit hit at $X" in the journal; balance updated              | ⬜     | T3 · Playwright |                                                                    |
| 13.2.3 | TP/SL on a symbol **no pane is showing**                                           | Still triggers (the browser only watched symbols open in a pane)                                    | ✅     | T1 · Vitest     | `triggers.test` symbol isolation / `services.test` MatchingEngine. |
| 13.2.4 | Restart the server with open orders; price crosses during the downtime             | On restart a "Backfilling price gap" log line; the crossed order fills at its trigger, exactly once | ⬜     | T3              | Engine unit: `services.test` "backfills downtime".                 |

### 13.3 Sync, sessions, safety fixes

| #      | Action                                                                  | Expected                                                                              | Status | Tier            | Notes                                                                        |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------------- |
| 13.3.1 | Two tabs open; place / cancel / close in one                            | The other tab updates within ~1 s; each sound plays once per tab                      | ⬜     | T3 · Playwright | WS fan-out unit-tested in `paper.test`.                                      |
| 13.3.2 | Log out, log in as another user on the same browser                     | Nothing of the first account is shown; `cd-paper-trading` is gone from localStorage   | ✅     | T1 · Vitest     | `usePaperFeed.test` sign-out + `paperStore.test` clear(). Logout leak fixed. |
| 13.3.3 | Keep the dashboard open for 20+ minutes, then trade                     | Orders still work (access token refreshed ~60 s before expiry; WS re-authenticates)   | ⬜     | T3              | `usePaperFeed.test` re-auth / 4401 refresh.                                  |
| 13.3.4 | S1 — a triggered order that can't fill                                  | Recorded as rejected ("Order could not be filled."), never silently dropped           | ✅     | T1 · Vitest     | `actions.test` "S1".                                                         |
| 13.3.5 | S2 — place a limit at 1×, change leverage to 10×, let it fill           | Position size uses 1× (the order's own leverage)                                      | ✅     | T1 · Vitest     | `actions.test` "S2".                                                         |
| 13.3.6 | S3 — a limit placed mid-candle after the candle already dipped below it | Does not fill until a tick after placement crosses it                                 | ✅     | T1 · Vitest     | `triggers.test` "S3".                                                        |
| 13.3.7 | Filled limit / stop in Order History                                    | Row keeps its own type (LIMIT / STOP) — changed from the browser's temporary "MARKET" | ✅     | T1 · Vitest     | `actions.test` 3.1.3.                                                        |

---

## Section 14 — Markets, Bybit fees and fill prices (Bybit Parity BP-2)

> Two markets: **Spot** (coin balances, 1×, no shorting) and **USDT Perpetual** (positions, per-symbol leverage).
> Reference: `docs/APP_LOG.md` Bybit Parity BP-2. ✅ in the Tier column means automated; the Notes say where. "Live ✓"
> rows were run against the dev server + the live Bybit feed on 2026-09-26 (22 checks, throwaway users deleted).

### 14.1 Market URLs and the Trade menu

| #       | Action                                                       | Expected                                                                                                        | Status | Tier     | Notes                                         |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------ | -------- | --------------------------------------------- |
| 14.1.1  | Open `/dashboard`                                            | Redirects to the active pane's market URL, e.g. `/dashboard/spot/BTC/USDT`                                      | ✅     | T2 · RTL | `useMarketUrlSync.test` DashboardRedirect.    |
| 14.1.2  | Open `/dashboard/usdt/ETHUSDT` directly                      | Active pane shows ETHUSDT USDT Perpetual (the URL wins over the saved layout)                                   | ✅     | T2 · RTL | `useMarketUrlSync.test`.                      |
| 14.1.3  | Open `/dashboard/spot/btc/usdt`, `/dashboard/spot/PEPE/USDT` | First is replaced by `/dashboard/spot/BTC/USDT`; the unknown pair goes to the active pane's market              | ✅     | T1 + T2  | `marketRoutes.test`, `useMarketUrlSync.test`. |
| 14.1.4  | Header **Trade ▾** → USDT Perpetual                          | Pane switches market, symbol kept; URL becomes `/dashboard/usdt/<symbol>`; ✓ + purple bar on the current market | ✅     | T2 · RTL | `TradeMenu.test`.                             |
| 14.1.5  | Keyboard: focus Trade, ArrowDown, ArrowDown, Escape          | Opens on the current market, moves, wraps, closes back to the trigger                                           | ✅     | T2 · RTL | `TradeMenu.test`.                             |
| 14.1.6  | Switch market / symbol, then browser **Back**                | Back returns to the previous market; switching pane focus does not add history entries                          | ✅     | T2 · RTL | `useMarketUrlSync.test` (PUSH / REPLACE).     |
| 14.1.7  | Switch symbol or market                                      | The page does not reload: charts, feeds and the form stay mounted                                               | ✅     | T1       | `marketRoutes.test` routeKey.                 |
| 14.1.8  | Logged out, open `/dashboard/usdt/ETHUSDT` → sign in         | Lands on `/dashboard/usdt/ETHUSDT`; a foreign `from` (`//evil.example`, `/admin/…`) lands on `/dashboard`       | ✅     | T2 · RTL | `LoginPage.returnTo.test` 🔐.                 |
| 14.1.9  | In-panel **Spot \| USDT Perpetual** tabs                     | Same effect as the header menu; the SymbolBar and pane headers show "Spot" / "Perpetual" under / after the pair | ✅     | T2 · RTL | `TradingPanel.test` "market tabs".            |
| 14.1.10 | Public `/chart`                                              | Trade menu works but the URL stays `/chart`                                                                     | ⬜     | Manual   |                                               |

### 14.2 USDT Perpetual fees (VIP-0 taker 0.055% / maker 0.02%)

| #      | Action                                                          | Expected                                                                                                         | Status | Tier        | Notes                                           |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------- |
| 14.2.1 | Market buy 0.1 BTC at 10× with the ask at 50,000                | IM 500, open fee 2.75, fee to close 2.475 (BP-3: at the bankruptcy price) → balance −505.225; row "0.055% taker" | ✅     | T1 · Vitest | `fees.test`. Live ✓ (fee = 0.055% of notional). |
| 14.2.2 | Close it at bid 51,000                                          | Close fee 2.805; +599.67 back; realized +94.445                                                                  | ✅     | T1 · Vitest | `fees.test`.                                    |
| 14.2.3 | Resting limit buy 0.1 @ 49,000 at 10×                           | Reserves 495.1205 (IM + taker open fee + fee to close); fills at **49,000** with a 0.98 maker fee; net −493.4055 | ✅     | T1 · Vitest | `fees.test`. Live ✓ reserve.                    |
| 14.2.4 | Cancel a resting order                                          | Refunds exactly what it reserved                                                                                 | ✅     | T1 · Vitest | Live ✓.                                         |
| 14.2.5 | Order form estimate                                             | Cost = margin + est. open fee + est. close fee; "Fees: taker 0.055% · maker 0.02%" line                          | ✅     | T2 · RTL    | `TradingPanel.test` 1.1.1, `orderMath.test`.    |
| 14.2.6 | Pre-BP-2 position (entry fee 0.7 at 0.07%) closed at bid 51,000 | Uses its stored 0.7: realized +96.495 — old fees are never recomputed                                            | ✅     | T1 · Vitest | `fees.test` "never recompute".                  |

### 14.3 Fill prices

| #      | Action                                                        | Expected                                                            | Status | Tier        | Notes                              |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ----------- | ---------------------------------- |
| 14.3.1 | Market buy / sell                                             | Buy fills at the ask, sell at the bid                               | ✅     | T1 · Vitest | `services.test`. Live ✓ ask / bid. |
| 14.3.2 | Limit buy above the ask (crosses)                             | Fills now at the ask as a taker; no pending row; history says LIMIT | ✅     | T1 · Vitest | `fees.test`. Live ✓.               |
| 14.3.3 | Stop buy triggers at 50,500 with the ask at 50,510            | Fills at 50,510 (taker)                                             | ✅     | T1 · Vitest | `triggers.test`, `fees.test`.      |
| 14.3.4 | Long TP hit                                                   | Triggers on the last price, closes at the bid                       | ✅     | T1 · Vitest | `triggers.test`.                   |
| 14.3.5 | Quote older than 10 s, or no bid / ask                        | 409 "Waiting for live price…"                                       | ✅     | T1 · Vitest | `services.test`.                   |
| 14.3.6 | Backfilled trigger (server was down)                          | Fills at the level it crossed, not today's price                    | ✅     | T1 · Vitest | `services.test`.                   |
| 14.3.7 | A spot tick never triggers a perpetual order (and vice versa) | Per-market trigger index                                            | ✅     | T1 · Vitest | `triggers.test`, `services.test`.  |

### 14.4 Bybit size rules

| #      | Action                                     | Expected                                            | Status | Tier        | Notes        |
| ------ | ------------------------------------------ | --------------------------------------------------- | ------ | ----------- | ------------ |
| 14.4.1 | Perp qty 0.0001 BTC                        | 422 "Order quantity lower than the minimum (0.001)" | ✅     | T1 · Vitest | Live ✓.      |
| 14.4.2 | Limit price 10000.05 on BTCUSDT (tick 0.1) | 422 "Order price decimal too long (tick size 0.1)"  | ✅     | T1 · Vitest | Live ✓.      |
| 14.4.3 | Spot order worth under 5 USDT              | 422 "Order value exceeded lower limit (5 USDT)"     | ✅     | T1 · Vitest | `spot.test`. |
| 14.4.4 | Qty 0.1239 BTC (step 0.001)                | Rounded down to 0.123                               | ✅     | T1 · Vitest | `fees.test`. |

### 14.5 Per-symbol leverage

| #      | Action                                                 | Expected                                                            | Status | Tier    | Notes                                     |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------- | ------ | ------- | ----------------------------------------- |
| 14.5.1 | `1x ▾` chip → 5× → Confirm on ETHUSDT (no open trades) | ETHUSDT orders use 5×; other symbols keep their own / the default   | ✅     | T1 + T2 | `fees.test`, `TradingPanel.test`. Live ✓. |
| 14.5.2 | With a BTCUSDT position or active order open           | ~~Chip shows a lock; 422~~ — superseded by BP-3 re-margining (15.5) | ✅     | T1 + T2 | See 15.5.                                 |

### 14.6 Spot

| #       | Action                                            | Expected                                                                                             | Status | Tier        | Notes                                   |
| ------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------------------------------- |
| 14.6.1  | Spot market buy 0.1 BTC at ask 50,000             | −5,000 USDT; +0.0999 BTC (0.1% fee in BTC); avg cost 50,050.05; no position                          | ✅     | T1 · Vitest | `spot.test`. Live ✓ (0.002 → 0.001998). |
| 14.6.2  | Sell 0.0999 BTC at bid 51,000                     | Fee 5.0949 USDT; +5,089.8051 USDT; realized +89.8051; closed trade in History                        | ✅     | T1 · Vitest | `spot.test`.                            |
| 14.6.3  | Sell a coin you don't hold / more than free       | Refused (no shorting, F8): "Balance insufficient (… available)"                                      | ✅     | T1 + T2     | Live ✓.                                 |
| 14.6.4  | Spot tabs                                         | Market and Limit only; no leverage chip; a sell has no TP / SL                                       | ✅     | T2 · RTL    | `TradingPanel.test`.                    |
| 14.6.5  | Limit buy 0.1 @ 49,000 / limit sell 0.05 @ 52,000 | Buy reserves 4,900 USDT; sell locks 0.05 BTC, fills +2,597.40                                        | ✅     | T1 · Vitest | `spot.test`.                            |
| 14.6.6  | Buy with TP + SL                                  | Two conditional sells (one OCO pair) lock what the buy received; the first to fire cancels the other | ✅     | T1 · Vitest | `spot.test`. Live ✓ (legs placed).      |
| 14.6.7  | Assets tab → TP/SL on a coin held                 | Locks the chosen quantity behind the pair                                                            | ✅     | T1 + T2     | `spot.test`; modal manual ⬜.           |
| 14.6.8  | Assets tab                                        | USDT row + each coin: balance / available / locked / avg cost / last / value / uPnL with +/−         | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test`.     |
| 14.6.9  | Assets → Sell                                     | Pane switches to that coin on Spot; the form is prefilled with the free quantity as a sell           | ✅     | T2 · RTL    |                                         |
| 14.6.10 | On Spot, the bottom tabs                          | Assets replaces Positions; Orders / Order History show Spot rows only                                | ✅     | T2 · RTL    |                                         |

### 14.7 Migration (D7) and deploy safety

| #      | Action                                                                   | Expected                                                                                                                                                                               | Status | Tier        | Notes                            |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------- |
| 14.7.1 | Migrate a DB with pre-BP-2 rows                                          | Positions / orders / trades become `linear`; position leverage = qty × entry / margin; entry fee 0.07% of margin; PENDING reserved = margin × 1.0007; FILLED rows carry feeRate 0.0007 | ✅     | Manual      | Run on a scratch DB, 2026-09-26. |
| 14.7.2 | Pre-BP-2 user (saved layout) opens `/dashboard` with perpetual positions | Lands once on USDT Perpetual at the newest position's symbol; never again                                                                                                              | ✅     | T2 · RTL    | `useMarketUrlSync.test`.         |
| 14.7.3 | New user                                                                 | Starts on Spot                                                                                                                                                                         | ✅     | T1 · Vitest | `layoutStore.test`.              |
| 14.7.4 | Old client (sends `usdtAmount`, no market)                               | Still trades USDT Perpetual (margin at the symbol's leverage)                                                                                                                          | ✅     | T1 · Vitest | `paper.test`. Live ✓.            |
| 14.7.5 | Private WS                                                               | Pushes live prices (≤ 1/s, changed only) of the markets the account holds                                                                                                              | ✅     | T1 · Vitest | `paper.test`. Live ✓.            |

---

## Section 15 — Mark price, one-way positions, liquidation, re-margining (Bybit Parity BP-3)

> Reference: `docs/APP_LOG.md` Bybit Parity BP-3 and Bybit's UTA isolated-mode formulas in
> `apps/server/src/trading/bybitSpec.ts`. Worked position used below: **long 0.1 BTC @ 50,000 at 10×** — IM 500,
> fee to close 2.475, BTCUSDT tier 1 MMR 0.33% → liquidation ≈ **45,148.99**, bankruptcy **45,000**.

### 15.1 Mark price

| #      | Action                                          | Expected                                                                        | Status | Tier        | Notes                                    |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------- |
| 15.1.1 | Positions tab with a perp position; mark ≠ last | PnL, PnL %, equity and the summary bar use the **mark**; "Mark Price" column    | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test` BP-3. |
| 15.1.2 | Mark price of a symbol no pane shows            | Comes from the server's `prices` push (`mark`)                                  | ✅     | T1 · Vitest | `paperStore.test` applyPrices.           |
| 15.1.3 | TP / SL / stop on a perp position               | Still trigger on the **last** price (Bybit default); only liquidation uses mark | ✅     | T1 · Vitest | `liquidation.test` evaluateTick.         |

### 15.2 One-way mode (one position per symbol)

| #      | Action                                  | Expected                                                                                                                    | Status | Tier        | Notes                                              |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------- |
| 15.2.1 | Buy 0.01 @ 50,000 then 0.005 @ 60,000   | One long 0.015 @ 53,333.33; margins and fees summed; journal "Added to LONG …"                                              | ✅     | T1 · Vitest | `actions.test` merge.                              |
| 15.2.2 | Add with a TP attached                  | The new TP replaces the position's (Bybit Full-mode TP/SL); without one the position keeps its own                          | ✅     | T1 · Vitest | `fillInto`.                                        |
| 15.2.3 | Migrate a DB with 3 same-side BTC longs | Merged into the oldest: qty summed, qty-weighted entry, newest TP / SL, one journal line, SymbolSetting = position leverage | ✅     | Manual      | Dry run on dev Postgres (rolled back), 2026-09-27. |

### 15.3 Liquidation and bankruptcy prices

| #      | Action                                                     | Expected                                                                                                             | Status | Tier        | Notes                                  |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------- |
| 15.3.1 | Bybit's worked example (1 BTC @ 40,000, 50×, +3,000 extra) | Fee to close 21.56, IM 821.56, MM 221.56, liquidation **36,380.25**                                                  | ✅     | T1 · Vitest | `bybitSpec.test` (reproduced exactly). |
| 15.3.2 | Worked long / short at 10×                                 | Long liq ≈ 45,148.99, bust 45,000; short liq ≈ 54,819.10, bust 55,000                                                | ✅     | T1 · Vitest | `liquidation.test`.                    |
| 15.3.3 | A 1× long                                                  | Can't be liquidated: liquidation price shows "—"                                                                     | ✅     | T1 + T2     |                                        |
| 15.3.4 | Tier by position value (BNB 9k vs 60k)                     | MMR 0.67% vs 0.77% — Bybit UTA moves positions between tiers automatically                                           | ✅     | T1 · Vitest | `bybitSpec.test`.                      |
| 15.3.5 | Client estimate vs server                                  | SDK `estimatePositionRisk` matches the server maths                                                                  | ✅     | T1 · Vitest | `bybitSpec.test` parity.               |
| 15.3.6 | Order form, 0.1 BTC at 10× (ask 50,010)                    | "Est. liq. price $45,158.02" in amber with the ⓘ explainer                                                           | ✅     | T2 · RTL    | `TradingPanel.test` BP-3.              |
| 15.3.7 | Positions tab                                              | Liq. Price (amber) and MMR meter columns; IM / MM / Last Price opt-in; saved column layouts get the new columns once | ✅     | T2 · RTL    | `columnPrefs` migration tests.         |

### 15.4 Liquidation in the engine

| #      | Action                                                    | Expected                                                                                                                                             | Status | Tier        | Notes                                |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------ |
| 15.4.1 | Mark reaches the liquidation price                        | Whole position closes at the bankruptcy price; balance unchanged (margin lost); realized −(IM + fee to close) − open fee                             | ✅     | T1 · Vitest | `liquidation.test`.                  |
| 15.4.2 | Records                                                   | Trade `execType BustTrade`; close order `createType CreateByLiq` ("Liquidation" in Order History); TP / SL cancelled; journal + Balance History line | ✅     | T1 + T2     |                                      |
| 15.4.3 | Active orders on the symbol                               | Cancelled and refunded first; other symbols untouched                                                                                                | ✅     | T1 · Vitest | `liquidation.test`.                  |
| 15.4.4 | Position with no TP / SL                                  | Still watched by the engine (indexed) and liquidated on the mark tick                                                                                | ✅     | T1 · Vitest | `services.test` MatchingEngine.      |
| 15.4.5 | Stale mark (> 10 s) or mark moved back                    | Never liquidates                                                                                                                                     | ✅     | T1 · Vitest | `services.test` runTrigger.          |
| 15.4.6 | Server gap                                                | Backfill replays mark-price klines; within one minute a stop-loss wins over liquidation                                                              | ✅     | T1 · Vitest | `liquidation.test`, `services.test`. |
| 15.4.7 | Liquidation sound                                         | Distinct from the loss sound; listed in Sound Settings                                                                                               | ✅     | T2 · RTL    | `usePaperFeed.test`.                 |
| 15.4.8 | Notices                                                   | One-time "Positions can now be liquidated" banner (+ "How liquidation works"); a liquidation notice until dismissed                                  | ✅     | T2 · RTL    | `TradingPanel.test` BP-3.            |
| 15.4.9 | Deploy with a position already past its liquidation price | Liquidated on the first mark tick (no grace period, as on Bybit)                                                                                     | ⬜     | Manual      | Watch on the first deploy.           |

### 15.5 Re-margining (leverage change with a position open)

| #      | Action                                                           | Expected                                                                                           | Status | Tier        | Notes                         |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------- |
| 15.5.1 | 10× → 5× with the worked position                                | IM 500 → 1,000, fee to close → 2.2; 499.725 more margin from the wallet; journal + Balance History | ✅     | T1 · Vitest | `fees.test` re-margining.     |
| 15.5.2 | Lowering without the balance for it                              | 422 "Insufficient available balance to change leverage …"                                          | ✅     | T1 · Vitest |                               |
| 15.5.3 | Raising with no fresh mark / mark past the new liquidation price | 422 "Waiting for live price…" / "Leverage can't be raised: …"                                      | ✅     | T1 · Vitest | `fees.test`, `services.test`. |
| 15.5.4 | Active orders on the symbol                                      | Re-reserved at the new leverage (stop 0.1 @ 60,000: 606.27 → 2,005.5 at 3×)                        | ✅     | T1 · Vitest |                               |
| 15.5.5 | Leverage modal                                                   | Unlocked; previews "Position margin $X → $Y" and "Liq. price A → B"; shows a refusal inline        | ✅     | T2 · RTL    | `TradingPanel.test`.          |

### 15.6 Chart lines

| #      | Action                                      | Expected                                                                                               | Status | Tier        | Notes                                    |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ----------- | ---------------------------------------- |
| 15.6.1 | Perp pane with a position and a limit order | Entry (side, qty, live PnL), TP / SL (dashed), Liq. (amber dashed), order + its TP / SL (dotted), Mark | ✅     | T1 · Vitest | `tradeLines.test`, `useTradeLines.test`. |
| 15.6.2 | Chart type menu → "Mark price line"         | Toggles the mark line (perps only, persisted, default on)                                              | ⬜     | Manual      |                                          |
| 15.6.3 | Drag a TP line, then Confirm                | Price rounded to the tick; amend sent only after Confirm; Cancel restores the line                     | ✅     | T2 · RTL    | `useTradeLines.test`.                    |
| 15.6.4 | With a drawing tool active                  | Lines don't take the pointer                                                                           | ✅     | T2 · RTL    |                                          |
| 15.6.5 | Spot TP / SL leg                            | Drawn but not draggable (placed or cancelled, never edited)                                            | ✅     | T1 · Vitest |                                          |
| 15.6.6 | Real chart: drag feel, labels, cursor       | ns-resize cursor on hover; chart doesn't pan while dragging a line                                     | ⬜     | Manual      | Screenshot for the PR.                   |

---

## Section 16 — Funding (Bybit Parity BP-4)

> Reference: `docs/APP_LOG.md` Bybit Parity BP-4. fee = size × mark × rate at the funding timestamp; a positive rate: longs
> pay, shorts receive. Worked position: long 0.1 BTC at 10× (IM 500), mark 51,000, rate 0.01% → fee **0.51**.

### 16.1 Settlement

| #      | Action                                             | Expected                                                                                                   | Status | Tier        | Notes                              |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------- |
| 16.1.1 | Long, rate +0.01%                                  | Pays 0.51: balance −0.51, realized −0.51, position Funding −0.51 (red)                                     | ✅     | T1 + T2     | `funding.test`, OAMP test.         |
| 16.1.2 | Short, rate +0.01% / long, rate −0.02%             | Receives 0.51 / 1.02 (green, "+")                                                                          | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.3 | Balance too low                                    | The shortfall comes out of the position margin; its liquidation price moves toward the mark                | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.4 | Position closed seconds after the timestamp        | Still pays (held at the timestamp), from the balance                                                       | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.5 | Position opened after the timestamp                | Not charged                                                                                                | ✅     | T1 · Vitest | `services.test` MatchingEngine.    |
| 16.1.6 | Same timestamp twice (restart, retry, 2nd machine) | Settles once (`SymbolSetting.lastFundingAt`)                                                               | ✅     | T1 + live   | Live ✓ 2026-09-27 (second run: 0). |
| 16.1.7 | Records                                            | Funding execution row (`execType Funding`, mark as price, rate, signed fee), journal line, Balance History | ✅     | T1 + live   | Live ✓: fee 0.01936652 exact.      |
| 16.1.8 | Rate source                                        | Bybit's settled rate from funding history for exactly that timestamp; the ticker's announced rate if none  | ✅     | T1 · Vitest | `services.test`.                   |
| 16.1.9 | Mark at the timestamp                              | The mark seen at the timestamp, not the next tick's                                                        | ✅     | T1 · Vitest | `services.test`.                   |

### 16.2 Backfill, closes, history

| #      | Action                                  | Expected                                                                                                  | Status | Tier        | Notes            |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------- |
| 16.2.1 | Server gap spanning a funding timestamp | Settled at the mark-price candle's open, in time order with the candle sweep (before a later liquidation) | ✅     | T1 · Vitest | `services.test`. |
| 16.2.2 | Close after funding                     | The closed-trade record carries the funding share; realized PnL isn't charged again                       | ✅     | T1 · Vitest | `funding.test`.  |
| 16.2.3 | Same-side add                           | The merged position keeps its funding so far                                                              | ✅     | T1 · Vitest |                  |
| 16.2.4 | Snapshot                                | Funding rows never crowd out closed-trade history (own capped list)                                       | ✅     | T1 + live   |                  |
| 16.2.5 | Funding history paging / 7-day cap      | Oldest first; both `startTime` and `endTime` sent                                                         | ✅     | T1 · Vitest | `infra.test`.    |

### 16.3 UI

| #      | Action            | Expected                                                                                       | Status | Tier      | Notes                           |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------- | ------ | --------- | ------------------------------- |
| 16.3.1 | Perps pane header | MARK · INDEX · FUNDING / COUNTDOWN "0.0083% / 07:49:28", ticking each second; tooltip explains | ✅     | T2 + live | `SymbolBar.test`; screenshot ✓. |
| 16.3.2 | Spot pane header  | No mark / index / funding stats                                                                | ✅     | T2 · RTL  |                                 |
| 16.3.3 | Positions tab     | Funding column (default on; saved layouts get it once, before Close if its anchor is hidden)   | ✅     | T2 · RTL  | `columnPrefs` tests.            |

## Section 17 — Cross margin, risk tiers and refinements (Bybit Parity BP-5)

> Reference: `docs/APP_LOG.md` Bybit Parity BP-5 (owner decisions O1–O12). Worked position: long 0.1 BTC at 50,000,
> 10× (IM 500, fee to close 2.475, liq ≈ 45,148.99 isolated). Live = the 2026-09-27 API + browser run on the dev
> server (throwaway account, deleted).

### 17.1 Add / reduce margin (isolated, A)

| #      | Action                        | Expected                                                                               | Status | Tier        | Notes                     |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------- |
| 17.1.1 | Add 1,000                     | Liq ≈ 35,110; balance −1,000; journal + Balance History; leverage unchanged            | ✅     | T1 + T2     | `margin.test`, OAMP test. |
| 17.1.2 | Reduce past the added margin  | Refused (110078); reduce needs a fresh mark; a reduce that liquidates refused (110011) | ✅     | T1 · Vitest | `margin.test`.            |
| 17.1.3 | Partial close / leverage move | Extra margin shrinks pro rata / is released in full                                    | ✅     | T1 · Vitest | `margin.test`.            |
| 17.1.4 | Cross account                 | Refused ("isolated margin mode" only); the pencil is hidden                            | ✅     | T1 + live   | Live ✓ (422).             |

### 17.2 Trigger source, reduce-only, TP / SL side (B)

| #      | Action                                    | Expected                                                                                              | Status | Tier        | Notes                        |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------- |
| 17.2.1 | SL on Mark / TP on Index                  | Fires on that source only; a leg whose source is unknown on a tick isn't checked; backfill likewise   | ✅     | T1 · Vitest | `orderRules.test`, services. |
| 17.2.2 | Leg moved to another source before firing | The stale trigger is dropped                                                                          | ✅     | T1 · Vitest | `services.test`.             |
| 17.2.3 | Reduce-only market / resting              | Capped at the position, no margin, no TP / SL; wrong side / no position refused (110017)              | ✅     | T1 + live   | Live ✓.                      |
| 17.2.4 | Position shrinks / closes                 | Resting reduce-only orders trimmed furthest-first, then cancelled                                     | ✅     | T1 · Vitest | `orderRules.test`.           |
| 17.2.5 | Close-on-trigger stop                     | Implies reduce-only; order form offers it for Stop only                                               | ✅     | T1 + T2     | TradingPanel test; live ✓.   |
| 17.2.6 | TP / SL on the wrong side (O9)            | Refused in Bybit's words vs the order price / the leg source's live price; untouched legs not checked | ✅     | T1 + live   | Live ✓ "…base_price…".       |
| 17.2.7 | SL beyond liquidation                     | Accepted; amber warning in the position TP / SL panel                                                 | ✅     | T1 + T2     | `PositionEditPanel.test`.    |

### 17.3 Risk tiers (C)

| #      | Action                            | Expected                                                                                | Status | Tier        | Notes             |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------- | ------ | ----------- | ----------------- |
| 17.3.1 | Order / edit / leverage past cap  | Refused (110090) naming the leverage to go down to; reduce-only not counted             | ✅     | T1 · Vitest | `riskTiers.test`. |
| 17.3.2 | Liquidation above the lowest tier | Steps down to each lower tier's limit at bankruptcy; full close only in the lowest tier | ✅     | T1 · Vitest | `riskTiers.test`. |
| 17.3.3 | Backfill                          | One mark candle can take several steps (worst mark)                                     | ✅     | T1 · Vitest |                   |
| 17.3.4 | Leverage modal / MMR hover        | Tier, MMR, max position value at the chosen leverage                                    | ✅     | T2 + live   | Screenshot ✓.     |

### 17.4 Closed P&L (D)

| #      | Action        | Expected                                                                                        | Status | Tier      | Notes                        |
| ------ | ------------- | ----------------------------------------------------------------------------------------------- | ------ | --------- | ---------------------------- |
| 17.4.1 | Partial close | Row: closed qty, entry, exit, closedPnl = PnL − open fee − close fee − funding; hover breakdown | ✅     | T1 + live | Live ✓ −0.3741 on 0.004 BTC. |
| 17.4.2 | Liquidation   | Exit type "Liquidation"; spot sells never listed                                                | ✅     | T2 · RTL  |                              |

### 17.5 Cross margin (E)

| #      | Action                          | Expected                                                                                                 | Status | Tier        | Notes                                 |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------- |
| 17.5.1 | New account                     | Cross; existing accounts isolated with a one-time notice (How it works / Switch to Cross)                | ✅     | T2 + live   | Live ✓; migration ✓ on the dev DB.    |
| 17.5.2 | Figures                         | Margin balance, IM / MM at mark, rates, available — server = client estimate                             | ✅     | T1 · Vitest | `bybitSpec.test` parity.              |
| 17.5.3 | Order on unrealised profit      | Accepted in cross, refused in isolated                                                                   | ✅     | T1 · Vitest | `cross.test`.                         |
| 17.5.4 | Loss beyond a position's margin | From the wallet in cross; isolated books only what was lost                                              | ✅     | T1 · Vitest |                                       |
| 17.5.5 | MM rate reaches 100%            | Orders cancelled, positions stepped down in contract order (BTC first), account ends ≥ 0                 | ✅     | T1 · Vitest | `cross.test`, services (fresh marks). |
| 17.5.6 | Mode switch                     | Isolated → cross releases added margin; cross → isolated refused with every reason; same mode = no-op    | ✅     | T1 + live   | Live ✓ both ways.                     |
| 17.5.7 | UI                              | `Cross 10x` chip; mode tabs + explainer; summary bar Margin balance / IM rate / MM meter; cross liq est. | ✅     | T2 + live   | Screenshots ✓.                        |

### 17.6 Refinements (F) and parity (G)

| #      | Action                                      | Expected                                              | Status | Tier        | Notes                           |
| ------ | ------------------------------------------- | ----------------------------------------------------- | ------ | ----------- | ------------------------------- |
| 17.6.1 | Stalled feed at a funding timestamp         | Settled at the mark candle, not a minutes-old mark    | ✅     | T1 · Vitest | `services.test`.                |
| 17.6.2 | Closed before its funding settled           | The fee lands on that close's Trade row               | ✅     | T1 · Vitest | repository + engine tests.      |
| 17.6.3 | Opened and closed while the engine was down | Charged by the backfill (from the closing Trade rows) | ✅     | T1 · Vitest | `services.test`.                |
| 17.6.4 | Bybit testnet parity run                    | Every compared v5 field matches within 0.01           | ⏳     | Manual      | Needs the owner's testnet keys. |
