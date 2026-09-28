# App Log — cryptopapertrade.com

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
> `apps/client/src/lib/tokens.ts` as the **primary** visual source of truth for all styling
> decisions (colors, spacing, sizes, layout). For anything not yet in `tokens.ts`, or for component
> structure/interaction patterns, fall back to the Figma file (see `.claude/skills/figma-theme-source`).
> (`docs/screenshots/theme/` and `docs/markup-reference/`, formerly cited here, never existed /
> have since been removed — see `.claude/rules/design.md`'s source-of-truth hierarchy.)
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
| lightweight-charts | ^5.1.0   | TVP chart library           |
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
- Visual source of truth: `apps/client/src/lib/tokens.ts` — always consult before making spacing, color, size, or layout decisions. Fall back to the Figma file (`.claude/skills/figma-theme-source`) for anything not yet in `tokens.ts`.
- **No hardcoded hex values, font strings, or font sizes in components** — always import from `@/lib/tokens`. Canvas/chart libs (lightweight-charts) must use `tokens.ts` directly (cannot read CSS vars). Tailwind pseudo-classes (`hover:`, `focus:`) use named brand utilities from `@theme inline` in `index.css`.
- Q&A required before any UI implementation — no visual assumptions

---

## 🔐 Security Hardening Plan

> Identified post-Phase-2 review. All checklist items added to the **`bug-sweep`** skill priorities P1–P12 (formerly `docs/REVIEW_CHECKLIST.md` Section 2; consolidated into the skill as the single source of truth).

### Phase 1 Retroactive — Fix Immediately (auth is already live)

| Item                                                                                                                          | File                   | Type            | Status   |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------- | -------- |
| `JWT_SECRET` entropy check — `Buffer.byteLength(secret) >= 32` at startup                                                     | `config.ts`            | Code change     | ✅ Done  |
| Explicit `algorithms: ['HS256']` on `@fastify/jwt` registration                                                               | `app.ts`               | Code change     | ✅ Done  |
| Token-theft full-revocation: when `/refresh` detects `count=0`, call `deleteMany({ where: { userId } })` to kill all sessions | `routes/auth/index.ts` | Code change     | ✅ Done  |
| `pnpm audit` added to pre-release CI gate                                                                                     | CI config              | Process change  | ✅ Done  |
| No JWT in URL params, CSRF docs, error-handler URL audit, HSTS/CSP/CORS wildcard check                                        | `bug-sweep` skill P2   | Checklist items | ✅ Added |

### Phase 2 — Current Sprint

| Item                                                                                 | File                 | Type           | Status   |
| ------------------------------------------------------------------------------------ | -------------------- | -------------- | -------- |
| `dangerouslySetInnerHTML` prohibition + user content as plain text                   | `bug-sweep` skill P2 | Checklist item | ✅ Added |
| `paperStore` `persist()` — add `version` + `migrate` for safe localStorage hydration | `paperStore.ts`      | Code change    | ✅ Done  |

### Phase 3+ — Future

| Item                                                                       | Notes                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ~~Authenticated WebSocket JWT via `Authorization` header (not `?token=`)~~ | ✅ BP-1: `/api/paper/ws` authenticates with a first `auth` message (and re-auth), never a URL token |
| WAF/CDN layer for distributed brute-force protection                       | IP rate limits alone are insufficient against botnets                                               |

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
   - **Position close — sibling cancel** ✅: `closePosition` builds a `siblingCancelOrders: HistoricalOrder[]` array at close time. Rules: if `closeType === 'take-profit'` → cancel SL; if `closeType === 'stop-loss'` → cancel TP; manual close (no closeType) → cancel both. Each cancelled record: `type = 'take-profit' | 'stop-loss'`, `status = 'cancelled'`, `commission = 0`, `placingTime = pos.openedAt`, `closingTime = now`, `limitPrice` or `stopPrice` filled with the exit level. They land in `orders[]` alongside the fill record, making them appear in **Order History → Cancelled** and **Orders → Cancelled** — mirrors TVP exactly. No journal note is added for auto-cancelled siblings (kept silent to avoid noise next to the main TP/SL close entry).
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

- **Symbol pair icons** (`SymbolPair`) in Positions / Orders / History symbol column ✅: stacked base + quote coin icons (base 16 px front, quote 10 px overlapping bottom-right with panel-colour ring separator) in the TVP style. Also applied to the `SymbolBar` symbol picker — both the trigger button (18 px base) and every dropdown row (20 px base). `SymbolPair` is exported from `CryptoIcon.tsx`; `USDT` added to `CRYPTO_ICON_URLS` (falls back to text badge gracefully). `cryptoIcons.test.ts` updated: count 9 → 10, USDT mock + expected entry added.

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

**`layoutStore`** (persisted `cd-layout` v2 — version 1→2 migration adds `indicators` to each `PaneConfig`):

- `layout: LayoutId` — active layout ID
- `activePane: number` — pane that receives SymbolBar controls + TradingPanel focus
- `panes: PaneConfig[]` — 4 entries; each now has `indicators: IndicatorInstance[]` (defaults: EMA9/EMA20/EMA200/VWAP)
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
- Popover (w-56): "Layout" row with 5 SVG icons (paths match TVP `chart-layout.html`) + "Sync across panes" section
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
- **Snap-on-enable (symbol / interval)**: `toggleSync('symbol' | 'interval')` — when the flag transitions from OFF → ON, all panes are immediately snapped to the **active pane's** current symbol/interval. Active pane is the source of truth (mirrors TVP/Bookmap convention: the chart the user is focused on wins). Toggling OFF only flips the flag; panes retain their (now-uniform) values. Crosshair has no snap (event-driven pointer only).
- **Snap-on-enable (timeRange)**: a `useEffect` in `MultiChartArea` watches `syncOptions.timeRange`; on OFF → ON it reads `chartRefs[activePane].timeScale().getVisibleRange()` and calls `setVisibleRange(range)` on all other active chart refs. Active pane wins. Uses the same `isSyncingTimeRange` guard to prevent cascade. Crosshair has no snap — it is purely pointer-driven.
- **Interval-aware initial view** (TVP-matched): `INTERVAL_BAR_SPACING` in `markets.ts` maps each interval to an initial px/bar spacing targeting ~160–200 visible candles at a ~1 200 px viewport (same visual density as TVP). Applied in `ChartPanel` on `isFirstLoad || isOutOfRange` via `timeScale().applyOptions({ barSpacing })` before `scrollToRealTime()`. Fetch limit bumped to `INTERVAL_FETCH_LIMIT` (1 000 bars = server max) for deep scrollback buffer. `MAX_BARS` in `paneStore` raised to 1 000 to match.

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

Based on TVP markup reference. Not a 1:1 copy.

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

**Intentionally skipped vs TVP:** DOM tab, Risk USD / Risk % balance, Tick value, Time in force

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

### Fees (BP-2 — Bybit VIP-0; the server charges, `apps/server/src/trading/bybitSpec.ts`)

- **USDT Perpetual:** taker 0.055% / maker 0.02%, on notional (`qty × price`). Market, stop, TP/SL and a limit that
  crosses the book are taker; a resting limit that later fills is maker.
  - **Open:** `balance -= IM + openFee + estCloseFee` (IM = `qty × price / leverage`; the close-fee estimate is taker,
    priced at the bankruptcy price `price × (1 ∓ 1/leverage)` since BP-3, and stays with the position as
    `closeFeeReserve`).
  - **Close:** `balance += IM + closeFeeReserve + pnl − closeFee`; `realizedPnl += pnl − closeFee − entryFee` (the
    stored `entryFee`, never a recomputation).
  - **Resting order:** reserves IM + taker open + taker close at its trigger (`Order.reserved`); cancel / edit / fill
    refund exactly that.
- **Spot:** 0.1% in the asset received — a buy pays in the coin, a sell in USDT. Realized PnL = `(price − avgCost) ×
qty − fee`.
- `BalanceEvent.pnl` = `pnl − closeFee` (net impact on balance at close).
- Rows from before BP-2 keep the flat 0.07% they were charged (migration backfill); the client's estimates use the
  SDK's copy of the rates (`FEE_RATES`), kept identical to the server's by a test.

### Isolated margin & liquidation (BP-3 — the server decides, `apps/server/src/trading/bybitSpec.ts`)

- One position per USDT Perpetual symbol (one-way mode): same-side fills merge at the qty-weighted entry.
- Perp positions are valued at the **mark** price (PnL, equity, MMR); TP / SL / stops still trigger on the last price.
- Liquidation price, bankruptcy price, IM and MM follow Bybit's UTA isolated-mode formulas with the risk-limit tier
  of the position's value; they are derived, not stored.
- When the mark reaches the liquidation price: the symbol's active orders are cancelled and refunded, the position
  closes at the bankruptcy price, its whole margin is lost (execType `BustTrade`, createType `CreateByLiq`).
- Leverage changes re-margin an open position and the symbol's orders (refused without the balance for it, or when a
  raise would put the position past its liquidation price at the current mark).

### Funding (BP-4 — the server settles, `engine/actions.ts` `settleFunding`)

- At each USDT Perpetual symbol's funding timestamp, every position held then pays or receives
  `size × mark × rate` (positive rate: longs pay, shorts receive), at Bybit's settled rate for that timestamp.
- Paid from the balance, any shortfall from that position's margin (its liquidation price moves); received to the
  balance. Booked in realized PnL at settlement; a later close carries its share for Closed P&L (not charged twice).
- Settled once per account and symbol and timestamp (`SymbolSetting.lastFundingAt`); a server gap is backfilled from
  Bybit's funding history in time order with the candle sweep.

### Cross margin, risk tiers, order flags (BP-5 — `bybitSpec.ts`, `engine/cross.ts`, `engine/orderRules.ts`)

- Margin mode is account-wide (Bybit UTA): new accounts cross, pre-BP-5 accounts isolated until switched. Cross values
  every position at mark (margin balance, IM / MM rates, available balance); an order needs the available balance;
  the account is liquidated when its MM rate reaches 100% (orders cancelled, positions stepped down in contract order).
- Isolated: add / reduce margin per position; a higher-tier position is liquidated tier by tier.
- An order, edit or leverage change may not pass the risk-limit cap of the leverage (110090).
- TP / SL / stops trigger on Last (default), Mark or Index; a new TP / SL must be on the right side of the base price
  (Bybit's wording); an SL past liquidation is allowed. Reduce-only / close-on-trigger only shrink a position.

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

- Use `key={prop}` on parent to reset child state on prop change (`TradingPanel` uses ``key={`${activePane}-${category}-${symbol}`}``)
- Never use during-render `setState`, never use `useEffect` + `setState` for reset

---

## 🔁 Bybit Parity (BP-0 … BP-5) — reference

> **Status:** all six phases shipped (BP-0 … BP-5, 2026-09-26 … 2026-09-27; changelog entries below under
> "feat: Bybit Parity BP-n"). This section replaces `docs/BYBIT_PARITY_PLAN.md`, retired on 2026-09-28. Code
> comments cite it as "APP_LOG Bybit Parity BP-n" (the phase that introduced the rule). The full plan (per-step
> checklists, Bybit research notes, the BP-4 integration audit) is in git history:
> `git show 8d40f88:docs/BYBIT_PARITY_PLAN.md`.

**Goal:** paper trading behaves like a Bybit **Unified Trading Account (UTA), VIP 0, one-way position mode**, so what
a user learns here transfers 1:1 to Bybit, and the engine can be tested against Bybit's v5 APIs (standing owner
direction: mimic Bybit's behaviour and v5 field names). Phases are numbered BP-n so they don't collide with the
roadmap's Phase 5 (live Bybit) and Phase 6 (AI bot).

**Naming:** Bybit's product names, not its brand — **Spot** | **USDT Perpetual** (header **Trade ▾** menu + tabs on
the trading panel), URLs `/dashboard/spot/BTC/USDT` and `/dashboard/usdt/BTCUSDT`, `BTCUSDT` + a small **Perpetual**
tag. Keep the "market data: Bybit" attribution; never "Bybit Perps" or Bybit's logo (Legal & Compliance only covers
use of the public API).

### Phases

| Phase | What shipped                                                                                                                                                                                                                              | Findings closed |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| BP-0  | Per-market data feed: spot + linear WS, `orderbook.1` bid/ask, `category` on history / WS / instruments / risk-limit endpoints                                                                                                            | F1, F2, F9      |
| BP-1  | Server trading engine (24/7, D9): the browser sends intents, the server fills, triggers and persists                                                                                                                                      | F10, F11        |
| BP-2  | Spot and USDT Perpetual markets, Bybit VIP-0 fees, Bybit fill prices, size rules, per-symbol leverage, D7 migration                                                                                                                       | F3–F6, F8, F9   |
| BP-3  | Mark price, one-way positions (merge), isolated liquidation at bankruptcy, re-margining, chart lines                                                                                                                                      | F6, F7          |
| BP-4  | Funding at Bybit's settled rate, backfill, Balance History / journal rows                                                                                                                                                                 | F7 (funding)    |
| BP-5  | Add / reduce margin (A), trigger-by + reduce-only + close-on-trigger + TP / SL side check (B), risk-limit cap + partial liquidation (C), Closed P&L (D), cross margin (E), engine refinements (F), v5 adapter + testnet parity script (G) | —               |

**Findings (the gaps that started the work, all closed):** F1 chart history and live feed came from different
markets · F2 spot bid/ask never arrived · F3 market orders filled at last, not best bid/ask · F4 resting limits
filled better than their limit · F5 one flat 0.07% fee · F6 account-wide leverage · F7 no liquidation / mark /
funding · F8 shorting on spot · F9 hard-coded lot / tick sizes · F10 nothing monitored with the tab closed · F11 the
browser decided fills and PnL.

### Decisions

| #   | Decision (agreed 2026-09-25)                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| D1  | Two markets: **Spot** (1×) and **USDT Perpetual** (leverage, long + short)                                         |
| D2  | Spot is a normal spot market: buy with USDT, sell only what you hold, no shorting                                  |
| D3  | The old leveraged behaviour becomes USDT Perpetual, with Bybit's naming                                            |
| D4  | Bybit's real fees (VIP 0); the flat 0.07% is dropped                                                               |
| D5  | Order: data → server engine → markets + fees + fills → mark + isolated liquidation → funding → cross + refinements |
| D6  | Follow Bybit as closely as possible; every deliberate difference is written down (Known gaps)                      |
| D7  | New users start on Spot; existing positions migrated to USDT Perpetual                                             |
| D8  | One shared USDT wallet for Spot and Perpetual (UTA)                                                                |
| D9  | The server executes and checks all trades 24/7; the browser sends requests and shows server state                  |

| #   | BP-5 owner decision (answered 2026-09-27)                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- |
| O1  | Offer cross margin                                                                                              |
| O2  | New accounts start in **Cross**; accounts from before BP-5 stay Isolated with a one-time notice                 |
| O3  | Bybit's mode-switch rules (allowed with open positions when the checks pass; else `3400045` with reasons)       |
| O4  | One BP-5 release (not split)                                                                                    |
| O5  | Cross unrealised profit counts towards the available balance (Bybit's API formula) — **to confirm on testnet**  |
| O6  | Tier info in the leverage modal, plus the tier on hover in the Positions row                                    |
| O7  | Partial liquidation of higher-tier positions                                                                    |
| O8  | TP / SL / stops trigger on Last / Mark / Index                                                                  |
| O9  | Bybit's TP / SL validation (side vs the base price); a stop-loss past liquidation is accepted with a UI warning |
| O10 | No auto-add margin                                                                                              |
| O11 | Remove the pre-BP-2 API after one release that logs any call — **done 2026-09-28**                              |
| O12 | Full TP / SL only (Partial mode left out)                                                                       |

Also settled for BP-3: mimic Bybit as closely as possible — merge same-side fills, re-margin on a leverage change,
draw every chart line Bybit draws, no grace period at deploy.

### Bybit reference values

The single source is `apps/server/src/trading/bybitSpec.ts` (each constant carries `// source: <Bybit URL>, checked
<date>`); the client gets display copies through the SDK (`generated/CDSDK/spec/bybit.ts`), kept equal by a parity
test. **Re-verify against Bybit before changing any of them — Bybit changes these.**

| Item                   | Spot                               | USDT Perpetual (linear)                                                             |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Fee taker / maker      | 0.1% / 0.1%, in the asset received | 0.055% / 0.02%, in USDT, on qty × fill price                                        |
| Leverage               | 1×                                 | Per symbol, one-way; **capped at 10×** (`MAX_LEVERAGE`; Bybit allows ≥ 25×)         |
| Short selling          | No                                 | Yes                                                                                 |
| TP / SL / stop trigger | Last price                         | Last (default), Mark or Index                                                       |
| Unrealised PnL         | Last vs average cost               | Mark price                                                                          |
| Liquidation            | —                                  | Mark reaches the liquidation price → settled at the bankruptcy price                |
| Funding                | —                                  | Every `fundingIntervalHour`: `qty × mark × fundingRate`                             |
| Precision / minimums   | `instruments-info?category=spot`   | `instruments-info?category=linear`                                                  |
| Maintenance margin     | —                                  | Risk-limit tier from `/v5/market/risk-limit` (BTCUSDT tier 1 MMR 0.33%, 2026-09-26) |

Isolated liquidation price (Bybit UTA):

```
IM  = qty × entry / leverage
MM  = qty × entry × MMR − mmDeduction + estFeeToClose
Long  LP = entry − (IM − MM) / qty − extraMargin / qty
Short LP = entry + (IM − MM) / qty + extraMargin / qty
```

The liquidation price is then rounded to the symbol's price tick on the safe side — a long's up, a short's down — as
Bybit reports it; `positionIM` = IM + fee to close + extra margin (both confirmed by the testnet parity run,
2026-09-28).

Cross (UTA, `accountFigures`): margin balance = wallet + perpetual unrealised PnL; total IM covers positions **and
active orders**, at mark; IM / MM rate = total IM / MM ÷ margin balance; available = margin balance − total IM; the
account is liquidated when the MM rate reaches 100% (orders cancelled, then positions stepped down tier by tier in
contract order, BTCUSDT first). Closed P&L = position P&L − open fee − close fee − funding, prorated on a partial
close. Refusals copy Bybit's retCodes: `110014` / `110078` / `110011` / `110033` (margin), `110017` (reduce-only),
`110090` (risk-limit cap), `3400045` (mode switch).

### Data model added by the parity work

- `Position`: `category`, `leverage`, `marginMode`, `entryFee`, `closeFeeReserve` (BP-2), `extraMargin` (BP-3),
  `cumFunding` (BP-4), `tpTriggerBy` / `slTriggerBy` (BP-5). Liquidation / bankruptcy prices are derived, not stored.
- `Order`: `category`, `reserved`, `feeRate`, `feeAsset`, `isMaker`, `ocoGroup` (BP-2), `createType` (BP-3),
  `triggerBy` / `tpTriggerBy` / `slTriggerBy`, `reduceOnly`, `closeOnTrigger` (BP-5).
- `Trade`: `category` (BP-2; the fee is `commission`, always USDT on linear), `execType` (`Trade` | `BustTrade` |
  `Funding`, BP-3 / BP-4), `feeRate`, `funding` (BP-4), `openFee` (BP-5).
- `Account`: `version` (optimistic concurrency, BP-1), `marginMode` (`REGULAR_MARGIN` = cross | `ISOLATED_MARGIN`)
  and `marginModeNotice` (BP-5).
- New tables: `SymbolSetting` (per-symbol leverage, `leveragePinned`, funding marker `lastFundingAt`), `SpotBalance`
  (`free`, `locked`, `avgCost`, non-negative CHECK), `JournalEntry`, `EngineLease`.
- Client `paperStore` (`cd-paper-trading`) is only a cache since BP-1: a version bump drops the old shape and the
  server hydrates. Legacy rows keep the fee they were charged (`LEGACY_FEE_RATE`).

### Out of scope (deliberately not copying Bybit)

Hedge mode (one-way only) · spot margin, borrowing and interest · order-book depth, slippage beyond best bid/ask,
partial fills, ADL, insurance fund · VIP tiers, fee coupons, USDC / inverse contracts, options · auto-add margin
(O10) · Partial-mode TP / SL (O12) · portfolio margin.

### Known deliberate gaps vs Bybit

| Gap                                                                                                               | Why                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Leverage capped at 10× (Bybit allows far more)                                                                    | Safety cap for a learning app                                                |
| Fills at top of book only, no depth                                                                               | Simplicity; fine for small orders                                            |
| Liquidation settles instantly at the bankruptcy price                                                             | No liquidation engine / insurance fund                                       |
| Limits trigger on the last price, not the book                                                                    | No order-book simulation                                                     |
| A backfilled trigger (server was down) fills at the level it crossed, with the taker fee                          | There is no quote for the past                                               |
| Spot TP / SL are placed or cancelled, not edited                                                                  | Cancel and place again                                                       |
| A TP / SL pair attached to a spot buy uses the exact coins received (net of the fee), not floored to the qty step | Engine triggers have no instrument rules; the pair still sells correctly     |
| Cross liquidation closes each step at an estimated bankruptcy price (the account's equity share)                  | No liquidation engine / order book; Bybit takes positions over at bankruptcy |
| A cross account's backfill uses the other symbols' last live marks, not their mark candles for that minute        | One market's gap replays that market only                                    |
| A late funding fee for a closed position reaches its Closed P&L row after the next snapshot, not live             | The closed row isn't re-sent in a delta                                      |

### Open items

- ~~O11 — remove the pre-BP-2 API~~ — **done 2026-09-28** (changelog "fix: remove the pre-BP-2 paper API").
- **Bybit testnet parity run (BP-5 G).** `pnpm --filter @crypto-dashboard/server parity:testnet` replays a fixed
  scenario on Bybit testnet and on the paper engine and diffs `position/list`, `execution/list`,
  `position/closed-pnl` and `account/wallet-balance` (maths given the same fills; tolerance 0.01). Testnet only, keys
  never logged. **Runs in CI since 2026-09-28** (`.github/workflows/parity.yml`: nightly and on demand, never on
  PRs). The runner builds the commit's server image and runs the script on a one-off Fly Machine in `sin` in its own
  app, `crypto-dashboard-parity` (Bybit geo-blocks GitHub's US runners with 403), then removes it. Secrets, in the
  `bybit-testnet` environment (usable from `main` only): `BYBIT_TESTNET_KEY` / `BYBIT_TESTNET_SECRET` (a Read-Write
  testnet key with Unified Trading → Contract Orders + Positions; without an IP allow-list it expires after ~3 months —
  renew when a run fails with `33004`) and `FLY_PARITY_API_TOKEN` (a deploy token scoped to the parity app, expires
  2027-09-28). The testnet account needs USDT in its Unified Trading account (`110007` otherwise). A failure opens a
  `parity` issue.
  - **First runs (2026-09-28, runs 36417777245 and after):** they settled that Bybit's `positionIM` **includes the
    margin added by hand** (8.43 + 10 = 18.43), that Bybit **rounds the liquidation price to the tick** on the safe
    side (75,742.94 → 75,743), and that under UTA `bustPrice` is reported blank and `slTriggerBy` is not on
    `position/list` (it's on the StopLoss order). The engine and the adapter follow since
    `fix/bybit-parity-first-run`.
  - **Still open until a run is green:** O5 (cross unrealised profit funds orders), the max-reducible margin formula,
    the retCode of a risk-limit refusal, and whether Bybit's `positionValue` is size × mark (the first run's 83.8569
    vs 0.001 × entry 83,881.1 suggests so; the runs now log Bybit's mark with each position check). The tier is
    chosen by value, so a mark-based value would change tiers near a boundary.
- **Manual browser checks** still ⬜ in `TRADING_TEST_PLAN.md` (live feed, tab closed, two tabs, refresh) — to be
  converted to Playwright (roadmap P2).
- Low: editable spot TP / SL (Known gaps) — only if users ask.

### Sources

- Fees: [Trading Fee Structure](https://www.bybit.com/en/help-center/article/Trading-Fee-Structure) ·
  [Spot fees](https://www.bybit.com/en/help-center/article/Bybit-Spot-Fees-Explained) ·
  [Futures fees](https://www.bybit.com/en/help-center/article/Perpetual-Futures-Contract-Fees-Explained)
- Margin and liquidation:
  [Liquidation price, isolated (UTA)](https://www.bybit.com/en/help-center/article/Liquidation-Price-Calculation-under-Isolated-Mode-Unified-Trading-Account) ·
  [Maintenance margin](https://www.bybit.com/en/help-center/article/Maintenance-Margin-USDT-Contract) ·
  [Bankruptcy price](https://www.bybit.com/en/help-center/article/Bankruptcy-Price-Perpetual-and-Expiry-Contracts) ·
  [Margin modes (UTA)](https://www.bybit.com/en/help-center/article/Differences-Between-the-Margin-Modes-Under-the-Unified-Trading-Account) ·
  [Margin calculations](https://www.bybit.com/en/help-center/article/Margin-Calculations-Under-Different-Margin-Modes) ·
  [UTA liquidation process](https://www.bybit.com/en/help-center/article/UTA-Trading-Rules) ·
  [Risk limit](https://www.bybit.com/en/help-center/article/Risk-Limit-Perpetual-and-Futures)
- Orders and P&L: [TP / SL](https://www.bybit.com/en/help-center/article/Introduction-to-Take-Profit-Stop-Loss-Perpetual-Futures-Contracts) ·
  [Reduce-only](https://www.bybit.com/en/help-center/article/Reduce-Only-Order) ·
  [Close-on-trigger](https://www.bybit.com/en/help-center/article/Close-On-Trigger-Order) ·
  [P&L (USDT contract)](https://www.bybit.com/en/help-center/article/Profit-Loss-calculations-USDT-Contract) ·
  [Funding rate](https://www.bybit.com/en/help-center/article/Introduction-to-Funding-Rate)
- API v5: [ticker stream](https://bybit-exchange.github.io/docs/v5/websocket/public/ticker) ·
  [funding history](https://bybit-exchange.github.io/docs/v5/market/history-fund-rate) ·
  [set margin mode](https://bybit-exchange.github.io/docs/v5/account/set-margin-mode) ·
  [wallet balance](https://bybit-exchange.github.io/docs/v5/account/wallet-balance) ·
  [add / reduce margin](https://bybit-exchange.github.io/docs/v5/position/manual-add-margin) ·
  [risk limit](https://bybit-exchange.github.io/docs/v5/market/risk-limit) ·
  [create order](https://bybit-exchange.github.io/docs/v5/order/create-order) ·
  [closed P&L](https://bybit-exchange.github.io/docs/v5/position/close-pnl) ·
  [error codes](https://bybit-exchange.github.io/docs/v5/error)

---

## 📁 Key Files

| File                                                                                       | Purpose                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/lib/indicators/types.ts`                                                  | User-selectable indicator types (`IndicatorMeta`, `IndicatorInstance`, `IndicatorPrimitive`)                                                    |
| `apps/client/src/lib/indicators/catalog.ts`                                                | Catalog of 9 indicators with param defs + inline factory functions                                                                              |
| `apps/client/src/lib/indicators/primitives/`                                               | Custom `ISeriesPrimitive` implementations (ema, vwap, macd) + 6 LH calculation files                                                            |
| `apps/client/src/components/indicators/IndicatorDropdown.tsx`                              | Portal dropdown in SymbolBar — add indicators grouped by category                                                                               |
| `apps/client/src/components/indicators/IndicatorWidget.tsx`                                | Floating draggable indicator widget (Framer Motion)                                                                                             |
| `apps/client/src/components/indicators/IndicatorWidgets.tsx`                               | Container + settings state for indicator widgets                                                                                                |
| `apps/client/src/components/indicators/IndicatorSettings.tsx`                              | Portal popover for params/style editing                                                                                                         |
| `apps/client/src/lib/tokens.ts`                                                            | **Design tokens** — single source of truth for all colors, fonts, sizes (JS/TS side)                                                            |
| `apps/client/src/index.css`                                                                | Tailwind v4 theme — `@theme inline` generates brand color utilities from tokens                                                                 |
| `apps/client/src/store/paperStore.ts`                                                      | Read model of the server engine: hydrated by snapshot, updated by deltas over the private WS; order actions call the SDK                        |
| `apps/client/src/store/authStore.ts`                                                       | Auth token + user (in-memory, no persist)                                                                                                       |
| `apps/client/src/components/dashboard/OrderAccountManagementPanel.tsx`                     | **"Order & Account Management"** bottom panel — Positions · Orders · Order History · Balance History · Trading Journal; Account Settings modal  |
| `apps/client/src/components/dashboard/TradingPanel.tsx`                                    | Right sidebar order entry                                                                                                                       |
| `apps/server/src/routes/auth/index.ts`                                                     | All auth routes (register/login/logout/refresh/me/reset-password),                                                                              |
| `apps/server/src/routes/paper/index.ts` · `ws.ts`                                          | Paper trading API (intent only) and the private account WebSocket `/api/paper/ws`                                                               |
| `apps/server/src/trading/engine/`                                                          | Pure Decimal trading engine (Draft / Delta): actions, triggers, spot, cross, margin, order rules                                                |
| `apps/server/src/trading/MatchingEngine.ts` · `TradingService.ts` · `AccountRepository.ts` | 24/7 trigger / liquidation / funding loop with an engine lease; per-user action queue; Prisma persistence                                       |
| `apps/server/src/trading/bybitSpec.ts`                                                     | Every Bybit constant and formula (fees, tiers, liquidation, account figures), each with its source; SDK copy in `generated/CDSDK/spec/bybit.ts` |
| `apps/server/src/trading/bybitParity.ts` · `tools/bybitParity.ts`                          | v5 field adapter and the Bybit testnet parity run (`parity:testnet`)                                                                            |
| `.github/workflows/parity.yml`                                                             | Nightly testnet parity run on a one-off Fly Machine (`crypto-dashboard-parity`), secrets in the `bybit-testnet` environment                     |
| `apps/server/src/lib/clientIp.ts`                                                          | The visitor's IP (`Fly-Client-IP` from Fly's proxy link only) for rate limits, WS caps and stored IPs                                           |
| `apps/client/src/hooks/usePaperFeed.ts`                                                    | Private paper WebSocket: auth message, snapshot + deltas, re-auth on token refresh                                                              |
| `docs/TRADING_TEST_PLAN.md`                                                                | Test strategy (Part A) and case catalogue (Part B)                                                                                              |
| `apps/server/src/routes/market/index.ts`                                                   | REST + WebSocket market data routes                                                                                                             |
| `apps/server/src/services/BybitWebSocketManager.ts`                                        | Bybit WS connection singleton                                                                                                                   |
| `apps/server/src/constants.ts`                                                             | `ALLOWED_SYMBOLS` — source of truth for WS subscriptions + routes                                                                               |
| `generated/CDSDK/types/index.ts`                                                           | Shared types (User, Account, CandleBar, WsMessage, etc.)                                                                                        |
| `generated/CDSDK/api/auth.ts`                                                              | Client-side auth API calls                                                                                                                      |
| `generated/CDSDK/api/market.ts`                                                            | Client-side market API + WS URL                                                                                                                 |
| `apps/client/src/lib/markets.ts`                                                           | Shared `SYMBOLS` (9 coins), `INTERVALS` (6), `INTERVAL_LABELS`, `SymbolEntry` type — imported by SymbolBar, PaneHeader, layoutStore defaults    |
| `apps/client/src/store/layoutStore.ts`                                                     | Layout config — layout ID, activePane, per-pane symbol/interval, sync options                                                                   |
| `apps/client/src/store/paneStore.ts`                                                       | 4 independent vanilla Zustand stores (bars/price/connection per pane)                                                                           |
| `apps/client/src/hooks/usePaneFeeds.ts`                                                    | Manages 4 WS+REST connections (one per active pane) — replaces `usePriceFeed`                                                                   |
| `apps/client/src/components/dashboard/ChartLayoutPicker.tsx`                               | Layout picker popover (5 SVG icons) + sync option toggles                                                                                       |
| `apps/client/src/components/dashboard/PaneHeader.tsx`                                      | Per-pane mini header (symbol picker, interval buttons, live price, connection dot)                                                              |
| `apps/client/src/components/dashboard/MultiChartArea.tsx`                                  | CSS grid renderer for all layouts; wires crosshair + time-range sync                                                                            |
| `apps/client/src/lib/tokens.ts`                                                            | Visual source of truth — spacing, colors, sizes, layout (fallback: Figma via `.claude/skills/figma-theme-source`)                               |
| `apps/client/src/lib/drawing/types.ts`                                                     | Drawing type definitions (`Drawing`, `DrawingPoint`, `LineStyle`, etc.)                                                                         |
| `apps/client/src/lib/drawingManager.ts`                                                    | Drawing tools on the `lightweight-charts-drawing` library (replaced the custom drawing system, 2026-07-21)                                      |
| `apps/client/src/lib/cursors.tsx`                                                          | Cursor variant icons + data-URI CSS map for chart cursor overrides                                                                              |
| `.claude/skills/bug-sweep/SKILL.md`                                                        | Pre-commit / proactive-audit checklist (138 items, priorities P1–P12) — single source of truth. Was `docs/REVIEW_CHECKLIST.md` — consolidated.  |
| `docs/APP_LOG.md`                                                                          | This file — full project context, attach at start of every session                                                                              |

---

## 🗺️ Phase Roadmap

### ✅ Completed

- **Phase 1**: Auth (register/login/logout/refresh/forgot+reset password), JWT + httpOnly cookie rotation, Prisma schema, email service, Swagger docs
- **Phase 1**: Market data — Bybit WebSocket, CandleAggregator, IndicatorCalculator, REST history endpoint
- **Phase 1**: Client scaffold — React 19, Vite, Tailwind, PWA, React Router, Zustand
- **Phase 2**: Live price feed (WebSocket → `usePriceFeed` → `marketStore`)
- **Phase 2**: Paper trading v1 — `paperStore` (market orders), `TradingPanel` (market-only), `OrderAccountManagementPanel` (Positions + Order History + Balance History + Journal tabs), TP/SL monitor, commission accounting
- **Phase 2**: Review infrastructure — `APP_LOG.md`, CI-passing tests (421 total: 321 client + 100 server). (Formerly included `REVIEW_CHECKLIST.md`; consolidated into `.claude/skills/bug-sweep/SKILL.md` as the single source of truth.)

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

### ✅ Completed (added 2026-07-19 — Phase 1 Drawing Refactoring)

- **Phase 1 — Per-shape renderer classes** — extracted the monolithic `DrawingPrimitive.ts` (1278 lines) into 11 new files following TVP's `BitmapCoordinatesPaneRenderer` + `CompositeRenderer` + `HitTarget` patterns:
  - `BitmapCoordinatesPaneRenderer.ts` — abstract base with `draw(scope)` + `hitTest(x,y)`
  - `CompositeRenderer.ts` — ordered renderer list matching TV's module 789190
  - 6 per-shape renderers: TrendLineRenderer, HorizontalLineRenderer, VerticalLineRenderer, ParallelChannelRenderer, PolylineRenderer, TextLabelRenderer
  - `HitTarget.ts` — enum + `HitTestResult` interface matching TV's module 763
  - `interactionTolerance.ts` — centralized thresholds matching TV's module 604214
  - `sharedDrawing.ts` — `drawHandles()` + `applyLineStyle()` utilities
  - `DrawingPrimitive.ts` rewritten to ~550 lines using `CompositeRenderer` composition
  - `coordinates.ts` deprecated annotations on old hit-test functions (kept for backward compat)
  - Verification: `tsc -b` clean, ESLint 0 errors, Prettier clean, all 506 tests pass

### ✅ Completed (added 2026-06-14 — Paper Trading Phase 3 Sync)

> **Superseded 2026-09-26 by BP-1** (below): the server executes every trade; `syncWithServer`, the client-computed `/paper` endpoints and "client is source of truth" are gone.

- **End-to-end synchronization (Phase 3)** — `paperStore.ts` now fully synchronizes its state (Account, Orders, Trades, Positions) with the PostgreSQL database via `paperApi`.
- **Netting synchronization** — client-side position netting logic now triggers explicit server updates (`recordTrade`, `updatePosition`, `deletePosition`) to keep the database in lock-step.
- **Reconciliation & Hydration** — `syncWithServer` hydration uses `refId || id` mapping to ensure local IDs are correctly matched to server records after page refresh, maintaining UI stability.
- **Legacy ID removal** — removed heuristic checks (`!id.includes('-')`) that previously blocked sync for local IDs. Both CUIDs and local random-string IDs are now handled.
- **Order-to-Position hardening** — simplified server-side `PATCH /orders/:id` to remove side-effect position creation, preventing duplicate positions. Client remains source-of-truth for the position transition after a fill.
- **Fixed Position ID consistency** — server now stores raw client IDs in `refId` without prefixing, ensuring 1:1 matching.

### ✅ Completed (added 2026-04-19 — bid/ask feed + account settings modal)

- **Account Settings modal** — replaces 2-click reset on ⚙️ gear button in `OrderAccountManagementPanel` header. Read-only fields: account name (username from `useAuthStore`), Leverage (`10:1`, Crypto), Commission (`0.07% / 0.0007`, Fixed · Taker). Footer: "Reset account" (2-click confirm, 3 s auto-cancel, closes modal on confirm) + "Save" (disabled — read-only). Backdrop click or ✕ dismisses; confirm state cleared on dismiss.
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

### ✅ Completed (added 2026-07-27 — User-Selectable Indicators)

- **User-selectable indicators** — replaced 5 hardcoded always-on indicators (EMA9/20/200, VWAP, MACD) with a fully user-configurable `ISeriesPrimitive` system.
- **Indicator catalog** (`lib/indicators/catalog.ts`): 9 indicators — EMA, SMA, AvgPrice, MedianPrice, WeightedClose, VWAP, MACD, Momentum, PercentChange — each with typed param defs, default params/style, and an inline factory returning an `IndicatorPrimitive`.
- **Custom primitives**: `primitives/ema.ts` (recursive EMA via LH `exponentialMovingAverage`), `primitives/vwap.ts` (daily-reset sparse dotted line reading volume from source data), `primitives/macd.ts` (compound 3-series: MACD line + signal line + color-coded histogram bars on a sub-pane).
- **LH calculation files ported**: 6 LH calculation functions extracted and standalone (SMA, AvgPrice, MedianPrice, WeightedClose, Momentum, PercentChange).
- **layoutStore**: `PaneConfig.indicators: IndicatorInstance[]` with `addIndicator`/`removeIndicator`/`updateIndicator`/`setIndicatorPosition` actions; version 1→2 with migration.
- **UI components**: `IndicatorDropdown.tsx` (portal dropdown in SymbolBar, grouped by category), `IndicatorSettings.tsx` (portal popover for params/style/color/lineWidth), `IndicatorWidget.tsx` (Framer Motion draggable widget with eye/settings/remove + latest value), `IndicatorWidgets.tsx` (container with ResizeObserver, 1 s refresh poll).
- **SymbolBar**: "Indicators" button before ChartLayoutPicker.
- **ChartPanel**: removed ema9Ref/ema20Ref/ema200Ref/vwapRef/macdHistRef/macdLineRef/signalRef refs + series creation + data push; added primitive lifecycle effect (attach/detach/update via Map); renders `IndicatorWidgets`.

### ✅ Completed (added 2026-09-27 — Bybit Parity BP-0 … BP-5)

- **Bybit parity — Spot + USDT Perpetual**: two markets with one shared USDT wallet, a 24/7 server trading engine (the
  browser is a view), Bybit VIP-0 fees and fill prices, mark price, isolated and cross margin, liquidation, funding,
  risk tiers, Closed P&L. Decisions, reference values, known gaps and open items →
  [Bybit Parity (BP-0 … BP-5) — reference](#-bybit-parity-bp-0--bp-5--reference).

### 📋 Planned (Next)

- **Phase 2 — Pane view layer**: Extract point→pixel conversion from `DrawingPrimitive` into per-shape `PaneView` classes, decoupling chart-coordinate conversion from canvas rendering. Phase 1 (renderer classes) is complete; Phase 2 would also wire in-progress preview through per-shape renderers and add `SelectionRenderer`.
- **Phase 3–4**: Tool descriptor system + tool variants via property overrides.
- **Additional drawing tools**: Wire remaining placement (polyline, freehand) — Phase 1 refactoring laid per-shape renderer foundation, but polyline and freehand still need placement state machine support.
- **Test automation** (`docs/TRADING_TEST_PLAN.md` A8), one small PR per step:
  - P1: CI Postgres, migration and repository tests, coverage thresholds.
  - P2: Playwright on a replayed Bybit feed.
  - P3: nightly testnet parity ✅ (2026-09-28); still to do: spec-drift and feed parity jobs.
  - P4: fast-check and Stryker.
  - P5: prod smoke and log alerts.
  - P6: staging, ZAP, k6.
- **Phase 4**: Advanced indicators, alerts, multi-symbol watchlist
- **Phase 5**: Live broker integration — Bybit real-money trading (see full spec below)
- **Phase 6**: AI trading bot — 3-role system: Scanner + Analyst + Executor, paper mode only (see full spec below)
- **Phase 6b**: AI bot connected to Bybit live trading — bot places real orders autonomously (requires Phase 5 + Phase 6 proven; see full spec below)

---

## ⚖️ Legal & Compliance Status

> Full code-level legal scan performed: **May 5, 2026**
> Updated for free-only launch: **June 13, 2026**
> Newsletter + CFWA legal sweep: **June 27, 2026**
> Snapshot is self-contained in this section for review portability.

### ✅ Legal Clearances

- **FINMA / Swiss financial regulation**: Not applicable. No real money, no financial intermediation. FinIA, FinSA, AMLA, Banking Act — all N/A for a pure paper trading simulator.
- **Contact email**: `info@cryptopapertrade.com` — set in `TermsPage.tsx` and `PrivacyPage.tsx`.
- **Privacy Policy §11**: GDPR user rights (Art. 15–22) fully enumerated.
- **Privacy Policy §5**: Legal bases for each processing type documented.
- **Tax (current)**: App is free — no Swiss MWST or EU VAT obligations.
- **Consent Audit Trail**: Capture of `termsAcceptedAt` and `termsAcceptedIp` fully implemented in `RegisterPage.tsx` and `schema.prisma`. 🔐
- **Cookie & Storage Notice**: `<CookieBanner />` implemented in `App.tsx`; explicitly discloses `localStorage` and session cookie usage.
- **Terms & Termination**: Force Majeure, Account Termination, and Anti-Scraping clauses added to `TermsPage.tsx`.
- **Data Retention & Removal**: GDPR-compliant "Delete my account" flow and "Data export" (portability) implemented in `SettingsModal.tsx`. Concrete retention periods (30 days purge) documented in `PrivacyPage.tsx`.
- **Third-Party / Data Processing**: DPAs signed with Fly.io, Resend, and Cloudflare. ✅
- **Trademark**: Search performed on swissreg.ch and EUIPO; no conflicting marks for "cryptopapertrade.com". ✅

### 🔴 Blocking — Resolved

| #   | Issue                                          | File(s)          | Priority | Status  |
| --- | ---------------------------------------------- | ---------------- | -------- | ------- |
| 1   | No DPAs signed with Fly.io, Resend, Cloudflare | — (legal action) | Critical | ✅ Done |
| 2   | Bybit API terms for non-commercial use         | — (verification) | Critical | ✅ Done |

### 🟡 Important — Pending Phase 5

| #   | Issue                                                    | File(s)          | Priority  | Status     |
| --- | -------------------------------------------------------- | ---------------- | --------- | ---------- |
| 3   | No legal entity registered (personal liability exposure) | — (legal action) | Important | ⬜ Pending |

---

## 🔌 Phase 5 — Live Broker Integration (Bybit)

> **Status**: Planned · Not started · No implementation until explicitly instructed.

### Summary

Enable users to connect their personal Bybit account via API keys and execute real trades directly from cryptopapertrade.com. The app acts purely as a UI client — it never holds funds. All money stays in the user's own Bybit account. The architecture mirrors how TVP's broker bridge works: Client → cryptopapertrade.com server (signs + validates) → Bybit REST API → user's account.

### Cost Model

- **Bybit API access**: free (public API, no partnership required).
- **Trading fees**: paid by the user to Bybit directly (~0.055% taker / ~0.01% maker) — same as on Bybit.com. cryptopapertrade.com charges nothing.

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
cryptopapertrade.com client → POST /api/trading/order (authenticated)
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
| User loses money due to a bug                             | 🔴 Critical | Clear ToS disclaimer; no liability assumed by cryptopapertrade.com  |
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

_Last updated: 2026-05-05 (fixed production API URL baked into client bundle)_

- **Public URL**: **https://cryptopapertrade.com/** (Cloudflare Pages, custom domain, production)
  - API: `https://api.cryptopapertrade.com` → `crypto-dashboard-api.fly.dev` (Fly.io, Singapore region)
  - Client env var: `VITE_API_URL=https://api.cryptopapertrade.com` (set in Cloudflare Pages → Settings → Variables)

- **fix: production API URL now correctly baked into client bundle (05.05.2026)** ✅
  - **Root cause**: Cloudflare Pages "Create deployment" UI button was **redeploying the last build artifact** (same asset hash `b6siP-Yt`) rather than triggering a fresh build. The previous artifact had `https://crypto-dashboard-api.fly.dev` baked in from an older CI run.
  - **Fix**: Created `apps/client/.env.production` with `VITE_API_URL=https://api.cryptopapertrade.com`. Vite automatically loads `.env.production` for every production build — the correct URL is now baked in at the source level regardless of what CI env vars are set. No more dependency on Cloudflare Pages → Settings → Variables being configured correctly.
  - **Deployment**: Clean local build (`pnpm --filter client build`) + direct deploy via `wrangler pages deploy` CLI, bypassing the Pages UI redeploy trap entirely.
  - **Verification**: New asset hash `D0pj68RE` deployed to `cryptopapertrade.com`. Network requests for `/api/auth/refresh`, `/api/auth/me`, `/api/auth/login`, and `/api/market/candles` all resolve to `https://api.cryptopapertrade.com`. `fly.dev` no longer appears anywhere in the live bundle.

- **feat: under construction landing page (04.05.2026)** ✅
  - Added `apps/client/src/pages/UnderConstructionPage.tsx` — uses `AuthLayout` (same deep-navy bg + ambient glow blobs + grid overlay as login page), design tokens from `@/lib/tokens` (no hardcoded hex values), `bg.panel` card, gradient text heading, `color.muted` subtext, brand `CD` mark.
  - `AuthLayout` gained optional `hideFooter?: boolean` prop — under construction page passes `hideFooter` so the footer is suppressed; all other auth pages (Login, Register, etc.) remain unaffected (footer on by default).
  - `App.tsx` — added `/` route pointing to `UnderConstructionPage` so visitors landing on `cryptopapertrade.com` see the page immediately; `*` catch-all also shows it. `Navigate` import removed (no longer used).
  - No call-to-action, no links — intentionally minimal.

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
    These are read-only system entries (isUserNote: false), mirroring TVP's activation log.
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

- **feat: TVP-style journal detail for edited parent/child orders (01.05.2026)** ✅
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
- **5.5** �� Order History tab: filled order shows `SymbolPair`, `quote="USDT"`, cancelled row also renders it (3 tests)
- **5.7** — BTC + ETH both present in Positions, BTC still shows `base="BTC"` when active pane is ETH, exactly 2 `SymbolPair`s for 2 positions (3 tests)

**TRADING_TEST_PLAN.md + APP_LOG.md:** Section 5 preamble updated to "5.1–5.7 manually verified — all ✅". Rows 5.1–5.7 note T2 · RTL structural coverage via `Section5SymbolPairIcons.test.tsx`.

**Tests: 340/340 green** (`pnpm --filter client test --run`).

---

### feat: TV-style Orders bench lifecycle — session-scoped TTL cleanup (02.05.2026) ✅

**Context:** The Orders tab was showing all historical `filled`/`cancelled`/`rejected` records indefinitely — identical to Order History. TVP treats Orders as a temporary working bench: terminal rows appear briefly after the event, then auto-evict. On page refresh the bench resets entirely.

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
  - **Section 6** price-parity wording (`Sell/Buy` vs TVP `SELL/BUY` at same timestamp)
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

### security: audit hardening P0/P1/P2 — all 11 findings implemented (2026-06-28) ✅

- **P0 — Shadow DB URL**: hardcoded string → `SHADOW_DATABASE_URL` env var
- **P0 — Rate limit**: 20/15m added to `/api/auth/refresh`
- **P0 — HSTS**: `max-age=63072000; includeSubDomains; preload` in Helmet
- **P0 — Zod schemas**: `SettingsModal` username/email/password validation
- **P0 — .gitignore**: `.env` added to `apps/client/.gitignore`
- **P1 — CSP**: custom directives per-app, `POST /api/csp-violation` endpoint, CSP meta tag in `index.html`
- **P2 — Admin newsletter**: email masking with "Show emails" toggle
- **P2 — Password maxLength**: 72→256 across all server (4) + client (3) schemas
- **P2 — .gitignore**: `.env.*` pattern in root
- **Admin email gating**: `/admin/newsletter` restricted to `ADMIN_EMAIL` on server (403) + client redirect; `ADMIN_EMAIL` env var in config.ts with no default

### feat: admin menu item in TopBar (2026-06-28) ✅

- ShieldCheck icon + "Admin" label in user dropdown, visible only when `user.email === 'adminwithu@gmail.com'`
- Navigates to `/admin/newsletter` on click

### fix: duplicate verification email — root cause found and fixed (2026-06-28) ✅

**Root cause:** After successful registration, the user was redirected to `/unverified` (via `ProtectedRoute` → `emailVerifiedAt` null check). The "Resend verification email" button on that page triggered a second email via `POST /api/auth/resend-verification` ~2 seconds after registration.

**Changes to `apps/server/src/routes/auth/index.ts`:**

- **In-memory dedup lock** (`registrationLocks` Set) — rejects concurrent requests for the same email with 429
- **Prisma `$transaction`** — user + verification token created atomically; token creation failure rolls back user creation
- **Delete-then-create** — `deleteMany` stale tokens before `create`, guaranteeing exactly one valid token per registration
- **Shared email-sent guard** (`emailSentGuard` Set with 5-minute TTL) — both `/register` and `/resend-verification` check this guard before sending. Resend within the TTL window returns a success message but skips the actual email send
- **Structured logging** with `correlationId` (`randomUUID()`) at every handler step — lock check, DB transaction, email send — for debugging duplicate-request issues

**Changes to `apps/client/src/pages/RegisterPage.tsx`:**

- Removed `useRef` + `useCallback` double-submit guard — protection is now fully server-side (simpler, more reliable)

**Server logs confirm single request, single email per registration.** 1 email received in final test (`adminwithu+test6`).

---

### feat: drawing tools — trendline system (2026-07-11) ✅

Completed the MVP trendline drawing system with full interaction lifecycle and TV-style toolbar.

**Architecture:**

- `DrawingPrimitive` — `ISeriesPrimitive` implementation for canvas rendering via `TrendlineRenderer` + `hitTest`
- `useDrawingInteraction` — state machine (`IDLE` → `DRAWING` → `PLACING_A` + pointer capture for drag/resize)
- `drawingStore` — Zustand w/ `persist` (`cd-drawings` localStorage key) — drawings survive page refresh

**Implemented:**

- Trendline placement: click A → preview via crosshair move → click B to commit
- Selection via `hoveredObjectId`, click-on-handle, click-on-body
- Handle drag to resize endpoint, body drag to translate entire line
- Properties toolbar (`DrawingPropertiesMenu`) at trendline midpoint with drag-to-reposition
- Line color, text color, label, line width (1/2/3/4 px), line style (solid/dashed/dotted)
- Dash/dot gap spacing scales with `lineWidth`
- Lock drawing (prevents move/resize)
- Delete via keyboard (`Delete`/`Backspace`) and toolbar button
- Clone with 32px downward offset (computes price delta via `priceToCoordinate`/`coordinateToPrice`)
- Visual order (z-index reorder: front/back/forward/backward)
- Right-click exits drawing mode and restores previous tool
- Escape cancels in-progress placement or deselects
- Only user-set label renders on canvas (auto price-change pill removed)
- Hover legend hidden during active drawing placement
- All popups (color picker, width, style, label, kebab) positioned inside toolbar (`absolute left-0 top-12`)
- `data-drawing-hover`/`data-drawing-active` attributes on chart div
- TV-style line style dropdown (solid/dashed/dotted SVG previews in `<table>`)
- KebabMenu with Clone + Visual Order submenu (TVP `<table>`)
- Cursor variant submenu + line tool submenu in LeftToolbar (right-click)
- Crosshair, Rectangle, Fibonacci toolbar buttons removed (UI-only with no implementation)

**New files:**

- `apps/client/src/lib/drawing/types.ts`
- `apps/client/src/lib/drawing/DrawingPrimitive.ts`
- `apps/client/src/lib/lineTools.tsx`
- `apps/client/src/store/drawingStore.ts`
- `apps/client/src/hooks/useDrawingInteraction.ts`
- `apps/client/src/components/drawing/DrawingPropertiesMenu.tsx`
- `apps/client/src/components/drawing/KebabMenu.tsx`
- `apps/client/src/components/drawing/ColorPicker.tsx`
- `apps/client/src/lib/cursors.tsx`
- `docs/DRAWING_TOOLS.md`

**All checks pass:** server + client type-check, lint, 490 tests.

---

## 🔭 Future Release Ideas

### idea: ATM-style bracket strategies — research (04.05.2026) ⬜

> **Status: research only — no implementation planned yet.**

#### Background

NinjaTrader's ATM (Advanced Trade Management) is a bracket-template system. Before entry the user selects a named strategy; the moment the fill happens, the full exit plan (multiple profit targets + stop management) fires automatically.

#### What cryptopapertrade.com currently has vs. ATM

| Feature                             | cryptopapertrade.com now                       |
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

#### Proposed scoped version for a future release

1. **Multiple profit targets (up to 3)** — replace `takeProfit?: number` on `Position` with `targets: { price: number; pct: number }[]`; `useTPSLMonitor` evaluates each target independently and calls a partial close for each hit.
2. **Auto Break-Even (ABE)** — simple toggle on `Position`: after TP1 fires, stop auto-moves to `entryPrice + offset` (one-shot, then removes itself). Teaches the "risk-free trade" concept visually.
3. **Named strategy templates** — a separate `strategyTemplatesStore` (Zustand + persist, key `cd-strategy-templates`); does NOT reset when the paper account resets. Stores named sets of targets + SL + ABE toggle. Template selector dropdown in `TradingPanel` pre-fills the exit section.

#### Explicitly out of scope (defer or skip)

- Trailing stop — complex monitor math, defer to a later iteration.
- NinjaTrader tick/contract quantity model — not applicable; cryptopapertrade.com is USDT-denominated.
- ATM strategy nesting / parent-child inheritance — too complex for a learning-app context.

#### Open questions before planning

1. **Max targets** — 3 enough, or N?
2. **Trailing stop** — same as ABE, or later?

---

### idea: real Bybit account integration (live trading milestone) — research (04.05.2026) ⬜

> **Status: research only — no implementation planned yet.**

#### What this milestone is

Allow users to connect their own Bybit API key and place **real orders with real money** directly from cryptopapertrade.com, using the same TradingPanel UI they already know from paper trading.

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

---

## 📋 Planned — Not Yet Implemented

---

### plan: user settings modal + account deletion lifecycle (06.05.2026) ✅

### plan: sync paper trading state to DB (14.06.2026) 🔄

- **Goal**: Move paper trading state from `localStorage`-only to server-side persistence in PostgreSQL.
- **Progress**:
  - [x] Server: Updated `schema.prisma` with `stopPrice`, `takeProfit`, `stopLoss`, `commission`, `margin`, `rejectionReason` on `Order` and `Trade`.
  - [x] Server: Created `apps/server/src/routes/paper/index.ts` with Account/Order/Trade CRUD.
  - [x] SDK: Added `SyncAccountResponse`, `SyncOrderResponse`, `SyncTradeResponse` to types.
  - [x] SDK: Created `paperApi` for server-side interaction.
  - [x] Client: Integrate `paperApi` into `paperStore.ts` (netting sync, order sync, position sync).
  - [x] Client: Implement initial migration from `localStorage` to DB for existing users.
  - [x] Client: Sync reconciliation via `refId` for UI stability.
  - [x] Client: Add "Syncing..." status indicator in the UI.

> **Session context**: Completed Paper Trading Phase 3 synchronization core architecture. Implemented
> end-to-end sync for netting, removed legacy ID filters, and unified the Order-to-Position lifecycle.

---

### feat: Exgen-themed landing page + features page + CTA section (2026-06-17) ✅

**Files created:**

- `apps/client/src/pages/LandingPage.tsx` — hero with glow blobs, laptop mockup, stats strip, 3 alternating feature highlights, learning path, dashboard preview, CTA
- `apps/client/src/pages/FeaturesPage.tsx` — sticky anchor nav, 5 detail sections (Charts, Trading, Account, Real-time Data, Cross-platform), Why CPT section, CTA
- `apps/client/src/components/CtaSection.tsx` — shared floating-illustration component used by both pages
- `apps/client/src/assets/home-bg.svg` — 2.2 MB background ambient pattern (1920×3985)
- `apps/client/src/assets/cta-illustration.svg` — 12.7 kB vector illustration (1392×340)

**Files modified:**

- `apps/client/src/components/AuthLayout.tsx` — added `home-bg.svg` overlay, ambient glow blobs, removed `overflow-hidden` from wrapper
- `apps/client/src/components/Footer.tsx` — changed from normal flow to `position: absolute; bottom: 0` to stick to viewport bottom
- `apps/client/src/App.tsx` — registered `/` → LandingPage, `/features` → FeaturesPage; removed old under-construction placeholder
- `apps/client/src/index.css` — Exgen palette: `bg.deep`, `bg.page`, `bg.navy`, `bg.panel`, `color.glow`, `color.white` CSS custom properties; `html`/`body` height fix
- `apps/client/src/lib/tokens.ts` — matching JS token map
- `apps/client/vite.config.ts` — Workbox `maximumFileSizeToCacheInBytes` → 4 MiB to precache home-bg.svg

**Refactored to Exgen tokens:** Auth pages (Login, Register, ForgotPassword, ResetPassword, Unverified, VerifyEmail, VerifyEmailChange), LegalLayout, dashboard components (OrderAccountManagementPanel, PendingOrderEditPanel, PositionEditPanel, SettingsModal, SoundSettings, SymbolBar, TickerBar, TopBar, PaneHeader, ChartLayoutPicker, LeftToolbar)

**Session fixes:**

- Footer `bottom: -8.5rem` → `bottom: 0` (was pushing footer below viewport)
- LandingPage hero wrapper dropped `overflow-hidden` (was clipping ambient glow blobs)
- FeaturesPage Account / Real-time Data / Cross-platform sections reformatted from single-line to multi-line style objects

### feat: landing page stats strip + hero refinements (2026-06-26) ✅

**Hero section:**

- Left column (tagline "Paper trade crypto, FREE") — `gap-6` → `gap-4` (1rem), `items-center` → `items-start`
- Outer flex row — added `overflow: hidden` inline style
- Hero image switched from `complete-mac-removed-bg.png` → `hero-mac.png` → `hero-mac-app.png`
- Hero image wrapper: `width: 68rem` → `55rem` → `36rem`, `height: auto`, `overflow-hidden` retained

**Stats strip (3 cards):**

- All three stat icons replaced with `<img>` tags — `9crypto.svg`, `realtime-data.svg`, `visual-balance.svg`
- Wrapper gradient background removed (transparent) for all three; wrapper sized to `width: 12rem; height: auto`
- Ambient glow blob (`absolute -right-8 -top-8 ...`) removed from each card
- Removed unused `group` class from stat cards
- Removed unused lucide imports (`BarChart3`, `Zap`, `Wallet`)
- "Crypto Pairs" stat: value changed from `"9"` to `"9 crypto pairs"`, label changed from `"Crypto Pairs"` to `"more are being added"`
- `9crypto.svg` image gets `margin-bottom: 1rem`

**Footer:**

- Copyright text color: `${color.muted}60` → `color.muted` (full opacity, matching other footer links)

**Files modified:**

- `apps/client/src/pages/LandingPage.tsx`
- `apps/client/src/components/Footer.tsx`

---

### feat: Tier 3 — Performance (2026-06-26) ✅

**Code splitting:**

- Replaced all 14 static page imports in `App.tsx` with `React.lazy()` — each page is now its own chunk, loaded only on navigation
- DashboardPage chunk reduced from 356 KB → 398 KB separate chunk (no longer in main bundle)
- Wrapped `<AnimatePresence>` in `<Suspense fallback={<PageFallback />}>`
- Created `PageFallback.tsx` — branded loading spinner (matches AuthLayout background, purple spinning Loader2 icon)

**Lazy-loaded images:**

- Added `loading="lazy"` to 5 below-the-fold images in `LandingPage.tsx`: `chartImg`, `papertradingImg`, `cryptoPairsImg`, `realtimeDataImg`, `visualBalanceImg`
- Added `loading="lazy"` to `ctaIllustration` in `CtaSection.tsx`

**Files created:**

- `apps/client/src/components/PageFallback.tsx`

**Files modified:**

- `apps/client/src/App.tsx`
- `apps/client/src/pages/LandingPage.tsx`
- `apps/client/src/components/CtaSection.tsx`

---

### feat: Tier 2 — Trust & Conversion (2026-06-26) ✅

**Privacy Policy link in CookieBanner:**

- Added `<Link to="/privacy">Privacy Policy</Link>` to the cookie notice text in `apps/client/src/components/CookieBanner.tsx`

**Trust badges in Footer:**

- Created `apps/client/src/components/TrustBadges.tsx` — 3 trust badges (256-bit Encryption, No Real Money, Bybit Live Data) using custom SVG icons
- Placed in `apps/client/src/components/Footer.tsx` before the nav links
- Footer background changed from gradient to `bg.panel` (`#25234e`), added `zIndex: 1`

**PWAInstallBanner layout restructure:**

- Moved title "Install cryptopapertrade.com" inside platform branches
- Android branch: restructured to `flex items-center justify-between` — title + description in one div, Install button as sibling
- Removed `mt-3` from Install button for tighter spacing

**Files created:**

- `apps/client/src/components/TrustBadges.tsx`

**Files modified:**

- `apps/client/src/components/CookieBanner.tsx`
- `apps/client/src/components/Footer.tsx`
- `apps/client/src/components/PWAInstallBanner.tsx`

---

### infra: Cloudflare Web Analytics — cookieless analytics (2026-06-26) ✅

- Enabled Real User Measurements (RUM) via Cloudflare Dashboard for `cryptopapertrade.com`
- Beacon auto-injected at the edge — no code changes needed
- Confirmed beacon firing on production site (`static.cloudflareinsights.com`, 200 OK in incognito)
- CFWA is cookieless — no cookie banner or Privacy Policy changes required
- GA4 deferred until post-launch conversion tracking is needed

**No files changed.**

---

### docs: legal page updates for newsletter + CFWA (2026-06-27) ✅

**PrivacyPage** — full sweep for newsletter waitlist and CFWA disclosures:

- **§3 — What We Collect**: Added newsletter subscription data row (email, SHA-256 token hash, consent IP + timestamp, GDPR Art. 7)
- **§5 — Legal Basis**: Added `Consent (Art. 6(1)(a) GDPR)` for newsletter with withdrawal via unsubscribe link
- **§6 — How We Use Data**: "password reset only" → "password reset and newsletter confirmation/verification"
- **§7 — Data Retention**: Added newsletter subscriber retention (pending → 30-day purge, verified → until unsubscribe)
- **§8 — Cookies**: Added CFWA disclosure (cookieless, `cf` query param, respects DNT)
- **§9 — Third-Party Processors**: Resend now includes "newsletter confirmation"; Cloudflare includes "Cloudflare Web Analytics"
- `lastUpdated` bumped to June 27, 2026, version 1.1

**TermsPage** — minor updates:

- **§10 — Third-Party Services**: Resend includes "newsletter confirmation"; Cloudflare includes "Cloudflare Web Analytics"
- `lastUpdated` bumped to June 27, 2026, version 1.1

**Other fixes:**

- `index.html` — extended `data-rh="true"` to all OG/Twitter/description/canonical fallback tags so react-helmet-async replaces them in-place
- `TermsPage.tsx` — fixed period spacing ("purposes . Simulated" → "purposes. Simulated")

**Back link**: LegalLayout uses `navigate(-1)` — verified correct for all navigation flows (Footer → legal page, cross-links between legal pages, direct visits).

**Files modified:**

- `apps/client/index.html`
- `apps/client/src/pages/PrivacyPage.tsx`
- `apps/client/src/pages/TermsPage.tsx`

---

### feat: replace custom drawing system with lightweight-charts-drawing library (2026-07-21) ✅

Replaced the fragile custom `ISeriesPrimitive` drawing system (~3,500+ lines) with `lightweight-charts-drawing` v0.1.1 (MIT, 68 tools). The library plugs directly into lightweight-charts v5 via the same `ISeriesPrimitive` API.

**Key changes:**

- `ChartPanel.tsx` — removed `DrawingPrimitive` + `useDrawingInteraction` hook + `drawingStore` usage. Added `DrawingManager` creation per pane with `attach()`, persistence via `exportDrawings()`/`importDrawings()`, symbol-based localStorage keys (`cd-drawings-{symbol}`).
- `drawingManager.ts` — thin wrapper with `TOOL_MAP` (tool ID translation), `restoreDrawings()`, `persistDrawings()`, `getPersistenceKey()`.
- `MultiChartArea.tsx` — removed drawing-related props; added `onDrawingManagerReady` callback per pane.
- `DashboardPage.tsx` — `handleToolChange` now calls `manager.setActiveTool(TOOL_MAP[toolId])` on the active pane's manager. `handleBinAction` calls `manager.clearAll()`. Removed `handleExitDrawingMode`, `handleEraserExit`, `useDrawingStore`.
- `LeftToolbar.tsx` — removed `BinToolMenu` import and bin context menu (bin click still calls `clearAll`).

**Deleted files (~3,500+ lines):**

- `apps/client/src/lib/drawing/` (entire directory: types, DrawingPrimitive, HitTarget, coordinates, renderers, textLayout, interactionTolerance)
- `apps/client/src/components/drawing/` (entire directory: DrawingPropertiesMenu, KebabMenu, ColorPicker, TextDrawingEditor, BinToolMenu)
- `apps/client/src/hooks/useDrawingInteraction.ts`
- `apps/client/src/store/drawingStore.ts`
- `apps/client/src/store/__tests__/drawingStore.test.ts`
- `apps/client/src/lib/__tests__/drawingCoordinates.test.ts`
- `apps/client/src/lib/__tests__/drawingTextLayout.test.ts`

**Known gap:** Existing persisted drawings in `localStorage['cd-drawings']` are lost (schema change). Acceptable at early stage.

**Files created:**

- `apps/client/src/lib/drawingManager.ts`

**Gates:** lint ✅, type-check ✅, test (490) ✅, format ✅

---

### feat: mobile/tablet responsive layout — panel defaults, overlays, toolbar toggle, scroll fixes (2026-07-22) ✅

**Problem:** The dashboard was desktop-only — fixed at 152px chrome, 256px sidebar, no breakpoint handling. On mobile/tablet (< 1024px) the chart had ~223px of usable space and panels overflowed or clipped.

**Changes — `useMediaQuery` hook (new):**

- `apps/client/src/hooks/useMediaQuery.ts` — generic `matchMedia` hook used by `DashboardPage` for mobile breakpoint detection.

**Changes — `DashboardPage.tsx` (layout orchestration):**

- **TradingPanel starts closed on mobile**: `useState` seeded with `matchMedia('(max-width: 1023px)')` — defaults `tradingPanelOpen = false`.
- **OrderAccountMgmt starts collapsed on mobile**: `panelSize` seeded as `'collapsed'` (36px header) instead of `'open'` (208px).
- **LeftToolbar starts collapsed on mobile**: `leftToolbarOpen` defaults to `false`.
- **TradingPanel full-width overlay on mobile**: uses `x` translation (`0 → '100%'`) with `absolute inset-0 w-full` so the panel slides in from the right at full viewport width. Desktop unchanged (`width: 0 → 256`).
- **LeftToolbar collapsible**: wrapped in `motion.div` with `width: 44 ↔ 0` animation. Toggle controlled by hamburger button in SymbolBar.
- **Footer**: on mobile (`< 640px`) — `flex-col` with `flex-wrap` links (2-column layout). Desktop unchanged — single-row `h-7`.

**Changes — `SymbolBar.tsx`:**

- Added `leftToolbarOpen` / `onToggleLeftToolbar` props + hamburger `Menu` button (visible on `< lg`, `lg:hidden`).
- Added `overflow-x-auto scrollbar-none` to SymbolBar outer div — all items (Trade button, timeframe picker, etc.) scrollable on mobile.

**Changes — `LeftToolbar.tsx`:**

- Arrow dropdown indicators: converted from inert `<span>` to `<button>` with `onClick` + `e.stopPropagation()` — left-click opens tool submenu (no right-click required). Cursor variant arrow similarly wired. Right-click still works as fallback.

**Changes — `OrderAccountManagementPanel.tsx`:**

- **Tab bar**: added `overflow-x-auto scrollbar-none` — tabs scroll horizontally when they overflow.
- **Content area**: both outer wrapper (line 1105) and motion wrapper (line 1113) changed from `overflow-hidden` to `overflow-x-auto overflow-y-hidden` — enables horizontal scroll for table content on narrow viewports.

**Gates:** type-check ✅, lint ✅, test (371) ✅, format ✅

---

### feat: launch content sweep — live mode, copy reconciliation, live-chart CTA, legal rewrites (2026-09-24) ✅

**Problem:** The app was live in production but the site didn't reflect it — `VITE_IS_LIVE` was never set in `.env.production`, Landing/Features copy undersold the indicator system (only named EMA9/20/200, VWAP, MACD when the catalog had grown to 9) and still called drawing tools "under active development" despite them shipping, the public `/chart` demo wasn't linked from anywhere on the marketing site, and the Privacy Policy still described paper-trading data as browser-only when server-side sync had shipped weeks earlier.

**Changes:**

- `apps/client/.env.production` — added `VITE_IS_LIVE=true`.
- `LandingPage.tsx` / `FeaturesPage.tsx` — reconciled indicator/drawing-tools copy with what's actually shipped; added a "Try it live, no signup" sticky banner on Landing linking to `/chart`.
- `robots.txt`, `sitemap.xml`, `ChartPage.tsx` `SeoHead` — surfaced `/chart` for crawlers with accurate title/description.
- `PrivacyPage.tsx` — rewrote the "Paper trade history" data-storage section (now correctly describes server-side Postgres sync, not browser-only) and the Section 8 localStorage description that contradicted it. Version 1.1 → 1.2.
- `SecurityPage.tsx` — added a Database Security paragraph (Postgres + Prisma parameterized queries; no network-isolation claim, since that couldn't be verified). Version 1.0 → 1.1.
- `AcceptableUsePolicyPage.tsx` — version/date synced to 1.1 (no content changes needed).
- `LegalLayout.tsx` — removed the "Phase 1 active development" banner from all 4 legal pages.
- `README.md`, `docs/SEO_READINESS.md` — refreshed stale claims (root `/` still described as `UnderConstructionPage`; newsletter CTA marked not-done despite being wired).

**Gates:** type-check ✅, lint ✅, format ✅, test (510) ✅, both builds ✅

---

### fix: 8 correctness bugs found via independent code review (2026-09-24) ✅

An independent-reviewer pass (`/code-review`, later formalized as the `code-reviewer` subagent) over the accumulated diff surfaced 8 real bugs, none previously caught:

- **Auth refresh-token race** (`apps/server/src/routes/auth/index.ts`) — `wasRecentlyRotated()`'s grace-window entry was only set after the winning `deleteMany` resolved, but two concurrent `/refresh` requests' promises resolve independently — no guarantee the winner's continuation ran before the loser's check. Could misclassify a benign double-tab race as a replay and revoke every session. Fixed by serializing same-token requests through an in-process lock. Added a genuine-concurrency regression test (existing tests only simulated the race sequentially).
- **Drawing-persistence data loss on symbol switch** (`ChartPanel.tsx`) — `prevSymbolRef` wasn't updated until after `clearAll()`/`restoreDrawings()` fired their save events, so a debounced save could overwrite the just-saved backup with the wrong symbol's data.
- **Multi-pane debounce collision** (`drawingManager.ts`) — `persistTimers` was keyed by symbol string, shared across all panes; two panes on the same symbol would cancel each other's pending save. Rekeyed to the `DrawingManager` instance.
- **Time-range preset fights live ticks** (`ChartPanel.tsx`) — the preset effect depended on `bars` (new reference every tick) and re-applied `setVisibleRange` unconditionally, yanking the view back to "now" and undoing any manual pan. Now respects `userZoomedRef` like the sibling autoscale effect, only forcing the snap when the preset/interval itself changes.
- **One corrupted drawing wiped the whole saved set** (`drawingManager.ts`) — `restoreDrawings` imported the whole batch in one try/catch; now imports entries individually and skips only the bad one.
- **4 indicator primitives always left the newest bar blank** (`median-price-calculation.ts`, `average-price-calculation.ts`, `percent-change-calculation.ts`, `weighted-close-calculation.ts`) — off-by-one in `endIndex` (`data.length - 1` instead of `data.length` for non-negative offset). Also removed a leftover `console.log` firing on every tick in `average-price-calculation.ts`. Added regression tests for all 4.
- **MACD widget badge always showed "9"** (`IndicatorWidget.tsx`) — read `params.signal`, catalog's actual key is `signalLength`.
- **Candlesticks corrupt after a symbol switch once a pane has full history** (`ChartPanel.tsx`) — the bars-push effect's `.update()` vs `.setData()` decision compared bar-array length to the previous render's length, reset on interval change but not symbol change. Since history is capped at 1000 bars for every symbol, a post-switch array commonly lands at the same length as the old one — a coincidence, not an edge case — wrongly taking the `.update()` splice path and corrupting the chart until the interval changed or the page reloaded. Fixed by tracking the symbol separately and forcing a full `setData()` on a symbol change too.

**Gates:** type-check ✅, lint ✅, format ✅, test (510, +11 new regression tests) ✅, both builds ✅

---

### feat: persistent chart/dashboard nav on Landing/Features (2026-09-24) ✅

**Problem:** No way to jump straight to `/chart` (or `/dashboard` if logged in) from the marketing pages short of scrolling to a CTA button.

**Changes:** Extended `TopBar.tsx` (the dashboard header) with a `marketing` prop instead of building a parallel component — same visual shell (logo, wordmark, Beta badge), but sticky, and the right side swaps the account menu for a single "Live Chart" / "Dashboard" CTA driven by `accessToken` presence. Rendered as a sibling above `AuthLayout` in `LandingPage.tsx` and `FeaturesPage.tsx` (not inside `AuthLayout`, which is also shared by the 4 auth pages that shouldn't get this nav). `FeaturesPage.tsx`'s own sticky anchor sub-nav moved from `top-0` to `top-12` to dock below the new bar instead of overlapping it.

**Gates:** type-check ✅, lint ✅, format ✅, test (510) ✅

---

### chore: TVP rename, code-reviewer subagent, obsolete plan-doc cleanup (2026-09-24) ✅

- **TradingView → TVP**: replaced all literal "TradingView" mentions in comments/docs/skill files with "TVP" (internal shorthand) across 27 files. The 3 real external references in `docs/TV_LICENSE_MIGRATION_PLAN.md` (actual tradingview.com URLs and the `tradingview/charting_library` GitHub repo path) were left untouched, since rewriting them would point to nonexistent resources.
- **`code-reviewer` subagent**: added `.claude/agents/code-reviewer.md` — an independent reviewer scoped to bugs/security/regressions, no context on how the code was written. Updated `claude-code-review.yml` to run the same persona in CI instead of the broader `/code-review` plugin checklist; switched to `gh pr diff` for the diff itself (works regardless of checkout fetch-depth).
- **Removed 3 fully-implemented/obsolete plan docs**: `docs/LANDING_FEATURES_PLAN.md` (Landing + Features pages fully shipped, including past what the plan specified), `docs/INDICATORS_PLAN.md` (doc's own Status line already said "Done"), `docs/TV_SWEEP_PLAN.md` (no longer needed). Cleaned up the now-dangling `LANDING_FEATURES_PLAN.md` reference in the `launch-readiness-audit` skill.

**Gates:** type-check ✅, lint ✅, format ✅, test (510) ✅

---

### fix: Cloudflare Web Analytics reporting 0 visits — CSP connect-src (2026-09-25) ✅

**Problem:** CFWA dashboard showed 0 visits / 0 page views. Two causes:

1. **CSP blocked the beacon's reports.** `script-src` allowed `static.cloudflareinsights.com` (so the beacon _loaded_ — which is what the 2026-06-26 "200 OK" check confirmed), but `connect-src` only allowed `'self'` + the API, so the beacon's POST to `https://cloudflareinsights.com/cdn-cgi/rum` was silently blocked. No data ever reached CFWA.
2. **Beacon not injected on the live site.** `curl https://cryptopapertrade.com/` shows no `beacon.min.js` tag. The frontend is Cloudflare Pages (deployed via `wrangler pages deploy`); Pages only injects the beacon into deployments made _after_ Web Analytics is enabled on the Pages project itself (Workers & Pages → project → Metrics → Web Analytics). Dashboard action, no code.

**Changes:** `cspConnectSrcPlugin` (`apps/client/vite.config.ts`) now appends `https://cloudflareinsights.com` to `connect-src` — exact origin, no wildcard. Comments updated in `vite.config.ts` and `index.html`. No legal-page change: CFWA was already disclosed (Privacy §8–9, Terms §10).

**Note:** the Analytics → Dashboards "Traffic overview" view is edge HTTP request data (bots, crawlers, asset requests, own traffic), not visitors — use Web Analytics for human-visitor numbers.

**Fallback if Pages injection doesn't appear after redeploy:** add CFWA's manual JS snippet (site token from Web Analytics → Manage site) to `index.html`; CSP already covers it.

**Gates:** audit ✅, type-check ✅, lint ✅, format ✅, test (510) ✅, client build ✅ (`dist/index.html` connect-src verified)

---

### infra: CFWA enabled on Pages, www → apex redirect, Search Console + Bing (2026-09-25) ✅

Dashboard-only changes following the CFWA CSP fix (#121/#122):

- **CFWA enabled on the Pages project** (Workers & Pages → project → Metrics → Web Analytics). Pages only injects the beacon into deployments made _after_ enabling. Verified live after the #122 deploy: `beacon.min.js` + `data-cf-beacon` token present, browser shows `rum` OPTIONS 200 + POST 204, no CSP violations.
- **Redirect Rule: www → apex (301)** — Rules → Redirect Rules, template "Redirect from WWW to root": `https://www.*` → `https://${1}`, 301, **Preserve query string ON** (keeps UTM params). The "DNS may not be proxying www" deploy warning was a false positive (www is a Pages custom domain, resolves to Cloudflare IPs) — deployed anyway; do **not** create a second www record. Verified: `https://www.…/features?utm_source=test` → 301 → `https://cryptopapertrade.com/features?utm_source=test`; apex 200; `api.` unaffected. `http://www` takes 2 hops (Always Use HTTPS → then this rule) — acceptable.
- **Google Search Console** — Domain property `cryptopapertrade.com`, verified via DNS TXT in Cloudflare. **Keep the `google-site-verification` TXT record** — removing it revokes access. Sitemap must be submitted as the **full URL** `https://cryptopapertrade.com/sitemap.xml` (Domain properties have no path prefix; `sitemap.xml` alone is rejected).
- **Bing Webmaster Tools** — _pending_: import from Search Console (covers DuckDuckGo/Yahoo/Ecosia/ChatGPT search). Optional: Caching → Configuration → Crawler Hints ON for IndexNow.
- **Reminder:** Analytics → Dashboards "Traffic overview" is edge request data (bots, assets, own traffic), not visitors — use Web Analytics for human numbers.

**No files changed.**

---

### chore: `add-page` skill + move project skills to `.claude/skills/` (2026-09-25) ✅

**Problem:** Adding a page has several easy-to-forget manual steps (static `sitemap.xml`, `SeoHead` canonical/`noIndex`, internal links, CSP/legal impact, Search Console indexing request). Separately, project skills lived in `.agents/skills/` (a cross-tool location for ZCode/Codex), which Claude Code doesn't scan — it only auto-loads `.claude/skills/`. Claude Code is the only tool in use.

**Changes:**

- **New skill `.claude/skills/add-page/SKILL.md`** — 9-step checklist: classify the page (public-indexable / transactional / authenticated / admin), process gates, route + lazy import + layout + `SeoHead`, sitemap/robots/internal links, legal & CSP impact, tests, APP_LOG/SEO_READINESS + PR, post-deploy indexing (Search Console URL Inspection, Bing/IndexNow), and rename/remove via `_redirects` 301. Includes a "known site-wide gaps" list (no prerendering, SVG `og:image`, soft-404 catch-all) to delete items from as they're fixed.
- **Moved all 16 existing skills `.agents/skills/` → `.claude/skills/`** (`git mv`, history preserved) and removed `.agents/`. Claude Code now auto-loads all 17 project skills, each invocable as `/<name>`.
- **All path references updated** (`.agents/skills` → `.claude/skills`): `CLAUDE.md`, `AGENTS.md`, all `.claude/conventions/*.md`, `.claude/hooks/session-start-context.py` (SessionStart context), `.husky/pre-commit` (bug-sweep hint), skills cross-references, and current-state lines in this log. Historical log entries that mention the old path describe past state and were updated too, so the log has no dead paths.
- `session-bootstrap` task-specific list and `.claude/conventions/README.md` now point to `add-page`.

---

### fix: candlesticks rendered as full-height vertical bars — frozen price scale (2026-09-25) ✅

**Symptom:** Sometimes, and on every pane at once, each candle and indicator line (EMA/VWAP)
filled the full pane height. The price axis had collapsed to a window of about 0.1 USDT around
the last price. It was most common in split layouts and after switching symbol or interval. A
page refresh fixed it.

**Root cause** (`ChartPanel.tsx`). Two defects combined:

1. **The view opened on empty future space.** After a data load the chart called
   `timeScale().scrollToRealTime()`. The time scale's "real time" end is the last bar of the
   invisible 200-bar padding `LineSeries`, not the newest candle. When the pane is narrower than
   about 200 bars (split layouts, higher intervals), the view held only padding and zero
   candles.
2. **The price axis froze on whatever one frame saw.** The right price scale was created with
   `autoScale: false`. After a load, autoscale was turned on for a single
   `requestAnimationFrame` and then off again. With (1), that frame saw only the flat padding
   line (all at `lastClose`), so the axis collapsed to `lastClose ± ~0.06` and stayed there.
   Scrolling back to the candles showed them as full-height bars. The WebSocket's 2–9-bar
   startup snapshot (1m bars are often O=H=L=C) arriving before REST history could produce the
   same flat frame.

Autoscale had been turned off in `2e91530` because drawings were stretching the axis. The base
drawing class in `lightweight-charts-drawing` implements `autoscaleInfo()` from its anchor prices,
whatever time range is visible.

**Fix:**

- **Scroll to the newest candle.** `scrollToRealTime()` is replaced with
  `scrollToPosition(RIGHT_GAP_BARS - PADDING_BARS)`, which puts the newest candle 5 bars from
  the right edge.
- **Autoscale stays on.** The one-frame pulse is removed. Dragging the price axis turns autoscale
  off (built into lightweight-charts), and double-clicking the axis turns it back on. First load,
  reload and out-of-range still re-apply `autoScale: true`.
- **Padding line excluded.** The padding series has `autoscaleInfoProvider: () => null`.
- **Drawings excluded.** Every drawing is opted out of autoscale by overriding `autoscaleInfo`
  on `drawing:added`. The listener is subscribed before `restoreDrawings`, so persisted drawings
  are covered too.
- **Time-range sync is limited to panes on the same interval** (`lib/chartSync.ts`
  `isTimeSyncPeer`, used by `MultiChartArea.tsx`). A cross-interval matrix test found a second giant-candle path: sync copied a
  1m/30m pane's few-hour window onto a 4h/1D/1W/1M pane, which then showed 0–1 candles stretched
  across the whole pane. Panes on different intervals now keep their own zoom. This was the
  owner's decision (the alternative was capping bar spacing).
- **Only a pane whose history has loaded may drive time-range sync** (`lib/chartSync.ts`
  `canDriveTimeSync`, new `paneStore.historyLoaded` set by `usePaneFeeds` on REST success).
  Right after a pane mounts (layout change) or switches symbol or interval, it briefly shows the
  WebSocket startup snapshot or the previous symbol's bars. Its visible time range is then a few
  minutes wide, a single instant, or entirely in the future padding. Sync broadcast that range,
  and the async echo (which lands after the `isSyncingTimeRange` guard has reset) zoomed every
  peer, including fully loaded ones, into a handful of giant candles (50–100px per bar),
  permanently. Two reproductions:
  - switching 3 same-interval panes 2h → 4h
  - the owner's report: changing layout 1 → 2h with two 1m panes

  The first version of this guard used a bar-count threshold (at least 10 bars). It passed on a
  fresh server but failed in the owner's session: the startup snapshot keeps growing with server
  uptime (12 bars after 12 minutes, about 60 after an hour), so no count can tell it apart from
  real history. The rule is now:
  - the pane's REST history has loaded (`historyLoaded`)
  - the chart series has caught up with the store (store updates first)
  - the range is non-degenerate and overlaps the pane's candles

- **No sync broadcasts from a pane mid data-push** (`lib/chartSync.ts` `runPaneDataPush`,
  wrapping `ChartPanel`'s setData → padding → restore/anchor block). Found by a transition
  matrix over all 20 ordered layout pairs × 10 intervals: 9 of 200 transitions (1m and 5m)
  still ended at 40–50px per bar. A trace of every time-scale call showed the cause.
  lightweight-charts fires visible-range events synchronously inside `setData()`. When REST
  history replaced a few-bar snapshot, that event carried the transitional ~16-bar view, and by
  then the pane already passed every source check. It was broadcast, and peer echoes overwrote
  the pane's own anchor before it was painted.
- **MACD sub-pane.** `macd.ts` used the same pulse-and-freeze pattern on its own price scale.
  The rAF that turned autoscale off is removed.
- **Regression tests:** `components/dashboard/__tests__/ChartPanel.priceScale.test.tsx`
  (5 tests), `lib/__tests__/chartSync.test.ts` (13 tests) and
  `store/__tests__/paneStore.test.ts` (4 tests).

**Verification:** a Playwright harness (Chromium, scratch script, not committed) drove the
running dev app through every layout (1, 2h, 2v, 3h, 4) × interval (10) × symbol (9). Each pane
got a different symbol, and runs covered both all panes on the same interval and mixed intervals
with time-range sync on: 900 combos. For every pane it checked that the price axis contains its
visible candles without collapsing (at least 90% of the candle range), that at least 2 candles
are in view, and that the pane shows the requested symbol's data.

- **Final code:** 0 axis failures and 0 zoom failures across all 900 combos. 39 combos first
  failed on 429s from the 100 req/min rate limit (stale data); all 39 passed on a slow-paced
  re-run.
- **Old code (negative control):** 36/36 of a 2h/3h × 1m/4h slice failed. Panes were parked on
  the padding with 0 candles, and the axis covered only 17–35% of the candle range: the reported
  full-height bars. The same slice on the fixed code: 0/36.
- **Drawings:** saved trendlines at 3× and 0.2× the price stretched the old axis to 155× the
  candle range. After the fix it's 1.00×.

**Layout-change verification** (added after the owner reported giant candles when changing
layout; the first matrix changed layout together with symbol/interval, which reloaded every pane
and hid this path). Every ordered layout-to-layout transition (20 pairs, as a single sequence)
× 10 intervals, with layout the only change:

- **Final code:** 0/200 transitions with giant candles (>25px per bar) or an empty pane.
- **Old code:** 22/40 (1m and 5m).

The symbol × interval matrix was re-run on the final code: 900 combos, 0 axis or zoom failures.
All 38 rate-limit failures passed on a slow re-run.

**Follow-up (separate issue, not fixed here):** when a symbol switch's REST history call gets a
429 (100 req/min per IP, reachable by switching quickly across 4 panes), the pane keeps showing
the previous symbol's candles under the new symbol's header until a retry succeeds.

**Gates:** type-check ✅, lint ✅, format ✅, test ✅

---

### feat: chart candles match Bybit — Spot history, wider candles, Heikin Ashi chart type (2026-09-25) ✅

**Trigger:** the owner compared CPT with Bybit (BTC/USDT, 1m, same layout). Bybit's candles
looked cleaner and more solid, with longer wicks and no gaps. Analysis found three causes:

1. **Bybit's chart was set to Heikin Ashi** (its legend reads "Heikin Ashi"). That's a smoothed
   candle type: 43 colour flips per 200 bars against 89 raw, with a larger wick share (50% vs
   40%). CPT only drew raw candles.
2. **History came from the perpetual market.** `BYBIT_KLINE_CATEGORY_ORDER` was
   `['linear', 'spot']`, while the live WebSocket is spot. CPT history equalled Bybit linear
   exactly and was about $39 per candle off Bybit **Spot** (Bybit Parity finding F1).
3. **Thin candles.** 1m and 5m used 3px bar spacing (about 2px bodies) against about 8px on
   Bybit. Raw 1m data has no real gaps (open = previous close for 199/199 bars); the "gaps" were
   horizontal spacing.

**Changes:**

- **Server** `routes/market/index.ts`: history category order is now `['spot', 'linear']`. The
  tests were flipped to "spot first, linear fallback". The full Spot/Perp switch stays in BP-0.
- **`lib/markets.ts` `INTERVAL_BAR_SPACING`:** 1m through 2h go to 7px, 4h 8, 1d 9, 1w/1M 8
  (Bybit-like density, the owner's choice). They are still applied only on
  load/reload/out-of-range, so user zoom is kept.
- **Heikin Ashi chart type:**
  - `lib/heikinAshi.ts` is a pure `toHeikinAshi()`, converting the whole series, since each HA
    bar depends on the previous one.
  - Per-pane `chartType: 'candles' | 'heikinAshi'` in `layoutStore`. Persist v2 → v3 migration;
    `merge` rejects unknown values.
  - New `ChartTypeDropdown` in the top bar, beside the interval dropdown, bound to the active
    pane.
  - `ChartPanel` feeds HA bars to the candle series. Switching type forces a full `setData` and
    keeps the zoom.
  - Indicators compute on HA prices, as on Bybit/TradingView (the owner's choice). They read
    `source.data()`.
  - **The real price stays visible:** in HA mode the series' own last-value label (which would
    show the HA close) is hidden, and a price line shows the real last close. Orders, fills and
    PnL are unchanged; they use store prices.
  - The legend shows "· Heikin Ashi".
- **Tests:**
  - `heikinAshi.test.ts` (5)
  - `layoutStore.test.ts` (+4: action, v3 migration, merge validation)
  - `ChartPanel.priceScale.test.tsx` (+2: HA series values, real price line / default candles)
  - server `market.test.ts` (2 flipped)

**Verification (running app vs Bybit's public API):**

- **Spot match:** CPT history equals Bybit Spot (max |Δclose| 0.000000) for BTC, ETH, SOL, LINK
  and DOGE at 1m/5m/1h/1d.
- **HA match:** the chart's HA series equals HA computed independently from Bybit Spot klines
  (max |Δ| 0.000000 over 50 bars).
- **Real price:** in HA mode the price line shows the real live price, and switching back
  restores the real candles and the series label.
- **Spacing:** first load gives 7/7/7/8/9px for 1m/5m/1h/4h/1d.- **Regression check with the new spacing and chart type:**
  - layout-transition matrix: 0/200 transitions with giant candles or an empty pane
  - symbol × interval matrix with every pane in Heikin Ashi: 450 combos, 0 axis or zoom
    failures. The 21 rate-limit failures all passed on a slow re-run.

---

### feat: Bybit Parity BP-0 — per-market data feed (Spot + USDT Perpetual) (2026-09-26) ✅

**Context:** phase 1 of the Bybit parity work ([reference](#-bybit-parity-bp-0--bp-5--reference)). Each market now reads history, live candles and
quotes from its own Bybit category (`spot` / `linear`). The BP-1 server engine needs this feed. No
market switch yet (BP-2), so every pane is `spot` and trading is unchanged.

**Findings closed:**

- **F1:** history no longer falls back from one category to the other. `/candles` takes
  `category` (schema enum, default `spot` for old cached clients) and makes one upstream call.
- **F2 (confirmed live):** spot `tickers` has no `bid1Price`/`ask1Price`, so `parseTicker` dropped every
  spot update and no `ticker` message ever reached the client. The Sell/Buy buttons were running on
  `latestPrice` and the spread badge showed `—`.
  - The `orderbook.1` feed described in the 2026-04-19 entry had since been replaced by `tickers`.
  - Spot now subscribes `orderbook.1` again and merges its best level into the ticker state.

**Changes:**

- **Server**
  - `BybitWebSocketManager(useTestnet, category)`: builds the `/v5/public/{category}` URL.
  - `subscribeMany()` sends ≤10 args per request. Bybit spot rejects more ("args size >10",
    checked live).
  - Ticker state is merged per field, so linear deltas that carry only bid/ask keep mark/funding.
  - A ticker is emitted as soon as `lastPrice` is known, with `bid`/`ask` null until the first quote.
    Updates that change no price (most book-size pushes) are dropped.
  - `plugins/bybit.ts`: one manager + `CandleAggregator` per category. Snapshot and indicator keys
    are `category:symbol:interval`, and `LiveBar`/`TickerUpdate` carry `category`.
  - `getTicker()` returns the latest quote, which `/ws` sends on connect. It is cleared when the
    category's stream disconnects.
  - `/ws` takes an allow-listed `category` (1008 otherwise).
  - New `services/BybitMarketInfo.ts` backs `GET /api/market/instruments?category=` (tick size, qty
    step, min qty/notional, max leverage, funding interval) and `GET /api/market/risk-limit?symbol=`
    (linear tiers).
    - Both cache 6 h and coalesce concurrent requests.
    - A failed refresh serves the stale value when one exists; with no value, the route returns 502
      with no upstream text.
- **SDK**
  - New `MarketCategory`, `TickerMessage` (nullable bid/ask plus optional mark/index/funding),
    `Instrument`, `RiskLimitTier` and their response types.
  - `getCandles` and `wsUrl` take `category` (default `spot`); new `getInstruments` and `getRiskLimit`.
- **Client**
  - `PaneConfig.category`, with `cd-layout` v3 → v4 migration; `merge` rejects unknown values.
  - Symbol sync (`setPaneSymbol`, `toggleSync`) also syncs category. New `setPaneCategory`, not
    wired to any UI yet.
  - `paneStore.setTicker` replaces `setBidAsk`: a null side keeps the last value, and it stores
    `markPrice`/`indexPrice`/`fundingRate`/`nextFundingTime`.
  - `lastKnownPrices` is keyed `category:symbol` through `setLastKnownPrice`/`getLastKnownPrice`
    (default spot).

**Deliberate deviation from the plan:** D7 says existing layouts move to `linear`. That move is
deferred to BP-2 (see the plan's BP-0 notes). Without a switch, returning users would silently get
perp charts with no way back.

**Tests:**

- server: `BybitWebSocketManager.test.ts` +13, `market.test.ts` +16 (the fallback test replaced)
- client: `layoutStore.test.ts` +9, `paneStore.test.ts` +8
- `TRADING_TEST_PLAN.md` gains Section 12

**Verification (running app vs live Bybit, 2026-09-26):**

- **Spot WS:** tickers now carry bid/ask (83969.9 / 83970).
- **Linear WS:** carries mark/index/funding (`fundingIntervalHour` 8).
- **Invalid category:** closed with 1008.
- **History:** linear and spot 1m history differ by the expected basis (~$40).
- **Instruments and risk-limit:** match Bybit. BTCUSDT tier-1 MMR is **0.33%**, not the plan's 0.5%.

**Gates:** type-check ✅ (server + client), lint ✅, format ✅, test ✅ (154 server + 435 client),
audit ✅ (11 moderate, none high)

---

### feat: Bybit Parity BP-1 — server trading engine (2026-09-26) ✅

**Context:** phase 2 of the Bybit parity work (D9, F10, F11). Before this, every trade ran in the browser
(`paperStore.ts` + `useTPSLMonitor` / `usePendingOrderMonitor`) and the server stored whatever the browser sent,
including balances, fill prices and PnL. As a result:

- nothing was watched while the tab was closed;
- only symbols open in a pane were checked;
- persisted local state leaked into the next user's account after logout.

**Agreed:** port the engine plus four safety fixes (S1–S4), one PR with no fallback flag, and start fresh (the
browser-only journal, balance history and leverage are not imported). Details → the retired parity plan in git history (`8d40f88:docs/BYBIT_PARITY_PLAN.md`), BP-1.

**Server** (`apps/server/src/trading/`):

- **`engine/`:** a pure port using Decimal; the same ids, journal text and balance-history text.
  - Covers market with netting and flip, close, limit / stop, cancel / edit / exit legs, fills, notes and reset.
  - `evaluateTick` (live: tick price, S3) and `evaluateCandle` (backfill: candle sweep that skips pre-placement
    candles).
- **Changes to the DB** (`AccountRepository`):
  - One transaction per action, with an optimistic `Account.version` guard and up to 3 retries.
  - Legacy rows are addressed by `refId`.
- **`TradingService`:**
  - Intent → server live price (spot) → engine → persist → `PaperEventBus`.
  - A per-user queue, and triggers re-validated before they execute.
- **`MatchingEngine`:**
  - A per-symbol index of accounts with open triggers, kept current from committed deltas.
  - A single executor via the `EngineLease` row (no raw SQL).
  - Gap and downtime backfill from spot 1m klines.
- **Routes** (`routes/paper`):
  - Intent-only endpoints, `GET /state`, and the private WS `/api/paper/ws`.
  - The WS uses first-message JWT auth, caps, a size guard, an Origin check and ping/pong. Every delta carries the
    account version.
  - The client-computed endpoints are removed.
- **Prisma migration** `20260926090000_bp1_server_engine`:
  - `Account.leverage` / `version`, `Order.leverage`, and `seq` ordering columns.
  - `Trade.grossPnl`, and `pnlPercent` widened to `Decimal(12,4)` (S4).
  - New `JournalEntry`, `BalanceEvent` and `EngineLease` tables.

**Client:**

- **`paperStore`:** now a read model — `hydrate`, `applyDelta` (version-gated, idempotent) and `clear`.
  - Actions send intent and never throw into the UI.
  - No persistence: `cd-paper-trading` is deleted, and the store is cleared on logout, user change, password change
    and deletion.
- **New hooks:**
  - `usePaperFeed`: the private WS; plays the server-decided sounds once.
  - `useSessionRefresh` + `lib/session.ts`: the access token was only refreshed at boot, so authenticated calls failed
    after 15 minutes. It now refreshes 60 s before expiry and after a 4401.
- **Removed:** the two monitors.
- **Component changes:**
  - `TradingPanel`: one async submit shared with the SL/TP confirm modal, with a double-submit ref guard. No price is
    sent for a market order, and server errors are shown.
  - `OrderAccountManagementPanel` / edit panels: await the calls; sounds now come from the server.

**Found along the way:** `app.ts` set the sanitizing error handler after registering the routes, so any route that let
an error escape answered 500s with the raw `err.message`. It now comes before every route, and a test covers it.

**Not done (needs the visual Q&A gate):** a visible "Placing…" state on the submit button.

**Tests:**

- **Server:** 164 engine tests (100 ported store cases plus the monitor cases, with the duplicates removed, plus S1–S3,
  netting and backfill), 23 service tests and 49 route / WS tests.
- **Client:** store and feed tests rewritten; the component tests mock `paperApi` (`src/test/fakePaperApi.ts`).
- **Plan:** `TRADING_TEST_PLAN.md` has a new Section 13.

**Code review (10 findings, all fixed):**

- **Client:** a delta that skips a version resyncs from `GET /state`, instead of leaving a missed change on screen.
- **Engine index:**
  - It subscribes before loading, buffering changes made during the load, and is rebuilt every 30 s, which also picks
    up changes made on another machine.
  - A trigger that didn't execute is refreshed from the DB, or evicted for a deleted account, instead of re-firing on
    every tick.
- **Lease:** renewal is armed before activation, and the downtime backfill runs off the heartbeat path.
- **Backfill:** fetches Bybit's newest-first pages backwards, up to 7 days.
- **Session:** only a 401 / 403 from `/refresh` signs the user out; a network blip or a 5xx retries every 10 s.
- **Migration:** backfills `leverage` for pre-BP-1 pending orders (`round(qty × trigger / margin)`).
- **Actions:** they return their error. A failed note keeps its draft, and a failed pending edit keeps the panel open.
- **First account creation:** an `upsert`, so two tabs opening at once no longer race into a unique-key error.
- **No-op actions** (not found / nothing to change): no write, no version bump, no push.

**Also caught:** the generated `migration.sql` contained two dotenv log lines, which would have failed `migrate deploy`
in production. They're removed.

**Live verification** (running dev server + dev DB + live Bybit feed, throwaway users, now deleted) — 13 of 13
checks pass:

- market fill at the server price, with a forged `price` ignored;
- both tabs get each delta;
- a crossed limit is filled by the engine;
- a crossed TP is auto-closed with the right journal line and sound;
- a fill made while no tab was open appears on reconnect;
- `/state` history;
- manual close;
- another user sees nothing and gets 404 on the first user's ids;
- an invalid WS token closes with 4401.

**Gates:** type-check ✅ (server + client), lint ✅, format ✅, test ✅ (395 server + 293 client + 57 hook), audit ✅
(11 moderate, none high)

### feat: Bybit Parity BP-2 — Spot and USDT Perpetual, Bybit fees and fill prices (2026-09-26) ✅

**Context:** phase 3 of the Bybit parity work (D1–D8, F3–F9). All leveraged trading was one flat-fee market
filled at the last price, with account-wide leverage and shorting on everything. Planned with a subagent, then the
owner answered 15 planning questions and a 10-question visual gate (plan and answers in
`~/.claude/plans/bp2-market-split.md`; decisions in the Bybit Parity reference section). One PR.

**Two markets:**

- **Spot:** a coin balance per asset next to the one USDT wallet; 1×, no shorting (F8); market and limit orders; TP /
  SL as an OCO pair of conditional sells that lock the coins (on a buy, or on coins held).
- **USDT Perpetual:** what all pre-BP-2 trading became (D7 — column default `linear`); per-symbol leverage, locked
  while the symbol has open trades; isolated margin.

**Server:**

- `bybitSpec.ts`: VIP-0 fee rates, Bybit's documented rejection wording, qty-step / tick / minimum checks, and a
  dated fallback of mainnet instrument rules.
- **Engine:** `draft.ts` (shared working copy — now tracks coin balances), `actions.ts` (USDT Perpetual: fees on
  notional, stored entry fees and reserves, crossing limits fill now as taker, per-symbol leverage), `spot.ts`
  (spot accounting, fees in the received asset, average cost, OCO legs), `triggers.ts` (per market; last-price
  triggers, fill decided by `executeTrigger`: resting limit at its price, stop / TP / SL at the ask / bid).
- **TradingService:** fills on the server's live quote — buys at the ask, sells at the bid — and refuses a quote
  older than 10 s. The Bybit manager now records when each market's quote was last _seen_.
- **MatchingEngine:** indexed by `category:symbol`; linear ticks now drive USDT Perpetual; gap detection and backfill
  per market.
- **Routes:** `category` + size (`qty` / `value`, or a pre-BP-2 `usdtAmount`) on orders and edits, `PATCH
/symbols/:symbol/leverage`, `POST /spot/exits`; Bybit-rule refusals answer 422 and write nothing. The private WS
  also pushes live prices of the markets an account holds (≤ 1/s, changes only).
- **Migrations:** `bp2_linear_fees` (categories, stored fees / reserves backfilled at 0.07%, position leverage from
  qty × entry / margin, `SymbolSetting`) and `bp2_spot` (`SpotBalance` with a non-negative CHECK, `Order.ocoGroup`).
  Verified on a scratch DB with pre-BP-2 rows.

**Client:**

- **Market URLs** (`lib/marketRoutes.ts`, `hooks/useMarketUrlSync.ts`): `/dashboard/spot/BTC/USDT`,
  `/dashboard/usdt/BTCUSDT`; bare `/dashboard` redirects. The URL follows the active pane both ways, deep links
  survive sign-in (allow-listed 🔐), and the page-transition key groups every dashboard URL so switching market or
  symbol never remounts the dashboard. Authenticated + noindex; `robots.txt` already disallows `/dashboard`.
- **Header Trade ▾ menu** (`TradeMenu.tsx`) and in-panel Spot | USDT Perpetual tabs; "Spot" / "Perpetual" subtitle
  on the pair.
- **TradingPanel:** Amount as BTC or USDT with a 0–Max quick fill, per-market summary rows (perps: value, margin,
  open / close fee estimates, cost; spot: value, fee in the received coin), `1x ▾` leverage chip + modal
  (`LeverageChip.tsx`), no Stop tab or sell TP / SL on spot, Bybit minimum checks from the instruments cache.
- **Bottom panel:** Assets tab on Spot (`AssetsTable.tsx`, with Sell prefill and a TP / SL modal), Positions on USDT
  Perpetual; Orders / Order History filtered to the active market; fee + rate / liquidity per fill; leverage removed
  from Account Settings.
- **Stores:** `paperStore` gains spot balances, per-symbol leverage and a size-based `placeOrder(OrderRequest)`;
  `layoutStore` v5 (`setPaneMarket`, the one-time D7 hand-off); `COMMISSION_RATE` and the hard-coded lot steps are gone.

**Found along the way:**

- A navigation from a component's first layout effect is lost (the router listens in its own, later layout effect),
  so a lowercase deep link would never have been normalised — moved to a passive effect, covered by a test.
- Spot TP / SL legs showed "—" as their price in the Orders tab.
- The 256px panel can't fit "Isolated · 1x" next to both tabs — the owner chose the short `1x ▾` chip.

**Code review** (independent subagent over the whole diff — no money leaks found; 9 findings, all fixed):

- the pre-BP-2 account-leverage route could change the leverage of a symbol with open trades — changing the default
  now pins the current leverage of every busy symbol, and an edit keeps the order's own leverage;
- a 100% market buy in coin mode was sized at the last price but fills at the ask — previews and Max now use ask / bid;
- a removed TP / SL of a resting spot buy was tagged USDT Perpetual; spot TP / SL placed SL before TP (SL won a
  backfilled candle spanning both, unlike perpetual); a spot sell's proceeds / fee weren't on the 8-decimal grid;
  a resting spot buy's TP / SL skipped the tick check;
- TP / SL edit pencils showed on orders the server won't edit; default limit prices were rounded to 2 decimals
  (DOGE / XRP / ADA limits crossed the book); server price pushes didn't re-render the account panel.

**Tests:** server 508 (engine: `fees.test` and `spot.test` worked-number tables, per-market triggers; services;
routes / WS), client 370 (market URLs and sync, Trade menu, order maths, layout v5, Spot form, Assets tab, login return
path). `TRADING_TEST_PLAN.md` has a new Section 14.

**Live verification** (running dev server + dev DB + live Bybit feed, throwaway users, now deleted) — 22 of 22:
perp fills at the ask / bid; taker 0.055% on notional with the entry fee and close reserve stored; leverage locked by an
open position and set per symbol; resting-limit reserve and exact refund; crossing limit fills now; minimum qty and
off-tick rejections; spot buy at the ask with the fee in BTC; no spot shorting; no spot stops; spot TP / SL OCO lock;
spot sell fee in USDT; snapshot carries spot and leverage; WS prices for held markets only; a pre-BP-2 intent still
trades USDT Perpetual.

**Not in BP-2 (see Bybit Parity known gaps):** same-side positions stay separate; leverage changes wait for BP-3's re-margining;
the ticker bar's static placeholder prices are unchanged.

**Gates:** type-check ✅ (server + client), lint ✅, format ✅, test ✅ (508 server + 370 client), server + client
build ✅, audit ✅ (11 moderate, none high)

### feat: Bybit Parity BP-3 — mark price, one-way positions, isolated liquidation, re-margining, chart lines (2026-09-27) ✅

**Context:** phase 4 of the Bybit parity work (F6, F7). Leveraged positions had no mark price, no liquidation
and no re-margining, same-side fills stayed separate, and the chart drew no trade lines. Owner direction: **mimic
Bybit as closely as possible** (the app will later be tested against Bybit's APIs) — merge same-side fills, re-margin
on leverage change, draw every line Bybit draws (draggable), no grace period at deploy. Visual gate: 8 questions.

**Server:**

- `bybitSpec.ts`: Bybit's UTA isolated-mode maths — fee to close at the bankruptcy price, positionIM / MM, liquidation
  and bankruptcy prices (reproduces Bybit's worked example 36,380.25 exactly), risk-limit tier by position value, and
  a dated tier snapshot (the SDK copy is parity-tested).
- **Engine:** same-side fills merge (one-way mode); `liquidatePosition` (cancel the symbol's orders, close at the
  bankruptcy price, whole margin lost, `BustTrade` / `CreateByLiq`, `'liquidation'` sound); `setSymbolLeverage`
  re-margins the position and the symbol's orders; `evaluateTick` / `evaluateCandle` check liquidation on the mark.
- **MatchingEngine** indexes every open position (not only TP/SL ones), reads the mark from linear ticks, and
  backfills gaps with mark-price klines too. **TradingService** re-checks a liquidation on a fresh (≤ 10 s) mark and
  passes the live mark to re-margining. Risk tiers refresh hourly with the instrument rules.
- Liquidation / bankruptcy prices, positionIM / MM and MMR are derived and sent with every position — not stored.
- **Migration** `bp3_liquidation`: `Position.extraMargin`, `Trade.execType`, `Order.createType`; merges existing
  same-side positions (stored values only, newest TP/SL) and sets each symbol's leverage to its position's. Dry-run on
  real Postgres in a rolled-back transaction.
- **`lib/fetchWithRetry.ts`** (BP-0 follow-up): timeout + bounded retry (network / 429 / 5xx) + a circuit breaker
  per Bybit upstream, on every Bybit REST call.

**Client:**

- Perp PnL / equity at the **mark** price (`lastKnownMarkPrices`, pane mark, server push); Positions tab: Mark Price,
  amber Liq. Price and a Bybit-style **MMR meter** (Last Price / IM / MM opt-in; saved column layouts migrated once,
  `lib/columnPrefs.ts`); Order History labels a liquidation close.
- Order form: **Est. liq. price** (includes the open position, one-way), fee to close at the bankruptcy price,
  "Placing…" submit state. Leverage modal unlocked with a margin / liq-price preview and inline refusals.
- One-time "Positions can now be liquidated" banner with the explainer, a liquidation notice until dismissed,
  ⓘ tooltips, a distinct liquidation sound (Sound Settings entry).
- **Chart lines** (`lib/tradeLines.ts`, `hooks/useTradeLines.ts`): entry with live PnL, TP / SL, liquidation, orders
  and their TP / SL, mark (toggle in the Chart type menu). TP / SL / order lines drag to amend, tick-rounded, sent only
  after a confirm; lines don't take the pointer while a drawing tool is active.

**Live verification** (running dev server + live Bybit feed, throwaway user, deleted after): 10× long 0.01 BTC @ 84,466
→ liq 76,271.09 / bust 76,019.4 / fee to close 0.418 (formula-exact); a second buy merged; 10× → 5× re-margined
(liq 67,796.53, same as the modal's preview) and back to 10× on the live mark; journal and Balance History lines; UI
screenshots of the Positions columns, MMR meter, notice banner, Est. liq. price, leverage preview; a real mouse drag of
the TP line → confirm → server TP 84,600 → 84,635.3. Fixed from the screenshots: the confirm popover clipped at the
chart's top edge; 1 px dashed lines looked dotted (now large dashes).

**Not in BP-3 (Bybit Parity known gaps / follow-ups):** a stop-loss past the liquidation price is accepted (Bybit refuses it);
higher-tier positions liquidate in full; the pre-BP-2 account-leverage route is still served; the API-parity test
against Bybit testnet.

**Tests:** server 545 (Bybit worked example, liquidation, re-margining, merge, mark-candle backfill, engine index,
retry / breaker), client 402 (mark PnL, columns + prefs migration, MMR meter, order-form estimate, notices, Placing…,
leverage preview, chart lines + drag hook). `TRADING_TEST_PLAN.md` Section 15.

**Gates:** type-check ✅ (server + client), lint ✅, format ✅, test ✅ (545 server + 402 client), server + client
build ✅, audit ✅ (11 moderate, none high)

### feat: Bybit Parity BP-4 — funding (2026-09-27) ✅

**Context:** phase 5 of the Bybit parity work (F7's last part). Perpetual positions never paid or received
funding. Bybit's rules checked (help centre, API v5, live endpoints) and copied — owner direction "mimic Bybit".
Visual gate: 4 questions.

**Server:**

- `settleFunding` (pure): fee = size × mark × rate per position held at the timestamp, signed as Bybit (+ = paid);
  paid from the balance, shortfall from the position's margin; realized PnL + position `cumFunding`; a `Funding`
  execution row, journal line and Balance History row; once per account/symbol/timestamp (`SymbolSetting.lastFundingAt`).
- **MatchingEngine funding clock:** per linear symbol from the ticker's `nextFundingTime`; at the timestamp it
  snapshots the positions and the mark, reads Bybit's settled rate from `/v5/market/funding/history` (the ticker's
  announced rate as a fallback), then settles each account through `TradingService.runFunding`. Gap backfill replays
  missed timestamps at the mark-candle open, interleaved with the candle sweep.
- Closes carry their funding share (`Trade.funding`, Closed P&L net of it); funding rows are excluded from the
  closed-trade history and sent as their own list.
- Migration `bp4_funding`: `Position.cumFunding`, `SymbolSetting.lastFundingAt`, `Trade.feeRate` / `funding`, an
  index on `(userId, execType, seq)`. Additive only.

**Client:** MARK · INDEX · FUNDING / COUNTDOWN in the perpetual symbol header (live countdown, rate coloured by who
pays, explanation tooltip); a Funding column in the Positions tab (default on, saved layouts migrated); funding in the
store (`fundings`, `cumFunding`, a close's `funding`). New SDK fields are optional (a pre-BP-4 server sends none).

**Live verification:** the 2026-09-27 08:00 UTC settlement (rate 0.00002285, mark 84,755.02) against the dev DB through
the real service + repository: fee 0.01936652 (exact), second run settled nothing, row out of the closed-trade
history, marker set; header + Funding column screenshotted on the running app (fixed: stat labels wrapped, the ⓘ was
clipped — now a tooltip on the stat). Throwaway users deleted.

**Not in BP-4:** a position closed while the engine was down isn't charged (§8); the app has no closed-trade tab to show
a close's funding share (it's in the data and the export); no est.-funding row in the order form (Bybit has none).

**Tests:** server 563 (settlement maths, idempotency, margin shortfall, closed-after-timestamp, funding share, clock at
the timestamp, rate fallback, backfill ordering, repository rows, history paging), client 412. `TRADING_TEST_PLAN.md`
Section 16.

**Gates:** type-check ✅, lint ✅, format ✅, test ✅ (563 server + 412 client)

### feat: Bybit Parity BP-5 — cross margin, risk tiers, refinements (2026-09-27) ✅

**Context:** phase 6 of the Bybit parity work, one release (O4). Owner decisions O1–O12 answered 2026-09-27;
visual gate answered (all recommended). Bybit's rules checked in the help centre, API v5 and live endpoints.

**Server (engine):**

- **A — add / reduce margin** (isolated): `POST /paper/positions/:id/margin`, signed like Bybit's add-margin;
  leverage unchanged, liq price moves; released on a leverage change, pro rata on a partial close; Bybit's refusals.
- **B — trigger source + order flags:** TP / SL and stops trigger on Last / Mark / Index (live and backfill,
  index-price candles when needed); reduce-only / close-on-trigger (capped, no margin, trimmed furthest-first,
  cancelled with nothing to reduce); TP / SL side check vs the order price or the leg source's live price (O9).
- **C — risk tiers:** 110090 cap on orders / edits / leverage (effective value per Bybit); partial liquidation steps
  a position down the tiers at the bankruptcy price (live and backfill).
- **D — Closed P&L:** `Trade.openFee`; DTO `openFee` / `closeFee` / `closedPnl` + v5 aliases.
- **E — cross margin:** `Account.marginMode` (new accounts cross; existing isolated + `marginModeNotice`); account
  figures (`bybitSpec.accountFigures`, parity-tested with the SDK); orders accepted against the available balance
  (unrealised profit counts, O5); losses and funding from the wallet; account liquidation at a 100% MM rate in
  contract order; `POST /paper/account/margin-mode` with Bybit's switch checks (O3).
- **F — refinements:** funding at a mark within 10 s of the timestamp (else the candle); a late fee lands on the
  closed trade; isolated realized PnL books only what was lost; the backfill charges positions closed during a gap.
- **G — parity:** `trading/bybitParity.ts` adapter + diff; `tools/bybitParity.ts` manual testnet run
  (`parity:testnet`, testnet only, keys never logged) — not run at BP-5; runs nightly in CI since 2026-09-28 (see
  Bybit Parity → Open items).
- **Step 0:** risk tiers carry IMR / max leverage; the pre-BP-2 API logs every call (removal next release, O11).
- Migrations: `bp5_trigger_by_reduce_only`, `bp5_trade_open_fee`, `bp5_cross_margin` (additive; the last sets
  existing accounts to isolated).

**Client:** `Cross 10x` / `Isolated 10x` chip with a mode + leverage modal (tabs, explainer, tier line); cross
figures in the summary bar (Margin balance, IM rate, MM meter), cross liq estimates per position and in the order
form; add / reduce margin dialog (isolated); Last ▾ beside TP and SL, Reduce-only / Close-on-trigger; position TP / SL
checked against the live price with an amber past-liquidation warning; Closed P&L tab; one-time cross notice.

**Live verification (dev, 2026-09-27):** new account = cross; order, cross add-margin refusal, switch to isolated,
add margin, O9 refusal text, SL by mark, reduce-only close (closedPnl −0.3741 = PnL − fees), close-on-trigger capped
with 0 reserved, wrong-side reduce-only refused, switch back (journal line), invalid mode 400. Browser: chip, modal,
summary bar, Closed P&L tab screenshotted; the only console line was the signed-out `/refresh` 401 that
`fix/auth-flow-console-errors` removes. Found and fixed: the order form's cross liq estimate (d9d5420).

**Tests:** server 679, client 439. `TRADING_TEST_PLAN.md` Section 17.

**Gates:** type-check ✅, lint ✅, format ✅, test ✅ (679 server + 439 client)

### fix: zero console errors across register, sign-in, reset and settings flows (2026-09-27) ✅

**Context:** PR #147, released with BP-5 (#148). Every account flow was driven end to end in a browser, with
DevTools open, and each console error was fixed at its source.

- **Register:** `@hookform/resolvers` v5 (zod 4). Before, a validation error was thrown uncaught and the button stuck
  on "Creating account…"; now the field errors show on the form.
- **Signed-out page load:** `/api/auth/refresh` without a cookie answers **204** instead of 401, and these probes get
  their own rate-limit bucket.
- **Email verification and email change:** the tokens are consumed atomically, so a double click or a second tab gets
  400, not 500. The email-change link is posted once under React StrictMode, and only one security-alert email is
  sent.
- **Reset password:** revokes every session and clears this browser's dead refresh cookie, so the next load has no 401.
- **Sign-out on the unverified page:** a network failure no longer escapes as an uncaught error.
- **Kept on purpose:** a wrong password (sign-in, change email / password, delete account) still logs one 401.
  Answering a failed login with a 2xx would hide brute-force signals.

### security: per-visitor IP from `Fly-Client-IP` for rate limits and stored IPs (2026-09-27) ✅

**Context:** PRs #147 and #149–#153 (released in #148 and #150). `fly logs` showed every request coming from a Fly
proxy address. That meant one shared rate-limit bucket for all visitors, and `termsAcceptedIp` stored Fly's address.

- `apps/server/src/lib/clientIp.ts` — `clientIp(request)` reads Fly's `Fly-Client-IP` header only when all of these
  hold:
  - in production;
  - on a Fly Machine (`FLY_APP_NAME` set, `config.onFly`);
  - from a socket on Fly's proxy link (172.16.0.0/12, **not** the org-wide 6PN `fdaa::/16`, which the organisation's
    other apps, e.g. `crypto-dashboard-db`, can use);
  - when the header holds exactly one valid IP.

  Otherwise it falls back to the socket address, with a throttled warning. Used by:
  - the global and per-route rate limits;
  - the market and paper WebSocket caps;
  - `termsAcceptedIp`, the newsletter;
  - the request log serializer.

- Fastify `trustProxy` is **not** set: the hop count varies by Fly edge. A first `trustProxy: 1` attempt (#147) still
  logged edge IPs. Consequence, documented in `.claude/rules/web.md`: in production `request.protocol` is always
  `'http'` and `request.host` is the `Host` header, so absolute URLs come from `config.clientUrl`.
- Verified in production: laptop (IPv6 + IPv4) and phone show their real IPs; a forged `Fly-Client-IP` from outside
  the proxy link is ignored. Signups before this stored the proxy address, which can't be corrected.
- Tests: `clientIp.test.ts` (21).

### fix: tie WebSocket connect / close log lines to their request and visitor (2026-09-27) ✅

**Context:** PR #154, released in #155. The WS log lines couldn't be matched to a visitor or a request.

- **Market feed:** "Client connected to live feed" carries:
  - `reqId`, `clientIp`, `category`, `symbol`, `interval`;

  The disconnect adds `code` and `durationMs`; an error logs the same context.

- **Private paper WS:**
  - "Paper WS connected" names the `userId`.
  - Every socket logs one "Paper WS closed" line, from the close event, with `authenticated`, `userId`, `code`,
    `reason` and `durationMs`.
  - Server-initiated closes (unauthorized, too many tabs, 1008 / 1009 / 1011) go through `closeWith`, so their real
    code and reason are logged. A tab-cap refusal names the refused user.
- Tests: `wsLogging.test.ts` (6).

### fix: remove the pre-BP-2 paper API (O11) (2026-09-28) ✅

**Context:** owner decision O11 — remove the pre-BP-2 surface one release after it was logged. BP-5 (release #148)
logged every call as `paper-legacy-api`; `fly logs` showed none on 2026-09-28, and the client hasn't called it since
BP-2.

- **Removed:** `PATCH /api/paper/account/leverage` (now 404), SDK `paperApi.setLeverage`,
  `TradingService.setLeverage`, the engine action `setLeverage`, and `usdtAmount` as an order / edit size — the route
  schemas no longer list it, so it is stripped and an order sized only by it answers 400. Sizes are `qty` or `value`
  (orders), `qty` (edits). The `paper-legacy-api` logger is gone.
- **Kept:** `Account.leverage` as the default for symbols without their own setting (only reset changes it now); the
  engine's internal `{ margin }` order size, which the engine tests' worked numbers are written in (185 harness calls)
  — it is no longer reachable from the API. The `usdtAmount` field on a pending order's DTO (its initial margin) is
  unrelated and stays.
- **Tests:** the removed route answers 404; `usdtAmount`-only bodies answer 400; route tests size by `value` / `qty`;
  the tests of the removed action's pinning logic are dropped; S2 (a pending order keeps its own leverage) now sets
  the default through a test fixture. Server 710, client 451.
- **Refactor checklist:** no route lost its `app.authenticate`; `sizeOf` still validates before the engine; error
  mapping unchanged; no new logging or dependency.

### docs: retire the Bybit parity plan; TRADING_TEST_PLAN becomes a test strategy (2026-09-28) ✅

**Context:** PR #156, released in #157. BP-0 … BP-5 had shipped.

- **APP_LOG gains "Bybit Parity (BP-0 … BP-5) — reference"**, with:
  - decisions, Bybit values and formulas, the data model;
  - out of scope, known gaps, open items, sources.
- **`docs/BYBIT_PARITY_PLAN.md` is deleted.** It's in git history at `8d40f88`, and about 70 code comments now cite
  "APP_LOG Bybit Parity BP-n".
- **`docs/TRADING_TEST_PLAN.md` gains Part A, a strategy**, covering:
  - quality goals, the measured state and test levels T1–T5 plus M;
  - tools per kind of testing;
  - environments, entry / exit criteria and defect severity;
  - the automation roadmap P1–P6 and the owner's one-time actions.

  Part B (the case catalogue) gains Section 18 (cross-phase regression suite) and Section 19 (account flows).

### feat: nightly Bybit testnet parity run in CI (test plan P3) (2026-09-28) ✅

**Context:** PR #159. The BP-5 G parity script (`parity:testnet`) had never run.

- **`.github/workflows/parity.yml`** runs nightly at 03:17 UTC and on demand, never on pull requests. One run at a
  time, since every run trades on the same testnet account.
  1. The runner builds the commit's server image (the production Dockerfile) into a separate Fly app,
     `crypto-dashboard-parity`.
  2. It starts a one-off machine in `sin`, retrying while the new image propagates; a half-launched machine is
     adopted by name.
  3. It waits for the machine to stop, reads its logs, then removes it.
  - **Why Fly:** Bybit geo-blocks GitHub's US runners (HTTP 403).
  - **Pass** = the machine exited 0 and logged that every step matches Bybit.
  - **Failure:** the log is an artifact, and one `parity` issue is opened or commented on.
- 🔐 **Secrets** (`BYBIT_TESTNET_KEY`, `BYBIT_TESTNET_SECRET`, `FLY_PARITY_API_TOKEN`) live in the `bybit-testnet`
  GitHub environment, which only `main` may use. So a branch can't run a changed script with the keys. The Fly token
  is a deploy token scoped to the parity app (it expires 2027-09-28), so it can't touch production.
- **Script safety** (`tools/bybitParity.ts`):
  - every Bybit call times out after 10 s;
  - at 8 minutes the scenario aborts, and its `finally` closes what it opened (either side) and restores isolated
    mode;
  - a stuck run is cleaned up from the deadline after a 30 s grace, with a hard exit 60 s later.
- **Testnet account setup**, done by the owner:
  - a Read-Write key with Unified Trading → Contract Orders + Positions, no IP restriction, so it expires after about
    3 months;
  - the account left Isolated;
  - test USDT from Assets → Assets Overview → Request Test Coins.
- **Errors met while setting it up, now documented in TRADING_TEST_PLAN A9:**
  - `33004`: expired key;
  - `10005`: read-only key;
  - `110007`: no test USDT.
- **Also in this PR:**
  - The **TradingView cross-checks are retired.** TradingView's paper trading has its own fees and fills and no
    perpetual mark, liquidation or funding, so Bybit itself is now the reference. Test plan Section 6 now compares
    our quotes, candles, mark / funding and feed freshness with Bybit's public API.
  - `README.md` brought up to the Bybit-parity app.
  - This log's Key Files table updated: the server engine files added; the drawing files removed with the
    2026-07-21 library switch and the old browser-side trading hooks dropped.

### fix: first testnet parity run — positionIM with added margin, liquidation price on the tick (2026-09-28) ✅

**Context:** the first nightly parity runs on `main` (after release #160) got through three steps of the scenario
against real Bybit testnet data and reported what differs.

- **Engine** (`bybitSpec.positionRisk`, `engine/margin.riskOf`, the SDK estimate):
  - `positionIM` now counts the margin added by hand, as Bybit's does (18.43 = 8.43 + 10).
  - The liquidation price is rounded to the symbol's tick on the safe side (long up, short down), in the DTO and in
    every liquidation check. The tick comes from the dated instrument snapshot. The worked long 0.1 BTC @ 50,000 10×
    is now liq **45,149.0** (was 45,148.99), the short **54,819.0**. The bankruptcy price is unchanged.
  - The client's MM-rate equity is built from its parts, so it counts added margin once from an old or new server.
- **Parity adapter / scenario** (`trading/bybitParity.ts`, `tools/bybitParity.ts`):
  - A field Bybit leaves blank (`bustPrice` under UTA) is not compared.
  - The stop-loss trigger source is read from Bybit's StopLoss order (`position/list` has no `slTriggerBy`).
  - The scenario trades 0.002 BTC, so the reduce-only half close (0.001) meets Bybit's minimum. The 0.0005 close was
    refused with `10001`.
  - Each position check logs Bybit's mark and average price, to settle whether `positionValue` is mark-based.
- **Still open:** `positionValue`'s basis, O5, the max-reducible formula, the 110090 retCode — see Bybit Parity →
  Open items. The test plan's worked numbers (45,148.99) are updated after the learning-path reorder (#161) lands.
