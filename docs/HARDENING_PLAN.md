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
- **Never attack- or load-test production.** Production keeps its smoke (`prod-smoke.yml`, after every deploy and
  every 6 h) and UptimeRobot. What only production's configuration shows (CSP, HSTS, cookie flags, CORS, no Swagger)
  is checked there with plain signed-out requests (H11), because the CI stack runs outside production mode (review
  #211). Cookie flags need a sign-in, and a production credential in a public repository's secrets isn't wanted, so
  they are asserted by a server test that builds the app in production mode instead.
- **Dependabot** already covers GitHub Actions (monthly, since 2026-09-29); npm version-bump PRs stay off (npm is
  covered by the audit gate and `pnpm.overrides`, `.claude/rules/security.md`).

## 2. Where it runs, without staging

| Target                                                 | What it's for                                                                                                                                                               | Cost                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| The CI stack (the e2e set's)                           | Attack-style scans and relative load numbers: the API, Postgres, the fake Bybit feed, the built web app and the test hooks for seeding users, all thrown away after the run | Actions minutes only |
| A throwaway Fly machine, production's size (on demand) | Absolute capacity ("how many users does one machine hold"): created for the run, deleted after, like the parity machine                                                     | cents per run        |
| Production                                             | The smoke: signed-out requests only (H11). No attack or load traffic, no sign-in, no test data                                                                              | —                    |

The CI stack's load numbers compare releases with each other ("orders got 40% slower"); a GitHub runner is not Fly's
hardware, so they are not capacity figures.

**Found while writing this plan (2026-09-30), fixed the same day (H0):** the web app (`https://cryptopapertrade.com`)
sent no `Strict-Transport-Security` and no framing protection — only `nosniff` and a referrer policy; its CSP is a
`<meta>` tag, which can't set `frame-ancestors`, and an `index.html` comment wrongly said Helmet covered it. So another
site could frame the dashboard (clickjacking), and a first visit wasn't forced onto HTTPS. Now `_headers` sends, for
`/*`, HSTS (`max-age=63072000; includeSubDomains; preload`, like the API's — every subdomain serves HTTPS),
`X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. Kept true by
`scripts/securityHeaders.test.mjs` on every PR and the `@prod` smoke after every deploy. The `preload` directive only
makes the domain eligible: joining the browsers' preload list is a separate submission (hstspreload.org), not done.

## 3. On every PR — cheap checks

Already in place: `pnpm audit --audit-level=high` (preinstall, pre-commit, CI), `eslint-plugin-security`, the
security rules and refactor checklist, route schemas with `additionalProperties: false`, auth tests, the Claude
review.

| #   | Add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Runs                                         | Minutes / month      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------- |
| H1  | **gitleaks** secret scan (the repository is public since 2026-09-29)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | every PR, inside `ci.yml`'s job              | ~5                   |
| H2  | **Dependabot security alerts** for npm — alerts only, no version-bump PRs: a new CVE is known the day it's published, not at the next install                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | GitHub, no Actions minutes                   | 0                    |
| H3  | **CodeQL** code scanning (no licence cost on public repositories; its runs still use Actions minutes): injection, unsafe regex and data-flow issues lint rules miss                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | on the release PR                            | ~30                  |
| H11 | **Production security posture.** In the `@prod` smoke (every 6 h and after each deploy), plain signed-out requests. **API** (`api.cryptopapertrade.com`, Helmet): CSP equals `CSP_DIRECTIVES` (`app.ts`), HSTS with `includeSubDomains` + `preload`; `/docs` answers 404; a preflight from a foreign origin gets no `Access-Control-Allow-Origin`. **Web app** (Cloudflare Pages): its CSP equals the `<meta>` policy in `apps/client/index.html` (its own `connect-src` / `style-src`, not the API's), and the response headers from `apps/client/public/_headers` are sent — HSTS and framing protection (`X-Frame-Options` / a `frame-ancestors` header: a `<meta>` CSP can't carry `frame-ancestors`). The refresh cookie's flags (`HttpOnly`, `Secure`, `SameSite=None`) need a sign-in, so a server test asserts them on an app built with `NODE_ENV=production` (`app.inject`), with no production account or credential | every smoke, and the server test on every PR | ~0 (seconds per run) |

## 4. The heavy run — before a major release or a big feature

**Trigger:** a `heavy-release` label on the `develop → main` release PR (or `workflow_dispatch`). It is recommended —
not forced — when a release touches `src/trading/**`, auth, the WebSocket routes or `prisma/schema.prisma`.

**How it blocks:** there is no branch protection, so a red check alone only reports. Step 2 therefore extends
`deploy.yml`'s gate, which already refuses to deploy unless the release PR's "E2E full set" is green on the merged
head. The label only decides whether a heavy run **starts**; the gate never reads it. For the release PR's merged
head SHA, the gate looks for "Heavy release" runs: if one exists, anything but a `success` conclusion blocks the
deploy — queued, in progress, cancelled, skipped or red alike (it fails closed, like the E2E gate; re-run the
deploy once the heavy run is green). Only a head with no heavy run at all deploys without one. Removing the label
after a run started changes nothing, and the workflow re-runs on every push to a labelled release PR (as the E2E
full set does), so a later push gets its own run on its new head SHA; an earlier green run never counts for it. The
merge process in `git.md` (every check on the head green) covers the merge itself. A release that never had the
label deploys as today (see Q2).

| #   | Check                                                                                                                                                                                                                                                                                                                        | Target          | Blocks the release when                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------- |
| H4  | **OWASP ZAP API scan**, signed in as a seeded test user, every route from the OpenAPI spec (`/docs/json`, which exists only outside production). Scope: the **code** — injection, validation, auth and access control, error leaks — which is the same in both modes; not production's configuration (H11)                   | CI stack        | a high finding                                  |
| H5  | **ZAP baseline scan** of the built web app: passive findings in the pages and scripts (unsafe patterns, information leaks). Not CSP, HSTS or cookie flags: the CI stack runs outside production, where Helmet's CSP is off and cookies are `lax` without `secure` (`app.ts`, `routes/auth`) — H11 checks those on production | CI stack        | a high finding                                  |
| H6  | **Trivy** scan of the production Docker image (OS packages and Node dependencies)                                                                                                                                                                                                                                            | the built image | a high / critical fixable finding               |
| H7  | **k6** load: sign-in, place / cancel orders, market WebSocket fan-out, private WebSocket updates, a price storm that fires many triggers at once. Watch p95 latency, error rate, event-loop lag, memory                                                                                                                      | CI stack        | p95 or error rate > 20% worse than the baseline |
| H8  | **Engine micro-benchmarks** (`vitest bench`): ticks and triggers per second through `MatchingEngine`. Stable and cheap enough for every PR later                                                                                                                                                                             | CI              | > 20% slower than the baseline                  |
| H9  | **Lighthouse CI**: load budgets for the landing page and the dashboard                                                                                                                                                                                                                                                       | CI stack        | a budget exceeded                               |
| H10 | **Capacity run** (optional, before launch or a big engine change): k6 against a throwaway Fly machine of production's size                                                                                                                                                                                                   | Fly, on demand  | — (a report, not a gate)                        |

**Budget.** Against the ≈ 160-minute reserve in `.claude/rules/git.md`, which exists for re-runs and emergency fixes:

| Item                                                                                                                    | Minutes / month                         |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| H1 gitleaks (inside `ci.yml`'s job)                                                                                     | ~5                                      |
| H3 CodeQL (release PRs only, ~8 a month) — its runs use Actions minutes like any workflow; "free" is the CodeQL licence | ~30                                     |
| H11 (steps in the existing smoke jobs)                                                                                  | ~0                                      |
| The heavy run, **capped at 2 a month**                                                                                  | 60–80                                   |
| **Total**                                                                                                               | **≈ 95–115, leaving a reserve ≈ 45–65** |

That is too thin a reserve to keep by default, so each step adds its rows to the `git.md` budget table when it is built,
and the owner picks the offset (Q4). The heavy run is **not** exempt from the brake: from 75% of the monthly minutes
it runs only for a release that fixes a vulnerability; from 90%, not at all.

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

| Step | Contents                                                                    | Needs                     | Status |
| ---- | --------------------------------------------------------------------------- | ------------------------- | ------ |
| 0    | H0 the web app's missing HSTS and framing headers (found 2026-09-30)        | owner go-ahead 2026-09-30 | ✅     |
| 1    | H1 gitleaks, H2 Dependabot alerts, H3 CodeQL, H11 production posture        | —                         | ⬜     |
| 2    | The heavy-release workflow with H4–H6, and its check in `deploy.yml`'s gate | —                         | ⬜     |
| 3    | H7 k6, H8 benchmarks, H9 Lighthouse                                         | the thresholds (§7 Q1)    | ⬜     |
| 4    | H10 capacity run                                                            | when capacity matters     | ⬜     |

## 7. Open questions for the owner

- **Q1.** The thresholds: the p95 for placing an order (and for the market WebSocket fan-out), the error rate, and
  the Lighthouse budgets. A first measured run can propose numbers to agree on.
- **Q2.** Should the label be required for every release that touches the engine, auth, WebSockets or the schema
  (a check that fails the release PR when such a release lacks it) — or stay the release owner's call? Either way,
  a release whose head had a heavy run can't deploy unless that run is green (§4, "How it blocks").
- **Q3.** Is the log sink (TRADING_TEST_PLAN P5, "Fly log shipping with an alert on `level >= 50`") still wanted, or
  does M8's error digest by email cover it?
- **Q4.** The budget (§4): the new checks would leave a reserve of about 45–65 minutes. Offset it — for example the
  prod smoke every 8 h instead of 6 h (≈ 60 minutes back) — or accept the thinner reserve? Every row counts against
  the 2,000-minute plan: `git.md` keeps it whether or not GitHub bills this public repository, so going private
  again can't break the budget.
