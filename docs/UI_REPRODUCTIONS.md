# UI Reproductions

> **Owner:** Mannar Hielal · **Written:** 2026-09-28 (in the test implementation plan) · **Own file since:**
> 2026-09-30, when that plan was retired with every item done.
>
> The step-by-step way to reproduce each Part B section of `docs/TRADING_TEST_PLAN.md` by hand in the app, in
> Part B's learning-path order (Stage 0 → Stage 6). Testers follow them; the guided tours
> (`docs/GUIDED_TRADE_MVP.md`) take their steps from them. Where a section has a scenario in code
> (`apps/client/src/guide/scenarios/`), the scenario is the reference and Playwright runs it.

## Conventions

- **Where.** Local dev `http://localhost:5173/…` (server on `:3001`) or production `https://cryptopapertrade.com/…`.
  Exact numbers need the local fake feed; on live prices each step gives the formula or the tolerance ("Live: …").
- **The fake feed.** `pnpm dev:e2e` starts the fake Bybit feed (`:4010`), the server pointed at it and Vite
  (`scripts/devE2e.mjs`; the test hooks are on only with `TEST_HOOKS_SECRET` set). In the steps,
  `feed quote spot BTCUSDT bid=49999.9 ask=50000` is shorthand for `pnpm feed quote …`;
  `apps/server/src/tools/feedCtl.ts` lists every control (`quote`, `path`, `funding`, `klines`, `drop`, `stall`,
  `reset`). Steps that use it are marked **(fake feed)** and are skipped by the guided tour.
- **A step** reads `n. [anchor] action → Expect …`, followed by _Explain_ — the learner bubble text. `[anchor]` is
  the control's `data-guide` name (`apps/client/src/lib/guideAnchors.ts`); a backticked word after it is the
  anchor's key, as in [account.tab `assets`].
- **Rounding.** Worked numbers with a third decimal (94.445, 505.225) show rounded by the display formatter, so they
  are written "≈". Tests assert the exact Decimal from `GET /api/paper/state` and the screen with a one-cent
  tolerance.
- **"Isolated 10×"** as a precondition: open the leverage chip (`Cross 10x ▾` / `Isolated 10x ▾`) → **Isolated** tab
  → leverage 10 → **Confirm**. New accounts start in **Cross** (BP-5); every worked number of Sections 1–4, 14 and 15
  assumes Isolated.
- **Manual check (M)** under a section is what no test can judge (sound, feel, email rendering): re-run it on a
  release that touches the files it names, and date it in the row's notes.

## Stage 0 — Getting in

### 19 — Account flows (19.1–19.8, 19.13–19.19)

**Manual check (M).** The email itself (Resend delivery, how the message renders in Gmail / Outlook). Manual option:
one real sign-up on production per auth release with a personal address — check the verify and reset emails
arrive, render, and their links open the right page. Frequency: per release touching `EmailService.ts` or the auth
pages.

**UI reproduction** — start `http://localhost:5173/register` (local dev) or `https://cryptopapertrade.com/register`.
Preconditions: signed out; on local dev without `RESEND_API_KEY` the verify link is in the server log line
`📧 [DEV] …` (or, with the test hooks on, `GET /api/test/outbox?to=<email>` with the `x-test-hooks-secret` header).

1. [auth.register.username] type `ab` → Expect a field error under Username ("at least 3 characters"); the button is
   not stuck on "Creating account…". _Explain: "Usernames need 3–20 letters, numbers or underscores."_
2. [auth.register.username] type a valid name, [auth.register.email] your email, [auth.register.password] a password
   → [auth.register.submit] click → Expect the "check your email" page (`/unverified`). _Explain: "We send a link to
   prove the email is yours."_
3. Open the verify link → Expect "verified". Open the same link again → Expect an "invalid or already used" message,
   not an error page. _Explain: "Each link works once."_
4. [auth.login.email] / [auth.login.password] → [auth.login.submit] → Expect the dashboard. Reload → Expect you are
   still signed in. _Explain: "Your session survives a reload."_
5. [nav.user-menu] → [nav.settings] → change the username → [settings.username.save] → Expect the new name in the
   menu. _Explain: "Settings holds your profile, password, export and deletion."_
6. [settings.export] → Expect a `.json` download. [settings.delete] → [settings.delete.cancel] → Expect nothing
   changed. _Explain: "Export gives you a copy of your data; deletion is permanent."_
7. [nav.sign-out] with the network off (devtools → Offline) → Expect the signed-out page. _Explain: "Signing out
   works even without a connection."_
8. `/forgot-password` → [auth.forgot.email] an address that has no account → [auth.forgot.submit] → Expect the same
   message as for your real address. _Explain: "We never reveal whether an email has an account."_

### 8 — Account Settings modal (8.1–8.13)

**UI reproduction** — `http://localhost:5173/dashboard/usdt/BTCUSDT`, signed in.

1. [account.settings] click (⚙️ in the Order & Account Management header) → Expect "Account Settings". _Explain:
   "Account settings holds your paper account's name, fees and the reset."_
2. [acct-settings.name] try to type → Expect nothing changes (read-only). [acct-settings.fees] → Expect `Spot 0.1%`
   and `Perpetual 0.055% taker · 0.02% maker`; no leverage field. _Explain: "These are Bybit's VIP-0 fees. Leverage is
   set per symbol on the order form."_
3. [acct-settings.reset] click once → Expect "Confirm reset?". Wait 3 s → Expect "Reset account" again, nothing reset.
   _Explain: "Reset needs a second click within 3 seconds, so it can't happen by accident."_
4. [acct-settings.reset] twice within 3 s → Expect the modal closes; balance `10,000.00`; Positions, Orders and
   Journal empty. _Explain: "A reset gives you a fresh 10,000 USDT account."_
5. Reopen, click reset once, click outside the modal, reopen → Expect "Reset account" (confirm cleared).
   [acct-settings.done] → Expect it closes.

### 14.1 — Market URLs and the Trade menu (14.1.1–14.1.10)

**UI reproduction** — signed in, `http://localhost:5173/dashboard`.

1. Open `/dashboard` → Expect the address bar becomes `/dashboard/spot/BTC/USDT` (or your last market). _Explain: "The
   address always names the market you are looking at, so you can bookmark it."_
2. [nav.trade-menu] → option **USDT Perpetual** → Expect `/dashboard/usdt/BTCUSDT`, a ✓ on the current market.
   _Explain: "Spot trades the coin; USDT Perpetual trades a contract with leverage."_
3. Browser **Back** → Expect Spot again, without a page reload (the chart doesn't flash). _Explain: "Back and forward
   move between markets."_
4. Type `/dashboard/spot/btc/usdt` → Expect `/dashboard/spot/BTC/USDT`. Type `/dashboard/spot/PEPE/USDT` → Expect your
   active pane's market.
5. Sign out, open `/dashboard/usdt/ETHUSDT`, sign in → Expect you land on `/dashboard/usdt/ETHUSDT`.
6. Open `/chart` signed out → [nav.trade-menu] → USDT Perpetual → Expect the chart switches, the address stays
   `/chart`.

### 10.1, 10.2, 10.3, 10.5 — Multi-chart layout

**Manual check (M).** The feel of the animated border and glow (smoothness) — M, eyeballed per UI release; the
static result is in the visual baseline.

**UI reproduction** — signed in, `http://localhost:5173/dashboard/spot/BTC/USDT`.

1. [layout.picker] (grid icon, right side of the symbol bar) → Expect 5 layout icons. _Explain: "You can watch up to
   four charts at once."_
2. [layout.option `2h`] → Expect two side-by-side charts, each with its own header. _Explain: "Each pane has its own
   symbol and interval."_
3. Click the right [pane `1`] → Expect a purple border on it; the order form's symbol follows it. _Explain: "The
   order form always trades the active pane's symbol."_
4. [pane.header.symbol] on the left pane → ETH → Expect only the left pane changes. [pane.header.interval `5m`] on
   the right pane → only the right pane changes.
5. Watch [pane.header.price] and [pane.header.dot] → Expect a live price and a green dot; switch devtools to Offline
   → Expect the dot turns grey.
6. [layout.option `4`], click pane 4, then [layout.option `2h`] → Expect pane 2 active, no error. Reload → Expect the
   2h layout is still there. [layout.option `1`] → Expect no pane header.

### 5 — Symbol pair icons (5.1–5.8)

**UI reproduction** — signed in, `/dashboard/usdt/BTCUSDT`, one BTC and one ETH position open (Stage 3 shows how).

1. [symbolbar.symbol-picker] → Expect each row shows the coin icon with a small USDT badge. _Explain: "Every pair is
   a coin quoted in USDT."_
2. [account.tab `positions`] → Expect the BTC row shows the BTC icon and the ETH row the ETH icon, whichever pane is
   active.

### 9 — Sell / Buy prices and spread (9.1–9.10)

**UI reproduction** — local dev with the fake feed (`pnpm dev:e2e`), signed in, `/dashboard/spot/BTC/USDT`.

1. `feed quote spot BTCUSDT bid=49999.9 ask=50000` **(fake feed)**.
2. [trade.side.sell] → Expect `49,999.9`. [trade.side.buy] → Expect `50,000.0`. _Explain: "Sell shows the best bid —
   what a buyer pays you now. Buy shows the best ask — what a seller asks."_
3. [trade.spread] hover → Expect `0.1` and the tooltip `Bid: 49,999.9 · Ask: 50,000.0` (every price at the coin's tick). _Explain: "The spread is the
   gap between them — the cost of trading at market both ways."_
4. `feed stall spot ms=40000` **(fake feed)**, wait 30 s → Expect `—` in the spread and the Market button disabled.
   On live prices: devtools → Offline instead.
5. Two panes, right pane ETHUSDT; click it → Expect Sell / Buy switch to ETH's prices at once.

Live prices: Sell < Buy, usually one tick apart (BTC tick 0.1); the tooltip values must equal the two buttons.

## Stage 1 — Spot basics

### 14.6 — Spot (14.6.1–14.6.10)

**UI reproduction** — local dev with the fake feed, signed in, account reset, `/dashboard/spot/BTC/USDT`. Steps 1–6
are the scenario `spot-market-buy` (`apps/client/src/guide/scenarios/spotMarketBuy.ts`, the PR smoke and the first
Spot tour); the code is the reference when the two differ.

1. `feed quote spot BTCUSDT bid=49999.9 ask=50000` **(fake feed)**. [trade.market.spot] → Expect no leverage chip.
   _Explain: "Spot means you buy the coin itself. There is no leverage and no shorting."_
2. [trade.side.buy] → Expect `50,000`. _Explain: "Buy shows the best ask — the lowest price a seller accepts right
   now. A market buy fills there."_ Live: the Buy button shows the current ask, one tick above Sell most of the time.
3. [trade.type.market]. _Explain: "A market order fills immediately at the best price."_
4. [trade.amount-unit `coin`] → [trade.amount] `0.1` → Expect [trade.preview.cost] `$5,000.00 / $10,000.00`.
   _Explain: "Buy 0.1 BTC. The form shows what it costs before you commit."_ Live: cost ≈ 0.1 × the Buy price.
5. [trade.submit] → Expect the amount field clears. _Explain: "Send the order. The amount field clears when it is
   accepted."_
6. [account.tab `assets`] → Expect USDT free `5,000.00`, BTC free `0.0999`, BTC avg cost `50,050.05`. _Explain: "You
   received 0.0999 BTC: Spot takes its 0.1% fee in the coin you receive."_ Live: BTC received = 0.1 × 0.999; avg cost
   = USDT spent ÷ BTC received; USDT = 10,000 − 0.1 × ask.
7. Expect no [account.tab `positions`] on Spot: Assets replaces it.

8. `feed quote spot BTCUSDT bid=51000 ask=51000.1` **(fake feed)**. [trade.side.sell] → [trade.amount] `0.0999` →
   [trade.submit] → Expect USDT `10,089.81`, BTC `0`. _Explain: "Selling pays the 0.1% fee in USDT: 0.0999 × 51,000 ×
   0.1% = 5.09."_ Live: fee = qty × bid × 0.001.
9. [account.tab `orderhistory`] → Expect two Filled MARKET rows, Commission `0.0001 BTC` and `5.0949 USDT`.
10. [trade.type.limit] → [trade.side.buy] → [trade.price] `49000` → [trade.amount] `0.1` → [trade.submit] → Expect a
    working order and USDT available down by `4,900`. _Explain: "A limit order waits for your price and reserves the
    money now."_
11. [orders.row.cancel] → Expect the `4,900` back.
12. Market buy 0.1 with [trade.exits.toggle] → [trade.tp.enable] `52000` and [trade.sl.enable] `48000` → Expect two
    working orders and BTC locked `0.0999`. _Explain: "Take-profit and stop-loss are one pair: when one fills, the
    other is cancelled."_
13. [assets.row.tpsl `BTC`] → Expect the TP / SL modal with the free quantity. [assets.row.sell `BTC`] → Expect the
    form switches to Sell with the free quantity filled in.
14. Try [trade.side.sell] `1` BTC → Expect "Balance insufficient (… available)". _Explain: "On Spot you can only sell
    what you own."_

## Stage 2 — Reading your account

### 4 — Panels, persistence, journal, sounds, Orders bench (4.1–4.16, 4.21–4.23)

**Manual check (M).** Whether the sounds are audible and distinct (4.14–4.16): M. Checklist per UI release touching
`TradingSoundContext.tsx`: place market / limit, hit a TP and an SL on the fake feed, mute and unmute, on Chrome and
Safari with the volume at 50%.

**UI reproduction** — signed in, `/dashboard/usdt/BTCUSDT`, one open position.

1. [symbolbar.symbol-picker] → ETH while on [trade.type.limit] → Expect the Limit tab stays, the price field shows
   ETH's price. _Explain: "Changing the symbol clears the form but keeps your order type."_
2. [trade.close-panel] then [symbolbar.trade-toggle] → Expect the form comes back exactly as you left it.
3. [account.collapse] then expand; [account.maximize] → Expect the chart area disappears and the panel fills the
   column; again → Expect the chart returns. _Explain: "Maximize the panel when you review your trades."_
4. [account.tab `journal`] → Expect newest entries first; the close entry has a green `+$X.XX` or red `-$X.XX` pill.
   [journal.add-note] → type a note → Expect it saved without a pill. _Explain: "The journal records every action;
   add your own notes on why you traded."_
5. [account.sound] → mute → place an order → Expect silence; unmute → Expect the double tick.
6. Place and cancel a limit order → [account.tab `orders`] → Expect the Cancelled row at 65% opacity with a clock
   icon; after 2 minutes (or a reload) it's gone from Orders and still in Order History.

### 7 — Order History tab (7.1.1–7.6.2)

**UI reproduction** — signed in, account reset, `/dashboard/usdt/BTCUSDT`, Isolated 10×. Fake feed:
`feed quote linear BTCUSDT bid=49999.9 ask=50000 mark=50000`.

1. [trade.type.market] → [trade.side.buy] → [trade.amount] `0.01` BTC → [trade.submit].
2. [account.tab `orderhistory`] → Expect 1 row MARKET / BUY / Filled (green); [orders.subtab `filled`] count 1,
   Cancelled and Rejected empty. _Explain: "Order History keeps every order you ever placed, whatever happened to
   it."_
3. [account.tab `orders`] → Expect the same row in Filled with a clock icon; the top badge shows no number.
   _Explain: "The Orders tab shows what is still working; finished orders stay for 2 minutes."_
4. [trade.type.limit] → [trade.price] `49000` → [trade.amount] `0.1` → [trade.submit];
   `feed path linear BTCUSDT 50000,49000` **(fake feed)** → Expect Order History: LIMIT, Fill Price `49,000`,
   Commission `0.98` with "0.02% maker". _Explain: "A resting limit order fills at its own price and pays the lower maker fee."_ Live: place the
   limit a few $ under the Buy price and wait; commission = qty × limit × 0.0002.
5. Place a stop sell far below, then [orders.row.cancel] → Expect STOP / Cancelled (muted).
6. [account.columns] → turn off Closing Time → Expect the column disappears; reload → Expect it stays off.

## Stage 3 — USDT Perpetual basics

All worked numbers use **long 0.1 BTC @ 50,000, Isolated 10×**: IM 500, open fee 2.75, fee to close 2.475 → balance
−505.225; close at bid 51,000 → close fee 2.805, +599.67 back, realized +94.445; liq 45,149.0 (45,148.99
rounded up to the 0.1 tick), bankruptcy 45,000.
Fake feed for all of them: `feed quote linear BTCUSDT bid=49999.9 ask=50000 mark=50000`.

### 1 — Market orders (1.1.1–1.7.13)

**UI reproduction** — local dev with the fake feed, signed in, account reset, `/dashboard/usdt/BTCUSDT`, **Isolated
10×** (see Conventions).

1. [nav.trade-menu] → USDT Perpetual → Expect `/dashboard/usdt/BTCUSDT` and the leverage chip `Isolated 10x`.
   _Explain: "USDT Perpetual lets you go long or short with leverage."_
2. [trade.side.buy] → [trade.type.market] → [trade.amount-unit `coin`] → [trade.amount] `0.1` → Expect
   [trade.preview.cost] ≈ `505.23` (margin 500 + fees) and [trade.preview.liq] `$45,158.1` with the ask at 50,010,
   `$45,149.0` at 50,000. _Explain: "At 10× you put up 500 USDT of margin for a 5,000 USDT position."_
3. [trade.submit] → Expect the amount clears and a LONG row: qty `0.100`, entry `50,000`, TP `—`, SL `—`. _Explain:
   "A market buy opens a long at the ask."_
4. Expect the available balance `9,494.78`. _Explain: "Margin plus the opening fee and the fee reserved to close are
   set aside."_ Live: 10,000 − qty × ask × (1/10 + 0.00055) − fee to close.
5. `feed quote linear BTCUSDT bid=51000 ask=51000.1 mark=51000` **(fake feed)** → Expect PnL `+100` (at mark
   51,000). [positions.row.close] → Expect the row gone, balance ≈ `10,094.45`, [account.tab `closedpnl`] ≈ `+94.45`.
   _Explain: "The profit is 100, minus 2.75 to open and 2.81 to close."_
6. [trade.side.sell] 0.1 → Expect a SHORT row; its PnL turns green when the price falls.
7. Buy with [trade.tp.enable] a price **below** the entry → Expect "Take-Profit must be above entry price for Long";
   [trade.sl.price] `5000` (a typo for 50,000) → Expect the blocking typo warning ([trade.sl-confirm]).
8. Devtools → Offline → Expect the Market button disabled.

Live prices: entry = the Buy price at the click; PnL uses the **mark** (Positions "Mark Price" column); tolerance =
one tick × qty.

### 2 — Limit orders (2.1.1–2.5.5)

**UI reproduction** — as Section 1 (fake feed, Isolated 10×).

1. [trade.type.limit] → Expect [trade.price] pre-filled just under the Buy price, no warning. _Explain: "A limit order
   sets the worst price you accept."_
2. [trade.price] `49000`, [trade.amount] `0.1`, [trade.exits.toggle] → [trade.tp.enable] `51000`,
   [trade.sl.enable] `47000` → [trade.submit] → Expect [account.tab `orders`] Working 1 (LIMIT BUY) and Inactive 2
   (TP, SL); available down by `495.12`. _Explain: "The TP and SL wait until the entry fills."_
3. [orders.row.cancel] on the SL row → Expect only the SL cancelled, balance unchanged. Re-add it via
   [orders.row.edit].
4. `feed path linear BTCUSDT 50000,49000` **(fake feed)** → Expect the parent Filled at `49,000` (maker `0.98`), TP
   and SL Working, a LONG row with both. Live: wait for the price to reach your limit.
5. `feed path linear BTCUSDT 49000,51000` → Expect the position closed by the TP, the SL row Cancelled with no
   commission, a green journal pill.
6. A limit buy **above** the Buy price → Expect the warning that it fills now at the ask as a taker.

### 3 — Stop orders (3.1.1–3.5.4)

**UI reproduction** — fake feed, Isolated 10×.

1. [trade.type.stop] → [trade.side.buy] → [trade.price] `50500` → [trade.amount] `0.1` → [trade.submit] → Expect
   Working: STOP / BUY. _Explain: "A stop buy waits for a breakout above the price, then buys at market."_
2. `feed quote linear BTCUSDT bid=50500 ask=50510 last=50500` **(fake feed)** → Expect a LONG filled at `50,510`
   (the ask, taker). _Explain: "When the stop triggers it becomes a market order, so it fills at the ask."_
3. A stop buy **below** the Buy price → Expect the "will fill immediately — Use a Limit Buy" warning.
4. Place a stop far away, [orders.row.cancel] → Expect the reserve refunded in full.

### 4.17–4.18 — Editing an order or a position's TP / SL

**UI reproduction** — one pending limit with TP / SL and one open position.

1. [orders.row.edit] (pencil) → [order-edit.price] +100 → [order-edit.confirm] → Expect a journal summary line with
   the old → new price and reserve. _Explain: "You can move a waiting order instead of cancelling it."_
2. [positions.row.edit-exits] → [pos-edit.tp] a new price → [pos-edit.confirm] → Expect the new TP in the row and two
   journal lines. Turn the SL off → Expect a Cancelled SL row in Order History.

### 14.5 — Per-symbol leverage

**UI reproduction.**

1. On ETHUSDT, [trade.leverage-chip] → [leverage.input] `5` → [leverage.confirm] → Expect the chip `… 5x`.
2. Switch to BTCUSDT → Expect BTC keeps its own leverage. _Explain: "Leverage is set per symbol, like on Bybit."_

### 14.2, 14.3, 14.4 — Fees, fill prices, size rules

**UI reproduction** — fake feed, Isolated 10×.

1. [trade.amount] `0.1` → Expect [trade.preview.fees] "taker 0.055% · maker 0.02%" and a cost that includes both fee
   estimates. _Explain: "Market orders pay the taker fee; resting limit orders pay the lower maker fee."_
2. Market buy → [account.tab `orderhistory`] → Expect commission `2.75` "0.055% taker".
3. [trade.amount] `0.0001` → [trade.submit] → Expect "Order quantity lower than the minimum (0.001)". [trade.price]
   `10000.05` on a limit → Expect "Order price decimal too long (tick size 0.1)".
4. `feed stall linear ms=15000` **(fake feed)** → market buy → Expect "Waiting for live price…".

### 15.2 — One-way mode

**UI reproduction.**

1. Buy 0.01 at 50,000, then `feed quote … ask=60000`, buy 0.005 → Expect **one** LONG row qty `0.015`, entry
   `53,333.33`, journal "Added to LONG …". _Explain: "One position per symbol: a second buy adds to it and averages
   the entry."_

## Stage 4 — Risk management

Worked position again: **long 0.1 BTC @ 50,000, Isolated 10×** — IM 500, fee to close 2.475, BTCUSDT tier-1 MMR
0.33% → liq **45,149.0**, bankruptcy **45,000** (the short mirror: **54,819.0**). Since PR #163 the liquidation
price is rounded to the 0.1 tick on the safe side (long up, short down), and IM includes margin added by hand.
The price-control endpoint is what makes this stage testable end to end: on live prices nobody waits for a 10% move.

### 15.1 — Mark price

**UI reproduction** — fake feed, the worked long open.

1. `feed quote linear BTCUSDT bid=50499.9 ask=50500 last=50500 mark=50000` **(fake feed)** → Expect
   [positions.row.mark] `50,000` and PnL `0.00`, although the last price is 50,500. _Explain: "Perpetual PnL uses the
   mark price — a fair price that one big trade can't move — so a spike can't liquidate you."_
2. [symbolbar.mark] and [symbolbar.index] → Expect MARK 50,000. Live: MARK and the last price differ by a few dollars.

### 15.3 — Liquidation and bankruptcy prices

**UI reproduction.**

1. `feed quote linear BTCUSDT bid=50009.9 ask=50010 mark=50010` → [trade.amount] `0.1` → Expect [trade.preview.liq]
   `$45,158.1` in amber with an ⓘ. _Explain: "If the mark price falls to this level, the position is closed and you
   lose its margin."_
2. Open it → Expect [positions.row.liq] ≈ `45,158` and the MMR meter.
3. Leverage 1× → Expect liq `—`. Live: liq ≈ entry × (1 − 1/leverage + MMR) for a long, rounded up to the
   tick (the form's number is the reference).

### 15.4 — Liquidation in the engine

**UI reproduction** — fake feed, worked long open. On live prices a liquidation can't be produced on demand; the
fake feed is the intended route (a tour explains the numbers instead — `docs/GUIDED_TRADE_MVP.md`).

1. `feed quote linear BTCUSDT bid=45100 ask=45100.1 mark=45140` **(fake feed)** → Expect the position disappears, the
   liquidation sound, [notice.liquidation]. _Explain: "The mark crossed the liquidation price, so the whole position
   closed at the bankruptcy price 45,000."_
2. [account.tab `closedpnl`] → Expect Exit Type "Liquidation", ≈ `−505.23`. _Explain: "You lose the margin (500), the
   fee to close (2.475) and the opening fee (2.75)."_
3. [account.tab `orderhistory`] → Expect a "Liquidation" row; the TP / SL were cancelled.

### 15.5 — Re-margining on a leverage change

**UI reproduction.**

1. With the worked long, [trade.leverage-chip] → [leverage.input] `5` → Expect [leverage.preview] "Position margin
   $500 → $1,000" and a lower liq price. _Explain: "Lower leverage puts more margin behind the position and moves the
   liquidation price away."_
2. [leverage.confirm] → Expect the row updated and the balance down `499.73`.
3. With too little balance → Expect "Insufficient available balance to change leverage …" inline.

### 15.6 — Chart lines

**Manual check (M).** 15.6.6 (ns-resize cursor, no chart pan while dragging, label legibility): M, per UI release
touching `useTradeLines.ts` / `TradeLineAmend.tsx`. Checklist: drag a TP line up and down on Chrome and Safari with a
mouse and a trackpad; Cancel restores it; Confirm moves it by whole ticks. A screen recording attached to the release
PR is the evidence.

**UI reproduction.**

1. Perp pane with the worked long + a limit order → Expect entry, TP / SL (dashed), Liq. (amber dashed), the order
   (dotted) and Mark lines.
2. Drag the TP line → Expect a Confirm / Cancel prompt; Confirm → the TP moves by whole ticks.
3. [chart.type-menu] → [chart.mark-line] → Expect the Mark line hides.

### 17.1 — Add / reduce margin (isolated)

**UI reproduction.**

1. Worked long, Isolated → [positions.row.adjust-margin] → [margin.mode `add`] → [margin.amount] `1000` → Expect
   [margin.preview] a new liq ≈ `35,110`. _Explain: "Adding margin pushes the liquidation price further away without
   changing the position size."_
2. [margin.confirm] → Expect the row's Liq. Price updated and the balance −1,000.
3. [margin.mode `reduce`] → Expect "Max reducible (margin you added)".

### 17.2 — Trigger source, reduce-only, TP / SL side

**UI reproduction.**

1. [trade.tp.source] → Mark → Expect the TP labelled "Mark". _Explain: "Choose which price triggers your TP / SL: Last
   (default), Mark or Index."_
2. [trade.reduce-only] with no position → Expect "Reduce-only needs an open position on this symbol to reduce".
3. [trade.type.stop] → Expect [trade.close-on-trigger] offered.
4. [positions.row.edit-exits] → SL below the liq price → Expect the amber warning ([pos-edit.warning]).

### 17.3 — Risk tiers

**UI reproduction.**

1. [trade.leverage-chip] → Expect tier, MMR and the max position value at the chosen leverage ([leverage.tier-info]).
   _Explain: "Bigger positions need more maintenance margin, so the maximum leverage falls as size grows."_
2. Hover the MMR meter in a Positions row → Expect the same tier.

### 17.4 — Closed P&L

**UI reproduction.**

1. Worked long; `feed quote linear BTCUSDT bid=51000 ask=51000.1 mark=51000` **(fake feed)**.
2. [trade.side.sell] → [trade.reduce-only] → [trade.amount] `0.05` → [trade.submit] → [account.tab `closedpnl`] →
   Expect a row qty `0.05`, `+47.22`; hover → PnL 50.00, open fee −1.375, close fee −1.4025. _Explain: "Closed P&L is
   what a close really made, after both fees and any funding."_ Live: closedPnl = (exit − entry) × qty − open fee ×
   share − qty × exit × 0.00055 − funding.

## Stage 5 — Advanced

### 16 — Funding

**UI reproduction** — fake feed, worked long open.

1. [symbolbar.funding] → Expect "0.0100% / 00:00:05" counting down (fake feed) — live: the current rate and the time to
   the next 00:00 / 08:00 / 16:00 UTC. _Explain: "Every 8 hours longs pay shorts (or the reverse when the rate is
   negative) to keep the perpetual close to spot."_
2. `feed funding BTCUSDT rate=0.0001 in=5` **(fake feed)**, wait 6 s → Expect [positions.row.funding] `−0.51`
   and a Balance History line. _Explain: "0.1 BTC × 51,000 × 0.01% = 0.51 USDT."_ Live: fee = qty × mark at the
   timestamp × rate.
3. Switch the pane to Spot → Expect no MARK / INDEX / FUNDING stats.

### 17.5 — Cross margin

**UI reproduction** — signed in as a **new** account (starts in Cross).

1. [trade.leverage-chip] → Expect `Cross 10x`; the modal shows **Cross | Isolated** tabs with an explainer. _Explain:
   "Cross shares your whole balance between positions; Isolated limits each position's loss to its own margin."_
2. Open the worked long → Expect [account.summary.mm-rate] and an estimated cross liq price; no Add margin pencil.
3. Switch to [leverage.mode `isolated`] with the position open → Expect the refusal listing the reasons.
4. Old account: Expect the one-time [notice.cross-margin] with "How it works" / "Switch to Cross".

### 11 — Multi-symbol PnL

**UI reproduction** — fake feed with BTC and ETH quotes (`feed quote linear ETHUSDT bid=2999.9 ask=3000 mark=3000`).

1. [layout.option `2h`]; pane 0 BTCUSDT, pane 1 ETHUSDT; click pane 0 → Expect the order form on BTCUSDT.
2. Buy 0.01 BTC; click pane 1; buy 0.1 ETH → Expect two Positions rows. _Explain: "You can hold positions in several
   symbols; each has its own row and PnL."_
3. Click pane 0; `feed quote linear ETHUSDT … mark=3100` **(fake feed)** → Expect the ETH row PnL `+10.00` although
   ETH isn't the active pane; [account.summary.upnl] = BTC PnL + 10.
4. [layout.option `1`] (BTC only); move ETH again → Expect the ETH row still updates.
5. [positions.row.close `linear:ETHUSDT`] → Expect a Closed P&L row for ETHUSDT.

### 10.4 — Sync options

**Manual check (M).** The feel of synced panning (lag, jitter) on a slow laptop: M, per release touching
`MultiChartArea.tsx` / `chartSync.ts`.

**UI reproduction.**

1. [layout.option `4`] → [layout.picker] → [layout.sync `symbol`] → Expect every pane shows the active pane's symbol.
   _Explain: "Sync Symbol keeps all panes on one coin, e.g. to compare timeframes."_
2. [layout.sync `interval`] off, change one pane's interval → Expect only it changes.
3. [layout.sync `crosshair`] → hover a pane → Expect the crosshair on all panes at the same time.
4. [layout.sync `timeRange`] → zoom one pane → Expect all follow.
5. Reload → Expect the toggles as you left them.

### 4.19–4.20 — Multi-pane TP / SL incidents

**UI reproduction:** not reproducible on purpose — the typo SL of 7,800 is now stopped by
the SL typo guard (1.7.11) and triggers run on the server per symbol. To see the guard: [trade.sl.price] `7800` on a
BTC order → Expect [trade.sl-confirm].

## Stage 6 — Under the hood (for testers)

These sections are not learning steps; their UI reproductions are tester
procedures.

### 12 — Market data per category

**UI / tester reproduction.**

1. `curl 'http://localhost:3001/api/market/instruments?category=linear' | jq '.[] | select(.symbol=="BTCUSDT")'` →
   Expect `tickSize 0.1`, `qtyStep 0.001`, `minOrderQty 0.001`, `minNotional 5`, `maxLeverage 150`,
   `fundingIntervalMin 480`.
2. `curl 'http://localhost:3001/api/market/candles?category=inverse&symbol=BTCUSDT&interval=1m'` → Expect 400.
3. `/dashboard/spot/BTC/USDT` → [trade.spread] a number; reload in a quiet market → Expect it at once.
4. `wscat -c 'ws://localhost:3001/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m'` → Expect `ticker`
   messages with `markPrice`, `fundingRate`, `nextFundingTime`.

### 13 — Server trading engine (24/7)

**Monitoring, not a test.** (Long real-time soak — the engine running days with live prices — is a monitoring
concern: the T5 scheduled check (every 6 h) plus the log alert.)

**Tester reproduction.** 1. Place a limit a few $ past the price, close the tab, wait for the price, reopen → Expect
the fill. 2. Local: stop the server (`Ctrl-C`), let the price cross, start it → Expect "Backfilling price gap" in the
log and one fill. 3. Two tabs side by side → act in one, Expect the other within ~1 s. 4. Leave the dashboard open 25
minutes, then trade → Expect it works.

### 14.7 — Migration (D7) and deploy safety

**Tester reproduction.** `pnpm --filter @crypto-dashboard/server test:int` against a throwaway Postgres (README
"Testing"); `migrationReplay.int.test.ts` replays every migration over `fixtures/pre-bp1.sql`.

### 6 — Price parity against Bybit

**Tester reproduction.** Open Bybit's BTCUSDT Perpetual page and `/dashboard/usdt/BTCUSDT` side by side: Sell / Buy
equal Bybit's best bid / ask or one tick apart; MARK and FUNDING equal; the countdown ends at the same time.

### 17.6 — Refinements and parity

**Tester reproduction** (fake feed): open the worked long, `feed funding BTCUSDT rate=0.0001 in=10`, close the position at second 5 → after the timestamp the fee lands on that close's Closed
P&L row (17.6.2); `feed stall linear ms=60000` across the timestamp → settled at the mark candle (17.6.1).

### 18 — Cross-phase regression suite

**Manual check (M).** None. **Tester reproduction:** these are engine interactions no UI shows directly; run
`pnpm --filter @crypto-dashboard/server test -- services liquidation funding` (T1) and
`pnpm --filter @crypto-dashboard/server test:int` (T2i, a throwaway Postgres). The
restart cases can be seen locally: open a position with a TP near the price, stop the server, let the fake feed cross
the TP, start it → one "Auto-closed" journal line.

### 19 — Account flows (19.9–19.12)

**Manual check (M).** Only in production, behind Fly's proxy: the real client IP. **Tester reproduction:**
`fly logs -a <app>` while opening the dashboard → connect / close lines carry `reqId`, `clientIp` (your IP, not a Fly
address), `userId` on the private WS, close code and duration; a forged `Fly-Client-IP` header from outside is
ignored.
