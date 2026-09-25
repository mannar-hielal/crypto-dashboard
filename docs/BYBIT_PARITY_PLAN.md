# Bybit Parity Plan — Spot + USDT Perpetual

> **Status:** Planned · Not started · No implementation until explicitly instructed.
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

| #   | Decision                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Two markets, like Bybit: **Spot** (1×, no leverage) and **USDT Perpetual** (leverage, long + short).                                                                                               |
| D2  | **Spot works like a normal spot market**: buy coins with USDT, sell only coins you hold. No shorting.                                                                                             |
| D3  | Today's behaviour (leverage, long/short, netting) becomes the **USDT Perpetual** market, using Bybit's own naming.                                                                                 |
| D4  | Use **Bybit's real fees** (VIP 0) and drop the flat 0.07% `COMMISSION_RATE`.                                                                                                                      |
| D5  | Order of work: data foundation → **server trading engine** → market split + fees + fill prices → mark price + isolated liquidation → funding → cross margin and refinements (§4).                 |
| D6  | Data feeds, fill prices and fee rules follow Bybit as closely as possible. Where we deliberately differ, the gap is written down (§8).                                                             |
| D7  | **New users start on Spot.** Existing users' positions migrate to USDT Perpetual.                                                                                                                  |
| D8  | **One shared USDT wallet** for Spot and Perpetual, as in Bybit's Unified Trading Account.                                                                                                          |
| D9  | **The server executes all trades and checks them 24/7** (option B). The browser sends order _requests_ and displays the state the server sends back, the way Bybit's own app works. Replaces "client is source of truth" (`APP_LOG.md`, Paper Trading Phase 3 Sync). |

### Naming ("labelled as Bybit")

Use Bybit's own product names rather than the Bybit brand:

- Market switch: **Spot** | **Derivatives** (Bybit's top-level split); contract type label **USDT Perpetual**.
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
| Maintenance margin              | n/a                                                                           | Tier from `/v5/market/risk-limit` (BTCUSDT tier 1 MMR = 0.5%)                                    |

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

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                                                                           | Fixed in    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| F1  | **Chart history and live data come from different markets.** History tries `category=linear` first, with spot as a fallback. The live klines and tickers WS is **spot** only, so the chart can jump where history meets live data (perp/spot basis is usually a few dollars, sometimes tens).                                                                                                                                                                                              | `routes/market/index.ts:100` (`BYBIT_KLINE_CATEGORY_ORDER`), `BybitWebSocketManager.ts:33-34` | BP-0        |
| F2  | **Bid/ask probably never arrive.** Bybit's _spot_ `tickers` stream has no `bid1Price`/`ask1Price` (checked live 2026-09-25: spot snapshot fields are `symbol,lastPrice,highPrice24h,lowPrice24h,prevPrice24h,volume24h,turnover24h,price24hPcnt,usdIndexPrice`). `parseTicker` returns `null` whenever bid/ask are missing, so no `ticker` message should ever reach the client. The Sell/Buy buttons would then fall back to `latestPrice`, and the spread badge would show `—`. **Verify in the running app.** `APP_LOG.md` still says the feed uses `orderbook.1`, but `bybit.ts:185` only subscribes `kline` + `tickers`. | `BybitWebSocketManager.ts:398-432`, `plugins/bybit.ts:184-185`                                  | BP-0        |
| F3  | **Market orders fill at last price**, not at the best ask (buy) or best bid (sell).                                                                                                                                                                                                                                                                                                                                                                                                         | `TradingPanel.tsx:147` (`execPrice = latestPrice`)                                              | BP-2        |
| F4  | **Resting limit orders can fill better than their limit.** When `latestPrice` has already crossed the limit, the fill is at `latestPrice`. On Bybit a resting limit fills **at its limit price** (maker).                                                                                                                                                                                                                                                                                  | `usePendingOrderMonitor.ts:27-30`                                                               | BP-2        |
| F5  | **One flat fee (0.07%) for every order and market**, with no maker/taker split.                                                                                                                                                                                                                                                                                                                                                                                                             | `paperStore.ts:25` `COMMISSION_RATE`                                                            | BP-2        |
| F6  | **Leverage is account-wide** (Account Settings modal). On Bybit leverage is **per symbol** and set on the order form, and positions don't record their leverage.                                                                                                                                                                                                                                                                                                                         | `paperStore.ts:412`, `Position` interface `paperStore.ts:36-46`                                 | BP-2 / BP-3 |
| F7  | **Leveraged positions have no liquidation, no mark price and no funding**, so leverage costs nothing and can't wipe you out.                                                                                                                                                                                                                                                                                                                                                                | `paperStore`, `useTPSLMonitor`                                                                  | BP-3 / BP-4 |
| F8  | **Shorting is allowed on everything.** Bybit spot cannot short.                                                                                                                                                                                                                                                                                                                                                                                                                            | `paperStore.placeOrder`                                                                         | BP-2        |
| F9  | **Lot and tick sizes are hard-coded** in the client instead of coming from Bybit's `instruments-info`. They also differ between spot and linear.                                                                                                                                                                                                                                                                                                                                         | lot-step logic (see TRADING_TEST_PLAN §6 note)                                                  | BP-0 / BP-2 |
| F10 | **Nothing is monitored while the browser is closed.** TP/SL and pending fills only run in an open tab, although positions are saved in the DB for every logged-in user. Bybit keeps running 24/7.                                                                                                                                                                                                                                                                                         | `useTPSLMonitor`, `usePendingOrderMonitor`                                                      | BP-1        |
| F11 | **The browser decides fill prices and PnL, and the server stores whatever it's sent.** A user can post their own fill price or balance through the `/paper` API. That doesn't matter much today, but it will for leaderboards, the Phase 6 bot's track record, or anything else that compares users.                                                                                                                                                                                    | `paperStore.ts` → `paperApi.createOrder/createPosition/updateAccount`                           | BP-1        |

---

## 4. Phases

Every phase that touches UI goes through the **visual Q&A gate** (`session-bootstrap`) before implementation.
Every phase ends with the `security.md#verify-a-refactor-is-safe` checklist and all pre-commit gates green.

### BP-0 — Data foundation (prerequisite, no visible trading change)

Goal: each market reads **all** of its data (history, live candles, quotes) from its own Bybit category. The engine in
BP-1 needs this feed on the server anyway.

**Server**

- [ ] Run **two** `BybitWebSocketManager` instances: `…/v5/public/spot` and `…/v5/public/linear`. Pass the category
      into the constructor instead of hard-coding spot.
- [ ] Spot: add an `orderbook.1.{symbol}` subscription to get best bid/ask. Merge it with spot `tickers` (for `lastPrice`)
      into one `TickerUpdate`. Bybit spot allows **max 10 args per subscribe request**, so batch the 9 symbols × 3 topics.
- [ ] Linear: `tickers` already carries `bid1Price/ask1Price/markPrice/indexPrice/fundingRate/nextFundingTime/fundingIntervalHour`.
      Extend `parseTicker` to keep those fields and to merge deltas per field (linear deltas often carry only bid/ask).
- [ ] Fix `parseTicker` so that a missing bid/ask no longer drops `lastPrice` updates (F2).
- [ ] `CandleAggregator` / `IndicatorCalculator` / ring buffers keyed by `(category, symbol)`, not `symbol`. Check the
      memory bound: 2× the current buffers.
- [ ] History endpoint: require an explicit `category` query param (`spot | linear`, allow-listed) and **remove the
      linear→spot fallback** (F1). Keep the existing Bybit error typing, retry and circuit breaker.
- [ ] New cached endpoint `GET /market/instruments?category=` returns tick size, qty step, min qty/notional and max
      leverage for the 9 symbols, from `/v5/market/instruments-info`. Refresh every few hours. Add
      `GET /market/risk-limit?symbol=` (linear only) from `/v5/market/risk-limit`.
- [ ] Client WS subscribe message includes `category`. The server validates it against an allow-list, like symbols and intervals.

**SDK (`generated/CDSDK`)**

- [ ] `WsMessage` ticker: add `category`, plus optional `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime`,
      `fundingIntervalHour`. New `Instrument` and `RiskLimitTier` types.

**Client**

- [ ] `layoutStore.PaneConfig` gets `category: 'spot' | 'linear'`. Persist version bump + migration: existing layouts
      default to `'linear'` (their trading behaviour becomes perps), new users default to `'spot'` (D7).
- [ ] `paneStore` stores `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime` alongside `bid/ask`.
- [ ] `usePaneFeeds` subscribes with the pane's category. `lastKnownPrices` is keyed by `category:symbol`.
- [ ] Sync-symbol in multi-pane also syncs category.

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

**Server**

- [ ] `apps/server/src/trading/engine/`: **pure functions** (no Prisma, no I/O) for triggering and filling orders.
      Example: `evaluateTick(tick, openOrders, openPositions) → Event[]`. They are the port of `checkTPSL`,
      `usePendingOrderMonitor`'s trigger logic and `paperStore`'s netting/close math. Being pure, they can be tested on
      recorded price ticks with no browser.
- [ ] `MatchingEngine` service:
  - On boot, loads all open orders and positions into an in-memory index keyed by `(category, symbol)`.
  - On every tick, evaluates only that symbol's bucket.
  - Writes each result in **one Prisma transaction**. An optimistic `version` column on `Order`/`Position` makes
    double fills and double closes impossible.
- [ ] **Order API** replaces today's "client sends the result" calls:

| Endpoint | Purpose |
| --- | --- |
| `POST /paper/orders` | Place an order |
| `DELETE /paper/orders/:id` | Cancel an order |
| `PATCH /paper/orders/:id` | Amend an order |
| `PATCH /paper/positions/:id/tpsl` | Change a position's TP/SL |
| `POST /paper/positions/:id/close` | Close a position |

  The client sends **intent only** (symbol, side, type, qty or USDT amount, price, TP/SL). The server picks the fill
  price and computes the fee and PnL (F11). The old endpoints that accept client-computed balances and positions are
  removed. The **legacy local→server migration push in `syncWithServer`** goes too; it is also part of the logout data-leak
  task.
- [ ] **Private WS channel**, authenticated with the same JWT as REST (Bybit calls these its private
      `order` / `position` / `execution` / `wallet` topics). The server pushes every state change to all of that user's
      open tabs.
- [ ] **Journal moves to the DB** (new `JournalEntry` table). Events that happen while the browser is closed ("SL hit
      at 03:14") must still show up in the journal.
- [ ] **Money math uses decimals** (Prisma `Decimal` / decimal.js), not JS floats, to avoid rounding drift over thousands
      of fills.
- [ ] **Resilience:**
  - If the Bybit WS drops or the server restarts, backfill the gap: take last-price klines from
    `/v5/market/kline` for the missed interval and run them through the same pure functions (candle high/low, as the
    client does today).
  - Leave a log line and a metric for every backfill.
- [ ] **Single executor:** exactly one engine instance may execute trades. Take a Postgres advisory lock at start-up;
      other Fly.io machines serve reads and WS but never run the engine.
- [ ] **Order endpoints get a rate limit**, and all input is validated with allow-listed enums and finite, positive,
      bounded numbers (`web.md`, `security.md`).

**Client**

- [ ] `paperStore` becomes a **read model**. It's hydrated from REST on load, then kept up to date by the private WS.
      Actions call the order API. It keeps the optimistic "pending…" UI state, and the server's response replaces it.
- [ ] Remove `useTPSLMonitor` and `usePendingOrderMonitor` (the server does this now). Sounds and toasts are driven by
      the events the server pushes.
- [ ] `localStorage` (`cd-paper-trading`) becomes a disposable cache, scoped to the user id and cleared on logout.

### BP-2 — Market split, Bybit fees, Bybit fill prices

All trading rules below are implemented **in the server engine**. The client only gets UI and display.

**Market switch (UI, visual Q&A first)**

- [ ] Spot / Derivatives switch at the **top of the TradingPanel** (Bybit places it there). It sets the active pane's
      category. The symbol picker shows the Perpetual tag in perps mode.
- [ ] **Spot order form:** no leverage, Buy / Sell. Sell is limited to the free balance of the base coin, with a "Max"
      that fills the held quantity.
- [ ] **Perps order form:** margin-mode + leverage chip on the form (`Isolated 10.00x`, Bybit layout). Leverage moves out
      of the Account Settings modal and becomes **per symbol** (F6). The `MAX_LEVERAGE = 10` cap stays and is enforced
      on the server.
- [ ] Bottom panel: in Spot mode Bybit has **no positions**, it has **Assets**. Add an Assets view (coin, balance,
      available, locked in orders, avg cost, last price, unrealised PnL) and hide the Positions tab for spot.

**Account model (Bybit UTA, D8)**

- [ ] One USDT wallet shared by both markets, starting at 10,000 USDT. Spot adds per-coin holdings:
      `{ coin, free, locked, avgCost }`.
- [ ] **Spot buy:** USDT −= qty × price; coin += qty − fee (fee in base coin).
- [ ] **Spot sell:** requires `free ≥ qty`; coin −= qty; USDT += qty × price − fee (fee in USDT).
      Realised PnL = (sell − avgCost) × qty − fees.
- [ ] Spot limit buy locks USDT; spot limit sell locks coin. Spot TP/SL are conditional sell orders that lock the coin.
- [ ] Perps: position stores `category`, `leverage`, `marginMode`, `positionMargin` (IM). Netting/one-way behaviour unchanged.

**Fees (F5)**

- [ ] Replace `COMMISSION_RATE` with `feeRate(category, liquidity)` from `bybitSpec.ts`.
- [ ] Liquidity rules:

| Order                                                    | Liquidity |
| -------------------------------------------------------- | --------- |
| Market, stop (conditional → market), TP/SL, liquidation  | **Taker** |
| Limit that crosses the book at placement                 | **Taker** |
| Limit that rests and later fills                         | **Maker** |

- [ ] Perps order cost (what's reserved) = IM + fee to open + estimated fee to close (Bybit's "order cost").
- [ ] Every fill records `fee`, `feeRate`, `feeAsset`, `isMaker`. The UI shows the fee in the asset it was charged in.
- [ ] Old history keeps its 0.07% values. **Never recompute past trades.**

**Fill prices (F3, F4)**

- [ ] Market buy fills at **ask**, market sell at **bid**, using the server's latest quote. If the quote is stale, reject
      with "Waiting for live price…" rather than using last price.
- [ ] A resting limit fills **at its limit price**. A limit that crosses the book at placement fills at the current
      ask/bid (taker).
- [ ] Stops and TP/SL trigger on **last price**. Once triggered, they fill as a market order at ask/bid (taker).
- [ ] Qty/price rounding uses `qtyStep`/`tickSize` from the instruments cache. Orders below `minOrderQty` or
      `minNotionalValue` are rejected with Bybit's wording (F9).

**Shorting (F8)**

- [ ] Spot: `side = sell` without enough coin is rejected by the engine. Perps: unchanged.

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

- `Position`: add `category`, `leverage`, `marginMode`, `extraMargin`, `version`.
- `Order`: add `category`, `isMaker`, `feeRate`, `triggerBy`, `reduceOnly`, `version`.
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

| Step | Risk                                                          | Mitigation                                                                                                                                  |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| BP-0 | Feed regressions (chart, prices)                              | Ship alone; compare old and new feeds side by side in dev                                                                                   |
| BP-1 | Biggest change: execution moves to the server                  | Pure-port rule; existing tests ported first; feature flag lets the client fall back to local execution for one release                     |
| BP-2 | UI changes                                                    | Visual Q&A gate; spot and perps behind the market switch                                                                                    |
| BP-3 | Users get liquidated for the first time                        | In-app explainer + liquidation price always visible before submit                                                                           |
| BP-4 | Balance moves while user is away                               | Every funding payment in the journal and Balance History                                                                                    |

---

## 7. Out of scope (deliberately not copying Bybit)

- Hedge mode (two-way positions): one-way only.
- Spot margin trading, borrowing and interest.
- Order-book depth simulation, slippage beyond best bid/ask, partial fills, ADL, insurance fund.
- VIP fee tiers, fee coupons, USDC contracts, inverse contracts, options.

---

## 8. Known deliberate gaps vs Bybit

| Gap                                               | Why                                    |
| ------------------------------------------------- | -------------------------------------- |
| Leverage capped at 10× (Bybit allows far more)    | Safety cap for a learning app          |
| Fills at top of book only, no depth               | Simplicity; fine for small orders      |
| Liquidation settles instantly at bankruptcy price | No liquidation engine / insurance fund |

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
