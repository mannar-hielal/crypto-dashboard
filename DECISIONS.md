# Project Decisions & Session Handoff

> **How to use this file**
> At the end of every session: ask Copilot to update this file.
> At the start of every new session: attach this file so Copilot has full context instantly.

---

## 🏗️ Architecture Decisions

### Stack

- **Monorepo**: `pnpm workspaces` — `apps/client` (React 19 + Vite + Tailwind) · `apps/server` (Fastify + Prisma + PostgreSQL)
- **Shared SDK**: `generated/CDSDK` — single source of truth for types + API functions. Import via `@crypto-dashboard/sdk`, never via relative path.
- **State**: Zustand (no persist except `paperStore` → `cd-paper-trading` localStorage key)
- **Auth**: JWT access token (15 min, Zustand memory only) + httpOnly refresh cookie (7 days, SHA-256 hash in DB)
- **WebSocket**: `BybitWebSocketManager` singleton on server → `/api/market/ws` on client via `usePriceFeed` hook

### Code conventions

- Section dividers: `// ─── Section Name ──────────────`
- Security comments: `🔐` on every decision made for security reasons
- Commit prefixes: `feat:` `fix:` `security:` `chore:` `setup:` `docs:`
- ESLint + Prettier enforced in CI. `pnpm lint && pnpm type-check && pnpm test` must pass before every push.

---

## 📐 Design Agreements

### Bottom Panel (`PaperTradingPanel`) — Target layout

Based on TradingView-style mockup shared by user:

**Header row** (always visible, h-9):

- Left: `Paper Trading ▼ | username USD ▼ | ⚙️`
- Right stats bar: Account balance · Equity · Realized P&L · Unrealized P&L · Account margin · Available funds · Orders margin · Margin buffer

**Tabs** (5 total):

1. **Positions** — columns: Symbol, Side, Qty, Avg Fill Price, Take Profit, Stop Loss, Last Price, Unrealized P&L, Unrealized P&L %, Trade Value, Market Value, Leverage, Margin, Expiration Date
2. **Orders** — pending/open orders
3. **Order History** — all filled/cancelled orders
4. **Balance History** — balance log events
5. **Trading Journal** — time-stamped notes (system + user)

**Current state vs target:**

- Currently has 3 tabs (Positions, History, Journal) — needs to become 5
- Header stats bar needs full redesign to match mockup
- Positions table needs more columns (Last Price, Trade Value, Market Value, Margin, etc.)

### Right Panel (`TradingPanel`) — markups were shared in previous session (now lost)

- User to re-share screenshots/markups before implementation begins

### Paper trading is client-side only

- All paper trading data lives in Zustand + localStorage (`paperStore`)
- DB `Account`, `Order`, `Trade` models exist in schema but are NOT synced to paper trading state (intentional — future phase)
- `realizedPnl` in `paperStore` = net of BOTH entry AND exit commissions (`COMMISSION_RATE = 0.0007`)

---

## 🔢 Business Logic Rules

### Commission

- `COMMISSION_RATE = 0.0007` (0.07% taker fee, exported from `paperStore.ts`)
- Applied on **open**: deducted from balance as `usdtAmount * COMMISSION_RATE`
- Applied on **close**: `qty * exitPrice * COMMISSION_RATE`
- Balance validation: `usdtAmount + usdtAmount * COMMISSION_RATE > balance` → reject (prevents negative balance on 100% orders)
- `realizedPnl` = `gross_pnl - exitCommission - entryCommission`
- `BalanceEvent.pnl` = `pnl - exitCommission` (net impact on balance at close)

### TP/SL rules

- **Long**: TP triggers when `price >= takeProfit`; SL triggers when `price <= stopLoss`
- **Short**: TP triggers when `price <= takeProfit`; SL triggers when `price >= stopLoss`
- Direction validated at order entry (UI + store)
- `useTPSLMonitor` scoped to **active symbol only** — other symbols have no live price feed
- Breach logic extracted to pure `checkTPSL(pos, price)` function (exported, unit-tested)
- Auto-close journal entries: `isUserNote: false` (read-only, not editable by user)

### Journal system

- `isUserNote: true` = user-added/editable
- `isUserNote: false` = system-generated (TP/SL auto-close, order events) — read-only
- `editJournalEntry` guards `!e.isUserNote` at store level

### State reset pattern

- "Reset state on prop change" → use `key={prop}` on parent (`TradingPanel` uses `key={symbol}`)
- Never use during-render `setState` (unpredictable under StrictMode)
- Never use `useEffect` + `setState` for this pattern (ESLint `react-hooks/set-state-in-effect`)

---

## 📁 Key Files

| File                                                         | Purpose                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `apps/client/src/store/paperStore.ts`                        | All paper trading state + actions                                 |
| `apps/client/src/store/marketStore.ts`                       | Live price feed state                                             |
| `apps/client/src/store/authStore.ts`                         | Auth token + user (in-memory, no persist)                         |
| `apps/client/src/hooks/useTPSLMonitor.ts`                    | Auto-close hook + exported `checkTPSL()`                          |
| `apps/client/src/hooks/usePriceFeed.ts`                      | WebSocket price feed lifecycle                                    |
| `apps/client/src/components/dashboard/PaperTradingPanel.tsx` | Bottom panel (positions/orders/journal)                           |
| `apps/client/src/components/dashboard/TradingPanel.tsx`      | Right sidebar order entry                                         |
| `apps/client/src/pages/DashboardPage.tsx`                    | Dashboard orchestrator, mounts hooks                              |
| `apps/server/src/routes/auth/index.ts`                       | All auth routes (register/login/logout/refresh/me/reset-password) |
| `apps/server/src/routes/market/index.ts`                     | REST + WebSocket market data routes                               |
| `apps/server/src/services/BybitWebSocketManager.ts`          | Bybit WS connection singleton                                     |
| `generated/CDSDK/types/index.ts`                             | Shared types (User, Account, CandleBar, WsMessage, etc.)          |
| `generated/CDSDK/api/auth.ts`                                | Client-side auth API calls                                        |
| `generated/CDSDK/api/market.ts`                              | Client-side market API + WS URL                                   |
| `apps/server/prisma/schema.prisma`                           | DB schema (User, Account, Order, Trade, tokens)                   |
| `REVIEW_CHECKLIST.md`                                        | Pre-commit review checklist — run before every push               |

---

## 🗺️ Phase Roadmap

### ✅ Completed

- **Phase 1**: Auth (register/login/logout/refresh/forgot+reset password), JWT + httpOnly cookie rotation, Prisma schema, email service, Swagger docs
- **Phase 1**: Market data — Bybit WebSocket, CandleAggregator, IndicatorCalculator, REST history endpoint
- **Phase 1**: Client scaffold — React 19, Vite, Tailwind, PWA, React Router, Zustand
- **Phase 2**: Live price feed (WebSocket → `usePriceFeed` → `marketStore`)
- **Phase 2**: Paper trading — `paperStore`, `TradingPanel`, `PaperTradingPanel`, TP/SL monitor, commission accounting, journal system
- **Phase 2**: Review infrastructure — `REVIEW_CHECKLIST.md`, `DECISIONS.md`, CI-passing tests

### 🔄 In Progress (next branch)

- **Phase 2 cont.**: Paper trading panel redesign — 5-tab layout matching TradingView mockup, full account stats header, expanded positions/orders tables

### 📋 Planned

- **Phase 3**: Sync paper trading state to DB (Account, Order, Trade models already in schema)
- **Phase 3**: User profile / account settings (change username, change password)
- **Phase 4**: Advanced indicators, alerts, multi-symbol watchlist

---

## 🧪 Test Counts (as of last session)

- **Server**: 86 tests (6 files)
- **Client**: 62 tests (3 files — paperStore × 25, marketStore × 20, checkTPSL × 17)
- **Total**: 148 tests, all green

---

## ⚠️ Known Gotchas

- `pnpm format` reformats `REVIEW_CHECKLIST.md` and `DECISIONS.md` on every run — this is expected
- DB `Account` model has `resetCount` and `lastReset` fields — not yet used by client
- `MAX_HISTORY = 100`, `MAX_JOURNAL = 200` — arrays are sliced on every `set` call
- `ALLOWED_SYMBOLS` in `constants.ts` = single source of truth for both WS subscriptions and route validation
- Rate limits are skipped in non-production (`skip: () => process.env.NODE_ENV !== 'production'`)
- `refreshInitiated` is a module-level flag (not `useRef`) — survives React StrictMode double-invoke

---

_Last updated: 2026-04-06 — Session: Phase 2 paper trading + review checklist_
