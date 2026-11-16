# CLAUDE.md

Project: cryptopapertrade.com — pnpm monorepo, `apps/client` (React 19 + Vite + Tailwind v4) and
`apps/server` (Fastify 5 + Prisma 7), shared SDK at `generated/CDSDK`. Developed with Claude Code
only: this file is the one entry point (there is no `AGENTS.md`).

Start every session by reading `docs/APP_LOG.md` (single source of truth for the whole project —
architecture decisions, design agreements, business logic, roadmap, legal/compliance, known
issues; skim the section relevant to the task rather than reading it end to end), then
`.claude/skills/session-bootstrap/SKILL.md` (the two non-negotiable process rules: no
implementation without explicit instruction, and a visual Q&A gate before any UI change).

## Conventions

The binding engineering conventions live in `.claude/rules/` and load automatically: `web.md`,
`security.md` and `git.md` at launch; `react.md`, `design.md` and `testing.md` when matching files
are read (see each file's `paths:` frontmatter). They cover TypeScript strict mode, code style,
Zustand, tests and design tokens; this file doesn't repeat them.

See [`.claude/CONVENTIONS.md`](./.claude/CONVENTIONS.md) for how they relate to the deeper
task-specific playbooks in `.claude/skills/` (e.g. `bug-sweep` — the pre-commit/audit checklist
that enforces these conventions; `api-best-practices`; `figma-theme-source` — the canonical visual
source, the
["Exgen – Crypto Exchange Dashboard Template"](https://www.figma.com/design/XnbW6uGFwCVYzz3MGGCjFM/Exgen-–-Crypto-Exchange-Dashboard-Template-–-Fintech---AI)
Figma file; `lightweight-charts-patterns`; `drawing-tools`; `paper-trading-logic`; `add-page` — the
checklist for adding, renaming or removing a page/route; `lesson-authoring`). Claude Code loads
every skill in `.claude/skills/` automatically; each is also invocable as `/<name>`.

## Quick commands

| Command                                        | What it does                              | Notes                                                                                                                |
| ---------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `docker compose up -d`                         | Postgres 16 + Redis 7                     | Required for the server to start                                                                                     |
| `pnpm dev:server`                              | Backend at `:3001` (tsx watch)            | From the root                                                                                                        |
| `pnpm --filter @crypto-dashboard/client dev`   | Frontend at `:5173`                       | A separate terminal                                                                                                  |
| `cd apps/server && pnpm prisma migrate deploy` | Apply migrations                          | After switching to a branch with new migrations. Never `npx prisma` from the root: it fetches Prisma 8, not ours (7) |
| `pnpm type-check`                              | Server, client and e2e TypeScript         | Per package: `pnpm --filter @crypto-dashboard/<server, client or e2e> type-check`                                    |
| `pnpm test`                                    | Server + client Vitest, then `test:hooks` | `pnpm test:coverage` adds the coverage floors; `pnpm test:scripts` runs the repo scripts' tests                      |
| `pnpm lint`                                    | ESLint flat config, all packages          | `apps/server/generated/` and `generated/` excluded                                                                   |
| `pnpm format` / `pnpm format:check`            | Prettier: write / check                   | `format:check` is a CI gate                                                                                          |
| `pnpm run audit`                               | CVE check (high/critical)                 | Also in the pre-commit hook                                                                                          |

## Gates before any commit

The gates are the commands in `.husky/pre-commit`, in its order: read the hook, it is the list. All
must pass locally — don't rely on CI to catch what these would have caught first.

## After any refactor

Before reporting a refactor complete or committing it, run the checklist in
[`.claude/rules/security.md#verify-a-refactor-is-safe`](./.claude/rules/security.md#verify-a-refactor-is-safe)
against the diff — a "no behavior change" commit is exactly where a security regression (a dropped
auth check, a validation step left behind, a flattened error handler that now leaks) goes
unnoticed. This applies even when the refactor looks purely structural or is scoped to a single
file.

## Monorepo structure

```
cryptopapertrade.com/
├── apps/
│   ├── client/        @crypto-dashboard/client   React 19 + Vite 8 + Tailwind v4
│   ├── server/        @crypto-dashboard/server   Fastify 5 + Prisma 7
│   └── e2e/           @crypto-dashboard/e2e      Playwright (fake Bybit feed, test hooks)
├── generated/
│   └── CDSDK/         @crypto-dashboard/sdk      Shared types + API functions
├── scripts/           Repo scripts (case coverage, security headers, the benchmark-name check)
├── docs/              APP_LOG.md (single source of truth) · test plans · feature plans
├── .claude/           rules/ (conventions) · skills/ (playbooks) · hooks/ (enforcement)
├── .husky/            pre-commit · commit-msg · pre-push · denylist.sh (the hooks' benchmark-name check)
├── docker-compose.yml Postgres 16 + Redis 7
├── fly.toml           Fly.io config (the API)
└── .github/workflows/ ci.yml (one job: checks, integration, e2e smoke) · deploy.yml · e2e-nightly.yml · …
```

## Architecture — chart, toolbar, drawing

- `DashboardPage` holds `cursorVariant` state and passes it down as a `data-cursor` attribute on the
  chart `<div>`.
- `LeftToolbar` sends the picked tool up (`onToolChange`); the `useDrawingSession` hook
  (`hooks/useDrawingSession.ts`, used by `DashboardPage`) holds `activeToolType` and arms the active
  pane's `DrawingManager`.
- `ChartPanel` creates the `lightweight-charts` instance and exposes refs via
  `onChartReady(chart, series)` to `MultiChartArea`.
- Cross-pane sync: crosshair (`subscribeCrosshairMove`) + time range
  (`subscribeVisibleTimeRangeChange`).
- Drag-to-grab cursor: a `data-dragging` attribute toggled on the DOM (zero re-renders).
- Drawing tools come from the forked `lightweight-charts-drawing` 0.4.0 in
  `apps/client/src/vendor/` (MIT, maintained here; imported by its package name through an alias).
  `ChartPanel` creates one `DrawingManager` per pane; storage is `lib/drawingManager.ts`; the menu
  is `lib/libraryTools.ts`. See `.claude/skills/drawing-tools`.
- `cursors.tsx` exports the cursor SVG icons + `CURSOR_CSS_MAP` (data-URI cursors);
  `toolIcons.tsx` one SVG icon per drawing tool id (`TOOL_ICONS`), UI only.

```
DashboardPage
├── LeftToolbar          ← onCursorVariantChange, onToolChange, onRemoveDrawings
├── MultiChartArea
│   └── ChartPanel       ← onChartReady(chart, series), onDrawingManagerReady, activeToolType
└── TradingPanel
```

## Chart and environment quirks

- **React StrictMode double-mount:** `main.tsx` wraps the app in `<StrictMode>`, so in dev every
  effect runs, cleans up, and runs again. An effect that creates chart primitives without a cleanup
  (detach the primitive, remove the series, clear the ref map) leaves stale primitives on a removed
  chart, and indicator lines silently stop rendering.
- The server's `.env` loads from `apps/server/.env` and the root `.env`; both optional.
  `config.ts` loads them before Pino and Fastify (logging through a small `bootLogger`) and exits
  with a clear error when a critical variable is missing. `JWT_SECRET` must be ≥ 32 bytes.
- Client API: Vite proxies `/api/*` to `:3001` in dev; production bakes `VITE_API_URL` in at build
  time.
- PWA in dev: start Vite with `VITE_PWA_DEV_SW=true` in the shell environment to enable the service worker
  (`vite.config.ts` reads `process.env`; a value in a `.env` file has no effect).
