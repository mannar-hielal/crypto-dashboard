# App Log — Crypto Dashboard

> **How to use this file**
> This is your single source of truth for the entire project.
> **At the start of every new session**: attach this file — Copilot will load the full context instantly.
> **At the end of every session / after each feature is built**: Copilot updates this file automatically.
>
> ⛔ **Implementation rule**: No implementation is done unless the user explicitly instructs it.
> The agent **never** creates files, writes code snippets, or applies changes automatically.
> All code changes are made **only when the user directly asks for them**.
>
> 🎨 **Visual/UI rule**: Before implementing any UI change, always ask the user a Q&A to confirm
> visual decisions (spacing, colors, sizes, layout, etc.). Always refer to
> [`docs/screenshots/theme`](screenshots/theme) as the **primary** visual source of truth for all
> styling decisions (colors, spacing, sizes, layout). When an element is not visible or not
> distinguishable in screenshots, **fall back** to [`docs/markup-reference`](markup-reference) for
> that element's visual properties (e.g. exact color values, sizes). For component structure and
> interaction patterns, refer to `docs/markup-reference` — HTML reference files for UI components.
> Goal is **not** a 1:1 copy; take what makes sense and do it better where possible.
> Always ask clarifying questions when there is confusion or uncertainty before implementing.

---

## 🏗️ Architecture Decisions

### Stack

- **Monorepo**: `pnpm workspaces` — `apps/client` (React 19 + Vite + Tailwind) · `apps/server` (Fastify + Prisma +
  PostgreSQL)
- **Shared SDK**: `generated/CDSDK` — single source of truth for types + API functions. Import via
  `@crypto-dashboard/sdk`, never via relative path.
- **State**: Zustand (no persist except `paperStore` → `cd-paper-trading` localStorage key)
- **Auth**: JWT access token (15 min, Zustand memory only) + httpOnly refresh cookie (7 days, SHA-256 hash in DB)
- **WebSocket**: `BybitWebSocketManager` singleton on server → `/api/market/ws` on client via `usePriceFeed` hook

### Key library versions (client)

| Library            | Version  | Notes                       |
| ------------------ | -------- | --------------------------- |
| react              | ^19.2.4  |                             |
| zustand            | ^5.0.12  |                             |
| framer-motion      | ^12.38.0 | Animations throughout       |
| lightweight-charts | ^5.1.0   | TradingView chart library   |
| @number-flow/react | ^0.6.0   | Animated number transitions |
| lucide-react       | ^1.7.0   | Icons                       |
| tailwindcss        | ^4.2.2   |                             |
| react-router       | ^7.14.0  |                             |
| vite               | ^8.0.1   |                             |
| vitest             | ^4.1.2   |                             |

### Code conventions

- Section dividers: `// ─── Section Name ──────────────`
- Security comments: `🔐` on every decision made for security reasons
- Commit prefixes: `feat:` `fix:` `security:` `chore:` `setup:` `docs:`
- ESLint + Prettier enforced in CI. `pnpm lint && pnpm type-check && pnpm test` must pass before every push.
- Background palette: `#0f0e29` (page bg), `#211e49` (panel/header bg), `#1e1d34` (footer bg), `#3e3c73` (input/card bg) — sampled from `docs/screenshots/theme/header.png` + `footer.png`
- Accent palette: `#a555e2`/`#695bec` (purple primary), `#4e3287` (purpleDeep), `#2ccd78` (green/profit), `#d5455c` (red/loss), `#e7ab33` (amber/warning), `#cac5d4` (muted text) — sampled from `docs/screenshots/theme/header.png`
- Visual source of truth: `docs/screenshots/theme/` — always consult before making spacing, color, size, or layout decisions. Fall back to `docs/markup-reference/` when element not visible in screenshots.
- **No hardcoded hex values, font strings, or font sizes in components** — always import from `@/lib/tokens`. Canvas/chart libs (lightweight-charts) must use `tokens.ts` directly (cannot read CSS vars). Tailwind pseudo-classes (`hover:`, `focus:`) use named brand utilities from `@theme inline` in `index.css`.
- Q&A required before any UI implementation — no visual assumptions

---

## 🔐 Security Hardening Plan

> Identified post-Phase-2 review. All checklist items added to `REVIEW_CHECKLIST.md` Section 2.

### Phase 1 Retroactive — Fix Immediately (auth is already live)

| Item                                                                                                                          | File                   | Type            | Status     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------- | ---------- |
| `JWT_SECRET` entropy check — `Buffer.byteLength(secret) >= 32` at startup                                                     | `config.ts`            | Code change     | ⬜ Pending |
| Explicit `algorithms: ['HS256']` on `@fastify/jwt` registration                                                               | `app.ts`               | Code change     | ⬜ Pending |
| Token-theft full-revocation: when `/refresh` detects `count=0`, call `deleteMany({ where: { userId } })` to kill all sessions | `routes/auth/index.ts` | Code change     | ⬜ Pending |
| `pnpm audit` added to pre-release CI gate                                                                                     | CI config              | Process change  | ⬜ Pending |
| No JWT in URL params, CSRF docs, error-handler URL audit, HSTS/CSP/CORS wildcard check                                        | `REVIEW_CHECKLIST.md`  | Checklist items | ✅ Added   |

### Phase 2 — Current Sprint

| Item                                                                                 | File                  | Type           | Status     |
| ------------------------------------------------------------------------------------ | --------------------- | -------------- | ---------- |
| `dangerouslySetInnerHTML` prohibition + user content as plain text                   | `REVIEW_CHECKLIST.md` | Checklist item | ✅ Added   |
| `paperStore` `persist()` — add `version` + `migrate` for safe localStorage hydration | `paperStore.ts`       | Code change    | ⬜ Pending |

### Phase 3+ — Future

| Item                                                                   | Notes                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Authenticated WebSocket JWT via `Authorization` header (not `?token=`) | Apply when WS auth is added                           |
| WAF/CDN layer for distributed brute-force protection                   | IP rate limits alone are insufficient against botnets |

### Key Decision: Token-Theft Full-Revocation (Option A chosen)

- **Option A (chosen)** 🔐: Revoke ALL refresh tokens for `userId` → forces re-login on all devices.
- **Option B (rejected)**: Log warning, block only current request → leaves attacker's stolen session alive.

---

## 📐 Design Agreements

### Dashboard Layout (DashboardPage.tsx)

```
┌──────────────────────────────────────────────────────┐
│              TopBar                    (h-12)        │
├──────────────────────────────────────────────────────┤
│              SymbolBar                 (h-11)        │
├──────┬──────────────────────────────────┬────────────┤
│      │                                  │ Trading    │
│ Left │        ChartPanel                │ Panel      │
│ Tool │        (flex-1)                  │ (w-64)     │
│ bar  │  floating pill when panel hidden │ animated   │
│(w-11)│                                  │            │
├──────┴──────────────────────────────────┴────────────┤
│   PaperTradingPanel  h-0 / h-9 / h-52 (PanelSize)   │
├──────────────────────────────────────────────────────┤
│   TickerBar                            (h-8)         │
├──────────────────────────────────────────────────────┤
│   Footer                               (h-7)         │
└──────────────────────────────────────────────────────┘
```

- `PanelSize = 'hidden' | 'collapsed' | 'open'` — exported from `DashboardPage.tsx`, used by `PaperTradingPanel`
- `TradingPanel` uses `key={`${activePane}-${symbol}`}` — React remounts on active pane OR symbol change, resetting all local form state
- `TradingPanel` open/close is `AnimatePresence` animated (`width: 0 → 256`)
- `inert` attribute on PaperTradingPanel wrapper when `size === 'hidden'` (removes from tab order + a11y tree)
- When panel is `'hidden'`, a floating purple pill button appears bottom-left of chart to re-open it

---

### Bottom Panel — `PaperTradingPanel` ✅ (current implementation)

**Header — account selector block (left):**

- `Paper Trading ▼` button — label only, no dropdown
- `{username} USD ▼` button — label only, no dropdown
- ⚙️ gear icon — currently implements a **2-click reset** (NOT a modal yet):
  - 1st click → button becomes red "Reset?" badge with 3-second auto-cancel
  - 2nd click within 3s → calls `paperStore.reset()` → restores $10,000 balance

**Header — stats bar (right, horizontally scrollable):**

| Field           | Actual formula (from code)                                                              | Color rule                                 |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Account balance | `balance` (free cash, margin already deducted at open)                                  | neutral                                    |
| Equity          | `balance + accountMargin + unrealizedPnl`                                               | neutral                                    |
| Realized P&L    | `paperStore.realizedPnl`                                                                | green / red / neutral                      |
| Unrealized P&L  | sum of pos PnL using `latestPrice` (active symbol only)                                 | green / `#848e9c` (0) / red                |
| Account margin  | `sum(pos.entryUsdtAmount)`                                                              | ⓘ "Funds used to keep your positions open" |
| Available funds | `balance` (same as balance — it IS the free cash)                                       | ⓘ "Funds you can trade with"               |
| Orders margin   | hardcoded `0.00` — `pendingOrders` not yet implemented                                  | ⓘ "Funds needed to execute your orders"    |
| Margin buffer   | `accountMargin > 0 ? (equity/accountMargin)*100 : 100` → shows `100%` when no positions | amber <150%, red <110%                     |

> ⚠️ **Critical formula note**: `balance` in `paperStore` = free cash AFTER positions open (entryUsdtAmount deducted).
> Therefore: `equity = balance + accountMargin + unrealizedPnl` — NOT `balance + unrealizedPnl`.
> And: `availableFunds = balance` — no subtraction needed (balance already excludes locked margin).
> The "∞" for marginBuffer when no positions is NOT implemented; it shows `100%` instead.

**Header — panel controls (right):**

- ChevronDown → `'collapsed'` (header only visible)
- ChevronUp → `'open'` (full height h-52)
- ✕ → `'hidden'` (h-0, panel removed from view)

**Tabs** (5 total, purple animated underline):

1. **Positions** ✅ — 15 columns: Symbol, Side, Qty, Avg Fill Price, TP, SL, Last Price, Unrealized P&L, P&L%,
   Trade Value, Market Value, Leverage (`1:1` — no leverage system yet), Margin, Expiration (`—`), Close (✕)
   - Last Price: uses `latestPrice` (active symbol only — shows stale value for other symbols)
   - Empty state: "There are no open positions in your trading account yet"
   - Row entrance: staggered framer-motion (`rowVariants`, 0.04s delay per row)

2. **Orders** ⏳ — shows `EmptyState` placeholder only. `pendingOrders` not in store yet.

3. **Order History** ✅ — 10 columns: Symbol, Side, Type, Qty, Fill Price, Status (colored text),
   Commission, Placing Time, Closing Time, Order ID
   - Uses `paperStore.orders: HistoricalOrder[]`

4. **Balance History** ✅ — 5 columns: Time, Balance Before, Balance After, Realized P&L, Action
   - Uses `paperStore.balanceLog: BalanceEvent[]`

5. **Trading Journal** ✅ — 3 columns: Time, Text, Edit (pencil on hover for user notes)
   - Inline edit: Enter saves, Escape cancels
   - Add-note button (pencil icon in Time header) → inline input row at top
   - System entries (`isUserNote: false`) read-only; user entries editable

Tab badge counts: purple pill for Positions count, gray pill for Order History count

---

### Bottom Panel — `PaperTradingPanel` ⏳ (planned additions)

- **⚙️ button → Account Settings modal** (replaces current 2-click reset):
  - Read-only account name field (shows username)
  - Leverage display: Crypto = 10:1, others = 1:1 (display only, not editable)
  - Commission display: Others = `0.0007`, Fixed (display only)
  - Footer: "Reset account" (left) + "Save" (right, disabled — settings read-only for now)
  - Close ✕ dismisses modal

- **Orders tab**: full pending orders table with sub-filter square tabs:
  All | Working | Filled | Cancelled | Rejected
  - Columns: Symbol, Side, Type, Qty, Limit/Stop Price, TP, SL, Status, Placing Time, Cancel

- **Maximize button** (⤢/⤡) in header:
  - Maximized: panel fills entire content area (chart hidden behind panel)
  - TradingPanel stays visible overlapping top-right corner
  - Local `useState`, not persisted

- **`ordersMargin` stat**: `sum(pendingOrders[].usdtAmount)` (once pendingOrders implemented)

- **Last Price column**: use `marketStore.prices[pos.symbol]` (not just `latestPrice`) so non-active
  symbols show stale price dimmed with `~` prefix + tooltip

---

### Multi-Chart Layout System ✅ (current implementation)

**Layout IDs and pane counts:**

| ID   | Grid      | Panes |
| ---- | --------- | ----- |
| `1`  | 1×1       | 1     |
| `2h` | 2 columns | 2     |
| `2v` | 2 rows    | 2     |
| `3h` | 3 columns | 3     |
| `4`  | 2×2 grid  | 4     |

**`layoutStore`** (persisted `cd-layout` v1):

- `layout: LayoutId` — active layout ID
- `activePane: number` — pane that receives SymbolBar controls + TradingPanel focus
- `panes: PaneConfig[]` — 4 entries; defaults: `BTC/1m · ETH/1m · SOL/1m · BNB/1m`
- `syncOptions: SyncOptions` — defaults: `crosshair: true, timeRange: true, symbol: false, interval: false`
- `setLayout()` clamps `activePane` to `paneCount − 1` when switching to a smaller layout
- `setPaneSymbol()` / `setPaneInterval()` propagate to all panes when the matching sync flag is on

**`paneStores[0..3]`** — vanilla `createStore()` instances (NOT `create()`), one per pane slot:

- Each holds `bars`, `indicators`, `latestPrice`, `priceChange`, `isConnected`
- `reset()` wipes all data — called before connecting to a new symbol/interval
- Read in React via `useStore(paneStores[i], selector)` — always called unconditionally (hook-count stable)

**`usePaneFeeds`** — always mounts 4 `useSinglePaneFeed` calls (hook-count never changes):

- Inactive panes (outside current layout) → WS closed, store reset immediately
- Active panes → REST fetch 500 bars first, then WebSocket live feed
- WebSocket auto-reconnects after `3 000 ms` on close; blocked when component unmounts
- Re-runs when `symbol`, `interval`, or `isActive` changes

**`ChartLayoutPicker`** (rendered inside `SymbolBar`, right side):

- Trigger: 7×7 icon reflecting active layout; highlights purple + border when popover is open
- Popover (w-56): "Layout" row with 5 SVG icons (paths match TradingView `chart-layout.html`) + "Sync across panes" section
- Sync section: 4 animated pill toggles (spring 600/35) — Sync Symbol / Sync Interval / Sync Crosshair / Sync Time Range
- Selecting a layout closes the popover; sync toggles keep popover open until backdrop click

**`MultiChartArea`:**

- CSS `grid` element — applies `LAYOUT_GRID_CLASS[layout]` (Tailwind `grid-cols-*`/`grid-rows-*`)
- `PaneHeader` is only rendered when `paneCount > 1` (hidden in single-chart mode)
- Click anywhere on a pane area → `setActivePane(i)`; active pane gets animated purple border + inner glow
- `chartRefs[0..3]` — `IChartApi | null`, registered via `ChartPanel.onChartReady` callback
- **Crosshair sync**: `subscribeCrosshairMove` → `timeToCoordinate(time)` → `setCrossHairXY(x, y)` on each follower
- **Time range sync**: `subscribeVisibleTimeRangeChange` → `setVisibleRange(range)` on each follower
- Guard refs (`isSyncingCrosshair`, `isSyncingTimeRange`) break circular event loops
- Sync options + pane count read via refs so event handlers stay up-to-date without re-registration

**`PaneHeader`** (h-7, rendered only in multi-pane mode):

- Animated left stripe (`layoutId="active-pane-stripe"`, spring 500/35) marks active pane
- Symbol picker: `CryptoIcon` (13 px) · base name · `/USDT` · `ChevronDown` → popover with search input + scrollable list
- Interval quick-switch: all 6 `INTERVALS` as 9 px buttons; active interval highlighted purple
- Right side: live price (green/red) + `±x.xx%` change badge; connection dot (5 px, green pulse when connected)
- Clicking the header row itself activates the pane (calls `onActivate`)

**`markets.ts`** — shared constants (used by SymbolBar, PaneHeader, layoutStore defaults):

- `SYMBOLS` (9): BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK — all vs USDT
- `INTERVALS` (6): `1m · 5m · 15m · 1h · 4h · 1d`
- `INTERVAL_LABELS` record maps each interval to its display name

---

### Right Panel — `TradingPanel` ✅ (current implementation — market orders only)

- Header: "Paper Trading" label + ✕ close (hides panel, state preserved)
- Buy / Sell toggle (green Buy / red Sell)
- Balance + Equity + Unrealized P&L display
- USDT amount input + 25/50/75/100% quick-fill presets
- TP / SL optional price inputs (directional validation)
- Submit: `↑ Buy SYMBOL · Market` / `↓ Sell SYMBOL · Market`
- Mark price display at bottom
- Resets on symbol or active pane change via `key={`${activePane}-${symbol}`}` in `DashboardPage`

---

### Right Panel — `TradingPanel` ⏳ (planned redesign)

Based on TradingView markup reference. Adapt what fits — not a 1:1 copy.

**Header:** Symbol name + ✕ (hides panel only — component stays mounted, local state preserved)

**Side selector (always visible below header):**

- Split button: `Sell {bidPrice}` (neutral/dark left) | `Buy {askPrice}` (blue right)
- Spread badge centered between
- Active side highlighted; clicking switches Buy ↔ Sell

**Order type tabs:** `Market` | `Limit` | `Stop` — underline animated indicator

- **Market**: quantity USD input only
- **Limit (extra)**: Price input — defaults to current ask (Buy) or bid (Sell)
- **Stop (extra)**: Price input — defaults to current ask/bid

**Exits section** (collapsible, default expanded, all tabs):

- `Take profit, price` — toggle switch + price input (disabled when off)
- `Stop loss, price` — toggle switch + price input (disabled when off)
- Existing TP/SL directional validation from `paperStore` applies

**Order info section** (all tabs):

| Field       | Formula                                                             |
| ----------- | ------------------------------------------------------------------- |
| Margin      | `usdtAmount / 10` shown as `{margin} / {balance}` with progress bar |
| Leverage    | `10:1` (fixed for crypto)                                           |
| Trade value | `usdtAmount` USD                                                    |
| Commission  | `usdtAmount * 0.0007` USD                                           |

**Submit button** (full-width, blue, sticky bottom):

- Primary: `Buy` / `Sell`
- Secondary: `{qty} {symbol} MARKET` | `@ {price} LIMIT` | `@ {price} STOP`

**Intentionally skipped vs TradingView:** DOM tab, "Risk % balance" mode, Tick value, Risk USD, Time in force

---

### `paperStore` — current state ✅

Persisted to `localStorage` key `cd-paper-trading`. No `version`/`migrate` yet (⬜ pending).

```typescript
interface PaperState {
  balance: number; // free cash (entryUsdtAmount deducted at open)
  positions: Position[]; // open positions
  history: ClosedTrade[]; // closed trades (MAX_HISTORY = 100)
  orders: HistoricalOrder[]; // all order history (MAX_HISTORY * 2)
  realizedPnl: number; // net of all commissions
  balanceLog: BalanceEvent[]; // balance change log (MAX_HISTORY * 2)
  journal: JournalEntry[]; // trading journal (MAX_JOURNAL = 200)
}

interface Position {
  id;
  symbol;
  side: 'long' | 'short';
  quantity;
  entryPrice;
  entryUsdtAmount;
  openedAt;
  takeProfit?;
  stopLoss?;
}
interface HistoricalOrder {
  id;
  symbol;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  qty;
  limitPrice?;
  stopPrice?;
  fillPrice?;
  status: 'filled' | 'cancelled' | 'rejected';
  commission;
  placingTime;
  closingTime;
}
```

Actions: `placeOrder`, `closePosition`, `addJournalNote`, `editJournalEntry`, `reset`

---

### `paperStore` — planned additions ⏳ (Limit & Stop orders)

```typescript
interface PendingOrder {
  id;
  symbol;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop';
  usdtAmount; // reserved at placement (deducted from balance)
  triggerPrice; // limit or stop trigger price
  qty; // pre-calculated: usdtAmount / triggerPrice
  takeProfit?;
  stopLoss?;
  placedAt;
}
// New field: pendingOrders: PendingOrder[]  (persisted)
// New actions: placeLimitOrder, placeStopOrder, cancelPendingOrder
```

**Execution rules (by `usePendingOrderMonitor`):**

- Limit Buy: `price <= triggerPrice` · Limit Sell: `price >= triggerPrice`
- Stop Buy: `price >= triggerPrice` · Stop Sell: `price <= triggerPrice`
- Scoped to active symbol only (mirrors `useTPSLMonitor`)
- On trigger: remove from `pendingOrders`, open position at `triggerPrice`, add `HistoricalOrder` (filled)
- On cancel: full refund `usdtAmount + commission`, add `HistoricalOrder` (cancelled)
- Balance reserved at placement: `balance -= usdtAmount + usdtAmount * COMMISSION_RATE`

---

### `marketStore` — current state ✅

```typescript
interface MarketState {
  bars: CandleBar[]; // up to MAX_BARS = 500
  indicators: IndicatorSnapshot | null;
  latestPrice: number | null;
  priceChange: number | null;
  symbol: string; // default 'BTCUSDT'
  interval: string; // default '1m'
  isConnected: boolean;
  // Actions: setSnapshot, addBar, setConnected, setSymbol, setInterval
}
```

`setSymbol()` / `setInterval()` wipe `bars`, `indicators`, `latestPrice`, `priceChange`.

---

### `marketStore` — planned additions ⏳ (bid/ask + prices map)

```typescript
bid: number | null; // best bid from Bybit orderbook.1
ask: number | null; // best ask from Bybit orderbook.1
prices: Record<string, number>; // last known close per symbol — NEVER wiped
// New action: setBidAsk(bid, ask)
```

- `prices[symbol]` updated on every `addBar` call (alongside `latestPrice`)
- `setSymbol()` wipes `bid`/`ask` but NOT `prices` map
- Used by Positions table for stale last price on non-active symbols

### Bid/Ask feed — server additions ⏳

1. **`bybit.ts` plugin**: subscribe to `orderbook.1.{symbol}` for all `ALLOWED_SYMBOLS`. Extract `bids[0][0]`/`asks[0][0]`. Broadcast:
   ```json
   { "type": "ticker", "symbol": "BTCUSDT", "bid": 69731.5, "ask": 69732.0 }
   ```
   Throttle to ~500ms at plugin level.
2. **`market/index.ts` WS route**: forward `ticker` messages filtered by symbol (same as `bar`).
3. **`usePriceFeed` hook**: handle `type === 'ticker'` → call `marketStore.setBidAsk(bid, ask)`.

---

## 🔢 Business Logic Rules

### Commission

- `COMMISSION_RATE = 0.0007` (0.07% taker fee, exported from `paperStore.ts`)
- Applied on **open**: `balance -= usdtAmount + usdtAmount * COMMISSION_RATE`
- Applied on **close**: `commission = qty * exitPrice * COMMISSION_RATE`
- Balance validation: `usdtAmount + usdtAmount * COMMISSION_RATE > balance` → reject
- `realizedPnl` = `gross_pnl - exitCommission - entryCommission`
- `BalanceEvent.pnl` = `pnl - exitCommission` (net impact on balance at close)

### TP/SL rules (implemented in `checkTPSL()`)

- **Long**: TP when `price >= takeProfit`; SL when `price <= stopLoss`
- **Short**: TP when `price <= takeProfit`; SL when `price >= stopLoss`
- `checkTPSL` is a pure exported function — unit-tested
- `useTPSLMonitor` scoped to active symbol only
- Auto-close journal entries: `isUserNote: false` (read-only)

### Journal system

- `isUserNote: true` = user-added/editable
- `isUserNote: false` = system-generated — read-only (`editJournalEntry` guards this at store level)

### State reset pattern

- Use `key={prop}` on parent to reset child state on prop change (`TradingPanel` uses `key={`${activePane}-${symbol}`}`)
- Never use during-render `setState`, never use `useEffect` + `setState` for reset

---

## 📁 Key Files

| File                                                         | Purpose                                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/lib/tokens.ts`                              | **Design tokens** — single source of truth for all colors, fonts, sizes (JS/TS side)                                                         |
| `apps/client/src/index.css`                                  | Tailwind v4 theme — `@theme inline` generates brand color utilities from tokens                                                              |
| `apps/client/src/store/paperStore.ts`                        | All paper trading state + actions                                                                                                            |
| `apps/client/src/store/marketStore.ts`                       | Live price feed state                                                                                                                        |
| `apps/client/src/store/authStore.ts`                         | Auth token + user (in-memory, no persist)                                                                                                    |
| `apps/client/src/hooks/useTPSLMonitor.ts`                    | Auto-close hook + exported `checkTPSL()`                                                                                                     |
| `apps/client/src/hooks/usePriceFeed.ts`                      | WebSocket price feed lifecycle                                                                                                               |
| `apps/client/src/components/dashboard/PaperTradingPanel.tsx` | Bottom panel (positions/orders/journal)                                                                                                      |
| `apps/client/src/components/dashboard/TradingPanel.tsx`      | Right sidebar order entry                                                                                                                    |
| `apps/client/src/pages/DashboardPage.tsx`                    | Dashboard orchestrator — exports `PanelSize` type, mounts hooks                                                                              |
| `apps/server/src/routes/auth/index.ts`                       | All auth routes (register/login/logout/refresh/me/reset-password)                                                                            |
| `apps/server/src/routes/market/index.ts`                     | REST + WebSocket market data routes                                                                                                          |
| `apps/server/src/services/BybitWebSocketManager.ts`          | Bybit WS connection singleton                                                                                                                |
| `apps/server/src/constants.ts`                               | `ALLOWED_SYMBOLS` — source of truth for WS subscriptions + routes                                                                            |
| `generated/CDSDK/types/index.ts`                             | Shared types (User, Account, CandleBar, WsMessage, etc.)                                                                                     |
| `generated/CDSDK/api/auth.ts`                                | Client-side auth API calls                                                                                                                   |
| `generated/CDSDK/api/market.ts`                              | Client-side market API + WS URL                                                                                                              |
| `apps/client/src/lib/markets.ts`                             | Shared `SYMBOLS` (9 coins), `INTERVALS` (6), `INTERVAL_LABELS`, `SymbolEntry` type — imported by SymbolBar, PaneHeader, layoutStore defaults |
| `apps/client/src/store/layoutStore.ts`                       | Layout config — layout ID, activePane, per-pane symbol/interval, sync options                                                                |
| `apps/client/src/store/paneStore.ts`                         | 4 independent vanilla Zustand stores (bars/price/connection per pane)                                                                        |
| `apps/client/src/hooks/usePaneFeeds.ts`                      | Manages 4 WS+REST connections (one per active pane) — replaces `usePriceFeed`                                                                |
| `apps/client/src/components/dashboard/ChartLayoutPicker.tsx` | Layout picker popover (5 SVG icons) + sync option toggles                                                                                    |
| `apps/client/src/components/dashboard/PaneHeader.tsx`        | Per-pane mini header (symbol picker, interval buttons, live price, connection dot)                                                           |
| `apps/client/src/components/dashboard/MultiChartArea.tsx`    | CSS grid renderer for all layouts; wires crosshair + time-range sync                                                                         |
| `docs/markup-reference/`                                     | HTML UI reference files — component structure & interaction patterns (not 1:1 copies)                                                        |
| `docs/screenshots/theme/`                                    | Visual source of truth — spacing, colors, sizes, layout                                                                                      |
| `docs/REVIEW_CHECKLIST.md`                                   | Pre-commit review checklist — run before every push                                                                                          |
| `docs/APP_LOG.md`                                            | This file — full project context, attach at start of every session                                                                           |

---

## 🗺️ Phase Roadmap

### ✅ Completed

- **Phase 1**: Auth (register/login/logout/refresh/forgot+reset password), JWT + httpOnly cookie rotation, Prisma schema, email service, Swagger docs
- **Phase 1**: Market data — Bybit WebSocket, CandleAggregator, IndicatorCalculator, REST history endpoint
- **Phase 1**: Client scaffold — React 19, Vite, Tailwind, PWA, React Router, Zustand
- **Phase 2**: Live price feed (WebSocket → `usePriceFeed` → `marketStore`)
- **Phase 2**: Paper trading v1 — `paperStore` (market orders), `TradingPanel` (market-only), `PaperTradingPanel` (Positions + Order History + Balance History + Journal tabs), TP/SL monitor, commission accounting
- **Phase 2**: Review infrastructure — `REVIEW_CHECKLIST.md`, `APP_LOG.md`, CI-passing tests (148 total)

### ✅ Completed (added 2026-04-12)

- **Multi-chart split layout** — `layoutStore`, `paneStore` (4 vanilla Zustand stores), `usePaneFeeds` (4 independent WS+REST connections), `ChartLayoutPicker`, `PaneHeader`, `MultiChartArea`
- Supported layouts: `1` (single), `2h` (side-by-side), `2v` (stacked), `3h` (3 columns), `4` (2×2 grid)
- Per-pane symbol + interval selection (each pane has its own `PaneHeader` with mini symbol picker + interval quick-switch)
- Cross-pane sync options (toggleable per-session): symbol, interval, crosshair (time axis via `timeToCoordinate`), time range (`setVisibleRange`) — all with circular-event guard refs
- Layout + sync options persisted to `localStorage` (`cd-layout`)
- `SymbolBar` now reads from `layoutStore.panes[activePane]` + `paneStores[activePane]` (4 unconditional `useStore` calls, picks active)
- `TradingPanel` + `useTPSLMonitor` migrated to `layoutStore` + `paneStores` (TP/SL monitors pane 0 — primary trading pane)
- `src/lib/markets.ts` — shared `SYMBOLS`, `INTERVALS`, `INTERVAL_LABELS` constants (previously duplicated in `SymbolBar`)
- Commit: `7dfd54a`

### 🔄 In Progress (current sprint — 2026-04-12)

- **Phase 2 cont.**: `TradingPanel` redesign — Bid/Ask side selector, Limit/Stop tabs, Exits section, Order info panel
- **Phase 2 cont.**: `PaperTradingPanel` header redesign — Account Settings modal, Orders tab (pendingOrders), maximize button
- **Phase 2 cont.**: `paperStore` — add `pendingOrders`, `placeLimitOrder`, `placeStopOrder`, `cancelPendingOrder`
- **Phase 2 cont.**: `usePendingOrderMonitor` hook — mirrors `useTPSLMonitor` pattern
- **Phase 2 cont.**: `marketStore` — add `bid`, `ask`, `prices` map, `setBidAsk`
- **Phase 2 cont.**: Bid/Ask real-time feed — server `orderbook.1` + client ticker handling

### 📋 Planned

- **Phase 3**: Sync paper trading state to DB (Account, Order, Trade models already in schema)
- **Phase 3**: User profile / account settings (change username, change password)
- **Phase 4**: Advanced indicators, alerts, multi-symbol watchlist

---

## 🧪 Test Counts (as of 2026-04-12)

- **Server**: 86 tests (6 files)
- **Client**: 75 tests (5 files — paperStore × 25, marketStore × 20, checkTPSL × 17, cryptoIcons × 5, CryptoIcon × 8)
- **Total**: 161 tests, all green ✅

---

## ⚠️ Known Gotchas

- `pnpm format` reformats `REVIEW_CHECKLIST.md` and `APP_LOG.md` on every run — expected
- DB `Account` model has `resetCount` and `lastReset` fields — not yet used by client
- `MAX_HISTORY = 100`, `MAX_JOURNAL = 200` — arrays sliced on every `set` call
- `ALLOWED_SYMBOLS` in `constants.ts` = single source of truth for WS subscriptions and route validation
- Rate limits skipped in non-production (`skip: () => process.env.NODE_ENV !== 'production'`)
- `refreshInitiated` is a module-level flag (not `useRef`) — survives React StrictMode double-invoke
- **`equity = balance + accountMargin + unrealizedPnl`** — NOT `balance + unrealizedPnl`. `balance` is free cash only; locked margin must be added back.
- **`availableFunds = balance`** — balance already excludes locked margin; no subtraction needed
- Leverage column in Positions table shows `1:1` — no leverage system implemented yet (crypto target: 10:1)
- `useTPSLMonitor` and `usePendingOrderMonitor` (planned) are both scoped to active symbol only
- **EMA 200 bar starvation**: `calcEMA(closes, 200)` needs >200 bars to produce a visible line. With exactly 200 bars, only one data point is generated (the very last index) — invisible on chart. Fixed: `usePriceFeed` now fetches 500 bars on mount.
- **EMA 200 color source**: `#9c27b0` — taken from `docs/markup-reference/layout-area-center/chart.html` (`rgb(156, 39, 176)`). Screenshots/theme did not show EMA lines, so markup-reference was the fallback per visual rule.
- **`CHART_BG` typo fixed**: was `'#0b0d18'` (wrong), corrected to `chart.bg` → `'#050212'` (matches bg.page token, sampled from screenshots).
- **lightweight-charts + CSS vars**: canvas-based library cannot read CSS custom properties. All chart series colors **must** be plain hex strings — provided via `tokens.ts` `chart` group, never via `var(--...)`.
- **Tailwind pseudo-class arbitrary values** (`hover:text-[#hex]`, `focus:border-[#hex]/50`) cannot be replaced with inline styles. They require named utilities — defined in `index.css` `@theme inline` as `--color-brand-*` and used as `hover:text-brand-*`, `focus:border-brand-*`.
- **Two-surface token sync**: `tokens.ts` (JS/TS inline styles, canvas libs) and `index.css @theme inline` (Tailwind utilities) must be kept manually in sync — no single source can serve both. When updating a color token, update both surfaces in the same commit.
- **Multi-chart layout state**: `layoutStore` holds layout ID + pane configs; `paneStores[0..3]` are vanilla Zustand stores (`createStore()`) fed by `usePaneFeeds`. Components read per-pane data with `useStore(paneStores[i], selector)`. `SymbolBar`/`TradingPanel`/`useTPSLMonitor` use 4 unconditional `useStore` calls (hooks-rule compliant) and pick the active index.
- **`marketStore` is no longer used at runtime** — kept intact for existing tests (all 75 pass). All live data flows through `paneStores`.
- **TP/SL monitoring** is scoped to `paneStores[0]` (primary trading pane). When the user has multiple charts open, TP/SL still monitors only the pane-0 symbol.
- **Crosshair sync guard**: `isSyncingCrosshair` ref breaks circular `subscribeCrosshairMove` loops. Same pattern for `isSyncingTimeRange`.
- **`useStore` with dynamic store** — `SymbolBar` calls `useStore` 4 times (unconditional), picks `allData[activePane]`. Safe because hook call count never changes.
- **`layoutStore` persistence**: `cd-layout` key, version 1. Layout + sync options survive page refresh; per-pane symbol/interval also persisted. (validates shape without widening). Lookup in `CryptoIcon.tsx` casts to `Record<string, string | undefined>` first — `satisfies` narrows keys to literal union, so bracket-access without cast would be a TS error.
- **Framer Motion `key` on CSS-animated ticker**: `TickerBar` `doubled.map` uses `key={i}` (array index) — pre-existing. Safe here because the list is static and order never changes, but violates the checklist rule. Pending fix: `${item.symbol}-${i < items.length ? 'a' : 'b'}`.
- **`motion.form` stagger timing**: `LoginPage` form fields use `delayChildren: 0.12` — fields start appearing before the card entrance (`duration: 0.35`) finishes. Intentional fast-start; bump to `0.28` if visual overlap is undesirable.

---

## 🗂️ Pending Tasks (from review 2026-04-12)

> Items raised by the code review of `fix/chart-area` branch — address before merging.

| Priority  | Task                                                                          | File(s)     | Checklist ref  |
| --------- | ----------------------------------------------------------------------------- | ----------- | -------------- |
| 🟡 Should | Amend / reword garbled commit message on `7bc5bf6` (contains shell artifacts) | git history | §11 Code Style |

**Resolved (260d0f8 · a298230):**

- ✅ Tests for `CryptoIcon` (8 tests — renders img for known symbol, fallback badge for unknown)
- ✅ Tests for `cryptoIcons.ts` (5 tests — 9 entries, uppercase keys, non-empty string values)
- ✅ `key={i}` → `${item.symbol}-${i < items.length ? 'a' : 'b'}` stable keys in `TickerBar.tsx`
- ✅ `satisfies Record<string, string>` applied to `cryptoIcons.ts`; lookup cast fixed in `CryptoIcon.tsx`
- ✅ `noValidate` added to `motion.form` in `RegisterPage.tsx`

---

_Last updated: 2026-04-12 — **Multi-chart layout feature** (`7dfd54a`): split view with 1/2h/2v/3h/4 layouts, per-pane symbol+interval, cross-pane crosshair+time-range sync, layout picker in SymbolBar, `layoutStore`+`paneStores` architecture. **Design Agreements** section now contains full per-component detail: `layoutStore` defaults, `paneStore` shape, `usePaneFeeds` reconnect behaviour, `ChartLayoutPicker`, `MultiChartArea`, `PaneHeader`, `markets.ts`. `TradingPanel` key corrected to `key={`${activePane}-${symbol}`}` throughout. Previously: **PR review issues resolved** (`260d0f8` · `a298230`): tests for `CryptoIcon`/`cryptoIcons.ts`, stable keys in TickerBar, `satisfies`+lookup cast, `noValidate` on RegisterPage. Client tests 75 (5 files), total 161. 1 open item: garbled commit on `7bc5bf6`._
