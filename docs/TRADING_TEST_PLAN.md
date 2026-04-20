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

| #     | Action                                                            | Expected                                                          | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------ | ---- | ----- |
| 1.1.1 | Select **Buy**, tab = **Market**, qty mode = **USD**, enter `100` | Order info shows Margin ~$10, Trade value $100, Commission ~$0.07 | ⬜     |      |       |
| 1.1.2 | Click **Buy** button                                              | Button pulses; qty input clears                                   | ⬜     |      |       |
| 1.1.3 | Go to **Positions** tab                                           | 1 LONG row appears: Entry ≈ live price, Qty > 0, TP = —, SL = —   | ⬜     | ⬜   |       |
| 1.1.4 | Check balance                                                     | Balance = $10,000 − $100 − commission                             | ⬜     | ⬜   |       |
| 1.1.5 | Go to **Journal** tab                                             | Auto entry: `Opened LONG BTCUSDT @ $X.XX`                         | ⬜     |      |       |

> **TV cross-check 1.1.3:** Entry price in CryptoDash vs TradingView should differ by ≤ $1 (one bid/ask spread).
> **TV cross-check 1.1.4:** Available balance after commission deduction should match within $0.10.

### 1.2 Basic Sell (USD mode)

| #     | Action                                                                  | Expected                                                            | Status | TV ✓ | Notes |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ---- | ----- |
| 1.2.1 | Reset account. Select **Sell**, tab = **Market**, USD mode, enter `200` | Order info updates for Sell side                                    | ⬜     |      |       |
| 1.2.2 | Click **Sell** button                                                   | Position opens                                                      | ⬜     |      |       |
| 1.2.3 | Positions tab                                                           | 1 SHORT row. PnL updates live (green if price dropped, red if rose) | ⬜     | ⬜   |       |

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

| #     | Action                                                          | Expected                                                                         | Status | TV ✓ | Notes |
| ----- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | ---- | ----- |
| 2.1.1 | Tab = **Limit**. Price input appears pre-filled with live price | Price field visible                                                              | ⬜     |      |       |
| 2.1.2 | Set price to live − 2%, qty $200, click **Buy**                 | Pending order created; balance decreases by $200 + commission                    | ⬜     |      |       |
| 2.1.3 | Go to **Orders** tab                                            | 1 row: LIMIT / BUY / Trigger = your price / Reserved = $200                      | ⬜     |      |       |
| 2.1.4 | When price drops to trigger                                     | Order disappears from Orders; position appears in Positions; journal entry added | ⬜     | ⬜   |       |

> **TV cross-check 2.1.4:** Both apps should fill on the same candle; entry prices should be within $1.

### 2.2 Limit Buy cancel

| #     | Action                                        | Expected                                                               | Status | Notes |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------- | ------ | ----- |
| 2.2.1 | Place limit buy far below market (live − 10%) | Order appears in Orders tab                                            | ⬜     |       |
| 2.2.2 | Click **✕** cancel in Orders tab              | Order disappears; balance **fully refunded** (back to pre-order value) | ⬜     |       |

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

| #     | Action                                      | Expected                                     | Status | TV ✓ | Notes |
| ----- | ------------------------------------------- | -------------------------------------------- | ------ | ---- | ----- |
| 3.1.1 | Tab = **Stop**, price = live + 1%, Buy $200 | Pending order in Orders tab: STOP / BUY      | ⬜     |      |       |
| 3.1.2 | When price rises to trigger                 | Position opens; journal: `Stop order filled` | ⬜     | ⬜   |       |

### 3.2 Stop Sell below market (breakdown)

| #     | Action                                   | Expected                   | Status | TV ✓ | Notes |
| ----- | ---------------------------------------- | -------------------------- | ------ | ---- | ----- |
| 3.2.1 | Tab = Stop, price = live − 1%, Sell $200 | Pending order: STOP / SELL | ⬜     |      |       |
| 3.2.2 | When price drops to trigger              | SHORT position opens       | ⬜     | ⬜   |       |

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
