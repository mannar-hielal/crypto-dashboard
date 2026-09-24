# CLAUDE.md

Project: cryptopapertrade.com — pnpm monorepo, `apps/client` (React 19 + Vite + Tailwind v4) and
`apps/server` (Fastify 5 + Prisma 7), shared SDK at `generated/CDSDK`.

Start every session by reading, in order: `AGENTS.md` (quick commands, monorepo layout), then
`docs/APP_LOG.md` (single source of truth for the whole project — architecture decisions, design
agreements, business logic, roadmap, legal/compliance, known issues; skim the section relevant to
the task rather than reading it end to end), then `.agents/skills/session-bootstrap/SKILL.md` (the
two non-negotiable process rules: no implementation without explicit instruction, and a visual Q&A
gate before any UI change).

## Conventions — read the one matching the area you're touching

`.claude/conventions/` holds the project's engineering conventions, each written from the
perspective of a senior owner of that discipline. Consult the relevant file(s) _before_ writing or
reviewing code in that area — treat them as binding, not optional background reading.

| File                                                                   | Read before touching                                                    | Voice                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| [`.claude/conventions/react.md`](./.claude/conventions/react.md)       | `apps/client/src/**` — components, hooks, Zustand stores                | Senior React developer        |
| [`.claude/conventions/web.md`](./.claude/conventions/web.md)           | `apps/server/src/**`, `generated/CDSDK/**`, any API/WebSocket/DB change | Senior web/platform developer |
| [`.claude/conventions/design.md`](./.claude/conventions/design.md)     | Any spacing, color, typography, layout, or motion change                | Senior UX designer            |
| [`.claude/conventions/security.md`](./.claude/conventions/security.md) | Auth, secrets, dependencies, Docker/infra, anything internet-facing     | Cyber security expert         |
| [`.claude/conventions/testing.md`](./.claude/conventions/testing.md)   | Any new test, or any change to test setup/mocking                       | Senior test manager           |
| [`.claude/conventions/git.md`](./.claude/conventions/git.md)           | Any commit, branch, or PR                                               | — (process convention)        |

See [`.claude/conventions/README.md`](./.claude/conventions/README.md) for how these relate to
`AGENTS.md` and to the deeper task-specific playbooks in `.agents/skills/` (e.g. `bug-sweep` — the
pre-commit/audit checklist that enforces these conventions; `api-best-practices`;
`figma-theme-source` — the canonical visual source, the
["Exgen – Crypto Exchange Dashboard Template"](https://www.figma.com/design/XnbW6uGFwCVYzz3MGGCjFM/Exgen-–-Crypto-Exchange-Dashboard-Template-–-Fintech---AI)
Figma file; `lightweight-charts-patterns`; `drawing-tools`; `paper-trading-logic`).

## After any refactor

Before reporting a refactor complete or committing it, run the checklist in
[`.claude/conventions/security.md#verify-a-refactor-is-safe`](./.claude/conventions/security.md#verify-a-refactor-is-safe)
against the diff — a "no behavior change" commit is exactly where a security regression (a dropped
auth check, a validation step left behind, a flattened error handler that now leaks) goes
unnoticed. This applies even when the refactor looks purely structural or is scoped to a single
file.

## Gates before any commit

`.husky/pre-commit` runs, in order: `pnpm run audit` → `pnpm type-check` (server + client) →
`pnpm test` → `lint-staged` → `pnpm lint`. All must pass locally — don't rely on CI to catch what
these would have caught first.
