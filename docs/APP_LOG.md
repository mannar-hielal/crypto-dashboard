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
| `JWT_SECRET` entropy check — `Buffer.byteLength(secret) >= 32` at startup                                                     | `config.ts`            | Code change     | ✅ Done    |
| Explicit `algorithms: ['HS256']` on `@fastify/jwt` registration                                                               | `app.ts`               | Code change     | ✅ Done    |
| Token-theft full-revocation: when `/refresh` detects `count=0`, call `deleteMany({ where: { userId } })` to kill all sessions | `routes/auth/index.ts` | Code change     | ✅ Done    |
| `pnpm audit` added to pre-release CI gate                                                                                     | CI config              | Process change  | ⬜ Pending |
| No JWT in URL params, CSRF docs, error-handler URL audit, HSTS/CSP/CORS wildcard check                                        | `REVIEW_CHECKLIST.md`  | Checklist items | ✅ Added   |

### Phase 2 — Current Sprint

| Item                                                                                 | File                  | Type           | Status     |
| ------------------------------------------------------------------------------------ | --------------------- | -------------- | ---------- |
| `dangerouslySetInnerHTML` prohibition + user content as plain text                   | `REVIEW_CHECKLIST.md` | Checklist item | ✅ Added   |
| `paperStore` `persist()` — add `version` + `migrate` for safe localStorage hydration | `paperStore.ts`       | Code change    | ✅ Done    |

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
├──────┬─────────────────────────┬────────────────────┤
│      │                         │                    │
│ Left │  ChartPanel (flex-1)    │  TradingPanel      │
│ Tool │  [collapses when        │  (w-64, full       │
│ bar  │   maximized]            │   height, sibling  │
│(w-11)│                         │   of center col)   │
├──────┴─────────────────────────┴────────────────────┤
│   PaperTradingPanel  h-0/h-9/h-52 or full (maximize) │
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

**Header bar (top strip):**

- Left: "Paper Trading" label
- Right: Sound settings · ⚙️ Account Settings modal · Collapse/Expand · Maximize/Restore · Close

**Account Summary Bar** (below header, above tabs — horizontally scrollable):

| Field          | Formula                                                        | Color rule       |
| -------------- | -------------------------------------------------------------- | ---------------- |
| Balance        | `paperStore.balance` (free cash)                               | neutral          |
| Equity         | `balance + unrealizedPnl`                                      | neutral          |
| Unrealized P&L | sum of open position PnL at mark price                         | green / red      |
| Realized P&L   | `paperStore.realizedPnl`                                       | green / red      |
| Available      | `balance − reserved`                                           | neutral          |
| Reserved       | `sum(pendingOrders[].usdtAmount)` — shows `—` when 0           | neutral          |
| Win Rate       | `winningTrades / totalTrades × 100` — shows `—` when no trades | green ≥50% / red |

**Tabs** (4 total, purple animated underline):

1. **Positions** ✅ — columns: Symbol, Side, Qty, Entry, Mark, TP, SL, PnL (USDT) · optional: Order ID, Opened At, Leverage, Margin, Commission · sticky: Close (✕)
   - Side shown as colored LONG/SHORT with TrendingUp/TrendingDown icon
   - Last Price: uses `lastKnownPrices` (falls back from live pane price — correct for all symbols)
   - Empty state: "No open positions"
   - Row entrance: staggered framer-motion (`rowVariants`, 0.04 s delay per row)

2. **Orders** ✅ — unified limit/stop order lifecycle table (TV-style). Columns: Symbol, Status, Type, Side, Qty, Limit Price, Stop Price, Fill Price, TP, SL, Commission, Placing Time (on by default) · optional: Order ID, Leverage, Margin · sticky: Cancel (✕)
   - **Sub-tabs**: `All | Working | Filled | Cancelled | Rejected` filter bar; each shows live count badge; animated purple underline indicator
   - **All order types appear here** — market orders land in the **Filled** sub-tab immediately; limit/stop orders go through Working → Filled/Cancelled. Mirrors TradingView behaviour exactly.
   - Amber count badge on tab (pending/working orders only). Empty state: Clock icon + "No orders"
   - Cancelling a pending order refunds `usdtAmount + commission` in full
   - `OrderDisplayRow` union type: `{ kind: 'pending'; data: PendingOrder } | { kind: 'historical'; data: HistoricalOrder }` — unifies both for one table render

3. **Order History** ✅ — TV-style order history table showing all `HistoricalOrder[]` records (market + limit + stop, all statuses). Columns: Symbol, Side, Type, Qty, Limit Price, Stop Price, Fill Price, Status, Commission, Placing Time, Closing Time (on by default) · optional: Order ID, Leverage, Margin
   - **Sub-tabs**: `All | Filled | Cancelled | Rejected` filter bar; each shows live count badge; animated purple underline indicator
   - Includes market order fills, limit/stop fills, cancellations, and rejected orders
   - Status badge: Filled = green, Cancelled = muted, Rejected = red with ⚠ icon + hover tooltip
   - Rejected orders moved here from the History/Trade History tab

4. **History** ✅ — closed positions (ClosedTrade) only. Columns: Symbol, **Status** (green "Filled" pill), Side, Qty, Entry, Exit, PnL (USDT), **Placing Time** (on by default), **Closing Time** (on by default) · optional: Order ID, Leverage
   - `ClosedTrade` now carries `openedAt` (copied from `Position.openedAt` at close time)
   - Rejected orders removed from here — they now live in Order History tab

5. **Trading Journal** ✅ — 3 columns: Time, Text, Edit (pencil on hover for user notes)

Tab badge counts: purple pill for Positions count, amber pill for Orders count (working only), gray pill for Order History/History/Journal count

**Column picker** (⊟ SlidersHorizontal icon, top-right of tab bar for all data tabs): togglable non-sticky columns; preferences persisted to `localStorage` key `cd-paper-col-prefs`.

---

### Bottom Panel — `PaperTradingPanel` ✅ (additional features — implemented)

- **⚙️ button → Account Settings modal** ✅ (replaces 2-click reset):
  - Read-only account name field (shows `useAuthStore` username)
  - Leverage: `10:1` Crypto · Display only
  - Commission: `0.07%` (0.0007) Fixed · Taker · Display only
  - Footer: "Reset account" (2-click confirm, 3 s auto-cancel) + "Save" (disabled — read-only)
  - Backdrop click or ✕ dismisses; confirming-reset state cleared on dismiss

- **Maximize button** (⤢/⤡) in header ✅:
  - Maximized: panel fills entire content area; chart area collapses (`flex: 0 0 0px` via framer-motion)
  - TradingPanel spans full height from SymbolBar to TickerBar (sibling of center column, not cut by bottom panel)
  - Local `useState` (`isMaximized`) in `DashboardPage` — not persisted
  - `Maximize2` / `Minimize2` lucide icons; Collapse/Expand buttons hidden while maximized
  - Panel content shown whenever `isMaximized`, regardless of `PanelSize` state

- **`ordersMargin` stat** ✅: `sum(pendingOrders[].usdtAmount)` (live now that pendingOrders is implemented)

- **Last Price column** ✅: `lastKnownPrices` map in `paneStore` — updated on every WS snapshot/bar, never cleared on reset. `getPriceForSymbol()` helper in `PaperTradingPanel` tries live pane price first, falls back to `lastKnownPrices` so positions in non-active symbols retain correct mark price and PnL.

- **Symbol pair icons** (`SymbolPair`) in Positions / Orders / History symbol column ✅: stacked base + quote coin icons (base 16 px front, quote 10 px overlapping bottom-right with panel-colour ring separator) in the TradingView style. Also applied to the `SymbolBar` symbol picker — both the trigger button (18 px base) and every dropdown row (20 px base). `SymbolPair` is exported from `CryptoIcon.tsx`; `USDT` added to `CRYPTO_ICON_URLS` (falls back to text badge gracefully). `cryptoIcons.test.ts` updated: count 9 → 10, USDT mock + expected entry added.

### Bottom Panel — `PaperTradingPanel` ⏳ (still planned)

- No remaining panel items — all implemented.

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
- Active panes → REST fetch `INTERVAL_FETCH_LIMIT[interval]` bars (1 000, server max) first, then WebSocket live feed
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
- **Crosshair sync**: `subscribeCrosshairMove` → `setCrosshairPosition(price, time, series)` on each follower (v5 API); `clearCrosshairPosition()` when cursor leaves source chart. Echo loop broken by `param.sourceEvent` check — `sourceEvent` is only set on real pointer events, undefined on programmatic calls. **Y-sync**: `price` is derived via `otherSeries.coordinateToPrice(param.point.y)` which maps the source cursor's Y pixel to the equivalent price on the follower's price scale, landing the horizontal line at the same relative height. **Guards**: (1) skip entirely if `followerLatest === null` (data not loaded); (2) discard `coordinateToPrice` result if it deviates >50% from `followerLatest` (stale scale after symbol change) and fall back to `bar.close`.
- **Time range sync**: `subscribeVisibleTimeRangeChange` → `setVisibleRange(range)` on each follower
- Guard ref `isSyncingTimeRange` breaks circular time-range loop; crosshair uses `sourceEvent` instead
- Sync options + pane count read via refs so event handlers stay up-to-date without re-registration
- **Snap-on-enable (symbol / interval)**: `toggleSync('symbol' | 'interval')` — when the flag transitions from OFF → ON, all panes are immediately snapped to the **active pane's** current symbol/interval. Active pane is the source of truth (mirrors TradingView/Bookmap convention: the chart the user is focused on wins). Toggling OFF only flips the flag; panes retain their (now-uniform) values. Crosshair has no snap (event-driven pointer only).
- **Snap-on-enable (timeRange)**: a `useEffect` in `MultiChartArea` watches `syncOptions.timeRange`; on OFF → ON it reads `chartRefs[activePane].timeScale().getVisibleRange()` and calls `setVisibleRange(range)` on all other active chart refs. Active pane wins. Uses the same `isSyncingTimeRange` guard to prevent cascade. Crosshair has no snap — it is purely pointer-driven.
- **Interval-aware initial view** (TradingView-matched): `INTERVAL_BAR_SPACING` in `markets.ts` maps each interval to an initial px/bar spacing targeting ~160–200 visible candles at a ~1 200 px viewport (same visual density as TradingView). Applied in `ChartPanel` on `isFirstLoad || isOutOfRange` via `timeScale().applyOptions({ barSpacing })` before `scrollToRealTime()`. Fetch limit bumped to `INTERVAL_FETCH_LIMIT` (1 000 bars = server max) for deep scrollback buffer. `MAX_BARS` in `paneStore` raised to 1 000 to match.

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

### Sound Alert System ✅ (current implementation)

**Files:** `useTradingSound.ts`, `TradingSoundContext.tsx`, `SoundSettings.tsx`

- Built on the **Web Audio API** (`AudioContext`) — no external audio files required; all sounds are synthesised programmatically.
- `useTradingSound` hook generates distinct tones for: order placed, TP hit, SL hit, limit/stop order filled, order cancelled.
- `TradingSoundContext` (React context + provider) wraps the hook so any component can call `playSound(event)` without prop-drilling.
- `SoundSettings` component (rendered in TradingPanel or settings area): toggle sound on/off, volume slider.
- Sound events: `ORDER_PLACED`, `TP_HIT`, `SL_HIT`, `ORDER_FILLED`, `ORDER_CANCELLED`.

---

### Right Panel — `TradingPanel` ✅ (current implementation)

Based on TradingView markup reference. Not a 1:1 copy.

**Header:** Symbol name (e.g. `BTCUSDT`) + ✕ close (hides panel only, component stays mounted, local state preserved). Resets **form inputs** (qty, price, TP, SL) on symbol or active pane change via ``key={`${activePane}-${symbol}`}`` in `DashboardPage`. **Tab selection (Market/Limit/Stop) and side (Buy/Sell) survive symbol changes** — `tradingTab` is lifted state in `DashboardPage`, passed as `initialTab` prop; `OrderTab` is exported from `TradingPanel.tsx`. When remounting on Limit/Stop, `priceInput` is lazily initialised to the new symbol's `latestPrice`.

**Side selector (always visible below header):**

- Split button: `Sell {latestPrice}` (left) | `Buy {latestPrice}` (right)
- Spread badge centered (shows `—` until bid/ask feed is implemented in a future phase)
- Active side: colored bottom border + tinted background (green Buy / red Sell)

**Order type tabs:** `Market` | `Limit` | `Stop` — spring animated purple underline (framer-motion `layoutId="tab-underline"`)

- **Market**: no price input; executes at `latestPrice`
- **Limit**: price input (pre-filled with `latestPrice` on tab switch); dispatches `placeLimitOrder`
- **Stop**: price input (pre-filled with `latestPrice` on tab switch); dispatches `placeStopOrder`

**Quantity input:**

- Primary mode toggle: `USD` ↔ `Units` (swap button top-right of input)
- In USD mode: user enters USDT amount; shows equivalent base-asset units below
- In Units mode: user enters base-asset quantity; shows equivalent USD below
- Conversion uses `execPrice` (market = `latestPrice`, limit/stop = price input)
- Value is converted numerically when swapping modes (no reset)
- Available balance shown below input

**Exits section** (collapsible ▲/▼, default expanded, all tabs):

- `Take profit, price` — toggle switch; price input appears when enabled (green border); input hidden + cleared when disabled
- `Stop loss, price` — toggle switch; price input appears when enabled (red border); input hidden + cleared when disabled
- Directional validation: TP above entry price for Long / below for Short; SL the reverse

**Order info section** (all tabs, updates live as qty changes):

| Field       | Formula                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Margin      | `usdtAmount` shown as `{margin} / {balance}` with animated progress bar (red when margin > balance) |
| Leverage    | `${leverage}:1` — reads `paperStore.leverage` live (reflects Account Settings selection)            |
| Trade value | `usdtAmount × leverage` (notional exposure)                                                         |
| Commission  | `usdtAmount × 0.0007` USD                                                                           |

**Submit button** (full-width, sticky bottom, colored by side):

- Primary line: `Buy` / `Sell` (large)
- Secondary line: `{qty} {baseAsset} · MARKET` | `{qty} {baseAsset} @ {price} LIMIT` | `{qty} {baseAsset} @ {price} STOP`

**Intentionally skipped vs TradingView:** DOM tab, bid/ask spread (phase 2), Risk USD / Risk % balance, Tick value, Time in force

---

### `paperStore` — current state ✅

Persisted to `localStorage` key `cd-paper-trading`. Version `1` with `migrate` guard ✅.

```typescript
interface PaperState {
  balance: number; // free cash (entryUsdtAmount deducted at open)
  positions: Position[]; // open positions
  pendingOrders: PendingOrder[]; // limit/stop orders awaiting execution
  history: ClosedTrade[]; // closed trades (MAX_HISTORY = 100)
  orders: HistoricalOrder[]; // all order history (MAX_HISTORY * 2)
  realizedPnl: number; // net of all commissions
  balanceLog: BalanceEvent[]; // balance change log (MAX_HISTORY * 2)
  journal: JournalEntry[]; // trading journal (MAX_JOURNAL = 200)
}

interface JournalEntry {
  id: string;
  time: number;
  text: string;
  isUserNote?: boolean; // true = user-added/editable; false = system-generated (read-only)
  pnl?: number; // net PnL (USDT) on close entries only — gross PnL − exit commission
  // undefined on open/pending entries and user notes
}

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
```

Actions: `placeOrder`, `placeLimitOrder`, `placeStopOrder`, `cancelPendingOrder`, `closePosition`, `addJournalNote(text, isUserNote?, pnl?)`, `editJournalEntry`, `reset`

**`placeLimitOrder` / `placeStopOrder`**: deducts `usdtAmount + commission` from balance immediately; adds to `pendingOrders`; adds a placeholder `HistoricalOrder` record.  
**`cancelPendingOrder`**: removes from `pendingOrders`; refunds `usdtAmount + commission`; adds cancelled `HistoricalOrder`.  
Actual execution (converting pending → open position) is handled by `usePendingOrderMonitor` ✅ (implemented).

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

### `marketStore` — bid/ask additions ✅ (implemented in `paneStore` instead)

> Originally planned on `marketStore`, but `marketStore` is retired at runtime. Fields added to `paneStore.PaneMarketState`:

```typescript
bid: number | null; // best bid from Bybit orderbook.1
ask: number | null; // best ask from Bybit orderbook.1
// Action: setBidAsk(bid, ask) — reset() clears them
```

- Updated on every `ticker` WS message via `usePaneFeeds` handler
- `TradingPanel` reads from active pane store (8 unconditional `useStore` calls)

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

- Use `key={prop}` on parent to reset child state on prop change (`TradingPanel` uses ``key={`${activePane}-${symbol}`}`)
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
| `apps/server/src/routes/auth/index.ts`                       | All auth routes (register/login/logout/refresh/me/reset-password),                                                                            |
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

### ✅ Completed (added 2026-04-19 — bid/ask feed + account settings modal)

- **Account Settings modal** — replaces 2-click reset on ⚙️ gear button in `PaperTradingPanel` header. Read-only fields: account name (username from `useAuthStore`), Leverage (`10:1`, Crypto), Commission (`0.07% / 0.0007`, Fixed · Taker). Footer: "Reset account" (2-click confirm, 3 s auto-cancel, closes modal on confirm) + "Save" (disabled — read-only). Backdrop click or ✕ dismisses; confirm state clears on dismiss.
- **Bid/Ask real-time feed** — end-to-end:
  - **Server `bybit.ts`**: subscribes `orderbook.1.{symbol}` for all `ALLOWED_SYMBOLS`. Processes `orderBook` stream data, extracts `bids[0][0]`/`asks[0][0]`, throttles to 500 ms per symbol, broadcasts `TickerUpdate { symbol, bid, ask }` to a separate `tickerListeners` set. `BybitService` gains `subscribeTicker(listener)` method.
  - **Server `market/index.ts`**: WS handler subscribes to `subscribeTicker` filtered by symbol, forwards `{ type: 'ticker', symbol, bid, ask }` JSON to the client WebSocket.
  - **Client `paneStore.ts`**: `PaneMarketState` gains `bid: number | null`, `ask: number | null`, `setBidAsk(bid, ask)`. `reset()` clears bid/ask.
  - **Client `usePaneFeeds.ts`**: `onmessage` handles `type === 'ticker'` → `store.getState().setBidAsk(msg.bid, msg.ask)`.
  - **SDK `types/index.ts`**: `WsMessage` union extended with `{ type: 'ticker'; symbol: string; bid: number; ask: number }`.
  - **Client `TradingPanel.tsx`**: reads `bid`/`ask` from active pane store (8 unconditional `useStore` calls — 4 bid + 4 ask, picks `[activePane]`). Spread badge shows live `ask − bid` value (4 decimal places if < 1, 2 otherwise), tooltip shows raw bid/ask. Sell button price shows `bid ?? latestPrice`; Buy button shows `ask ?? latestPrice`.

- **`usePendingOrderMonitor`** — limit/stop order execution on price trigger; 16 unit tests; mounted in `DashboardPage` alongside `useTPSLMonitor`
- **Orders tab** in `PaperTradingPanel` — unified order lifecycle table; **all order types** (market + limit + stop) appear here, matching TradingView exactly: market orders land instantly in the **Filled** sub-tab; limit/stop go through Working → Filled/Cancelled. Sub-tabs: `All | Working | Filled | Cancelled | Rejected` with live count badges. Cancel button refunds reserved balance; amber badge on tab counts working orders only.
- **Sound alert system** — Web Audio API (`useTradingSound` + `TradingSoundContext` + `SoundSettings`): synthesised tones for order placed, TP/SL hit, limit/stop filled, cancelled
- **TradingPanel full-height layout** — `TradingPanel` is now a sibling of the center column (chart + bottom panel) so it spans from SymbolBar to TickerBar without being cut by the bottom panel
- **PaperTradingPanel maximize/restore** — `Maximize2`/`Minimize2` button; chart area collapses via framer-motion `flex: 0 0 0px`; panel content shown when maximized regardless of `PanelSize`
- **`lastKnownPrices` in `paneStore`** — persists mark prices across symbol switches; fixes PnL display for non-active-symbol positions (test 2.5.3)
- **Crypto icons** in Positions / Orders / History tables — 16 px `CryptoIcon` beside symbol text
- **`useShallow` selectors** — `paneSymbols` object selector wrapped in `useShallow` to prevent `getSnapshot` infinite loop
- **Journal PnL badge** — `JournalEntry.pnl?: number` (net = gross − exit commission); `closePosition` attaches it to the exec entry; `useTPSLMonitor` passes it via `addJournalNote(text, false, netPnl)`; `JournalRow` renders a colored `+$X.XX` / `−$X.XX` pill inline after the text (green/red tint). Only close entries carry the badge; open and user-note entries do not.
- **Tab persistence across symbol changes** — `OrderTab` exported from `TradingPanel.tsx`; `tradingTab` lifted to `DashboardPage`; passed as `initialTab` + `onTabChange` props so Market/Limit/Stop selection survives the `key`-reset remount. Price input lazily initialised to new symbol's `latestPrice` when mounting on Limit/Stop.

### 📋 Planned

- **Phase 3**: Sync paper trading state to DB (Account, Order, Trade models already in schema)
- **Phase 3**: User profile / account settings (change username, change password)
- **Phase 4**: Advanced indicators, alerts, multi-symbol watchlist
- **Phase 5**: Live broker integration — Bybit real-money trading (see full spec below)
- **Phase 6**: AI trading bot — 3-role system: Scanner + Analyst + Executor, paper mode only (see full spec below)
- **Phase 6b**: AI bot connected to Bybit live trading — bot places real orders autonomously (requires Phase 5 + Phase 6 proven; see full spec below)

---

## 🔌 Phase 5 — Live Broker Integration (Bybit)

> **Status**: Planned · Not started · No implementation until explicitly instructed.

### Summary

Enable users to connect their personal Bybit account via API keys and execute real trades directly from CryptoDash. The app acts purely as a UI client — it never holds funds. All money stays in the user's own Bybit account. The architecture mirrors how TradingView's broker bridge works: Client → CryptoDash server (signs + validates) → Bybit REST API → user's account.

### Cost Model

- **Bybit API access**: free (public API, no partnership required).
- **Trading fees**: paid by the user to Bybit directly (~0.055% taker / ~0.01% maker) — same as on Bybit.com. CryptoDash charges nothing.

### Legal / Compliance Position

- Building on Bybit's public API does **not** require a broker-dealer license — the app is a UI, not a money transmitter. Identical legal position to 3Commas, Altrady, and other third-party terminals.
- Bybit ToS explicitly permits third-party API clients.
- Users in jurisdictions where Bybit is restricted (e.g. the US) use the platform at their own legal risk — ToS disclaimer required.
- GDPR / data privacy: API keys are sensitive personal data — encrypted storage + clear privacy policy mandatory.
- A **ToS / liability disclaimer** must gate Live mode activation (user acknowledges real-money risk).

### Architecture

```
User clicks "Buy" (Live mode)
        ↓
CryptoDash client → POST /api/trading/order (authenticated)
        ↓
Fastify server: validates symbol, looks up encrypted API key, signs request (HMAC-SHA256)
        ↓
Bybit REST API v5 (/v5/order/create)
        ↓
Bybit executes in user's account → response returned to client
        ↓
liveStore updated; positions polled / streamed via Bybit private WebSocket
```

### Steps to Implement

| #   | Task                                                                                                              | Files                               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `BybitApiKey` Prisma model — encrypted `apiKey` + `apiSecret` (AES-256-GCM), `testnet: boolean`, linked to `User` | `prisma/schema.prisma`, `config.ts` |
| 2   | `/api/account/api-keys` CRUD routes — save, delete, verify (ping `/v5/account/info`)                              | `routes/account/index.ts`           |
| 3   | `BybitRestClient.ts` — HMAC-SHA256 signing, place/cancel order, fetch positions                                   | `services/BybitRestClient.ts`       |
| 4   | `BrokerAdapter` interface — abstraction layer for Bybit; enables future Binance/OKX support                       | `services/BrokerAdapter.ts`         |
| 5   | Live trading routes — `POST /api/trading/order`, `DELETE /api/trading/order`, `GET /api/trading/positions`        | `routes/trading/index.ts`           |
| 6   | SDK types for live orders + positions                                                                             | `generated/CDSDK/types/index.ts`    |
| 7   | `liveStore.ts` (Zustand, mirrors `paperStore` shape) — holds live positions/orders                                | `store/liveStore.ts`                |
| 8   | Paper ↔ Live mode toggle pill in `TradingPanel` — "LIVE — Real Money" warning banner                              | `TradingPanel.tsx`                  |
| 9   | API Key settings page / modal — paste keys, pick testnet vs mainnet, verify connectivity                          | new settings page                   |

### Key Design Decisions (to confirm before implementation)

| Decision     | Options                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| Default mode | Testnet (safe default) vs. mainnet opt-in                                      |
| Key storage  | Encrypted in DB (convenient) vs. session-only in memory (safer, more friction) |

### Risks

| Risk                                                      | Severity    | Mitigation                                                          |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Bug places wrong order                                    | 🔴 Critical | Server validation + order preview confirmation modal                |
| API key leaked in a breach                                | 🔴 Critical | AES-256-GCM at rest, never logged, HTTPS only                       |
| User loses money due to a bug                             | 🔴 Critical | Clear ToS disclaimer; no liability assumed by CryptoDash            |
| Rate limit exceeded                                       | 🟡 Medium   | Respect Bybit rate limits (10 req/s), queue with backpressure       |
| Stale positions (user trades on Bybit.com simultaneously) | 🟡 Medium   | Poll positions every 5–10 s or subscribe to Bybit private WebSocket |
| Double order on network retry                             | 🟡 Medium   | `orderLinkId` idempotency key per order                             |

---

## 🤖 Phase 6 — AI Trading Bot (3-Role System, Paper Only)

> **Status**: Planned · Not started · No implementation until explicitly instructed.
> **Prerequisite**: Paper trading (Phase 2) ✅ complete — bot trades paper only in Phase 6. Live bot execution requires Phase 5 first.

### Summary

An intelligent, communicative trading bot in two modes — **Supervised** (alerts + awaits approval) and **Autonomous** (full self-execution). Three simultaneous roles: **Scanner** (news + sentiment), **Analyst** (technicals + LLM reasoning in plain English), and **Executor** (order placement, TP/SL, trailing stop, exit logic). Explains every decision like a senior trader.

### Agreed Design Decisions

| Decision                   | Choice                                                    | Rationale                                                                                           |
| -------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Trading mode               | **Paper trading only** (Phase 6)                          | Prove bot before touching real money                                                                |
| Bot modes                  | **Supervised** + **Autonomous**                           | User picks per-session or per-symbol                                                                |
| Primary test timeframe     | **15m**                                                   | ~10 clear signals/day; patterns reliable; commission-safe; LLM has time to reason                   |
| Secondary timeframe        | **1h swing** (added once 15m is proven)                   | Cleaner signals, fewer trades, better R:R                                                           |
| Why not 1m scalping        | **Skipped**                                               | 0.07% commission requires >0.14% move to break even — statistically unfavourable; too noisy for LLM |
| News sources (start)       | **CryptoPanic free + CoinDesk/CoinTelegraph RSS = $0/mo** | Free tier sufficient to validate the pipeline                                                       |
| LLM — sentiment pre-filter | **GLM-4-Flash (free)**                                    | Genuinely $0; filters irrelevant headlines before spending a DeepSeek call                          |
| LLM — analysis loop        | **DeepSeek-V3** (~$0.60/mo)                               | GPT-4o-class quality; cheapest frontier model                                                       |
| LLM — final trade decision | **DeepSeek-R1** (~$0.30/mo)                               | Chain-of-thought — shows reasoning step by step; ideal for trade rationale                          |
| Total LLM cost             | **~$0.90/mo** (9 symbols, 24/7)                           | Two-stage pipeline keeps costs minimal                                                              |

### Two-Stage LLM Pipeline

```
News headlines arrive
        ↓
GLM-4-Flash (free): "Is this headline relevant to {symbol}? Yes/No"
        ↓ only if Yes
DeepSeek-V3: full sentiment + market state analysis
        ↓ only when confidence threshold met
DeepSeek-R1: final trade decision (chain-of-thought)
```

### Indicators Already on Server (reusable ✅)

- EMA 9, 21, 200 · MACD 12/26/9 · VWAP — all in `IndicatorCalculator.ts`

### New Indicators to Add

| Indicator                | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| RSI (14)                 | Overbought/oversold detection               |
| Bollinger Bands (20, 2σ) | Volatility squeeze + breakout               |
| ATR (14)                 | Dynamic TP/SL sizing (TP = entry ± 1.5×ATR) |
| Volume MA (20)           | Conviction confirmation                     |
| Swing High/Low detector  | Support/resistance levels                   |

### Candlestick Patterns (`PatternAnalyzer` — new)

Doji · Hammer · Inverted Hammer · Shooting Star · Bullish/Bearish Engulfing · Morning/Evening Star · Marubozu · Inside Bar

### What Needs to Be Built

| Component                            | Location                            | Purpose                                                                              |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `BotOrchestrator`                    | `services/BotOrchestrator.ts`       | Scheduler — coordinates all 3 roles on candle close                                  |
| `NewsScanner`                        | `services/NewsScanner.ts`           | Polls CryptoPanic / RSS; 5 min TTL cache                                             |
| `PatternAnalyzer`                    | `services/PatternAnalyzer.ts`       | 8-pattern candlestick detection                                                      |
| Extended `IndicatorCalculator`       | `services/IndicatorCalculator.ts`   | Add RSI, BB, ATR, Volume MA, Swing H/L                                               |
| `LLMReasoner`                        | `services/LLMReasoner.ts`           | Provider-agnostic wrapper (DeepSeek / GLM / OpenAI / Ollama)                         |
| `BotExecutor`                        | `services/BotExecutor.ts`           | Applies decisions to paperStore; trailing stop; exit conditions                      |
| `BotConfig` + `BotLog` Prisma models | `prisma/schema.prisma`              | Per-user config + full reasoning log                                                 |
| Bot WebSocket channel                | `routes/market/index.ts`            | Streams `BotLogEntry` to client in real time                                         |
| `botStore`                           | `store/botStore.ts`                 | Client: running/stopped, reasoning log, pending approvals                            |
| `BotPanel` component                 | `components/dashboard/BotPanel.tsx` | Live reasoning feed, enable/disable, Approve/Reject buttons                          |
| Bot API routes                       | `routes/bot/index.ts`               | `POST /bot/config`, `GET /bot/logs`, `POST /bot/approve/:id`, `POST /bot/reject/:id` |
| SDK types                            | `generated/CDSDK/types/index.ts`    | `BotConfig`, `BotLogEntry`, `TradeRecommendation`, `SentimentSignal`                 |

### Risks

| Risk                                    | Severity    | Mitigation                                                          |
| --------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Bot loses large paper balance  | 🟡 Medium   | Max 1% risk/trade; max 3 open positions; auto-pause at 5% daily loss     |
| LLM returns invalid JSON       | 🔴 Critical | Strict JSON schema validation; parse failure → WAIT, never force a trade |
| LLM provider outage            | 🟡 Medium   | Bot pauses gracefully; retries after 5 min                               |
| News API down                  | 🟢 Low      | Analyst proceeds on technicals only                                      |
| Prompt injection via headlines | 🟡 Medium   | Headlines as JSON data only; system prompt immutable                     |
| GLM-5/5.1 adopted prematurely  | 🟢 Low      | Deferred — pricing/API stability not confirmed as of 2026-04-20          |

---

## 🤖 Phase 6b — AI Bot Connected to Bybit Live Trading

> **Status**: Planned · Not started · No implementation until explicitly instructed.
> **Prerequisites**: Phase 5 (Bybit live trading) ✅ + Phase 6 (bot paper-proven, positive results over ≥7 days / ≥50 trades) ✅

### Summary

The paper-proven 15m bot switches its Executor target from `paperStore` to the `BrokerAdapter` (Phase 5), placing real orders in the user's Bybit account. The Scanner, Analyst, LLM pipeline, reasoning log, and BotPanel UI are **identical to Phase 6** — only the Executor's final action changes. This is ~20% additional work on top of Phase 6.

### What Changes vs Phase 6 (Very Little)

| Component               | Phase 6 (paper)                    | Phase 6b (live)                                    |
| ----------------------- | ---------------------------------- | -------------------------------------------------- |
| `BotExecutor.execute()` | calls `paperStore.placeOrder()`    | calls `BrokerAdapter.placeOrder()` → Bybit REST    |
| Trailing stop           | modifies `paperStore` position     | polls Bybit position + amends SL via REST          |
| Exit                    | calls `paperStore.closePosition()` | calls `BrokerAdapter.closePosition()` → Bybit REST |
| Everything else         | identical                          | identical                                          |

### Architecture (full chain)

```
Phase 2 ✅         Phase 5             Phase 6             Phase 6b
Paper trading  →  Real order      →  Proven bot      →  Full autonomous
(paperStore)      routing             logic               live trading
                  (BrokerAdapter)     (paper only)        (BrokerAdapter)
```

### Safety Gates — All Required Before Live Bot Activation

| Gate                        | Detail                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 5 prerequisite        | User must have connected + verified Bybit API keys — enforced in code, not just UI                                                                    |
| Paper mode proven           | Bot must have run paper mode for configurable minimum (default: 7 days + 50 trades) with positive results — stats summary shown before upgrade prompt |
| Explicit confirmation modal | Multi-step: "This bot will place REAL orders with REAL money. Your losses are your own." — user must type confirmation phrase                         |
| Hard daily loss limit       | Bot auto-kills + sends alert if real account drops >X% in a day — cannot be disabled                                                                  |
| Max position size cap       | Never risk more than Y% per trade or Z USDT total across open positions — requires re-confirmation to increase                                        |
| Supervised mode warm-up     | When first switching paper→live, Supervised mode is forced for a configurable warm-up period before Autonomous is unlocked                            |

### Risks

| Risk                                    | Severity    | Mitigation                                                          |
| --------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Bot loses real money due to bad signal  | 🔴 Critical | All Phase 6 safeguards + hard daily loss limit + supervised warm-up |
| Bug in BrokerAdapter routes wrong order | 🔴 Critical | End-to-end tested on testnet first; order preview confirmation      |
| User disables safety gates              | 🔴 Critical | Hard limits enforced server-side — client cannot bypass them        |
| Bybit API outage mid-trade              | 🟡 Medium   | Bot pauses; open positions monitored via polling; user alerted      |
| Phase 6 bot not actually proven         | 🟡 Medium   | Minimum paper period enforced in code before upgrade is offered     |

---

_Last updated: 2026-04-22 — **fix: two browser console issues resolved** — (1) Qty input in `TradingPanel` now has `id="trading-qty" name="qty"` — eliminates the "form field missing id/name" browser issue. (2) `vite.config.ts` now sets `server.headers` with a dev-only `Content-Security-Policy` that includes `'unsafe-eval'` in `script-src` — fixes Vite 8's built-in CSP blocking esbuild source maps and animation libs; header only applies to the Vite dev server, never deployed. Previously: **fix: BybitWebSocketManager frozen price**
