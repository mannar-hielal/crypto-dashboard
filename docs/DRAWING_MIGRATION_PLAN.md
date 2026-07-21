# Drawing System Migration — lightweight-charts-drawing

## Goal

Replace the custom `ISeriesPrimitive` drawing system with `lightweight-charts-drawing` (MIT, 68 tools) — a maintained library that plugs directly into `lightweight-charts` v5 via the same `ISeriesPrimitive` API we already use.

## What we gain

- **68 tools** out of the box (we have 6) — lines, channels, Fibonacci, Gann, pitchforks, shapes, annotations, forecasting
- **Bug-free hit-test, drag, resize, selection** — the library maintains it
- **Export/import JSON** (`manager.exportDrawings()` / `manager.importDrawings()`)
- **Selection events** (`manager.on('drawing:selected', ...)`)
- **No custom canvas rendering** — no `DrawingPrimitive.ts`, no renderers
- **MIT license** — commercial use OK

## What we lose

| Feature                                                               | Current                           | lightweight-charts-drawing                                         | Notes                                         |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| Per-pane drawing scope                                                | `paneIndex` filter                | Likely global — verify in demo                                     | Need to test multi-pane behaviour             |
| Undo/redo stack                                                       | Zustand undo (50-depth)           | Not in library                                                     | Can wrap `manager.exportDrawings()` snapshots |
| Custom annotation shapes (text, note, callout, priceNote, priceLabel) | 5 text tools                      | Has `TextAnnotation`, `Callout`, `Note`, `PriceNote`, `PriceLabel` | Map 1:1                                       |
| Color picker / properties menu                                        | Custom UI                         | Library has styling sub-toolbar                                    | Keep our toolbar or use theirs                |
| Drawing persistence                                                   | Zustand `persist` → localStorage  | `manager.exportDrawings()` → JSON                                  | Same concept, different API                   |
| Per-drawing locking                                                   | `isLocked` field                  | Check library API                                                  | May need wrapper                              |
| In-progress preview during placement                                  | `InProgressDrawing` state machine | Built into `DrawingManager.attach()`                               | Should be handled                             |
| Keyboard shortcuts (Delete, Escape, Ctrl+Z)                           | Custom in `useDrawingInteraction` | Check library keyboard support                                     | May need to supplement                        |

## Files to delete

| File                                               | Lines | Replacement                                     |
| -------------------------------------------------- | ----- | ----------------------------------------------- |
| `src/lib/drawing/DrawingPrimitive.ts`              | 550   | Library's internal `ISeriesPrimitive`           |
| `src/lib/drawing/types.ts`                         | 218   | Library's own types                             |
| `src/lib/drawing/coordinates.ts`                   | —     | Library's hit-test                              |
| `src/lib/drawing/HitTarget.ts`                     | —     | Removed                                         |
| `src/lib/drawing/textLayout.ts`                    | —     | Removed                                         |
| `src/lib/drawing/interactionTolerance.ts`          | —     | Removed                                         |
| `src/lib/drawing/renderers/` (7 files)             | —     | Removed                                         |
| `src/hooks/useDrawingInteraction.ts`               | 938   | Library's `DrawingManager`                      |
| `src/store/drawingStore.ts`                        | 347   | Replaced by `DrawingManager` + `exportDrawings` |
| `src/components/drawing/DrawingPropertiesMenu.tsx` | —     | Re-evaluate (library may have its own)          |
| `src/components/drawing/ColorPicker.tsx`           | —     | Keep if we want custom toolbar styling          |
| `src/components/drawing/KebabMenu.tsx`             | —     | Removed                                         |
| `src/components/drawing/TextDrawingEditor.tsx`     | —     | Library has text annotations                    |
| `src/components/drawing/BinToolMenu.tsx`           | —     | Removed (tools live in toolbar)                 |
| `src/lib/lineTools.tsx`                            | —     | Replace tool definitions with library's         |
| `src/lib/textNotes.ts`                             | —     | Replace with library's annotation tools         |

**Total removed**: ~3,500+ lines of custom drawing code.

## Files to modify

| File                                            | Change                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard/ChartPanel.tsx`       | Remove `DrawingPrimitive` import + `useDrawingInteraction` hook + `TextDrawingEditor` mount. Add `DrawingManager.attach()` + `manager.on('drawing:selected')`. Keep drawing refs as stable objects passed to the manager. |
| `src/hooks/usePaneFeeds.ts` or `ChartPanel.tsx` | Feed candle data through the manager if it needs `series.setData()` for padding (extended drawings). The library may require drawing-optimised data injection — verify.                                                   |
| `src/pages/DashboardPage.tsx`                   | Replace `useDrawingStore.getState().removeAll()` with `manager.removeAll()`. Replace `handleToolChange` to pass tool id directly to `manager.setActiveTool()`.                                                            |
| `src/components/dashboard/LeftToolbar.tsx`      | Re-wire tool selection buttons to call `manager.setActiveTool(toolId)` instead of the custom tool state machine. Keep cursor/eraser/binning as-is.                                                                        |
| `src/store/drawingStore.ts` (or new file)       | Replace with a thin wrapper: on each `manager.on('drawing:modified')` → `exportDrawings()` → persist to localStorage. On page load → `importDrawings()` from localStorage.                                                |
| `package.json`                                  | Remove `lightweight-charts-drawing` custom code, keep the npm dependency                                                                                                                                                  |

## Migration steps

### 1. Install & prototype

```bash
npm install lightweight-charts-drawing
```

Create a throwaway branch `feat/drawing-migration`. In a single `ChartPanel`, replace `DrawingPrimitive` + `useDrawingInteraction` with:

```ts
import { DrawingManager, TrendLine } from 'lightweight-charts-drawing';

const manager = new DrawingManager();
manager.attach(chart, candleSeries, container);
```

Verify: trendline placement, selection, drag, delete work on one pane.

### 2. Map tool IDs

```ts
const TOOL_MAP: Record<string, string> = {
  trendline: 'TrendLine',
  horizontal: 'HorizontalLine',
  vertical: 'VerticalLine',
  ray: 'Ray',
  parallel: 'ParallelChannel',
  polyline: 'Polyline',
  text: 'TextAnnotation',
  note: 'Note',
  callout: 'Callout',
  priceNote: 'PriceNote',
  priceLabel: 'PriceLabel',
};
```

Wire `handleToolChange` → `manager.setActiveTool(TOOL_MAP[toolId])`.

### 3. Replace drawing store with persist wrapper

```ts
class DrawingPersistence {
  constructor(private manager: DrawingManager) {
    manager.on('drawing:modified', () => this.save());
    manager.on('drawing:added', () => this.save());
    manager.on('drawing:removed', () => this.save());
  }

  save() {
    const json = this.manager.exportDrawings();
    localStorage.setItem('cd-drawings', json);
  }

  load() {
    const json = localStorage.getItem('cd-drawings');
    if (json) this.manager.importDrawings(json);
  }
}
```

Remove `useDrawingStore` entirely. Remove `cd-drawings` persist migration (v1→v4 chain) — library handles its own schema.

### 4. Wire multi-pane

`DrawingManager` takes `chart`, `series`, and `container`. Each pane gets its own `DrawingManager` instance. Cross-pane sync of drawings (same symbol → show on both) is a separate concern — implement later if needed.

Store drawings per-symbol for persistence:

```ts
const key = `cd-drawings-${symbol}`;
```

### 5. Wire toolbar buttons

- Keep `LeftToolbar.tsx` UI as-is (icon grid, cursor variants, eraser)
- Replace `setActiveTool` / `setSelectedLineTool` / `setCursorVariant` with `manager.setActiveTool(toolId)` and library cursor control
- Bin button: `manager.removeAll()`
- Eraser: check if library has built-in eraser mode, else keep our cursor variant

### 6. Remove deleted files

After confirming everything works, delete:

```bash
rm -rf apps/client/src/lib/drawing/
rm -rf apps/client/src/hooks/useDrawingInteraction.ts
rm -rf apps/client/src/store/drawingStore.ts
rm -rf apps/client/src/components/drawing/DrawingPropertiesMenu.tsx
rm -rf apps/client/src/components/drawing/KebabMenu.tsx
rm -rf apps/client/src/components/drawing/TextDrawingEditor.tsx
rm -rf apps/client/src/components/drawing/BinToolMenu.tsx
rm -rf apps/client/src/components/drawing/ColorPicker.tsx
rm -rf apps/client/src/lib/lineTools.tsx
rm -rf apps/client/src/lib/textNotes.ts
```

### 7. Remove drawing test files

```bash
rm -rf apps/client/src/store/__tests__/drawingStore.test.ts
rm -rf apps/client/src/lib/__tests__/drawingCoordinates.test.ts
rm -rf apps/client/src/lib/__tests__/drawingTextLayout.test.ts
rm -rf apps/client/src/components/drawing/__tests__/
```

### 8. Migrate existing persisted drawings

Users with drawings in `localStorage['cd-drawings']` will lose them after this migration (schema change). Either:

- Ship a one-time migration script that reads `cd-drawings`, converts each drawing to the library's JSON format, writes it back under the new key, then deletes the old key — OR
- Accept data loss (early-stage app, low user count)

### 9. Test & verify

```bash
pnpm --filter @crypto-dashboard/client type-check
pnpm lint
pnpm --filter @crypto-dashboard/client test -- --run
pnpm dev
```

Verify manually:

- Place trendline, horizontal, vertical, ray, parallel channel
- Select, drag, resize handles
- Delete via keyboard + toolbar
- Persist across page reload
- Multi-pane drawings stay on their own pane
- Export/import JSON works
- Tool switching from LeftToolbar

## Risk assessment

| Risk                                                                         | Likelihood | Mitigation                                                   |
| ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| Library v0.1.1 has undiscovered bugs                                         | Medium     | MIT — can fork/fix. Keep old branch until confident          |
| Multi-pane not supported                                                     | Medium     | Each pane gets its own `DrawingManager` — should work        |
| `manager.attach()` conflicts with existing `ISeriesPrimitive` on same series | Low        | Test on isolated branch first                                |
| Keyboard shortcuts differ from current UX                                    | Low        | Wrap library's key handling or supplement with own listeners |
| Data loss for existing drawings                                              | High       | Run migration script or accept (early-stage)                 |
