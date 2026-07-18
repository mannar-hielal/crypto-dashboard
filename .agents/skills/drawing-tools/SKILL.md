---
name: drawing-tools
description: Use when working on the chart drawing system — files under apps/client/src/lib/drawing/, apps/client/src/hooks/useDrawingInteraction.ts, apps/client/src/store/drawingStore.ts, apps/client/src/components/drawing/*, or anywhere ChartPanel/DashboardPage/LeftToolbar handle activeTool/lineTool. Also use when the user mentions trendline, horizontal/vertical line, ray, parallel channel, polyline, text tool, freehand, eraser, bin tool, ISeriesPrimitive, or lightweight-charts. Covers the P1–P5 roadmap in docs/DRAWING_TOOLS.md, the state machine, hit-test math, and known bugs.
---

# Drawing Tools — cryptopapertrade.com

Architecture, status, and roadmap live in `docs/DRAWING_TOOLS.md` — read it before any change. This skill is the working companion: what's wired, what's UI-only, what breaks, and how to add shapes safely.

## Component hierarchy (drawing is only partially wired)

```
DashboardPage  (activeTool, selectedLineTool, cursorVariant state)
├── LeftToolbar           onCursorVariantChange, (line tool submenu — UI only)
└── MultiChartArea ─────── activeTool, lineTool, onExitDrawingMode
      └── ChartPanel
            ├── DrawingPrimitive            (ISeriesPrimitive on candle series)
            ├── useDrawingInteraction       (state machine)
            └── DrawingPropertiesMenu       (portal to document.body on selection)
```

## File inventory (touches for any shape change)

| File                                                           | Role                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/client/src/lib/drawing/types.ts`                         | `Drawing`, `DrawingPoint`, `InProgressDrawing`, `ShapeData` discriminated union, `DrawingType`, `LineStyle` |
| `apps/client/src/lib/drawing/coordinates.ts`                   | Pure hit-test math: `pointToSegmentDist`, `pointToRayDist`, `hitTestBodies`                                 |
| `apps/client/src/lib/drawing/DrawingPrimitive.ts`              | `ISeriesPrimitive` canvas rendering + per-shape `hitTest`                                                   |
| `apps/client/src/lib/lineTools.tsx`                            | SVG icons + `LINE_TOOLS` (6 tool definitions)                                                               |
| `apps/client/src/store/drawingStore.ts`                        | Zustand store + `persist` middleware (key `cd-drawings`, version 2)                                         |
| `apps/client/src/hooks/useDrawingInteraction.ts`               | State machine `IDLE → DRAWING → PLACING` + pointer capture                                                  |
| `apps/client/src/components/drawing/DrawingPropertiesMenu.tsx` | Floating toolbar (color, width, style, label, lock, delete, kebab)                                          |
| `apps/client/src/components/drawing/ColorPicker.tsx`           | 10 grays + 6×10 color swatch grid                                                                           |
| `apps/client/src/components/drawing/KebabMenu.tsx`             | Clone, Visual Order submenu, Delete                                                                         |

## What's wired (don't re-implement)

- Trendline, horizontal, vertical, ray, **parallel channel** (3-click) — full placement, drag, properties, persistence, clone (32px downward offset), visual order, undo/redo (Ctrl+Z / Ctrl+Shift+Z, session-only depth 50).
- Eraser cursor variant removes drawings on click (locked drawings included — `isLocked` only blocks drag/handle drag, not deletion).
- Bin tool: left-click removes all (respects `alwaysRemoveLocked` toggle, default OFF); right-click submenu with the locked-drawings toggle.
- `cd-drawings` localStorage v2, migrated from v1; selectedDrawingId intentionally **not** persisted.
- `createDrawingStyle()` factory centralises defaults — callers pass `shape` + overrides.
- Per-shape rendering branches + per-shape hit-testing dispatched from `hitTestBodies` in `coordinates.ts`.
- Keyboard: `Escape` cancels in-progress placement or deselects; `Delete`/`Backspace` removes selected; right-click exits drawing mode and restores previous tool from `previousToolRef`.
- `data-drawing-hover` and `data-drawing-active` attributes on chart div; hover legend (`ChartPanel.tsx:544`) is hidden when `inProgressDrawing !== null`.

## What's UI-only / blocked (don't ship as "done")

- **Polyline** — no `ISeriesPrimitive` multi-point logic. `PLACEMENT_CONFIGS.polyline` is commented as future (`totalPoints: 0, finishOn: 'dblclick'`). lightweight-charts v5 has no `subscribeDblClick`; needs a DOM `dblclick` listener + `lastClickTimeRef` guard.
- **Text** tool — toolbar button only.
- **Freehand Draw** — toolbar button only.
- **Rectangle / Fibonacci** — removed; would need new `ShapeData` variants + renderers.
- **Clip/paste** — KebabMenu shows a "Copy" concept but it is **not wired**.

## Known limitations / latent bugs to watch

1. `ChartPanel` computes toolbar position from `container.getBoundingClientRect()` — **latent scroll-safety bug**, only hidden today because the dashboard doesn't scroll. Reposition toolbar on scroll/resize (P4.4).
2. `DrawingPropertiesMenu` always renders all 8 buttons regardless of shape — rectangle would need fill color / fill opacity inputs instead of line color. P4.3.
3. `cloneDrawing(id, priceOffset?)` works for trendline/horizontal/vertical but **mangles parallel channel's 3-point geometry** unless per-shape clone is delegated to the renderer. P4.2.
4. No snap-to-grid or snap-to-OHLC for horizontal/vertical/ray. P5.1.
5. Multi-segment polyline rendering is not in current shape renderers — each renderer is single-segment only.
6. Cosmetic, non-blocking: exit-order Type in Order History shows `MARKET` instead of TradingView's `Take Profit` / `Stop Loss` (see `docs/TRADING_TEST_PLAN.md` notes). Tracked as a future labelling pass.

## How to add a new shape (follow the roadmap order)

> The cardinal rule from `docs/DRAWING_TOOLS.md`: **foundation before shapes**. Don't add `if (shape.type === 'x')` branches to the monoliths. Add via the registry.

1. **Type**: extend `ShapeData` union in `types.ts` with a new variant carrying a tuple-typed `points` array (e.g. `[DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint]` for a rectangle). Never a flat bag.
2. **Placement config**: add a `PLACEMENT_CONFIGS[toolId]` entry in `useDrawingInteraction.ts` with `{ totalPoints, finishOn: 'click' | 'dblclick' }`.
3. **Renderer**: implement the `ShapeRenderer` interface — `draw`, `drawPreview`, `hitBody`, `getHandles`, `getToolbarAnchor`. All math goes through `coordinates.ts` (point-to-segment, point-to-ray, infinite-line distance) — never re-implement hit-test inline.
4. **Registry**: register the renderer in the `RENDERERS` record keyed by shape type. `DrawingPrimitive.draw()` stays a thin dispatcher (~20 lines).
5. **Store factory**: `addDrawing(d)` accepts `{ shape: ShapeData } & Partial<StyleFields>`; new style fields (e.g. `fillColor`, `fillOpacity`) go into the factory defaults, not scattered at call sites.
6. **Persistence migration**: any persisted-schema change bumps `cd-drawings` version and writes a `migrate(prev, version)` that wraps/reshapes old data. Never break old localStorage silently (cross-ref **`bug-sweep`** skill P2-38 client-side security).
7. **Toolbar anchor**: implement `getToolbarAnchor(shape, rc)` so the properties toolbar lands correctly per shape (midpoint for 2-point shapes, anchor for 1-point, bounding-box center for N-point).
8. **Properties menu**: conditionally render buttons per shape capability (P4.3).
9. **Tests**: add store + coordinates tests. Existing baseline = 65 tests (34 store + 31 coordinates). Hit-test parity must be covered because canvas rendering isn't asserted in jsdom.
10. **AGENTS.md / DRAWING_TOOLS.md**: update "What's Implemented" / "What's UI Only" / "Known Limitations" sections.

## Test commands

```bash
pnpm --filter @crypto-dashboard/client test -- drawingStore
pnpm --filter @crypto-dashboard/client test -- coordinates
pnpm --filter @crypto-dashboard/client type-check
pnpm lint
```

Run `pnpm --filter @crypto-dashboard/client dev` and manually verify: place, drag, resize, select (lock still selectable), delete via keyboard + toolbar, clone, visual order, undo/redo, persistence across reload, properties toolbar positioning, eraser removal (incl. locked), bin tool locked-toggle.
