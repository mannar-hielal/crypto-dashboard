# Hardening Plan — Security Scans, Load and Performance

> **Owner:** Mannar Hielal · **Written:** 2026-09-30 · **Status:** agreed in principle, not started — the
> thresholds (§5) need the owner before the heavy run (§4) can gate anything.
>
> Replaces milestone M9 of the test implementation plan (retired 2026-09-30) and roadmap step P6 of
> `docs/TRADING_TEST_PLAN.md` (A4 "Performance" / "Security", A5 "Staging"). This file carries on after it.

## 1. Decisions so far

- **No staging app** (owner, 2026-09-30). A copy of production would cost ≈ $6–8 a month always on (well under $1
  with auto-stop), plus ≈ 125 Actions minutes a month if it deployed on every merge to `develop`, and a second
  database to keep migrated. Paper trading moves no real money, every release already runs the full browser set
  on a production-like stack, and a rollback takes about a minute. Revisit before inviting real users, or before a
  risky migration that needs a rehearsal on production-sized data; then: machines that stop when idle, deployed by
  hand before a release, not on every merge.
- **Measure before a major release or a big feature,** and treat security vulnerabilities as part of every change
  (owner, 2026-09-30).
- **Never attack- or load-test production.** Production keeps its read-only smoke (`prod-smoke.yml`, after every
  deploy and every 6 h) and UptimeRobot. What only production's configuration shows (CSP, HSTS, cookie flags, CORS,
  no Swagger) is checked there read-only (H11), because the CI stack runs outside production mode (review #211).
- **Dependabot** already covers GitHub Actions (monthly, since 2026-09-29); npm version-bump PRs stay off (npm is
  covered by the audit gate and `pnpm.overrides`, `.claude/rules/security.md`).

## 2. Where it runs, without staging

| Target                                                 | What it's for                                                                                                                                                               | Cost                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| The CI stack (the e2e set's)                           | Attack-style scans and relative load numbers: the API, Postgres, the fake Bybit feed, the built web app and the test hooks for seeding users, all thrown away after the run | Actions minutes only |
| A throwaway Fly machine, production's size (on demand) | Absolute capacity ("how many users does one machine hold"): created for the run, deleted after, like the parity machine                                                     | cents per run        |
| Production                                             | Read-only smoke only                                                                                                                                                        | —                    |

The CI stack's load numbers compare releases with each other ("orders got 40% slower"); a GitHub runner is not Fly's
hardware, so they are not capacity figures.

## 3. On every PR — cheap checks

Already in place: `pnpm audit --audit-level=high` (preinstall, pre-commit, CI), `eslint-plugin-security`, the
security rules and refactor checklist, route schemas with `additionalProperties: false`, auth tests, the Claude
review.

| #   | Add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Runs                                                       | Minutes / month      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| H1  | **gitleaks** secret scan (the repository is public since 2026-09-29)                                                                                                                                                                                                                                                                                                                                                                                                                   | every PR, inside `ci.yml`'s job                            | ~5                   |
| H2  | **Dependabot security alerts** for npm — alerts only, no version-bump PRs: a new CVE is known the day it's published, not at the next install                                                                                                                                                                                                                                                                                                                                          | GitHub, no Actions minutes                                 | 0                    |
| H3  | **CodeQL** code scanning (free on public repositories): injection, unsafe regex and data-flow issues lint rules miss                                                                                                                                                                                                                                                                                                                                                                   | weekly + on the release PR                                 | ~40                  |
| H11 | **Production security posture, read-only**, in the `@prod` smoke after every deploy (and every 6 h): the API's and the web app's headers — CSP exactly `CSP_DIRECTIVES`, HSTS with `includeSubDomains` + `preload`, `frame-ancestors 'none'`; `/docs` answers 404; a preflight from a foreign origin gets no `Access-Control-Allow-Origin`; the QA account's sign-in sets the refresh cookie `HttpOnly`, `Secure`, `SameSite=None`. Plain requests a browser makes anyway — not a scan | after every deploy, inside `deploy.yml` / `prod-smoke.yml` | ~0 (seconds per run) |

## 4. The heavy run — before a major release or a big feature

**Trigger:** a `heavy-release` label on the `develop → main` release PR (or `workflow_dispatch`). It is recommended —
not forced — when a release touches `src/trading/**`, auth, the WebSocket routes or `prisma/schema.prisma`.

| #   | Check                                                                                                                                                                                                                                                                                                                        | Target          | Blocks the release when                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------- |
| H4  | **OWASP ZAP API scan**, signed in as a seeded test user, every route from the OpenAPI spec (`/docs/json`, which exists only outside production). Scope: the **code** — injection, validation, auth and access control, error leaks — which is the same in both modes; not production's configuration (H11)                   | CI stack        | a high finding                                  |
| H5  | **ZAP baseline scan** of the built web app: passive findings in the pages and scripts (unsafe patterns, information leaks). Not CSP, HSTS or cookie flags: the CI stack runs outside production, where Helmet's CSP is off and cookies are `lax` without `secure` (`app.ts`, `routes/auth`) — H11 checks those on production | CI stack        | a high finding                                  |
| H6  | **Trivy** scan of the production Docker image (OS packages and Node dependencies)                                                                                                                                                                                                                                            | the built image | a high / critical fixable finding               |
| H7  | **k6** load: sign-in, place / cancel orders, market WebSocket fan-out, private WebSocket updates, a price storm that fires many triggers at once. Watch p95 latency, error rate, event-loop lag, memory                                                                                                                      | CI stack        | p95 or error rate > 20% worse than the baseline |
| H8  | **Engine micro-benchmarks** (`vitest bench`): ticks and triggers per second through `MatchingEngine`. Stable and cheap enough for every PR later                                                                                                                                                                             | CI              | > 20% slower than the baseline                  |
| H9  | **Lighthouse CI**: load budgets for the landing page and the dashboard                                                                                                                                                                                                                                                       | CI stack        | a budget exceeded                               |
| H10 | **Capacity run** (optional, before launch or a big engine change): k6 against a throwaway Fly machine of production's size                                                                                                                                                                                                   | Fly, on demand  | — (a report, not a gate)                        |

A heavy run is about 30–40 minutes. It fits the Actions reserve (≈ 160 minutes, `.claude/rules/git.md`) at 2–3 major
releases a month; more than that, and it is the next thing to watch.

## 5. Rules that make it work

- **Written thresholds**, agreed with the owner once (open, §7): e.g. no high ZAP finding; order p95 under _X_ ms;
  error rate under 1%; Lighthouse budgets. Without them a heavy run produces reports nobody acts on.
- **A baseline per release:** each heavy run stores its k6, benchmark and Lighthouse numbers as an artifact (and a
  small committed JSON), so the next run answers "better or worse than last time?".
- **A finding is a defect:** a high security finding blocks the release; a real one gets a regression test and a
  `security:` fix (its own PR and release, `git.md` § Emergencies); a false positive is suppressed in the tool's
  config with a comment saying why.
- **No new npm dependencies:** ZAP, Trivy, k6 and gitleaks run from their official GitHub Actions or containers;
  CodeQL and Dependabot alerts are built into GitHub. Each action is pinned to a version, like the others.

## 6. Order of work

| Step | Contents                                                             | Needs                  | Status |
| ---- | -------------------------------------------------------------------- | ---------------------- | ------ |
| 1    | H1 gitleaks, H2 Dependabot alerts, H3 CodeQL, H11 production posture | —                      | ⬜     |
| 2    | The heavy-release workflow with H4–H6                                | —                      | ⬜     |
| 3    | H7 k6, H8 benchmarks, H9 Lighthouse                                  | the thresholds (§7 Q1) | ⬜     |
| 4    | H10 capacity run                                                     | when capacity matters  | ⬜     |

## 7. Open questions for the owner

- **Q1.** The thresholds: the p95 for placing an order (and for the market WebSocket fan-out), the error rate, and
  the Lighthouse budgets. A first measured run can propose numbers to agree on.
- **Q2.** Should the heavy run be required (blocking the release merge) for every release that touches the engine,
  auth, WebSockets or the schema — or stay the release owner's call through the label?
- **Q3.** Is the log sink (TRADING_TEST_PLAN P5, "Fly log shipping with an alert on `level >= 50`") still wanted, or
  does M8's error digest by email cover it?
