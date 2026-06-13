# cryptopapertrade.com

A professional paper trading dashboard for cryptocurrency. Real-time charting, simulated long/short trading, and a full order management system — without risking real money.

> ⚠️ **Paper Trading Only** — No real money. For educational and practice purposes only.

---

## ✨ Features

- **Live Candlestick Charts** — EMA (9/20/200), MACD, and VWAP indicators via TradingView Lightweight Charts
- **Multi-Chart Layout** — 1, 2 (horizontal/vertical), 3, or 4 synchronized chart panes; crosshair and time-range sync across all active panes
- **Paper Trading** — Simulated long/short market, limit, and stop orders with $10,000 virtual balance and full P&L accounting
- **Account Summary Bar** — Live stats strip showing Balance, Equity, Unrealized P&L, Realized P&L, Available, Reserved, and Win Rate
- **TP/SL Auto-Monitor** — Positions close automatically when Take-Profit or Stop-Loss levels are hit
- **Pending Order Monitor** — Limit/stop orders execute automatically when the trigger price is reached
- **Order Status Badges** — Colored "Working" / "Filled" pills on orders and history tables
- **Placing & Closing Time Columns** — Timestamp columns on Orders and History tabs, on by default
- **Orders Sub-Tabs** — Filter pending orders by All / Limit / Stop with live count badges
- **Sound Alerts** — Web Audio API synthesised tones for order placed, TP/SL hit, limit/stop filled, and cancelled events
- **Order & Balance History** — Full audit trail of every order, balance change, and commission
- **Rejected Order Icon** — ⚠️ inline error icon in the History tab when an order is rejected (e.g. insufficient funds), with a tooltip explaining the rejection reason
- **Crypto Leverage Settings** — Bybit-style leverage selector (1×–125×) in the Account Settings dialog; affects position size across all order types; persisted across sessions
- **Symbol Pair Icons** — stacked base/quote coin icons (TradingView style) in every Symbol cell of the Positions, Orders, and History tables, and in the SymbolBar symbol picker trigger and dropdown rows
- **Trading Journal** — Auto-generated trade events + personal editable notes
- **Multi-Timeframe** — 1m / 5m / 15m / 1h / 4h / 1d intervals with live aggregation
- **Real-Time Data** — Bybit V5 WebSocket feed with automatic reconnection
- **Authentication** — JWT + refresh token rotation + email-based password reset
- **PWA** — Installable on desktop and mobile, works offline for the UI shell

---

## 🗺️ Roadmap

| Phase       | Status         | Scope                                                                                                                                                                                                                                                                                         |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | ✅ Complete    | Auth, live chart, paper trading v1 (market orders), TP/SL monitor, journal, PWA                                                                                                                                                                                                               |
| **Phase 2** | 🔄 In Progress | Limit/Stop orders, TradingPanel redesign, pending order monitor ✅, sound alerts ✅, maximize panel ✅, bid/ask feed ✅, account summary bar ✅, order status badges ✅, placing/closing time cols ✅, orders sub-tabs ✅, rejected order icon ✅, leverage settings ✅, symbol pair icons ✅ |
| **Phase 3** | 📋 Planned     | Sync trades to DB, user profile & account settings                                                                                                                                                                                                                                            |
| **Phase 4** | 📋 Planned     | Advanced indicators, multi-symbol watchlist, price alerts                                                                                                                                                                                                                                     |

---

## 🏗️ Architecture

| Layer              | Stack                                            |
| ------------------ | ------------------------------------------------ |
| **Backend**        | Node.js v24 + Fastify + Prisma 7 + PostgreSQL 16 |
| **Frontend**       | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 |
| **Charting**       | TradingView Lightweight Charts v5                |
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
│   │       ├── hooks/                  # usePriceFeed, useTPSLMonitor
│   │       ├── pages/                  # Dashboard, auth pages
│   │       └── store/                  # Zustand stores (auth, market, paper)
│   └── server/          # Fastify backend
│       └── src/
│           ├── plugins/                # Prisma, JWT auth, Bybit WS
│           ├── routes/                 # auth/, market/
│           └── services/              # BybitWebSocketManager, CandleAggregator, IndicatorCalculator
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
pnpm test             # Run all tests (198 total)
pnpm test:coverage    # Tests with coverage report

# Database
cd apps/server
pnpm prisma migrate dev    # Create + apply a new migration
pnpm prisma studio         # Visual DB browser → localhost:5555

# Infrastructure
docker compose up -d       # Start PostgreSQL + Redis
docker compose down -v     # Stop + wipe data volumes
```

---

## 📖 API Documentation

Swagger UI is available in development at `http://localhost:3001/docs` (disabled in production).

---

## 🌐 Deployment

| Service | Platform         | URL                                    |
| ------- | ---------------- | -------------------------------------- |
| **API** | Fly.io           | https://crypto-dashboard-api.fly.dev   |
| **App** | Cloudflare Pages | https://crypto-dashboard-7yy.pages.dev |

Deployments trigger automatically on push to `main` when CI passes.

---

## 📄 License

© 2026 Mannar Hielal. All Rights Reserved. See [LICENSE](./LICENSE).

---

**Live:** [API Health](https://crypto-dashboard-api.fly.dev/health) · [App](https://crypto-dashboard-7yy.pages.dev)  
**Last updated:** April 19, 2026
