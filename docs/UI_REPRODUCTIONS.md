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

### 10.6 — Indicator panes and legends (10.6.1–10.6.13)

**Manual check (M).** How the panes share the height on a phone (375 px) and in the 4-chart layout, and whether the
overlay legend rows stay readable over the candles — M, eyeballed per UI release that touches
`components/indicators/` or `ChartPanel.tsx`.

**UI reproduction** — signed out is fine, `http://localhost:5173/chart`.

1. [indicator.menu] → [indicator.option `momentum`], twice → Expect two panes under the price pane, each with its
   own price scale and a dashed zero line, and a `Mom 10 close` header at its top-left. _Explain: "Each oscillator
   gets a pane of its own, so its scale never squashes another one."_
2. [indicator.menu] → [indicator.option `macd`], twice → Expect two more panes; each header reads
   `MACD 12 26 close 9 EMA EMA` then three values — histogram, MACD, signal — in their colours.
3. Move the mouse across the bars → Expect every header's values follow the bar under the crosshair; move it off the
   chart → Expect the newest bar's values. _Explain: "The legend reads the bar you point at."_
4. Hover the first MACD header → Expect ⚙, 👁 and ✕ to appear. [indicator.settings] → fast 5, Apply → Expect the line
   and the header (`MACD 5 26 …`) change at once, no reload.
5. [indicator.toggle] on a Momentum header → Expect its pane goes and its row waits, dimmed, under the price legend;
   click the eye there → Expect the pane comes back in the same place.
6. [indicator.remove] on the first MACD header → Expect its pane and header are gone. Reload → Expect the same panes.
7. Drag a pane separator → Expect the panes resize and every header stays at its pane's top. Add another indicator
   → Expect the drag is undone: the price pane at least half, the indicator panes all the same height.
8. [toolbar.tool `trend-lines`], click twice inside a Momentum pane → Expect nothing is drawn; click twice in the price
   pane → Expect a trend line, selected, and the toolbar back on the cursor.

### 10.7 — Drawing tools (10.7.1–10.7.22)

**UI reproduction** — `/chart`, no sign-in, 1m. The library is the fork in `apps/client/src/vendor/` (0.4.0).

1. [toolbar.tool `trend-lines`], click twice in the price pane → Expect the line while you move to the second point,
   then the line placed and selected (anchors shown) and the cursor tool active again. _Explain: "Like TradingView:
   one drawing, then back to the cursor."_
2. Same tool, double-click on one spot, then click elsewhere → Expect the line from the first spot to the second, none
   of zero length.
3. With a tool, click on the price axis → Expect nothing placed.
4. Drag an anchor of the line → Expect it moves and the chart doesn't scroll while you drag.
5. Right-click [toolbar.tool `annotations`] → [toolbar.subtool `text`], click in the price pane → Expect the editor;
   type, **Cancel** → Expect the old text ("Add text"); double-click the text, type, **Save** → Expect the new text;
   reload → Expect it is still there.
6. Switch the interval to 5m and back → Expect the drawings stay where they were in time.
7. Right-click [toolbar.tool `bin`] → [toolbar.subtool `eraser`], click a drawing → Expect it is gone; a locked one
   stays.
8. 2-chart layout, same or another symbol: select a drawing in each pane in turn, press Delete → Expect only the pane
   clicked last loses its drawing.
9. Click [toolbar.tool `stay-mode`] (pencil with a lock, above Remove) → Expect it turns purple, tooltip "Stay in drawing
   mode: on". Draw two trend lines in a row → Expect the tool stays armed after each, nothing selected; reload → Expect
   the switch still on. Click it again, draw a line → Expect back to the cursor with the line selected. _Explain:
   "TradingView's lock for drawing many lines without re-picking the tool."_
10. Draw two lines, drag one, then Ctrl/Cmd+Z three times and Ctrl/Cmd+Y → Expect the drag, then each line taken back
    one at a time, then put back. _Explain: "One undo per thing you did, as in TradingView."_
11. Select a line, Ctrl/Cmd+C, Ctrl/Cmd+V → Expect a copy a little right of and below it, selected.
12. Press Alt+H (⌥H on a Mac) → Expect the horizontal line tool armed and shown on the Trend Lines button; open
    [toolbar.tool `trend-lines`]'s caret → Expect "⌥H" / "Alt+H" dimmed on its row.
13. Click [toolbar.tool `magnet`]'s caret → Strong magnet; place a horizontal line near a candle → Expect it on the
    candle's open, high, low or close.
14. Click [toolbar.tool `bin`] → Expect "Remove N drawings", "Eraser"; pick Remove → Expect a confirm; Cancel → nothing
    removed; again → Remove → all gone; Ctrl/Cmd+Z → all back.
15. Select a line → Expect [drawing.toolbar] at the top of the chart: colour, width, style, settings, lock, remove,
    More. Pick red, 3px, dashed → Expect the line changes. Drag the toolbar by its handle, reload, select → Expect it
    where you left it.
16. Right-click the line → Expect Settings…, Clone, Copy, Bring to front, Send to back, Lock, Hide, Remove. Settings…
    → Expect Style and Coordinates tabs; tick Extend Right, Ok → Expect the line runs to the right edge.
17. Draw a Table, click it, click a cell → Expect a text field over the cell; type, Enter → Expect the text in the
    cell; click it again, type, Esc → Expect the old text.
18. Draw a Long Position, right-click it → Expect "Create limit order…" after Copy, in its own group (not on the
    line from step 16). Pick it → Expect the order form on Limit, Buy, the entry as the price, the target as TP, the
    stop as SL and the tool's qty in coins; nothing placed. Repeat with a Short Position → Expect Sell. On a phone,
    tap the position, More → Create limit order… → Expect the form sheet to open filled in, its Price field showing.
19. Signed in, draw a Long Position, Settings… → Expect Inputs first: account size = your balance, the symbol's
    leverage. Change the Profit level ticks → Expect its price to follow; switch Risk to USDT → Expect the same risk
    in USDT; Ok → Expect the box and the Qty label to follow. Style → untick Qty, tick Always show stats, Ok → Expect
    the stats without hovering, with no Qty.

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

### 14.1.11–14.1.15 — A visitor on `/chart`: trading needs an account

**UI reproduction** — start `http://localhost:5173/chart` (local dev) or `https://cryptopapertrade.com/chart`.
Preconditions: signed out (a private window).

1. Look at the order form and the Orders & Account panel → Expect both dimmed under "Paper trading needs a free
   account." and a **Sign in to trade** button; nothing under them reacts to clicks or Tab; no sync icon after the
   layout picker. _Explain: "Charts are free for everyone; trading needs a free account so your trades are saved."_
2. DevTools → delete a `[data-guide="lock.overlay"]` node, or remove `inert` from the panel → Expect the lock back at
   once. Network tab → Expect no `/api/paper` request. _(testers only)_
3. [nav.trade-menu] → USDT Perpetual → [lock.sign-in] → Expect `/login`. Sign in → Expect
   `/dashboard/usdt/BTCUSDT`, the panels usable. _Explain: "You come back to the market you were looking at."_
4. Hover the sync icon (cloud) after the layout picker → Expect a tooltip on the account sync and its state.
5. Phone width → Expect [trade.mobile.buy] / [trade.mobile.sell] dimmed and not tappable, with the account panel's
   one-row **Sign in to trade** just above them.

### Learning path — Lessons 1, 2 and 3, and the Blog (no Part B rows yet)

**UI reproduction** — a new account on `http://localhost:5173/dashboard/spot/BTC/USDT` (local dev; the history
charts need the real Bybit feed, the fake feed draws its own candles) or production. The content is
`apps/client/src/guide/lessons.ts`; the Blog's articles are `apps/client/src/blog/posts.ts`. The unit tests hold their rules.

1. [learn.card.start] → Expect **Lesson 1 · Up, down and your first trade**, screen 1 of 21 (rewritten 2026-11-16): the
   dark stage, the real photo of Laszlo Hanyecz with the two pizzas ([lesson.photo], credited "Photo: Laszlo
   Hanyecz", no guide), and the lines one by one ("22 May 2010 · Florida" … "Back then, those coins were worth about
   $41." … "Those same coins later passed $1 billion. Prices move. A lot."). [lesson.next] stays hidden until the
   last line is in, then shows full width as **Continue →** with one shine. Enter (or a tap on
   [lesson.beats]) during the reveal → every line at once, still on screen 1; reduced motion → every line at once,
   no shine (M). → **Meet your guides** (Pulin from the left, Berwyn from the right; "In the next 9 minutes you'll
   learn:" and three ✓ lines), then **Continue →**. On every card and question of Lessons 1–3 the main button
   says **Continue →** and the link under it **← Back**; the summary's button says **Finish lesson** (2026-11-17).
   No `**` or `*` shows anywhere: those words are bold or italic (**Buy**, **Sell**, **long** …).
   - Screens 3–4: **Up or down, you can win** (the picture on top, 2026-11-17: three panels, a green line that
     climbs "▲ up wins", a red one that slides "▼ down wins", a grey one sideways "≈ flat"), then **Buy and Sell** (the
     picture: a coin and a banknote, a green arrow "Buy: pay $, get coin" and a red one "Sell: hand coin, get $") with
     [lesson.practice `practice-buy`] **Try a
     buy on the real chart** → Expect the sheet to step aside, `/dashboard/spot/BTC/USDT`, the tour ring on the
     form's Buy (a phone: on the bottom bar's **Buy / Long**), Market, USDT, 100, Place; after the order → Expect
     **What just happened** (2026-11-17): the ring on the account panel's [account.tab `assets`], then on Bitcoin's
     [assets.row `BTC`] ("You paid $100; you hold a hair less (about $99.90 of Bitcoin)…", Avg cost "fee included") and
     its [assets.row.upnl `BTC`] ("…if you sold right now, before the selling fee."), the last bubble's button
     **Back to the lesson** → Expect
     the lesson back on screen 5. ✕ / Skip at any point → the lesson back on screen 5 as well.
   - Screens 5–6: **Quick check** (Choose buy or sell): the BTC chart frozen on 23 Oct 2023 under a dashed
     "Your plan" line at $31,000, the plan line under it, then Buy (green) and Sell (red) side by side. ← / → move
     between them. Pick Buy → Expect ✓ on Buy, "Right." and the Why (the plan, not the price), then the candles
     play on to 9 Nov with "What happened next (the plan doesn't depend on it)". Pick Sell instead → ✕, "Not
     quite." and the Why, Continue disabled, and [lesson.retry] **Try again** → the pick cleared and the chart
     frozen again; Buy then → Continue enabled. Screen 6: the 5 Aug 2024 exit at $58,000 ("Your exit line") → Sell.
   - Screens 7–13: **Going long** (practice-long on `/dashboard/usdt/BTCUSDT`, then **What just happened**:
     [account.tab `positions`], the [positions.row `linear:BTCUSDT`] row: "…Unrealized P&L moves with the Mark
     Price. It becomes real when you close the position with the ✕ (Close) at the end of the row.", **Back to the
     lesson**), **A real long** (spot candles since 2026-11-17: markers "Buy $27,500" 2 Oct 2023, "Sell $73,079" 13
     Mar 2024), **The result**: the text, then [lesson.math]: Pulin in round glasses says "Let's do the math.", six
     numbered steps ("1. Price rise 73,079 − 27,500 = 45,579" … "6. Keep 99.8% after fees $2,657 × 0.998 ≈ $2,652")
     and [lesson.math.answer] "➜ Bitcoin rose about 166%. After fees, your $1,000 became about **$2,652**: about
     **$1,652 profit**." (no hindsight line), **Close it to keep it** ("…the ✕ (Close) at the end of your position
     row."; the picture: "open: on paper" +$120? over a dashed wobble, **Close** →, "closed: real" +$120 framed in
     green with a lock), **Going short** (the picture: a price falling from "1. sell the borrowed game: $60" to "2. buy
     one back: $40, return it", the gap "you keep $20"): the text, then [lesson.analogy] Berwyn in glasses ("Think of it as borrowing. A friend
     lends you a $60 game…", ending "…you put up USDT as margin, the contract settles the difference in USDT, and
     while it's open you pay or receive a small funding fee."), no exchange between the guides, then practice-short on `/dashboard/usdt/ETHUSDT` (the
     form's Sell / Short, a phone's **Sell / Short**; then **What just happened** on [positions.row
     `linear:ETHUSDT`], "…close it with the ✕ (Close) at the end of the row."), **A real short** (10 Nov 2021 → 18 Jun 2022), **The catch**: Berwyn in glasses works out
     the 0.01 BTC short in five steps ($648.94 → $189.65, $459.29, 70.8%), "➜ Bitcoin fell about 71%…", then
     Berwyn's line "Now the catch: …" (no ceiling; the exchange closes a losing short before your margin runs out
     (liquidation), and that margin is lost).
   - Screen 14: **Quick check** (long, short or stay out) → "Stay out for now" is right; screen 15: **Your call**.
   - Screens 16–18: **The market never sleeps** (the picture: a moon, a week of day bars, the shop's filled only by
     day and empty on Sunday, crypto's full every day, "crypto: open 24/7"; Berwyn's line: [lesson.term `slippage`] is a button that opens
     its peek; Read more → _Price swings_, always open), **Smaller coins swing harder** (the SOL chart above the
     text, "−29%"; then Pulin's math: "182.57 − 129.70 = 52.87" … "29.0%"), **Big swings, big risks**
     ([lesson.term `rug-pull`]).
   - Screen 19: **Try it on the real screen** (on a phone too; "…buy a little Bitcoin on the live chart, then show
     you what changed in your account. Selling it is its own practice on the learning map.") → [lesson.try] → the
     buy tour, then its **What just happened** (the same three bubbles as the practice buy, the last one's button
     **Finish**), the lesson waiting through both → back on screen 20. No sell tour follows (2026-11-17).
   - Screen 20: **What you learned**: five lines, only the last with [lesson.recap] Read more, and the highlight
     "Decide when and why before you click." with no Read more. **Finish lesson** → screen 21, **Lesson 1 done**: the
     ribbon, the journal line, the rating, [lesson.teaser] "Next: where Bitcoin came from…", and
     [lesson.next-lesson] **Lesson 2: Money nobody controls** with "Finish for now". Signed in, either button → Expect
     the streak screen first ([lesson.streak]: the flame, "N-day streak" counting up, this week's dots, "Come back
     tomorrow to keep it going"), then [lesson.streak.continue] does what was pressed (M). A guest goes straight on.
2. Lesson 2 · **Money nobody controls** (rewritten 2026-11-16; a sneak peek card added 2026-11-22), 22 screens → Expect the cold open drawn, no photo
   and no guide: the Bitcoin mark and the beats ("3 January 2009 · The first block" … the Times headline … "Someone wrote it into the record on purpose. Why?"; it no longer announces the lesson, 2026-11-22), then **Continue →**. Then **What you will learn** (a numbered path of four stops: Why it exists, One ledger copied, Nodes and blocks, No one in charge, Berwyn pointing; then four numbered lines), then **From the price to the
   thing** (Pulin and Berwyn), **2008: trust broke**, **A paper, then a block**, **One record, many copies** (the dotted world map; [lesson.term `ledger`] → a peek with no
   "From" line; [lesson.term `node`] → "A computer that keeps a full copy…", no Read more: since 2026-11-18 a peek has
   no article behind it), **Sending bitcoin**, **Two checks, then a block**, **Sealed by hard
   work** (the picture, 2026-11-17: three blocks, Block 1's "pays 5 → 9" and its fingerprint changed, red, the links
   after it crossed out ✕, "change one: redo every block after"), **The hash links the chain** (the picture: three
   blocks, each one's "prev" the fingerprint of the block before, amber arrows, "# = a block's fingerprint").
   - Screen 10, **Quick check** (Drag and drop): numbered slots 1–5, the steps below. Tap a step → it's ringed
     ([lesson.step], aria-pressed); tap [lesson.slot `0`] → it lands there; tap a filled slot → it goes back. With a
     mouse, drag a step onto a slot. [lesson.check] stays off until all five are placed; then ✓ / ✕ per slot,
     "Right." / "Not quite." and the Why (sign, check, bundle, seal, share). Not quite → [lesson.retry] **Try
     again** empties every slot; Continue stays off until the order is right. ← Back off a wrong board and
     Continue again → the board empty, never showing the right order.
   - Screen 12, **Quick check** (Match boxes): two columns; tap [lesson.match-term `0`] then a meaning → both show
     ①; tap a paired box → the pair undone. [lesson.check] → ✓ / ✕ per pair and the Why; not quite →
     [lesson.retry] **Try again** undoes every pair (2026-11-17).
   - **No borders**, **Liquidity, briefly**, **Money that runs code**, **NFTs, briefly**, then **Your call** (one
     copy disagrees with thousands) → "The thousands of copies that agree" is right; then the features **Quick
     check** (Match boxes: Decentralized, Fixed supply, Open to check, Borderless).
   - Screen 19, **Try it** (any screen size): the blockchain piece in the sheet; [article.chain.change] → the later
     blocks break, [article.chain.reset] mends them; [lesson.try] Continue.
   - Screen 20, **Why Bitcoin exists**: four plain numbered lines, the first "Bitcoin was made so people
     can pay each other online without trusting a bank in the middle.", the last "No one is
     in charge: the network agrees." (no Read more since 2026-11-18), shown at once (no story, no Bitcoin
     mark: dropped 2026-11-17), and **Finish lesson** ready straight away. Screen 21: the close,
     [lesson.teaser] "Next: why prices swing so hard…", [lesson.next-lesson] **Lesson 3: News, swings and traps**.
3. The interactive pieces, now on the Blog (`/blog/bitcoin-network`) and as Lesson 2's Try it: in _Many notebooks, no Nora_, [article.gossip.send] → the
   dots light ring by ring (1, 8, 64), all at once with reduced motion; [article.balance.try] → "✗ Rejected by every
   node: 9 is more than 6."; [article.stamp.try `sofia`] → the amber stamp rises into the checker's outline, ✓;
   [`sam`] → ✗; [article.chain.change] → the later blocks break; [article.answer.tile `lose`] → its answer shown. In
   _Mailboxes and keys_ (now "practised in a later lesson on keys and custody"): [article.mailbox.step `2`] → the
   stamp seated, ✓; [article.scenario.try `phone`] → "✓ Type your recovery words…".
4. Lesson 3 · **News, swings and traps** (rewritten 2026-11-16; a sneak peek card added 2026-11-22), 22 screens → Expect the cold open **One Bitcoin for
   $8,200** (kept) and **Continue →**; **What you will learn** (a numbered path of four stops: Swings both ways, News and hype, Thin or deep, Check the coin, Pulin pointing; then four numbered lines); **Why so much?**; **Big swings, both ways** (May 2021, "as low as $28,800 on Bybit's perpetual chart", "It can swing up just as
   hard, often without warning, so no one can reliably time it.", then Berwyn's math in
   glasses, "42,900 − 28,800 = 14,100" … "32.9%", "➜ … about **33%**: a third.", Read more → `price-swings#size`); **News moves it, fast**; **Same news, either way** (the halving chart: "Halving"
   20 Apr 2024, "$58,299", "$71,437"); then **Your call**: the ETF chart stopping on 10 Jan 2024, answer → it plays on
   to 23 Jan, "−14.5%", and the Why names the halving.
   - Then **The power of hype** (Berwyn worried: a warning), **Thousands of deals, one candle**, **A market shock**
     (FTX: "FTX in trouble" 8 Nov 2022, "$15,892"; no math since 2026-11-17: the text gives the 23%), **A plan beats panic**, **Up, then down**
     ("$63,588" 13 Apr 2021, "$29,765" 20 Jul; Berwyn's math, "53.2%"), **Thin or deep** (Read more → `exchange-price#liquidity`), **The $8,200 moment**,
     **Bitcoin is deep**.
   - **Quick check** (Match boxes: four situations to what usually happens), **A rug pull** (worried, no named
     token), **Check before you trust** (Read more → `spot-a-scam#checklist`), **Quick check** (Drag and drop: a rug
     pull's five steps in order).
   - Desktop: **Try it** → [lesson.try] Show me → the primer's three tasks, then the summary. A phone gets Continue
     and "needs a larger screen" (the primer's hover steps).
   - **What moves a price**: four plain lines and "Your plan decides, not the headline."; the close with no
     teaser and one button, [lesson.finish] **Finish lesson** (2026-11-17; the map's practice stops, buy then sell, come next).
5. [nav.learn] (the Route icon beside the avatar) → Expect two tabs, **Path** and **Habits** (the old Library tab
   went to the Blog on 2026-11-18); [path.tab `habits`] → the habit badges. Open the Blog at `/blog` (the header's
   [nav.blog]) → Expect nine cards ([blog.card]), each with its reading time; [blog.card `exchange-price`] → the article
   in a readable column with [blog.back] "← Blog", the sources folded, two [blog.more] cards.
   On the article page, in **When the queue runs thin**, [article.queue.size] to 10 → Expect the thin queue down to 90; [article.queue.limit]
   → Expect "6 wait unsold". In _Candles, news and big swings_, [article.candle.next] ×5 → Expect "▲ Closed higher…
   green"; [article.swing.size `1000`] → Expect "$1,000.00 became $671.30 at the low: −$328.70 (−32.9%)". In
   _Check before you trust_, the red-flag sorter → Expect a Why after every pick and "3 red flags…" once all six are in.

**Manual check (M).** The pictures and the guides' faces at 375, 412, 820 and 1440 px (nothing clipped, the
presenter never over the scene); every picture above its card's text; the guides' round glasses on the math and
the analogy, and the math's steps (a sum wraps under its label on a narrow phone, never a sideways scroll). Frequency: per release touching `guide/LessonArt.tsx`, `guide/art/` or the lessons.

### Learning path — Chapter 2, Lesson 5 "Coins and tokens: who has their own road" (no Part B rows yet)

**UI reproduction** — as for Lessons 1–3 (a new account on `http://localhost:5173/dashboard/spot/BTC/USDT`, local dev with the real
Bybit feed for the LINK charts). Pass chapter 1's checkpoint first, or open the map's chapter 2 after testing out.

1. Open the map ([nav.learn]) → Expect chapter 2 **Your crypto toolbox: coins, wallets and the networks behind them**: the
   lessons **Coins and tokens: who has their own road** and **Stablecoins: the coins that try to sit still** (open after the
   checkpoint, one after the other), then three lesson titles and a checkpoint title as grey "coming soon" stops that can't be focused.
2. [learn.card.start] the lesson → Expect screen 1 of 18, **What you will learn**: a numbered path of four stops (Coin or token, Token kinds, Altcoins and swings, Check fast gains), Pulin pointing, and four numbered lines (since 2026-11-22; it was the guides' chat). Continue → **A coin has its own road** (a coin on a road, a signpost "Its blockchain"; the
   word _coin_ is a tappable term opening a peek), **The road needs upkeep** (a coin at a toll booth, "paid in the coin"),
   **The coins in our market** (eight purple ticker badges BTC ETH SOL BNB XRP ADA AVAX DOGE; LINK in an amber ring, "a token").
3. **What does a coin have?** (Pick the right ones, six tiles): pick the three right ones (**Its own blockchain**, **Pays for its
   road's upkeep**, **Pays the people who keep the road running**) → Check → "Right." Picking a wrong tile → ✕ on it, "Not quite.",
   Try again.
4. **A token uses a road that exists** (Berwyn in glasses, "Think of it as a shop built along an existing road…"), **A token you
   can trade here** (LINK's daily candles), the three jobs (**utility** arcade credits, **security** a share certificate,
   **governance** a vote), then **Match each token to its job** (Match boxes, three pairs).
5. **Altcoins** (a steady green line and a swinging red one), **Two assets, one week** (LINK's candles 29 Jul to 5 Aug 2024 with
   "$13.524" and "−29.9%"; Pulin's six numbered steps ending "LINK fell more than bitcoin. One week is only one example.").
6. **What is LINK?** → **A token**. **Who pays the fee?** → **In ETH, the road's own coin**. **Your call** (a hand-and-coins
   picture) → **Find out who made it and what it is for** (the praised answer); the other two answers give "Not quite." and a
   Why. Then the summary ("Coins and tokens", four points and "You can now…"), the journal line, the rating.
7. Phone (390 px): no sideways scroll; the badges and roads sit inside the picture box.

### Learning path — Chapter 2, Lesson 6 "Stablecoins: the coins that try to sit still" (no Part B rows yet)

**UI reproduction** — as for Lesson 5 (a new account, chapter 1 passed, Lesson 5 done: Lesson 6 opens after it). Local dev with the
real feed for the practice buy.

1. Open the map → Expect Lesson 6 next after Lesson 5. [learn.card.start] it → Expect screen 1 of 17, **What you will learn**: a numbered path of four stops (Steady coins, Three kinds, Park and pay, Not a promise), Berwyn pointing, and four numbered lines (since 2026-11-22).
2. **The steady coin** (a line on a dashed $1.00, the word _stablecoin_ a tappable term), **A ticket for a dollar** (a dollar
   becoming a ticket at a cloakroom counter; Berwyn in glasses: "Think of it as a cloakroom ticket…").
3. The three kinds, one counter each: **Kind 1: dollar-backed** (a vault of money), **Kind 2: crypto-backed** (a vault of coins),
   **Kind 3: rule-based** (an empty shelf and a note), then **What stands behind the ticket?** (Match boxes, three pairs).
4. **Why traders keep them** (a **BTC / USDT** tag with USDT lit up) → the button **Try a buy, paid in USDT, on the real chart** starts the
   spot buy tour; the lesson comes back on the next screen after the review ("Back to the lesson"). **Skip** moves on.
5. **Park your profit** (Pulin in glasses, three numbered steps: 300 − 200 = 100, 100 ÷ 200 = 0.5, 0.5 × 100 = 50%), then
   **Parking a profit, in order** (Drag and drop, four steps: gone up, sold for USDT, price moves, USDT steady).
6. **The catch: the peg can slip** (a drawn line dipping from the $1.00 peg to about $0.87 and back, labelled "drawn example"),
   **"Stable" is a goal** (a vault under a magnifying glass), **A stablecoin at $0.92** → **People doubt it is fully backed**,
   **A key advantage** → **Its value stays steady while you wait for your next move**. **Your call** (a ticket with "+20% a year")
   → **What stands behind it, and who checks** (the praised answer). Then the summary, the journal line and the rating.
7. Phone (390 px): no sideways scroll; the counters and vaults sit inside the picture box.

### Learning path — Chapter 2, Lesson 7 "Your wallet, your keys: who holds them?" (no Part B rows yet)

**UI reproduction** — as for Lesson 6 (a new account, chapter 1 passed, Lessons 5 and 6 done: Lesson 7 opens after them). No practice
trade: nothing here starts a tour.

1. Open the map → Expect Lesson 7 next after Lesson 6, and "Why sending crypto costs a fee" still a locked "coming soon" stop.
   [learn.card.start] it → Expect screen 1 of 25, **What you will learn**: a numbered path of four stops (Keys not coins, Who holds the key, Recovery phrase, Hot and cold), Pulin pointing, and four numbered lines.
2. **A wallet holds keys, not coins** (a key ring beside mailboxes; the word _wallet_ a tappable term; Berwyn in glasses: "Think of it
   as a key ring…"), **Address and private key** (an address panel and a private key panel), **Who is who?** (Match boxes, four pairs).
3. **What a wallet is for** (see, receive, sign), **Mira and Sneaky Sam** (Sam behind glass: 2 BTC and a lock), **The phone in the sea**.
4. **Custodial** (a bank holding the key; analogy "a bank account"), **The trade-off** (a locked counter: withdrawals frozen; FTX),
   **Non-custodial**, **Control, privacy, no reset button**. Then **Your call** (two people forgot their login) → **Only the exchange
   user**.
5. **The recovery phrase** (twelve numbered slots, no words), **Three rules for the phrase** (a camera, a cloud and an envelope crossed
   out; the guide looks worried), **Where would you keep it?** (Pick, six tiles, pick three: the paper in a locked drawer, the metal in
   a safe, a second paper copy in a different safe place), **Setting up safely, in order** (Drag and drop, five steps).
6. **Hot wallets** (a phone with signal bars, tagged _online_), **Cold wallets** (a generic hardware wallet with a screen and two
   buttons, tagged _offline_; a tappable _hardware wallet_ term), **Which wallet for which job?** (Match boxes, three pairs), **Lena**
   → **A hardware wallet, with the recovery phrase written on paper**, **Zoe** → **An exchange account holding only what she trades**,
   **A purse and a safe**.
7. The phrase check (a "wallet support" asking for 12 words) → **Never share them: no real support asks**. Then the summary, the
   journal line and the rating.
8. After three wrong tries on any question the right answer is shown. Phone (390 px): no sideways scroll; the pictures and tags sit
   inside the picture box.

### Learning path — Chapter 2, Lesson 8 "Why sending crypto costs a fee" (no Part B rows yet)

**UI reproduction** — as for Lesson 7 (a new account, chapter 1 passed, Lessons 5 to 7 done: Lesson 8 opens after them). No practice trade.

1. Open the map → Expect Lesson 8 next after Lesson 7, and "Trading without a middleman: DApps and pools" still a locked "coming soon" stop.
   [learn.card.start] it → Expect screen 1 of 20, **What you will learn**: a numbered path of four stops (Send to confirmed, Why fees move, A real fee spike, Check the fee), Berwyn pointing, and four numbered lines.
2. **Sending has a price** (coins to a mailbox with a "+ fee" tag; the words _network fee_ a tappable term), **A block is a bus** (a bus
   with six seats, five taken; Berwyn in glasses: "Think of it as a bus with limited seats…"), **Who picks the passengers?** (payments
   in line, each with a "high", "mid" or "low" fee; the words _validator_ and _miners_ tappable), **From send to confirmed** (Drag and
   drop, four steps).
3. **Why a fee exists** (the toll booth again), **Why the fee moves** (five rising bars, "quiet" to "busy"), **Who is who?** (Match boxes,
   four pairs).
4. **A real fee spike** (a line: early April ≈ $4, 20 Apr ≈ $128, 21 Apr ≈ $35, "drawn from reported averages"), **Is it worth it?**
   (Pulin in glasses, four steps: 4 ÷ 200 = 0.02, 0.02 × 100 = 2%, 128 ÷ 200 = 0.64, 0.64 × 100 = 64%).
5. **Cheap chains and pricey chains** (two panels), **A plain send or a swap** (a plain send beside a swap), **What makes a fee higher?**
   (Pick, six tiles, pick three: many people sending, a swap or complex action, asking to be faster), **Busy days** → **Seats in a block are
   limited, so people offer more to get one**.
6. **Plan before you send** (a $40 send with a $12 fee and a magnifying glass), then **Your call** → **Check whether waiting, or a cheaper
   chain, would cost less**. **Two different fees**, **Which costs the most?** → **A swap, sent in a busy hour**. Then the
   summary, the journal line and the rating.
7. After three wrong tries on any question the right answer is shown. Phone (390 px): no sideways scroll; the pictures sit inside
   the picture box.

### Learning path — the learning map (no Part B rows yet)

**UI reproduction** — a new account on `http://localhost:5173/dashboard/spot/BTC/USDT`. The map is
`apps/client/src/learn/path.ts` (rules) and `learn/PathDrawer.tsx`; the checkpoint is `learn/checkpoints.ts`.

1. Look at the top bar → Expect the Route icon left of the avatar with an amber dot; the user menu has Settings and
   Sign out but no Learn.
2. [nav.learn] → Expect **Crypto trading path** at 0 %, the legend (book = Lesson, dumbbell = Practice on the real
   chart), chapter 1 "Start here: crypto and trading basics" in purple with "0 of 6 done", the zig-zag with
   **Start** and Pulin over Lesson 1, padlocks on the next four stops, a dumbbell on Lesson 3, "Buy your first coin" and
   "Sell it and read the result", no "Hands-on" tag or badge anywhere, the crown open, and chapter 2 "Trade with a plan" greyed with "Coming soon" and dashed stops
   nobody can tab to. Close and reopen → Expect no dot.
   Open Lesson 1 to its sixth screen, close it, reload → Expect a ring about half round Lesson 1 (read back from the
   server) and **Continue**.
3. Tap [path.node `lesson:lesson-ownership`] → Expect "Finish “Up, down and your first trade” first." and no lesson.
   [path.chapter.info `ch1`] → Expect the seven stops with minutes and "What you’ll learn" (each lesson's summary lines).
4. [path.node `lesson:lesson-01`] → finish the lesson → reopen → Expect it ticked, 14 %, **Continue** on Lesson 2,
   and the dot back on the Route icon before reopening.
5. [path.test-out] → answer two wrong, eight right → Expect "Checkpoint passed · 8 of 10 right";
   [checkpoint.done] → Expect the map with the crown ticked and the rest of chapter 1 open but not ticked, except
   "Sell it and read the result": still a padlock until "Buy your first coin" is done (2026-11-17).
6. A fresh account with Lessons 1–3 done: **Start** on "Buy your first coin" and a padlock on "Sell it and read the
   result"; [path.node `tour:sell-and-review`] → Expect "Finish “Buy your first coin” first." and no tour (2026-11-17:
   Sell needs Buy done, even when Buy was skipped or the chapter tested out).
   [path.node `tour:buy-first-coin`] (a phone too) → Expect the buy steps (a phone: **Buy / Long**, then Market, USDT,
   100, Place; a larger screen: the form's Buy, then the same), the Place bubble ending "…until you close it by
   selling. Next, a quick look at where it shows up."; then **What just happened**: [account.tab `assets`],
   [assets.row `BTC`] (the fee in the coin, Avg cost), [assets.row.upnl `BTC`] with **Finish** → Expect the tour
   closed (no sell tour), the stop ticked and **Start** on "Sell it and read the result".
7. [path.node `tour:sell-and-review`] → [account.tab `assets`] → [assets.row.sell `BTC`] → Place (the bubble ends
   "Next, a look at what changed.") → Expect **What just happened** in four bubbles: [assets.row `USDT`] ("Your Bitcoin
   row is gone…"), [account.tab `orderhistory`], the top [order-history.row] (Side, Type, Qty, Fill Price, Status),
   its [order-history.row.commission] (0.1% in USDT; the buy's in Bitcoin), the last button **Next →**; then **Your
   result** in five: [account.summary.realized-pnl] ("…fees included… it's real"), [account.tab `balancehistory`], the
   top [balance-history.row] (Balance Before, Balance After, Realized P&L, Action), the fees card **One quick
   question**, and **Check yourself** → **Finish** → Expect the tour closed and the stop ticked.
   With no Bitcoin held (sold from Assets first, or the tour started from a failed checkpoint's **Review**): the
   second bubble shows "Open the Assets tab to find your Bitcoin. None there? You need some to sell: do “Buy your
   first coin” on the learning map first, then come back to this lesson." and no ring.
8. A failed checkpoint (seven right or fewer) → Expect "Not yet", a **Review Lesson N →** per missed question (a tour's
   only on a larger screen), **Back to the path** full width and **Try again** under it.

**Manual check (M).** The landing and features pages (rewrite, 2026-11-22), signed out, at 375, 412, 820 and 1440 px, no
sideways scroll at any width:

1. `/` → Expect one h1 ("Learn crypto trading. Practise on a real chart."), then two path cards side by side from 768 px (stacked
   below): [landing.hero.chart] → `/chart`, [landing.hero.register] → `/register`; the candles draw themselves once behind the
   headline, then the last one breathes.
2. Under the cards, "Questions every beginner asks": Tab to a question, Enter or Space opens it, Up / Down / Home / End move between
   questions; each answer ends in a [landing.faq.start] "Start here" link. Expect a visible focus ring on each.
3. The coin ribbon slides slowly and pauses on hover; with the system's reduced-motion setting on, the candles are drawn still and
   the ribbon is a still, wrapped row.
4. Scroll down: the timeline (8 steps), "Learn it. Then try it on real candles." (six lesson cards load as they near the screen; a
   row you swipe on a phone), three screenshots in frames, six "where we do better" sections, and the table. The table scrolls inside
   its own box on a phone with the feature column pinned; every cell is a tick, a tilde or a cross with a word for screen readers; the
   three "small on purpose" rows show our crosses; the competitor columns carry blurred shapes, never a logo.
5. `/how-it-works` → h1 "How cryptopapertrade.com works", the sticky anchor nav from 768 px (each link scrolls to its section, the
   heading clear of the bars), eight numbered sections, the questions as an accordion (live), and the links to `/blog`, `/register` and
   `/chart`; no sideways scroll at 375 px. `/features` no longer exists (it lands on the landing page).
   **Visual sections (2026-11-24):**
   - **Why** is a vertical slider of five slides, each on its own colour with a phone beside three short bullets. The mouse wheel, a
     mouse drag up or down, a swipe, the arrows, the dots and Up / Down / Home / End change the slide. On the first slide scrolling up,
     and on the last scrolling down, the page scrolls on; a pinch or a Ctrl + wheel zooms the page. Below 900 px the phone stands under
     the words.
   - **One picture** has two post-its with arrows (side by side from 900 px, under the picture on a phone).
   - **Tours** are five muted looping clips, one per tab: each zooms in on its clicks, then back out (none with reduced motion). The
     clips are loaded only near the screen and paused off it (a play button under reduced motion).
   - **Behind the scenes** is the four-layer blueprint: logo tiles float on each layer, and the "Saves and reads" and "Prices come in"
     roads animate (the price road streams upward).
   - **On the chart** has six two-faced cards (hover or keyboard focus turns one over; a tap on a touch screen), then the coin ribbon
     and the pretend-money panel with the reset post-it ("You lose" and "You keep").
   - **What it is not** has four cards with a red stop sign. The word list follows. There is no recap and no "Check yourself" section:
     those questions are in "Quick answers" (live); before launch that section is titled "Check yourself" and holds only them.
   - The page ends on the e-mail sign-up (also when live). No candle, three-words or flows sections.
     **Crypto path (a check):** Product ▾ → Crypto path signed in opens the dashboard with the learning map open at the side (a full
     screen sheet on a phone); signed out it goes to the login page and, after signing in, lands on the same place.
     **Lesson carousel (a check):** the eight lessons are a carousel: one card on a phone, two from 768 px, three from 1100 px, with left and right
     arrows (they stay focusable at an end), a dot for each lesson, and a swipe or the arrow keys on the row. A card opens the Crypto path
     (see above). With the network offline before the row nears the screen, the section shows "The lesson previews did not load. Refresh
     the page to try again." (announced politely) and no gap. The landing page keeps the grid of previews.
6. With `VITE_IS_LIVE=false` the landing page is the Launching Soon hero, the coin ribbon and the newsletter form: no sign-up, chart,
   questions or table.

**Manual check (M).** The public header (2026-11-18): on `/`, `/how-it-works`, `/blog` and `/about` at 1440 px [nav.product]
opens Chart and Crypto path ([nav.how] sits between Product and Blog) (Esc closes it and the focus returns); [nav.blog], [nav.about] and [nav.support] link to
their pages, the current one underlined; at 375 px [nav.menu] opens a full-width sheet of 44 px rows with Product
expanding. `/about` and `/support` say "Coming soon." and are not indexed. The map at 375, 412, 820 and 1440 px: the zig-zag inside the drawer, the sticky chapter band,
the bubble, Pulin and a progress ring never clipped. The Buy and Sell lessons' bubbles at 375 and 1440 px: each ring on its row or column, never under the
bubble (2026-11-17). Frequency: per release touching `learn/Path*`, `learn/CheckpointSheet.tsx` or `guide/tours.ts`.

### Report a bug (2026-11-25)

**Manual check (M).** Signed in, on `/chart` or `/dashboard`: a bug icon [nav.report] sits in the top bar beside the learning-path icon
(signed out there is no icon). It opens "Found a bug?": a card under the top bar from 640 px, a sheet from the bottom on a phone
(375 and 412 px: nothing clipped, the keyboard does not hide Submit). Check, in order:

1. The e-mail is the account's own, shown read only (a dashed field, not editable) with "We will write to this address if we need more detail."; the cursor is in the description. "Sent with it:" names the page, the chart's
   symbol and interval, and, inside a lesson, its screen.
2. Submit with a description under 10 characters: a red line under it, nothing is sent.
3. [report.screenshot] picks up to three PNG, JPEG or WebP files, and a screenshot on the clipboard pastes in with Ctrl + V (⌘ V on a Mac) from
   anywhere in the panel, with the same limits (text pasted into a field still pastes as text) (a fourth is refused with "Three screenshots at most."; a GIF is refused
   in words); the chip shows the count and its x removes them all.
4. Submit: "Thanks, we got your report." and the owner's mailbox gets "[Bug report] ..." with Reply-To set to the account's own address (the request carries none), the
   screenshots attached as `screenshot-N.jpg`, and the context table. With the API offline: "Could not send the report. Check your
   connection and try again.", and what was typed is still there (close and reopen the panel to see).
5. The same icon is in the header of a lesson [lesson.report], a checkpoint [checkpoint.report] and the learning map [path.report]. Open
   it from a lesson: the report names that lesson and screen; Esc closes only the panel (the lesson stays open) and the focus returns
   to the icon. Tab stays inside the panel.
6. Limits: one account may send 3 reports in 10 minutes and 5 a day (then "Too many reports. Try again in a while."), and the site as a
   whole 8 an hour and 20 a day, so reports never use up the e-mail quota that sign-up and reset mail share. An account that has
   not verified its e-mail is told to verify it first. The subject of the e-mail the owner gets is "[Bug report] from" the account's own
   address, read from the database.

Frequency: per release touching `components/report/`, `routes/reports/` or `EmailService`.

### PWA — install, the notch and home bar, offline (no Part B rows yet)

**Automated:** `apps/e2e/tests-prod/pwa.spec.ts` runs in the production smoke (the only build with the service worker):
the manifest is installable under **CryptoPaperTrade** (standalone, 192 and 512 px icons, the iOS title tag), the
service worker takes control, and an offline reload still opens the app with the offline notice. Unit tests:
`PWAInstallBanner.test` (the steps for each browser), `session.test` (an offline launch keeps the session).

**Manual check (M), on real devices** after a release touching `vite.config.ts` (the manifest), `index.html`,
`PWAInstallBanner.tsx`, `lib/session.ts` or the layouts' safe-area padding:

| Device and browser                 | Expect                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone, Safari                     | The banner's steps (Share at the bottom). Add to Home Screen offers **CryptoPaperTrade** with the CPT icon. The installed app opens full screen; the top bar sits below the notch / Dynamic Island, the Buy / Sell bar above the home bar; focusing Amount doesn't zoom the page; the decimal keypad shows. |
| iPhone, Chrome / Firefox / Edge    | The same steps, with the Share button where that browser keeps it (Chrome: right of the address bar; Firefox: ☰ menu). No "open in Safari".                                                                                                                                                                |
| iPad, Safari                       | Share in the top-right toolbar; landscape keeps the side insets.                                                                                                                                                                                                                                            |
| Android, Chrome / Samsung Internet | **Install** opens the native dialog; the app lands in the drawer as CryptoPaperTrade; the icon isn't cropped.                                                                                                                                                                                               |
| Android, Firefox                   | The banner's menu steps (⋮ → Install).                                                                                                                                                                                                                                                                      |
| Any, the installed app offline     | Signed in, turn on airplane mode, reopen: a spinner with "You're offline. You'll be signed back in as soon as you're online." (never /login); back online → the dashboard. The offline notice sits above the Buy / Sell bar and the cookie banner.                                                          |

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
concern: the T5 scheduled check (every 8 h) plus the error digest by email.)

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
