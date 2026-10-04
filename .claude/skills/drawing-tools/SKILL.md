---
name: drawing-tools
description: Use when working on the chart drawing tools — the forked library in apps/client/src/vendor/lightweight-charts-drawing/ (0.4.0), ChartPanel's DrawingManager setup and text editor (DrawingTextEditor.tsx), lib/drawingManager.ts (per-symbol storage, cap, TOOL_MAP), lib/drawingMigration.ts (0.1 → 0.4 saves), lib/drawingTools.ts (Eraser, one-pane selection), lib/libraryTools.ts (the tool menu), lib/toolIcons.tsx, LeftToolbar's drawing groups / Eraser / Remove, or DashboardPage's activeToolType. Also use when the user mentions trend line, horizontal/vertical line, ray, channel, pitchfork, Fibonacci, Gann, position tool, text/note/callout, eraser, remove drawings, magnet, Shift constraints, drawing labels, ISeriesPrimitive drawings, or "drawings disappear". Covers where each piece lives, the fork's rules, the known bugs and the TradingView-parity roadmap.
---

# Drawing Tools — cryptopapertrade.com

The chart's drawings come from **`lightweight-charts-drawing` 0.4.0, forked into the repo** (owner,
2026-10-04). The library does the drawing work the TradingView way: placement with a live preview,
hover, selection, anchor and body drags, magnet, Shift constraints, Delete / Escape, axis labels.
Our code creates a manager per pane, stores drawings per symbol, opens the text editor, and draws the
tool menu.

History: a custom system until 2026-07-21 (`drawingStore`, `useDrawingInteraction`,
`components/drawing/*` — deleted; the old floating toolbar is recoverable from
`git show 852e24b^:apps/client/src/components/drawing/DrawingPropertiesMenu.tsx`, plus
`ColorPicker.tsx` and `KebabMenu.tsx`), then the npm package 0.1.1 until 2026-10-04.

## The fork — `apps/client/src/vendor/lightweight-charts-drawing/`

- Upstream `deepentropy/lightweight-charts-drawing`, tag `v0.4.0`, commit `6bebe05` (2026-10-02),
  MIT. `LICENSE` and `README.md` sit in the folder; `index.ts` has the attribution header.
- **Owner rule: the fork stays in this repo.** No issues, PRs or patches upstream — only read its
  source.
- **Every local change is logged in the fork's `README.md`** (date, file, what, why), so a diff
  against upstream stays explainable. Fix library behaviour there, not with private-API wrappers in
  ChartPanel.
- App code imports it by name (`from 'lightweight-charts-drawing'`): an alias in
  `apps/client/vite.config.ts`, `vitest.config.ts` and both tsconfig `paths`.
- Lint: `apps/client/eslint.config.js` relaxes a few rules for `src/vendor/**` only. Prettier and
  the strict tsconfig apply. `src/vendor/**` is outside the coverage floors, but a fork fix still
  gets a test.
- Layout: `src/core` (the drawing model `Drawing { id, kind, points: [{ time, price }], style, text?,
locked?, hidden?, … }`, TradingView factory defaults in `specs.ts`, hit tests, placement / drag /
  Shift rules in `core/interact`, renderer-neutral scenes in `core/scene`) and `src/runtime`
  (`DrawingManager`, `makeCoords`, the canvas renderer `scene-canvas.ts`).
- `DrawingManager(chart, series, { fontFamily })` API: `setTool(kind | null)`, `tool()`, `add`,
  `update`, `remove`, `clear`, `select`, `selection()`, `get`, `drawings()`, `importJSON`,
  `exportJSON`, `destroy()`; events `change`, `add`, `update`, `remove`, `selection`, `tool`,
  `textEdit`, `gestureEnd`, `tableEdit`. Saved form = the `Drawing` array (`parseDrawings` checks it).
- Rules it gives us: presses outside its series' pane (indicator panes, both axes) are ignored —
  that is how drawings stay on the price pane; its primitive has no `autoscaleInfo` (drawings never
  stretch the price axis); after a placement it disarms (`tool` null) and selects the new drawing
  unless `stayInDrawingMode`; it holds the chart (`handleScroll` / `handleScale` off) during a
  gesture; times between bars / past the last bar map by interpolation / extrapolation, so drawings
  survive an interval change.

## Where our code lives

| File                                                         | Role                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/components/dashboard/ChartPanel.tsx`        | One `DrawingManager(chart, candles, { fontFamily: font.sans })` per pane in the mount effect: `attachDrawings` (shared per-symbol set, debounced save), `textEdit` → our editor, right-click → cursor, Eraser effect, symbol-switch save + restore, `destroy()` on cleanup.                                               |
| `apps/client/src/components/dashboard/DrawingTextEditor.tsx` | The text editor: only Save / Ctrl+Enter keep the text (Cancel, Escape, outside discard). Opened one tick after `textEdit` (the placing press's mousedown would blur it).                                                                                                                                                  |
| `apps/client/src/lib/drawingManager.ts`                      | Storage per symbol: `cd-drawings-v2-<SYMBOL>` (0.4 JSON), `MAX_DRAWINGS = 200` on load and save, `parseDrawings`, storage errors swallowed; `TOOL_MAP` for old toolbar ids; runs the 0.1 migration once. `attachDrawings` / `switchDrawingsSymbol`: one set per symbol shared by every pane showing it (module registry). |
| `apps/client/src/lib/drawingMigration.ts`                    | Pure 0.1 → 0.4 converter (`cd-drawings-<SYMBOL>` is kept for a rollback). Renames, position / channel geometry, style; drops arc, curves, bars pattern, projection, Gann square fixed, arrow marker, disjoint channel, table.                                                                                             |
| `apps/client/src/lib/drawingTools.ts`                        | `HOST_TOOLS` (Eraser, zoom-in), `nextActiveTool`, `startEraser`, `keepSelectionInOnePane` (Delete acts on the pane last clicked).                                                                                                                                                                                         |
| `apps/client/src/lib/libraryTools.ts`                        | `TOOL_GROUPS` — the left-toolbar groups / categories / tools; ids are 0.4 `DrawingKind`s.                                                                                                                                                                                                                                 |
| `apps/client/src/lib/toolIcons.tsx`                          | `TOOL_ICONS` — an SVG icon per tool id.                                                                                                                                                                                                                                                                                   |
| `apps/client/src/components/dashboard/LeftToolbar.tsx`       | Flyout menus over `TOOL_GROUPS` (anchors `toolbar.tool` / `toolbar.subtool`), cursor variants, the Remove group (Remove All, Eraser).                                                                                                                                                                                     |
| `apps/client/src/pages/DashboardPage.tsx`                    | `activeToolType`; `handleToolChange` arms the active pane's manager (`setTool`); `tool` events update the state; `handleBinAction` = `clear()` on the active pane; manager refs per pane.                                                                                                                                 |

Tests: `lib/__tests__/drawingLibrary.test.ts` runs the fork on a fake chart
(`fakeDrawingChart.ts`); `drawingManager.test.ts`, `drawingMigration.test.ts`,
`drawingTools.test.ts`, `components/dashboard/__tests__/DrawingTextEditor.test.tsx`; e2e
`apps/e2e/tests/chart/drawingTools.spec.ts` and `indicatorPanes.spec.ts` `[10.6.5]`. Rows:
`docs/TRADING_TEST_PLAN.md` sections 10.6.5 and 10.7.

## Known bugs and the roadmap (owner plan, 2026-10-04)

The plan file lives outside the repo. Done in Phase A (fork 0.4.0): text saved after an edit,
drawings surviving an interval change / off-bar times, no ghost preview, Eraser, editor Cancel,
anchor drag no longer pans, no placement on the axes, Delete only in the pane last clicked, no
zero-length drawing from a double-click, storage errors caught, the symbol-switch save capped.
Also done (2026-10-04, after the owner's visual Q&A): one drawing set per symbol shared by the
panes (`attachDrawings`), anchors and drags clamped to the price pane (fork), pane listeners and
manager refs cleaned up with the chart (`connectPaneManager`), Fib pill labels (fork
`setFibLabelMode('pill')`), the editor on a CSS Module with tokens, converted position boxes keep
0.1's 200 px width.

**Done 2026-10-04 (owner's round 2, one PR):**

- **Toolbar** (`LeftToolbar`): groups in TradingView's order; each group remembers its last tool
  (`useDrawingSession.subTools`, saved `cd-drawing-subtools`, checked on load); magnet with
  Weak / Strong (`cd-drawing-magnet`); Stay in drawing mode (`cd-drawing-stay-mode`); Remove menu
  ("Remove N drawings" with a confirm, "Show N hidden", Eraser); the cursor menu's Eraser arms the
  Eraser. Shortcuts show in the flyout rows and tooltips. Menus are `DrawingMenu` (role=menu,
  arrows, Esc back to the opener). Tooltips after 400 ms.
- **Session** (`hooks/useDrawingSession.ts`): the armed tool, each pane's manager and undo history,
  the switches, and TradingView's shortcuts (`lib/drawingShortcuts.ts`), all on the active pane.
- **Undo / redo** (`lib/drawingHistory.ts`): snapshots of the list, one step per gesture
  (fork `busy()` + `gestureEnd`) or per task otherwise, 100 kept, reset on a load or a copy from
  another pane (`isSyncingDrawings`).
- **Clone / copy / paste** (`lib/drawingClipboard.ts`, fork `insertCopies`): 20 px right of and
  below, unlocked, selected; the clipboard is shared by the panes.
- **Selection controls** (`components/drawing/DrawingControls.tsx`): the floating toolbar
  (`DrawingFloatingToolbar`, only the tool's controls: `lib/drawingCapabilities.ts`; draggable,
  `cd-drawing-toolbar-pos`), the right-click menu (`lib/drawingActions.ts`; on a Long / Short
  Position also "Create limit order…", which fills the order form through `orderPrefillStore` —
  `lib/positionOrder.ts`), the settings dialog (a position gets Inputs + Style from
  `PositionSettings.tsx`; its new-drawing defaults come from `lib/positionDefaults.ts`). The
  drawings' pip (ticks, label precision) is the candles' `priceFormat.minMove`, which ChartPanel
  sets to the symbol's tick (`lib/priceFormat.ts`)
  (`DrawingSettingsDialog`: Style / Text / Coordinates, applies on Ok as one step), the table cell
  editor (`DrawingCellEditor`, the library's `tableEdit`). A right-click off a drawing returns to
  the cursor; mid-drag it does nothing.
- **Phase B leftovers:** the pre-July `cd-drawings` store (no symbol) is removed once
  (`dropPreLibraryDrawings`).

- Later: touch editing, patterns / Elliott / icons in the menu, drawings in indicator panes
  (`Drawing.owner`), templates, hide / lock all.

## Rules when changing drawings

- A change to the saved shape must still read old saves: `localStorage` is untrusted input — check
  it, skip what doesn't parse, never crash on restore; keep the 200 cap.
- Every `manager.on(...)` or listener added in ChartPanel is undone in the effect cleanup
  (StrictMode double-mounts); `manager.destroy()` stays last before `chart.remove()`.
- User text is drawn on the canvas only (never HTML).
- Any visual change (labels, anchors, colours, toolbar, menus) goes through the visual Q&A gate in
  `.claude/rules/design.md` first.

## Test commands

```bash
cd apps/client && VITE_IS_LIVE=false npx vitest run src/lib/__tests__/drawing
pnpm --filter @crypto-dashboard/client type-check
pnpm lint
```
