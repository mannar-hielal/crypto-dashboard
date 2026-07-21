# TradingView Advanced Charts — Migration Plan

## Goal

Replace `lightweight-charts` with TradingView's self-hosted Advanced Charts library under the **free license** (requires public access without login), getting 110+ drawing tools, 100+ indicators, and zero fragile custom chart code.

## License qualification

The free Advanced Charts license requires:

- **Public access** — the chart page must be accessible without authentication
- **TradingView branding visible** — "Chart by TradingView" watermark stays on
- **Not behind a paywall** — no subscription gate on chart functionality

Our landing page, features page, and legal pages are already public. Only `/dashboard` is behind `ProtectedRoute`. The fix: add a **public** `/chart` route with the full trading UI. Logged-in users can still access `/dashboard` for settings/admin.

---

## Phase 1 — Route & Auth Decoupling

### 1.1 New public route

| Route        | Auth req'd | Renders                                           |
| ------------ | ---------- | ------------------------------------------------- |
| `/dashboard` | Yes        | DashboardPage (full experience + settings)        |
| `/chart`     | No         | ChartPage (same layout, no settings/admin access) |

`ChartPage` is a stripped wrapper around the same `DashboardInner` component, but hides auth-gated features (SettingsModal, admin links). No redirect to login — anonymous users see the chart immediately.

### 1.2 Guard fragile parts behind `isAnonymous`

Audit every `useAuthStore` consumer in the dashboard and wrap with a check:

| File                              | Dependency                | Anonymous behavior                     |
| --------------------------------- | ------------------------- | -------------------------------------- |
| `DashboardPage.tsx`               | `syncWithServer`          | Skip sync, localStorage only           |
| `TopBar.tsx`                      | username, settings button | Show "Guest" or nothing, hide settings |
| `OrderAccountManagementPanel.tsx` | username                  | Show "Anonymous Trader"                |
| `SettingsModal.tsx`               | `accessToken`, `user`     | Hidden entirely                        |
| `paperStore.ts` (10+ sync calls)  | `accessToken`             | Guard with `if (!token) return`        |

### 1.3 paperStore — make server sync optional

All API calls in `paperStore` use `useAuthStore.getState().accessToken`. Wrap each with:

```ts
const token = useAuthStore.getState().accessToken;
if (!token) {
  // localStorage is the source of truth — skip server sync
  return;
}
```

No other store changes needed — Zustand `persist` middleware already keeps state in localStorage.

---

---

## **Note (2026-07):** Drawing tools are no longer part of this plan. We're replacing the custom drawing system with `lightweight-charts-drawing` (MIT, 68 tools) instead — see `DRAWING_MIGRATION_PLAN.md`. The TV Advanced Charts license still covers the chart widget itself if we choose to integrate it later, but the drawing layer is now independent.

## Phase 2 — TradingView Library Integration

### 2.1 Download & self-host

1. Apply for Advanced Charts at https://www.tradingview.com/advanced-charts/
2. Get GitHub access to `tradingview/charting_library` private repo
3. Download `charting_library_master/`
4. Place in `apps/client/public/tradingview/` (static served by Vite)

### 2.2 Datafeed implementation

Create `apps/client/src/lib/tradingview/datafeed.ts` implementing the `IDatafeedChartApi` interface (~300 lines):

```ts
interface IDatafeedChartApi {
  onReady(callback): void; // declare supported resolutions, exchanges
  resolveSymbol(symbol, callback): void; // symbol info (ticker, session, minmov, etc.)
  getBars(symbolInfo, resolution, periodParams, callback): void; // REST history
  subscribeBars(symbolInfo, resolution, onTick, subscriberUID): void; // WS candle stream
  unsubscribeBars(subscriberUID): void;
}
```

**Data source**: reuse existing `marketApi` from `@crypto-dashboard/sdk`. The Bybit REST endpoint `/api/market/history` and the WebSocket feed already return the same `CandleBar` format — just map it.

### 2.3 Widget replacement

Replace `ChartPanel.tsx`:

```tsx
// Before: lightweight-charts
const chart = createChart(container, { ... });

// After: TradingView Advanced Charts
new TradingView.widget({
  container: containerId,
  symbol: 'BINANCE:BTCUSDT',
  interval: '60',
  datafeed: yourDatafeed,
  theme: 'Dark',
  custom_css_url: '/tradingview/custom.css',
  disabled_features: [
    'header_symbol_search',   // we provide our own SymbolBar
    'header_interval_dialog_button',
    'use_localstorage_for_settings',
  ],
  enabled_features: ['study_templates'],
  overrides: {
    'paneProperties.background': '#060413',
    'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.04)',
    'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.04)',
  },
});
```

### 2.4 Custom CSS theme

Create `apps/client/public/tradingview/custom.css` — override TradingView's default dark theme to match our `tokens.ts`:

```css
/* Match cryptopapertrade dark theme */
.theme-dark {
  --tv-color-platform-background: #060413;
  --tv-color-pane-background: #060413;
  --tv-color-toolbar-button-text: #d1d4dc;
  /* ... */
}
```

### 2.5 Remove lightweight-charts dependency

After confirmation everything works:

```bash
pnpm remove lightweight-charts
```

Delete `apps/client/src/lib/drawing/` (entire directory), `useDrawingInteraction.ts`, `drawingStore.ts`, `usePaneFeeds.ts` (replaced by TV's built-in datafeed).

---

## Phase 3 — Preserving Existing Features on the New Chart

### 3.1 Cross-pane sync

TradingView Advanced Charts has **built-in multi-chart sync** for crosshair, time range, and drawings — no custom ref-wiring needed. The `synchronized_multicharts` feature handles this.

### 3.2 Indicators (EMA, VWAP, MACD)

Replace `calcEMA`, `calcVWAP`, `calcMACD` from `lib/indicators.ts` with TradingView's built-in indicators. TV has EMA, VWAP, and MACD natively — no custom calculation needed.

### 3.3 Ticker / Symbol bar

The existing `TickerBar` and `SymbolBar` components stay as-is. TradingView's `header_symbol_search` will be disabled — we control symbol switching via our own component and call `widget.chart().setSymbol()`.

### 3.4 Paper trading panel

The `TradingPanel`, `OrderAccountManagementPanel`, `PositionEditPanel`, `PendingOrderEditPanel` stay unchanged — they operate on `paperStore` which is independent of the chart library.

### 3.5 TP/SL line on chart

TradingView has built-in take-profit / stop-loss line display when using the Trading Platform library. With just Advanced Charts, we'll draw TP/SL lines via the `createShape` or `createStudy` API after each order:

```ts
widget
  .chart()
  .createShape(
    { price: slPrice, time: currentTime },
    { shape: 'horizontal_line', text: 'SL', overrides: { linecolor: '#d5455c' } }
  );
```

---

## Phase 4 — Decommission & Cleanup

### 4.1 Remove files

| Remove                                           | Reason                                            |
| ------------------------------------------------ | ------------------------------------------------- |
| `apps/client/src/lib/drawing/`                   | Entire drawing subsystem — TV provides 110+ tools |
| `apps/client/src/hooks/useDrawingInteraction.ts` | Replaced by TV's built-in interaction             |
| `apps/client/src/hooks/usePaneFeeds.ts`          | Replaced by TV's datafeed + WS integration        |
| `apps/client/src/store/drawingStore.ts`          | TV handles drawing persistence internally         |
| `apps/client/src/components/drawing/`            | ColorPicker, PropertiesMenu, KebabMenu — gone     |
| `apps/client/src/lib/lineTools.tsx`              | TV has its own toolbar                            |
| `apps/client/src/lib/indicators.ts`              | TV has EMA, VWAP, MACD built-in                   |
| `apps/client/src/lib/chartDataAdapter.ts`        | No longer needed                                  |
| `lightweight-charts` from package.json           | Dependency removed                                |

### 4.2 Update docs

- `docs/APP_LOG.md` — mark drawing system as replaced
- `docs/DRAWING_TOOLS.md` — replace content with "Migrated to TradingView Advanced Charts"
- `AGENTS.md` — update test commands, architecture section

---

## Migration Strategy (risk reduction)

**Step 1 — Route decoupling only** (no TV yet)

Make `/chart` public, guard auth-dependent code, verify anonymous users can trade and state persists in localStorage. **Deliverable**: PR that works end-to-end without login.

**Step 2 — Obtain TV library**

Submit form at https://www.tradingview.com/advanced-charts/. While waiting, read the datafeed API docs. **Deliverable**: library downloaded, GitHub access confirmed.

**Step 3 — Datafeed + single-pane prototype**

Implement `datafeed.ts` targeting one symbol (BTCUSDT). Render one TV chart alongside the existing `lightweight-charts` for side-by-side comparison. **Deliverable**: Both charts running, data matches.

**Step 4 — Full replacement**

Swap all 4 panes to TV. Wire symbol/interval switching. Apply custom CSS theme. Remove `lightweight-charts` and drawing files. **Deliverable**: Feature parity confirmed.

**Step 5 — Polish & edge cases**

Test: TP/SL lines, crosshair sync, drawing persistence across reload, mobile responsiveness, PWA compatibility, performance on low-end devices.

---

## Appendix — Files touched

### New files

| File                                               | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| `apps/client/public/tradingview/charting_library/` | TV static bundles (self-hosted)   |
| `apps/client/public/tradingview/custom.css`        | Dark theme overrides              |
| `apps/client/src/lib/tradingview/datafeed.ts`      | Bybit data feed bridge            |
| `apps/client/src/lib/tradingview/config.ts`        | Widget options, feature overrides |
| `apps/client/src/pages/ChartPage.tsx`              | Public chart page (no auth)       |

### Modified files

| File                                                                   | Change                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/client/src/App.tsx`                                              | Add `/chart` route (outside ProtectedRoute)    |
| `apps/client/src/components/dashboard/ChartPanel.tsx`                  | Replace createChart → new TradingView.widget() |
| `apps/client/src/components/dashboard/MultiChartArea.tsx`              | Remove crosshair sync (TV handles it)          |
| `apps/client/src/pages/DashboardPage.tsx`                              | Conditionally skip auth-dependent logic        |
| `apps/client/src/components/dashboard/TopBar.tsx`                      | Show "Guest" fallback when no user             |
| `apps/client/src/store/paperStore.ts`                                  | Guard 10+ API calls with `if (!token) return`  |
| `apps/client/src/components/dashboard/OrderAccountManagementPanel.tsx` | Anonymous username fallback                    |

### Deleted files

| File                                             | Lines saved     |
| ------------------------------------------------ | --------------- |
| `apps/client/src/lib/drawing/` (entire dir)      | ~2500           |
| `apps/client/src/store/drawingStore.ts`          | ~300            |
| `apps/client/src/hooks/useDrawingInteraction.ts` | ~400            |
| `apps/client/src/hooks/usePaneFeeds.ts`          | ~212            |
| `apps/client/src/components/drawing/`            | ~500            |
| `apps/client/src/lib/lineTools.tsx`              | ~200            |
| `apps/client/src/lib/indicators.ts`              | ~300            |
| `apps/client/src/lib/chartDataAdapter.ts`        | ~50             |
| **Total removed**                                | **~4500 lines** |
