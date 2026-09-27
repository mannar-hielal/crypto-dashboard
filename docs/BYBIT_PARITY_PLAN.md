# Bybit Parity Plan — Spot + USDT Perpetual

> **Status:** BP-0 implemented (2026-09-26, `feat/bybit-parity-bp0`) · BP-1 implemented (2026-09-26, `feat/bybit-parity-bp1`) · BP-2 implemented (2026-09-26, `feat/bybit-parity-bp2`) · BP-3 implemented (2026-09-27, `feat/bybit-parity-bp3`) · BP-4 implemented (2026-09-27, `feat/bybit-parity-bp4`) · BP-5 implemented (2026-09-27, `feat/bybit-parity-bp5`;
> owner decisions O1–O12 answered, see BP-5 "Implementation notes") · Integration audit of BP-0…BP-4: §10.
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
      **Done in BP-3** (Step 0).
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
- [x] Optimistic "pending…" UI (a visible "Placing…" state on the submit button). **Done in BP-3.** Was not done here: it's a visual change,
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

### BP-3 — Mark price, one-way positions, isolated liquidation, re-margining, chart lines

All trading rules live **in the server engine**; the client gets display and estimates only.

> **Planned 2026-09-26.** Owner direction: **mimic Bybit as closely as possible**, because the app will eventually be
> tested against Bybit's own APIs. That settles the open choices:
>
> - **Same-side fills merge** into one position per symbol (one-way mode), including existing split positions.
> - **Leverage can change with an open position** (re-margining), in BP-3 rather than BP-5.
> - **The chart draws every line Bybit draws**: entry, TP, SL, liquidation, order and mark price. This is more UI.
> - **No grace period at deploy**: positions already past their liquidation price are liquidated on the first mark
>   tick.
>
> Field names follow Bybit's v5 API so a later API-parity test can diff them:
>
> - Position: `avgPrice`, `markPrice`, `liqPrice`, `bustPrice`, `positionIM`, `positionMM`, `positionValue`,
>   `unrealisedPnl`, `cumRealisedPnl`, `leverage`.
> - A liquidation is `execType = 'BustTrade'`, and its close order is `createType = 'CreateByLiq'`.
>
> **Implemented 2026-09-27** (one PR). UI decisions from the visual gate: Positions tab shows **Mark Price** and
> **Liq. Price** (amber) plus a **Bybit-style MMR meter**; Last Price, IM and MM are opt-in columns. A liquidation
> shows a dismissible notice above the order form; a one-time banner + ⓘ tooltips explain liquidation. Chart lines
> are Bybit-like, **draggable with a confirm** (included, not split out); the mark line toggle lives in the Chart type
> menu (default on). The order form gets **Est. liq. price**, the leverage modal a margin / liq-price preview, the
> submit button a "Placing…" state, Sound Settings a "Position liquidated" entry.
>
> **Changed from the plan / found on the way:**
>
> - **Liquidation / bankruptcy prices are derived, not stored.** `bybitSpec.positionRisk` computes them (and
>   positionIM / MM / MMR) from the position and the symbol's live risk-limit tiers whenever a position is evaluated
>   or sent — no `Position.liqPrice` / `bustPrice` columns, so a tier change or re-margin can never leave a stale
>   liquidation price. Only `extraMargin` was added (default 0, used in BP-5).
> - **The formulas were checked against Bybit's own worked example** (long 1 BTC @ 40,000, 50×, +3,000 extra margin →
>   liquidation 36,380.25) and reproduce it exactly (`bybitSpec.test`). The fee-to-close terms of IM and MM cancel out
>   of the liquidation price, so a position's stored IM is used as is.
> - **Tier by position value, not tier 1.** Bybit UTA moves positions between risk-limit tiers automatically, and
>   several symbols' tier 1 is small (BNB / AVAX / LINK: 10,000 USDT), so the MMR and deduction come from the tier the
>   position value falls in. Tiers are refreshed hourly with the instrument rules; `FALLBACK_RISK_TIERS` is a dated
>   snapshot (2026-09-27, up to ~2M USDT) that the client copy in the SDK must match (parity test). Live BTC tier-1
>   MMR is 0.33%.
> - **What a liquidation costs:** the close order is charged the position's whole close-fee reserve and nothing comes
>   back — IM + extra margin are consumed by the move to the bankruptcy price, the reserve pays the close fee (any
>   surplus goes with it, like Bybit's insurance-fund top-up). Realized PnL = −(IM + reserve + extra) − open fee.
> - **The symbol's active orders are cancelled (and refunded) before the liquidation close**, as Bybit cancels a
>   contract's active orders when it liquidates the position.
> - **Backfill order within one minute:** when the same 1m candle hits a stop-loss and the liquidation price, the
>   stop-loss wins — it sits between the entry and the liquidation price, so a continuous price path reaches it first.
>   If the mark candles can't be fetched the gap is still replayed for TP / SL and fills.
> - **Liquidation never runs on a stale mark:** `runTrigger` re-checks on a mark no older than 10 s (the quote-age
>   rule), or on the mark candle that triggered it in a backfill.
> - **Re-margining refusals** (422, nothing written): lowering leverage without the extra margin in the wallet;
>   raising it without a fresh mark, or when the mark already sits past the new liquidation price. The symbol's
>   pending orders re-reserve at the new leverage too (their qty is kept). Each change writes a journal line and a
>   Balance History row ("Adjust margin for …").
> - **Merge migration** (`20260926221355_bp3_liquidation`): merges same-side rows into the oldest, from stored values
>   only (newest TP / SL win, one journal line per merge), and writes a `SymbolSetting` with the position's leverage
>   for every symbol that has a position — one leverage per symbol, as on Bybit. Verified on real Postgres in a
>   rolled-back transaction.
> - **Retry / circuit breaker** (`lib/fetchWithRetry.ts`): 3 attempts (2 on the chart-history request path),
>   exponential backoff with jitter, retries only network errors / timeouts / 429 / 5xx; one breaker per upstream
>   (kline, market info, backfill) opens after 5 consecutive failures for 60 s.
> - **Client column layouts** saved before BP-3 get the Liq. Price and MMR columns once (`lib/columnPrefs.ts`).
>
> **Follow-ups (not in BP-3):** Bybit also refuses a stop-loss beyond the liquidation price (long SL ≤ liq) — not
> enforced yet (**corrected 2026-09-27:** Bybit accepts such a stop-loss and validates TP / SL against the last price
> instead — BP-5 B, O9); a higher-tier position is liquidated in full (Bybit may partially liquidate down a tier);
> `PATCH /paper/account/leverage` (pre-BP-2 default leverage) is still served; the full API-parity test against
> Bybit's testnet.
>
> **Where the code stood before BP-3 (2026-09-26):**
>
> - The engine ignores mark price: `TickUpdate` and `Quote` carry last/bid/ask only, and `plugins/trading.ts` drops
>   the linear ticker's `markPrice`.
> - The trigger index loads only positions that have TP/SL (`AccountRepository.loadOpenTriggers`).
> - Risk-limit tiers are cached (`BybitMarketInfo.getRiskLimit`), but only the route reads them.
> - `bybitSpec.ts` has no MMR, liquidation or bankruptcy maths.
> - The chart draws no trade lines.
> - The client drops the `mark` that the private WS `prices` message already carries.

**Step 0: prerequisites and leftovers**

- [x] `fetchWithRetry` + `CircuitBreaker` (api-best-practices) on all Bybit REST calls: `trading/infra.ts`,
      `services/BybitMarketInfo.ts` and `routes/market/index.ts`. This is the BP-0 follow-up; liquidation backfill
      depends on these calls.
- [x] Re-verify against Bybit's help centre and API docs, then write the values into `bybitSpec.ts` with
      `// source:, checked` comments:
  - the LP and bankruptcy formulas (§2)
  - the MMR / mmDeduction of every symbol's tiers
  - how a liquidation settles
  - one-way merge rules
  - what happens to TP/SL when fills merge
  - how pending orders re-reserve on a leverage change
- [x] Small fixes:
  - The comment in `infra.ts` says "Spot 1m candles"; backfill uses the market's own category.
  - `PositionEditPanel` labels the last price "Mark price".

**A. Mark price for perps**

- [x] Server: `TickUpdate` and `Quote` get `mark`, and `MarketSource.quote` passes it through. `PaperPositionDTO`
      gets `markPrice`, `unrealisedPnl` and `positionValue`.
- [x] Client:
  - `applyPrices` keeps `mark` (a mark map next to `lastKnownPrices`).
  - One shared `positionPnl(pos, mark)` helper replaces the inline copies in `OrderAccountManagementPanel` and
    `PositionEditPanel`.
  - Perp PnL, equity and the Account summary bar use mark; spot keeps last.
  - The Positions tab shows **Mark Price** and **Last Price** columns, as Bybit does.
- [x] TP/SL and stops still trigger on **last** (Bybit's default). Mark drives only PnL and liquidation.

**B. One-way mode: one position per symbol (closes the §8 gap)**

- [x] `fillInto` merges a same-side fill into the existing position.
  - `avgPrice` is weighted by qty.
  - `margin`, `entryFee` and `closeFeeReserve` are summed. Stored values are never recomputed.
  - Leverage is the symbol's setting. Opposite fills keep today's netting and flip.
- [x] TP/SL on a merge follows Bybit's Full mode: a TP/SL attached to the new order replaces the position's; otherwise
      the position keeps its own. Confirm this in Step 0.
- [x] **Migration** merges existing same-side pairs from stored values only:
  - summed qty, margin, fees and reserve
  - qty-weighted entry
  - the newest TP/SL wins
  - one journal line per merge explains it
- [x] Engine harness and tests updated. "Allows opening multiple same-side positions" flips to "merges".

**C. Liquidation price, bankruptcy price, maintenance margin**

- [x] Pure `positionIM`, `positionMM`, `bustPrice`, `liqPrice` and `feeToClose(bustPrice)` in `bybitSpec.ts`, plus the
      parts the client needs in `generated/CDSDK/spec/bybit.ts`. The parity test in `bybitSpec.test.ts` keeps the two
      copies in step.
- [x] The MMR / mmDeduction tier is picked **by position value** from the risk-limit tiers, as Bybit UTA does
      automatically. Risk-limit caps and a tier UI stay in BP-5.
- [x] Risk-limit tiers reach the engine the way instrument rules do: refreshed in `plugins/trading.ts`, with a bundled
      snapshot as fallback.
- [x] A new position's close-fee reserve is `qty × bustPrice × taker` (closes the §8 gap). Existing rows keep theirs.
- [x] Liquidation / bankruptcy prices are **derived** from the position and its tier whenever it is evaluated or
      sent (changed from "stored": nothing can go stale), and are on the DTO with positionIM / positionMM / mmr.
- [x] Order form: an **Est. liq. price** row in the perp summary. `orderMath.orderPreview` uses the bankruptcy-price
      close fee, as Bybit's order cost does.

**D. Liquidation in the engine**

- [x] **Every** open linear position is indexed, not only those with TP/SL (`loadOpenTriggers`).
- [x] New `liquidation` variant in the `Trigger` union.
  - `evaluateTick` compares **mark** with `liqPrice`.
  - `TradingService.runTrigger` re-validates against the current mark, and a stale mark never liquidates.
- [x] `liquidate` action:
  - Closes the whole position at `bustPrice`, and the whole position margin (IM + close-fee reserve) is lost.
  - Cancels the position's TP/SL legs and any reduce-side conditionals.
  - Writes a `BustTrade` trade, a `CreateByLiq` close order, a Balance History event and a journal line.
  - Plays a distinct `'liquidation'` sound.
- [x] Schema, in one committed migration together with the B merge:
  - `Trade.execType` (`Trade | BustTrade`, default `Trade`; `Funding` comes in BP-4)
  - `Order.createType`
  - ~~`Position.liqPrice`, `bustPrice`~~ — derived instead of stored (see the BP-3 notes)
  - `Position.extraMargin` (default 0, used in BP-5)
- [x] **At deploy:** no grace period, as on Bybit. A one-time in-app notice explains liquidation.
- [x] **Backfill** after a server gap:
  - A `/v5/market/mark-price-kline` fetcher in `infra.ts`.
  - Last-price candles (TP/SL, fills) and mark-price candles (liquidation) are swept together in time order, so if a
    stop-loss and a liquidation both happened, whichever came first wins.
  - A backfilled liquidation settles at `bustPrice`.

**E. Leverage change with an open position (re-margining; closes the §8 gap)**

- [x] `setSymbolLeverage` no longer refuses when the symbol has a position. New IM = `positionValue / newLeverage`.
  - **Lowering leverage** moves the difference from the wallet into the position, and is refused when the available
    balance can't cover it.
  - **Raising leverage** releases margin, and is refused when the new liquidation price would be at or beyond the
    mark price.
  - Pending orders re-reserve at the new leverage, per the Step 0 check. The refusals use Bybit's wording.
- [x] `LeverageChip` unlocks, and its modal shows the new margin and new liquidation price before confirming.

**F. Chart lines, as Bybit draws them (visual Q&A first)**

- [x] Perps: an entry line (qty + live PnL label), TP and SL lines, and a **dashed liquidation line**.
- [x] Active-order lines: limit price, conditional trigger and the order's TP/SL. Spot draws its order lines and the
      TP/SL of OCO pairs.
- [x] Mark-price line in perps mode, with a toggle.
- [x] Drag a TP/SL or order line to amend it. This goes through the existing `PATCH /paper/orders/:id` and
      `PATCH /paper/positions/:id/tpsl`. It is the last sub-step and can be split out if the visual gate says so.
- [x] Build it as a `usePositionLines(paneId)` hook on `series.createPriceLine`, following the Heikin-Ashi real-price
      line in `ChartPanel.tsx`. Clean up on a symbol, market or series change.

**G. UX**

- [x] Positions tab: **Liq. Price**, IM and MM columns, plus a warning when mark nears liq. Saved column prefs replace
      the defaults, so they need a migration for the new columns to appear.
- [x] Liquidation sound, which touches five places: `PaperSound` (SDK), a synth in `useTradingSound`, the context, the
      `usePaperFeed` switch and the `SoundSettings` list.
- [x] In-app liquidation explainer (§6), plus the one-time deploy notice.
- [x] Deferred from BP-1: the "Placing…" state on the submit button, reviewed in the same visual gate.

**Tests and docs**

- [x] Engine tests:
  - merge
  - LP / bust maths against Bybit's worked examples
  - liquidation on mark while TP/SL use last
  - backfill ordering
  - re-margin refusals
- [x] Integration tests: positions with no TP/SL are indexed, and a stale mark never liquidates.
- [x] `TRADING_TEST_PLAN.md`: a new §15 (BP-3), and §11 "Multi-Symbol PnL" switched to mark.
- [x] `APP_LOG.md` and the `paper-trading-logic` skill (merge, liquidation, re-margining).

### BP-4 — Funding

All funding rules live **in the server engine**; the client gets display only.

> **Planned 2026-09-27.** Standing owner direction: mimic Bybit (the app will later be tested against Bybit's APIs).
> Bybit's rules, checked 2026-09-27 (help centre "Funding Fee Calculation", API v5 funding history / execution list,
> live tickers and instruments-info):
>
> - **Fee = position size × mark price at the funding timestamp × funding rate.** Positive rate: longs pay, shorts
>   receive; negative: the reverse. Only a position **held at the timestamp** pays or receives.
> - **Timestamps** are per symbol: `fundingInterval` (instruments-info, minutes — all 9 symbols are 480 today, but
>   Bybit switches symbols to 4 h / 2 h / 1 h when rates hit their cap) and `nextFundingTime` on the linear ticker.
> - **The rate** that settles at a timestamp is published by `/v5/market/funding/history` (`fundingRate`,
>   `fundingRateTimestamp`; ≤ 200 per page, newest first; `startTime` alone is an error). The ticker's
>   `fundingRate` is the rate for the **next** settlement.
> - **Where it's paid from (UTA, isolated):** the available balance; only if that's short, the position margin —
>   which moves the liquidation price toward the mark. Received funding goes to the wallet.
> - **Records:** an execution with `execType = Funding`, `execQty` = position size, `execPrice` = mark price,
>   `feeRate` = funding rate, `execFee` = the fee (**positive = paid, negative = received**); it never changes the
>   position. Funding counts in realised PnL (position `cumRealisedPnl`, Closed P&L's "funding fee").
>
> **Implemented 2026-09-27** (one PR). Visual gate: funding rate + countdown in the symbol header next to Mark and
> Index (like Bybit; the explanation is a hover tooltip on the stat), a **Funding** column on by default (money
> moved: − paid in red, + received in green; saved column layouts get it once), payments listed in Balance History +
> Journal (no Funding tab), **no** est.-funding row in the order form (Bybit has none).
>
> **Changed from the plan / found on the way:**
>
> - **Once-only marker per account + symbol, not per position:** `SymbolSetting.lastFundingAt` instead of
>   `Position.lastFundingAt`. A snapshot can include a position closed seconds after the timestamp — a per-position
>   marker couldn't guard that one; the per-symbol marker guards every position of the timestamp in the same
>   transaction (version-guarded, so two machines can't both settle).
> - **Only what's actually collected is booked:** if the balance and (for a still-open position) its margin can't
>   cover a fee, the uncollected part is waived rather than left as a phantom realized loss.
> - **The clock settles before the ticker moves on:** a linear tick first settles any timestamp that has passed, then
>   takes the new `nextFundingTime` / rate (the new rate belongs to the next period). A 1 s timer covers a quiet feed.
> - **Snapshot eligibility:** positions with `openedAt ≤ ts` in the engine's in-memory index at the timestamp.
> - **Verified live** against Bybit and the dev DB: the 08:00 UTC settlement on 2026-09-27 (rate 0.00002285, mark
>   84,755.02) charged a 0.01 BTC long exactly 0.01936652; a second run settled nothing; the row stayed out of the
>   closed-trade history; the marker was set.
>
> **Where the code stood before BP-4 (2026-09-27):** the linear ticker already carries `fundingRate`, `nextFundingTime` and
> `fundingIntervalHour` (server `BybitWebSocketManager`, client `paneStore`); instruments-info already parses
> `fundingIntervalMin`. `Trade.execType` exists (`Trade | BustTrade`) and the mark price reaches the engine (BP-3).
> Nothing settles funding yet.

**A. Settlement in the engine**

- [x] **Funding clock** in `MatchingEngine` (the single executor, EngineLease): per linear symbol with open positions,
      keep the next funding timestamp (ticker `nextFundingTime`, else the last settled timestamp + `fundingInterval`).
      A timer fires **at** the timestamp — not "on the next tick" — and snapshots, from the in-memory index, every
      position of that symbol open at that instant (`openedAt ≤ ts`): side and size.
- [x] **Rate and mark:** the rate is the settled one from `/v5/market/funding/history` for exactly `ts` (fetched just
      after `ts`, retried with backoff for up to ~2 min — the record appears at settlement); if it never arrives, the
      last ticker `fundingRate` seen before `ts`, and the source is logged. The mark price is the last linear-ticker mark
      at or before `ts` (live), or the open of the mark-price kline minute starting at `ts` (backfill).
- [x] **Pure action** `settleFunding(state, { symbol, ts, rate, mark, positions: snapshot[] }, ctx)`:
  - `fee = size × mark × rate` per snapshotted position (signed: long pays when `rate > 0`); rounded to 8 dp.
  - Paid: from the balance; any shortfall from the position's margin (`entryUsdtAmount`), so its liquidation price moves
    (BP-3 maths). Received: to the balance.
  - A position closed or reduced after `ts` (a close in the seconds before the settlement ran) is still charged on its
    snapshot size — it was held at the timestamp, as on Bybit — from the balance.
  - `realizedPnl -= fee`; position `cumFunding += fee` (for the Positions row).
  - **Idempotent:** `SymbolSetting.lastFundingAt` (per account + symbol, written in the same version-guarded
    transaction) makes a re-run of a timestamp a no-op — restart, retry, a second machine, and also for a snapshot
    position that's gone. Execution row id: `fund-<positionId>-<ts>`.
- [x] **Records:** a `Funding` execution row (`Trade.execType = 'Funding'`, qty, mark as price, `feeRate` = rate, fee
      signed as Bybit), a journal line ("Funding fee −$0.42 · LONG BTCUSDT 0.015 @ mark $84,331.83, rate 0.0100%" /
      "Funding received +$…"), and a Balance History row (Bybit's transaction-log type `SETTLEMENT`). No sound (Bybit
      settles silently). Pushed as a normal delta.
- [x] **One transaction per account** through `TradingService.run` (per-user queue + version guard), fanned out across
      the symbol's accounts like trigger execution.

**B. Backfill after downtime**

- [x] On engine takeover (`EngineLease.lastTickAt`) or a feed gap: for each linear symbol with positions, fetch the
      funding history over the gap and the mark-price kline minute at each settled `ts`; settle positions whose
      `openedAt ≤ ts` and `lastFundingAt < ts`, in time order, interleaved with the BP-3 candle sweep so a funding
      payment that pushes a position into liquidation is applied before the later candles.
- [x] Known gap (document in §8): a position closed **during** the downtime can't be charged for a timestamp it held
      (the engine never saw it at `ts`).

**C. Closed P&L includes funding (Bybit)**

- [x] On a close (manual, TP/SL, netting, liquidation), the closed-trade record carries the position's funding share
      (`cumFunding × closed fraction`), and the closed PnL shown is net of it, as Bybit's Closed P&L. Realized PnL is
      not charged twice (it was booked at each settlement).

**D. Data & SDK**

- [x] Prisma: `Position.cumFunding Decimal(20,8) default 0`, ~~`Position.lastFundingAt`~~ →
      `SymbolSetting.lastFundingAt DateTime?` (see the notes),
      `Trade.feeRate Decimal?`, `Trade.funding Decimal default 0` (a close's funding share); `Trade.execType` gains
      `'Funding'`. One committed migration.
- [x] History queries exclude `execType = 'Funding'` from the History tab (closed trades) so funding rows can't crowd
      out `MAX_HISTORY`; they're returned as their own capped list (Bybit's execution list, for the later API-parity
      test) and shown through Balance History / journal / the Positions row.
- [x] SDK: `PaperPositionDTO.cumFunding?`, `PaperTradeDTO.execType` adds `'Funding'` + `feeRate?`, `funding?`;
      `PaperStateDTO.fundings?: PaperFundingDTO[]` and `PaperDeltaDTO.fundings?` (optional fields — a pre-BP-4 server sends none, the BP-3 lesson).

**E. UI (visual Q&A gate first)**

- [x] **Funding rate / countdown** where Bybit puts it — the symbol header next to Mark and Index (`SymbolBar`, perps
      only): "Funding 0.0022% · 04:12:33", the rate coloured by sign, with an ⓘ explaining who pays. Driven by the
      pane's ticker (`fundingRate`, `nextFundingTime`); the countdown ticks locally.
- ~~Order form: est. funding per interval~~ — declined in the visual gate (Bybit's order form has none).
- [x] Positions tab: a **Funding** column (cumulative, signed, opt-in or default — gate) and funding in the realised
      figures; Balance History shows each payment. A close's funding share is on the closed-trade record
      (DTO, account export) — the app has no closed-trade tab to show it in (follow-up with Bybit's Closed P&L view).
- [x] Journal wording and the order-history / balance labels ("Funding fee").

**F. Tests and docs**

- [x] Engine: long pays / short receives / negative rate; shortfall comes out of margin and moves the liquidation
      price; snapshot of a position closed after `ts` still pays; idempotency (same `ts` twice); merge keeps `cumFunding`;
      close carries the funding share.
- [x] Services: the funding clock fires at `ts` (fake timers), history-rate fetch with fallback, backfill ordering with
      the candle sweep, single executor.
- [x] `infra.fetchFundingHistory` pagination (`endTime` paging, newest first) + retry/breaker (reuse `fetchWithRetry`).
- [x] `TRADING_TEST_PLAN.md` §16, `APP_LOG.md`, the `paper-trading-logic` skill.

### BP-5 — Cross margin, risk tiers, refinements

All trading rules live **in the server engine**; the client gets display, estimates and the new controls.

> **Planned 2026-09-27.** Standing owner direction: mimic Bybit (UTA, VIP 0, one-way mode), because the app
> will later be tested against Bybit's v5 APIs. Bybit's rules below were checked on 2026-09-27 in the help centre
> (each page's own "last updated" date in brackets), the API v5 docs and the live public endpoints:
>
> - **Margin mode is account-wide in UTA, and Cross is the default.** "The selected margin mode will apply to your
>   entire account" — there is no per-symbol mode. New orders default to Cross at 10× in one-way mode
>   [Differences between the margin modes, 2026-08-04; Getting started with perpetual trading, 2026-08-05]. It is
>   switched with `POST /v5/account/set-margin-mode` (`ISOLATED_MARGIN` | `REGULAR_MARGIN` = cross | `PORTFOLIO_MARGIN`)
>   and read from `GET /v5/account/account-info` → `marginMode`. The position's `tradeMode` field is deprecated
>   (always 0).
> - **Switching with open positions is allowed when checks pass.** Cross → Isolated: the wallet must cover the
>   extra margin, and no position may end up with its mark at or past its new liquidation price. Isolated → Cross:
>   the account IM rate after the switch must be ≤ 100%. A failure returns `3400045` with a `reasons[]` list.
> - **Cross account figures** [Margin calculations, 2026-08-07; API `get-wallet-balance`]:
>   - Margin balance = wallet balance + perpetual unrealised PnL (`totalMarginBalance`).
>   - `totalInitialMargin` covers positions **and active orders**.
>   - Account IM rate = total IM ÷ margin balance; account MM rate = total MM ÷ margin balance (haircut and order
>     loss are 0 for us: the USDT collateral ratio is 1, and a spot order locks its own funds).
>   - `totalAvailableBalance` = margin balance − total IM. At an IM rate ≥ 100% only orders that reduce a position
>     are accepted.
>   - In cross the position IM / MM are **mark-price based** (`size × mark / leverage + fee to close`,
>     `size × mark × MMR − mmDeduction + fee to close`; changed 2025-09-02). Isolated keeps the entry-based IM.
>   - A reduce-only or untriggered conditional order needs no IM. Whether unrealised _profit_ can fund new orders is
>     unclear: two help-centre pages disagree, so the parity test settles it.
> - **Cross liquidation** [UTA liquidation process, 2026-08-07]: when the **account MM rate reaches 100%**, Bybit
>   cancels orders that increase positions, then all orders. It then liquidates positions by stepping their
>   risk-limit tier down, in the contract-liquidity order (BTCUSDT, ETHUSDT, SOLUSDT, …), and stops as soon as the
>   MM rate is below 100%. Positions close at the bankruptcy price.
> - **Isolated partial liquidation** (same page): in the lowest tier the whole position closes at the bankruptcy
>   price. Above it, Bybit first reduces the position by "the difference between the current position value and
>   the lower tier value" (an IOC order), tier by tier, and liquidates in full only at the lowest tier.
> - **Risk limits** [Risk limit (perpetual and futures), 2026-09-04; API `risk-limit`]:
>   - UTA adjusts the tier automatically; `/v5/position/set-risk-limit` no longer exists.
>   - The chosen leverage caps the position value: the cap is the highest tier whose `maxLeverage` ≥ the leverage.
>   - The value checked is the "effective position value": max(long position + long order value, short position +
>     short order value), with orders at mark. Reduce-only and close-on-trigger orders don't count.
>   - Over the cap the order is refused (`110090` "…position may exceed the max limit. Please adjust your leverage
>     to {{leverage}} or below…").
>   - Live on 2026-09-27, the cap at 10× is 100 M USDT for BTCUSDT and 52 M for ETHUSDT — unreachable from a
>     10,000 USDT start. The symbols with a small tier 1 (BNB / AVAX / LINK: 10,000 USDT) do change tier at our
>     sizes.
> - **Add / reduce margin (isolated)** [API `position/add-margin`; Getting started, 2026-08-05]:
>   - Call: `POST /v5/position/add-margin` with a signed `margin` (+ add, − reduce; 4 dp). The response returns
>     `positionIM`, `positionMM`, `liqPrice` and `leverage`.
>   - The **leverage is unchanged**; the liquidation price moves.
>   - A later **leverage change removes all extra margin**.
>   - A **partial close shrinks the extra margin pro rata**; adding to the position spreads it over the whole.
>   - Errors: `110078` (more than the max reducible), `110014` (insufficient balance to add), `110033` (no
>     position), `110011` / `110046` (liquidation would trigger).
>   - The max-reducible formula is not documented (verify on testnet).
>   - Auto-add-margin (`set-auto-add-margin`, `autoAddMargin`) exists.
> - **TP / SL, conditional orders, reduce-only, close-on-trigger** [API `create-order`, `trading-stop`; help
>   > centre Reduce-only / Close-on-trigger, 2026-06-29; Take-profit / stop-loss, 2026-09-13]:
>   - `tpTriggerBy` / `slTriggerBy` take `LastPrice` (default), `MarkPrice` or `IndexPrice`. A conditional order has
>     `triggerBy` and `triggerDirection` (1 = rises to, 2 = falls to). `tpslMode` Full means the whole position,
>     closed at market (the position list reports Full only).
>   - `reduceOnly`: the order can only reduce the position and carries no TP / SL. It is rejected with no position,
>     and it is cut back or cancelled when the position shrinks below it (the one furthest from the market first).
>   - `closeOnTrigger`: when a closing order triggers without enough available balance, the contract's other active
>     orders are cancelled or reduced to make room. It needs no margin, and TP / SL always behave this way.
>   - **Bybit does not refuse a stop-loss beyond the liquidation price:** "the system allows you to set your preferred
>     SL price, even if it's worse than the liquidation price… [it] may not be triggered, and will be canceled once
>     liquidation takes place". What Bybit does refuse is a TP / SL on the wrong side of the **last price**: a long's
>     TP must be above it and its SL below (retCode 10001 — seen in the wild, not in the docs). This corrects the
>     BP-3 follow-up and the §8 row, which assumed a refusal.
> - **Closed P&L** [API `position/closed-pnl`; P&L calculations, 2026-08-12]: "Closed P&L = position P&L − fee to
>   open − fee to close − sum of all funding fees", prorated on a partial close. Fields: `closedPnl`,
>   `avgEntryPrice`, `avgExitPrice`, `cumEntryValue`, `cumExitValue`, `openFee`, `closeFee`, `closedSize`, `qty`,
>   `orderType`, `execType`, `leverage`, `fillCount`, `createdTime`, `updatedTime`.
>
> **Where the code stands (2026-09-27, after BP-4):**
>
> - **Isolated only.** `SymbolSetting.marginMode` and `Position.marginMode` default to `"isolated"` and are never
>   read (`schema.prisma`). `PaperPositionDTO.marginMode` is the literal `'isolated'` (`mappers.ts:469`, SDK
>   `types/index.ts:225`). `LeverageChip.tsx:41,157` says "Isolated".
> - **No account-level margin.** The engine's `balance` is the available USDT: margin (IM + close-fee reserve) and
>   pending-order reserves are taken out of it (`fillInto` `actions.ts:215`, `placePending` `actions.ts:810`).
>   There is no account-level IM / MM or margin balance anywhere.
> - **Tiers are chosen by position value** (`bybitSpec.tierFor` `bybitSpec.ts:228`, `positionRisk` `:273`), but
>   `RiskTier` has no `maxLeverage` or initial-margin rate, so there is no cap check. `liquidatePosition`
>   (`actions.ts:662`) always closes the whole position.
> - **`Position.extraMargin` exists but is always 0** — in the schema, the mappers and `positionRisk`'s LP /
>   bankruptcy terms. `settle` (`actions.ts:126`) neither returns it on a close nor prorates it on a partial close.
>   `setSymbolLeverage` (`actions.ts:1344`) ignores it, where Bybit drops it on a leverage change. No action, route
>   or UI changes it.
> - **Last price only.** TP / SL, stops and limits trigger on the last price (`evaluateTick` `triggers.ts:119`,
>   `checkTPSL` `:40`). The engine `Quote` has no index price: `plugins/trading.ts` passes last / bid / ask / mark.
>   No `triggerBy`, `reduceOnly` or `closeOnTrigger` exists anywhere (schema, engine, SDK, client).
> - **No server-side TP / SL validation.** `updatePositionExits` (`actions.ts:1008`) does no price-side check. The
>   client checks TP / SL against the **entry** price (`PositionEditPanel.tsx:103-114`,
>   `PendingOrderEditPanel.tsx:149-160`); Bybit checks against the last price.
> - **Closed P&L has data but no view.** A close's funding share is on the `Trade` row (`Trade.funding`, net in
>   `Trade.pnl`) and the DTO (`PaperTradeDTO.funding`), but no tab shows closed trades
>   (`OrderAccountManagementPanel.tsx:50`).
> - **The pre-BP-2 surface is still served**, although the client no longer calls it (only `test/fakePaperApi.ts`):
>   - `PATCH /paper/account/leverage` (`routes/paper/index.ts:551`, marked "remove in BP-3"), with SDK
>     `setLeverage`, `TradingService.setLeverage` and `actions.setLeverage` (`:1424`);
>   - margin sizing by `usdtAmount` (`routes/paper/index.ts:99-110`).

**Owner decisions — answered 2026-09-27:** O1 yes (offer cross) · O2 new accounts start in **Cross**, existing accounts
stay Isolated with a one-time notice · O3 Bybit's switch rules (allowed with open positions when the checks pass) ·
O4 **one BP-5** (not split — the recommendation was to split; E ships in the same release as the rest) · O5 unrealised
profit counts, per Bybit's API formula (confirm on testnet) · O6 tier info in the leverage modal + hover in the
Positions row · O7 implement partial liquidation · O8 Last / Mark / Index · O9 follow Bybit (last-price check; a
stop-loss past liquidation is accepted with a UI warning) · O10 auto-add margin left out (§7) · O11 remove the pre-BP-2
API after one release that logs any call · O12 Full TP / SL only (Partial → §7).

**Visual gate — answered 2026-09-27** (all recommended): one chip `Cross 10x ▾` / `Isolated 10x ▾` opening a mode +
leverage modal (account-wide Cross | Isolated tabs with an explainer, presets, tier line) · cross figures added to the
account summary bar (Margin balance, IM rate, MM rate with a meter; Isolated keeps today's bar) · add / reduce margin
from a pencil on the Margin cell (Add | Reduce, max, new liq. price; hidden in Cross) · compact order form: a
`Last ▾` trigger-by dropdown beside TP and SL, Reduce-only and Close-on-trigger checkboxes under the amount (perps;
Close-on-trigger for Stop orders; Reduce-only hides TP / SL) · a **Closed P&L** tab after Positions (symbol, side,
qty, entry, exit, closed P&L, type, time; hover shows open fee, close fee, funding) · an amber inline warning under a
stop-loss past the liquidation price · tier info on hover of the MMR meter · a one-time banner for existing Isolated
accounts with How it works + Switch to Cross.

The options as they were put to the owner (recommended default first):

- **O1 — Support cross margin at all?** It is Bybit's default and the mode most Bybit users trade in. But in cross,
  one bad position can take the whole wallet — a harsh lesson in a learning app — and with the 10× cap it gives
  little extra room. **Recommended: yes.** "Mimic Bybit" means the parity test will expect it, and cross vs
  isolated is a core Bybit skill. Explain it in the mode modal (visual gate).
- **O2 — Default mode for new accounts.** **Recommended: Cross, as on Bybit.** Existing accounts stay Isolated (no
  silent change to open positions) and get a one-time notice. Alternative: Isolated for everyone until the user
  opts in.
- **O3 — Mode-switch rules.** **Recommended: Bybit's** (a switch with open positions is allowed when the checks
  pass), because the parity test calls `set-margin-mode` with positions open. The simpler alternative allows a
  switch only with nothing open.
- **O4 — Split BP-5?** **Recommended: yes.** BP-5a = Step 0 + A–D + F–G (contained refinements), BP-5b = E (cross
  margin: margin balance, account MM rate, account liquidation). Each gets its own PR and visual gate.
- **O5 — Cross-mode unrealised profit.** **Recommended: follow the API formula** (`totalAvailableBalance` = margin
  balance − IM, so profit counts), and confirm it with the testnet parity test before cross ships.
- **O6 — Risk-limit tier UI.** **Recommended: the current tier, the cap at the chosen leverage and the MMR in the
  leverage modal, plus the tier on hover in the Positions row.** A full tier table is noise when the 10× cap is
  unreachable for most symbols.
- **O7 — Partial liquidation of higher-tier isolated positions.** **Recommended: implement it (C).** BNB / AVAX /
  LINK positions over 10,000 USDT are already above tier 1 at our sizes, and cross liquidation (E) needs the same
  tier-step code. Alternative: keep the §8 gap.
- **O8 — Trigger by Index.** **Recommended: all three (Last / Mark / Index)**, as in Bybit's selector. The backfill
  needs `/v5/market/index-price-kline` as a third candle source, which reuses the mark-candle fetcher.
- **O9 — TP / SL validation.** **Recommended: follow Bybit.**
  - The server checks TP / SL against the last price, with Bybit's wording.
  - A stop-loss past the liquidation price is accepted, and the UI shows a non-blocking warning ("may not trigger —
    liquidation comes first").
  - This replaces today's client-side entry-price check and the planned "refuse SL beyond liquidation".
- **O10 — Auto-add margin (Bybit's AMR toggle).** **Recommended: out (§7).** It hides the liquidation lesson;
  revisit later.
- **O11 — Remove the pre-BP-2 API** (`PATCH /paper/account/leverage`, `usdtAmount` sizing). **Recommended: yes, in
  Step 0**, after one release that logs any call, to be sure no cached client still uses it.
- **O12 — TP / SL mode.** **Recommended: Full only** (a market close of the whole position — what Bybit's position
  list reports). Partial (limit TP / SL for part of the size) goes to §7.

**Step 0: prerequisites and leftovers**

- [ ] Re-verify the rules above on Bybit **testnet** before each sub-step ships, and write them into `bybitSpec.ts`
      with `// source:, checked` comments. Include the undocumented points: max reducible margin, cross unrealised
      profit, and the retCode of a risk-limit refusal. **Open:** the rules are written in from the help centre / API
      docs with sources; the testnet confirmation is the G parity run, which needs the owner's testnet keys
      (`pnpm --filter @crypto-dashboard/server parity:testnet`).
- [x] `RiskTier` gains `maxLeverage` and `imr` (from `/v5/market/risk-limit`'s `maxLeverage` / `initialMargin`).
      `FALLBACK_RISK_TIERS`, the SDK copy and the parity test are extended to match.
- [ ] Remove the pre-BP-2 surface (O11): `PATCH /paper/account/leverage`, SDK `setLeverage`,
      `TradingService.setLeverage`, `actions.setLeverage`, `usdtAmount` sizing and their tests. `Account.leverage`
      stays as the default for unpinned symbols. Run the `security.md` refactor checklist. **Step 1 done in BP-5:**
      every call is logged (`paper-legacy-api`); the removal ships in the release after, per O11.
- [x] Doc tidy from the audit (§10): the §5 wording, stale §8 rows, the BP-0 follow-up and the declined BP-4
      checkbox — done in this plan revision; re-check at BP-5 close.

**A. Add / reduce margin on an isolated position**

- [x] Pure action `adjustMargin(state, positionId, amount, ctx, mark)`, signed as Bybit (+ add, − reduce):
  - `extraMargin += amount`, and the balance moves the other way.
  - The leverage is unchanged; the liquidation / bankruptcy prices are re-derived (`positionRisk` already has the
    `extra` terms).
  - A journal line and a Balance History row ("Add margin for BTCUSDT: +$100.00").
  - Refusals answer 422 and write nothing, in Bybit's wording:
    - adding more than the available balance (`110014`);
    - reducing below 0 extra or past the max reducible (`110078`);
    - a change that would put the mark at or past the new liquidation price (`110011`);
    - no position (`110033`);
    - no fresh mark (`Waiting for live price…`).
- [x] Bybit's side effects of extra margin:
  - `settle` returns it pro rata on a partial close and in full on a close.
  - A same-side fill keeps it: it spreads over the merged size.
  - `setSymbolLeverage` **releases all of it** to the wallet.
  - `liquidatePosition` loses it (it is already in the bankruptcy price).
  - A funding shortfall comes out of IM first, then extra margin.
- [x] Route `POST /paper/positions/:id/margin` (`{ margin: signedDecimal }`, bounded, `additionalProperties: false`,
      rate-limited like the other mutations) and SDK `adjustPositionMargin`. The DTO's `positionIM` includes extra
      margin if testnet confirms Bybit reports it that way.
- [x] **UI (visual gate):** an "Add / reduce margin" dialog from the Positions row (Bybit: the pencil next to
      margin) with Add | Reduce tabs, the max amount, and the new liquidation price previewed.

**B. TP / SL trigger-by, reduce-only, close-on-trigger, validation**

- [x] Schema (one migration), with Bybit's names in the DTO / SDK fields:
  - `Position.tpTriggerBy`, `Position.slTriggerBy`, `Order.triggerBy`, `Order.tpTriggerBy`, `Order.slTriggerBy`
    (`LastPrice | MarkPrice | IndexPrice`, default `LastPrice`);
  - `Order.reduceOnly` and `Order.closeOnTrigger` (default false).
- [x] Engine:
  - `Quote` / `TickUpdate` carry `index` (the linear ticker's `indexPrice`).
  - `evaluateTick` picks each TP / SL and conditional trigger price by its trigger-by, and `checkTPSL` /
    `checkPendingTrigger` take the price source.
  - The backfill sweeps each trigger on its own source, which adds index-price candles (O8).
  - Fills are unchanged (ask / bid, taker).
- [x] **Reduce-only:**
  - It is rejected with no position, or when it would open or increase one, and it reserves no IM.
  - It is capped at the position size at fill time, and can't carry TP / SL.
  - A resting reduce-only order is cut back or cancelled when the position shrinks below it (furthest from the
    market first).
- [x] **Close-on-trigger:**
  - When a closing conditional triggers without the balance for its fee, the contract's other active orders are
    cancelled or reduced (and refunded) to make room.
  - It needs no margin.
  - TP / SL already close without margin, so this only affects user conditionals.
- [x] **Validation (O9)**, server-side in `updatePositionExits` / `placePending` / `editPending` and the spot TP / SL
      actions:
  - A long's TP must be above the trigger-by price now and its SL below (the reverse for a short), in Bybit's
    wording, on a fresh quote.
  - A stop-loss beyond the liquidation price is **accepted**. The client warns, and the backfill already lets the
    liquidation win (audit fix, §10).
  - The client edit panels switch from the entry price to the same last-price rule.
- [x] **UI (visual gate):** a trigger-by selector (Last / Mark / Index) next to TP / SL in the order form and the
      position TP/SL panel, plus Reduce-only and Close-on-trigger checkboxes in the order form (under the size, as
      on Bybit) with ⓘ tooltips.

**C. Risk-limit caps, tier info, partial liquidation**

- [x] Cap: refuse an order, a leverage change or an add-margin that would take the effective position value over the
      cap for the symbol's leverage (the highest tier with `maxLeverage` ≥ leverage).
  - Effective value = max(long position + long orders, short position + short orders), orders at mark, reduce-only
    excluded.
  - Bybit's `110090` wording, including the leverage to go down to.
- [x] Partial liquidation (O7): when the mark reaches the liquidation price of a position above the lowest tier:
  1. Reduce it by the part above the next lower tier, at the bankruptcy price, with the taker fee from the reserve
     and a `BustTrade` for that part.
  2. Re-derive the tier and liquidation price, and repeat.
  3. Close in full only in the lowest tier.

  The backfill uses the same step (one mark candle can take several steps).

- [x] **UI (visual gate, O6):** the leverage modal shows the tier, the max position value at the chosen leverage and
      the MMR; the Positions row shows the tier / MMR on hover.

**D. Closed P&L**

- [x] A **Closed P&L** tab (Bybit's name) for USDT Perpetual under the positions panel:
  - Columns: symbol, side, closed qty, entry price, exit price, closed P&L (net of both fees and the funding share),
    exit type (Trade / Liquidation), time.
  - Hover: open fee, close fee, funding.
  - Data: the `Trade` rows except `Funding`, already sent in the snapshot and capped at `MAX_HISTORY`.
- [x] Store the open-fee share on the closing `Trade` row (`Trade.openFee`, prorated like `funding`) so the row holds
      every input of Bybit's `closedPnl` — today the open fee is only in realized PnL. Add `avgEntryPrice` /
      `avgExitPrice` / `closedSize` aliases for the parity test.
- [x] **UI (visual gate).**

**E. Cross margin (O1–O3, O5 — same release as A–D, O4)**

- [x] `Account.marginMode` (`ISOLATED_MARGIN` | `REGULAR_MARGIN`, Bybit's values; account-wide as in UTA; default
      per O2), in one migration. Drop the unused per-symbol / per-position `marginMode` columns, or keep them as
      read-only mirrors for the DTO.
- [x] Account figures, pure in `bybitSpec` and mirrored in the SDK with a parity test:
  - margin balance = wallet (the USDT `balance` + every position's margin) + Σ unrealised PnL at mark;
  - total IM = Σ positions' mark-based IM + active orders' IM;
  - total MM = Σ mark-based MM;
  - account IM / MM rates, and available balance = margin balance − total IM.

  Spot orders keep locking their own funds; the USDT collateral ratio is 1.

- [x] Engine in cross:
  - An order is accepted while the account IM rate after it is ≤ 100% (not "IM ≤ balance").
  - Positions hold no isolated margin: IM is recomputed at mark on every evaluation.
  - A realized loss comes out of the wallet.
  - Funding is paid from the wallet; a shortfall raises the MM rate instead of moving one position's liquidation
    price.
- [x] Account liquidation:
  - The MatchingEngine evaluates a cross account's MM rate on every linear mark tick. The index is keyed by account
    as well as by market, since every linear market moves the rate.
  - At ≥ 100%: cancel orders that increase positions, then all orders. Then liquidate step by step in Bybit's
    contract order (C's tier-step code), re-checking after each step, at the bankruptcy price.
  - Each step writes a journal line, a Balance History row and a `BustTrade`.
  - The backfill replays the mark candles of every symbol the account holds, minute by minute.
- [x] The liquidation price per position in cross is an estimate (every other position held constant), shown as
      Bybit does.
- [x] Mode-switch action + `POST /paper/account/margin-mode` (Bybit's checks, O3), with a `3400045`-style refusal
      listing the reasons.
- [x] **UI (visual gate):**
  - a margin-mode control: the chip reads `Cross 10x ▾` / `Isolated 10x ▾`, with a mode modal like Bybit's;
  - an account bar with margin balance, available balance, the IM / MM rates and a cross MM-rate meter;
  - Positions show "Cross" and the estimated liquidation price;
  - a liquidation explainer for cross.

**F. Engine refinements deferred by the audit (§10)**

- [x] Funding during a stalled linear feed: the live clock settles at the last mark it saw, which may be minutes
      old. Settle at the mark candle when the last mark is older than the quote-age rule (10 s).
- [x] A close committed between a funding timestamp and its settlement is correctly charged from the balance, but
      its `Trade.funding` share misses that last fee. Attach it to the closed trade when the snapshot position is
      gone, as Bybit's Closed P&L would include it.
- [x] `settle` clamps a close's return at 0 while realized PnL books the full loss. A fill past the bankruptcy price
      is now rarer (the backfill liquidates first — audit fix), but realized PnL should book only what was lost.
- [x] Funding for a position opened and fully closed while the engine was down (§8): the backfill snapshots only
      open positions. Source the snapshot for each missed timestamp from position history in the gap (the
      `Trade` rows' `openedAt` / `executedAt` and quantities) so it is charged as on Bybit (raised in PR #143's
      review).

**G. API-parity test (Bybit testnet)**

- [x] A manual-run script (not CI; testnet keys from `config.ts`, never logged) that replays a fixed scenario on
      Bybit testnet and on the paper engine, then diffs the v5 fields:
  - Scenario: market / limit / conditional orders, merge, partial close, flip, leverage change, add / reduce margin,
    TP / SL by each trigger, funding, liquidation.
  - Fields: `position/list`, `execution/list`, `position/closed-pnl` and `account/wallet-balance`.
  - Fill prices differ (there is no shared book), so it compares the maths given the same fills.
- [x] One adapter in `mappers.ts` maps the engine DTOs to Bybit's field names, so the test compares like with like.

**Tests and docs**

- [x] Engine:
  - add / reduce margin: refusals, the liquidation price moving, pro-rata partial close, release on a leverage
    change;
  - trigger-by per source, live and backfill;
  - reduce-only caps and cancels, and close-on-trigger freeing margin;
  - last-price validation and the risk-limit cap;
  - partial liquidation stepping down tiers;
  - cross: account rates, order acceptance, account liquidation order, funding.
- [x] Services: index keyed per cross account; a mark tick of any symbol re-evaluates the account; backfill across
      symbols; the mode switch.
- [x] Client: store mapping of the new DTO fields (optional for an older server) and the new dialogs / tabs.
- [x] `TRADING_TEST_PLAN.md` §17 (BP-5), `APP_LOG.md`, the `paper-trading-logic` skill, and §8 updated.

**Implementation notes (2026-09-27, `feat/bybit-parity-bp5`)** — where the build chose or deviated:

- **Commits:** 67e7e0e decisions · 613e065 Step 0 · d3e09dd A · a204fcc B · eb610c6 C · 0ee1549 D · 05c10cf E
  server · 32dda84 E client · d9d5420 E order-form estimate · 4b3acdf F · 44a62e5 G. Migrations:
  `bp5_trigger_by_reduce_only`, `bp5_trade_open_fee`, `bp5_cross_margin` (additive; the last sets every existing
  account to `ISOLATED_MARGIN` with `marginModeNotice`).
- **B:** a stop order's `triggerBy` is in the API and the engine; the order form exposes Last / Mark / Index only
  beside TP and SL, as the visual gate agreed. The O9 refusal text copies Bybit's retMsg
  (`…should be higher than base_price:…??LastPrice`). Spot TP / SL already had its own side check. A price-side
  refusal with no fresh price answers 422 "Waiting for live price…", like the other engine refusals.
- **B, close-on-trigger:** behaves as reduce-only. A close here never needs free margin (its fee comes out of the
  position), so Bybit's "cancel other orders to free margin" has nothing to do.
- **C:** the effective value counts positions and orders at the mark when one is known, else at their own price.
  Partial liquidation keeps the tier by the position's entry-price value (isolated maths). The backfill carries the
  minute's worst mark (`worstMark`), so one candle can take several steps.
- **E, cross liquidation price:** Bybit shows an estimate; the server leaves `liqPrice` / `bustPrice` out of a cross
  position and the client estimates them live (`crossLiqPriceEstimate`, parity-tested against the server's
  `accountFigures`). A cross liquidation step closes at the estimated bankruptcy price — where closing the whole
  position, with the taker fee, leaves a 0 margin balance — so each step loses the closed share of the account's
  equity. A rounding shortfall left once nothing is open is written off (Bybit's insurance fund).
- **E, backfill:** a cross account is re-checked on each replayed minute at that symbol's worst mark, with the other
  symbols at their last live marks (not a minute-by-minute replay of every symbol's mark candles).
- **E, one-time notice:** shown in the positions panel while the account is isolated and `marginModeNotice` is set;
  dismissal is per browser (localStorage). A mode switch clears the server flag.
- **F:** funding settles at a live mark only if it was seen within 10 s of the timestamp, else at the mark candle. A
  late fee for a closed position updates that close's Trade row (funding, net PnL) — the browser sees it after the
  next snapshot, not live. The backfill reads positions closed since a missed timestamp from the closing Trade rows
  (`AccountRepository.closedPositionsAt`, capped at 5,000 rows).
- **G:** the parity run is written and type-checked but has **not been run** — it needs the owner's Bybit testnet
  keys; the O5 (unrealised profit) and max-reducible-margin questions stay open until it has.

---

## 5. Persistence & migration

**Server (Prisma)**, the source of truth from BP-1 onward:

- `Position`: add `category`, `leverage`, `marginMode`, `extraMargin`, `version`. **BP-2 added** `category`, `leverage`,
  `marginMode`, `entryFee`, `closeFeeReserve`; BP-3 added `extraMargin`. The per-row `version` was superseded by
  `Account.version` (BP-1).
- `Order`: add `category`, `isMaker`, `feeRate`, `triggerBy`, `reduceOnly`, `version`. **BP-2 added** `category`,
  `reserved`, `feeRate`, `feeAsset`, `isMaker`, `ocoGroup`. `triggerBy` / `reduceOnly` (+ `closeOnTrigger`) moved to
  BP-5 B; `version` superseded by `Account.version`.
- **BP-2 also added** `Trade.category`, `SymbolSetting` (per-symbol leverage / margin mode) and `SpotBalance`
  (`free`, `locked`, `avgCost`, non-negative CHECK).
- `Trade`: add `category`, `fee`, `feeAsset`, `execType` (`Trade | BustTrade | Funding`, Bybit's own `execType`
  values), mirroring Bybit's execution list. As built: the fee is `Trade.commission` (linear fees are always USDT, so
  there is no `Trade.feeAsset`); `execType` landed in BP-3 / BP-4, and **BP-4 added** `Trade.feeRate`, `Trade.funding`,
  `Position.cumFunding` and `SymbolSetting.lastFundingAt` (+ `leveragePinned`).
- **BP-3 added** `Position.extraMargin` (default 0), `Trade.execType` (`Trade` | `BustTrade`) and `Order.createType`
  (`CreateByLiq` for liquidations). Liquidation / bankruptcy prices are derived, not stored. The same migration
  merges existing same-side positions (one-way mode) and sets each symbol's leverage to its position's.
- New tables:
  - `SpotBalance`: `accountId`, `coin`, `free`, `locked`, `avgCost`.
  - `JournalEntry`: `accountId`, `time`, `text`, `isUserNote`, `pnl?`.
- All new columns get defaults (`category = 'linear'`), so the migration needs no backfill script.
- ~~One-off journal import at BP-1 rollout~~: dropped. BP-1 started fresh (§4 BP-1).

**Client (`paperStore`, persist key `cd-paper-trading`)**

- Version bump. After BP-1 the persisted data is only a cache, so the migration can simply drop the old shape and let
  the server hydrate.
- `COMMISSION_RATE` stays exported **only** for legacy display of old rows (or is removed once no reader remains).
  **Removed** — the server reads legacy rows at `LEGACY_FEE_RATE` (`bybitSpec.ts`).

---

## 6. Rollout order and risk

| Step | Risk                                            | Mitigation                                                                                                                   |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| BP-0 | Feed regressions (chart, prices)                | Ship alone; compare old and new feeds side by side in dev                                                                    |
| BP-1 | Biggest change: execution moves to the server   | Pure-port rule; existing tests ported first; shipped as one PR with no fallback flag (owner's choice)                        |
| BP-2 | UI changes                                      | Visual Q&A gate; spot and perps behind the market switch                                                                     |
| BP-3 | Users get liquidated for the first time         | In-app explainer + one-time notice at deploy; liquidation price visible before submit; no grace period (as on Bybit)         |
| BP-4 | Balance moves while user is away                | Every funding payment in the journal and Balance History                                                                     |
| BP-5 | Cross margin: one position can drain the wallet | O1–O3 answered (cross offered, new accounts Cross); one release (O4); mode modal + cross liquidation explainer (visual gate) |

---

## 7. Out of scope (deliberately not copying Bybit)

- Hedge mode (two-way positions): one-way only.
- Spot margin trading, borrowing and interest.
- Order-book depth simulation, slippage beyond best bid/ask, partial fills, ADL, insurance fund.
- VIP fee tiers, fee coupons, USDC contracts, inverse contracts, options.
- Proposed for BP-5 (owner to confirm, O10 / O12): auto-add margin (AMR) and Partial-mode TP / SL.

---

## 8. Known deliberate gaps vs Bybit

| Gap                                                                                                               | Why                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Leverage capped at 10× (Bybit allows far more)                                                                    | Safety cap for a learning app                                                       |
| Fills at top of book only, no depth                                                                               | Simplicity; fine for small orders                                                   |
| Liquidation settles instantly at bankruptcy price                                                                 | No liquidation engine / insurance fund                                              |
| Limits trigger on the last price, not the book                                                                    | No order-book simulation (§7)                                                       |
| A backfilled trigger (server was down) fills at the level it crossed, with the taker fee                          | There is no quote for the past                                                      |
| Spot TP / SL are placed or cancelled, not edited                                                                  | Cancel and place again                                                              |
| A TP / SL pair attached to a spot buy uses the exact coins received (net of the fee), not floored to the qty step | Engine triggers have no instrument rules; the pair still sells correctly            |
| Cross liquidation closes each step at an estimated bankruptcy price (the account's equity share)                  | No liquidation engine / order book; Bybit takes positions over at bankruptcy (BP-5) |
| A cross account's backfill uses the other symbols' last live marks, not their mark candles for that minute        | One market's gap replays that market only (BP-5 E)                                  |
| Auto-add margin, Partial-mode TP / SL, portfolio margin                                                           | Left out (O10, O12; §7)                                                             |
| A late funding fee for a closed position reaches its Closed P&L row after the next snapshot, not live             | The closed row isn't re-sent in a delta (BP-5 F)                                    |

---

## 9. Open questions

None blocking. Resolved on 2026-09-25: Q1 → D2, Q2 → D9 (server engine), Q3 → D7, Q4 → D8.
Resolved on 2026-09-26 for BP-3: mimic Bybit as closely as possible (the app will later be tested against Bybit's
APIs). That means merging same-side fills, re-margining in BP-3, every chart line Bybit draws, and no grace period at deploy.

**Resolved on 2026-09-27 for BP-5:** owner decisions O1–O12 in §4 BP-5 — offer cross margin, new accounts start in
Cross, Bybit's switch rules, one BP-5 release (not split), partial liquidation, Last / Mark / Index triggers, Bybit's
TP / SL validation, no auto-add margin, the old API removed after a logging release, Full TP / SL only.

---

## 10. Open points and integration audit after BP-4 (2026-09-27)

Every open, deferred or "follow-up" item in this plan and in `TRADING_TEST_PLAN.md` §12–16 was checked against
the code (branch `fix/bybit-parity-bp5-audit`, on top of BP-4). BP-0 … BP-4 were also read end to end together
for cross-phase bugs.

**Open points**

| #   | Item (source)                                                                                 | Status (evidence)                                                                                                                                          | Goes to                                          |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | `fetchWithRetry` / breaker on Bybit REST (BP-0 follow-up)                                     | Done in BP-3 (`infra.ts`, `BybitMarketInfo.ts`, `routes/market`); the BP-0 note was stale                                                                  | Closed (note updated)                            |
| 2   | Refuse a stop-loss beyond the liquidation price (BP-3 follow-up, §8)                          | Not refused (`updatePositionExits` `actions.ts:1008`) — and **Bybit doesn't refuse it either** (help centre, 2026-09-13); Bybit checks TP/SL vs last price | BP-5 B (O9): last-price validation + UI warning  |
| 3   | Partial liquidation of higher tiers (BP-3 follow-up, §8)                                      | Open: `liquidatePosition` closes in full (`actions.ts:662`)                                                                                                | BP-5 C (O7)                                      |
| 4   | `PATCH /paper/account/leverage` still served (BP-3 follow-up)                                 | Open (`routes/paper/index.ts:551`, "remove in BP-3"); no client caller                                                                                     | BP-5 Step 0 (O11)                                |
| 5   | Pre-BP-2 `usdtAmount` sizing "during the deploy window" (BP-2)                                | Still accepted (`routes/paper/index.ts:99-110`)                                                                                                            | BP-5 Step 0 (O11)                                |
| 6   | Full API-parity test against Bybit testnet (BP-3 / BP-4 follow-up)                            | Open: no test exists                                                                                                                                       | BP-5 G                                           |
| 7   | Closed P&L view with the funding share (BP-4 E)                                               | Data done (`Trade.funding`, DTO, store); no view (`OrderAccountManagementPanel.tsx:50`)                                                                    | BP-5 D                                           |
| 8   | Cross margin; risk-limit caps + tier UI; add/remove margin; trigger-by etc. (BP-5)            | Open (see BP-5 "Where the code stands")                                                                                                                    | BP-5 A–C, E                                      |
| 9   | §5: `Position.version` / `Order.version`, `triggerBy` / `reduceOnly` "wait for BP-3"          | Superseded (`Account.version`) / moved to BP-5 B                                                                                                           | Closed (§5 updated)                              |
| 10  | §5: `Trade.fee` / `feeAsset`; `COMMISSION_RATE` "removed once no reader remains"              | Fee is `Trade.commission` (no `Trade.feeAsset`); `COMMISSION_RATE` is gone                                                                                 | Closed (§5 updated); field aliases in BP-5 D / G |
| 11  | §8 rows "closed by BP-3" (same-side merge, leverage lock, close fee at entry)                 | Stale                                                                                                                                                      | Closed (rows removed)                            |
| 12  | §8: a position closed during engine downtime isn't charged funding                            | Open by design                                                                                                                                             | BP-5 F (kept in §8 until then)                   |
| 13  | §8: spot TP / SL can't be edited                                                              | Open (`spot.ts` refuses the edit)                                                                                                                          | BP-5 (low) — or keep in §8                       |
| 14  | §8: other deliberate gaps (10× cap, top-of-book fills, instant bankruptcy settle…)            | Deliberate                                                                                                                                                 | Won't do (§7 / safety)                           |
| 15  | BP-4 E: est. funding row in the order form                                                    | Declined in the visual gate (Bybit has none)                                                                                                               | Closed (marked declined)                         |
| 16  | Test plan 12.1.1–12.1.3, 13.2.x, 13.3.x (live feed, tab closed, two tabs, refresh)            | Logic unit-tested (`market.test.ts`, `services.test.ts`, `paper.test.ts`, `usePaperFeed.test.tsx`); the ⬜ rows are manual browser checks (no Playwright)  | Manual check at the next release                 |
| 17  | Test plan 12.2.5 (`setPaneCategory` via devtools), 12.2.6 (positions priced from spot)        | Superseded by the BP-2 market switch / fixed (positions priced by `category:symbol`, mark since BP-3)                                                      | Small doc fix: close the rows                    |
| 18  | Test plan 14.1.10, 14.6.7, 15.6.2 (URL on Trade menu, Assets → TP/SL modal, mark-line toggle) | Logic covered; no component test for the click path                                                                                                        | Small: add RTL tests with BP-5 UI work           |
| 19  | Test plan 15.4.9 (deploy with a position already past liquidation), 15.6.6 (drag feel)        | One-off deploy check / done manually (APP_LOG BP-3 notes)                                                                                                  | Mark done at the next test-plan pass             |

**Integration audit: cross-phase bugs found and fixed** (each a separate `fix:` commit with a regression test that
failed before the fix):

| Severity | Where                                                              | Scenario                                                                                                                                                                                                                                                                                                  | Fix / test                                                                                                                                                          |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | `TradingService.runTrigger` + `triggers.evaluateCandle`            | BP-1 backfill × BP-3 / BP-4: a backfilled trigger ran with the wall clock, so a position a backfilled fill opened had `openedAt = now`. Every later candle of the gap skipped it (`candle.start < openedAt`): its TP / SL and liquidation were missed. Every funding timestamp in the gap skipped it too. | Backfilled triggers carry `at` = the candle's last millisecond; the engine stamps the records then. `services.test` "should stamp a backfilled fill at its candle…" |
| High     | `MatchingEngine` funding (BP-4 × lease handoff)                    | A restart / handoff just after a funding timestamp — including mid-settlement, which the held-back lease progress was meant to replay — backfilled a history that didn't list the timestamp yet. The live clock had already moved on, so the settlement was never made.                                   | The first ticker after a takeover marks `next − fundingIntervalHour` due if it fell in the downtime; dropped if Bybit never lists it. Two `services.test` cases     |
| Medium   | `MatchingEngine.runFunding` (BP-4 × account deletion)              | An account deleted between a timestamp and its settlement made every write fail. It was retried forever, holding `EngineLease.lastTickAt` before the timestamp, so every restart re-backfilled an ever-growing gap.                                                                                       | A confirmed-deleted account is dropped and evicted. `services.test` "should drop a deleted account's settlement…"                                                   |
| Medium   | `triggers.evaluateCandle` (BP-3 backfill × SL accepted beyond liq) | A minute that crossed both a stop-loss set beyond the liquidation price and the liquidation price closed the position at the stop (past bankruptcy). The return was clamped at 0 while realized PnL booked more than the margin, and no liquidation was recorded. Bybit never fills such a stop.          | Liquidation wins when the hit stop is at / beyond the liquidation price. `liquidation.test` "should liquidate, not stop out…"                                       |
| Low      | `settleFunding` (BP-4 × reset)                                     | A reset between a timestamp and its (delayed) settlement wiped the positions and the funding marker, and the fresh 10,000 USDT account was then charged for positions it never held.                                                                                                                      | `AccountState.resetAt` (from `Account.lastReset`); a timestamp before it is a no-op. `funding.test` "should not charge a fresh account…" + repository load test     |

**Checked and found consistent:**

- **Spot vs linear separation.** Every path keys by `category:symbol`: the index, ticks, gap / downtime backfill
  (each market its own candles; mark candles and funding linear only), the funding clock (linear ticks only), the
  snapshots (linear positions only), liquidation's order cancel (linear only), the private-WS price push and
  re-margining (linear orders only).
- **One-way merge.** It keeps `cumFunding`, `extraMargin` and the TP / SL rules. Partial close and netting prorate
  margin, fees, reserve and `cumFunding`; a flip starts a clean position. The BP-3 merge migration sums stored values
  only and writes one pinned `SymbolSetting` per symbol.
- **Liquidation × funding.** A funding shortfall reduces IM, which raises the liquidation price; the next mark tick
  liquidates at the bankruptcy price derived from the reduced IM. Liquidation carries the whole `cumFunding` as the
  closed trade's funding share. A snapshot position liquidated after the timestamp is charged from the balance.
- **Re-margining.** `setSymbolLeverage` recomputes IM from qty × entry (restoring any funding shortfall from the
  wallet) and re-estimates the reserve at the new bankruptcy price. `cumFunding` is untouched. `extraMargin` is not
  handled yet (always 0; BP-5 A).
- **`closeFeeReserve` rules.** Legacy 0 / 0.07%-of-margin rows, BP-2 entry-price rows and BP-3 bankruptcy-price rows
  are all used as stored through merge (summed), partial close (prorated) and liquidation (charged in full).
- **`isEmptyDelta` and the repository.** `isEmptyDelta` compares every `Delta` field. `AccountRepository` writes
  every field it reads: `leveragePinned` separates leverage rows from funding-marker rows (BP-4 review fix). A reset
  wipes positions, orders, trades (fundings included), journal, balance history, `SymbolSetting` (markers included)
  and spot balances.
- **DTO ↔ client store.** Every BP-3 / BP-4 field is optional on the wire and mapped to "unknown" or 0 correctly for
  an older server (`paperStore.ts` `positionFrom`, `mapServerState`, `applyDelta`).
- **Migrations.** They apply in order on pre-BP-2 / BP-3 rows. BP-2 backfills stored fees, BP-3 merges and pins
  leverage, and BP-4 and its marker fix are additive; the Prisma schema matches the mappers.

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
- [Bybit — Differences Between the Margin Modes Under the UTA](https://www.bybit.com/en/help-center/article/Differences-Between-the-Margin-Modes-Under-the-Unified-Trading-Account)
- [Bybit — Margin Calculations Under Different Margin Modes](https://www.bybit.com/en/help-center/article/Margin-Calculations-Under-Different-Margin-Modes)
- [Bybit — UTA Trading Rules / Liquidation Process](https://www.bybit.com/en/help-center/article/UTA-Trading-Rules)
- [Bybit — Risk Limit (Perpetual and Futures)](https://www.bybit.com/en/help-center/article/Risk-Limit-Perpetual-and-Futures)
- [Bybit — Introduction to Take Profit / Stop Loss](https://www.bybit.com/en/help-center/article/Introduction-to-Take-Profit-Stop-Loss-Perpetual-Futures-Contracts)
- [Bybit — Reduce-Only Order](https://www.bybit.com/en/help-center/article/Reduce-Only-Order) ·
  [Close-On-Trigger Order](https://www.bybit.com/en/help-center/article/Close-On-Trigger-Order)
- [Bybit — Profit/Loss Calculations (USDT Contract)](https://www.bybit.com/en/help-center/article/Profit-Loss-calculations-USDT-Contract)
- [Bybit API v5 — Set margin mode](https://bybit-exchange.github.io/docs/v5/account/set-margin-mode) ·
  [Wallet balance](https://bybit-exchange.github.io/docs/v5/account/wallet-balance) ·
  [Add / reduce margin](https://bybit-exchange.github.io/docs/v5/position/manual-add-margin) ·
  [Risk limit](https://bybit-exchange.github.io/docs/v5/market/risk-limit) ·
  [Create order](https://bybit-exchange.github.io/docs/v5/order/create-order) ·
  [Closed P&L](https://bybit-exchange.github.io/docs/v5/position/close-pnl) ·
  [Error codes](https://bybit-exchange.github.io/docs/v5/error)
