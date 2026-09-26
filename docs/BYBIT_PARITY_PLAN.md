# Bybit Parity Plan — Spot + USDT Perpetual

> **Status:** BP-0 implemented (2026-09-26, `feat/bybit-parity-bp0`) · BP-1 implemented (2026-09-26, `feat/bybit-parity-bp1`) · BP-2 implemented (2026-09-26, `feat/bybit-parity-bp2`) · BP-3 … BP-5 not started.
> **Created:** 2026-09-25 · **Owner:** Mannar Hielal
> **Goal:** paper trading on cryptopapertrade.com behaves as close as possible to a Bybit Unified Trading
> Account (UTA), VIP 0, one-way position mode — so what a user learns here transfers 1:1 to Bybit.
> **Related:** `docs/APP_LOG.md` (roadmap entry), `docs/TRADING_TEST_PLAN.md` (to be updated after this
> plan is agreed), `.claude/skills/paper-trading-logic`, `.claude/skills/api-best-practices`,
> `.claude/skills/bybit-trading-systems-architecture`.
>
> Phases are numbered **BP-0 … BP-5** so they don't collide with the roadmap's Phase 5 (live Bybit) and
> Phase 6 (AI bot) in `APP_LOG.md`.

---

## 1. Agreed decisions (2026-09-25)

| #   | Decision                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Two markets, like Bybit: **Spot** (1×, no leverage) and **USDT Perpetual** (leverage, long + short).                                                                                                                                                                 |
| D2  | **Spot works like a normal spot market**: buy coins with USDT, sell only coins you hold. No shorting.                                                                                                                                                                |
| D3  | Today's behaviour (leverage, long/short, netting) becomes the **USDT Perpetual** market, using Bybit's own naming.                                                                                                                                                   |
| D4  | Use **Bybit's real fees** (VIP 0) and drop the flat 0.07% `COMMISSION_RATE`.                                                                                                                                                                                         |
| D5  | Order of work: data foundation → **server trading engine** → market split + fees + fill prices → mark price + isolated liquidation → funding → cross margin and refinements (§4).                                                                                    |
| D6  | Data feeds, fill prices and fee rules follow Bybit as closely as possible. Where we deliberately differ, the gap is written down (§8).                                                                                                                               |
| D7  | **New users start on Spot.** Existing users' positions migrate to USDT Perpetual.                                                                                                                                                                                    |
| D8  | **One shared USDT wallet** for Spot and Perpetual, as in Bybit's Unified Trading Account.                                                                                                                                                                            |
| D9  | **The server executes all trades and checks them 24/7** (option B). The browser sends order _requests_ and displays the state the server sends back, the way Bybit's own app works. Replaces "client is source of truth" (`APP_LOG.md`, Paper Trading Phase 3 Sync). |

### Naming ("labelled as Bybit")

Use Bybit's own product names rather than the Bybit brand:

- Market switch: **Spot** | **USDT Perpetual** — a header **Trade ▾** menu (Bybit's header pattern) plus the same
  switch as tabs at the top of the trading panel. Changed in BP-2 from "Spot | Derivatives": we offer one derivative,
  and "Futures" would be wrong (no dated futures).
- Market URLs follow Bybit's scheme under `/dashboard`: `/dashboard/spot/BTC/USDT`, `/dashboard/usdt/BTCUSDT`.
- Symbol display in perps mode: `BTCUSDT` + a small **Perpetual** tag (Bybit's convention; TradingView shows the same
  instrument as `BYBIT:BTCUSDT.P`).
- Keep the existing "market data: Bybit" attribution. Don't call the mode "Bybit Perps" or use Bybit's logo: that suggests
  an affiliation, and the Legal & Compliance section of `APP_LOG.md` only covers use of Bybit's public API.

---

## 2. Bybit reference values (verify before each phase ships — Bybit changes these)

| Item                            | Spot                                                                          | USDT Perpetual (linear)                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Fee — taker / maker (VIP 0)     | 0.1% / 0.1%                                                                   | 0.055% / 0.02%                                                                                   |
| Fee charged in                  | Asset received (buy → base coin, sell → USDT) — verify                        | USDT (settlement coin)                                                                           |
| Fee base                        | fill qty × fill price                                                         | fill qty × fill price (position value)                                                           |
| Leverage                        | 1× (spot margin not offered here)                                             | Per symbol, one-way mode; Bybit max ≥ 25× for all 9 symbols — **we cap at 10×** (`MAX_LEVERAGE`) |
| Short selling                   | ❌                                                                            | ✅                                                                                               |
| Price that triggers TP/SL/stops | Last price                                                                    | Last price by default (Mark / Index selectable on Bybit)                                         |
| Price for unrealised PnL        | Last price vs average cost                                                    | **Mark price**                                                                                   |
| Liquidation trigger             | n/a                                                                           | **Mark price** reaches liquidation price → settled at **bankruptcy price**                       |
| Funding                         | n/a                                                                           | Every `fundingIntervalHour` (8 h for most; 1/2/4 h for some): `qty × markPrice × fundingRate`    |
| Precision / min size            | `instruments-info?category=spot` (`basePrecision`, `tickSize`, `minOrderAmt`) | `instruments-info?category=linear` (`qtyStep`, `tickSize`, `minOrderQty`, `minNotionalValue`)    |
| Maintenance margin              | n/a                                                                           | Tier from `/v5/market/risk-limit` (BTCUSDT tier 1 MMR = 0.33%, checked 2026-09-26; was 0.5%)     |

Isolated-margin liquidation price (Bybit's formula):

```
IM  = qty × entry / leverage
MM  = qty × entry × MMR − mmDeduction + estFeeToClose
Long  LP = entry − (IM − MM) / qty − extraMargin / qty
Short LP = entry + (IM − MM) / qty + extraMargin / qty
```

All of these constants and formulas live in **one server module**, `apps/server/src/trading/bybitSpec.ts` (new). Each
has a `// source: <Bybit URL>, checked <date>` comment. The client imports the parts it needs for display (estimated
fee, estimated liquidation price) through the SDK, so there is no second copy that can drift.

---

## 3. Findings: where the app currently differs from Bybit

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Where                                                                                         | Fixed in    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| F1  | **Chart history and live data come from different markets.** History tries `category=linear` first, with spot as a fallback. The live klines and tickers WS is **spot** only, so the chart can jump where history meets live data (perp/spot basis is usually a few dollars, sometimes tens). **Interim fix (2026-09-25):** history now tries **spot** first (`['spot', 'linear']`), so the chart matches the spot live feed and Bybit's Spot chart exactly (verified Δclose 0.00 across symbols/intervals). A per-market data source (spot vs linear, history + WS) is still needed for the Perpetual market in BP-0.                                                             | `routes/market/index.ts:100` (`BYBIT_KLINE_CATEGORY_ORDER`), `BybitWebSocketManager.ts:33-34` | BP-0        |
| F2  | **Bid/ask never arrived (confirmed live 2026-09-26; fixed in BP-0 via `orderbook.1`).** Bybit's _spot_ `tickers` stream has no `bid1Price`/`ask1Price` (checked live 2026-09-25: spot snapshot fields are `symbol,lastPrice,highPrice24h,lowPrice24h,prevPrice24h,volume24h,turnover24h,price24hPcnt,usdIndexPrice`). `parseTicker` returns `null` whenever bid/ask are missing, so no `ticker` message should ever reach the client. The Sell/Buy buttons would then fall back to `latestPrice`, and the spread badge would show `—`. **Verify in the running app.** `APP_LOG.md` still says the feed uses `orderbook.1`, but `bybit.ts:185` only subscribes `kline` + `tickers`. | `BybitWebSocketManager.ts:398-432`, `plugins/bybit.ts:184-185`                                | BP-0        |
| F3  | **Market orders fill at last price**, not at the best ask (buy) or best bid (sell).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `TradingPanel.tsx:147` (`execPrice = latestPrice`)                                            | BP-2        |
| F4  | **Resting limit orders can fill better than their limit.** When `latestPrice` has already crossed the limit, the fill is at `latestPrice`. On Bybit a resting limit fills **at its limit price** (maker).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `usePendingOrderMonitor.ts:27-30`                                                             | BP-2        |
| F5  | **One flat fee (0.07%) for every order and market**, with no maker/taker split.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `paperStore.ts:25` `COMMISSION_RATE`                                                          | BP-2        |
| F6  | **Leverage is account-wide** (Account Settings modal). On Bybit leverage is **per symbol** and set on the order form, and positions don't record their leverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `paperStore.ts:412`, `Position` interface `paperStore.ts:36-46`                               | BP-2 / BP-3 |
| F7  | **Leveraged positions have no liquidation, no mark price and no funding**, so leverage costs nothing and can't wipe you out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `paperStore`, `useTPSLMonitor`                                                                | BP-3 / BP-4 |
| F8  | **Shorting is allowed on everything.** Bybit spot cannot short.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `paperStore.placeOrder`                                                                       | BP-2        |
| F9  | **Lot and tick sizes are hard-coded** in the client instead of coming from Bybit's `instruments-info`. They also differ between spot and linear.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | lot-step logic (see TRADING_TEST_PLAN §6 note)                                                | BP-0 / BP-2 |
| F10 | **Nothing is monitored while the browser is closed.** TP/SL and pending fills only run in an open tab, although positions are saved in the DB for every logged-in user. Bybit keeps running 24/7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `useTPSLMonitor`, `usePendingOrderMonitor`                                                    | BP-1        |
| F11 | **The browser decides fill prices and PnL, and the server stores whatever it's sent.** A user can post their own fill price or balance through the `/paper` API. That doesn't matter much today, but it will for leaderboards, the Phase 6 bot's track record, or anything else that compares users.                                                                                                                                                                                                                                                                                                                                                                               | `paperStore.ts` → `paperApi.createOrder/createPosition/updateAccount`                         | BP-1        |

---

## 4. Phases

Every phase that touches UI goes through the **visual Q&A gate** (`session-bootstrap`) before implementation.
Every phase ends with the `security.md#verify-a-refactor-is-safe` checklist and all pre-commit gates green.

### BP-0 — Data foundation (prerequisite, no visible trading change)

Goal: each market reads **all** of its data (history, live candles, quotes) from its own Bybit category. The engine in
BP-1 needs this feed on the server anyway.

**Server**

- [x] Run **two** `BybitWebSocketManager` instances: `…/v5/public/spot` and `…/v5/public/linear`. Pass the category
      into the constructor instead of hard-coding spot.
- [x] Spot: add an `orderbook.1.{symbol}` subscription to get best bid/ask. Merge it with spot `tickers` (for `lastPrice`)
      into one `TickerUpdate`. Bybit spot allows **max 10 args per subscribe request**, so batch the 9 symbols × 3 topics.
- [x] Linear: `tickers` already carries `bid1Price/ask1Price/markPrice/indexPrice/fundingRate/nextFundingTime/fundingIntervalHour`.
      Extend `parseTicker` to keep those fields and to merge deltas per field (linear deltas often carry only bid/ask).
- [x] Fix `parseTicker` so that a missing bid/ask no longer drops `lastPrice` updates (F2).
- [x] `CandleAggregator` / `IndicatorCalculator` / ring buffers keyed by `(category, symbol)`, not `symbol`. Check the
      memory bound: 2× the current buffers.
- [x] History endpoint: `category` query param (`spot | linear`, schema enum) and **remove the
      linear→spot fallback** (F1). The param defaults to `spot` so old cached clients keep working.
      Note: there was no retry/circuit breaker to keep, just a timeout + request coalescing.
      **Follow-up:** add `fetchWithRetry`/`CircuitBreaker` (api-best-practices) to all Bybit REST calls before BP-1.
- [x] New cached endpoint `GET /market/instruments?category=` returns tick size, qty step, min qty/notional and max
      leverage for the 9 symbols, from `/v5/market/instruments-info`. Refresh every few hours. Add
      `GET /market/risk-limit?symbol=` (linear only) from `/v5/market/risk-limit`.
- [x] Client WS URL includes `category` (it's a query param, not a subscribe message). The server validates it
      against an allow-list, like symbols and intervals (1008 otherwise).
- [x] Added during implementation: tickers are only broadcast when a price changes (most `orderbook.1` pushes
      only change size). The server caches the latest quote per `category:symbol`, sends it on connect, and
      clears it when that stream disconnects.

**SDK (`generated/CDSDK`)**

- [x] `WsMessage` ticker: add `category`, plus optional `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime`,
      `fundingIntervalHour`. New `Instrument` and `RiskLimitTier` types.

**Client**

- [x] `layoutStore.PaneConfig` gets `category: 'spot' | 'linear'`. Persist version bump + migration (v3 → v4).
      **Changed on 2026-09-26:** in BP-0 _every_ pane, existing and new, is `'spot'`. With no market switch before
      BP-2, moving existing layouts to `'linear'` would silently give returning users perp charts they couldn't
      leave. **The D7 migration (existing → linear) ships in BP-2, together with the switch.**
- [x] `paneStore` stores `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime` alongside `bid/ask`.
- [x] `usePaneFeeds` subscribes with the pane's category. `lastKnownPrices` is keyed by `category:symbol`.
- [x] Sync-symbol in multi-pane also syncs category.

### BP-1 — Server trading engine (option B, D9)

Goal: move today's trading behaviour from the browser to the server **without changing it**. This is a pure port:
same fills, same 0.07% fee, same journal wording. Bybit-specific behaviour comes in BP-2 onwards and is written once, on
the server.

Keeping this port free of behaviour changes means the existing ~340 T1/T2 tests show whether it worked: the store tests
move to the server and must pass unchanged.

**How it works (mirrors Bybit's architecture)**

```
Bybit public WS (spot + linear) ──► MarketFeed ──tick──► MatchingEngine ──events──► Postgres (transaction)
                                                             ▲                         │
 Client ──REST: place / cancel / amend / close──────────────┘                         ▼
 Client ◄──private WS: order · position · execution · wallet · journal ◄────── EventBus
```

**Agreed before implementation (2026-09-26):**

- **Port + four safety fixes**, not a strict port. The trading maths is unchanged (0.07% fee, last-price fills,
  same-side positions kept separate, account-wide leverage). The fixes:
  - **S1:** a triggered pending order that can't fill is recorded as rejected, instead of vanishing after its reserve
    was refunded.
  - **S2:** a fill uses the leverage stored on the order at placement, not the current account leverage.
  - **S3:** live triggers fire on the tick price, not on the forming candle's high/low, which could predate the order.
  - **S4:** `Trade.pnlPercent` widened from `Decimal(6,4)`, which overflowed at ≥ 100%.
- **One PR, no fallback flag.**
- **Start fresh:** the journal, balance history and leverage that lived only in each browser are not imported.
  Balances, positions, orders and trades were already on the server and are kept.

**Server**

- [x] `apps/server/src/trading/engine/`: **pure functions** (no Prisma, no I/O, no clock), using `Prisma.Decimal`
      (the decimal.js Prisma ships, so no new dependency).
  - Actions: `placeMarket` (netting and flip), `closePosition`, `placePending`, `cancelPending`, `fillPending`,
    `editPending`, the exit-leg actions, notes and `reset`.
  - `evaluateTick` / `evaluateCandle` and `executeTrigger`.
  - Every journal and balance-history text is kept word for word.
- [x] `MatchingEngine`:
  - An index of accounts with open triggers, keyed by symbol and kept current from every committed delta.
  - Spot ticks are evaluated per symbol bucket, and a burst of ticks can't re-fire a trigger that is still executing.
  - **Changed from the plan:** it's keyed by `symbol` only, because every pane trades on the spot feed until BP-2.
    Linear ticks are ignored.
- [x] **One transaction per action**, `AccountRepository.mutate`.
  - **Changed:** the optimistic `version` lives on `Account`, not on `Order` / `Position`. Every change to an account
    bumps it with `updateMany({ where: { id, version } })`, so two concurrent changes to one account can't both commit.
  - A `VersionConflictError` is retried up to 3 times. On one machine, a per-user queue in `TradingService` avoids most
    conflicts in the first place.
- [x] **Order API** (intent only, F11):
  - `GET /paper/state` · `POST|DELETE|PATCH /paper/orders[/:id]` · `DELETE /paper/orders/:id/exits/:leg`
  - `PATCH /paper/positions/:id/tpsl` · `DELETE /paper/positions/:id/exits/:leg` · `POST /paper/positions/:id/close`
  - `PATCH /paper/account/leverage` · `POST /paper/account/reset` · `POST|PATCH /paper/journal[/:id]`
  - Removed: every endpoint that accepted client-computed balances, positions, fills or trades, the old per-resource
    GETs, and the `syncWithServer` legacy push. Also removed: the unused `Sync*` / `Create*` / `Update*` SDK types.
- [x] **Private WS** `/api/paper/ws`:
  - Auth is the first message `{ type: 'auth', token }` (never a token in the URL). The server answers with the snapshot,
    then pushes a `delta` for every change.
  - Caps: 5 sockets per user, 20 per IP and 500 in total. Messages are capped at 4 KB, the Origin is checked, and it
    pings every 30 s.
  - Every delta carries the account `version`, so a client applies each change exactly once.
- [x] **Journal and balance history moved to the DB** (`JournalEntry`, `BalanceEvent`, capped at 200 per user).
  - An auto-increment `seq` on those tables, `Order` and `Trade` keeps same-instant rows in display order.
- [x] **Money maths in decimals**: Decimal in the engine, and decimal strings on the wire.
- [x] **Resilience / backfill:**
  - A symbol with no ticks for over 60 s, or an engine taking over after downtime (from `EngineLease.lastTickAt`), is
    backfilled from spot 1m klines with the candle sweep.
  - Candles that started before an order was placed are ignored (S3). Each backfill writes a log line; there is no
    metrics system yet.
- [x] **Single executor: changed from a Postgres advisory lock to an `EngineLease` row.** The rules forbid raw SQL.
  - The holder renews every 10 s with a 30 s expiry, and takes the row over only once it has expired.
  - Other machines serve the API and WS. `PaperEventBus` is in-process, so fan-out assumes one Fly machine, like the auth
    grace map. Redis pub/sub is the path to scale out.
- [x] **Rate limits:** mutating routes allow 60/min and reset 5/min. Input uses allow-listed enums and bounded decimal
      strings (`^\d{1,12}(\.\d{1,8})?$`, positive).
  - Unknown fields (e.g. a forged `price`) are **stripped** by Fastify's validator (`removeAdditional`), not rejected, so
    they never reach the engine.

**Client**

- [x] `paperStore` is a **read model**:
  - `hydrate()` from the WS snapshot, then `applyDelta()` with a version gate.
  - Actions send intent and apply the response delta. They never throw into the UI: an order request returns
    `{ id, error? }`.
  - No `persist()`: `cd-paper-trading` is deleted on load, and `clear()` runs on logout, a user change, a password change
    and account deletion (the logout data-leak fix).
- [x] `useTPSLMonitor` / `usePendingOrderMonitor` and their tests are removed.
  - The new `usePaperFeed` runs the private WS and plays the server-decided sound once per change.
  - Also new: `useSessionRefresh` / `lib/session.ts`. The access token was only refreshed at app boot, so every
    authenticated call failed after 15 minutes. It's now refreshed 60 s before it expires, and again after a 4401 close.
- [ ] Optimistic "pending…" UI (a visible "Placing…" state on the submit button). **Not done:** it's a visual change,
      which goes through the visual Q&A gate first. A double-submit ref guard is in place instead.

**Found and fixed along the way (outside BP-1's scope):**

- **Error handler leak:** `app.ts` set the sanitizing error handler **after** registering the routes. Fastify fixes a
  route's error handler when the route is defined, so routes that let an error escape answered 500s with the raw
  `err.message`. The handler is now set before any route.

### BP-2 — Market split, Bybit fees, Bybit fill prices

All trading rules below are implemented **in the server engine**. The client only gets UI and display.

> **Implemented 2026-09-26** (one PR, owner's choice). Owner decisions from the planning round
> (`~/.claude/plans/bp2-market-split.md` Q1–Q15 + the 10-question visual gate):
>
> - **URLs:** `/dashboard/spot/BTC/USDT`, `/dashboard/usdt/BTCUSDT`; bare `/dashboard` redirects to the active pane's
>   market. The URL always shows the active pane; it wins over the saved layout on load. Switching market or symbol
>   pushes history, focusing another pane replaces it. Sign-in returns to an allow-listed market deep link only.
> - **Controls:** header Trade ▾ menu **and** in-panel Spot | USDT Perpetual tabs, one action (`setPaneMarket`).
>   The leverage chip reads `1x ▾` (the 256px panel has no room for "Isolated · 1x"; isolated is in its label and modal).
> - **Perps size:** Bybit's by Qty (coin) / by Value (USDT) with a 0–Max quick fill; the form shows cost = IM + fee
>   estimates. A pre-BP-2 client's `usdtAmount` (margin) is still accepted during the deploy window.
> - **Leverage:** per symbol (`SymbolSetting`); **refused while the symbol has an open position or active order**
>   (re-margining comes with BP-3). Account leverage stays as the default for symbols with no setting.
> - **Margin mode:** isolated only. **Same-side positions:** stay separate (see §8).
> - **Spot TP / SL:** attached to a buy, or placed on coins held (Assets tab) — an OCO pair of conditional sells sharing
>   one coin lock; the first to fire sells at the bid and cancels the other.
> - **Order tabs** show the active market only; Balance History and Journal stay account-wide.
> - **D7:** existing positions / orders / trades became USDT Perpetual (column default). A layout saved before BP-2 gets
>   a one-time switch to USDT Perpetual when that user opens bare `/dashboard` with perpetual positions / orders; new
>   users start on Spot.
>
> **Changed from the plan / found on the way:**
>
> - **Stored fees, never recomputed:** the BP-1 engine derived a position's entry fee and a pending order's refund from
>   the _current_ rate, so changing the rate would have silently recomputed migrated rows. `Position.entryFee`,
>   `Position.closeFeeReserve` and `Order.reserved` now store what was charged; the migration backfills pre-BP-2 rows
>   at the 0.07% they paid (and a position's leverage from qty × entry / margin).
> - **Position margin** = IM (`margin`) + `closeFeeReserve`, stored separately rather than as one `positionMargin`.
> - **Stale quotes:** Bybit's quote stream only emits changes, so the server records when each market's quote was last
>   _seen_ (every tickers / orderbook message) and refuses to fill on a quote older than 10 s.
> - **Rejections** (Bybit size / tick rules, spot balance, locked leverage) answer 422 with Bybit's documented wording
>   (+ the minimum), and write nothing — like Bybit's API refusing the order. Funds rejections on perpetual orders are
>   still recorded as rejected rows, as in BP-1.
> - **Instrument rules** come from the instruments-info cache (refreshed hourly), with a bundled snapshot of mainnet
>   values (fetched 2026-09-26) if Bybit is unreachable.
> - **Live prices for held markets** are pushed over the private WS (≤ 1/s, changes only), so PnL is live for symbols
>   no pane shows.
> - **Spot coin amounts** stay on the stored 8-decimal grid (the coin fee is rounded up), and SpotBalance has a
>   non-negative CHECK.
> - A pure `lib/marketRoutes.ts` + `hooks/useMarketUrlSync.ts` handle the URL; the page-transition key groups every
>   dashboard URL so a market change never remounts the dashboard.

**Market switch (UI, visual Q&A first)**

- [x] Spot / Derivatives switch at the **top of the TradingPanel** (Bybit places it there). It sets the active pane's
      category. The symbol picker shows the Perpetual tag in perps mode.
- [x] **Spot order form:** no leverage, Buy / Sell. Sell is limited to the free balance of the base coin, with a "Max"
      that fills the held quantity.
- [x] **Perps order form:** margin-mode + leverage chip on the form (`Isolated 10.00x`, Bybit layout). Leverage moves out
      of the Account Settings modal and becomes **per symbol** (F6). The `MAX_LEVERAGE = 10` cap stays and is enforced
      on the server.
- [x] Bottom panel: in Spot mode Bybit has **no positions**, it has **Assets**. Add an Assets view (coin, balance,
      available, locked in orders, avg cost, last price, unrealised PnL) and hide the Positions tab for spot.

**Account model (Bybit UTA, D8)**

- [x] One USDT wallet shared by both markets, starting at 10,000 USDT. Spot adds per-coin holdings:
      `{ coin, free, locked, avgCost }`.
- [x] **Spot buy:** USDT −= qty × price; coin += qty − fee (fee in base coin).
- [x] **Spot sell:** requires `free ≥ qty`; coin −= qty; USDT += qty × price − fee (fee in USDT).
      Realised PnL = (sell − avgCost) × qty − fees.
- [x] Spot limit buy locks USDT; spot limit sell locks coin. Spot TP/SL are conditional sell orders that lock the coin.
- [x] Perps: position stores `category`, `leverage`, `marginMode`, `positionMargin` (IM). Netting/one-way behaviour unchanged.

**Fees (F5)**

- [x] Replace `COMMISSION_RATE` with `feeRate(category, liquidity)` from `bybitSpec.ts`.
- [x] Liquidity rules:

| Order                                                   | Liquidity |
| ------------------------------------------------------- | --------- |
| Market, stop (conditional → market), TP/SL, liquidation | **Taker** |
| Limit that crosses the book at placement                | **Taker** |
| Limit that rests and later fills                        | **Maker** |

- [x] Perps order cost (what's reserved) = IM + fee to open + estimated fee to close (Bybit's "order cost").
- [x] Every fill records `fee`, `feeRate`, `feeAsset`, `isMaker`. The UI shows the fee in the asset it was charged in.
- [x] Old history keeps its 0.07% values. **Never recompute past trades.**

**Fill prices (F3, F4)**

- [x] Market buy fills at **ask**, market sell at **bid**, using the server's latest quote. If the quote is stale, reject
      with "Waiting for live price…" rather than using last price.
- [x] A resting limit fills **at its limit price**. A limit that crosses the book at placement fills at the current
      ask/bid (taker).
- [x] Stops and TP/SL trigger on **last price**. Once triggered, they fill as a market order at ask/bid (taker).
- [x] Qty/price rounding uses `qtyStep`/`tickSize` from the instruments cache. Orders below `minOrderQty` or
      `minNotionalValue` are rejected with Bybit's wording (F9).

**Shorting (F8)**

- [x] Spot: `side = sell` without enough coin is rejected by the engine. Perps: unchanged.

### BP-3 — Mark price, isolated margin, liquidation

- [ ] Unrealised PnL for perps uses **mark price** (Positions tab, Account summary bar, `lastKnownPrices`).
- [ ] Liquidation price computed on the server with the §2 formula, using the tier-1 MMR from the risk-limit cache.
      It's shown in the order form (estimate before submit), in a Positions column, and as a dashed line on the chart.
- [ ] Bankruptcy price computed. **Liquidation in the engine:** when mark price crosses LP, the position closes at the
      bankruptcy price, the whole position margin is lost, and a `Liquidation` execution plus a journal entry are
      written. It's pushed to the client with a distinct liquidation sound.
- [ ] Backfill after a server gap uses **mark-price klines** (`/v5/market/mark-price-kline`) for liquidation checks.
      Events apply in time order, so if a stop-loss and liquidation both happened, whichever came first wins.
- [ ] Mark-price line on the chart in perps mode (optional toggle, Bybit shows it).

### BP-4 — Funding

- [ ] Engine scheduler: at each symbol's `nextFundingTime`, for every open perp position,
      `payment = qty × markPrice × fundingRate`. Longs pay when the rate is positive; shorts receive.
- [ ] Record each payment as a `Funding` execution (Bybit `execType` naming) and a journal line with the amount. Show it
      in the Positions row (cumulative funding) and in Balance History.
- [ ] Use the per-symbol `fundingIntervalHour` from the ticker (don't assume 8 h).
- [ ] Backfill missed settlements after server downtime from `/v5/market/funding/history`.
- [ ] Funding countdown + current rate in the perps order form header (Bybit shows it there).

### BP-5 — Cross margin, risk tiers, refinements

- [ ] **Cross margin:** Bybit UTA's default. Account-level maintenance margin, shared available balance, account
      liquidation.
- [ ] Full risk-limit tiers (MMR and mmDeduction step up as position value grows).
- [ ] Add/remove margin on an isolated position (`extraMargin` in the LP formula).
- [ ] TP/SL trigger-by selector (Last / Mark / Index), plus reduce-only and close-on-trigger flags.

---

## 5. Persistence & migration

**Server (Prisma)**, the source of truth from BP-1 onward:

- `Position`: add `category`, `leverage`, `marginMode`, `extraMargin`, `version`. **BP-2 added** `category`, `leverage`,
  `marginMode`, `entryFee`, `closeFeeReserve` (`extraMargin` waits for BP-3).
- `Order`: add `category`, `isMaker`, `feeRate`, `triggerBy`, `reduceOnly`, `version`. **BP-2 added** `category`,
  `reserved`, `feeRate`, `feeAsset`, `isMaker`, `ocoGroup` (`triggerBy` / `reduceOnly` wait for BP-3).
- **BP-2 also added** `Trade.category`, `SymbolSetting` (per-symbol leverage / margin mode) and `SpotBalance`
  (`free`, `locked`, `avgCost`, non-negative CHECK).
- `Trade`: add `category`, `fee`, `feeAsset`, `execType` (`Trade | Funding | Liquidation`), mirroring Bybit's
  execution list.
- New tables:
  - `SpotBalance`: `accountId`, `coin`, `free`, `locked`, `avgCost`.
  - `JournalEntry`: `accountId`, `time`, `text`, `isUserNote`, `pnl?`.
- All new columns get defaults (`category = 'linear'`), so the migration needs no backfill script.
- One-off import at BP-1 rollout: each user's localStorage journal is uploaded once on first load after deploy. It is
  validated server-side and marked imported, so it can't be replayed.

**Client (`paperStore`, persist key `cd-paper-trading`)**

- Version bump. After BP-1 the persisted data is only a cache, so the migration can simply drop the old shape and let
  the server hydrate.
- `COMMISSION_RATE` stays exported **only** for legacy display of old rows (or is removed once no reader remains).

---

## 6. Rollout order and risk

| Step | Risk                                          | Mitigation                                                                                                             |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| BP-0 | Feed regressions (chart, prices)              | Ship alone; compare old and new feeds side by side in dev                                                              |
| BP-1 | Biggest change: execution moves to the server | Pure-port rule; existing tests ported first; feature flag lets the client fall back to local execution for one release |
| BP-2 | UI changes                                    | Visual Q&A gate; spot and perps behind the market switch                                                               |
| BP-3 | Users get liquidated for the first time       | In-app explainer + liquidation price always visible before submit                                                      |
| BP-4 | Balance moves while user is away              | Every funding payment in the journal and Balance History                                                               |

---

## 7. Out of scope (deliberately not copying Bybit)

- Hedge mode (two-way positions): one-way only.
- Spot margin trading, borrowing and interest.
- Order-book depth simulation, slippage beyond best bid/ask, partial fills, ADL, insurance fund.
- VIP fee tiers, fee coupons, USDC contracts, inverse contracts, options.

---

## 8. Known deliberate gaps vs Bybit

| Gap                                                                                                               | Why                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Leverage capped at 10× (Bybit allows far more)                                                                    | Safety cap for a learning app                                            |
| Fills at top of book only, no depth                                                                               | Simplicity; fine for small orders                                        |
| Liquidation settles instantly at bankruptcy price                                                                 | No liquidation engine / insurance fund                                   |
| Same-side positions are kept separate (Bybit's one-way mode merges them into one averaged position)               | Merging would recompute migrated positions; revisit with BP-3            |
| Leverage can't change while a symbol has open trades                                                              | Re-margining open positions arrives with liquidation (BP-3)              |
| Limits trigger on the last price, not the book                                                                    | No order-book simulation (§7)                                            |
| A backfilled trigger (server was down) fills at the level it crossed, with the taker fee                          | There is no quote for the past                                           |
| The close-fee estimate uses the entry price, not the bankruptcy price                                             | Bybit uses the bankruptcy price; lands with BP-3                         |
| Spot TP / SL are placed or cancelled, not edited                                                                  | Cancel and place again                                                   |
| A TP / SL pair attached to a spot buy uses the exact coins received (net of the fee), not floored to the qty step | Engine triggers have no instrument rules; the pair still sells correctly |

---

## 9. Open questions

None blocking. Resolved on 2026-09-25: Q1 → D2, Q2 → D9 (server engine), Q3 → D7, Q4 → D8.

---

## Sources

- [Bybit — Trading Fee Structure](https://www.bybit.com/en/help-center/article/Trading-Fee-Structure)
- [Bybit — Spot Trading: Fees Explained](https://www.bybit.com/en/help-center/article/Bybit-Spot-Fees-Explained)
- [Bybit — Futures Contracts: Fees Explained](https://www.bybit.com/en/help-center/article/Perpetual-Futures-Contract-Fees-Explained)
- [Bybit — Liquidation Price Calculation under Isolated Mode (UTA)](https://www.bybit.com/en/help-center/article/Liquidation-Price-Calculation-under-Isolated-Mode-Unified-Trading-Account)
- [Bybit — Maintenance Margin (USDT Contract)](https://www.bybit.com/en/help-center/article/Maintenance-Margin-USDT-Contract)
- [Bybit — Bankruptcy Price](https://www.bybit.com/en/help-center/article/Bankruptcy-Price-Perpetual-and-Expiry-Contracts)
- [Bybit — Introduction to Funding Rate](https://www.bybit.com/en/help-center/article/Introduction-to-Funding-Rate)
- [Bybit API v5 — Ticker stream](https://bybit-exchange.github.io/docs/v5/websocket/public/ticker)
- [Bybit API v5 — Funding rate history](https://bybit-exchange.github.io/docs/v5/market/history-fund-rate)
