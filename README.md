# cryptopapertrade.com

A professional paper trading dashboard for cryptocurrency. Real-time charting and simulated trading that behaves like a Bybit Unified Trading Account — Spot and USDT Perpetual, Bybit's fees, margin, liquidation and funding — without risking real money.

> ⚠️ **Paper Trading Only** — No real money. For educational and practice purposes only.

**Try it live:** [cryptopapertrade.com/chart](https://cryptopapertrade.com/chart) — no signup required.

---

## ✨ Features

- **Live Candlestick Charts** — 9 built-in indicators (EMA, SMA, Average Price, Median Price, Weighted Close, VWAP, Momentum, Percent Change, MACD), each a draggable, customizable widget, via TVP Lightweight Charts
- **Drawing Toolkit** — Trend lines, Fibonacci retracements, shapes, text, and freehand drawing
- **Multi-Chart Layout** — 1, 2 (horizontal/vertical), 3, or 4 synchronized chart panes; crosshair and time-range sync across all active panes
- **Two markets, like Bybit** — **Spot** (buy with USDT, sell what you hold) and **USDT Perpetual** (long / short with leverage), one shared 10,000 USDT paper wallet
- **Server trading engine** — orders, TP/SL and liquidations are executed on the server 24/7, even with the browser closed; the browser sends orders and shows the account live
- **Bybit's rules** — VIP-0 fees (Spot 0.1%, Perpetual 0.055% taker / 0.02% maker), fills at the best bid/ask, Bybit's lot and tick sizes
- **Margin & risk** — per-symbol leverage (1×–10×), Cross or Isolated margin, add / reduce margin, mark-price PnL, liquidation at Bybit's formula, risk-limit tiers with partial liquidation, funding every settlement
- **Orders** — market, limit and stop; TP/SL triggered by Last, Mark or Index price; reduce-only and close-on-trigger; drag TP/SL lines on the chart
- **Account views** — Positions, Orders (All / Working / Inactive / Filled / Cancelled / Rejected), Order History, **Closed P&L**, Assets (Spot) and Balance History, plus an account summary bar (margin balance, available, IM / MM rates)
- **Sound Alerts** — Web Audio API tones for order placed, TP/SL hit, fills, cancels and liquidations
- **Symbol Pair Icons** — stacked base/quote coin icons (TVP style) in every Symbol cell of the Positions, Orders, and History tables, and in the SymbolBar symbol picker trigger and dropdown rows
- **Trading Journal** — Auto-generated trade events + personal editable notes
- **Multi-Timeframe** — 1m / 5m / 15m / 1h / 4h / 1d intervals with live aggregation
- **Real-Time Data** — Bybit V5 WebSocket feed with automatic reconnection
- **Authentication** — JWT + refresh token rotation + email-based password reset
- **PWA** — Installable on desktop and mobile, works offline for the UI shell

---

## 🗺️ Roadmap

| Phase            | Status         | Scope                                                                                                                                                                                                                                                                                         |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1**      | ✅ Complete    | Auth, live chart, paper trading v1 (market orders), TP/SL monitor, journal, PWA                                                                                                                                                                                                               |
| **Phase 2**      | 🔄 In Progress | Limit/Stop orders, TradingPanel redesign, pending order monitor ✅, sound alerts ✅, maximize panel ✅, bid/ask feed ✅, account summary bar ✅, order status badges ✅, placing/closing time cols ✅, orders sub-tabs ✅, rejected order icon ✅, leverage settings ✅, symbol pair icons ✅ |
| **Phase 3**      | 🔄 In Progress | Sync trades to DB ✅, user profile & account settings ✅                                                                                                                                                                                                                                      |
| **Bybit parity** | ✅ Complete    | BP-0 … BP-5: per-market data, server engine, Spot + USDT Perpetual with Bybit fees and fills, mark price and liquidation, funding, cross margin and risk tiers — see `docs/APP_LOG.md` → Bybit Parity                                                                                         |
| **Phase 4**      | 📋 Planned     | Advanced indicators, multi-symbol watchlist, price alerts                                                                                                                                                                                                                                     |
| **Phase 5**      | 📋 Planned     | Live broker integration — Bybit real-money trading                                                                                                                                                                                                                                            |
| **Phase 6**      | 📋 Planned     | AI trading bot — Scanner + Analyst + Executor roles, paper mode only                                                                                                                                                                                                                          |
| **Phase 6b**     | 📋 Planned     | AI bot connected to Bybit live trading — requires Phase 5 + Phase 6 proven                                                                                                                                                                                                                    |

---

## 🏗️ Architecture

| Layer              | Stack                                            |
| ------------------ | ------------------------------------------------ |
| **Backend**        | Node.js v24 + Fastify + Prisma 7 + PostgreSQL 16 |
| **Frontend**       | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 |
| **Charting**       | TVP Lightweight Charts v5                        |
| **State**          | Zustand                                          |
| **Data**           | Bybit V5 WebSocket API (mainnet)                 |
| **Infrastructure** | Docker Compose (PostgreSQL + Redis)              |
| **Hosting**        | Fly.io (API) + Cloudflare Pages (client)         |

---

## 📋 Project Structure

```
cryptopapertrade.com/
├── apps/
│   ├── client/          # React 19 frontend (PWA)
│   │   └── src/
│   │       ├── components/dashboard/   # Chart, panels, toolbar
│   │       ├── hooks/                  # usePaneFeeds (market data), usePaperFeed (account WS)
│   │       ├── pages/                  # Dashboard, auth pages
│   │       └── store/                  # Zustand stores (auth, market, paper)
│   └── server/          # Fastify backend
│       └── src/
│           ├── plugins/                # Prisma, JWT auth, Bybit WS
│           ├── routes/                 # auth/, market/, paper/, newsletter/
│           ├── services/               # BybitWebSocketManager, BybitMarketInfo, CandleAggregator, IndicatorCalculator
│           ├── trading/                # Server trading engine: pure engine/, MatchingEngine, TradingService, bybitSpec
│           └── tools/                  # bybitParity.ts — Bybit testnet parity run
├── generated/
│   └── CDSDK/           # Shared SDK — '@crypto-dashboard/sdk'
├── docs/                # Project documentation
├── docker-compose.yml
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v24+ — use [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm) (auto-reads `.node-version`)
- **pnpm** v10+ — `npm install -g pnpm`
- **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/)

### Setup

1. **Clone & install**

   ```bash
   git clone https://github.com/mannar-hielal/cryptopapertrade.com.git
   cd cryptopapertrade.com
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env — set DATABASE_URL, JWT_SECRET, RESEND_API_KEY, REDIS_URL, BYBIT_API_KEY, BYBIT_API_SECRET
   # Generate a secure JWT secret:
   openssl rand -base64 32

   cp apps/client/.env.example apps/client/.env.local
   # VITE_API_URL defaults to http://localhost:3001 — no change needed for local dev
   ```

3. **Start infrastructure**

   ```bash
   docker compose up -d
   ```

4. **Run migrations**

   ```bash
   cd apps/server && pnpm prisma migrate deploy
   ```

5. **Start dev servers**

   ```bash
   # Backend (from project root):
   pnpm dev:server

   # Frontend (separate terminal):
   pnpm --filter @crypto-dashboard/client dev
   # → http://localhost:5173
   ```

6. **Verify**

   ```bash
   curl http://localhost:3001/health
   # → { "status": "ok", "environment": "development" }
   ```

   Open `http://localhost:5173` — the chart loads with live BTC/USDT price, EMA/VWAP/MACD indicators, and the paper trading panel.

---

## 🔧 Development Commands

```bash
# Code quality
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm type-check       # TypeScript strict check
pnpm test             # Run all tests (~1,160: server + client Vitest)
pnpm test:coverage    # Tests with coverage report

# Bybit testnet parity (places real testnet orders; needs a testnet key in .env, BYBIT_TESTNET=true)
pnpm --filter @crypto-dashboard/server parity:testnet

# Database
cd apps/server
pnpm prisma migrate dev    # Create + apply a new migration
pnpm prisma studio         # Visual DB browser → localhost:5555

# Infrastructure
docker compose up -d       # Start PostgreSQL + Redis
docker compose down -v     # Stop + wipe data volumes
```

---

## 🧪 Testing

The test strategy, tools and the case catalogue live in [`docs/TRADING_TEST_PLAN.md`](./docs/TRADING_TEST_PLAN.md).

- **Every PR** (`ci.yml`): audit, type-check, format, lint, unit and component tests with coverage thresholds (they
  include an SDK ↔ server contract test: every SDK call checked against the route schemas),
  build — the same gates as the pre-commit hook, which also runs the coverage floors — plus an **integration job on a real Postgres 16**: migrations
  from empty, schema drift, a replay of every migration over a pre-BP-1 database (it creates and drops a second
  `…_replay_int` database next to it), and the account repository round-trip. Run it locally against a throwaway database:
  `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crypto_dashboard_int pnpm --filter @crypto-dashboard/server test:int`
  (the name must end in `_int` or `_test`).
- **Production smoke** (`apps/e2e/tests-prod`): read-only checks of the live site (API health, a clean signed-out
  load, the login page, a live market feed). They run as the last step of every deploy, failing it, and every second day in
  `prod-smoke.yml`, which opens a `prod-smoke` issue. Run by hand: `pnpm --filter @crypto-dashboard/e2e test:prod`.
- **Full browser set** (`e2e-nightly.yml`): the whole Playwright set on Chromium, WebKit and two phones,
  including accessibility (axe), weekly and on every `develop → main` release PR. A scheduled failure opens an
  `e2e` issue.
- **Docs-only changes** (`docs/**`, `**/*.md`) skip CI. CI is one job: checks, Postgres integration tests, build and
  the browser smoke.
- **Browser smoke tests** (`apps/e2e`, Playwright, on every PR): sign-up and verification, a Spot market buy and a
  perp long opened and closed, against the fake feed. Locally, with a Postgres running:
  `E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crypto_dashboard_e2e_test pnpm test:e2e` (the name
  must end in `_test`; install Chromium once with `pnpm --filter @crypto-dashboard/e2e exec playwright install chromium`).
- **Local fake feed**: `pnpm dev:e2e` runs the app against a fake Bybit (recorded instruments, risk tiers and
  prices; `apps/server/src/tools/fakeBybit/`) instead of the live feed, and `pnpm feed quote linear BTCUSDT last=50000`
  (or `path`, `funding`, `klines`, `drop`, `stall`, `reset`) moves its prices, so a worked example gives exact numbers.
  Set `TEST_HOOKS_SECRET` (16+ characters) in your shell to also get `/api/test/*` (seeded users, email outbox).
  Re-record the fixtures with `pnpm --filter @crypto-dashboard/server record:bybit`.
- **Nightly** (`parity.yml`): the Bybit testnet parity run replays a fixed scenario on Bybit testnet and on the paper
  engine and compares the v5 fields. It runs on a one-off Fly Machine in Singapore (Bybit blocks GitHub's US
  runners) with secrets from the `bybit-testnet` environment, which only `main` can use; a failure opens a `parity`
  issue. Start it by hand from Actions → Bybit testnet parity → Run workflow.
- **Nightly** (`feed-parity.yml`): the feed parity check compares production's market feed (quotes, mark / index /
  funding, closed 1m candles) with Bybit at the same moments. On Sundays the spec-drift check also compares
  `bybitSpec.ts`'s instrument rules and risk tiers with Bybit's live API. Both run on the same Fly Machine setup and open a
  `feed-parity` / `spec-drift` issue on a failure.

---

## 📖 API Documentation

Swagger UI is available in development at `http://localhost:3001/docs` (disabled in production).

---

## 🌐 Deployment

| Service | Platform         | URL                                    |
| ------- | ---------------- | -------------------------------------- |
| **API** | Fly.io           | https://crypto-dashboard-api.fly.dev   |
| **App** | Cloudflare Pages | https://crypto-dashboard-7yy.pages.dev |

Deployments trigger automatically on push to `main` when CI passes. A separate Fly app, `crypto-dashboard-parity`,
only hosts the short-lived machines of the nightly parity run.

---

## 📄 License

© 2026 Mannar Hielal. All Rights Reserved. See [LICENSE](./LICENSE).

---

**Live:** [API Health](https://crypto-dashboard-api.fly.dev/health) · [App](https://crypto-dashboard-7yy.pages.dev)  
**Last updated:** September 28, 2026
