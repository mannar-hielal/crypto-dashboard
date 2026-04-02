# Crypto Dashboard - Free TradingView Plus Alternative

A free, open-source paper trading dashboard that replicates TradingView Plus features for cryptocurrency trading on Bybit.

## 🎯 Phase 1 Goals

- 4-panel synced chart layout (single symbol, multiple timeframes)
- Live Bybit price feeds via WebSocket
- EMA (9, 21, 200), MACD, and VWAP indicators
- Paper trading with virtual balance ($10,000 starting)
- Simple authentication (username + password)
- PWA-ready web app (mobile responsive)
- Trade history tracking

## 🏗️ Architecture

**Backend:** Node.js + Fastify + Prisma + PostgreSQL + Redis  
**Frontend:** Next.js + TypeScript + Tailwind CSS + Lightweight Charts  
**Data:** Bybit V5 API (Testnet for Phase 1)

## 📋 Project Structure

```
crypto-dashboard/
├── apps/
│   ├── client/              # Next.js frontend (PWA)
│   └── server/              # Fastify backend (Node.js)
├── .husky/                  # Git hooks (Prettier, ESLint)
├── docker-compose.yml       # PostgreSQL + Redis
├── eslint.config.js         # ESLint configuration
├── .prettierrc.json         # Prettier configuration
├── package.json             # Root workspace config
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js v20+ (via nvm)
- pnpm 10+
- Docker Desktop
- macOS/Linux

### Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start Docker services**
   ```bash
   docker compose up -d
   ```

3. **Start backend**
   ```bash
   pnpm dev:server
   ```

4. **Start frontend** (in another terminal)
   ```bash
   pnpm dev:client
   ```

## 🔧 Development Commands

```bash
# Start both frontend and backend
pnpm dev

# Format code with Prettier
pnpm format

# Lint code with ESLint
pnpm lint

# Type checking
pnpm type-check
```

## 📝 Commit Strategy

Each commit represents one small unit of work:

- **[setup]** - Infrastructure, dependencies, configuration
- **[backend]** - Services, database models, API routes
- **[frontend]** - Components, pages, state management
- **[feature]** - Specific feature implementations

Example: `[setup] Add Prettier, ESLint, and Husky for code quality checks`

## ⚠️ Important Notes

- **Paper Trading Only:** This is for practice, not real money
- **Testnet API:** Uses Bybit Testnet for safety
- **No Financial Advice:** This tool is educational only
- **Phase 1:** Focus on core features first

## 📚 Resources

- [Bybit V5 API Docs](https://bybit-exchange.github.io/docs/v5/intro)
- [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- [Fastify Documentation](https://www.fastify.io/)
- [Prisma ORM](https://www.prisma.io/)

## 📄 License

MIT

---

**Status:** Phase 1 Foundation  
**Last Updated:** April 2, 2026

