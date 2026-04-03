# Crypto Dashboard — Free TradingView Plus Alternative

A free, open-source paper trading dashboard that replicates TradingView Plus features for cryptocurrency trading on Bybit Testnet.

> ⚠️ **Paper Trading Only** — No real money. Educational purposes only.

## 🎯 Phase 1 Goals

- [ ] 4-panel synced chart layout (single symbol, multiple timeframes)
- [ ] Live Bybit price feed via WebSocket
- [ ] EMA (9, 21, 200), MACD, and VWAP indicators
- [ ] Paper trading with virtual balance ($10,000 starting)
- [x] Authentication (register, login, JWT)
- [ ] PWA-ready web app (mobile responsive)
- [ ] Trade history tracking

## 🏗️ Architecture

**Backend:** Node.js + Fastify + Prisma + PostgreSQL + Redis  
**Frontend:** React + TypeScript + Tailwind CSS + Lightweight Charts  
**Data:** Bybit V5 WebSocket API (Testnet)  
**Infrastructure:** Docker (PostgreSQL + Redis)

## 📋 Project Structure

```
crypto-dashboard/
├── apps/
│   ├── client/                  # React frontend (PWA) — coming Phase 1
│   └── server/                  # Fastify backend
│       ├── prisma/              # Database schema & migrations
│       ├── src/
│       │   ├── index.ts         # Server entry point
│       │   ├── config.ts        # Environment configuration
│       │   ├── plugins/         # Fastify plugins (Prisma, JWT auth)
│       │   ├── routes/          # API route handlers
│       │   └── services/        # Business logic (WebSocket, indicators)
│       └── .env.example         # Environment variable template
├── docker-compose.yml           # PostgreSQL + Redis
├── eslint.config.js             # ESLint configuration
├── .prettierrc.json             # Prettier configuration
├── package.json                 # Root workspace config
└── .gitignore
```

## 🚀 Getting Started

### Prerequisites

- Node.js v20+
- pnpm v10+
- Docker Desktop

### Setup

1. **Clone & install dependencies**
   ```bash
   git clone https://github.com/mannar-hielal/crypto-dashboard.git
   cd crypto-dashboard
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp apps/server/.env.example apps/server/.env
   # Edit apps/server/.env — add your Bybit Testnet API keys and generate a JWT secret
   # Generate JWT secret: openssl rand -base64 32
   ```

3. **Start database & Redis**
   ```bash
   docker compose up -d
   ```

4. **Run database migrations**
   ```bash
   cd apps/server
   pnpm prisma migrate deploy
   ```

5. **Start backend**
   ```bash
   pnpm dev:server
   ```

6. **Start frontend** *(coming soon)*
   ```bash
   pnpm dev:client
   ```

## 🔧 Development Commands

```bash
# Start Docker services (PostgreSQL + Redis)
docker compose up -d

# Stop Docker services
docker compose down

# Start backend dev server
pnpm dev:server

# Format code
pnpm format

# Lint code
pnpm lint

# Type checking
pnpm type-check

# Open Prisma Studio (visual DB browser)
cd apps/server && pnpm prisma studio
```

## 📝 Commit Strategy

Each commit represents one testable unit of work:

- **feat:** New feature or endpoint
- **fix:** Bug fix
- **security:** Security hardening
- **setup:** Infrastructure, dependencies, configuration
- **docs:** Documentation updates

## 🔐 Security Notes

- Use Bybit **Testnet** API keys only — never mainnet keys in development
- Generate JWT secret with: `openssl rand -base64 32`
- Rate limiting is applied on all auth endpoints
- Never commit `.env` files — use `.env.example` as template

## 📚 Resources

- [Bybit V5 API Docs](https://bybit-exchange.github.io/docs/v5/intro)
- [Fastify Documentation](https://fastify.dev/)
- [Prisma ORM](https://www.prisma.io/)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

**Status:** Phase 1 — In Progress  
**Last Updated:** April 3, 2026
