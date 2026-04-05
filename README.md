# Crypto Dashboard — Free TradingView Plus Alternative

A free, self-hosted paper trading dashboard that replicates TradingView Plus features for cryptocurrency trading on Bybit mainnet.

> ⚠️ **Paper Trading Only** — No real money. Educational purposes only.

---

## 🎯 Phase 1 Progress

### Infrastructure & Quality

- [x] Monorepo with pnpm workspaces
- [x] Docker for PostgreSQL + Redis (dev/prod parity from day one)
- [x] ESLint + Prettier with Husky pre-commit hooks
- [x] TypeScript strict mode + type-check enforced on every commit
- [x] Node.js version pinned (`v24.14.1`)
- [x] Pino structured logger (no bare `console.*`)
- [x] CORS origin configurable per environment
- [x] Vitest testing setup — 128 tests across server (85) and client (43)
- [x] Swagger / OpenAPI documentation served at `/docs`

### Backend

- [x] Fastify server with security headers (Helmet), rate limiting, CORS
- [x] JWT authentication — register / login / refresh / logout / `/me`
- [x] Password reset flow — forgot-password + reset-password with one-time token (Resend email)
- [x] Refresh token rotation — SHA-256 hashed tokens, httpOnly cookie (`sameSite: none + secure` in prod, `lax` in dev), 7-day TTL
- [x] PostgreSQL via Prisma ORM (User, Account, Order, Trade, PasswordResetToken schema)
- [x] **Bybit WebSocket Manager** — connects to Bybit mainnet V5, multi-channel subscriptions, exponential-backoff reconnect, 30s heartbeat, 64KB message guard
- [x] **Bybit Fastify plugin** — bootstraps WS manager on startup (non-blocking), exposes `fastify.bybit` service (`getSnapshot`, `subscribe`)
- [x] **Candle Aggregator** — aggregates 1m klines → 5m, 15m, 1h, 4h, 1d in memory; correct OHLCV (including rolling close)
- [x] **Indicator calculators** — EMA (9/21/200), MACD (12/26/9), VWAP; calculated per bar and broadcast with each live update
- [x] **Market routes** — `GET /api/market/candles` (historical OHLCV, up to 1000 bars) + `GET /api/market/ws` (WebSocket live feed with initial snapshot); symbol/interval allowlist enforced

### Frontend

- [x] React 19 + Vite 8 + TypeScript client (`apps/client`)
- [x] Tailwind CSS v4 configured (dark-first dashboard theme)
- [x] Shadcn/ui Nova preset — Button, Input, Card, Alert, Form, Label components
- [x] `@` path alias configured (e.g. `@/components/ui/button`)
- [x] CDSDK — shared types + API functions (`generated/CDSDK`) including market API
- [x] Cloudflare Pages deployment wired in CI/CD
- [x] React Router v7 with public/protected route split
- [x] Zustand auth store — access token in memory, refresh token in httpOnly cookie
- [x] Login / Register / Forgot Password / Reset Password pages
- [x] AnimatePresence page transitions
- [x] Silent session restore on app boot via `/api/auth/refresh` (StrictMode-safe module-level guard)
- [x] **`usePriceFeed` hook** — REST fetch on mount + auto-reconnecting WebSocket; fine-grained store selectors to prevent cascade re-renders
- [x] **`marketStore`** — Zustand store for live bars, indicators, connection state; MAX_BARS=500 ring buffer
- [x] **`ChartPanel`** — TradingView Lightweight Charts candlestick chart with EMA9/21/200 overlays, VWAP (orange sparse dots), MACD pane (4-color histogram), crosshair hover legend showing OHLC + all indicator values
- [x] **`TopBar`** — interval buttons (1m/5m/15m/1h/4h/1d), live BTC price + 24h change
- [x] **`LeftToolbar`** — drawing tool icon placeholders (cursor, trendline, shapes, text, pencil)
- [x] **`DashboardPage`** — full layout orchestrating chart + 3-state paper trading panel (collapsed/open/maximized)
- [x] **`paperStore`** — Zustand + persist, $10,000 starting balance, long/short positions, correct PnL (longs and shorts), MAX_HISTORY=100
- [x] **`PaperTradingPanel`** — order entry form with quick-fill presets, open positions table with live PnL, closed trade history; equity correctly accounts for short margin model
- [x] PWA shell — installable, mobile-responsive, dark splash screen (`#080B14`), custom candlestick icon

---

## 🏗️ Architecture

| Layer              | Stack                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Backend**        | Node.js v24 + Fastify + Prisma 7 + PostgreSQL 16                  |
| **Frontend**       | React 19 + TypeScript + Vite 8 + Tailwind CSS v4                  |
| **Charting**       | TradingView Lightweight Charts v5                                 |
| **Shared SDK**     | `generated/CDSDK` — types + API functions                        |
| **State**          | Zustand (auth, market, paper trading)                             |
| **Logger**         | Pino (structured JSON in prod, pretty-printed in dev)             |
| **Data**           | Bybit V5 WebSocket API (mainnet)                                  |
| **Infrastructure** | Docker Compose (PostgreSQL + Redis)                               |
| **Hosting**        | Fly.io (server) + Cloudflare Pages (client)                       |

---

## 📋 Project Structure

```
crypto-dashboard/
├── apps/
│   ├── client/                         # React 19 frontend (PWA)
│   │   └── src/
│   │       ├── App.tsx                 # Routes + silent session restore
│   │       ├── components/
│   │       │   ├── dashboard/
│   │       │   │   ├── ChartPanel.tsx  # Lightweight Charts + indicators
│   │       │   │   ├── TopBar.tsx      # Interval picker + live price
│   │       │   │   ├── LeftToolbar.tsx # Drawing tool sidebar
│   │       │   │   └── PaperTradingPanel.tsx
│   │       │   └── ui/                 # Shadcn/ui components
│   │       ├── hooks/
│   │       │   └── usePriceFeed.ts     # REST + WebSocket lifecycle
│   │       ├── pages/
│   │       │   ├── DashboardPage.tsx   # Main trading layout
│   │       │   ├── LoginPage.tsx
│   │       │   ├── RegisterPage.tsx
│   │       │   ├── ForgotPasswordPage.tsx
│   │       │   └── ResetPasswordPage.tsx
│   │       ├── store/
│   │       │   ├── authStore.ts        # Access token in memory
│   │       │   ├── marketStore.ts      # Live bars + indicators (MAX_BARS=500)
│   │       │   └── paperStore.ts       # Virtual balance + positions (persisted)
│   │       └── lib/
│   │           └── indicators.ts       # Client-side indicator utilities
│   └── server/                         # Fastify backend
│       ├── prisma/                     # Schema & migrations
│       └── src/
│           ├── plugins/
│           │   ├── prisma.ts
│           │   ├── auth.ts             # JWT authenticate decorator
│           │   └── bybit.ts            # Bybit WS plugin + broadcast service
│           ├── routes/
│           │   ├── auth/               # register/login/refresh/logout/me/…
│           │   └── market/             # GET /candles, WS /ws
│           ├── services/
│           │   ├── BybitWebSocketManager.ts  # Reconnect + heartbeat + allowlist
│           │   ├── CandleAggregator.ts       # 1m → 5m/15m/1h/4h/1d
│           │   ├── IndicatorCalculator.ts    # EMA/MACD/VWAP
│           │   └── EmailService.ts           # Resend (stdout fallback in dev)
│           └── types/
├── generated/
│   └── CDSDK/                          # Shared SDK — '@crypto-dashboard/sdk'
│       ├── api/
│       │   ├── auth.ts                 # authApi.*
│       │   └── market.ts               # marketApi.getCandles / wsUrl
│       └── types/                      # User, CandleBar, LiveBar, WsMessage…
├── docker-compose.yml                  # PostgreSQL 16 + Redis 7
├── .env.example
└── package.json                        # Root workspace
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v24+ — use [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm), it will auto-read `.node-version`
- **pnpm** v10+ — `npm install -g pnpm`
- **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/)

### Setup

1. **Clone & install dependencies**

   ```bash
   git clone https://github.com/mannar-hielal/crypto-dashboard.git
   cd crypto-dashboard
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env — set DATABASE_URL, REDIS_URL, JWT secrets, RESEND_API_KEY
   # Generate a JWT secret:
   openssl rand -base64 32

   # For the frontend:
   cp apps/client/.env.example apps/client/.env.local
   # VITE_API_URL defaults to http://localhost:3001 — no change needed for local dev
   ```

3. **Start infrastructure (PostgreSQL + Redis)**

   ```bash
   docker compose up -d
   ```

4. **Run database migrations**

   ```bash
   cd apps/server
   pnpm prisma migrate deploy
   ```

5. **Start backend + frontend**

   ```bash
   # Backend (from project root):
   pnpm dev:server

   # Frontend (separate terminal):
   pnpm --filter @crypto-dashboard/client dev
   # → http://localhost:5173
   ```

6. **Verify it's running**

   ```bash
   curl http://localhost:3001/health
   # → { "status": "ok", "environment": "development" }
   ```

   Open `http://localhost:5173/dashboard` — the chart loads with live BTC/USDT price, EMA/VWAP/MACD indicators, and the paper trading panel.

---

## 🔧 Development Commands

```bash
# Infrastructure
docker compose up -d          # Start PostgreSQL + Redis
docker compose down           # Stop services
docker compose down -v        # Stop + wipe data volumes

# Backend
pnpm dev:server               # Start backend with hot reload
pnpm --filter server build    # Compile TypeScript to dist/

# Frontend
pnpm --filter @crypto-dashboard/client dev    # Vite dev server → http://localhost:5173
pnpm --filter @crypto-dashboard/client build  # Production build → apps/client/dist/

# Code quality (also run automatically on every commit)
pnpm lint                     # ESLint check
pnpm format                   # Prettier format whole project
pnpm type-check               # TypeScript strict type check (server)

# Testing
pnpm test                                           # Run all 128 tests (server + client)
pnpm test:coverage                                  # Run all tests with coverage report
pnpm --filter @crypto-dashboard/server test:watch   # Backend tests in watch mode
pnpm --filter @crypto-dashboard/client test:watch   # Client tests in watch mode

# Database
cd apps/server
pnpm prisma migrate dev       # Create + apply a new migration
pnpm prisma migrate deploy    # Apply pending migrations (CI/prod)
pnpm prisma studio            # Visual DB browser at localhost:5555
```

---

## 🧪 Test Coverage

| Suite                           | Tests | What's covered                                                          |
| ------------------------------- | ----- | ----------------------------------------------------------------------- |
| `auth.test.ts`                  | 26    | Register, login, refresh, logout, /me, forgot-password, reset-password  |
| `health.test.ts`                | 2     | Health endpoint                                                         |
| `market.test.ts`                | 10    | Candles route — defaults, OHLCV parsing, allowlist, 502 errors          |
| `BybitWebSocketManager.test.ts` | 25    | Subscribe/unsubscribe, message parsing, DoS guard, connect lifecycle    |
| `CandleAggregator.test.ts`      | 14    | OHLCV aggregation, close accuracy, multi-symbol isolation, history      |
| `IndicatorCalculator.test.ts`   | 8     | EMA, MACD, VWAP calculations                                            |
| `marketStore.test.ts`           | 18    | setSnapshot, addBar upsert, MAX_BARS cap, derived state                 |
| `paperStore.test.ts`            | 25    | Order validation, PnL (long/short), balance floor, history cap          |
| **Total**                       | **128** |                                                                       |

---

## 📖 API Documentation

Swagger UI is available in **development** at:

```
http://localhost:3001/docs
```

All endpoints are documented with request/response schemas, authentication requirements, and example payloads. The `/docs` route is disabled in production.

---

## 🔐 Security Hardening

| Area             | Measure                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP headers     | Helmet (XSS, clickjacking, MIME sniffing)                                                                                                                                |
| Auth             | bcrypt cost 12, timing-attack safe compare                                                                                                                               |
| Tokens           | Access token in Zustand memory (15 min); refresh token in httpOnly cookie (7 days, `sameSite: none + secure` in prod, `lax` in dev)                                      |
| CSRF             | `sameSite: none` paired with `secure: true` (HTTPS-only) in production; state-changing endpoints require a valid JWT or refresh token                                    |
| Token rotation   | Refresh tokens hashed (SHA-256) in DB, rotated on every use                                                                                                              |
| Password reset   | One-time token, 1h expiry, marked `usedAt` after use                                                                                                                     |
| Rate limiting    | Global 100/min + per-route (5/hr register, 10/15min login, 3/15min forgot-password)                                                                                      |
| Input validation | Fastify JSON Schema with `additionalProperties: false`                                                                                                                   |
| WebSocket        | 64KB message size limit, symbol/channel allowlist, `readyState` check before send                                                                                        |
| Logging          | Pino structured logs — credentials never logged                                                                                                                          |
| CORS             | `CORS_ORIGIN` env var — not hardcoded                                                                                                                                    |
| Env vars         | Validated at startup; process exits on missing critical vars                                                                                                             |

---

## 📝 Commit Convention

Each commit = one testable unit of work.

| Prefix      | When to use                   |
| ----------- | ----------------------------- |
| `feat:`     | New feature or endpoint       |
| `fix:`      | Bug fix                       |
| `security:` | Security hardening            |
| `chore:`    | Tooling, dependencies, config |
| `setup:`    | Infrastructure setup          |
| `docs:`     | Documentation only            |

---

## 📚 Resources

- [Bybit V5 API Docs](https://bybit-exchange.github.io/docs/v5/intro)
- [Fastify Documentation](https://fastify.dev/)
- [Prisma ORM](https://www.prisma.io/)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/)
- [Pino Logger](https://getpino.io/)

---

## 🌐 Deployment

| Service    | Platform         | URL                                      |
| ---------- | ---------------- | ---------------------------------------- |
| **Server** | Fly.io           | `https://crypto-dashboard-api.fly.dev`   |
| **Client** | Cloudflare Pages | `https://crypto-dashboard-7yy.pages.dev` |

Deployments trigger automatically when `main` is updated and CI passes.

---

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

**Status:** Phase 1 complete — live market feed, TradingView-style dashboard, paper trading  
**Last Updated:** April 5, 2026  
**Live:** [API](https://crypto-dashboard-api.fly.dev/health) · [App](https://crypto-dashboard-7yy.pages.dev)
