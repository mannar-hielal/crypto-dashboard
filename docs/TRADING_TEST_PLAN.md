# Trading Panel — Manual UI Test Plan

> Status legend: ⬜ Not tested · ✅ Pass · ❌ Fail · ⚠️ Partial
>
> **TV ✓** column = cross-check the same action on TradingView Paper Trading (Bybit BTCUSDT Spot · 1m).
> A `TV ✓` cell is only present on tests where the result should be numerically comparable.
> Leave it blank if not running dual-platform; mark ✅/❌ when you are.

**Test environment:** Local dev (`pnpm dev`). Symbol: BTCUSDT (live feed).
**Reset account between sections** using the ⚙️ gear → Reset? button.

---

## Dual-platform setup (run when doing cross-platform checks)

1. Open CryptoDash at `localhost:5173/dashboard` — reset account (gear → Reset?)
2. Open TradingView → Paper Trading → switch to **Bybit BTCUSDT Spot · 1m**
3. Reset TradingView paper account to a clean state
4. Place identical orders in **both apps within the same second** to minimise price drift
5. Tolerance: entry prices may differ by up to the bid/ask spread (~$0.10–$1.00 for BTC) — anything larger indicates a feed lag issue
6. PnL formula to verify: `(exit − entry) × qty − (entry × qty × 0.0007) − (exit × qty × 0.0007)`

---

## Setup checklist (run before every section)

- [ ] Dev server running, live price updating in TradingPanel header **and** browser tab (▲/▼ BTC/USDT)
- [ ] TradingPanel Sell/Buy prices within **$1** of TradingView bid/ask (validates price feed fix)
- [ ] PaperTradingPanel expanded (open state), balance shows $10,000.00
- [ ] Account reset (gear → Reset?) to start fresh
- [ ] Journal tab is empty

---

## Section 1 — Market Orders

### 1.1 Basic Buy (USD mode)

| #     | Action                                                            | Expected                                                                                                | Status | TV ✓ | Notes                                                                               |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------------------------- |
| 1.1.1 | Select **Buy**, tab = **Market**, qty mode = **USD**, enter `100` | Order info shows Margin ≈ lot-rounded fill (e.g. ~$97 for BTC), Trade value = same, Commission ≈ $0.068 | ✅     |      | Margin $98.31, Commission $0.0688                                                   |
| 1.1.2 | Click **Buy** button                                              | Button pulses; qty input clears                                                                         | ✅     |      |                                                                                     |
| 1.1.3 | Go to **Positions** tab                                           | 1 LONG row appears: Entry ≈ live price, Qty > 0, TP = —, SL = —                                         | ✅     | ✅   | Entry $75,625.20, Qty 0.001300, TP=—, SL=—. TV: $75,625.20, 1 s apart — within $1 ✓ |
| 1.1.4 | Check balance                                                     | Balance = $10,000 − actualFillAmount − commission (lot-rounded, not exactly $100)                       | ✅     | ✅   | $10,000 − $98.31 − $0.0688 = $9,901.62 ✓. TV Available $9,901.65 — diff $0.03 ✓     |
| 1.1.5 | Go to **Journal** tab                                             | Auto entry: `Opened LONG BTCUSDT @ $X.XX`                                                               | ✅     |      | ✅ `"Opened LONG BTCUSDT @ $75,625.20"`. **Intentional divergence from TV** — TV journal is blank (manual-only); CryptoDash auto-logs every event for an audit trail. |
| 1.1.6 | Go to **Orders** tab → **Filled** sub-tab                         | 1 row: Type = MARKET / Side = BUY / Fill Price ≈ entry price / Status = Filled (green)                  | ✅     |      | Confirmed matches TV Orders → Filled exactly (Type, Side, Fill Price, Commission, Placing Time all present; Limit Price / Stop Price blank for market orders) |
| 1.1.7 | Check **Orders** tab → **All** sub-tab                            | Same row visible; count badge = 1                                                                        | ✅     |      | `allOrderDisplayRows.length` includes market orders — badge shows 1. Matches TV `All 1`. |
| 1.1.8 | Check **Orders** tab → **Working** sub-tab                        | Empty — market orders are instantly filled, never Working                                                | ✅     |      | Working only counts `kind === 'pending'`; market orders are `historical` — count 0, badge hidden. ✅ |

> **TV cross-check 1.1.3:** Entry price in CryptoDash vs TradingView should differ by ≤ $1 (one bid/ask spread).
> **TV cross-check 1.1.4:** Available balance after commission deduction should match within $0.10.

### 1.2 Basic Sell (USD mode)

| #     | Action                                                                  | Expected                                                            | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ---- | ----- |
| 1.2.1 | Reset account. Select **Sell**, tab = **Market**, USD mode, enter `200` | Order info updates for Sell side                                    | ✅     |      |       |
| 1.2.2 | Click **Sell** button                                                   | Position opens                                                      | ✅     |      |       |
| 1.2.3 | Positions tab                                                           | 1 SHORT row. PnL updates live (green if price dropped, red if rose) | ✅     | ⬜   |       |

> **TV cross-check 1.2.3:** Unrealised PnL sign and approximate magnitude should match TradingView's SHORT position PnL.

### 1.3 Units mode

| #     | Action                                 | Expected                                                  | Status | Notes |
| ----- | -------------------------------------- | --------------------------------------------------------- | ------ | ----- |
| 1.3.1 | Click `⇄ Units` button                 | Label changes to `Quantity (BTC)`, placeholder `0.000000` | ⬜     |       |
| 1.3.2 | Enter `0.001` units                    | Equivalent below shows ≈ live_price × 0.001 USD           | ⬜     |       |
| 1.3.3 | Click `⇄ USD`                          | Input converts to USD value; equivalent shows 0.001 BTC   | ⬜     |       |
| 1.3.4 | Place order in Units mode with `0.001` | Position qty ≈ 0.001                                      | ⬜     |       |

### 1.4 Buy with Take-Profit only

| #     | Action                                                                               | Expected                                                                                | Status | TV ✓ | Notes |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------ | ---- | ----- |
| 1.4.1 | Reset. Buy $500, enable TP toggle, enter a price **above** live price (e.g. live+5%) | TP input has green border                                                               | ⬜     |      |       |
| 1.4.2 | Submit                                                                               | Position appears with TP = your price, SL = —                                           | ⬜     |      |       |
| 1.4.3 | _(wait or set TP very close)_ When live price crosses TP                             | Position disappears from Positions; appears in History with profit                      | ⬜     | ⬜   |       |
| 1.4.4 | Journal tab                                                                          | Entry: `Auto-closed LONG BTCUSDT — Take-Profit hit at $X` with green PnL badge `+$X.XX` | ⬜     | ⬜   |       |

> **TV cross-check 1.4.3:** TP should trigger at the same price level in both apps (same candle).
> **TV cross-check 1.4.4:** Net PnL in Journal badge should match TradingView's realised PnL within $0.10.

### 1.5 Sell with Stop-Loss only

| #     | Action                                                                                          | Expected                                                                                   | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | ---- | ----- |
| 1.5.1 | Reset. Sell $500, enable SL toggle, enter a price **above** live price (SHORT SL = above entry) | SL input has red border                                                                    | ⬜     |      |       |
| 1.5.2 | Submit                                                                                          | SHORT position with SL = your price                                                        | ⬜     |      |       |
| 1.5.3 | When price rises to SL                                                                          | Auto-closed, appears in History; Journal shows red PnL badge `−$X.XX` on Auto-closed entry | ⬜     | ⬜   |       |

> **TV cross-check 1.5.3:** Loss magnitude should match TradingView's realised PnL within $0.10.

### 1.6 Buy with both TP and SL

| #     | Action                                      | Expected                                                                                          | Status | TV ✓ | Notes |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ---- | ----- |
| 1.6.1 | Reset. Buy $300, TP = live+3%, SL = live−2% | Both inputs active                                                                                | ⬜     |      |       |
| 1.6.2 | Submit                                      | Position shows both TP and SL columns                                                             | ⬜     |      |       |
| 1.6.3 | Manual close via **✕** in Positions tab     | Position removed; History row appears; PnL = (exit−entry)×qty; Journal exec entry shows PnL badge | ⬜     | ⬜   |       |

> **TV cross-check 1.6.3:** Manually close the mirrored TradingView position at the same moment; PnL values should match within $0.10.

### 1.7 Edge cases

| #      | Scenario                                              | Expected                                                 | Status | Notes |
| ------ | ----------------------------------------------------- | -------------------------------------------------------- | ------ | ----- |
| 1.7.1  | Submit with **empty** qty                             | Error: "Enter a USD amount"                              | ⬜     |       |
| 1.7.2  | Submit with qty **> balance** (e.g. $99,999)          | Error: "Insufficient balance"                            | ⬜     |       |
| 1.7.3  | TP below entry for a Buy (e.g. live−1%)               | Error: "Take-Profit must be above entry price for Long"  | ⬜     |       |
| 1.7.4  | SL above entry for a Buy (e.g. live+1%)               | Error: "Stop-Loss must be below entry price for Long"    | ⬜     |       |
| 1.7.5  | TP above entry for a Sell                             | Error: "Take-Profit must be below entry price for Short" | ⬜     |       |
| 1.7.6  | SL below entry for a Sell                             | Error: "Stop-Loss must be above entry price for Short"   | ⬜     |       |
| 1.7.7  | Enter qty `0` or negative                             | Submit button disabled (opacity 30%)                     | ⬜     |       |
| 1.7.8  | Disconnect from internet, submit market order         | Error: "Waiting for live price…"                         | ⬜     |       |
| 1.7.9  | Place multiple positions, close them in reverse order | Each closes at correct mark price; History accumulates   | ⬜     |       |
| 1.7.10 | Reset account mid-open position                       | Positions cleared, balance = $10,000                     | ⬜     |       |

---

## Section 2 — Limit Orders _(run after Section 1 passes)_

### 2.1 Limit Buy below market

| #     | Action                                                          | Expected                                                                          | Status | TV ✓ | Notes |
| ----- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ | ---- | ----- |
| 2.1.1 | Tab = **Limit**. Price input appears pre-filled with live price | Price field visible                                                               | ⬜     |      |       |
| 2.1.2 | Set price to live − 2%, qty $200, click **Buy**                 | Pending order created; balance decreases by $200 + commission                     | ⬜     |      |       |
| 2.1.3 | Go to **Orders** tab → **Working** sub-tab                      | 1 row: LIMIT / BUY / Limit Price = your price; Status = Working (amber)           | ⬜     |      |       |
| 2.1.4 | Check **All** sub-tab count badge                               | Badge shows **1**; row visible under All                                          | ⬜     |      |       |
| 2.1.5 | When price drops to trigger                                     | Order disappears from Working; appears in **Filled** sub-tab; journal entry added | ⬜     | ⬜   |       |
| 2.1.6 | Check **All** sub-tab after fill                                | Badge count unchanged (1); row now shows status = Filled (green)                  | ⬜     |      |       |

> **TV cross-check 2.1.5:** Both apps should fill on the same candle; entry prices should be within $1.

### 2.2 Limit Buy cancel

| #     | Action                                        | Expected                                                                       | Status | Notes |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ----- |
| 2.2.1 | Place limit buy far below market (live − 10%) | Order appears in **Working** sub-tab; amber tab badge shows 1                   | ⬜     |       |
| 2.2.2 | Click **✕** cancel in Working sub-tab         | Order disappears; appears in **Cancelled** sub-tab; balance **fully refunded**; amber badge disappears | ⬜     |       |

### 2.3 Limit Sell above market

| #     | Action                                    | Expected                          | Status | TV ✓ | Notes |
| ----- | ----------------------------------------- | --------------------------------- | ------ | ---- | ----- |
| 2.3.1 | Tab = Limit, price = live + 2%, Sell $200 | Pending SHORT sell created        | ⬜     |      |       |
| 2.3.2 | When price rises to trigger               | SHORT position opens in Positions | ⬜     | ⬜   |       |

### 2.4 Limit with TP + SL

| #     | Action                                                | Expected                                                                     | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | ---- | ----- |
| 2.4.1 | Limit buy $300 at live−1%, TP = live+3%, SL = live−4% | Order shows TP/SL columns in Orders tab                                      | ⬜     |      |       |
| 2.4.2 | When triggered, position inherits TP and SL           | Position TP/SL match what was set; Auto-closed journal entry shows PnL badge | ⬜     | ⬜   |       |

### 2.5 Edge cases

| #     | Scenario                                  | Expected                                             | Status | Notes |
| ----- | ----------------------------------------- | ---------------------------------------------------- | ------ | ----- |
| 2.5.1 | Limit Buy with TP **below** trigger price | Validation error before placement                    | ⬜     |       |
| 2.5.2 | Limit Buy with SL **above** trigger price | Validation error before placement                    | ⬜     |       |
| 2.5.3 | Place limit, then switch symbol           | Order stays in Orders tab (scoped to its own symbol) | ⬜     |       |
| 2.5.4 | Place limit order that exceeds balance    | Error: "Insufficient balance"                        | ⬜     |       |

---

## Section 3 — Stop Orders _(run after Section 2 passes)_

### 3.1 Stop Buy above market (breakout)

| #     | Action                                      | Expected                                                                | Status | TV ✓ | Notes |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------- | ------ | ---- | ----- |
| 3.1.1 | Tab = **Stop**, price = live + 1%, Buy $200 | Pending order in Orders tab: STOP / BUY; amber tab badge shows 1        | ⬜     |      |       |
| 3.1.2 | Check **Working** sub-tab                   | 1 row visible with STOP type pill                                       | ⬜     |      |       |
| 3.1.3 | When price rises to trigger                 | Order moves to **Filled** sub-tab; amber badge disappears; position opens; journal: `Stop order filled` | ⬜     | ⬜   |       |

### 3.2 Stop Sell below market (breakdown)

| #     | Action                                   | Expected                                                       | Status | TV ✓ | Notes |
| ----- | ---------------------------------------- | -------------------------------------------------------------- | ------ | ---- | ----- |
| 3.2.1 | Tab = Stop, price = live − 1%, Sell $200 | Pending order: STOP / SELL; amber badge shows 1                | ⬜     |      |       |
| 3.2.2 | When price drops to trigger              | SHORT position opens; order in Filled sub-tab                  | ⬜     | ⬜   |       |

### 3.3 Stop cancel

| #     | Action                           | Expected            | Status | Notes |
| ----- | -------------------------------- | ------------------- | ------ | ----- |
| 3.3.1 | Place stop order far from market | Order in Orders tab | ⬜     |       |
| 3.3.2 | Cancel it                        | Balance refunded    | ⬜     |       |

### 3.4 Stop with TP + SL

| #     | Action                                          | Expected        | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------- | --------------- | ------ | ---- | ----- |
| 3.4.1 | Stop Buy at live+1%, TP = live+4%, SL = live−1% | Placed OK       | ⬜     |      |       |
| 3.4.2 | When triggered, position shows correct TP/SL    | TP/SL inherited | ⬜     | ⬜   |       |

### 3.5 Edge cases

| #     | Scenario                                      | Expected                                                                      | Status | Notes |
| ----- | --------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ----- |
| 3.5.1 | Stop Buy price **below** market               | Should still place (no restriction); will trigger immediately if already past | ⬜     |       |
| 3.5.2 | Multiple pending orders (mix of limit + stop) | All show in Orders tab; each cancels/fills independently                      | ⬜     |       |
| 3.5.3 | Reset account with pending orders             | All pending orders cleared; balance restored to $10,000                       | ⬜     |       |

---

## Section 4 — Cross-cutting / Regression

| #    | Scenario                                            | Expected                                                                                                                        | Status | Notes |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| 4.1  | Switch pane symbol while TradingPanel open          | Header updates to new symbol; form resets (qty/price cleared); **tab stays on current selection** (Market/Limit/Stop preserved) | ⬜     |       |
| 4.2  | Switch symbol while on **Limit** tab                | Tab remains Limit; price input updates to new symbol's live price                                                               | ⬜     |       |
| 4.3  | Switch symbol while on **Stop** tab                 | Tab remains Stop; price input updates to new symbol's live price                                                                | ⬜     |       |
| 4.4  | Close TradingPanel (✕), reopen via SymbolBar button | Panel reopens; default state (Market, Buy, empty)                                                                               | ⬜     |       |
| 4.5  | Collapse PaperTradingPanel (↓), then expand         | All tabs still functional                                                                                                       | ⬜     |       |
| 4.6  | Place order, refresh browser                        | Position/pending order persists (localStorage)                                                                                  | ⬜     |       |
| 4.7  | History tab after mix of wins and losses            | PnL signs correct; green/red colors correct                                                                                     | ⬜     |       |
| 4.8  | Journal tab shows all system entries in order       | Timestamps ascending, auto-entries not editable, manual notes editable                                                          | ⬜     |       |
| 4.9  | Journal PnL badge — profitable close                | Manual ✕ close: exec journal entry shows green `+$X.XX` pill inline after text; no badge on open/pending entries                | ⬜     |       |
| 4.10 | Journal PnL badge — losing close                    | Auto-closed TP/SL entry shows red `−$X.XX` pill; badge value matches Balance History net PnL for that trade                     | ⬜     |       |
| 4.11 | Journal PnL badge — user note                       | Manually added journal note has no PnL badge regardless of balance state                                                        | ⬜     |       |
| 4.12 | Maximize PaperTradingPanel (⤢)                      | Chart area collapses (height → 0); panel fills full center column; Minimize2 icon shown; TradingPanel still visible             | ⬜     |       |
| 4.13 | Restore PaperTradingPanel (⤡)                       | Chart area expands back; panel returns to previous height; Maximize2 icon shown                                                 | ⬜     |       |
| 4.14 | Sound — order placed                                | Crisp double-tick plays when a market/limit/stop order is submitted                                                             | ⬜     |       |
| 4.15 | Sound — TP/SL auto-close                            | Ascending jingle (profit) or descending beep (loss) plays when position auto-closes                                             | ⬜     |       |
| 4.16 | Sound — mute toggle                                 | Clicking mute in SoundSettings silences all subsequent sounds; unmuting restores them                                           | ⬜     |       |

---

## Section 5 — Symbol Pair Icons (visual regression)

| #   | Scenario                                                   | Expected                                                                                          | Status | Notes |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ----- |
| 5.1 | Open symbol picker dropdown in SymbolBar                   | Each row shows stacked base/quote coin pair — base icon (20 px) + USDT badge (13 px) bottom-right | ⬜     |       |
| 5.2 | Active symbol trigger button (e.g. `BTC /USDT`)            | Trigger shows stacked pair (18 px base) alongside symbol name, not a single icon                  | ⬜     |       |
| 5.3 | Positions tab with an open position                        | Symbol cell shows stacked pair (16 px base) left of symbol text                                   | ⬜     |       |
| 5.4 | Orders tab with a pending order                            | Symbol cell shows stacked pair (16 px base) left of symbol text                                   | ⬜     |       |
| 5.5 | History tab with a closed trade                            | Symbol cell shows stacked pair (16 px base) left of symbol text                                   | ⬜     |       |
| 5.6 | Unknown symbol (no icon in map)                            | Falls back to 2-letter text badge for base; USDT shows text badge "US" — no crash                 | ⬜     |       |
| 5.7 | Multi-symbol: open positions in BTC and ETH simultaneously | Each row shows the correct base icon (BTC vs ETH), not the active-pane symbol                     | ⬜     |       |

---

## Section 6 — Cross-Platform Price Parity _(dual-platform setup required)_

> Run this section to validate the price feed fix end-to-end. Both apps open side by side.
> Tolerance for all price comparisons: **≤ $1.00** (one bid/ask spread for BTC).
> Lot-size note: CryptoDash now floors qty to the same step TV uses (BTC: 0.0001, ETH: 0.001, etc.) so Trade value and qty shown on the button should match TV within the spread tolerance.

| #   | Scenario                                                            | Expected                                                                              | Status | Notes |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | ----- |
| 6.1 | Compare TradingPanel Sell/Buy vs TradingView bid/ask at rest        | CryptoDash bid/ask within $1 of TradingView at the same moment                        | ⬜     |       |
| 6.2 | Watch both prices for 30 s during normal market activity            | CryptoDash tracks TradingView tick-for-tick; no sustained lag > $1                    | ⬜     |       |
| 6.3 | Watch both prices during a fast move (news spike or breakout)       | CryptoDash catches up within 1–2 s; no freeze or stuck price                          | ⬜     |       |
| 6.4 | Place identical $200 market Buy in both apps within the same second | Entry prices differ by ≤ $1; qty in CryptoDash ≈ qty in TradingView                   | ⬜     |       |
| 6.5 | Let position run for 2 min, compare Unrealised PnL                  | PnL sign matches (both green or both red); magnitude within $0.50                     | ⬜     |       |
| 6.6 | Close both positions manually at the same moment                    | Realised PnL matches within $0.50; commission deducted in both                        | ⬜     |       |
| 6.7 | Place identical Limit Buy at live − 1% in both apps                 | Both fill on the same candle; entry prices within $1                                  | ⬜     |       |
| 6.8 | Place identical Stop Buy at live + 0.5% in both apps                | Both trigger on the same candle; entry prices within $1                               | ⬜     |       |
| 6.9 | Browser tab title during test                                       | Tab shows `▲ BTC/USDT {price} +x.xx%` or `▼ …` updating live; arrow flips on reversal | ⬜     |       |

---

## Section 7 — Order History Tab _(run after Sections 2 & 3 pass)_

> Covers the **Order History** tab (5th tab in PaperTradingPanel). Shows all `HistoricalOrder[]` records — market + limit + stop, all statuses. **Market orders appear here** (not in the Orders tab).

### 7.1 Market order appears in Order History

| #     | Action                                        | Expected                                                                                   | Status | Notes |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | ----- |
| 7.1.1 | Reset account. Place a market Buy $100        | Go to **Order History** tab — 1 row: Type = MARKET / Side = BUY / Status = Filled (green) | ⬜     |       |
| 7.1.2 | Check **All** and **Filled** sub-tabs         | Row visible in both; count badge on tab shows 1                                            | ⬜     |       |
| 7.1.3 | Check **Cancelled** and **Rejected** sub-tabs | Empty (no rows)                                                                            | ⬜     |       |
| 7.1.4 | Check **Orders** tab → **Filled** sub-tab     | Market order **also** appears here (Type = MARKET / Status = Filled) — mirrors TradingView | ⬜     |       |

### 7.2 Limit order fill appears in Order History

| #     | Action                                             | Expected                                                                                | Status | Notes |
| ----- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ | ----- |
| 7.2.1 | Place limit buy at live − 2%; wait for fill        | Order History → Filled sub-tab: 1 row LIMIT / BUY / Fill Price ≈ trigger price         | ⬜     |       |
| 7.2.2 | Verify columns: Limit Price, Fill Price, Commission | Limit Price = your trigger; Fill Price ≈ trigger; Commission ≈ usdtAmount × 0.0007     | ⬜     |       |
| 7.2.3 | Orders tab → Filled sub-tab                        | Same record also appears in the Orders tab's Filled sub-tab (two views, same data)     | ⬜     |       |

### 7.3 Cancelled order appears in Order History

| #     | Action                                                        | Expected                                                                    | Status | Notes |
| ----- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ | ----- |
| 7.3.1 | Place limit buy far below market; cancel via Orders tab (✕)  | Order History → Cancelled sub-tab: 1 row, Status = Cancelled (muted)        | ⬜     |       |
| 7.3.2 | Check All sub-tab count                                       | Count includes this cancelled record                                        | ⬜     |       |

### 7.4 Rejected orders (if any) appear in Order History, not History tab

| #     | Action                                               | Expected                                                                              | Status | Notes |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | ----- |
| 7.4.1 | Simulate rejection (e.g. submit order with 0 balance) | If order reaches rejected state: Order History → Rejected sub-tab shows red ⚠ badge  | ⬜     |       |
| 7.4.2 | Check History tab (closed trades)                    | Rejected orders do **not** appear in the History / Trade History tab                  | ⬜     |       |

### 7.5 Placing Time and Closing Time columns

| #     | Action                                           | Expected                                                                     | Status | Notes |
| ----- | ------------------------------------------------ | ---------------------------------------------------------------------------- | ------ | ----- |
| 7.5.1 | Open column picker (⊟ icon) in Order History tab | Placing Time and Closing Time are on by default; other columns toggleable    | ⬜     |       |
| 7.5.2 | Disable Closing Time; re-enable it               | Column disappears then reappears; preference persists after browser refresh  | ⬜     |       |

### 7.6 Mix of all order types

| #     | Action                                                                       | Expected                                                                        | Status | Notes |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ----- |
| 7.6.1 | Place market buy, limit buy (fill), stop sell (cancel) in sequence           | Order History All sub-tab shows 3 rows: MARKET/Filled, LIMIT/Filled, STOP/Cancelled | ⬜     |       |
| 7.6.2 | Each status badge uses correct color: Filled = green, Cancelled = muted      | Visual check                                                                    | ⬜     |       |

---

## Section 8 — Account Settings Modal

> Open via the **⚙️ gear** button in the PaperTradingPanel header.

| #    | Action                                                                | Expected                                                                                              | Status | Notes |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ----- |
| 8.1  | Click ⚙️ gear button                                                  | Modal opens; "Paper Trading Account" title visible                                                    | ⬜     |       |
| 8.2  | Account name field                                                    | Shows logged-in username; field is **read-only** (cannot type)                                        | ⬜     |       |
| 8.3  | Leverage field                                                        | Displays `10:1 Crypto` — read-only / display only                                                     | ⬜     |       |
| 8.4  | Commission field                                                       | Displays `0.07% Fixed · Taker` — read-only                                                            | ⬜     |       |
| 8.5  | "Save" button                                                         | Button is disabled (greyed out — all fields are read-only)                                            | ⬜     |       |
| 8.6  | Click "Reset account" once                                            | Button changes to a confirm state (e.g. "Confirm reset?"); 3 s auto-cancel timer starts               | ⬜     |       |
| 8.7  | Wait 3 s without confirming                                           | Button reverts to default "Reset account" text; no reset occurred                                     | ⬜     |       |
| 8.8  | Click "Reset account" → immediately click confirm within 3 s          | Modal closes; balance resets to $10,000; positions/orders/journal cleared                              | ⬜     |       |
| 8.9  | Click ✕ (close) button on modal                                       | Modal dismisses; no reset; no changes                                                                  | ⬜     |       |
| 8.10 | Click backdrop (outside modal)                                        | Modal dismisses; confirm state cleared if it was pending                                               | ⬜     |       |
| 8.11 | Open modal while in mid-confirm state; dismiss via backdrop; re-open  | Confirm state is cleared on re-open — button shows default "Reset account"                             | ⬜     |       |

---

## Section 9 — Bid/Ask Spread in TradingPanel

| #    | Action                                                                   | Expected                                                                                    | Status | Notes |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------ | ----- |
| 9.1  | Open TradingPanel with a live symbol (e.g. BTCUSDT)                      | Spread badge between Sell/Buy buttons shows a numeric value (e.g. `0.10`)                   | ⬜     |       |
| 9.2  | Hover spread badge                                                        | Tooltip shows raw bid and ask values (e.g. `Bid: 75,000.00 · Ask: 75,000.10`)               | ⬜     |       |
| 9.3  | Sell button price                                                         | Shows the **bid** price, not mid-price                                                      | ⬜     |       |
| 9.4  | Buy button price                                                          | Shows the **ask** price, not mid-price                                                      | ⬜     |       |
| 9.5  | Spread value decimal places                                               | If spread < 1: 4 decimal places (e.g. `0.1000`); if ≥ 1: 2 decimal places (e.g. `1.25`)    | ⬜     |       |
| 9.6  | Disconnect WebSocket (network tab block) — wait for bid/ask to go stale  | Sell/Buy prices fall back to `latestPrice`; spread badge shows `—`                          | ⬜     |       |
| 9.7  | Switch active pane symbol (e.g. BTC → ETH in multi-pane mode)            | Sell/Buy prices update to ETH bid/ask immediately; spread re-renders for ETH                | ⬜     |       |
| 9.8  | Compare bid/ask vs TradingView orderbook at rest                          | CryptoDash bid/ask within $1 of TradingView best bid/ask at the same moment                 | ⬜     |       |

---

## Section 10.1 — Multi-Chart Layout: Layout switching

> Run with single-chart `1` layout first, then test each split layout. No TV cross-check column needed.

| #      | Action                                                             | Expected                                                                                    | Status | Notes |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------ | ----- |
| 10.1.1 | Open `ChartLayoutPicker` (grid icon in SymbolBar, right side)      | Popover shows 5 SVG layout icons: `1 · 2h · 2v · 3h · 4`                                   | ⬜     |       |
| 10.1.2 | Select **2h** (2 columns)                                          | Chart area splits into 2 side-by-side panes; PaneHeader visible on each                     | ⬜     |       |
| 10.1.3 | Select **2v** (2 rows)                                             | 2 stacked panes                                                                             | ⬜     |       |
| 10.1.4 | Select **3h** (3 columns)                                          | 3 side-by-side panes                                                                        | ⬜     |       |
| 10.1.5 | Select **4** (2×2 grid)                                            | 4 panes in grid                                                                             | ⬜     |       |
| 10.1.6 | Switch back to **1** (single)                                      | Single pane; PaneHeader hidden                                                              | ⬜     |       |
| 10.1.7 | Refresh browser with 2h layout active                              | Layout persists (loaded from `cd-layout` localStorage)                                      | ⬜     |       |

---

## Section 10.2 — Multi-Chart Layout: Active pane selection

| #      | Action                                              | Expected                                                                                           | Status | Notes |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----- |
| 10.2.1 | In 2h layout: click right pane                      | Right pane gets animated purple border + inner glow; TradingPanel reacts to right pane's symbol   | ⬜     |       |
| 10.2.2 | Click left pane                                     | Purple border moves to left pane (animated)                                                        | ⬜     |       |
| 10.2.3 | Switch to 4-pane layout; click pane 3               | Pane 3 becomes active; animated left stripe in PaneHeader moves to pane 3                          | ⬜     |       |
| 10.2.4 | Switch to a smaller layout while active pane = 3    | `activePane` clamps to `paneCount − 1`; no crash                                                   | ⬜     |       |

---

## Section 10.3 — Multi-Chart Layout: Per-pane symbol + interval

| #      | Action                                                                   | Expected                                                                               | Status | Notes |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------ | ----- |
| 10.3.1 | In 2h layout: open PaneHeader symbol picker for pane 0; select ETH       | Pane 0 switches to ETH; pane 1 stays on BTC; each shows correct price                 | ⬜     |       |
| 10.3.2 | Use interval buttons in PaneHeader for pane 1: click 5m                   | Pane 1 fetches 5m bars; pane 0 stays on its interval                                   | ⬜     |       |
| 10.3.3 | Use SymbolBar to change active pane symbol                                | Only the active pane updates                                                            | ⬜     |       |

---

## Section 10.4 — Multi-Chart Layout: Sync options

| #      | Action                                                                              | Expected                                                                                                         | Status | Notes |
| ------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| 10.4.1 | Enable **Sync Symbol** toggle (in ChartLayoutPicker)                                | All panes immediately snap to the active pane's symbol                                                          | ⬜     |       |
| 10.4.2 | Disable **Sync Symbol**; change pane 0 symbol                                       | Other panes remain on their current symbols                                                                      | ⬜     |       |
| 10.4.3 | Enable **Sync Interval** toggle                                                     | All panes immediately snap to the active pane's interval                                                         | ⬜     |       |
| 10.4.4 | Enable **Sync Crosshair**; hover over pane 0 chart                                  | Crosshair line appears on all other panes at the same time position; Y position maps to each pane's price scale  | ⬜     |       |
| 10.4.5 | Move cursor off chart (pane 0 loses cursor)                                         | Crosshair clears from all follower panes                                                                         | ⬜     |       |
| 10.4.6 | Enable **Sync Time Range**; pan or zoom pane 0                                      | All other panes adjust visible range to match                                                                    | ⬜     |       |
| 10.4.7 | Enable Sync Time Range while panes are at different zoom levels                     | All panes snap to active pane's visible range immediately on toggle-on                                           | ⬜     |       |
| 10.4.8 | Sync options persist after browser refresh                                          | Toggle states restored from `cd-layout` localStorage                                                            | ⬜     |       |

---

## Section 10.5 — Multi-Chart Layout: PaneHeader visual elements

| #      | Action                                              | Expected                                                                                     | Status | Notes |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ----- |
| 10.5.1 | Multi-pane mode: each PaneHeader shows              | Symbol name, interval buttons (1m/5m/15m/1h/4h/1d), live price, ±% change badge, 5 px dot    | ⬜     |       |
| 10.5.2 | Connection dot state                                | Green pulse when connected; grey/off when disconnected                                        | ⬜     |       |
| 10.5.3 | Single-pane mode (`1` layout)                       | PaneHeader is **hidden** (not rendered)                                                       | ⬜     |       |

---

## Section 11 — Multi-Symbol PnL (`lastKnownPrices`)

> Verifies that positions in non-active symbols retain correct mark price and PnL display.

| #     | Action                                                                        | Expected                                                                                              | Status | Notes |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ----- |
| 11.1  | In 2h layout: set pane 0 = BTCUSDT, pane 1 = ETHUSDT. Set pane 0 as active   | TradingPanel shows BTCUSDT                                                                            | ⬜     |       |
| 11.2  | Place a market Buy $100 on BTCUSDT (active pane)                              | BTCUSDT position appears in Positions tab                                                             | ⬜     |       |
| 11.3  | Switch active pane to pane 1 (ETHUSDT). Place a market Buy $100 on ETHUSDT   | ETHUSDT position appears; Positions tab now shows 2 rows                                              | ⬜     |       |
| 11.4  | Switch active pane back to pane 0 (BTCUSDT)                                   | Both positions still visible; ETHUSDT row shows a valid mark price (not $0 or stale)                  | ⬜     |       |
| 11.5  | Watch ETHUSDT PnL while BTCUSDT is the active pane                            | ETHUSDT PnL updates live (from `lastKnownPrices`, not the active pane price)                          | ⬜     |       |
| 11.6  | Switch to single-pane layout (`1`) showing only BTCUSDT                        | ETHUSDT position mark price still updates (pane WS closes but `lastKnownPrices` retains last value)   | ⬜     |       |
| 11.7  | Account Summary Bar — Unrealized P&L                                          | Reflects the **combined** PnL of BTC + ETH positions, not just the active pane's position             | ⬜     |       |
| 11.8  | Close ETHUSDT position manually while BTCUSDT is active                        | ETHUSDT position closes; History tab shows the correct exit price and PnL                             | ⬜     |       |
