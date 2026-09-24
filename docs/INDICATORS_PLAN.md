# User-Selectable Chart Indicators

## Status

**Done** — implemented and verified (lint + type-check pass).

---

## Overview

Replace the 5 hardcoded always-on indicators (EMA9, EMA20, EMA200, VWAP, MACD) with a user-selectable system where each indicator is an `ISeriesPrimitive` attached to the candlestick series. Users add/remove/configure indicators via a dropdown in `SymbolBar` and a floating draggable widget per indicator.

Data auto-syncs via `subscribeDataChanged` — no manual data push needed in the `bars` effect.

## Indicator Catalog

### LH single-series examples (implementable)

| Indicator      | Series Type     | Params                  | LH Helper                     |
| -------------- | --------------- | ----------------------- | ----------------------------- |
| SMA            | Overlay (line)  | length=20, source=close | `applyMovingAverageIndicator` |
| EMA            | Overlay (line)  | length=20, source=close | Wraps existing `calcEMA`      |
| Average Price  | Overlay (line)  | —                       | LH average-price              |
| Median Price   | Overlay (line)  | —                       | LH median-price               |
| Weighted Close | Overlay (line)  | —                       | LH weighted-close             |
| Momentum       | Sub-pane (line) | length=10, source=close | LH momentum                   |
| Percent Change | Sub-pane (line) | length=10               | LH percent-change             |

### Existing (migrate to ISeriesPrimitive)

| Indicator | Series Type                                   | Params                     | Calculation           |
| --------- | --------------------------------------------- | -------------------------- | --------------------- |
| VWAP      | Overlay (line, sparse dotted)                 | —                          | `calcVWAP` (existing) |
| MACD      | Sub-pane compound (line + signal + histogram) | fast=12, slow=26, signal=9 | `calcMACD` (existing) |

### Not implemented (require 2 data series)

Correlation, Ratio, Spread, Product, Sum — inapplicable to single-symbol chart.

## Defaults

A fresh pane (first visit / cleared state) ships with 4 pre-added instances:

| Instance | Color     | Params                   |
| -------- | --------- | ------------------------ |
| EMA 9    | `#94a3b8` | length=9, source=close   |
| EMA 20   | `#3b82f6` | length=20, source=close  |
| EMA 200  | `#9c27b0` | length=200, source=close |
| VWAP     | `#f97316` | —                        |

Users can remove any default or add more. Persisted state overrides on subsequent visits.

## Architecture

### Per-pane indicator instances (persisted in layoutStore)

```ts
interface IndicatorInstance {
  instanceId: string; // "ema_1712345678_20"
  indicatorId: string; // catalog key (e.g. "ema", "vwap")
  params: Record<string, number | string>;
  color: string;
  enabled: boolean; // eye toggle
  position: { x: number; y: number }; // widget position
}
```

Stored in `layoutStore.PaneConfig.indicators` → persisted to localStorage (`cd-layout`).

### ISeriesPrimitive lifecycle

Each indicator wraps its calculation in an `ISeriesPrimitive`:

- `attached(param)` → create series via `chart.addSeries()`, subscribe to source data, run initial calc
- `detached()` → unsubscribe, `chart.removeSeries()`, remove sub-pane if applicable
- Internal `_updateData` → read `source.data()`, run calculation, `series.setData()` on indicator series

Overlays attach to pane 0 (same as candlesticks). Sub-panes create a new pane via `chart.addPane()`.

### Data flow (before vs after)

Before (current):

```
bars effect
  ├── calcEMA → ema9Ref.setData (+ ema20, ema200)
  ├── calcVWAP → vwapRef.setData
  ├── calcMACD → macdLineRef/signalRef/histRef.setData
  └── paddingRef.setData
```

After:

```
bars effect
  ├── candleRef.setData (unchanged)
  ├── paddingRef.setData (unchanged)
  └── Done — each ISeriesPrimitive self-updates via subscribeDataChanged
```

### Draggable widget

Each active `IndicatorInstance` gets a floating React widget rendered inside `ChartPanel`:

```
┌── Drag handle ────────────────────────────────────┐
│ ● EMA         20                         👁 ⚙ ✕  │
│                   41,498                          │
└───────────────────────────────────────────────────┘
```

- Framer Motion `drag` — constrained to chart container
- `onDragStop` → persist position to `layoutStore`
- Eye → `enabled` field → `series.applyOptions({ visible: boolean })`
- Gear → `IndicatorSettings` popover (params + style)
- X → remove instance → `primitive.detached()`

## Layout in SymbolBar

```
[Star] [BTC ▼] | $45,234 +2.34% | [Change] [High] [Low] [Vol] | [Indicators ▼] | [1☐ 2☐ 3☐ 4☐] | …
```

Placed before `ChartLayoutPicker` (line 398 of `SymbolBar.tsx`). Dropdown uses the same portal pattern as the symbol picker.

### Dropdown

```
┌──────────────────────────────┐
│ 🔍 Search indicators…        │
├──────────────────────────────┤
│ ADD                          │
│  + Average Price             │
│  + EMA (length, source)      │
│  + MACD (12, 26, 9)          │
│  + Median Price              │
│  + Momentum (length)         │
│  + Percent Change (length)   │
│  + SMA (length, source)      │
│  + VWAP                      │
│  + Weighted Close            │
└──────────────────────────────┘
```

Tapping `+` creates an instance with default params → widget appears on chart.

### Settings popover (gear icon)

```
┌──────────────────────────┐
│ SMA — Settings           │
├──────────────────────────┤
│ Inputs                   │
│  Length: [  20  ]        │
│  Source: [close    ▼]    │
│                          │
│ Style                    │
│  Color: [■ #f7931a]      │
│  Width: [  2  ]          │
│  Line:  [Solid ▼]        │
│                          │
│ [Apply]  [Reset]  [●]    │
└──────────────────────────┘
```

## Implementation Order

| Step | What                                                                                                                                        | Files                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Types: `IndicatorMeta`, `IndicatorInstance`, `ParamDef`                                                                                     | `lib/indicators/types.ts`                                                |
| 2    | Catalog: all indicator definitions + default params                                                                                         | `lib/indicators/catalog.ts`                                              |
| 3    | Copy LH helper + calculation source for SMA, avg-price, median-price, weighted-close, momentum, percent-change                              | `lib/indicators/primitives/*.ts`, `lib/indicators/helpers/`              |
| 4    | Write custom primitives for VWAP and MACD (wrap existing calc functions)                                                                    | `lib/indicators/primitives/vwap.ts`, `lib/indicators/primitives/macd.ts` |
| 5    | Write generic EMA primitive (uses existing `calcEMA`)                                                                                       | `lib/indicators/primitives/ema.ts`                                       |
| 6    | Add `indicators` to `layoutStore` `PaneConfig` + version migration                                                                          | `store/layoutStore.ts`                                                   |
| 7    | IndicatorDropdown component                                                                                                                 | `components/indicators/IndicatorDropdown.tsx`                            |
| 8    | IndicatorSettings component                                                                                                                 | `components/indicators/IndicatorSettings.tsx`                            |
| 9    | IndicatorWidget + IndicatorWidgets components                                                                                               | `components/indicators/IndicatorWidget.tsx`                              |
| 10   | Add "Indicators" button to SymbolBar                                                                                                        | `components/dashboard/SymbolBar.tsx`                                     |
| 11   | Thread indicators prop through MultiChartArea → ChartPanel                                                                                  | `MultiChartArea.tsx`                                                     |
| 12   | ChartPanel: remove hardcoded series + data push; add primitive lifecycle effect; render widgets                                             | `ChartPanel.tsx`                                                         |
| 13   | Remove unused indicator code (calcEMA/calcVWAP/calcMACD left in `lib/indicators.ts` for backward compat — no longer imported in ChartPanel) | `ChartPanel.tsx`                                                         |
| 14   | Strip hardcoded EMA/VWAP lines from hover legend (now shows OHLC only)                                                                      | `ChartPanel.tsx`                                                         |

## Key Source Files

### Create

```
apps/client/src/lib/indicators/types.ts
apps/client/src/lib/indicators/catalog.ts
apps/client/src/lib/indicators/primitives/moving-average.ts     (SMA)
apps/client/src/lib/indicators/primitives/ema.ts                (EMA, wraps calcEMA)
apps/client/src/lib/indicators/primitives/average-price.ts      (LH example)
apps/client/src/lib/indicators/primitives/median-price.ts       (LH example)
apps/client/src/lib/indicators/primitives/weighted-close.ts     (LH example)
apps/client/src/lib/indicators/primitives/momentum.ts           (LH example)
apps/client/src/lib/indicators/primitives/percent-change.ts     (LH example)
apps/client/src/lib/indicators/primitives/vwap.ts               (custom, wraps calcVWAP)
apps/client/src/lib/indicators/primitives/macd.ts               (custom compound, wraps calcMACD)
apps/client/src/lib/indicators/helpers/timestamp-data.ts        (LH dependency)
apps/client/src/components/indicators/IndicatorDropdown.tsx
apps/client/src/components/indicators/IndicatorSettings.tsx
apps/client/src/components/indicators/IndicatorWidget.tsx
apps/client/src/components/indicators/IndicatorWidgets.tsx
```

### Modify

| File                                          | Key change                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/store/layoutStore.ts`                    | Add `indicators: IndicatorInstance[]` to `PaneConfig`, version 2→3, add actions                   |
| `src/components/dashboard/SymbolBar.tsx`      | Add "Indicators" button before `ChartLayoutPicker`                                                |
| `src/components/dashboard/MultiChartArea.tsx` | Thread `indicators` + actions through to `ChartPanel`                                             |
| `src/components/dashboard/ChartPanel.tsx`     | Replace hardcoded series/data push with primitive lifecycle effect; render `<IndicatorWidgets />` |
| `src/lib/tokens.ts`                           | Add any new indicator colors if needed                                                            |

## Cross-References

- `docs/APP_LOG.md` — update after implementation
- `docs/SEO_READINESS.md` — n/a
- `AGENTS.md` — n/a
- `bug-sweep` skill — run P1 (type safety), P4 (Zustand selectors, effect deps), P11 (conventions) before commit

## Open Questions (resolved)

1. **Phase 1 scope**: All single-series LH indicators + existing 5 — resolved ✓
2. **Dropdown position**: Before layout picker in SymbolBar — resolved ✓
3. **Persistence**: Always persist to layoutStore (no auth gating) — resolved ✓
4. **Configurable params from the start**: Yes, with gear icon → TradingView-style settings popover — resolved ✓
5. **Widget positioning**: Floating, draggable over chart — resolved ✓
6. **Migrate existing indicators**: Yes, all to LH ISeriesPrimitive pattern — resolved ✓
7. **Defaults**: EMA 9/20/200 + VWAP — resolved ✓
