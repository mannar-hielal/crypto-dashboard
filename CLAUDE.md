# CLAUDE.md

Project: cryptopapertrade.com — pnpm monorepo, `apps/client` (React 19 + Vite + Tailwind v4) and
`apps/server` (Fastify 5 + Prisma 7), shared SDK at `generated/CDSDK`.

Start every session by reading, in order: `AGENTS.md` (quick commands, monorepo layout), then
`docs/APP_LOG.md` (single source of truth for the whole project — architecture decisions, design
agreements, business logic, roadmap, legal/compliance, known issues; skim the section relevant to
the task rather than reading it end to end), then `.claude/skills/session-bootstrap/SKILL.md` (the
two non-negotiable process rules: no implementation without explicit instruction, and a visual Q&A
gate before any UI change).

## Conventions

The binding engineering conventions live in `.claude/rules/` and load automatically: `web.md`,
`security.md` and `git.md` at launch; `react.md`, `design.md` and `testing.md` when matching files
are read (see each file's `paths:` frontmatter).

See [`.claude/CONVENTIONS.md`](./.claude/CONVENTIONS.md) for how these relate to
`AGENTS.md` and to the deeper task-specific playbooks in `.claude/skills/` (e.g. `bug-sweep` — the
pre-commit/audit checklist that enforces these conventions; `api-best-practices`;
`figma-theme-source` — the canonical visual source, the
["Exgen – Crypto Exchange Dashboard Template"](https://www.figma.com/design/XnbW6uGFwCVYzz3MGGCjFM/Exgen-–-Crypto-Exchange-Dashboard-Template-–-Fintech---AI)
Figma file; `lightweight-charts-patterns`; `drawing-tools`; `paper-trading-logic`; `add-page` — the
checklist for adding, renaming or removing a page/route). Claude Code loads every skill in
`.claude/skills/` automatically; each is also invocable as `/<name>`.

## After any refactor

Before reporting a refactor complete or committing it, run the checklist in
[`.claude/rules/security.md#verify-a-refactor-is-safe`](./.claude/rules/security.md#verify-a-refactor-is-safe)
against the diff — a "no behavior change" commit is exactly where a security regression (a dropped
auth check, a validation step left behind, a flattened error handler that now leaks) goes
unnoticed. This applies even when the refactor looks purely structural or is scoped to a single
file.

## Gates before any commit

`.husky/pre-commit` runs, in order: `pnpm run audit` → `pnpm type-check` (server + client) →
`pnpm test:coverage` + `pnpm test:hooks` (the suites plus the coverage floors) → `lint-staged` →
`pnpm lint`. All must pass locally — don't rely on CI to catch what
these would have caught first.
