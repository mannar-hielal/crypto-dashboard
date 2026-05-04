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

| Item                                                                                 | File                  | Type           | Status   |
| ------------------------------------------------------------------------------------ | --------------------- | -------------- | -------- |
| `dangerouslySetInnerHTML` prohibition + user content as plain text                   | `REVIEW_CHECKLIST.md` | Checklist item | ✅ Added |
| `paperStore` `persist()` — add `version` + `migrate` for safe localStorage hydration | `paperStore.ts`       | Code change    | ✅ Done  |

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
│  Order & Account Management (OrderAccountManagementPanel)      │
│  h-0 / h-9 / h-52 or full (maximize)                │
├──────────────────────────────────────────────────────┤
│   TickerBar                            (h-8)         │
├──────────────────────────────────────────────────────┤
│   Footer                               (h-7)         │
└──────────────────────────────────────────────────────┘
```

- `PanelSize = 'hidden' | 'collapsed' | 'open'` — exported from `DashboardPage.tsx`, used by `OrderAccountManagementPanel`
- `TradingPanel` uses `key={`${activePane}-${symbol}`}` — React remounts on active pane OR symbol change, resetting all local form state
- `TradingPanel` open/close: wrapper `motion.div` **always rendered** (never unmounted at close); `animate={{ width: 0, opacity: 0 }}` hides it. Component stays mounted so **form state (qty, price, TP/SL, tab, side) is fully preserved across close/reopen**; only a symbol/pane key change resets form inputs.
- `inert` attribute is applied to hidden wrappers (`OrderAccountManagementPanel` and right `TradingPanel`) to remove hidden content from keyboard/a11y interaction
- Current panel header UI exposes `open`/`collapsed` controls; no floating re-open pill is rendered for a `hidden` state

---

### Bottom Panel — `OrderAccountManagementPanel` ✅ (current implementation)

> **UI panel label**: "Order & Account Management" (displayed in the panel header bar). Component file: `OrderAccountManagementPanel.tsx`.

**Header bar (top strip):**

- Left: "Order & Account Management" label
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

**Tabs** (5 total, purple animated underline):

1. **Positions** ✅ — columns: Symbol, Side, Qty, Entry, Mark, TP, SL, PnL (USDT) · optional: Order ID, Opened At, Leverage, Margin, Commission · sticky: Close (✕)
   - Side shown as colored LONG/SHORT with TrendingUp/TrendingDown icon
   - Last Price: uses `lastKnownPrices` (falls back from live pane price — correct for all symbols)
   - Empty state: "No open positions"
   - Row entrance: staggered framer-motion (`rowVariants`, 0.04 s delay per row)

2. **Orders** ✅ — unified order lifecycle table (market + parent pending + child TP/SL legs). Columns: Symbol, Status, Type, Side, Qty, Limit Price, Stop Price, Fill Price, TP, SL, Commission, Placing Time (on by default) · optional: Order ID, Leverage, Margin · sticky: Cancel (✕)
   - **Sub-tabs**: `All | Working | Inactive | Filled | Cancelled | Rejected` filter bar; each shows live count badge; animated purple underline indicator. Filled historical rows are visible in **Orders → Filled** (TV-style) **and** in the permanent Order History tab.
   - **Top Orders badge** counts **active rows only** (`pending` + `exit-order` kinds) — historical filled/cancelled/rejected rows do not inflate the headline count.
   - **Bracket lifecycle (TV-style)**: placing limit/stop with TP+SL creates 3 linked rows: parent order + TP child + SL child.
   - **Pre-fill/trigger**: parent row = Working, TP/SL child rows = Inactive; cancelling parent cancels all 3.
   - **Post-fill/trigger**: parent row moves to historical Filled (visible in Orders → Filled + Order History → Filled; non-cancellable); child exits become Working and can be cancelled individually.
   - **Position close — sibling cancel** ✅: `closePosition` builds a `siblingCancelOrders: HistoricalOrder[]` array at close time. Rules: if `closeType === 'take-profit'` → cancel SL; if `closeType === 'stop-loss'` → cancel TP; manual close (no closeType) → cancel both. Each cancelled record: `type = 'take-profit' | 'stop-loss'`, `status = 'cancelled'`, `commission = 0`, `placingTime = pos.openedAt`, `closingTime = now`, `limitPrice` or `stopPrice` filled with the exit level. They land in `orders[]` alongside the fill record, making them appear in **Order History → Cancelled** and **Orders → Cancelled** — mirrors TradingView exactly. No journal note is added for auto-cancelled siblings (kept silent to avoid noise next to the main TP/SL close entry).
   - `OrderDisplayRow` union: `{ kind: 'pending'; data: PendingOrder } | { kind: 'historical'; data: HistoricalOrder } | { kind: 'exit-order'; data: SyntheticExitOrder }`.

3. **Order History** ✅ — TV-style order history table showing all `HistoricalOrder[]` records (market + limit + stop, all statuses). Columns: Symbol, Side, Type, Qty, Limit Price, Stop Price, Fill Price, Status, Commission, Placing Time, Closing Time (on by default) · optional: Order ID, Leverage, Margin
   - **Sub-tabs**: `All | Filled | Cancelled | Rejected` filter bar; each shows live count badge; animated purple underline indicator
   - Includes market order fills, limit/stop fills, cancellations, and rejected orders
   - Status badge: Filled = green, Cancelled = muted, Rejected = red with ⚠ icon + hover tooltip
   - Rejected orders live here (not in the Balance History / Trade History tab)

4. **Balance History** ✅ — balance change log (`BalanceEvent[]`). Columns: Time, Balance Before, Balance After, Realized P&L, Action
   - Every balance mutation (order placement, fill, close, reset) appends an event
   - PnL column coloured green (profit) / red (loss) / muted (zero or neutral events)
   - Column picker supported via `cd-paper-col-prefs` localStorage key

5. **Trading Journal** ✅ — 3 columns: Time, Text, Edit (pencil on hover for user notes)

Tab badge counts: purple pill for Positions count, amber pill for Orders count (**active rows only** — pending + exit-order; excludes filled/cancelled/rejected historical rows), gray pill for Order History / Balance History / Journal count

**Column picker** (⊟ SlidersHorizontal icon, top-right of tab bar for all data tabs): togglable non-sticky columns; preferences persisted to `localStorage` key `cd-paper-col-prefs`.

---

### Bottom Panel — `OrderAccountManagementPanel` ✅ (additional features — implemented)

- **⚙️ button → Account Settings modal** ✅:
  - Read-only account name field (shows `useAuthStore` username)
  - **Leverage · Crypto** — interactive **5-button selector** (`1×` · `2×` · `3×` · `5×` · `10×`); **max 10× cap** (learning-app safety); amber badge shows current multiplier. Persisted to `paperStore.leverage` on Save.
  - Commission: `0.07%` (0.0007) Fixed · Taker · Display only (read-only)
  - Footer: "Reset account" (2-click confirm, 3 s auto-cancel, closes modal on confirm) + **"Save"** (enabled — commits `draftLeverage` to `paperStore.leverage`)
  - Backdrop click or ✕ dismisses; confirming-reset state cleared on dismiss

- **Maximize button** (⤢/⤡) in header ✅:
  - Maximized: panel fills entire content area; chart area collapses (`flex: 0 0 0px` via framer-motion)
  - TradingPanel spans full height from SymbolBar to TickerBar (sibling of center column, not cut by bottom panel)
  - Local `useState` (`isMaximized`) in `DashboardPage` — not persisted
  - `Maximize2` / `Minimize2` lucide icons; Collapse/Expand buttons hidden while maximized
  - Panel content shown whenever `isMaximized`, regardless of `PanelSize` state

- **`bottom-widgetbar-handle` drag-to-resize** ✅ (TV-style):
  - A 12 px absolutely-positioned strip lives at the chart/panel boundary in `DashboardPage`, centred via `useTransform(panelHeightMV, h => h - 6)` — zero React re-renders while dragging
  - `touch-action: none; cursor: ns-resize; aria-hidden="true"` — matches TV `bottom-widgetbar-handle` exactly
  - Drag uses `setPointerCapture` for reliable tracking outside the element
  - `panelHeightMV` (Framer `MotionValue`) drives `style.height` directly during drag; `panelHeightPx` state commits on `pointerup`
  - Spring transitions (open ↔ collapsed ↔ hidden ↔ maximize/restore) handled by imperative `animate(panelHeightMV, target, spring)` in `useEffect`
  - Bounds: **min 80 px** (useful minimum) · **max 85% of center column height** (chart always visible)
  - Thin purple accent line (2 px) fades in on hover to confirm the drag zone
  - Hidden when `isMaximized` or `panelSize !== 'open'`; existing open/collapsed/hidden/maximize behaviour **unchanged**

- **`ordersMargin` stat** ✅: `sum(pendingOrders[].usdtAmount)` (live now that pendingOrders is implemented)

- **Last Price column** ✅: `lastKnownPrices` map in `paneStore` — updated on every WS snapshot/bar, never cleared on reset. `getPriceForSymbol()` helper in `OrderAccountManagementPanel` tries live pane price first, falls back to `lastKnownPrices` so positions in non-active symbols retain correct mark price and PnL.

- **Symbol pair icons** (`SymbolPair`) in Positions / Orders / History symbol column ✅: stacked base + quote coin icons (base 16 px front, quote 10 px overlapping bottom-right with panel-colour ring separator) in the TradingView style. Also applied to the `SymbolBar` symbol picker — both the trigger button (18 px base) and every dropdown row (20 px base). `SymbolPair` is exported from `CryptoIcon.tsx`; `USDT` added to `CRYPTO_ICON_URLS` (falls back to text badge gracefully). `cryptoIcons.test.ts` updated: count 9 → 10, USDT mock + expected entry added.

### Bottom Panel — `OrderAccountManagementPanel` ⏳ (still planned)

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
- `paneSizes: Record<LayoutId, PaneSizes>` — per-layout `{ colFracs: number[]; rowFracs: number[] }` (fractions sum to 1.0 per axis). Persisted. Defaults: equal splits. Hydration guard in `merge()` ensures all layout IDs present even when loading old localStorage snapshots.
- `setLayout()` clamps `activePane` to `paneCount − 1` when switching to a smaller layout
- `setPaneSymbol()` / `setPaneInterval()` propagate to all panes when the matching sync flag is on
- `setPaneSizes(layout, sizes)` — updates column/row fracs for a specific layout ID

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

- CSS `grid` element — `gridTemplateColumns` / `gridTemplateRows` inline styles driven by `paneSizes[layout].colFracs` / `rowFracs` (replaced static Tailwind `grid-cols-*` classes)
- **`ResizeSplitter`** absolutely-positioned overlays (matching TV `chartsSplitter` pattern): 12 px hit zone, `aria-hidden`, `touch-action: none`. Thin purple accent line appears on hover. Zero React re-renders during drag — direct DOM mutation of `style.gridTemplateColumns`/`Rows` + splitter `style.left`/`top` via `setPointerCapture`. Zustand `setPaneSizes` called once on `pointerup` to commit + persist.
  - Col splitters: `cursor: ew-resize` — rendered for `2h`, `3h`, `4` layouts
  - Row splitters: `cursor: ns-resize` — rendered for `2v`, `4` layouts
  - Each splitter only redistributes its two adjacent panes (min 10% each); other panes untouched
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

**Header:** Symbol name (e.g. `BTCUSDT`) + ✕ close (hides panel only, component stays mounted, **all form state preserved** — qty, price, TP/SL, tab, side). Resets **form inputs** (qty, price, TP, SL) on symbol or active pane change via ``key={`${activePane}-${symbol}`}`` in `DashboardPage`. **Tab selection (Market/Limit/Stop) and side (Buy/Sell) survive symbol changes** — `tradingTab` and `tradingSide` are lifted state in `DashboardPage`, passed as `initialTab`/`initialSide` props; `OrderTab` is exported from `TradingPanel.tsx`.

**Side selector (always visible below header):**

- Split button: `Sell {bid ?? latestPrice}` (left) | `Buy {ask ?? latestPrice}` (right)
- Spread badge centered: live `ask − bid` when bid/ask are present (`4 dp` if spread < 1, else `2 dp`); shows `—` while ticker bid/ask are unavailable
- Active side: colored bottom border + tinted background (green Buy / red Sell)

**Order type tabs:** `Market` | `Limit` | `Stop` — spring animated purple underline (framer-motion `layoutId="tab-underline"`)

- **Market**: no price input; executes at `latestPrice`
- **Limit**: price input defaults to the pending side of market (Buy → bid / fallback `latest×0.9999`, Sell → ask / fallback `latest×1.0001`); dispatches `placeLimitOrder`
- **Stop**: price input defaults to the pending side of market (Buy → ask / fallback `latest×1.0001`, Sell → bid / fallback `latest×0.9999`); dispatches `placeStopOrder`

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

**Intentionally skipped vs TradingView:** DOM tab, Risk USD / Risk % balance, Tick value, Time in force

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

Actions: `placeOrder`, `placeLimitOrder`, `placeStopOrder`, `cancelPendingOrder`, `cancelExitOrder`, `closePosition`, `addJournalNote(text, isUserNote?, pnl?)`, `editJournalEntry`, `reset`

**`placeLimitOrder` / `placeStopOrder`**: deducts `usdtAmount + commission` from balance immediately; adds to `pendingOrders` (no historical fill row yet).  
**`cancelPendingOrder`**: removes from `pendingOrders`; refunds `usdtAmount + commission`; writes cancelled parent `HistoricalOrder` and cancelled child TP/SL rows when present.  
**`cancelExitOrder`**: cancels one active exit leg (`take-profit` or `stop-loss`) for an open position; writes cancelled `HistoricalOrder`; keeps the sibling leg active.  
**`closePosition`**: writes filled close order and cancelled sibling exit rows (or both remaining exit rows on manual close).  
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
- `TradingPanel` reads from active pane store unconditionally (4 `useStore` calls — `latestPrice`, `isConnected`, `bid`, `ask`; no selector gating)

---

## 🔢 Business Logic Rules

### Commission

- `COMMISSION_RATE = 0.0007` (0.07% taker fee, exported from `paperStore.ts`)
- Applied on **open**: `balance -= usdtAmount + usdtAmount * COMMISSION_RATE`
- Applied on **close**: `commission = qty * exitPrice * COMMISSION_RATE`
- Balance validation: `usdtAmount + usdtAmount * COMMISSION_RATE > balance` → reject
- `realizedPnl` = `gross_pnl - exitCommission - entryCommission`
- `BalanceEvent.pnl` = `pnl - exitCommission` (net impact on balance at close)

### TP/SL rules (implemented in `checkTPSL()` + bracket lifecycle)

- **Long**: TP when `price >= takeProfit`; SL when `price <= stopLoss`
- **Short**: TP when `price <= takeProfit`; SL when `price >= stopLoss`
- `checkTPSL` is a pure exported function — unit-tested
- `useTPSLMonitor` scoped to active symbol only
- Auto-close journal entries: `isUserNote: false` (read-only)
- Bracket exits are first-class child orders: pre-fill/trigger children are Inactive; post-fill children are Working and independently cancellable
- Manual position close cancels any remaining child exits

### Journal system

- `isUserNote: true` = user-added/editable
- `isUserNote: false` = system-generated — read-only (`editJournalEntry` guards this at store level)

### State reset pattern

- Use `key={prop}` on parent to reset child state on prop change (`TradingPanel` uses ``key={`${activePane}-${symbol}`}`)
- Never use during-render `setState`, never use `useEffect` + `setState` for reset

---

## 📁 Key Files

| File                                                                   | Purpose                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/lib/tokens.ts`                                        | **Design tokens** — single source of truth for all colors, fonts, sizes (JS/TS side)                                                           |
| `apps/client/src/index.css`                                            | Tailwind v4 theme — `@theme inline` generates brand color utilities from tokens                                                                |
| `apps/client/src/store/paperStore.ts`                                  | All paper trading state + actions                                                                                                              |
| `apps/client/src/store/marketStore.ts`                                 | Live price feed state                                                                                                                          |
| `apps/client/src/store/authStore.ts`                                   | Auth token + user (in-memory, no persist)                                                                                                      |
| `apps/client/src/hooks/useTPSLMonitor.ts`                              | Auto-close hook + exported `checkTPSL()`                                                                                                       |
| `apps/client/src/hooks/usePriceFeed.ts`                                | WebSocket price feed lifecycle                                                                                                                 |
| `apps/client/src/components/dashboard/OrderAccountManagementPanel.tsx` | **"Order & Account Management"** bottom panel — Positions · Orders · Order History · Balance History · Trading Journal; Account Settings modal |
| `apps/client/src/components/dashboard/TradingPanel.tsx`                | Right sidebar order entry                                                                                                                      |
| `apps/server/src/routes/auth/index.ts`                                 | All auth routes (register/login/logout/refresh/me/reset-password),                                                                             |
| `apps/server/src/routes/market/index.ts`                               | REST + WebSocket market data routes                                                                                                            |
| `apps/server/src/services/BybitWebSocketManager.ts`                    | Bybit WS connection singleton                                                                                                                  |
| `apps/server/src/constants.ts`                                         | `ALLOWED_SYMBOLS` — source of truth for WS subscriptions + routes                                                                              |
| `generated/CDSDK/types/index.ts`                                       | Shared types (User, Account, CandleBar, WsMessage, etc.)                                                                                       |
| `generated/CDSDK/api/auth.ts`                                          | Client-side auth API calls                                                                                                                     |
| `generated/CDSDK/api/market.ts`                                        | Client-side market API + WS URL                                                                                                                |
| `apps/client/src/lib/markets.ts`                                       | Shared `SYMBOLS` (9 coins), `INTERVALS` (6), `INTERVAL_LABELS`, `SymbolEntry` type — imported by SymbolBar, PaneHeader, layoutStore defaults   |
| `apps/client/src/store/layoutStore.ts`                                 | Layout config — layout ID, activePane, per-pane symbol/interval, sync options                                                                  |
| `apps/client/src/store/paneStore.ts`                                   | 4 independent vanilla Zustand stores (bars/price/connection per pane)                                                                          |
| `apps/client/src/hooks/usePaneFeeds.ts`                                | Manages 4 WS+REST connections (one per active pane) — replaces `usePriceFeed`                                                                  |
| `apps/client/src/components/dashboard/ChartLayoutPicker.tsx`           | Layout picker popover (5 SVG icons) + sync option toggles                                                                                      |
| `apps/client/src/components/dashboard/PaneHeader.tsx`                  | Per-pane mini header (symbol picker, interval buttons, live price, connection dot)                                                             |
| `apps/client/src/components/dashboard/MultiChartArea.tsx`              | CSS grid renderer for all layouts; wires crosshair + time-range sync                                                                           |
| `docs/markup-reference/`                                               | HTML UI reference files — component structure & interaction patterns (not 1:1 copies)                                                          |
| `docs/screenshots/theme/`                                              | Visual source of truth — spacing, colors, sizes, layout                                                                                        |
| `docs/REVIEW_CHECKLIST.md`                                             | Pre-commit review checklist — run before every push                                                                                            |
| `docs/APP_LOG.md`                                                      | This file — full project context, attach at start of every session                                                                             |

---

## 🗺️ Phase Roadmap

### ✅ Completed

- **Phase 1**: Auth (register/login/logout/refresh/forgot+reset password), JWT + httpOnly cookie rotation, Prisma schema, email service, Swagger docs
- **Phase 1**: Market data — Bybit WebSocket, CandleAggregator, IndicatorCalculator, REST history endpoint
- **Phase 1**: Client scaffold — React 19, Vite, Tailwind, PWA, React Router, Zustand
- **Phase 2**: Live price feed (WebSocket → `usePriceFeed` → `marketStore`)
- **Phase 2**: Paper trading v1 — `paperStore` (market orders), `TradingPanel` (market-only), `OrderAccountManagementPanel` (Positions + Order History + Balance History + Journal tabs), TP/SL monitor, commission accounting
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

- **Account Settings modal** — replaces 2-click reset on ⚙️ gear button in `OrderAccountManagementPanel` header. Read-only fields: account name (username from `useAuthStore`), Leverage (`10:1`, Crypto), Commission (`0.07% / 0.0007`, Fixed · Taker). Footer: "Reset account" (2-click confirm, 3 s auto-cancel, closes modal on confirm) + "Save" (disabled — read-only). Backdrop click or ✕ dismisses; confirm state clears on dismiss.
- **Bid/Ask real-time feed** — end-to-end:
  - **Server `bybit.ts`**: subscribes `orderbook.1.{symbol}` for all `ALLOWED_SYMBOLS`. Processes `orderBook` stream data, extracts `bids[0][0]`/`asks[0][0]`, throttles to 500 ms per symbol, broadcasts `TickerUpdate { symbol, bid, ask }` to a separate `tickerListeners` set. `BybitService` gains `subscribeTicker(listener)` method.
  - **Server `market/index.ts`**: WS handler subscribes to `subscribeTicker` filtered by symbol, forwards `{ type: 'ticker', symbol, bid, ask }` JSON to the client WebSocket.
  - **Client `paneStore.ts`**: `PaneMarketState` gains `bid: number | null`, `ask: number | null`, `setBidAsk(bid, ask)`. `reset()` clears bid/ask.
  - **Client `usePaneFeeds.ts`**: `onmessage` handles `type === 'ticker'` → `store.getState().setBidAsk(msg.bid, msg.ask)`.
  - **SDK `types/index.ts`**: `WsMessage` union extended with `{ type: 'ticker'; symbol: string; bid: number; ask: number }`.
  - **Client `TradingPanel.tsx`**: reads `bid`/`ask` from active pane store (8 unconditional `useStore` calls — 4 bid + 4 ask, picks `[activePane]`). Spread badge shows live `ask − bid` value (4 decimal places if < 1, 2 otherwise), tooltip shows raw bid/ask. Sell button price shows `bid ?? latestPrice`; Buy button shows `ask ?? latestPrice`.

- **`usePendingOrderMonitor`** — limit/stop order execution on price trigger; 16 unit tests; mounted in `DashboardPage` alongside `useTPSLMonitor`
- **Orders tab** in `OrderAccountManagementPanel` — unified order lifecycle table; pending limit/stop orders (Working/Inactive) and historical records; filled rows visible in Orders → Filled and Order History → Filled. Sub-tabs: `All | Working | Inactive | Filled | Cancelled | Rejected` with live count badges. Cancel button refunds reserved balance; top Orders badge counts active rows only (pending + exit-order, excludes historical).
- **Sound alert system** — Web Audio API (`useTradingSound` + `TradingSoundContext` + `SoundSettings`): synthesised tones for order placed, TP/SL hit, limit/stop filled, cancelled
- **TradingPanel full-height layout** — `TradingPanel` is now a sibling of the center column (chart + bottom panel) so it spans from SymbolBar to TickerBar without being cut by the bottom panel
- **OrderAccountManagementPanel maximize/restore** — `Maximize2`/`Minimize2` button; chart area collapses via framer-motion `flex: 0 0 0px`; panel content shown when maximized regardless of `PanelSize`
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

| Risk                           | Severity    | Mitigation                                                               |
| ------------------------------ | ----------- | ------------------------------------------------------------------------ |
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

_Last updated: 2026-05-04 (TRADING_TEST_PLAN terminology alignment: SELL/BUY wording pass + parity notes consistency)_

- **feat: edit panels for open positions and pending orders (26.04.2026)**
  - **`paperStore.ts`** — two new store actions:
    - `updatePositionExits(positionId, takeProfit | null, stopLoss | null)`: mutates position TP/SL in-place; writes `HistoricalOrder` `'cancelled'` records for any leg being removed or replaced; journal entry _"Updated exits for LONG BTCUSDT — TP: $X / SL: $Y"_.
    - `editPendingOrder(orderId, newTriggerPrice, newUsdtAmount, newTakeProfit, newStopLoss)`: refunds old reserved margin to a scratch balance, recomputes new cost; **insufficient funds path** → moves order to `HistoricalOrder` as `'rejected'` + child TP/SL as `'cancelled'`, journal entries, balance refunded; **valid path** → updates `PendingOrder` in-place, settles balance delta, journal entry.
  - **`PositionEditPanel.tsx`** — new right-column TV-style panel for editing open position TP/SL; header (symbol + "Long 0.0037 @ $77,440"), Exits section (TP/SL toggles + price inputs, direction-aware `AlertTriangle` warnings), Position info block (Leverage, Trade value, Reward, Risk), Confirm + Discard buttons.
  - **`PendingOrderEditPanel.tsx`** — new right-column TV-style panel for editing pending limit/stop orders; header ("BTCUSDT, order …{id}" + "Buy Limit 2 @ 77,500.0"), Price input, Quantity input (units + live USD equivalent), Exits section (TP/SL toggles + inputs), Order info block, inline insufficient-funds `AlertTriangle` banner, Confirm + Discard buttons.
  - **`DashboardPage.tsx`** — new `editTarget` state (`null | { kind: 'position'; positionId } | { kind: 'pending'; orderId }`); right column conditionally renders `PositionEditPanel` or `PendingOrderEditPanel` instead of `TradingPanel` using the same width-spring `AnimatePresence` pattern; `onEditPosition` / `onEditPendingOrder` callbacks passed to `OrderAccountManagementPanel`; Discard/close restores prior state.
  - **`OrderAccountManagementPanel.tsx`** — new optional props `onEditPosition` / `onEditPendingOrder`; hover-reveal `Pencil` icons added to **TP** and **SL** cells in the Positions table (calls `onEditPosition`); hover-reveal `Pencil` added to the limit/stop-price cell for `kind === 'pending'` rows in the Orders table (calls `onEditPendingOrder`).

- **fix: bracket Orders badge + TV-style activation journal entries** ✅
  - `OrderAccountManagementPanel` — Orders tab badge now counts **all** active order rows:
    `pendingOrders.length + inactivePendingExitRows.length + exitOrderRows.length`
    (previously `inactivePendingExitRows` was excluded — badge showed 1 instead of 3 for a bracket).
  - `usePendingOrderMonitor` — after a bracket limit/stop order fills, two additional system
    journal notes are appended (one per activated exit leg):
    `Take-Profit order activated — {sideLabel} {symbol} @ ${price}`
    `Stop-Loss order activated — {sideLabel} {symbol} @ ${price}`
    These are read-only system entries (isUserNote: false), mirroring TradingView's activation log.
    Journal order: fill entry first, then TP activation, then SL activation (newest-first in view).

- **feat: drag-to-resize bottom panel + chart pane splitters**
  - Added TV-style `bottom-widgetbar-handle` resize for `OrderAccountManagementPanel` via Framer `MotionValue`.
  - Added `ResizeSplitter` overlays for `2h`, `2v`, `3h`, and `4` layouts.
  - Persisted per-layout pane sizes in `layoutStore.paneSizes`.

- **fix: Orders tab — TV-style immediate archive (25.04.2026)**
  - Removed `ORDER_FILLED_ARCHIVE_MS` constant and the 60 s `now` ticker (`setInterval`).
  - Filled rows are no longer delayed — they move to `status === 'filled'` immediately on execution.
  - Removed the time-delay archive path entirely (no `setInterval`, no `ORDER_FILLED_ARCHIVE_MS`).
  - `OrderSubTab` type initially had `'filled'` removed (reverted in a later pass — see 01.05.2026 Orders Filled sub-tab entry).
  - **Current state (post-revert)**: Orders → Filled sub-tab restored; filled rows are visible in both Orders → Filled and Order History → Filled. Orders top-level badge counts active rows only (pending + exit-order).
  - Dead `setInterval` ticker removed permanently; the `'filled'` filter logic is immediate and synchronous.

- **fix: PR code review issues (25.04.2026)** ✅
  - `BybitWebSocketManager.ts` — `unsubscribe()` now calls `sendUnsubscription(key)` **before** `this.subscriptions.delete(key)`. Previously the key was removed from the map first, causing `sendUnsubscription` to no-op (it reads from the map) — Bybit would never receive the unsubscribe message.
  - `paperStore.ts` — `leverage` in the `fresh` fallback object and the v0→v1 migration both corrected from `10` to `1`, matching the store's initial state (`leverage: 1`) and the interface docs ("Default 1 = no leverage"). Previously users migrating from v0 or falling back to `fresh` would unexpectedly get 10× leverage.
  - `OrderAccountManagementPanel.tsx` — Collapse/Expand button gate changed from `size !== 'collapsed'` to `size !== 'hidden'`. The old condition hid the button exactly when the panel was collapsed, making it impossible to re-expand without another UI path. Now the Expand button is visible when collapsed.
  - `vite.config.ts` — `unsafe-inline` in `script-src` is intentional and required: `@vitejs/plugin-react` injects an inline `<script type="module">` preamble for React Fast Refresh globals; removing it breaks HMR entirely with "can't detect preamble". The existing comment already documents this accurately. Dev CSP is served only by the Vite dev server — never in production.

- **feat: TV-style edit pencils — pre-fill & post-fill orders (30.04.2026)** ✅
  - `OrderAccountManagementPanel.tsx` — added `group` class to `motion.tr` elements in both the Positions table and Orders table so `group-hover:opacity-100` transitions work correctly on hover.
  - **Post-fill (open positions)**: pencil icons on the **Take Profit** and **Stop Loss** columns in the Positions tab call `onEditPosition(pos.id)` to open `PositionEditPanel` (TP/SL edit for that position).
  - **Orders tab — Working exit rows** (synthetic TP/SL rows from open positions): pencils on the **Limit Price** cell (TP row) and **Stop Price** cell (SL row) also call `onEditPosition(ex.positionId)` → same `PositionEditPanel`.
  - **Pre-fill (pending orders)**: pencils added to the **TP** and **SL** columns for pending order rows (call `onEditPendingOrder(orderId)` → `PendingOrderEditPanel` to edit price, qty, and exits).
  - **Orders tab — Inactive exit rows** (pre-fill TP/SL attached to pending orders): pencils on the **Limit Price** cell (TP row) and **Stop Price** cell (SL row) call `onEditPendingOrder(ex.positionId)` (positionId stores the parent pending order ID), opening the same `PendingOrderEditPanel`.
  - Result: every editable row type — pending main orders, their inactive TP/SL pre-fills, and Working TP/SL rows from open positions — now has a hover-reveal pencil that routes to the correct edit panel.

- **fix: edit panel UX — pre-fill, toggle direction, qty mode, cancel records (30.04.2026)** ✅
  - **Pre-filled inputs** — `PositionEditPanel` and `PendingOrderEditPanel` price/qty inputs changed from `type="number"` to `type="text"` + `inputMode="decimal"`. Root cause: `fmtMktPrice` uses `toLocaleString` which produces comma-formatted strings like `"77,495"` — `type="number"` inputs reject the comma and show blank. The existing `.replace(/,/g, '')` parse already handled commas, so switching to `type="text"` was the only fix needed.
  - **Toggle direction** — `Toggle` component `<span>` thumb anchor changed to `right: '2px'` with `transform: translateX(-12px)` when ON (green visible, thumb slides left) and `transform: translateX(0px)` when OFF (gray visible, thumb sits right). Previously `left`-anchored with `translateX(12px)`/`translateX(2px)` — visually reversed from the intended green-left/gray-right pattern.
  - **USD ↔ Units mode in `PendingOrderEditPanel`** — added `qtyMode: 'units' | 'usd'` state and `usdInput` state (initialised from `order.usdtAmount`). `ArrowLeftRight` swap button converts the current value numerically to the other unit on click (no reset). Derived `newQty` / `newUsdtAmount` computed from whichever mode is active; the equivalent in the other unit is shown below the input as a hint.
  - **Cancel records on TP/SL removal** (`paperStore.ts`, `updatePositionExits` + `editPendingOrder`):
    - Changed condition from `pos.takeProfit != null` (loose equality — fails when value is `undefined` because `undefined == null` is `true` in JS) to `!!pos.takeProfit` (strict truthy check handles both `undefined` and `null`).
    - This fixes: toggling the TP or SL off in the edit panel and confirming now correctly writes a `'cancelled'` `HistoricalOrder` record, making it appear in **Orders → Cancelled** and **Order History → Cancelled**.
    - Same fix applied to the `editPendingOrder` path for pending orders.
    - Net rule: cancel record is written **only when a leg is explicitly removed** (toggle off → `null`). Editing to a new price is a silent in-place update — no cancel record written.

- **test: Section 2 (Limit Orders) — full manual pass complete (01.05.2026)** ✅
  - All 19 limit-order test cases (2.1–2.5) now marked ✅ in `TRADING_TEST_PLAN.md`.
  - **2.4.6** — Cancel Working TP after fill: TP moved to Cancelled; SL remains Working; Journal logs `Take-Profit cancelled for LONG BTCUSDT @ $X`. ✅
  - **2.4.7** — Cancel Working SL after fill: SL moved to Cancelled; TP remains Working; Journal logs `Stop-Loss cancelled for LONG BTCUSDT @ $X`. ✅
  - **2.4.8** — Filled parent row absent from Orders tab immediately after fill; visible only in Order History → Filled. ✅ (TV cross-check ✅)
  - **2.4.9** — TP triggers: position closed, SL sibling-cancelled in Order History → Cancelled (commission = 0), Journal shows auto-close PnL badge. ✅ (TV cross-check ✅)
  - **2.4.11** — Manual close with both TP + SL active: position closed, **two** sibling cancel rows (TP + SL) appear in Order History → Cancelled; TV Trading Journal confirms matching TP + SL cancel confirmations; Balance History shows correct close entry. ✅ (TV cross-check ✅)
  - **2.5.1** — TP below limit trigger price: inline error `"Take-Profit must be above entry price for Long"` shown; submit blocked. ✅ (TV cross-check ✅)
  - **2.5.2** — SL above limit trigger price: inline error `"Stop-Loss must be below entry price for Long"` shown. ✅ (TV cross-check ✅)
  - **2.5.3** — Symbol switch after placing limit: existing order stays correctly symbol-scoped; multi-symbol positions (BTCUSDT + ETHUSDT) render independently in Positions tab. ✅
  - **2.5.4** — Limit order exceeding balance: `"Insufficient balance"` inline error + red margin-over-balance state. ✅

- **fix: PR code review issues — Bybit params error, TS18048, linting, a11y, UX guards (01.05.2026)** ✅

  ### Bybit `/market/kline` params error (`apps/server/src/routes/market/index.ts`)
  - `BYBIT_INTERVAL_MAP` converted to a `const` object so TypeScript can narrow its value type.
  - `AllowedInterval` = `keyof typeof BYBIT_INTERVAL_MAP`; `ALLOWED_INTERVALS_SET` and `isAllowedInterval()` type-guard derived from the map — single source of truth, no drift between validation and upstream values.
  - **Category fallback retry**: `fetchHistoricalCandles` iterates `['linear', 'spot']`. If Bybit returns `retCode 10001` (`params error`) for `linear` it retries with `category=spot`, logs a warning, and returns the successful result. Any other error or exhausted retries throws as before, resulting in a `502` to the client.
  - `BybitKlineResponse.result` typed as optional to match actual Bybit error payloads.
  - URL built with `URLSearchParams` (safer query construction).
  - Two new tests added to `market.test.ts`: interval mapping + `category=linear` first; fallback to `category=spot` on params error.

  ### TypeScript TS18048 (`apps/client/src/components/dashboard/PendingOrderEditPanel.tsx`)
  - After the existing `if (!order) return ...` guard, a `const activeOrder = order` binding is introduced. All closure-based and derived references (swap-mode handler, qty/margin calculations, desc label) now use `activeOrder` — TypeScript can prove non-null without additional assertions.

  ### ESLint ignore patterns (`eslint.config.js`)
  - Changed bare-string patterns (`'dist'`, `'node_modules'`) to glob patterns (`'**/dist/**'`, `'**/node_modules/**'`) so they match nested paths (e.g. `apps/server/dist/`).
  - Added `'generated/**'` to ignore the workspace-root `generated/CDSDK/` directory.
  - Eliminates all 219 false-positive lint errors in `apps/server/dist/` and the Prisma-generated type declarations.

  ### `PositionEditPanel.tsx` — accessibility, `inputMode`, Confirm guard
  - `Toggle` component: added `label: string` prop wired to `aria-label`; caller passes `"Enable take profit"` / `"Enable stop loss"` so screen readers can distinguish the two switches.
  - TP and SL `<input>` elements: added `inputMode="decimal"` for correct mobile numeric keyboard (was missing unlike other fields in the app).
  - `confirmDisabled` derived value: `true` when `tpWarning || slWarning || (tpEnabled && !tpVal) || (slEnabled && !slVal)`. Confirm button wired to `disabled={confirmDisabled}` — prevents silently removing a leg when the toggle is ON but the input is empty/zero, and blocks submission when a direction warning is active.

  ### `PendingOrderEditPanel.tsx` — accessibility, dynamic labels, Confirm guard
  - `Toggle` component: same `aria-label` fix as `PositionEditPanel`.
  - TP/SL warning messages: replaced hardcoded `"limit price"` with `priceReferenceLabel = activeOrder.type === 'stop' ? 'stop price' : 'limit price'` so stop orders show the correct field name in the error text.
  - `confirmDisabled` guard: covers `insufficientFunds || tpWarning || slWarning || (tpEnabled && !tpVal) || (slEnabled && !slVal)`. Replaces the old `disabled={insufficientFunds}`-only check.

  ### `OrderAccountManagementPanel.tsx` — duplicate pencils, phantom buttons
  - **Duplicate pencil on STOP rows**: `limitPrice` column pencil was rendered for all pending orders (`isPending`). STOP orders have their trigger price in the `stopPrice` column, which already had its own pencil. Fixed: `limitPrice` pencil now only renders when `isPending && type === 'limit'`; `stopPrice` pencil unchanged at `isPending && type === 'stop'`.
  - **Phantom buttons when callbacks undefined**: all `onEditPosition?.(...)` and `onEditPendingOrder?.(...)` optional-chain patterns replaced by explicit `onEditPosition && <button onClick={() => onEditPosition(...)} ...>` guards. Pencil buttons are not rendered at all when the parent has not wired up the edit callbacks — no focusable controls that silently do nothing.

- **docs: test automation tier mapping — full test plan annotated (01.05.2026)** ✅
  - **Decision: three-tier test pyramid adopted for all current and future test plan sections.**
  - **T1 · Vitest** (`paperStore.test.ts` / `layoutStore.test.ts`): pure Zustand store unit tests — Vitest + jsdom, no DOM rendering. Covers all business logic: balance math, order lifecycle, TP/SL triggers, bracket cancellations, cancel records, journal content, sibling-cancel logic, pending order fills, localStorage hydration. Approx. 80% of test cases across Sections 1–4, 7, 10 (store sync), 11.
  - **T2 · RTL** (new file `components/__tests__/*.test.tsx`): component integration tests — Vitest + `@testing-library/react` (already installed as dev dep). Renders components in jsdom and asserts rendered HTML / simulates events. Covers: form validation error messages, toggle label changes, badge counts, sub-tab filtering, modal open/close, button disabled states, column picker localStorage pref. Uses `vi.useFakeTimers()` for the 3 s reset-confirm auto-cancel (Section 8.7).
  - **T3 · Playwright** (install with `pnpm dlx create-playwright` scoped to `apps/client` when Section 5+ is ready): real Chromium against the running dev server. Covers: live WebSocket price feed (Sections 6, 9.1–9.4, 9.6–9.8), network offline states (1.7.8, 9.6), CSS animations / maximize-restore (4.12–4.13), Web Audio API sounds (4.14–4.16), visual regression for icon sizes and pixel layout (Section 5), chart crosshair / time-range sync (10.4.4–10.4.7), PaneHeader live price (10.5.1–10.5.2), browser tab title (6.9).
  - **Workflow** (repeating after each manually-passed section): map each test case to T1/T2/T3; write all T1 cases as new `describe('Section N ...')` blocks in `paperStore.test.ts`; write T2 cases in `components/__tests__/TradingPanel.test.tsx` or `OrderAccountManagementPanel.test.tsx`; mark T3 as `// TODO: Playwright` until the framework is set up; run `pnpm test` — all tests must be green before moving to the next section.
  - **Test plan updated**: `Tier` column added to every table across all 11 sections + tier legend added to file header. Also corrected stale 7.2.3 wording to reflect current behavior: filled rows are visible in **Orders → Filled** and **Order History → Filled** while the top Orders badge remains active-only.
  - **Files changed**: `docs/TRADING_TEST_PLAN.md`, `docs/APP_LOG.md`

- **test: T1 (Vitest) + T2 (RTL) automated tests for Sections 1 & 2 — 277 tests green (01.05.2026)** ✅
  - **Scope**: Sections 1 (Market Orders) and 2 (Limit Orders) of `TRADING_TEST_PLAN.md` — all T1 and T2 cases automated; T3 cases remain as `// TODO: Playwright`.
  - **`paperStore.test.ts`** extended with two new `describe` blocks totalling ~40 new T1 unit tests:
    - Section 1: journal entry format, SHORT sell, qty calculation, TP-only / SL-only auto-close, both-legs manual close
    - Section 2: `placeLimitOrder` balance reservation, fill sequence, cancel refund, sell-limit SHORT, full bracket lifecycle (pre-fill leg cancels, parent cancel, post-fill activation, TP/SL auto-close, manual close with 2 sibling cancels), symbol-scope isolation
  - **`TradingPanel.test.tsx`** (new file) with ~20 T2 RTL component tests:
    - Section 1: Margin/Commission preview, Buy clears input, Sell side, Units toggle, TP/SL toggle reveals bordered input, button disabled when qty empty, Insufficient balance error, all four TP/SL directional validation errors, qty=0 keeps button disabled
    - Section 2: Limit tab shows pre-filled price, TP below/above trigger validation, limit > balance error
  - **All 277 tests pass** (188 client + 89 server); lint clean after removing unused helpers.
  - **Behaviour clarification captured**: 1.7.1 — the app disables the submit button when qty is empty (no inline error text); test plan Notes updated to reflect this.
  - **Files changed**: `apps/client/src/store/__tests__/paperStore.test.ts`, `apps/client/src/components/dashboard/__tests__/TradingPanel.test.tsx`, `docs/TRADING_TEST_PLAN.md`, `docs/APP_LOG.md`

- **feat: TradingView-style journal detail for edited parent/child orders (01.05.2026)** ✅
  - **`paperStore.ts`** — replaced the single generic edit journal line with **delta-aware multi-entry logs** for both `updatePositionExits()` and `editPendingOrder()`.
  - **Open position exit edits** now produce:
    - a summary entry describing exactly what changed, e.g. `Modified LONG BTCUSDT exits — TP $55,000.00 → $56,000.00, SL $48,000.00 → $47,000.00`
    - per-leg confirmation entries for changed children, e.g. `Take-Profit modification confirmed — LONG BTCUSDT @ $56,000.00`
    - cancel-style entries when a leg is removed, e.g. `Stop-Loss cancelled for LONG BTCUSDT @ $47,000.00`
  - **Pending parent-order edits** now produce the same richer structure:
    - parent summary includes **price / qty / reserved margin / TP / SL** deltas
    - child TP/SL legs get their own **added / modification confirmed / cancelled** entries when changed
    - if the edit is a true no-op (no numeric changes), no extra journal noise is written
  - **Helper functions** added in `paperStore.ts`:
    - optional-number equality guards to avoid floating-point noise
    - shared formatters for pending side/type labels and exit labels
    - small journal builders for position-exit edits and pending-order edits
  - **Tests** — `paperStore.test.ts` now covers:
    - editing TP/SL on an open position
    - removing a TP child from an open position
    - editing a pending order's parent + child exits together
    - removing a pending TP child
    - confirming that no-op pending edits do **not** add journal noise

- **feat: Orders Filled sub-tab parity + active Orders badge count (01.05.2026)** ✅
  - **`OrderAccountManagementPanel.tsx`**
    - Added `filled` back to `OrderSubTab` so filled historical rows are visible in **Orders → Filled** (while still present in **Order History**).
    - Updated Orders data composition to include all historical statuses (`filled` / `cancelled` / `rejected`) together with pending + synthetic exit rows.
    - Added `activeOrdersBadgeCount` for the top Orders tab badge so it counts **active rows only** (`pending` + `exit-order`), excluding historical rows.
  - **Behavior parity verified**
    - Post-fill bracket state now mirrors TV expectation shown in screenshots: parent is historical filled, only TP/SL children remain active, and top badge shows **Orders 2** (not 3).
  - **Tests**
    - Added `apps/client/src/components/dashboard/__tests__/OrderAccountManagementPanel.test.tsx` with RTL coverage for:
      - Orders sub-tab counts including `Filled`
      - filled row visibility in both Orders and Order History
      - top Orders badge staying at `2` when parent is filled and only TP/SL children remain active
    - Local run: `pnpm --filter client test -- OrderAccountManagementPanel.test.tsx` passed.
  - **Docs**
    - Updated `docs/TRADING_TEST_PLAN.md` Section 3 manual status and marked **3.4.1 / 3.4.2** as ✅ with screenshot-backed notes.

- **docs: consistency sweep — APP_LOG + TRADING_TEST_PLAN alignment (01.05.2026)** ✅
  - **APP_LOG.md — Design Agreements corrected to match current code:**
    - `OrderAccountManagementPanel` tab count corrected from **4** to **5** (Positions · Orders · Order History · Balance History · Trading Journal).
    - Tab #4 renamed from `History (ClosedTrade)` to **Balance History** (`BalanceEvent[]`). The ClosedTrade `history` array exists in `paperStore` state but has no dedicated UI tab; the Balance History tab (`balancehistory`) shows `balanceLog` events (Time · Balance Before · Balance After · Realized P&L · Action).
    - Orders sub-tabs updated to `All | Working | Inactive | Filled | Cancelled | Rejected` — `Filled` was restored in the 01.05.2026 Orders parity feature, but the design section still listed the old 25.04.2026 set.
    - Removed the stale "**`Filled` sub-tab has been removed**" and "**excluded from the Orders tab entirely**" bullet (superseded by the Orders Filled sub-tab parity entry).
    - Added **Top Orders badge** clarification: counts active rows only (`pending` + `exit-order`); historical filled/cancelled/rejected rows do not inflate the headline count.
    - Fixed the **fix: Orders tab — TV-style immediate archive (25.04.2026)** history entry to accurately describe the intermediate state and note the subsequent revert.
    - Tab badge counts line updated to replace "working only" with "active rows only (pending + exit-order)".
  - **TRADING_TEST_PLAN.md — test cases updated:**
    - **7.1.4** — expected result and notes updated: Orders tab **does** have a `Filled` sub-tab; market fill appears in Orders → Filled + Order History → Filled; Orders top badge = 0.
    - **7.2.3** — heading and expected result updated: verify filled limit row appears in both Orders → Filled and Order History → Filled; Orders badge = 0 after fill.
  - **Total tests: 280 green** (191 client · 89 server — incremented from 277 by the 3 OrderAccountManagementPanel RTL tests).

- **fix: review follow-ups — shared UI typing + SymbolBar trade toggle semantics (01.05.2026)** ✅
  - `WarningText.tsx`, `NumericInput.tsx`, `FieldLabel.tsx`, and `SoundSettings.tsx` now use explicit `import type` React types instead of `React.*` namespace references, avoiding TS namespace errors under the automatic JSX runtime.
  - `FieldLabel.tsx` now renders dedicated `label` / `p` / `span` branches so `htmlFor` is only ever passed to a real `<label>` element.
  - `SymbolBar.tsx` — the **Trade** pill now uses native `disabled` semantics when the trading panel is already open, instead of remaining a focusable clickable no-op. Result: cleaner keyboard/screen-reader behavior and clearer reopen semantics.
  - Added `apps/client/src/components/dashboard/__tests__/SymbolBar.test.tsx` (2 RTL tests):
    - Trade button is disabled (and does not call `onToggleTrading`) when the panel is already open.
    - Trade button is enabled and calls `onToggleTrading` when the panel is closed.
  - Local verification run after these fixes:
    - `pnpm --filter client build` ✅
    - `pnpm --filter client test --run` ✅ (**266/266 client tests green**)

---

### test: automate Section 3 stop-order tests — T1 + T2 (01.05.2026)

**Context:** All Section 3 stop-order test cases were previously manually verified. This session writes the T1 + T2 automation layer, bringing the full test suite to **211 client tests (all green)**.

**New tests added:**

#### `paperStore.test.ts` — `Section 3 — Stop Orders` describe block (15 T1 tests)

| Group                            | Tests | What they cover                                                                                                                                                                                                                                |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Stop Buy placement and fill  | 4     | `placeStopOrder` creates correct pending order + debits balance; fill flow → Long position + empty pendingOrders + journal entry; Order History entry has `status=filled`, `type=market`, `commission>0`; slippage fill at price above trigger |
| 3.2 Stop Sell placement and fill | 3     | Pending stop sell (`side=sell`, `type=stop`, correct `triggerPrice`); fill opens Short; journal "Stop order filled — Short…"; slippage fill at price below trigger                                                                             |
| 3.3 Cancel stop order            | 2     | `cancelPendingOrder` fully refunds balance, clears `pendingOrders`, journal "Cancelled STOP…"; cancelled order entry has `stopPrice` preserved + timestamps                                                                                    |
| 3.4 Stop with TP+SL bracket      | 4     | `pendingOrder.takeProfit`/`.stopLoss` stored; fill → position has both + pendingOrders empty; activation journal entries written; cancel bracket → 3 Cancelled rows + full balance refund                                                      |
| 3.5 Multiple stops coexist       | 2     | 4 concurrent `placeStopOrder` calls → all 4 in `pendingOrders`, balance = `10000 − 4×(margin+commission)`, 4 "Placed STOP…" journal entries; insufficient-balance guard returns `null` without adding to `pendingOrders`                       |

**Helper:** `fillStop(orderId, fillPrice)` extracted inside the describe block — mirrors `usePendingOrderMonitor` fill sequence (`fillPendingOrder` → `placeOrder(skipJournal=true)` → `addJournalNote` + TP/SL activation entries).

#### `TradingPanel.test.tsx` — `Section 3 — Stop Orders (T2 · RTL)` describe block (5 T2 tests)

| Test                        | What it covers                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 3.5.1 warning               | Switch to Stop tab, Buy side, type price below market → amber banner contains "will fill immediately" + "Use a Limit Buy" |
| 3.5.2 warning               | Switch to Stop tab, Sell side, type price above market → banner contains "will fill immediately" + "Use a Limit Sell"     |
| 3.5.1 no-warning            | Stop Buy above market (correct direction) → `queryByText(/will fill immediately/)` returns null                           |
| 3.5.2 no-warning            | Stop Sell below market (correct direction) → no warning banner                                                            |
| Insufficient balance (stop) | Enter 20000 USD on Stop tab → "Insufficient balance" validation error                                                     |

**TRADING_TEST_PLAN.md updated:** Section 3 preamble note changed from "automation not yet written" to automation status summary with file names and test counts.

**Total client tests: 211 green** (up from 196 before this session).

---

### feat: preserve all form state (amount, price, TP/SL) across TradingPanel close/reopen (01.05.2026)

**Context:** Closing the TradingPanel (✕) then reopening it caused all form inputs — amount, price, TP, SL and their toggles — to reset, forcing the user to re-enter their order setup. Tab and side were already preserved (lifted state), but the form fields lived in local component state and were lost on unmount.

**Root cause:** `TradingPanel` was rendered inside `AnimatePresence` and fully unmounted when `tradingPanelOpen` became `false`. Every reopen was a fresh mount with empty initial state.

**Fix (`DashboardPage.tsx`):**

- Removed `TradingPanel` from the `AnimatePresence`/conditional-render block
- `TradingPanel` is now **always mounted** (when `!editTarget`) in a standalone `motion.div`
- The wrapper animates `width` and `opacity` between `256/1` (open) and `0/0` (closed) — identical visual transition, no unmount
- Edit panels (PositionEditPanel / PendingOrderEditPanel) remain in their own separate `AnimatePresence` block, unchanged
- The `key={`${activePane}-${symbol}`}` prop on `TradingPanel` itself is untouched — a symbol or pane switch still triggers React to unmount + remount, resetting all form inputs as intended

**What is preserved across close/reopen (same symbol):**

- Amount / qty and qty mode (USD vs units)
- Price input (Limit/Stop orders)
- TP and SL values + their enabled/disabled toggle state
- Tab (Market / Limit / Stop) and Side (Buy / Sell)

**What still resets on symbol change:** Everything (key remount).

**TRADING_TEST_PLAN.md:** 4.4 expected result updated — "form inputs (qty/price/TP/SL) are empty" corrected to "all form inputs preserved exactly as left".

**Tests: 211/211 green** (no new tests written — behaviour is a mount/unmount architectural change; existing T2 tests verify the rendered state).

**Note:** Side persistence (`initialSide`/`onSideChange`) landed in the same 01.05.2026 pass. Combined with the always-mounted TradingPanel wrapper, close/reopen now preserves tab + side + form inputs; symbol change still resets via `key={`${activePane}-${symbol}`}`.

---

### fix: PR code review issues — TradingPanel isVisible selector gating removed (02.05.2026) ✅

**Issue 1 — `OrderAccountManagementPanel.tsx` JSDoc comment:** The JSDoc block above the `fmtMktPrice` usage was already correctly worded — no code change needed (confirmed correct in consistency sweep).

**Issue 2 — `TradingPanel.tsx` `isVisible` selector gating:**

- **Root cause**: the `isVisible` prop (passed from `DashboardPage`) was used to gate four pane-store selectors, returning `null`/`false` when the panel was hidden. Because the parent `motion.div` animates `width`/`opacity` over ~0.2 s, flipping `isVisible` to `false` at the moment of close caused `latestPrice`, `isConnected`, `bid`, and `ask` to blank out mid-animation — visually resetting prices and spread in the fade-out.
- **Fix**:
  - Removed `useRef` import (was only used for the `lastVisibleMarketRef` cache).
  - Replaced the four gated `useStore` calls + the `lastVisibleMarketRef` cache pattern with four simple, unconditional `useStore` calls (`latestPrice`, `isConnected`, `bid`, `ask`). The panel is always mounted (never unmounted on close), so there is no reason to gate subscriptions.
  - Removed the `isVisible` prop entirely from `TradingPanelProps` and the component destructuring — it served no purpose beyond the now-deleted selector gating.
- **`DashboardPage.tsx`**: removed the `isVisible={isTradingPanelVisible}` prop from the `<TradingPanel>` call site. `isTradingPanelVisible` is still used for the wrapper `motion.div` animation and the `inert`/`aria-hidden` attributes.
- **Result**: prices, spread badge, and order-info fields remain stable throughout the entire open/close animation.
- **Tests**: 266/266 client tests green; `pnpm --filter client build` ✅.

---

### docs: consistency sweep — panel rename + stale info (02.05.2026) ✅

- **Panel header label updated throughout**: `OrderAccountManagementPanel` UI label corrected from `"Paper Trading"` to `"Order & Account Management"` in all APP_LOG design-agreement sections. Note added: component file/code references remain `OrderAccountManagementPanel.tsx` / `OrderAccountManagementPanel`.
- **Account Settings modal**: leverage field updated from `"Display only"` to **interactive 12-button selector** (1x–125x, Bybit style); amber badge shows current multiplier; high-leverage warning (>25x); **"Save" button is now functional** (commits `draftLeverage` to `paperStore.leverage`). Commission: read-only display only.
- **Key Files table**: `OrderAccountManagementPanel.tsx` description updated to reflect the renamed panel label and full tab list.
- **ASCII layout diagram**: updated to show `Order & Account Management (OrderAccountManagementPanel)`.
- **marketStore bid/ask section note**: updated — `TradingPanel.tsx` now reads `bid`/`ask` unconditionally (no `isVisible` gating; 2 `useStore` calls, not 8).

---

### fix: wrong-symbol SL closure prevention — 4.18 incident safety hardening (02.05.2026) ✅

**Incident summary (4.18):**
During testing, a BTC LONG position with a manually typed SL of `7800` (intended `78000`) was incorrectly auto-closed. Root cause was two bugs compounding:

1. **Symbol-switch bug** — `useTPSLMonitor` subscribed only to `paneStores[0]`. After switching pane 0 to ETHUSDT, BTC positions were evaluated against the ETH price feed instead of a BTC feed. An ETH price near `7500` satisfied the typo SL of `7800` and triggered a spurious close.
2. **Typo guard absent** — there was no input-level check to block or warn when an SL/TP value was an order of magnitude away from the live price.

**Fix 1 — `useTPSLMonitor.ts` (per-symbol feeds):**

- Refactored from a single `paneStores[0]` subscription to **4 independent subscriptions** — one per pane store.
- Each subscription reads `layoutStore.panes[i].symbol` and filters positions by that symbol only.
- Extracted `evaluatePanePositions(paneIndex, latestPrice, bars, onClosed?)` as an **exported** pure helper for direct unit testing without mounting the hook.
- `paneStores.map((store, i) => store.subscribe(...))` returns 4 unsubscribers, all cleaned up on unmount.

**Fix 2 — `sltpSanity.ts` (new file — pure helper):**

- `src/lib/sltpSanity.ts` — exports `computeSLTPWarnings(value, execPrice, livePrice, field)`.
- **Typo guard**: flags when `|value − livePrice| / livePrice > TYPO_DEVIATION_THRESHOLD` (default `0.8` = 80%).
- **Large-distance guard**: flags when `|execPrice − value| / execPrice > SL_MAX_DISTANCE` (default `0.1` = 10%, SL only).
- Returns `{ typoWarning: string | null, largeDistanceWarning: string | null }`.
- Guard for `livePrice ≤ 0`, `execPrice ≤ 0`, `NaN` and non-finite inputs — returns both null.

**Fix 3 — `TradingPanel.tsx` (blocking confirm modal — Option B):**

- Added import: `computeSLTPWarnings` from `@/lib/sltpSanity`.
- Added state: `slConfirmPending` / `slConfirmBypassed`.
- Added derived block: `slSanity`, `tpSanity`, `hasSanityWarning` (computed after `formatPnl`, before handlers).
- `handleExecute` now gates on `hasSanityWarning && !slConfirmBypassed` — sets `slConfirmPending = true` and returns early on first click.
- Confirm modal (`data-testid="sl-confirm-modal"`) renders inside `AnimatePresence` below the immediate-fill warning. Shows `typoWarning` and/or `largeDistanceWarning` text. "Confirm SL/TP anyway" button (`data-testid="sl-confirm-anyway"`) sets `slConfirmBypassed = true` and re-runs execute inline.
- "Cancel" button sets `slConfirmPending = false` and `slConfirmBypassed = false` — resubmitting shows the modal again.
- `handleSideChange` and `handleTabChange` reset both confirm state flags.

**New files:**

- `src/lib/sltpSanity.ts` — pure sanity helper (102 lines)
- `src/lib/__tests__/sltpSanity.test.ts` — 21 unit tests, all green

**Modified files:**

- `src/hooks/useTPSLMonitor.ts` — full rewrite, per-symbol multi-pane subscriptions, `evaluatePanePositions` exported
- `src/hooks/__tests__/useTPSLMonitor.test.ts` — extended with multi-pane isolation + 4.18 regression blocks (7 new tests)
- `src/components/dashboard/TradingPanel.tsx` — SL/TP sanity gate + confirm modal added
- `src/components/dashboard/__tests__/TradingPanel.test.tsx` — Section 1.7.11 block (7 new tests)

**Tests: 317/317 green** (`pnpm --filter client test --run`).

**TRADING_TEST_PLAN.md:** 1.7.11, 1.7.12, 4.19, 4.20 added.

---

### refactor: rename slSanity → sltpSanity for clarity (02.05.2026) ✅

The helper and test file introduced in the 4.18 safety-hardening fix were renamed to better reflect their scope — the module guards **both** SL and TP inputs, not just SL.

**Renamed files:**

- `src/lib/slSanity.ts` → `src/lib/sltpSanity.ts`
- `src/lib/__tests__/slSanity.test.ts` → `src/lib/__tests__/sltpSanity.test.ts`

**Updated references:**

- `src/components/dashboard/TradingPanel.tsx`: import path updated to `@/lib/sltpSanity`; no logic changes.
- `sltpSanity.test.ts`: describe-block title updated from `slSanity unit tests` to `sltpSanity unit tests`.

**Tests: 317/317 green** (`pnpm --filter client test --run`); lint clean.

---

### test: automate Section 5.6 — unknown symbol fallback for CryptoIcon + SymbolPair (02.05.2026) ✅

**Context:** Test plan case 5.6 was ⬜ — the expected outcome also contained a stale claim ("USDT shows text badge 'US'") because USDT was added to `CRYPTO_ICON_URLS` after the row was written.

**Changes:**

- **`CryptoIcon.test.tsx`**: added USDT `?url` mock (was missing — needed for `SymbolPair` tests that render `<SymbolPair base="BTC" quote="USDT">`). Added `SymbolPair` to the import. Added a new `SymbolPair — unknown symbol fallback (5.6)` describe block with 7 tests:
  - Both base and quote unknown → no `<img>` rendered
  - Both unknown → 'FO' and 'NE' text badges both present
  - Unknown base (lowercase) → uppercased to 'FO'
  - Unknown quote (lowercase) → uppercased to 'NE'
  - Known base + unknown quote → 1 `<img>` (BTC) + 1 text badge ('NE')
  - 1-letter symbol → doesn't crash, renders single-char badge
  - USDT renders as `<img>` (real icon in map, not a text badge) — corrects the stale plan note

**TRADING_TEST_PLAN.md:**

- 5.6 expected outcome corrected (removed stale "USDT shows text badge 'US'" claim; noted USDT has a real icon).
- 5.6 status updated to ✅ with result note pointing to both existing `CryptoIcon.test.tsx > unknown symbol` coverage and the new `SymbolPair` describe block.
- Preamble updated: "5.1–5.6 manually verified — all ✅. 5.7 still pending."

**Tests: 324/324 green** (`pnpm --filter client test --run`).

---

### test: automate Section 5 symbol pair icons — 5.1–5.5 + 5.7 (T2 · RTL) (02.05.2026) ✅

**Context:** Sections 5.1–5.5 and 5.7 were marked T3 · Playwright (pixel-level) with no automated structural coverage. Now supplemented by T2 · RTL tests that verify the correct `base`/`quote` props are passed to `SymbolPair` across all rendering contexts.

**New file:** `src/components/dashboard/__tests__/Section5SymbolPairIcons.test.tsx` (16 tests)

**Mock strategy:** `@/components/ui/CryptoIcon` is mocked entirely — `SymbolPair` renders as `<span data-testid="symbol-pair" data-base={base} data-quote={quote} />`. This avoids framer-motion/SVG complexity in jsdom while still asserting the correct structural prop values.

**Key fix during implementation:** 5.2 initial test set `paneStores[0].setState({ symbol: 'ETHUSDT' })` but `SymbolBar` reads symbol from `layoutStore.panes[activePane].symbol`, not paneStore. Fixed by using `useLayoutStore.setState((s) => ({ panes: s.panes.map((p, i) => i === 0 ? { ...p, symbol: 'ETHUSDT' } : p) }))`.

**Coverage by sub-section:**

- **5.1** — SymbolBar trigger renders `SymbolPair`, dropdown has one row per `SYMBOLS` entry, all use `quote="USDT"` (3 tests)
- **5.2** — trigger shows `base="BTC"` for BTCUSDT; shows `base="ETH"` after `layoutStore` symbol change (2 tests)
- **5.3** — Positions tab: BTC position shows `base="BTC"` + `quote="USDT"`, empty state doesn't crash (3 tests)
- **5.4** — Orders tab: pending order row shows `base="BTC"` + `quote="USDT"` (2 tests)
- **5.5** — Order History tab: filled order shows `SymbolPair`, `quote="USDT"`, cancelled row also renders it (3 tests)
- **5.7** — BTC + ETH both present in Positions, BTC still shows `base="BTC"` when active pane is ETH, exactly 2 `SymbolPair`s for 2 positions (3 tests)

**TRADING_TEST_PLAN.md + APP_LOG.md:** Section 5 preamble updated to "5.1–5.7 manually verified — all ✅". Rows 5.1–5.7 note T2 · RTL structural coverage via `Section5SymbolPairIcons.test.tsx`.

**Tests: 340/340 green** (`pnpm --filter client test --run`).

---

### feat: TV-style Orders bench lifecycle — session-scoped TTL cleanup (02.05.2026) ✅

**Context:** The Orders tab was showing all historical `filled`/`cancelled`/`rejected` records indefinitely — identical to Order History. TradingView treats Orders as a temporary working bench: terminal rows appear briefly after the event, then auto-evict. On page refresh the bench resets entirely.

**Behaviour implemented (mirrors TV):**

- **Working / Inactive** rows: always on the bench, never auto-expire.
- **Filled / Cancelled / Rejected** rows: appear in Orders immediately after the event; auto-evict after **120 seconds (2 minutes)** measured from the row's `closingTime`.
- **Page refresh**: bench resets entirely — terminal rows are gone from Orders but permanently visible in Order History.
- **All sub-tab in Orders**: live reflection of the current bench (working + inactive + any terminal rows still within TTL). Count drops as rows expire.
- **Main Orders badge** (tab bar): counts working + inactive only — never includes terminal bench rows.
- **Order History tab**: completely unchanged — always shows the full persistent `orders` array.

**Changes — `OrderAccountManagementPanel.tsx` only. Zero store changes.**

- Added module-level constants: `SESSION_START = Date.now()` (session anchor; resets on every page load — gives the refresh-clean behaviour for free) and `BENCH_TTL_MS = 120_000`.
- Added `now` clock state + 30-second `setInterval` inside the component to drive reactive expiry mid-session.
- Added `isBenchHistoricalOrder(o: HistoricalOrder): boolean` helper: `o.closingTime >= SESSION_START && o.closingTime + BENCH_TTL_MS > now`.
- `allOrderDisplayRows`: historical rows pre-filtered through `isBenchHistoricalOrder` — terminal rows outside the TTL window are simply not in the bench array, so all sub-tab counts are automatically correct.
- `activeOrdersBadgeCount` on the main tab bar: unchanged — already counted only `pending` + `exit-order` kinds (working + inactive).
- **Visual treatment for bench terminal rows**: row rendered at `opacity-60` + small amber `Clock` icon alongside the status pill — signals "this row is temporary and will clear shortly".

---

### `fix: persist bottom-panel drag height across page refresh (02.05.2026)` ✅

**Problem:** The drag-to-resize handle position reset to the default 208 px height on every page refresh because `panelHeightPx` was plain `useState(PANEL_HEIGHTS.open)` — never written to storage.

**Solution:** Piggybacked on the existing `cd-layout` localStorage key (Zustand `layoutStore` with `persist` middleware — same store that already holds pane sizes).

**Changes:**

- **`layoutStore.ts`**
  - Added `bottomPanelHeight: number` field (default `208`) to `LayoutState`.
  - Added `setBottomPanelHeight(height: number)` action.
  - Added merge guard in `persist.merge`: if `bottomPanelHeight` is missing or `< 80` (old `cd-layout` payload without this field), it falls back to `208` — safe zero-migration hydration.

- **`DashboardPage.tsx`**
  - Added `const setBottomPanelHeight = useLayoutStore((s) => s.setBottomPanelHeight)`.
  - `panelHeightPx` `useState` initializer changed from `PANEL_HEIGHTS.open` to `() => useLayoutStore.getState().bottomPanelHeight` — reads the persisted value once at mount.
  - `panelHeightMV` `useMotionValue` seed changed from `PANEL_HEIGHTS.open` to `useLayoutStore.getState().bottomPanelHeight` — panel opens at its last-used height immediately, before any spring animation fires.
  - `handlePanelHandlePointerUp`: extracts committed height into `const committed = Math.round(panelHeightMV.get())`, passes it to both `setPanelHeightPx(committed)` and `setBottomPanelHeight(committed)`.

**Result:** Drag the handle, refresh — panel reopens at exactly where it was left. 340/340 tests green (no test changes needed — no new user-visible branch, store change is additive).

---

### docs: TRADING_TEST_PLAN SELL/BUY terminology alignment (03.05.2026) ✅

- Updated `docs/TRADING_TEST_PLAN.md` wording to prioritize **user-facing** labels (`Sell` / `Buy`, `TV SELL` / `TV BUY`) in test execution steps and expectations.
- Kept technical `bid`/`ask` terms only where they are explicitly helpful (quote mapping notes and spread tooltip context), so testers can match on-screen labels without losing precision.
- Key sections aligned:
  - **Dual-platform setup** + **Setup checklist** tolerance/parity language
  - **Section 6** price-parity wording (`Sell/Buy` vs TradingView `SELL/BUY` at same timestamp)
  - **Section 9** renamed to `Sell/Buy Prices & Spread in TradingPanel` with row wording updated to on-screen labels
  - Minor consistency updates in regression notes where wording previously led with `bid/ask`
- Scope: **documentation only** (no runtime logic change, no API/store changes, no behavior change).

---

### feat: cap leverage at 10× for learning-app safety (04.05.2026) ✅

- **`paperStore.ts`**
  - Added `export const MAX_LEVERAGE = 10` constant.
  - `CRYPTO_LEVERAGE_OPTIONS` trimmed from `[1,2,3,5,10,15,20,25,50,75,100,125]` → `[1,2,3,5,10]`; `CryptoLeverage` union type updated automatically.
  - Persist version bumped `1` → `2`; new `v1 → v2` migration clamps any stored `leverage > 10` to `Math.min(leverage, MAX_LEVERAGE)` on hydration — old snapshots with high leverage are silently corrected without data loss.
- **`OrderAccountManagementPanel.tsx`**
  - Button grid changed from 12-button `grid-cols-6` to 5-button `grid-cols-5`.
  - Removed the `draftLeverage > 25` high-leverage warning block (unreachable with the new cap).
- **`docs/TRADING_TEST_PLAN.md`** — row 8.3 updated to describe the 5-button selector with max 10×; row 8.5 rewritten to test leverage button selection (old "Save disabled" assertion no longer applies).
- **`docs/APP_LOG.md`** — Design Agreements updated to reflect the 5-button selector and 10× cap.

---

### fix: code-review hardening — leverage validation & test-plan corrections (04.05.2026) ✅

Four issues surfaced in a Copilot PR review and are now resolved.

#### `apps/client/src/store/paperStore.ts`

- **`CRYPTO_LEVERAGE_OPTIONS` single source of truth** — last element changed from the hardcoded literal `10` to `MAX_LEVERAGE`. If `MAX_LEVERAGE` is ever updated the options array updates automatically, eliminating the risk of the cap and the selector drifting apart.
- **`setLeverage` runtime cap** — `setLeverage: (v) => set({ leverage: v })` replaced with a guarded version that clamps the incoming value to `[1, MAX_LEVERAGE]` and rejects non-finite inputs (`NaN`, `Infinity`, negative). The cap can no longer be bypassed via direct store calls at runtime.
- **v1→v2 migration defensive validation** — the previous migration used `...p` spread, which silently preserved any corrupted field from the stored snapshot (e.g. `balance: -Infinity`, `positions: "broken"`). Replaced with the same field-by-field defensive validation pattern already used in the v0→v1 path:
  - `balance` — validated `>= 0` finite number; falls back to `STARTING_BALANCE`.
  - `positions` / `history` — filtered through `isPositionSnapshot` / `isClosedTradeSnapshot` guards.
  - `pendingOrders` / `orders` / `balanceLog` / `journal` — Array check; falls back to `[]`.
  - `realizedPnl` — `Number.isFinite` guard; falls back to `0`.
  - `leverage` — `Number.isFinite && >= 1` guard + `Math.min(round(v), MAX_LEVERAGE)` clamp; falls back to `1`. Prevents 0, negative, NaN, and Infinity from corrupted snapshots reaching qty calculations.

#### `docs/TRADING_TEST_PLAN.md`

- **Section 2.1 table malformed** — a stray `1.1.2` row from Section 1.1 had leaked into the Section 2.1 table as its header row, making the separator row (`| ----- | ...`) be treated as the first data row. Removed the stray row and added the correct `| # | Action | Expected | Status | TV ✓ | Tier | Notes |` header.
- **Section 2.1.5 tolerance `$1` → `$5`** — the "Within $1" claim in the Notes column and the `TV cross-check 2.1.5` callout were internally inconsistent with the example values shown ($77,673.8 vs $77,677.4 ≈ $3.6 apart). Updated to `Within $5` / `within $5` to match the observed data.

---

## 🔭 Future Release Ideas

### idea: ATM-style bracket strategies (Pro tier) — research (04.05.2026) ⬜

> **Status: research only — no implementation planned yet. Revisit when subscription tiers are defined.**

#### Background

NinjaTrader's ATM (Advanced Trade Management) is a bracket-template system. Before entry the user selects a named strategy; the moment the fill happens, the full exit plan (multiple profit targets + stop management) fires automatically.

#### What CryptoDash currently has vs. ATM

| Feature                             | CryptoDash now                                 |
| ----------------------------------- | ---------------------------------------------- |
| Single TP per position              | ✅ `position.takeProfit`                       |
| Single SL per position              | ✅ `position.stopLoss`                         |
| OCO sibling-cancel when TP/SL hits  | ✅ `closePosition` + `siblingCancelOrders`     |
| Full 100% close when TP/SL triggers | ✅ `useTPSLMonitor`                            |
| Partial close (netting path)        | ✅ exists when user places opposite-side order |
| Multiple profit targets             | ❌ `Position` holds only one `takeProfit`      |
| Trailing stop                       | ❌ not supported                               |
| Auto Break-Even (ABE)               | ❌ not supported                               |
| Named strategy templates            | ❌ not supported                               |
| Scale-out by qty per target         | ❌ not supported                               |

#### Proposed scoped version for a future Pro tier

1. **Multiple profit targets (up to 3)** — replace `takeProfit?: number` on `Position` with `targets: { price: number; pct: number }[]`; `useTPSLMonitor` evaluates each target independently and calls a partial close for each hit.
2. **Auto Break-Even (ABE)** — simple toggle on `Position`: after TP1 fires, stop auto-moves to `entryPrice + offset` (one-shot, then removes itself). Teaches the "risk-free trade" concept visually.
3. **Named strategy templates** — a separate `strategyTemplatesStore` (Zustand + persist, key `cd-strategy-templates`); does NOT reset when the paper account resets. Stores named sets of targets + SL + ABE toggle. Template selector dropdown in `TradingPanel` pre-fills the exit section.

#### Explicitly out of scope (defer or skip)

- Trailing stop — complex monitor math, defer to a later iteration.
- NinjaTrader tick/contract quantity model — not applicable; CryptoDash is USDT-denominated.
- ATM strategy nesting / parent-child inheritance — too complex for a learning-app context.

#### Open questions before planning

1. **Tier model** — Free / Pro / Pro+? Does this feature define the first paid tier?
2. **Max targets** — 3 enough, or N?
3. **Trailing stop** — same tier as ABE, or later?

---

### idea: real Bybit account integration (live trading milestone) — research (04.05.2026) ⬜

> **Status: research only — no implementation planned yet. Prerequisite: subscription/tier model must be in place first.**

#### What this milestone is

Allow users to connect their own Bybit API key and place **real orders with real money** directly from CryptoDash, using the same TradingPanel UI they already know from paper trading.

#### Required features (all must ship together as an atomic milestone)

| Feature                                             | Notes                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API key management**                              | Encrypted storage server-side (never in `localStorage`); user can add/revoke keys; scoped to `order` + `position` permissions only — no withdrawal permission ever requested |
| **Bybit REST API — place / cancel real orders**     | `POST /v5/order/create`, `POST /v5/order/cancel`; map to existing `placeOrder` / `cancelPendingOrder` abstractions                                                           |
| **Bybit WebSocket — live position & order updates** | `private` channel: `order`, `position`, `execution`; replaces `paperStore` state for live mode                                                                               |
| **Separate live-mode state**                        | A new `liveStore` (or adapter layer) isolated from `paperStore` — paper and live accounts must never mix                                                                     |
| **Real balance feed**                               | Bybit `wallet` WebSocket channel; replaces the paper `$10,000` starting balance                                                                                              |
| **Real commission tiers**                           | Maker/taker rates from user's Bybit VIP level, not the fixed `0.07%` paper rate                                                                                              |
| **Order book (depth ladder)**                       | See section below — becomes essential for real trading; tied to this milestone                                                                                               |
| **Risk warnings & real-money disclaimers**          | Legal requirement before any real order can be placed; modal confirmation on first live order                                                                                |
| **"Live mode" indicator**                           | Persistent badge in the UI so the user always knows they are in live mode, not paper mode                                                                                    |

#### Order book — dependency of this milestone

The order book is **not needed for paper trading** (fills are instant, no real liquidity), but becomes **essential for live trading**:

- **Slippage visibility** — market orders fill through multiple price levels; depth shows the effective fill price before submission.
- **Limit order placement** — users need to see stacked bids/asks to decide where to place TP/SL levels intelligently.
- **Spread at size** — the current SELL/BUY widget shows top-of-book only; real orders larger than the top-of-book quantity face a wider effective spread.
- **Stop-hunt zones** — thin areas in the book show where price is likely to spike and reverse; core educational value for real trading.

**Implementation notes when the time comes:**

- Bybit WebSocket topic: `orderbook.50.{symbol}` (50 levels) — sufficient for display; `orderbook.200` for deeper analysis.
- Render as a depth ladder (price levels + cumulative volume bars) in a resizable panel, consistent with the existing panel system.
- Add to `BybitWebSocketManager` as an opt-in subscription (only active in live mode or when the panel is visible) to avoid unnecessary bandwidth.

#### Open questions before planning

1. **API key security** — server-side encrypted storage (AES-256 + user-specific key derived from JWT) vs. user-managed (user stores key themselves, enters on each session)?
2. **Scope of live mode** — full parity with paper (all order types) on day 1, or market orders only to start?
3. **Paper + live simultaneously** — can a user run both accounts side-by-side (split panels), or is it one mode at a time?
