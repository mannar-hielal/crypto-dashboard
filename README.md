# Crypto Dashboard — Free TradingView Plus Alternative

A free, self-hosted paper trading dashboard that replicates TradingView Plus features for cryptocurrency trading on Bybit Testnet.

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
- [x] Vitest testing setup — unit tests for health endpoint, indicators, and auth routes
- [x] Swagger / OpenAPI documentation served at `/docs`

### Backend

- [x] Fastify server with security headers (Helmet), rate limiting, CORS
- [x] JWT authentication — register / login / refresh / logout / `/me`
- [x] Password reset flow — forgot-password + reset-password with one-time token (Resend email)
- [x] Refresh token rotation — SHA-256 hashed tokens, httpOnly cookie (`sameSite: none + secure` in prod, `lax` in dev), 7-day TTL
- [x] PostgreSQL via Prisma ORM (User, Account, Order, Trade, PasswordResetToken schema)
- [x] WebSocket manager for Bybit V5 live feed (scaffolded, not yet wired)
- [x] Candle aggregator — 1m → 5m, 15m, 1h, 4h, 1d (scaffolded)
- [x] Indicator calculators — EMA (9/21/200), MACD, VWAP (scaffolded)

### Frontend

- [x] React 19 + Vite 8 + TypeScript client scaffolded (`apps/client`)
- [x] Tailwind CSS v4 configured (dark-first dashboard theme)
- [x] Shadcn/ui Nova preset — Button, Input, Card, Alert, Form, Label components
- [x] `@` path alias configured (e.g. `@/components/ui/button`)
- [x] CDSDK — shared types + API functions (`generated/CDSDK`)
- [x] Cloudflare Pages deployment wired in CI/CD
- [x] React Router v7 with public/protected route split
- [x] Zustand auth store — access token in memory, refresh token in httpOnly cookie
- [x] Login page — dark glassmorphism design, animated background orbs, glass card with Framer Motion entrance animation
- [x] Register, Forgot Password, Reset Password pages (functional, UI redesign in progress)
- [x] AnimatePresence page transitions wired in App.tsx
- [x] Silent session restore on app boot via `/api/auth/refresh`
- [ ] 4-panel synced chart layout (single symbol, multiple timeframes)
- [ ] TradingView Lightweight Charts integration

### Features

- [ ] Live Bybit price feed wired to frontend
- [ ] EMA, MACD, VWAP displayed on charts
- [ ] Paper buy / sell with virtual balance ($10,000 starting)
- [ ] Trade history tracking
- [x] PWA shell — installable, mobile-responsive, dark splash screen (`#080B14`), custom candlestick icon

---

## 🏗️ Architecture

| Layer              | Stack                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Backend**        | Node.js v24 + Fastify + Prisma 7 + PostgreSQL 16            |
| **Frontend**       | React 19 + TypeScript + Vite 8 + Tailwind CSS v4            |
| **Shared SDK**     | `generated/CDSDK` — types + API functions (Guidewire-style) |
| **Logger**         | Pino (structured JSON in prod, pretty-printed in dev)       |
| **Data**           | Bybit V5 WebSocket API (Testnet)                            |
| **Infrastructure** | Docker Compose (PostgreSQL + Redis)                         |
| **Hosting**        | Fly.io (server) + Cloudflare Pages (client)                 |

---

## 📋 Project Structure

```
crypto-dashboard/
├── apps/
│   ├── client/                    # React 19 frontend (PWA)
│   │   ├── src/
│   │   │   ├── main.tsx           # Entry point (BrowserRouter)
│   │   │   ├── App.tsx            # Routes + silent session restore
│   │   │   ├── index.css          # Tailwind v4 + Shadcn CSS variables
│   │   │   ├── components/
│   │   │   │   ├── ProtectedRoute.tsx  # Auth guard (redirects to /login)
│   │   │   │   └── ui/            # Shadcn/ui components (Nova preset)
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── RegisterPage.tsx
│   │   │   │   ├── ForgotPasswordPage.tsx
│   │   │   │   ├── ResetPasswordPage.tsx
│   │   │   │   └── DashboardPage.tsx  # placeholder
│   │   │   ├── store/
│   │   │   │   └── authStore.ts   # Zustand — accessToken in memory
│   │   │   └── lib/utils.ts       # Shadcn cn() helper
│   │   ├── .env.example           # ← copy to .env.local for local dev
│   │   └── vite.config.ts
│   └── server/                    # Fastify backend
│       ├── prisma/                # Schema & migrations
│       │   └── schema.prisma
│       ├── src/
│       │   ├── index.ts           # Server entry point
│       │   ├── config.ts          # Env validation & config object
│       │   ├── logger.ts          # Shared Pino instance
│       │   ├── plugins/
│       │   │   ├── prisma.ts      # Fastify Prisma plugin
│       │   │   └── auth.ts        # JWT authenticate decorator
│       │   ├── routes/
│       │   │   └── auth/          # register / login / refresh / logout / me / forgot-password / reset-password
│       │   ├── services/
│       │   │   ├── BybitWebSocketManager.ts
│       │   │   ├── CandleAggregator.ts
│       │   │   ├── IndicatorCalculator.ts
│       │   │   └── EmailService.ts    # Resend transactional email (dev: stdout fallback)
│       │   └── types/             # Shared domain interfaces
│       └── tsconfig.json
├── generated/
│   └── CDSDK/                     # Shared SDK — import from '@crypto-dashboard/sdk'
│       ├── types/                 # TypeScript interfaces (User, Account, AuthResponse…)
│       ├── api/                   # Typed fetch functions (authApi.register/login/me)
│       └── index.ts               # Single barrel export
├── .env.example                   # ← copy this to .env
├── .node-version                  # Node 24.14.1
├── docker-compose.yml             # PostgreSQL 16 + Redis 7
├── eslint.config.js
├── .prettierrc.json
└── package.json                   # Root workspace
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
   # Edit .env — fill in your Bybit Testnet API keys
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
pnpm --filter @crypto-dashboard/client dev    # Start Vite dev server → http://localhost:5173
pnpm --filter @crypto-dashboard/client build  # Production build → apps/client/dist/

# Code quality (also run automatically on every commit)
pnpm lint                     # ESLint check (root + client)
pnpm format                   # Prettier format whole project
pnpm type-check               # TypeScript strict type check (server)

# Testing
pnpm test                                           # Run all unit tests once
pnpm --filter @crypto-dashboard/server test:watch   # Run backend unit tests in watch mode
pnpm test:coverage                                  # Run backend tests with coverage report

# Database
cd apps/server
pnpm prisma migrate dev       # Create + apply a new migration
pnpm prisma migrate deploy    # Apply pending migrations (CI/prod)
pnpm prisma studio            # Visual DB browser at localhost:5555
```

---

## 📖 API Documentation

Swagger UI is available in **development** at:

```
http://localhost:3001/docs
```

All endpoints are documented with request/response schemas, authentication requirements, and example payloads. The `/docs` route is disabled in production.

---

## 🔐 Security Hardening (applied)

| Area             | Measure                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP headers     | Helmet (XSS, clickjacking, MIME sniffing)                                                                                                                                |
| Auth             | bcrypt cost 12, timing-attack safe compare                                                                                                                               |
| Tokens           | Access token in Zustand memory (15 min); refresh token in httpOnly cookie (7 days, `sameSite: none + secure` in prod, `lax` in dev)                                      |
| CSRF             | `sameSite: none` is paired with `secure: true` (HTTPS-only) in production; state-changing endpoints require a valid refresh token or JWT — no cookie-only attack surface |
| Token rotation   | Refresh tokens hashed (SHA-256) in DB, rotated on every refresh                                                                                                          |
| Password reset   | One-time token, 1h expiry, marked `usedAt` after use                                                                                                                     |
| Rate limiting    | Global 100/min + per-route (5/hr register, 10/15min login, 3/15min forgot-password)                                                                                      |
| Input validation | Fastify JSON Schema with `additionalProperties: false`                                                                                                                   |
| WebSocket        | 64KB message size limit, symbol/channel allowlist                                                                                                                        |
| Logging          | Pino structured logs — credentials never logged                                                                                                                          |
| CORS             | `CORS_ORIGIN` env var — not hardcoded                                                                                                                                    |
| Env vars         | Validated at startup, process exits on missing critical vars                                                                                                             |

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

**Status:** Phase 1 — In Progress  
**Last Updated:** April 5, 2026  
**Live:** [API](https://crypto-dashboard-api.fly.dev/health) · [App](https://crypto-dashboard-7yy.pages.dev)
