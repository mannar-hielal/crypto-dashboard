---
name: session-bootstrap
description: Use at the start of every new session on cryptopapertrade.com. Loads project context, codifies the two non-negotiable rules from docs/APP_LOG.md (no implementation without explicit instruction; visual Q&A before any UI change), and confirms the visual source of truth exists. Trigger when the user opens a fresh task, asks "let's work on X", or pastes a vague feature request.
---

# cryptopapertrade.com — Session Bootstrap

This skill bootstraps context for the `cryptopapertrade.com` monorepo (pnpm workspaces: `apps/client` React 19 + Vite + Tailwind v4, `apps/server` Fastify 5 + Prisma 7, shared SDK `generated/CDSDK`).

## Mandatory reads (in this order)

1. `AGENTS.md` — quick commands, monorepo layout, code style, Zustand patterns, testing approach.
2. `docs/APP_LOG.md` — **single source of truth** for the whole project. Always skim the section relevant to the task (architecture, design agreements, business logic, roadmap, legal/compliance, known issues). Instructions: attach at start of every session.
3. **`bug-sweep`** skill — 138-item pre-commit / proactive-audit checklist (priorities P1–P12, plus trading/drawing/TS-strict corollaries). Was `docs/REVIEW_CHECKLIST.md`; consolidated into the skill as the single source of truth. The relevant priority must be satisfied before commit.
4. Task-specific docs:
   - Drawing/chart work → `docs/DRAWING_TOOLS.md` (and activate the `drawing-tools` skill).
   - Paper trading / orders / TP/SL / journal → `docs/TRADING_TEST_PLAN.md` + `paper-trading-logic` skill.
   - Server / auth / WebSocket → AGENTS.md "Testing" + server `__tests__/`.
   - Pre-launch polish → `docs/SEO_READINESS.md` + `launch-readiness-audit` skill.

## ⛔ The two non-negotiables (from APP_LOG preamble)

1. **No implementation unless the user explicitly instructs.** Never create files, write code snippets, or apply edits automatically. When the user describes a goal, propose an approach first and wait for confirmation. Code changes happen **only** when the user directly asks.
2. **Visual Q&A gate before any UI change.** Before touching any component that affects spacing, colors, sizes, layout, or interaction: ask a concise Q&A (use the `question` tool) confirming visual decisions. Quote `docs/screenshots/theme/` as the _primary_ source and `docs/markup-reference/` as the fallback.

## ⚠️ Known data inconsistency to surface

`docs/APP_LOG.md` repeatedly references `docs/screenshots/theme/` (header.png, footer.png) and `docs/markup-reference/` as the visual source of truth. As of the last scan:

- `docs/screenshots/` **does not exist**. Only loose screenshots live at the repo root (`Screenshot 2026-07-14 at *.png`).
- `docs/markup-reference/` exists with partial files (`grid.html`, `chart-layout.html`, `toolbar.html`, `layout-area-*`).

If a task is UI-visual, **flag this missing source-of-truth to the user** before proceeding and ask which reference to use. Do not invent values — the AGENTS.md rule is: no hardcoded hex, fonts, sizes in components; everything comes from `apps/client/src/lib/tokens.ts` (JS) and `index.css` `@theme inline` (Tailwind).

## Workflow when a task is described

1. Ask 1–3 clarifying questions if the goal is ambiguous (use `question` tool).
2. Read the relevant doc sections above (use `read` with offset for large files; do not blindly dump all of APP_LOG).
3. Use `grep`/`glob` to locate the actual source files referenced.
4. Re-state the plan with file:line citations. Do **not** edit until the user confirms.
5. After work, propose updates to `docs/APP_LOG.md` (the user must approve the doc edit — it's still an edit).

## Quick commands (reuse from AGENTS.md)

| Action                 | Command                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Server (Fastify :3001) | `pnpm dev:server` (needs `docker compose up -d` Postgres + Redis)                                           |
| Client (Vite :5173)    | `pnpm --filter @crypto-dashboard/client dev`                                                                |
| Lint                   | `pnpm lint`                                                                                                 |
| Typecheck (both)       | `pnpm --filter @crypto-dashboard/server type-check` and `pnpm --filter @crypto-dashboard/client type-check` |
| Tests                  | `pnpm test`                                                                                                 |
| Prettier               | `pnpm format` / `pnpm format:check`                                                                         |
| Apply migrations       | `cd apps/server && pnpm prisma migrate deploy`                                                              |
| CVE check              | `pnpm run audit`                                                                                            |

Pre-commit hook (`.husky/pre-commit`) runs: `audit → type-check (both) → test → lint-staged → lint`.
