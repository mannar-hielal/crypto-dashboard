# Project Conventions

The role-organized engineering conventions for cryptopapertrade.com live in
[`.claude/rules/`](./rules/), where Claude Code loads them automatically (unscoped files at launch,
`paths:`-scoped files when matching files are read). This file is the index. Each file reads as
if written and enforced by a senior owner of that discipline.

| File                                 | Owner voice                   | Covers                                                                                                                                                  |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`react.md`](./rules/react.md)       | Senior React developer        | Component design, hooks/effects, Zustand, styling discipline, client TS-strict rules                                                                    |
| [`web.md`](./rules/web.md)           | Senior web/platform developer | Architecture, backend patterns (Fastify/Prisma), WebSocket lifecycle, logging, config, performance, infra, code-level security rules                    |
| [`design.md`](./rules/design.md)     | Senior UX designer            | Design-token source of truth, color/typography/spacing system, motion, accessibility, visual-change process gate                                        |
| [`security.md`](./rules/security.md) | Cyber security expert         | Threat model, defense-in-depth layers, supply-chain policy, secrets management, container hardening, refactor-safety check, security definition-of-done |
| [`testing.md`](./rules/testing.md)   | Senior test manager           | Test philosophy, server/client test patterns, mocking rules, CI/pre-commit gates                                                                        |
| [`git.md`](./rules/git.md)           | —                             | Commit message/prefix rules, branch naming, CI/CD triggers, PR template + checklist                                                                     |

`web.md` and `security.md` intentionally overlap at the boundary: `web.md#security` is the
code-shape reference (what a compliant route/cookie/JWT looks like); `security.md` is the program
above it (why, and the controls no single route handler owns — supply chain, container hardening,
threat model). Read both when touching auth, secrets, or anything internet-facing.

**Some of these rules are also mechanically enforced**, not just documented — see
[`.claude/hooks/`](./hooks/README.md) for the PreToolUse/PostToolUse/Stop/SessionStart hooks that
catch commit-prefix violations, unsafe git flags, bad branch names, incomplete PR bodies, staged
secrets, hand-edits to generated files, hardcoded hex/`console.*`/`any`, and CVE regressions —
each hook's docstring cites the convention section it encodes.

## Relationship to other project docs (don't duplicate — link)

- **`AGENTS.md`** (repo root) is the fast quick-reference: commands, monorepo layout, one-line
  style rules. These convention files expand on the _why_ behind those rules, organized by role.
- **`.claude/skills/bug-sweep/SKILL.md`** is the enforcement checklist (priorities P1–P12,
  138 items) run before every commit/PR — the verification companion to these conventions.
- **`.claude/skills/api-best-practices/SKILL.md`** is the deep-dive reference for server code
  shape (retry/circuit-breaker, WS ping/pong, ring buffers) — `web.md` summarizes and links to it.
- **`.claude/skills/session-bootstrap/SKILL.md`** holds the two non-negotiable process rules
  (no implementation without explicit instruction; visual Q&A gate before UI changes) — process
  rules, not code conventions, so they stay there rather than being duplicated here.
- **`.claude/skills/add-page/SKILL.md`** is the checklist for adding, renaming or removing a page/route
  (route, `SeoHead`, sitemap, internal links, legal/CSP impact, post-deploy indexing).
- Domain-specific deep dives (`lightweight-charts-patterns`, `drawing-tools`, `paper-trading-logic`)
  stay in `.claude/skills/` — these convention files link to them rather than re-explaining them.

## When these conventions change

If a convention here goes stale (a rule changes, a pattern is replaced), update the convention
file **and** its source-of-truth counterpart (`AGENTS.md` and/or the relevant skill) in the same
commit — `.claude/rules/` should never disagree with the skills it was extracted from.
