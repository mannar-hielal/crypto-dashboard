# Drawing Tools — Architecture, Status & Roadmap

## Overview

Drawing system built on `lightweight-charts` `ISeriesPrimitive` API. Supports trendline, horizontal line, vertical line, ray, and parallel channel placement; selection, drag-to-move/resize, properties editing, persistence, clone, and visual ordering. Polyline, text, and freehand tools are UI-only (not wired).

---

## Architecture

### Data Flow

```
DashboardPage (activeTool, lineTool state)
  │
  ├── LeftToolbar ─────── onToolChange → DashboardPage
  │
  └── MultiChartArea ──── activeTool, lineTool, onExitDrawingMode
        │
        └── ChartPanel
              ├── DrawingPrimitive (ISeriesPrimitive on candle series)
              ├── useDrawingInteraction (state machine)
              └── DrawingPropertiesMenu (portal to body on selection)
```

### File Inventory

| File                                                           | Role                                                                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/lib/drawing/types.ts`                         | `Drawing`, `DrawingPoint`, `InProgressDrawing`, `ShapeData` (trendline/horizontal/vertical/ray/parallel), `DrawingType`, `LineStyle` types — discriminated union on `shape` field |
| `apps/client/src/lib/drawing/coordinates.ts`                   | Shared pure-math hit-testing utilities (`pointToSegmentDist`, `hitTestBodies`) — eliminates 3-way duplication                                                                     |
| `apps/client/src/lib/drawing/DrawingPrimitive.ts`              | `ISeriesPrimitive` — canvas rendering via `TrendlineRenderer` + `hitTest` (imports from `coordinates.ts`)                                                                         |
| `apps/client/src/lib/lineTools.tsx`                            | SVG icon components + `LINE_TOOLS` array (6 tool definitions)                                                                                                                     |
| `apps/client/src/store/drawingStore.ts`                        | Zustand store w/ `persist` middleware (`cd-drawings` localStorage key)                                                                                                            |
| `apps/client/src/hooks/useDrawingInteraction.ts`               | State machine (`IDLE` → `DRAWING` → `PLACING_A`) + pointer capture — uses `activeToolRef.current` to drive drawing type (guard: only `'trendline'` implemented)                   |
| `apps/client/src/components/drawing/DrawingPropertiesMenu.tsx` | Floating toolbar: color, width, style, label, lock, delete, kebab                                                                                                                 |
| `apps/client/src/components/drawing/ColorPicker.tsx`           | TradingView-style 10 gray + 6×10 color swatch grid                                                                                                                                |
| `apps/client/src/components/drawing/KebabMenu.tsx`             | Clone, Visual Order submenu, Delete                                                                                                                                               |
| `apps/client/src/components/dashboard/ChartPanel.tsx`          | Creates `DrawingPrimitive`, computes toolbar position, gates hover legend                                                                                                         |
| `apps/client/src/components/dashboard/LeftToolbar.tsx`         | Sidebar: cursor variant menu + line tool submenu (right-click)                                                                                                                    |
| `apps/client/src/components/dashboard/MultiChartArea.tsx`      | Passes drawing props to each `ChartPanel`                                                                                                                                         |
| `apps/client/src/pages/DashboardPage.tsx`                      | Top-level `activeTool`/`selectedLineTool` state, cursor CSS, exit handler                                                                                                         |

---

## Zustand Store (`drawingStore.ts`)

- **Key**: `cd-drawings` in localStorage (version 2)
- **Persisted**: `drawings[]`, `nextZIndex` — `selectedDrawingId` is intentionally **not** persisted
- **Migration**: v1→v2 wraps flat `{ type, points }` into `{ shape: { type, points } }`
- **Factory**: `createDrawingStyle()` centralises default color/width/style — callers pass only `shape` + overrides
- **Actions**:
  - `addDrawing(d)` — accepts `{ shape: ShapeData } & Partial<StyleFields>`, auto-generates `id` (crypto.randomUUID) + `zIndex`, applies factory defaults
  - `updateDrawing(id, updates)` — partial merge (including nested `shape` updates)
  - `removeDrawing(id)` — also clears `selectedDrawingId` if matching
  - `selectDrawing(id)` — sets `selectedDrawingId` (used by hook + toolbar)
  - `clearAll()` — resets everything
  - `moveDrawing(id, dir)` — re-sorts z-indices (`front`/`forward`/`back`/`backward`)
  - `cloneDrawing(id, priceOffset?)` — copies `shape.points` with optional vertical offset, forces `isLocked: false`; for 1-point shapes (horizontal/vertical) offsets the single anchor; for 2-point (trendline/ray) offsets both

---

## State Machine (`useDrawingInteraction.ts`)

```
         ┌─────────────────────────────────────────────┐
         │  IDLE                                        │
         │   → not in drawing mode                      │
         └─────────────┬───────────────────────────────┘
                       │ activeTool becomes a line tool
                       ▼
         ┌─────────────────────────────────────────────┐
         │  DRAWING                                    │
         │   → subscribeClick listens for first point   │
         │   → pointerdown captures for drag (handle/   │
         │     body)                                    │
         │   → 1-click tools (horizontal/vertical)      │
         │     commit immediately on click              │
         └─────────────┬───────────────────────────────┘
                       │ click on chart (not hitting drawing)
                       │ for multi-click tools (trendline, ray)
                       ▼
         ┌─────────────────────────────────────────────┐
         │  PLACING                                    │
         │   → subscribeCrosshairMove shows preview     │
         │   → hoverPoint draws dashed preview line     │
         │   → click → accumulate point or commit       │
         │     (config.totalPoints reached)             │
         │   → Escape → cancel → back to DRAWING       │
         └─────────────────────────────────────────────┘

  DRAGGING_HANDLE ← pointerdown on handle circle (resize endpoint)
  DRAGGING_DRAWING ← pointerdown on line body (translate entire line)
```

### Placement Configs (P2)

`PLACEMENT_CONFIGS` drives per-tool point count and finish method:

```ts
const PLACEMENT_CONFIGS: Partial<Record<LineToolId, PlacementConfig>> = {
  trendline: { totalPoints: 2, finishOn: 'click' },
  horizontal: { totalPoints: 1, finishOn: 'click' },
  vertical: { totalPoints: 1, finishOn: 'click' },
  ray: { totalPoints: 2, finishOn: 'click' },
  parallel: { totalPoints: 3, finishOn: 'click' },
  // polyline  (P3): { totalPoints: 0, finishOn: 'dblclick' }
};
```

1-click tools (horizontal, vertical): click in DRAWING state → commit immediately (no PLACING state).
2-click tools (trendline, ray): click in DRAWING → enter PLACING → click → commit.
3-click tools (parallel): click in DRAWING → enter PLACING → click (2nd point accumulated) → click (3rd point commit). After 2nd click, preview shows base line solid + offset line dashed following cursor.

### Keyboard Shortcuts

| Key                    | Action                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `Escape`               | Cancel in-progress placement; otherwise deselect                       |
| `Delete` / `Backspace` | Remove selected drawing (also clears `selectedDrawingId`)              |
| Right-click            | Exit drawing mode, restore previous tool (stored in `previousToolRef`) |

### How Delete Works

1. `handleKeyDown` → `removeDrawing(id)` → store clears `selectedDrawingId` if matching
2. React reacts → `selectedDrawingId` becomes `null` → `DrawingPropertiesMenu` portal unmounts
3. Store persists updated `drawings[]` to localStorage

### How Clone Works

1. KebabMenu "Clone" → `onClone(drawing)` → `ChartPanel`
2. Computes 32px downward offset via `priceToCoordinate` / `coordinateToPrice`
3. `cloneDrawing(id, priceOffset)` → new drawing with shifted points

---

## Canvas Rendering (`DrawingPrimitive.ts`)

- **Renderer**: `TrendlineRenderer` — draws via `useBitmapCoordinateSpace`, dispatches to per-shape draw helpers (`drawLineShape`, `drawHorizontalShape`, `drawVerticalShape`)
- **Rendered layers** (top to bottom):
  1. **In-progress preview**: dashed white line (`[6, 3]` dash) when placing point B (trendline / ray only — 1-click tools skip preview)
  2. **Committed lines / shapes**: per-shape rendering (see below), dash/dot spacing scales with `lineWidth`
     - `dashed`: `[8 * lineWidth, 4 * lineWidth]` (in bitmap pixels × `hpr`)
     - `dotted`: `[1 * lineWidth, 3 * lineWidth]` (in bitmap pixels × `hpr`)
  3. **Label**: shape-specific anchor (see below), drawn only when `drawing.label` is set
  4. **Handles**: white filled circles with color stroke (only for selected drawing)
- **hitTest**: per-shape body + handle hit-test (handle > body priority), returns `PrimitiveHoveredItem`
- **requestUpdate**: called on every `drawings`/`selectedDrawingId`/`inProgressDrawing` change

### Per-shape rendering & hit-testing

| Shape        | Render                                         | Hit-test body                                       | Handle count           | Toolbar anchor                     |
| ------------ | ---------------------------------------------- | --------------------------------------------------- | ---------------------- | ---------------------------------- |
| `trendline`  | 2-point segment                                | `pointToSegmentDist` (clamped to A→B)               | 2 (A, B)               | midpoint of A–B, y = min(Y_A, Y_B) |
| `ray`        | 2-point line extended past B to chart edge     | `pointToRayDist` (no clamp past B; clamps behind A) | 2 (A, B)               | midpoint of A–B, y = min(Y_A, Y_B) |
| `horizontal` | full-width line at `points[0].price`           | `\|y - Y_line\| < threshold` (any X)                | 1 (at placement point) | placement point (x, y)             |
| `vertical`   | full-height line at `points[0].time`           | `\|x - X_line\| < threshold` (any Y)                | 1 (at placement point) | placement point (x, y)             |
| `parallel`   | base A→B + offset C→C+(B−A) + translucent fill | `pointToSegmentDist` for both base + offset lines   | 3 (A, B, C)            | midpoint of A–B, y = min(Y_A, Y_B) |

Draw helpers in `DrawingPrimitive.ts`:

- `drawLineShape(...)` — renders trendline OR ray (`extendPastB` flag)
- `drawHorizontalShape(...)` — renders full-width line + optional label/handle at anchor
- `drawVerticalShape(...)` — renders full-height line + optional label/handle at anchor
- `drawParallelShape(...)` — renders base line + parallel offset line + translucent fill + 3 handles
- `drawVerticalShape(...)` — renders full-height line + optional label/handle at anchor
- `applyStrokeStyle`, `drawHandlesAt`, `drawLabelAt` — shared helpers

---

## Toolbar (`LeftToolbar.tsx`)

### Tool Icons (after removal)

| Tool          | ID       | Icon          | Behavior                                                   |
| ------------- | -------- | ------------- | ---------------------------------------------------------- |
| Cursor        | `cursor` | MousePointer2 | Right-click → variant submenu (crosshair, pointer, eraser) |
| Lines         | `line`   | MousePointer2 | Right-click → line tool submenu (6 variants)               |
| Text          | `text`   | Type          | UI only — not yet wired                                    |
| Freehand Draw | `pencil` | Pencil        | UI only — not yet wired                                    |
| Bin           | `bin`    | Trash2        | Left-click → remove all; Right-click → submenu options     |

### Removed Tools

- **Crosshair** (`crosshair`) — removed
- **Rectangle** (`rectangle`) — removed
- **Fibonacci** (`fib`) — removed

---

## Properties Toolbar (`DrawingPropertiesMenu.tsx`)

- Rendered via `createPortal` to `document.body` at fixed position centered above trendline midpoint
- Drag handle (6-dot grid) to reposition toolbar
- All popups inside toolbar div, `position: absolute; left: 0; top: 12` (no per-button position computation)
- Click-outside closes the entire toolbar

| Button     | Popup                       | Detail                              |
| ---------- | --------------------------- | ----------------------------------- |
| Line color | `ColorPicker`               | Updates `drawing.color`             |
| Text color | `ColorPicker`               | Updates `drawing.textColor`         |
| Label "T"  | Text input                  | Enter/blur commits, Escape cancels  |
| Line width | Table (1/2/3/4 px)          | Updates `drawing.lineWidth`         |
| Line style | Table (Solid/Dashed/Dotted) | Updates `drawing.lineStyle`         |
| Lock       | Toggle                      | Updates `drawing.isLocked`          |
| Delete (✕) | Direct                      | `removeDrawing(id)`                 |
| Kebab (⋯)  | Menu                        | Clone, Visual Order submenu, Delete |

---

## KebabMenu (`KebabMenu.tsx`)

- Options: **Clone**, **Visual Order** (submenu trigger), **Delete**
- Visual Order submenu opens at `left-full` with TradingView-style table:
  - Bring to front, Send to back, Bring forward, Send backward
- `overflow-hidden` removed from root menu so submenu is not clipped
- Click-outside closes

---

## ColorPicker (`ColorPicker.tsx`)

- 10 grays (`#ffffff` → `#000000`) + 6 rows × 10 columns of color swatches
- Selected color shown with white ring (`ring-2 ring-white/60`)
- Click-outside closes

---

## Hover Legend Gating

The OHLC overlay in `ChartPanel.tsx:544` is hidden when `inProgressDrawing !== null` (actively placing a drawing):

```tsx
{hoverData && !inProgressDrawing && ( /* hover legend */ )}
```

---

## What's Implemented (Working)

- [x] Trendline placement (click A → move preview → click B)
- [x] In-progress dashed preview via `subscribeCrosshairMove`
- [x] Single drawing per placement (two-point trendline)
- [x] Selection via `hoveredObjectId` / click-on-body / click-on-handle
- [x] Handle drag to resize (pointer capture)
- [x] Body drag to translate (pointer capture)
- [x] Properties toolbar position at trendline midpoint
- [x] Toolbar drag-to-reposition
- [x] Line color, text color, label, line width, line style (solid/dashed/dotted)
- [x] Lock drawing (prevents move/resize; still selectable)
- [x] Delete with keyboard (`Delete`/`Backspace`) and toolbar button
- [x] Clone with 32px downward offset
- [x] Visual order (z-index reorder)
- [x] Persistence via localStorage (`cd-drawings` v2, migrated from v1)
- [x] Right-click exits drawing mode, restores previous tool
- [x] Escape cancels in-progress placement or deselects
- [x] Hover legend hidden during active placement
- [x] Dash/dot spacing scales with line width
- [x] Only user-set label renders (no auto price-change pill)
- [x] All popups positioned inside toolbar div (`absolute left-0 top-12`)
- [x] `data-drawing-hover` attribute on chart div when hovering a drawing
- [x] `data-drawing-active` attribute when line tool is active
- [x] **Horizontal line** (`horizontal`) — 1-click placement, full-width line at price, draggable handle, properties toolbar
- [x] **Vertical line** (`vertical`) — 1-click placement, full-height line at time, draggable handle, properties toolbar
- [x] **Ray** (`ray`) — 2-click placement, extends infinitely past B, drag handle A or B, properties toolbar
- [x] **Parallel channel** (`parallel`) — 3-click placement, live offset preview after A+B, base line + offset line + translucent fill, 3 draggable handles
- [x] State machine refactor: `PLACING` + `PLACEMENT_CONFIGS` replaces `PLACING_A` — supports 1-click, 2-click, and 3-click tools uniformly
- [x] Per-shape rendering branches in `DrawingPrimitive` (trendline/ray/horizontal/vertical/parallel) with shared draw helpers
- [x] Per-shape hit-testing: `pointToSegmentDist` (trendline/parallel), `pointToRayDist` (ray, no clamp past B), Y/X proximity (horizontal/vertical)
- [x] Toolbar position adapts per shape (midpoint for 2-point/3-point, anchor for 1-point)
- [x] Drawing system test coverage: 65 tests (34 store + 31 coordinates)
- [x] Undo/redo stack (session-only, depth 50, `Ctrl+Z`/`Ctrl+Shift+Z`)
- [x] Eraser cursor variant — removes drawings on click (locked drawings included)
- [x] Bin tool — left-click removes all; right-click submenu with locked-drawings toggle

## What's UI Only (Not Wired)

- [ ] **Polyline** (`polyline`) — no `ISeriesPrimitive` / multi-point logic
- [ ] **Text** tool — UI button only
- [ ] **Freehand Draw** — UI button only

## Known Limitations

1. ~~`DrawingType` is `'trendline'` only~~ — ✅ Now a discriminated union with trendline, horizontal, vertical, ray
2. ~~`DrawingPrimitive` only renders 2-point trendlines~~ — ✅ Now renders trendline, ray, horizontal, vertical (single-segment; multi-segment for polyline is future work)
3. Toolbar position computed from container `getBoundingClientRect` — may break if container offset changes (e.g., scroll)
4. Clip/paste not implemented (KebabMenu shows "Copy" label concept but not wired)
5. No undo/redo
6. No snap-to-grid or snap-to-ohlc
7. ~~Zero test coverage~~ — ✅ 59 tests (32 store + 27 coordinates)
8. ~~`pointToSegmentDist` duplicated~~ — ✅ Extracted to `drawing/coordinates.ts` along with `pointToRayDist`
9. ~~Line-body hit-testing logic duplicated 3×~~ — ✅ `hitTestBodies` in `drawing/coordinates.ts` centralises per-shape dispatch
10. ~~`lineTool` prop is dead input~~ — ✅ Click handler uses `activeToolRef.current` via `PLACEMENT_CONFIGS`

---

## Eraser & Bin Tool Plan

### Feature 1: Eraser Mode (Cursor Variant)

The eraser already exists as a cursor variant in `cursors.tsx` (`CursorVariantId = 'eraser'`, `EraserIcon`, `CURSOR_CSS_MAP.eraser`). It's selectable from the cursor tool's right-click submenu.

**Behavior (TradingView reference):**

| Action                    | Behavior                                  |
| ------------------------- | ----------------------------------------- |
| Hover over drawing body   | Eraser cursor, body highlights            |
| Left-click on drawing     | Remove it (with undo snapshot)            |
| Left-click on empty space | No-op                                     |
| Right-click               | Exit eraser mode, restore previous cursor |
| Escape                    | Exit eraser mode                          |

Locked drawings: Eraser CAN remove them. `isLocked` only prevents drag/handle editing, not eraser deletion.

**No `DrawingPrimitive` changes needed**: `hitTest` already returns body hits for locked drawings (lines 694, 716, 745-751, 782-788, 806-816). Only handle hits are skipped for locked drawings. Since eraser only needs body hits, existing hit test works as-is.

**Changes:**

1. `useDrawingInteraction.ts` — Add `cursorVariant` prop + eraser remove-on-click logic
2. `ChartPanel.tsx` — Pass `cursorVariant` to hook
3. `MultiChartArea.tsx` — Pass `cursorVariant` through
4. `DashboardPage.tsx` — Pass `cursorVariant` to `MultiChartArea`, track variant in `previousToolRef`

### Feature 2: Bin Tool (Toolbar + Right-Click Submenu)

Replaces the existing "Clear All" button. Left-click removes all drawings. Right-click opens submenu.

**Submenu (TradingView reference):**

```
┌─────────────────────────────────┐
│  Remove N drawings              │
├─────────────────────────────────┤
│  Always remove locked    [toggle]│
└─────────────────────────────────┘
```

- "Remove N drawings" — N = total count. Respects the locked toggle.
- "Always remove locked drawings" — toggle, OFF by default. When OFF, `removeAll` keeps locked drawings. When ON, removes everything.

**Changes:**

1. `drawingStore.ts` — Add `removeAll`, `alwaysRemoveLocked`, `setAlwaysRemoveLocked`
2. `LeftToolbar.tsx` — Rename `clear` → `bin`, add right-click submenu
3. `BinToolMenu.tsx` — New file: submenu component
4. `DashboardPage.tsx` — Handle bin tool click (call `removeAll`, don't switch `activeTool`)

**File Change Summary:**

| File                       | Change                                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| `drawingStore.ts`          | Add `removeAll`, `alwaysRemoveLocked`, `setAlwaysRemoveLocked`              |
| `useDrawingInteraction.ts` | Add `cursorVariant` prop, eraser remove logic                               |
| `ChartPanel.tsx`           | Pass `cursorVariant` to hook                                                |
| `MultiChartArea.tsx`       | Pass `cursorVariant` through                                                |
| `DashboardPage.tsx`        | Pass `cursorVariant`, handle `bin` tool, track variant in `previousToolRef` |
| `LeftToolbar.tsx`          | Rename `clear`→`bin`, add right-click submenu                               |
| `BinToolMenu.tsx`          | **New** — submenu component                                                 |

---

## Architectural Review (2026-07-11)

> Senior-engineer design review. Identifies what will break or become painful once
> more tools are added. Each finding cites actual file/function and states clearly
> whether it IS a problem.

### Data Model (`types.ts`)

**`DrawingType = 'trendline'` (line 5) is a single-member string literal — not a type system, a constant.** This is the root problem. Every downstream file branches on `drawing.type`. Right now there's one branch. The moment horizontal ships, `TrendlineRenderer.draw()` (`DrawingPrimitive.ts:85`) and `hitTest()` (`DrawingPrimitive.ts:232`) each gain an `if/else`. By the time parallel channel lands, you have a switch statement in a hot-path canvas render method.

**`Drawing` is a flat bag of 10 fields (lines 14–25).** `type` and `points[]` sit alongside `color`, `lineWidth`, `label`, etc. Horizontal line needs 1 point. Parallel channel needs 3. Rectangle needs `fillColor`/`fillOpacity`. All will pile into the same flat interface. TypeScript can't narrow `points` based on `type` — no compile-time safety on array length or shape.

**`InProgressDrawing` (lines 27–31) has no concept of "which point am I placing."** The state machine uses `points.length === 1` to detect preview. For polyline (click A, B, C…) you need to know you're on point N. For parallel, you need to know you've placed 2 points and are now placing the offset.

**Verdict: IS a problem.** Needs a discriminated union before any new shape is wired.

### State Machine (`useDrawingInteraction.ts`)

**`subscribeClick` handler (lines 170–253) is a 100-line if/else chain on `DrawState`.** The `PLACING_A` state works for 2-point trendline. But:

- Horizontal/Vertical (1-click): no preview needed — currently would enter `PLACING_A` then immediately commit (2 state transitions for 1 click)
- Parallel channel (3-click): needs `DRAWING → PLACING_A → PLACING_B → DRAWING` — `DrawState` has no `PLACING_B`
- Polyline (N-click + double-click): needs open-ended states + DOM `dblclick` (no `subscribeDblClick` in lightweight-charts)

**`DrawState` (line 11) is a closed union.** Adding `PLACING_B`, `PLACING_C` means every switch on `DrawState` grows. `PLACING_A`/`PLACING_B` encode "which point" in the state name — doesn't scale.

**Line 220: `type: 'trendline'` is hardcoded** — `lineTool` is dead input (stored in `lineToolRef`, never read in the click handler).

**Lines 236–244: `addDrawing` call hardcodes defaults** (`DEFAULT_COLOR`, `lineWidth: 2`, etc.) — scattered across call sites, not in a factory.

**`pointToSegmentDist` is duplicated** — identical function at `DrawingPrimitive.ts:16–33` and `useDrawingInteraction.ts:78–95`.

**Verdict: IS a problem.** Needs a placement-phase counter (`placementStep`) instead of encoding phase in state names. `lineTool` must drive placement config (point count, finish gesture).

### Rendering (`DrawingPrimitive.ts`)

**`TrendlineRenderer.draw()` (lines 44–164) is a 120-line monolith** with hardcoded `if (drawing.type !== 'trendline' || drawing.points.length < 2) continue;` at line 85. Every new shape adds a branch or splits into separate renderers.

**`hitTest()` (lines 223–273) has the same filter at line 232.** Only supports line-segment distance and endpoint proximity. No polygon hit-testing for rectangles, no infinite-line distance for rays, no Y-coordinate proximity for horizontals.

**Handles hardcoded to exactly 2 endpoints (lines 149–152):** `for (const [hx, hy] of [[bx1, by1], [bx2, by2]])`. Parallel needs 3 handles, rectangle needs 4, polyline needs N.

**Label rendering assumes midpoint of a 2-point line (lines 120–121):** `midBx = (bx1 + bx2) / 2`. Wrong for horizontal (center horizontally), ray (near point A), rectangle (center of box).

**In-progress preview is trendline-only (lines 60–78):** Dashed line from `points[0]` to `hoverPoint`. Each shape needs its own preview.

**Verdict: IS a problem.** Must split into a per-shape renderer registry.

### Store (`drawingStore.ts`)

**`addDrawing` (line 19) takes `Omit<Drawing, 'id' | 'zIndex'>` — no shape-specific factory.** Defaults scattered in `useDrawingInteraction.ts:236`.

**`cloneDrawing` (lines 89–107) uses naive `priceOffset` on all points.** Works for trendlines. Wrong for every other shape — a cloned parallel channel's 3-point geometry will be mangled.

**Persist `version: 1` with no `migrate` function (line 111).** Schema restructure needs a migration.

**No undo/redo.** Every action mutates irreversibly. Top-3 pain point once users have 20+ drawings.

**`selectedDrawingId` correctly excluded from persistence** (`partialize` at line 112) — fine as-is.

**Verdict: Factory + migration needed. Undo/redo is medium-term, not blocking.**

### Toolbar / UI (`ChartPanel.tsx`, `DrawingPropertiesMenu.tsx`)

**Toolbar position assumes exactly 2 points (`ChartPanel.tsx:382–385`):** Reads `drawing.points[0]` and `drawing.points[1]`. For horizontal (1 point), `points[1]` is `undefined` → toolbar vanishes. For parallel (3 points), midpoint ignores the offset. For polyline (N points), should be bounding-box center.

**`ChartPanel.tsx:394` uses `getBoundingClientRect()`.** Latent scroll-safety bug — hasn't manifested because the dashboard doesn't scroll today.

**`DrawingPropertiesMenu` always shows all 8 buttons.** Rectangle would need fill color instead of line color. Toolbar should conditionally render buttons per shape.

**Verdict: Toolbar position IS broken for non-2-point shapes. Button adaptation is nice-to-have.**

---

## Proposed Architecture

### Discriminated Union (`types.ts`)

```ts
export interface TrendlineData {
  type: 'trendline';
  points: [DrawingPoint, DrawingPoint];
}
export interface HorizontalData {
  type: 'horizontal';
  points: [DrawingPoint];
}
export interface VerticalData {
  type: 'vertical';
  points: [DrawingPoint];
}
export interface RayData {
  type: 'ray';
  points: [DrawingPoint, DrawingPoint];
}
export interface ParallelData {
  type: 'parallel';
  points: [DrawingPoint, DrawingPoint, DrawingPoint];
}
export interface PolylineData {
  type: 'polyline';
  points: DrawingPoint[];
} // ≥2

export type ShapeData =
  | TrendlineData
  | HorizontalData
  | VerticalData
  | RayData
  | ParallelData
  | PolylineData;
export type DrawingType = ShapeData['type'];

export interface Drawing {
  id: string;
  zIndex: number;
  isLocked: boolean;
  label?: string;
  color: string;
  textColor: string;
  lineWidth: number;
  lineStyle: LineStyle;
  shape: ShapeData; // ← replaces flat `type` + `points`
}
```

**Tradeoff:** Breaking change to `cd-drawings` persisted schema. Bump version 1→2, write one migration function that wraps old `{type, points}` into `{shape: {type, points}}`. Savings: TypeScript narrows `drawing.shape` automatically — compile-time safety on point counts.

### Per-Shape Renderer Registry

```ts
export interface ShapeRenderer<S extends ShapeData = ShapeData> {
  draw(shape: S, style: DrawingStyle, isSelected: boolean, rc: RenderContext): void;
  drawPreview(placedPoints: DrawingPoint[], hoverPoint: DrawingPoint, rc: RenderContext): void;
  hitBody(shape: S, mx: number, my: number, rc: RenderContext): number | null;
  getHandles(shape: S, rc: RenderContext): HandlePos[];
  getToolbarAnchor(shape: S, rc: RenderContext): { x: number; y: number } | null;
}

export const RENDERERS: Record<ShapeData['type'], ShapeRenderer> = {
  trendline: new TrendlineRenderer(),
  horizontal: new HorizontalRenderer(),
  // ...
};
```

`DrawingPrimitive.draw()` → 20-line dispatcher. Each renderer independently testable. Hit-test parity guaranteed by the interface.

### Placement Phase Counter

```ts
type DrawState = 'IDLE' | 'DRAWING' | 'PLACING' | 'DRAGGING_HANDLE' | 'DRAGGING_DRAWING';

interface PlacementConfig {
  totalPoints: number; // 0 = open-ended (double-click to finish)
  showPreview: boolean;
  finishOn: 'click' | 'dblclick';
}

const PLACEMENT_CONFIGS: Record<LineToolId, PlacementConfig> = {
  trendline: { totalPoints: 2, showPreview: true, finishOn: 'click' },
  horizontal: { totalPoints: 1, showPreview: false, finishOn: 'click' },
  vertical: { totalPoints: 1, showPreview: false, finishOn: 'click' },
  ray: { totalPoints: 2, showPreview: true, finishOn: 'click' },
  parallel: { totalPoints: 3, showPreview: true, finishOn: 'click' },
  polyline: { totalPoints: 0, showPreview: true, finishOn: 'dblclick' },
};
```

State machine: `DRAWING → (click) → PLACING (step=1) → (click, step<total) → PLACING (step++) → (click, step===total) → DRAWING (commit)`. Double-click finish via DOM `dblclick` listener + `lastClickTimeRef` guard in `subscribeClick`.

### Store Factory + Migration

```ts
addDrawing(d: { shape: ShapeData } & Partial<Omit<Drawing, 'id' | 'zIndex' | 'shape'>>) { ... }
```

v1→v2 migration wraps old `{type, points}` into `{shape: {type, points}}`.

### Undo/Redo (Medium-Term)

Session-only `_undoStack` / `_redoStack` (depth 50, excluded from `partialize`). `Ctrl+Z` / `Ctrl+Shift+Z` in keyboard handler.

### Shared Coordinate Utilities

New `drawing/coordinates.ts` — `pointToSegmentDist`, `pointToInfiniteLineDist` (for ray/horizontal/vertical), `pointToPixel`, `pixelToPoint`. Eliminates the 3-way duplication.

---

## Prioritized Implementation Plan

### Priority 1 — Foundation (unblocks all shapes)

> Do this FIRST. ~3–4 days. Not user-visible, but highest-leverage investment.
> Wiring shapes before this means re-doing the work when the abstraction lands.

| #    | Task                                                                                     | Files touched                                                                                                                                    | Breaking?                               | Complexity |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------- |
| P1.1 | Discriminated union: `Drawing.shape: ShapeData` replaces flat `type` + `points`          | `types.ts`, `drawingStore.ts`, `DrawingPrimitive.ts`, `useDrawingInteraction.ts`, `DrawingPropertiesMenu.tsx`, `ChartPanel.tsx`, `KebabMenu.tsx` | **Yes** — `cd-drawings` v1→v2 migration | Large      |
| P1.2 | Extract shared coordinate utilities                                                      | `drawing/coordinates.ts` (new), `useDrawingInteraction.ts`, `DrawingPrimitive.ts`                                                                | No                                      | Small      |
| P1.3 | Per-shape renderer registry (`ShapeRenderer` interface + port `TrendlineRenderer` to it) | `drawing/ShapeRenderer.ts` (new), `drawing/renderers/TrendlineRenderer.ts` (new), `DrawingPrimitive.ts`                                          | No (internal refactor)                  | Large      |
| P1.4 | Store `createDrawingDefaults()` factory + `addDrawing` refactor                          | `drawingStore.ts`                                                                                                                                | No (internal API)                       | Small      |
| P1.5 | `getToolbarAnchor` per-shape — delegate from `ChartPanel.tsx:382–403`                    | `ChartPanel.tsx`, each renderer                                                                                                                  | No                                      | Small      |
| P1.6 | Drawing system test scaffolding (store tests + renderer hitTest/draw unit tests)         | `__tests__/drawingStore.test.ts` (new), `__tests__/ShapeRenderer.test.ts` (new)                                                                  | No                                      | Medium     |

### Priority 2 — Simple shapes

> After the foundation lands. Each shape is independently shippable.

| #    | Task                                                                                                             | Files touched                           | Breaking?     | Complexity |
| ---- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------- | ---------- |
| P2.1 | State machine refactor: `PLACING` + `placementStep` replaces `PLACING_A`; `PLACEMENT_CONFIGS` drives point count | `useDrawingInteraction.ts`              | No (internal) | Medium     |
| P2.2 | Horizontal line renderer + 1-click placement                                                                     | `renderers/HorizontalRenderer.ts` (new) | No            | Medium     |
| P2.3 | Vertical line renderer + 1-click placement                                                                       | `renderers/VerticalRenderer.ts` (new)   | No            | Medium     |
| P2.4 | Ray renderer + 2-click placement (extends infinitely past B)                                                     | `renderers/RayRenderer.ts` (new)        | No            | Medium     |

### Priority 3 — Multi-point shapes

> Most complex shapes. Requires the P2.1 state machine refactor.

| #    | Task                                                          | Files touched                                                     | Breaking? | Complexity |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------- | --------- | ---------- |
| P3.1 | Parallel channel renderer + 3-click placement                 | `renderers/ParallelRenderer.ts` (new), `useDrawingInteraction.ts` | No        | Large      |
| P3.2 | Polyline renderer + N-click placement + DOM `dblclick` finish | `renderers/PolylineRenderer.ts` (new), `useDrawingInteraction.ts` | No        | Large      |

### Priority 4 — Quality

> User-visible quality improvements. Ship after all 6 line tools are wired.

| #    | Task                                                                              | Files touched                                 | Breaking? | Complexity |
| ---- | --------------------------------------------------------------------------------- | --------------------------------------------- | --------- | ---------- |
| P4.1 | Undo/redo stack (session-only, depth 50, `Ctrl+Z`/`Ctrl+Shift+Z`)                 | `drawingStore.ts`, `useDrawingInteraction.ts` | No        | Medium     |
| P4.2 | Per-shape `cloneDrawing` logic (delegate to renderer or factory)                  | `drawingStore.ts`                             | No        | Small      |
| P4.3 | `DrawingPropertiesMenu` conditionally renders buttons per shape capabilities      | `DrawingPropertiesMenu.tsx`                   | No        | Small      |
| P4.4 | `getBoundingClientRect` scroll-safety audit (reposition toolbar on scroll/resize) | `ChartPanel.tsx`                              | No        | Small      |

### Priority 5 — Polish (future)

| #    | Task                                               | Files touched                             | Breaking? | Complexity |
| ---- | -------------------------------------------------- | ----------------------------------------- | --------- | ---------- |
| P5.1 | Snap-to-OHLC for horizontal/vertical/ray           | `useDrawingInteraction.ts`, per-renderer  | No        | Medium     |
| P5.2 | Text tool (anchored annotation)                    | new `TextData` variant, new renderer      | No        | Large      |
| P5.3 | Rectangle tool (4-corner fill)                     | new `RectangleData` variant, new renderer | No        | Large      |
| P5.4 | Freehand draw (pointer path → simplified polyline) | new renderer, `useDrawingInteraction.ts`  | No        | Large      |
| P5.5 | Fibonacci retracement / extension                  | new `FibonacciData` variant, new renderer | No        | Large      |

### Why the roadmap ordering changed

The original roadmap said: _"Wire horizontal, vertical, ray, parallel first, then polyline."_

This is wrong. Wiring those tools before the type-system + renderer-registry foundation (P1) means:

1. You add `if (drawing.type === 'horizontal')` branches to the `TrendlineRenderer.draw()` monolith and `hitTest()`.
2. You special-case `PLACING_A` for 1-click tools.
3. When the renderer registry lands (P1.3), you rip out the code you just added.

**Correct order: foundation first (P1), THEN shapes (P2–P3).** P1 is ~3–4 days that saves re-doing work on every subsequent shape. Test scaffolding (P1.6) is inserted before any new shapes because the P1.1 refactor touches 7 files with zero existing test coverage.

---

## Priority 6 — Text & Notes drawing tools

> 5 sub-tools under a new Text-and-Notes toolbar submenu mirroring TradingView's "Text and notes" group.
> Locked plan (visual Q&A complete; skill-loaded review complete: `drawing-tools`, `lightweight-charts-patterns`, `figma-theme-source`).

### Scope (final)

Five tools under the LeftToolbar Text submenu, in display order:

| Order | ID           | Tool        | Editable body | Geometry                                                              |
| ----- | ------------ | ----------- | ------------- | --------------------------------------------------------------------- |
| 0     | `text`       | Text        | Yes           | Bare multiline text at anchor                                         |
| —     | `null`       | separator   | —             | —                                                                     |
| 2     | `note`       | Note        | Yes           | Sticky-note box pinned at (time, price), no extra geometry            |
| 3     | `callout`    | Callout     | Yes           | Rounded box offset from anchor + leader tail                          |
| —     | `null`       | separator   | —             | —                                                                     |
| 5     | `priceNote`  | Price Note  | Yes           | Note box at anchor + dashed lead line + right-edge price pill         |
| 6     | `priceLabel` | Price Label | No            | Pill badge at anchor showing formatted `anchor.price` (auto-rendered) |

**Explicitly out of scope**: Flag mark, Pin, Table, Comment, Signpost, Idea, Post, Image (other entries in TradingView's "Text and notes" and "Content" groups).

### Locked defaults

| Token                                              | Value                                                     | Source                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Default box fill (`backgroundColor` field default) | `bg.panel` (`#25234e`)                                    | existing `tokens.ts` (Exgen-sourced) — no Figma mint pass required                       |
| Default text color (`textColor`)                   | `color.white` (`#fcfcfd`)                                 | existing — already set in `drawingStore.ts:13`                                           |
| Default border/pin accent (`color`)                | `color.purple`                                            | existing                                                                                 |
| Default font family                                | `font.sans` (`Geist Variable, ui-sans-serif, sans-serif`) | existing — already used by chart + line-label                                            |
| Default font size                                  | **14**                                                    | new `fontSize` field on `Drawing`; TradingView default; chart axis = 12, line label = 24 |
| Font-size preset chip ladder                       | `10/12/14/16/18/20/24/28/32`                              | TradingView-eyeballed                                                                    |
| Pill radius                                        | `4px`                                                     | TradingView-eyeballed                                                                    |
| Box radius                                         | `6px`                                                     | TradingView-eyeballed                                                                    |

**Decision rules confirmed with the user:**

- Text content storage → **reuse existing `Drawing.label`** (allow `\n` for multiline). No new field, no `text` field.
- Edit UX → **on-chart HTML `<textarea>` overlay** via `createPortal`. Repositions with viewport during pan/zoom (existing `viewportVersion` state). Commit on blur + Enter; multiline via Shift+Enter; Escape cancels and discards. Autofocus + select-all on mount.
- Default label after placement → **empty + textarea autofocus + placeholder "Enter text"**. No "Text"/"Note" marker string.
- Price label content → **auto-formatted `anchor.price`** (`toLocaleString`, 2 decimals). Not editable.
- Price label scheme → `drawing.color` fill + `drawing.textColor` text (confirmed by TradingView screenshot showing blue pill / white "63,485").
- Transaction under pan/zoom → textarea **repositions with viewport** (does not cancel).
- Lock / Trash / Kebab → **stay shape-agnostic** (no per-shape conditional).
- Hexagon/settings panel → **defer to post-v1**.
- Per-tool menu capability matrix → **required for v1** (P6.9 — no longer deferred). Drives conditional button rendering per `shape.type`.

### TradingView per-tool menu reference

Captured from screenshots (vision-read via `vision-opencode-go-grok-4.5`):

| Tool                     | Top-row buttons (L→R)                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Text                     | grip · clone-template · **pencil (edit text)** blue · **paint-drop (fill)** blue · **T (text color)** white · hexagon · lock · trash · ⋯ |
| Note                     | grip · clone-template · **T (text style)** · **"20" (font size)** · hex · lock · **anchor** · trash · ⋯                                  |
| Price Note               | grip · clone-template · **pencil (edit)** · **eyedropper (fill)** · **T (text)** · gear · lock · trash · ⋯                               |
| Price Label              | grip · clone-template · **T (text)** · **paint-drop (fill)** · **"14" (font size)** · hex · lock · trash · ⋯                             |
| Flag Mark (out of scope) | grip · clone-template · paint-drop · hex · lock · trash · ⋯                                                                              |

**Consistent trading axis**: drag-grip · clone-template · per-tool content · hex/settings · lock · trash · ⋯

---

### Phase P6.1 — Schema & store foundation

| #      | Task                                                                                                                                             | File                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| P6.1.1 | Add 5 `ShapeData` variants (`text`, `note`, `priceNote`, `callout`, `priceLabel`), each single-anchor `points: DrawingPoint[]` (exactly 1)       | `apps/client/src/lib/drawing/types.ts:49–55`    |
| P6.1.2 | Add `fontSize: number` (default 14) and `backgroundColor: string` (default `bg.panel` `#25234e`) to `Drawing` interface + `createDrawingStyle()` | `apps/client/src/store/drawingStore.ts:12–33`   |
| P6.1.3 | Bump persistence v2 → v3 with `migrateV2toV3` backfilling `fontSize: 14`, `backgroundColor: bg.panel` defaults on every persisted drawing        | `apps/client/src/store/drawingStore.ts:254–266` |
| P6.1.4 | `cloneDrawing` continues to work for single-anchor shapes — existing priceOffset code at `drawingStore.ts:208–224` already handles 1-point       | no change                                       |

### Phase P6.2 — Tool registry & icons

| #      | Task                                                                                                                                                                     | File                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| P6.2.1 | New `apps/client/src/lib/textNotes.tsx` exporting `TextNoteToolId = 'text' \| 'note' \| 'priceNote' \| 'callout' \| 'priceLabel'` + `TEXT_NOTES` array (5 entries)       | new file                        |
| P6.2.2 | Embed the 5 SVG icons verbatim from the TradingView markup (`LineToolText`, `LineToolTextNote`, `LineToolPriceNote`, `LineToolCallout`, `LineToolPriceLabel`)            | new file                        |
| P6.2.3 | Verify defaults against existing `tokens.ts` (no Figma mint pass required — all defaults reuse existing Exgen-sourced values; only `fontSize=14` is annotation-specific) | `apps/client/src/lib/tokens.ts` |

### Phase P6.3 — LeftToolbar Text-and-Notes submenu

Mirror the cursor-variant submenu (`LeftToolbar.tsx:426–498`) byte-for-byte.

| #      | Task                                                                                                                                                                            | Location                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| P6.3.1 | Promote `text` `TOOLS` entry from generic branch (`LeftToolbar.tsx:390–423`) to a new `isText` branch with chevron + `onContextMenu`                                            | `LeftToolbar.tsx:23, 240–423` |
| P6.3.2 | Add local state: `showTextMenu`, `textBtnRef`, `textMenuRef`, `textMenuPos` + controlled prop mirror                                                                            | `LeftToolbar.tsx:48–75`       |
| P6.3.3 | `handleTextContextMenu` (toggle open, position 6px right) — mirror `handleCursorContextMenu` `198–205`                                                                          | `LeftToolbar.tsx`             |
| P6.3.4 | `handleTextNoteSelect(id)` callback — mirror `handleCursorVariantSelect` `207–213`: `setActiveTool(id)`, fire `onToolChange?.(id, lineTool)` + new `onTextNoteToolChange?.(id)` | `LeftToolbar.tsx`             |
| P6.3.5 | Add click-outside `useEffect` for `showTextMenu` — mirror `162–178`                                                                                                             | `LeftToolbar.tsx`             |
| P6.3.6 | Add AnimatePresence submenu mapping `TEXT_NOTES` — mirror `426–498` (replace `cursorVariant === variant.id` with `textTool === variant.id`)                                     | `LeftToolbar.tsx`             |
| P6.3.7 | Extend props interface: add `textTool?: TextNoteToolId; onTextNoteToolChange?: (id: TextNoteToolId) => void`                                                                    | `LeftToolbar.tsx:31–38`       |
| P6.3.8 | Update `data-drawing-active` to include text/note ids — extend the `'line'` check at `DashboardPage.tsx:378` to `LINE_TOOLS.some(...) \|\| TEXT_NOTES.some(...)`                | `DashboardPage.tsx`           |

### Phase P6.4 — DashboardPage state & threading

| #      | Task                                                                                                                                                                   | Location                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| P6.4.1 | Add `selectedTextNoteTool` state (default `'text'`)                                                                                                                    | `DashboardPage.tsx:88–92`            |
| P6.4.2 | Extend `handleToolChange` — treat the 5 text/note ids like line-tool ids for `previousToolRef` save + cursor reset; add `textToolId` param + `setSelectedTextNoteTool` | `DashboardPage.tsx:94–109`           |
| P6.4.3 | Pass new props to LeftToolbar (`textTool`, `onTextNoteToolChange`) and MultiChartArea                                                                                  | `DashboardPage.tsx:361–368, 383–389` |
| P6.4.4 | Thread prop chain through `MultiChartArea.tsx:95–107` and `ChartPanel.tsx:38–46, 355–364`                                                                              | two files                            |

### Phase P6.5 — Placement / state machine

| #      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                           | Location                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| P6.5.1 | Recognize `TEXT_NOTES` ids as drawing tools in `isLineTool` (rename to `isDrawingTool` or add sibling `isTextNoteTool`)                                                                                                                                                                                                                                                                                                                        | `useDrawingInteraction.ts:55–57` |
| P6.5.2 | Add `PLACEMENT_CONFIGS` entries for `text`, `note`, `priceNote`, `callout`, `priceLabel`: `{ totalPoints: 1, finishOn: 'click' }`                                                                                                                                                                                                                                                                                                              | `useDrawingInteraction.ts:46–53` |
| P6.5.3 | Extend the 1-click branch (`useDrawingInteraction.ts:205–213`) so after commit `store.selectDrawing(newId)` it sets a new `editingDrawingIdRef.current` + emits `onRequestEdit?.(id)` for text/note/priceNote/callout (NOT priceLabel). **Hot-path discipline**: continue using `stateRef` / `activeToolRef` only — never capture `activeTool` closure (handler must stay zero-recreation per render per `lightweight-charts-patterns` skill). | `useDrawingInteraction.ts`       |
| P6.5.4 | Pass `onRequestEdit` callback through `ChartPanel` → `useDrawingInteraction`                                                                                                                                                                                                                                                                                                                                                                   | `ChartPanel.tsx:355–364`         |
| P6.5.5 | Existing `subscribeDblClick` (`useDrawingInteraction.ts:268–317`) extended: when NOT in PLACING and `param.hoveredObjectId` matches a text/note/priceNote/callout drawing, fire `onRequestEdit?.(id)` to open the textarea editor                                                                                                                                                                                                              | `useDrawingInteraction.ts`       |

Default label setting: `addDrawing` is called with **no `label`** — the textarea overlay pops up with placeholder "Enter text".

### Phase P6.6 — Renderer (`DrawingPrimitive.ts`, `coordinates.ts`)

| #      | Task                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6.6.1 | `drawTextShape` — bare multiline text at anchor (split `label` on `\n`); uses `fontSize`, `textColor`, `font.sans`. 1 handle.                                                                                                                                                                                                         |
| P6.6.2 | `drawNoteShape` — rounded-rect box with `backgroundColor` fill + `color` 1px border + multiline `label` inside + small pin circle at anchor. 1 handle.                                                                                                                                                                                |
| P6.6.3 | `drawPriceNoteShape` — Note's box + dashed horizontal line from box to right edge + price pill (right-axis docked) showing formatted `anchor.price`. Reuse new `drawPricePill(price, ...)` helper so P6.6.5 shares code. 1 handle.                                                                                                    |
| P6.6.4 | `drawCalloutShape` — rounded box + leader line to anchor. 1 handle (anchor only).                                                                                                                                                                                                                                                     |
| P6.6.5 | `drawPriceLabelShape` — pill badge docked at anchor's time, vertically centered at anchor's price; pill fill=`color`, pill text = formatted price in `textColor`. 1 handle.                                                                                                                                                           |
| P6.6.6 | Extend `draw()` switch (`DrawingPrimitive.ts:530–608`) + `hitTest` (`676–838`) with the 5 new shape branches. Body hit-test: `pointInRect` (new) for box shapes + existing `pointToSegmentDist` for callout leader + priceNote dashed line + priceNote right-axis pill hit + horizontal-line Y proximity for priceNote's dashed line. |
| P6.6.7 | New pure helpers in `apps/client/src/lib/drawing/coordinates.ts`: `pointInRect(x, y, rx, ry, rw, rh)`, `computeTextBox(ctx, text, fontSize, font)` — shared by renderer + editor for box bounds.                                                                                                                                      |
| P6.6.8 | No in-progress preview — 1-click tools (consistent with horizontal/vertical which already skip preview).                                                                                                                                                                                                                              |
| P6.6.9 | New `apps/client/src/lib/drawing/textLayout.ts` — pure functions for splitting `label` on `\n` + measuring with `ctx.measureText` + computing box bounds. **Both** the renderer and the on-chart textarea editor must produce identical box bounds (else the textarea drifts from the canvas text).                                   |

### Phase P6.7 — ChartPanel

| #      | Task                                                                                                                                                                                                                                                                           | Location                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| P6.7.1 | Toolbar anchor unchanged — already defaults to single anchor for 1-point shapes at `ChartPanel.tsx:415–424`                                                                                                                                                                    | no change                         |
| P6.7.2 | Pass `onRequestEdit` callback from primitive → hook → panel; add `editingDrawingId` state + ref. **Confirm editor is a React portal (not `ISeriesPrimitive`)** so existing `chart.remove()` cleanup path stays correct per `lightweight-charts-patterns` skill lifecycle rule. | `ChartPanel.tsx:118–127, 355–364` |
| P6.7.3 | Hide hover legend while editing — extend `ChartPanel.tsx:621` condition to `&& !inProgressDrawing && !editingDrawingId`                                                                                                                                                        | `ChartPanel.tsx:621`              |
| P6.7.4 | Mount the new `TextDrawingEditor` portal block — adjacent to existing DrawingPropertiesMenu portal at `ChartPanel.tsx:716–746`                                                                                                                                                 | `ChartPanel.tsx:716`              |

### Phase P6.8 — On-chart textarea editor (new file)

| #      | Task                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6.8.1 | New `apps/client/src/components/drawing/TextDrawingEditor.tsx` — `createPortal` to `document.body`. Style: `background: drawing.backgroundColor`, `color: drawing.textColor`, `font: ${drawing.fontSize}px ${font.sans}`, border `1px solid ${color.purple}`. Position computed from container rect + anchor screen coords + measured box bounds (shared with renderer via `textLayout.ts`). |
| P6.8.2 | Mount in ChartPanel when `editingDrawingId` set. Props: `drawing`, `position`, `onCommit(text)`, `onCancel()`.                                                                                                                                                                                                                                                                               |
| P6.8.3 | Commit on blur + Enter (without Shift) — `onCommit` writes `updateDrawing(id, { label: text })` then closes. Shift+Enter for newline (multiline). Escape cancels and clears (discards).                                                                                                                                                                                                      |
| P6.8.4 | Reposition on pan/zoom via existing `viewportVersion` (`ChartPanel.tsx:377`) — pass into editor as a dependency.                                                                                                                                                                                                                                                                             |
| P6.8.5 | Autofocus + select-all on mount (`HTMLTextAreaElement.select()`). Placeholder = "Enter text".                                                                                                                                                                                                                                                                                                |
| P6.8.6 | Per-shape editor mount offsets — text overlays text bounds directly; note/priceNote/callout overlay the box area.                                                                                                                                                                                                                                                                            |

### Phase P6.9 — Per-tool conditional properties menu (REQUIRED for v1)

> Was deferred as roadmap P4.3. Promoted to required after per-tool screenshots confirmed TradingView itself conditionally renders per shape.

Implement the **capability matrix** in `DrawingPropertiesMenu.tsx`. Button visibility is driven by the active shape's `shape.type`.

| Button                   | Line tools (existing) | Text                | Note                | Price Note          | Callout             | Price Label      |
| ------------------------ | --------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ---------------- |
| Line/border color        | ✓                     | ✗                   | ✓                   | ✓                   | ✓                   | ✓                |
| **Fill color (NEW)**     | parallel only         | ✗                   | ✓                   | ✓                   | ✓                   | ✓                |
| Text color               | label only            | body                | body                | body                | body                | pill text        |
| Label/T editor           | single-line input     | **textarea editor** | **textarea editor** | **textarea editor** | **textarea editor** | ✗ (not editable) |
| **Font-size chip (NEW)** | ✗                     | ✓                   | ✓                   | ✓                   | ✓                   | ✓                |
| Line width               | ✓                     | ✗                   | ✓                   | ✓                   | ✓                   | ✓                |
| Line style               | ✓                     | ✗                   | ✓                   | ✓                   | ✓                   | ✓                |
| Lock / Trash / Kebab     | ✓                     | ✓                   | ✓                   | ✓                   | ✓                   | ✓                |

| #      | Task                                                                                                                                                                                                                                                                                 | Location                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| P6.9.1 | Add a `ShapeCapabilities` map keyed by `DrawingType` → set of buttons shown. Apply at the top of the render to filter button list.                                                                                                                                                   | `DrawingPropertiesMenu.tsx`               |
| P6.9.2 | Add **Fill color** button (paint-drop SVG from TradingView markup) — opens existing `ColorPicker`, writes `drawing.backgroundColor`. Hidden for `text` (no box) and existing line tools (except parallel which already uses translucent fill — wire fill for parallel too for free). | `DrawingPropertiesMenu.tsx:137–178`       |
| P6.9.3 | Add **Font-size chip** button (shows current numeric size) — opens a small dropdown (`10/12/14/16/18/20/24/28/32`). Writes `drawing.fontSize`. Hidden for existing line tools.                                                                                                       | `DrawingPropertiesMenu.tsx` (new section) |
| P6.9.4 | **Label/T button behavior pivot**: for text/note/priceNote/callout, clicking "T" opens the new `TextDrawingEditor` (P6.8) instead of the existing single-line input. Single-line input remains for line tools only. Hide the T button entirely for `priceLabel` (not editable).      | `DrawingPropertiesMenu.tsx:179–196`       |
| P6.9.5 | Hide Line/Width/Style buttons for the bare `text` shape; keep visible for note/priceNote/callout/priceLabel (their boxes use border color + width + style respectively).                                                                                                             | `DrawingPropertiesMenu.tsx:138–247`       |
| P6.9.6 | Keep Lock/Trash/Kebab shape-agnostic and always visible.                                                                                                                                                                                                                             | unchanged                                 |
| P6.9.7 | (Future) Add clone-template button next to grip — defer; Kebab "Clone" path remains the canonical way for v1.                                                                                                                                                                        | post-v1                                   |

### Phase P6.10 — Tests

| #       | Task                                                                                                                                                  | File                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| P6.10.1 | v3 migration: assert old v2 payload migrates with `fontSize`/`backgroundColor` defaults backfilled; assert round-trip preserves all 5 new shape types | `apps/client/src/__tests__/drawingStore.test.ts`                |
| P6.10.2 | `coordinates.test.ts` — `pointInRect`, `computeTextBox`, hit-test parity for all 5 new shapes (incl. priceNote dashed line + right-edge pill hits)    | `apps/client/src/__tests__/coordinates.test.ts`                 |
| P6.10.3 | Placement test — `onRequestEdit` fires for `text`/`note`/`priceNote`/`callout`; not for `priceLabel`; default `label` is `undefined` (not 'Text')     | `apps/client/src/__tests__/useDrawingInteraction.test.ts`       |
| P6.10.4 | DrawingPropertiesMenu shape-capability test — assert the expected button set renders for each shape type (lightweight, skip if too brittle)           | `apps/client/src/__tests__/DrawingPropertiesMenu.test.ts` (new) |

### Documentation

| File                    | Update                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/DRAWING_TOOLS.md` | Add this P6 section (done); after implementation, update "What's Implemented" to list the 5 tools; add a "Text & Notes tools" subsection documenting the Note-vs-Price-Note distinction + the on-chart textarea editor UX + the per-tool menu capability matrix; bump P5.2 ("Text tool") to done. |
| `AGENTS.md`             | Add a one-liner noting `drawingStore` is now `cd-drawings` v3 after P6.1.3 lands.                                                                                                                                                                                                                 |

### Execution order & rough effort

| Phase                                                    | Effort       | Independent?                     |
| -------------------------------------------------------- | ------------ | -------------------------------- |
| P6.1 Schema                                              | Small        | Unblocks all                     |
| P6.2 Registry + 5 icons                                  | Small–Medium | After P6.1                       |
| P6.3 Submenu UI                                          | Medium       | After P6.2                       |
| P6.4 State threading                                     | Small        | After P6.2                       |
| P6.5 Placement (existing 1-click branch)                 | Small        | After P6.1 + P6.4                |
| P6.6 Renderers (5 helpers + hit-tests + `textLayout.ts`) | **Large**    | After P6.1                       |
| P6.7 ChartPanel                                          | Small        | After P6.5 + P6.8                |
| P6.8 TextDrawingEditor                                   | Medium       | After P6.6 (shares `textLayout`) |
| P6.9 Conditional per-tool menu (required)                | Medium       | After P6.1 + P6.8                |
| P6.10 Tests                                              | Medium       | After P6.6 + P6.9 + P6.5         |

### Verification

```bash
pnpm --filter @crypto-dashboard/client type-check
pnpm --filter @crypto-dashboard/client test -- drawingStore
pnpm --filter @crypto-dashboard/client test -- coordinates
pnpm lint
pnpm format:check
pnpm --filter @crypto-dashboard/client dev
```

Manual smoke (per tool + cross-tool): place each of the 5; verify editor opens; type multiline; commit-on-blur; reload + persistence; drag anchor; lock + try drag (blocked) + eraser still deletes; clone via Kebab; undo/redo across edits; hover legend hidden during placement and edit; right-click exits drawing mode; price label pill updates as anchor moves; price note dashed line stretching on chart pan; box fill / font size / line color all wired through `DrawingPropertiesMenu` and persist.

Pre-commit audit: run `bug-sweep` skill mode B (PR-check / pre-commit) against the diff before the pre-commit hook fires. Catches TS-strict narrowing bugs in the new `ShapeData` discriminator branch + Zustand persistence migration issues before reaching CI.
