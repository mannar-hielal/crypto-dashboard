# lightweight-charts-drawing (fork)

TradingView-style drawing tools for lightweight-charts v5, vendored from
[deepentropy/lightweight-charts-drawing](https://github.com/deepentropy/lightweight-charts-drawing).

- **Source:** tag `v0.4.0`, commit `6bebe05dd2b4c72807cfcb18c8466893178fa5c4` (2026-10-02), the
  upstream `src/` folder. Its minified bundle (esbuild, `VERSION` defined) is byte-identical to this
  folder's before the local changes below that change code.
- **Licence:** MIT, Copyright (c) 2026 deepentropy — see [`LICENSE`](./LICENSE).
- **Forked 2026-10-04, maintained in this repo, no upstream contributions (owner decision).** Do not
  open issues or pull requests on the upstream repository; only read its source.
- **Peer:** upstream builds against lightweight-charts 5.2.1 (`peerDependencies` `^5.0.0`); the app
  runs 5.2.0. It imports only types from lightweight-charts and `fancy-canvas` (a devDependency of the
  client, the version lightweight-charts uses).
- **Before:** the app used the npm package 0.1.1 until 2026-10-04 — a different API and JSON format.
  Its saved drawings are converted once by `src/lib/drawingMigration.ts`.

## How the app imports it

`lightweight-charts-drawing` is an alias for this folder's `index.ts` in `vite.config.ts`,
`vitest.config.ts` and `tsconfig.app.json`/`tsconfig.json` `paths`. The app's own code is in
`ChartPanel.tsx` (manager per pane, text editor, persistence hooks), `lib/drawingManager.ts`
(storage), `lib/drawingMigration.ts`, `lib/libraryTools.ts` (menu) and `pages/DashboardPage.tsx`
(active tool).

## Local changes

Upstream files are kept close to the source so a diff against the commit above stays readable.
Record every change here: date, file, what, why.

- 2026-10-04 — every file: formatted with the repo's Prettier config (no code change).
- 2026-10-04 — `index.ts`: MIT attribution header; `VERSION` is the literal `"0.4.0"` (upstream
  sets `__VERSION__` with a vite `define`); `version.d.ts` (that global's declaration) removed.
- 2026-10-04 — `runtime/manager.ts` `placementClick`: a click within
  `MIN_DISTANCE_BETWEEN_POINTS` (5 px) of the previous point adds no point to a fixed-count tool, so
  a double-click never places a zero-length drawing (drawing plan, Phase B). Test: `[10.7.1]`.
- 2026-10-04 — `core/kinds/fib-labels.ts`, `core/scene/fib.ts` (`fibHLevelItems`), `index.ts`: pill
  labels for the horizontal Fib levels (retracement, trend-based extension — the tools that share
  `fibHLevelItems`). A host setting `setFibLabelMode('tradingview' | 'pill')`, default TradingView's;
  the app sets `'pill'` (ChartPanel): `61.8% · 83183.52`, white on the level colour at 80%, at the
  level's right end, kept inside the pane. Ordering, level colours and fills unchanged. Why: the
  owner's visual Q&A (2026-10-04) — the app's earlier labels read better over candles. Test:
  `[10.7.10]`.
- 2026-10-04 — `runtime/manager.ts` `dragMove`: the pointer is clamped to the pane during a drag,
  so an anchor or a whole drawing dragged past it (into an indicator pane, onto an axis) stops at the
  edge instead of following the pointer out (drawing plan, Phase B). Test: `[10.7.7]`.
- 2026-10-04 — `runtime/manager.ts`: `busy()` (a pointer gesture is in progress) and
  `insertCopies(drawings, dx, dy)` (TV Clone / Paste: copies moved by pane pixels through
  `translateDrawing`, unlocked, added and selected, one `gestureEnd`). Why: the host's undo history
  and clipboard (drawing plan, Phase F). Tests: `drawingHistory.test`, `drawingClipboard.test`.
- 2026-10-04 — `index.ts`: exports `tableCells`, so the host's table cell editor (`tableEdit`)
  starts from the cell's text. Test: `DrawingControls.test` [10.7.22].
- ESLint: `apps/client/eslint.config.js` relaxes, for `src/vendor/**` only, `_` unused params and
  rest siblings, `no-fallthrough` on empty cases, and `no-useless-assignment`. The folder is outside
  the client coverage floors; fixes here still get tests (`src/lib/__tests__/drawingLibrary.test.ts`).
