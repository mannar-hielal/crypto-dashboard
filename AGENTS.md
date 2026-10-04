# AGENTS.md

## Quick commands

| Command                                             | What it does                             | Notes                                               |
| --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `pnpm dev:server`                                   | Starts backend at `:3001` (tsx watch)    | Run from root                                       |
| `pnpm --filter @crypto-dashboard/client dev`        | Frontend at `:5173`                      | Separate terminal                                   |
| `pnpm lint`                                         | ESLint flat config — covers all packages | `apps/server/generated/` and `generated/` excluded  |
| `pnpm --filter @crypto-dashboard/server type-check` | Server TS check                          | Root `pnpm type-check` only checks server           |
| `pnpm --filter @crypto-dashboard/client type-check` | Client TS check                          | Uses `tsconfig.app.json`                            |
| `pnpm test`                                         | Runs server + client vitest              | Server env vars injected via its `vitest.config.ts` |
| `pnpm format`                                       | Prettier — writes all                    | 100 width, single quotes, trailing commas           |
| `pnpm format:check`                                 | Prettier check                           | CI gate                                             |
| `docker compose up -d`                              | Postgres 16 + Redis 7                    | Required for server to start                        |
| `cd apps/server && pnpm prisma migrate deploy`      | Apply migrations                         | Separate step from dev                              |
| `pnpm run audit`                                    | CVE check (high/critical)                | Runs in pre-commit hook                             |

Pre-commit hook (`.husky/pre-commit`) enforces: `audit` → `type-check` (both packages) → `test` → `lint-staged` → `lint`.

## Monorepo structure

```
cryptopapertrade.com/
├── apps/
│   ├── client/           @crypto-dashboard/client   React 19 + Vite 8 + Tailwind v4
│   └── server/           @crypto-dashboard/server   Fastify 5 + Prisma 7
├── generated/
│   └── CDSDK/            @crypto-dashboard/sdk      Shared types + API functions
├── mcp-servers/            Figma MCP server
├── docs/                   APP_LOG.md · DRAWING_TOOLS.md · plans (review checklist consolidated into .claude/skills/bug-sweep/SKILL.md)
├── .claude/skills/         18 project skills, auto-loaded by Claude Code (invocable as /<name>) — bug-sweep, drawing-tools, lightweight-charts-patterns, session-bootstrap, paper-trading-logic, figma-theme-source, add-page, pr-review-comments, +10 more
├── docker-compose.yml      Postgres 16 + Redis 7
├── fly.toml                Fly.io config (Singapore, 512MB shared-cpu-1x)
├── opencode.json           Figma MCP config
└── .github/workflows/
    ├── ci.yml              type-check(server) → format:check → lint → test → build
    └── deploy.yml          Triggered by CI success on main → flyctl + wrangler
```

## TypeScript strict-mode specifics (client)

- `verbatimModuleSyntax: true` — always `import type { ... }` for types
- `erasableSyntaxOnly: true` — no enums, no `namespace`
- `noUnusedLocals`, `noUnusedParameters` — both error
- Path alias `@/` = `./src/` (configured in tsconfig, vite.config, and vitest.config)

## Code style

- Section divider: `// ─── Section Name ──────────────`
- Security comments: `// 🔐` marker on security-motivated decisions
- Prettier: 100 print width, single quotes, trailing commas `es5`
- ESLint: `no-explicit-any` is **error**, `eqeqeq` required, `no-console` is warn (server uses Pino)
- Commit prefixes: `feat:`, `fix:`, `security:`, `chore:`, `setup:`, `docs:`

## Zustand patterns

| Store              | File                       | Persisted?             | Notes                                                         |
| ------------------ | -------------------------- | ---------------------- | ------------------------------------------------------------- |
| `authStore`        | `src/store/authStore.ts`   | No (memory only)       | Token lives only in Zustand, never localStorage               |
| `layoutStore`      | `src/store/layoutStore.ts` | Yes ("cd-layout")      | Pane config, sync flags, pane sizes                           |
| `paperStore`       | `src/store/paperStore.ts`  | Yes ("cd-paper-state") | Trading state, versioned migration                            |
| `paneStores[0..3]` | `src/store/paneStore.ts`   | No                     | 4 vanilla stores, use via `useStore(paneStores[i], selector)` |

- **Always use fine-grained selectors**: `useStore((s) => s.specificField)` — never `useStore()` (causes cascade re-renders).
- Vanilla stores (paneStores) use `createStore` from `zustand`, not `create` — consumed via `useStore(paneStores[i], selector)`.

## Testing

**Server**: Vitest with `environment: 'node'` — env vars injected in `vitest.config.ts`. Prisma is mocked:

```ts
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const prismaPlugin = async (app) => {
    app.decorate('prisma', {} as never);
  };
  (prismaPlugin as any)[skipOverride] = true;
  return { prismaPlugin };
});
```

Test by injecting into `buildApp()`: `app.inject({ method: 'GET', url: '...' })`.

**Client**: Vitest with `environment: 'jsdom'`. Store tests manipulate state directly:

```ts
useLayoutStore.setState({ layout: '4' });
useLayoutStore.getState().setActivePane(2);
expect(useLayoutStore.getState().activePane).toBe(2);
```

**Pattern**: Extract complex business logic from hooks into pure functions for unit-testability.

## Architecture — Chart to Toolbar to Drawing

- `DashboardPage` holds `cursorVariant` state, passes it down as `data-cursor` attribute on the chart `<div>`.
- `LeftToolbar` sends the picked tool up (`onToolChange`); `DashboardPage` holds `activeToolType` and arms the active pane's `DrawingManager`.
- `ChartPanel` creates `lightweight-charts` instance, exposes refs via `onChartReady(chart, series)` to `MultiChartArea`.
- Cross-pane sync: crosshair (`subscribeCrosshairMove`) + time range (`subscribeVisibleTimeRangeChange`).
- Drag-to-grab cursor: `data-dragging` attribute toggled via DOM (zero re-renders).

**Drawing tools** come from the forked `lightweight-charts-drawing` 0.4.0 in
`apps/client/src/vendor/` (MIT, maintained here only; imported by its package name through an
alias). `ChartPanel` creates one `DrawingManager` per pane; storage is `lib/drawingManager.ts`; the
menu is `lib/libraryTools.ts`. See `.claude/skills/drawing-tools`.

## Component hierarchy (key paths)

```
DashboardPage
├── LeftToolbar          ← onCursorVariantChange, onToolChange, onBinAction
├── MultiChartArea
│   └── ChartPanel       ← onChartReady(chart, series), onDrawingManagerReady, activeToolType
└── TradingPanel
```

- `tokens.ts` is the single source of truth for colors — no hex in components.
- **New UI components MUST use CSS Modules** (`*.module.css`) with camelCase class names. Existing Tailwind-utility components remain as-is.
- No inline `style` props except for dynamic values from `tokens.ts`.
- Drawing tools: the fork in `src/vendor/lightweight-charts-drawing/` (local changes listed in its README).
- ChartPanel primitive lifecycle effect at line ~672 MUST have a cleanup function (detachPrimitive + removeSeries + clear ref map) — React StrictMode double-mounts in dev and stale primitive refs cause indicator lines to silently not render.
- `cursors.tsx` exports SVG icon functions + `CURSOR_CSS_MAP` (data-URI cursors).
- `toolIcons.tsx` exports an SVG icon per drawing tool id (`TOOL_ICONS`) — UI only, no drawing logic.

## Chart quirks

- **React StrictMode double-mount**: App wraps `<StrictMode>` in `main.tsx`. In dev, every effect runs → cleanup → runs again. Any `useEffect` without a cleanup function that creates/modifies chart primitives will accumulate stale primitives pointing to a removed chart. Current safe effects: init (has cleanup), primitive lifecycle (has cleanup as of #fix-strictmode-primitives).

## Environment quirks

- Server `.env` is loaded from two locations: `apps/server/.env` and `../../.env` (root). Both are optional; `config.ts` exits with a clear error if critical vars are missing.
- Client API proxy: Vite proxies `/api/*` → `:3001`. Production: `VITE_API_URL` is baked at build time.
- PWA dev: set `VITE_PWA_DEV_SW=true` in client `apps/client/.env.local` to enable service worker in dev.
- JWT_SECRET must be ≥32 bytes — validated at server startup.
- Server `config.ts` does its own dotenv-load before Pino + Fastify bootstrap; logs via a lightweight `bootLogger`.
