# Trading Panel — Manual UI Test Plan

> Status legend: ⬜ Not tested · ✅ Pass · ❌ Fail · ⚠️ Partial

**Test environment:** Local dev (`pnpm dev`). Symbol: BTCUSDT (live feed).  
**Reset account between sections** using the ⚙️ gear → Reset? button.

---

## Setup checklist (run before every section)

- [ ] Dev server running, live price updating in TradingPanel header
- [ ] PaperTradingPanel expanded (open state), balance shows $10,000.00
- [ ] Account reset (gear → Reset?) to start fresh
- [ ] Journal tab is empty

---

## Section 1 — Market Orders

### 1.1 Basic Buy (USD mode)

| #     | Action                                                            | Expected                                                          | Status | Notes |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | - | ----- |
| 1.1.1 | Select **Buy**, tab = **Market**, qty mode = **USD**, enter `100` | Order info shows Margin ~$10, Trade value $100, Commission ~$0.07 | ✅ |       |
| 1.1.2 | Click **Buy** button                                              | Button pulses; qty input clears                                   | ✅ |       |
| 1.1.3 | Go to **Positions** tab                                           | 1 LONG row appears: Entry ≈ live price, Qty > 0, TP = —, SL = —   | ✅ |       |
| 1.1.4 | Check balance                                                     | Balance = $10,000 − $100 − commission                             | ✅ |       |
| 1.1.5 | Go to **Journal** tab                                             | Auto entry: `Opened LONG BTCUSDT @ $X.XX`                         | ✅ |       |

### 1.2 Basic Sell (USD mode)

| #     | Action                                                                  | Expected                                                            | Status | Notes |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | --- | ----- |
| 1.2.1 | Reset account. Select **Sell**, tab = **Market**, USD mode, enter `200` | Order info updates for Sell side                                    | ✅   |       |
| 1.2.2 | Click **Sell** button                                                   | Position opens                                                      | ✅   |       |
| 1.2.3 | Positions tab                                                           | 1 SHORT row. PnL updates live (green if price dropped, red if rose) | ✅   |       |

### 1.3 Units mode

| #     | Action                                 | Expected                                                  | Status | Notes |
| ----- | -------------------------------------- | --------------------------------------------------------- | ------ | ----- |
| 1.3.1 | Click `⇄ Units` button                 | Label changes to `Quantity (BTC)`, placeholder `0.000000` | ✅     |       |
| 1.3.2 | Enter `0.001` units                    | Equivalent below shows ≈ live_price × 0.001 USD           | ✅     | Showed ≈ $75.93 |
| 1.3.3 | Click `⇄ USD`                          | Input converts to USD value; equivalent shows 0.001 BTC   | ✅     | Showed $75.95 ≈ 0.001000 BTC |
| 1.3.4 | Place order in Units mode with `0.001` | Position qty ≈ 0.001                                      | ✅     | SHORT opened, qty = 0.001000 @ $75,992.80 |

### 1.4 Buy with Take-Profit only

| #     | Action                                                                               | Expected                                                           | Status | Notes |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ | ----- |
| 1.4.1 | Reset. Buy $500, enable TP toggle, enter a price **above** live price (e.g. live+5%) | TP input has green border                                          | ✅     |       |
| 1.4.2 | Submit                                                                               | Position appears with TP = your price, SL = —                      | ✅     |       |
| 1.4.3 | _(wait or set TP very close)_ When live price crosses TP                             | Position disappears from Positions; appears in History with profit | ✅     | History count = 1; Positions cleared |
| 1.4.4 | Journal tab                                                                          | Entry: `Auto-closed LONG BTCUSDT — Take-Profit hit at $X`          | ✅     | `Auto-closed LONG BTCUSDT — Take-Profit hit at $76228.0000` |

### 1.5 Sell with Stop-Loss only

| #     | Action                                                                                          | Expected                            | Status | Notes |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | ------ | ----- |
| 1.5.1 | Reset. Sell $500, enable SL toggle, enter a price **above** live price (SHORT SL = above entry) | SL input has red border             | ✅     |       |
| 1.5.2 | Submit                                                                                          | SHORT position with SL = your price | ✅     | Entry @ $76,194.40 |
| 1.5.3 | When price rises to SL                                                                          | Auto-closed, appears in History     | ✅     | Exit @ $76,200.30; PnL −$0.04 |

### 1.6 Buy with both TP and SL

| #     | Action                                      | Expected                                                      | Status | Notes |
| ----- | ------------------------------------------- | ------------------------------------------------------------- | ------ | ----- |
| 1.6.1 | Reset. Buy $300, TP = live+3%, SL = live−2% | Both inputs active                                            | ✅     |       |
| 1.6.2 | Submit                                      | Position shows both TP and SL columns                         | ✅     | LONG Entry @ $76,144.90 |
| 1.6.3 | Manual close via **✕** in Positions tab     | Position removed; History row appears; PnL = (exit−entry)×qty | ✅     | Manually closed @ $76,043.40 (entry $76,023.90); Positions cleared; History updated |

### 1.7 Edge cases

| #      | Scenario                                              | Expected                                                 | Status | Notes |
| ------ | ----------------------------------------------------- | -------------------------------------------------------- | ------ | ----- |
| 1.7.1  | Submit with **empty** qty                             | Error: "Enter a USD amount"                              | ⚠️     | Buy button is disabled instead of showing error message |
| 1.7.2  | Submit with qty **> balance** (e.g. $99,999)          | Error: "Insufficient balance"                            | ✅     | "Insufficient balance" shown in red; order blocked |
| 1.7.3  | TP below entry for a Buy (e.g. live−1%)               | Error: "Take-Profit must be above entry price for Long"  | ✅     | TP = 75,700 (below live 75,841); correct error shown in red |
| 1.7.4  | SL above entry for a Buy (e.g. live+1%)               | Error: "Stop-Loss must be below entry price for Long"    | ✅     | SL = 76,000 (above live 75,958); correct error shown in red |
| 1.7.5  | TP above entry for a Sell                             | Error: "Take-Profit must be below entry price for Short" | ✅     | TP = 76,000 (above live 75,931); correct error shown in red |
| 1.7.6  | SL below entry for a Sell                             | Error: "Stop-Loss must be above entry price for Short"   | ✅     | SL = 75,000 (below live 76,112); correct error shown in red |
| 1.7.7  | Enter qty `0` or negative                             | Submit button disabled (opacity 30%)                     | ✅     | Button disabled as expected |
| 1.7.8  | Disconnect from internet, submit market order         | Error: "Waiting for live price…"                         | ❌     | Order was placed successfully despite no internet — bug |
| 1.7.9  | Place multiple positions, close them in reverse order | Each closes at correct mark price; History accumulates   | ✅     | 3 positions closed; History = 3 entries; PnL correct for each |
| 1.7.10 | Reset account mid-open position                       | Positions cleared, balance = $10,000                     | ✅     | Confirmed |

---

## Section 2 — Limit Orders _(run after Section 1 passes)_

### 2.1 Limit Buy below market

| #     | Action                                                          | Expected                                                                         | Status | Notes |
| ----- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | ----- |
| 2.1.1 | Tab = **Limit**. Price input appears pre-filled with live price | Price field visible                                                              | ✅     |       |
| 2.1.2 | Set price to live − 2%, qty $200, click **Buy**                 | Pending order created; balance decreases by $200 + commission                    | ✅     | Balance $9,799.86; Reserved $200.00 |
| 2.1.3 | Go to **Orders** tab                                            | 1 row: LIMIT / BUY / Trigger = your price / Reserved = $200                      | ✅     | LIMIT / BUY / Trigger $76,060.00 / Reserved $200.00 |
| 2.1.4 | When price drops to trigger                                     | Order disappears from Orders; position appears in Positions; journal entry added | ✅     | Triggered @ $76,059.60 (trigger $76,060.00); LONG position opened; journal: `Limit order filled — Long BTCUSDT @ $76059.6000` |

### 2.2 Limit Buy cancel

| #     | Action                                        | Expected                                                               | Status | Notes |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------- | ------ | ----- |
| 2.2.1 | Place limit buy far below market (live − 10%) | Order appears in Orders tab                                            | ✅     |       |
| 2.2.2 | Click **✕** cancel in Orders tab              | Order disappears; balance **fully refunded** (back to pre-order value) | ✅     | Orders tab empty; balance restored to $10,000.00 |

### 2.3 Limit Sell above market

| #     | Action                                    | Expected                          | Status | Notes |
| ----- | ----------------------------------------- | --------------------------------- | ------ | ----- |
| 2.3.1 | Tab = Limit, price = live + 2%, Sell $200 | Pending SHORT sell created        | ✅     | LIMIT / SELL / Trigger $76,050.00 / Reserved $200.00 |
| 2.3.2 | When price rises to trigger               | SHORT position opens in Positions | ✅     | Triggered @ $75,737.10 (trigger $75,728.00); journal: `Limit order filled — Short BTCUSDT @ $75737.1000` |

### 2.4 Limit with TP + SL

| #     | Action                                                | Expected                                | Status | Notes |
| ----- | ----------------------------------------------------- | --------------------------------------- | ------ | ----- |
| 2.4.1 | Limit buy $300 at live−1%, TP = live+3%, SL = live−4% | Order shows TP/SL columns in Orders tab | ✅     | TP/SL columns visible in Orders tab |
| 2.4.2 | When triggered, position inherits TP and SL           | Position TP/SL match what was set       | ✅     | Limit order filled → LONG opened; SL inherited and auto-triggered @ $75,720.00; journal: `Auto-closed LONG BTCUSDT — Stop-Loss hit at $75720.0000` |

### 2.5 Edge cases

| #     | Scenario                                  | Expected                                             | Status | Notes |
| ----- | ----------------------------------------- | ---------------------------------------------------- | ------ | ----- |
| 2.5.1 | Limit Buy with TP **below** trigger price | Validation error before placement                    | ✅     | Limit Buy @ $75,710, TP = $75,705; error: "Take-Profit must be above entry price for Long" |
| 2.5.2 | Limit Buy with SL **above** trigger price | Validation error before placement                    | ✅     | Limit Buy @ $75,710, SL = $75,730; error: "Stop-Loss must be below entry price for Long" |
| 2.5.3 | Place limit, then switch symbol           | Order stays in Orders tab (scoped to its own symbol) | ❌     | **Bug found & fixed**: switching to BTCUSDT after placing ETHUSDT limit order caused ETHUSDT position mark price to show BTC price (e.g. $75,818 instead of ~$2,352), resulting in wildly wrong PnL (+$62,452). Root cause: `PaperTradingPanel` used `paneStores[0].latestPrice` for all positions. Fix: now builds `priceBySymbol` map from all 4 pane stores and uses the correct price per position. |
| 2.5.4 | Place limit order that exceeds balance    | Error: "Insufficient balance"                        | ✅     | ETHUSDT limit buy $20,000 (balance $10,000); error: "Insufficient balance" shown in red |

---

## Section 3 — Stop Orders _(run after Section 2 passes)_

### 3.1 Stop Buy above market (breakout)

| #     | Action                                      | Expected                                     | Status | Notes |
| ----- | ------------------------------------------- | -------------------------------------------- | ------ | ----- |
| 3.1.1 | Tab = **Stop**, price = live + 1%, Buy $200 | Pending order in Orders tab: STOP / BUY      | ⬜     |       |
| 3.1.2 | When price rises to trigger                 | Position opens; journal: `Stop order filled` | ⬜     |       |

### 3.2 Stop Sell below market (breakdown)

| #     | Action                                   | Expected                   | Status | Notes |
| ----- | ---------------------------------------- | -------------------------- | ------ | ----- |
| 3.2.1 | Tab = Stop, price = live − 1%, Sell $200 | Pending order: STOP / SELL | ⬜     |       |
| 3.2.2 | When price drops to trigger              | SHORT position opens       | ⬜     |       |

### 3.3 Stop cancel

| #     | Action                           | Expected            | Status | Notes |
| ----- | -------------------------------- | ------------------- | ------ | ----- |
| 3.3.1 | Place stop order far from market | Order in Orders tab | ⬜     |       |
| 3.3.2 | Cancel it                        | Balance refunded    | ⬜     |       |

### 3.4 Stop with TP + SL

| #     | Action                                          | Expected        | Status | Notes |
| ----- | ----------------------------------------------- | --------------- | ------ | ----- |
| 3.4.1 | Stop Buy at live+1%, TP = live+4%, SL = live−1% | Placed OK       | ⬜     |       |
| 3.4.2 | When triggered, position shows correct TP/SL    | TP/SL inherited | ⬜     |       |

### 3.5 Edge cases

| #     | Scenario                                      | Expected                                                                      | Status | Notes                     |
| ----- | --------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ------------------------- |
| 3.5.1 | Stop Buy price **below** market               | Should still place (no restriction); will trigger immediately if already past | ⬜     | Document actual behaviour |
| 3.5.2 | Multiple pending orders (mix of limit + stop) | All show in Orders tab; each cancels/fills independently                      | ⬜     |                           |
| 3.5.3 | Reset account with pending orders             | All pending orders cleared; balance restored to $10,000                       | ⬜     |                           |

---

## Section 4 — Cross-cutting / Regression

| #   | Scenario                                            | Expected                                                               | Status | Notes |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ----- |
| 4.1 | Switch pane symbol while TradingPanel open          | Header updates to new symbol; form resets                              | ⬜     |       |
| 4.2 | Close TradingPanel (✕), reopen via SymbolBar button | Panel reopens; default state (Market, Buy, empty)                      | ⬜     |       |
| 4.3 | Collapse PaperTradingPanel (↓), then expand         | All tabs still functional                                              | ⬜     |       |
| 4.4 | Place order, refresh browser                        | Position/pending order persists (localStorage)                         | ⬜     |       |
| 4.5 | History tab after mix of wins and losses            | PnL signs correct; green/red colors correct                            | ⬜     |       |
| 4.6 | Journal tab shows all system entries in order       | Timestamps ascending, auto-entries not editable, manual notes editable | ⬜     |       |
