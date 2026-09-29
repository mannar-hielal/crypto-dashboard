# Trading — Test Strategy & Test Plan

> **Owner:** Mannar Hielal · **Revised:** 2026-09-28 (after Bybit Parity BP-0 … BP-5) · **Scope:** paper trading
> (Spot + USDT Perpetual), the server engine behind it, the market-data feed, and the account flows around it.
>
> **Part A** is the strategy: what we test, how, with which tools, and the roadmap to automate the rest.
> **Part B** is the case catalogue (Sections 1–19, ordered as a beginner's learning path in Stages 0–6 — see its
> "Learning path index"): every case, its status, its tier and where its test lives. A10 turns what is still open
> into a to-do list.
> **How** each case gets implemented, and how to reproduce it by hand in the app, is in `docs/TEST_IMPLEMENTATION_PLAN.md`.
> The engine's rules are in `docs/APP_LOG.md` → "Bybit Parity (BP-0 … BP-5) — reference".

---

# Part A — Test strategy

## A1. Quality goals

1. **Bybit parity.** Fees, fills, margin, liquidation, funding and Closed P&L follow Bybit's v5 maths and field
   names (UTA, VIP 0, one-way). A difference is either a bug or a written "known gap".
2. **Nothing is lost while the tab is closed.** The server engine runs 24/7; a restart backfills exactly once.
3. **Money is conserved.** No action creates or destroys USDT except fees, funding and realized PnL.
4. **No regression reaches production.** Every bug gets a test that failed before its fix.
5. **Minimal owner involvement.** Tests run on every PR, nightly and after every deploy without anyone watching;
   the owner acts only on a red report or a one-time setup step (A9).

## A2. Where we stand (measured 2026-09-28)

| Area                   | Today                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / component tests | 1,164 Vitest tests in 63 files (server 713 / 26, client 451 / 37). The pure Decimal engine (`apps/server/src/trading/engine/__tests__`) has worked-number tests per rule; client panels have RTL tests against `src/test/fakePaperApi.ts`.                                                                           |
| Service / route tests  | `services.test.ts`, `paper.test.ts`, `auth.test.ts` etc. run Fastify in-memory (`app.inject`, `injectWS`) with Prisma mocked. **Since 2026-09-28 (P1a)** a separate `test:int` suite runs on a real Postgres 16 in CI: migrations from empty, drift against `schema.prisma`, and the `AccountRepository` round-trip. |
| Browser end-to-end     | **None.** "T3 · Playwright" was a planned tier; rows marked T3 were checked by hand.                                                                                                                                                                                                                                 |
| Bybit parity           | `bybitParity.ts` adapter + `parity:testnet`, nightly in CI (`parity.yml`, A4) since 2026-09-28. **First green run 2026-09-28** (run 36427289995): every compared v5 field matches after the first-run fixes (#163).                                                                                                  |
| Manual rows            | 90 rows with a ⬜ status in Part B before this revision (plus 2 ⬜ TradingView cross-check cells, 1.2.3 and 2.4.5), mostly live-feed, multi-tab, layout and TradingView side-by-side checks.                                                                                                                         |
| CI (`ci.yml`)          | Audit → type-check → format → lint → unit tests **with coverage thresholds** → build, plus an **integration job on Postgres**, on every PR and push to `develop` / `main` (thresholds and the job since 2026-09-28, P1a).                                                                                            |
| After deploy           | `deploy.yml` deploys; nothing checks the live site afterwards except Fly's `/health` check.                                                                                                                                                                                                                          |
| Review                 | The Claude review bot + the unresolved-thread merge gate.                                                                                                                                                                                                                                                            |

**Biggest risks not covered by automation today:** the persistence layer (`AccountRepository`, migrations) only
meets a real database in production; nobody checks the engine against Bybit itself; and the browser flows (live feed,
reconnect, two tabs) are only ever checked by hand.

## A3. Test levels (the tier column in Part B)

| Tier    | Level                                                                       | Tool                                     | Runs                              |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| **T1**  | Unit — pure engine rules with worked numbers; client pure libs              | Vitest                                   | pre-commit + every PR             |
| **T1p** | Property-based — invariants over random order sequences                     | Vitest + fast-check                      | every PR                          |
| **T2**  | Component — a panel rendered with a fake API                                | Vitest + React Testing Library (jsdom)   | pre-commit + every PR             |
| **T2i** | Integration — routes, WS, repository and migrations against real Postgres   | Vitest + Postgres service container      | every PR                          |
| **T3**  | End-to-end — the real app in a browser, on a deterministic replayed feed    | Playwright                               | every PR (smoke) + nightly (full) |
| **T4**  | Bybit parity — the same scenario on Bybit testnet and on our engine, diffed | `parity:testnet` in a scheduled workflow | nightly                           |
| **T5**  | Production synthetic checks — read-only, after every deploy and every 6 h   | Playwright (smoke project) + Fly health  | post-deploy + cron                |
| **M**   | Manual — only look-and-feel that a machine can't judge                      | —                                        | before a UI release               |

Rules of thumb: push every check to the **lowest tier that can catch the bug** (a rule belongs in T1, not in a
browser test); T3 covers wiring and user journeys, not maths; M is for what's left after that, and shrinks over time.

## A4. Practices and tools per kind of testing

### Engine correctness (T1, T1p)

- **Keep the worked-number tests** — each Bybit rule has a hand-computed example (e.g. long 0.1 BTC at 50,000, 10×:
  IM 500, fee to close 2.475, liq 45,149.0 — rounded up to the 0.1 tick, as Bybit does). They document the rule as much as they test it.
- **Add property-based tests with [fast-check](https://fast-check.dev)** (MIT, dev-only, no install script). Generate
  random sequences of place / cancel / fill / close / add-margin / leverage / funding / tick actions and assert
  invariants after every step:
  - wallet conservation: `balance + Σ margin + Σ reserves − fees − funding ± realizedPnl` is constant;
  - no negative `free` / `locked` spot balance, no negative isolated margin, a cross account ends ≥ 0 after
    liquidation;
  - reduce-only never grows or flips a position; a liquidation price moves toward the mark as leverage rises;
  - replaying the same actions gives the same state (determinism, which backfill relies on).
    A failure shrinks to the shortest action list that breaks the rule — a ready-made regression test.
- **Mutation testing with [Stryker](https://stryker-mutator.io)** (`@stryker-mutator/vitest-runner`) on
  `trading/engine/**` only, weekly: it changes operators and constants and checks a test fails. The mutation score
  shows where the suite asserts too little. Start by recording the score, then set a floor.
- **Coverage thresholds** in both `vitest.config.ts` files (`coverage.thresholds`), starting at today's numbers and
  ratcheting up; `trading/engine/**` held higher (target ≥ 95% lines / 90% branches). Run `test:coverage` in CI.

### Persistence and API (T2i)

- **A Postgres service container in `ci.yml`** (`postgres:16-alpine`, the tag `docker-compose.yml` pins) — cheaper and simpler than
  Testcontainers on GitHub Actions. A separate Vitest project (`*.int.test.ts`) runs against it:
  - `prisma migrate deploy` from an empty database, then `prisma migrate diff` against `schema.prisma` must be empty
    (catches a schema change without a migration);
  - a **migration replay** ✅ (`migrationReplay.int.test.ts`): seed a pre-BP-1 fixture in a second throwaway
    database, apply every later migration, assert the BP-1 pending leverage, the BP-2 fee backfill, the BP-3
    one-way merge and leverage pin, the BP-5 `ISOLATED_MARGIN` + notice, then load and trade the account;
  - `AccountRepository` load / save round-trips every field (today only covered by a mocked Prisma);
  - route tests for `/paper/**` and `/auth/**` with real transactions, incl. the concurrent-write paths
    (`Account.version`, `deleteMany` token races).
- **Contract test SDK ↔ server** ✅ (`src/__tests__/contract/sdkContract.test.ts`, P1d): the Fastify route schemas
  are the contract. The test calls every SDK function with `fetch` stubbed and checks the request (method, path, query,
  body) and the SDK-typed response fixture against the OpenAPI document (`app.swagger()`), so a server shape change
  can't land without the SDK change (`web.md` rule). The fixtures are type-checked (`tsconfig.contract.json`).

### Market data and Bybit parity (T3, T4)

- **Deterministic replay feed for tests.** Record a few minutes of Bybit public WS (spot + linear tickers,
  `orderbook.1`, klines, mark) and the REST responses the app needs (instruments, risk-limit, kline history, funding
  history) into fixtures. A small fake Bybit server (a Fastify app in `apps/server/src/test/fakeBybit.ts`) replays
  them. The Bybit hosts are hard-coded today (`BybitWebSocketManager.ts`, `BybitMarketInfo.ts`), so P2 adds optional
  `BYBIT_REST_URL` / `BYBIT_WS_URL` overrides, refused in production, with a control endpoint to push a chosen price (to cross a TP, reach a
  liquidation price or a funding timestamp on demand). Every T3 test then runs on known prices — no waiting for the
  market, no flakiness.
- **Nightly Bybit testnet parity (T4) — in place since 2026-09-28.** `.github/workflows/parity.yml` runs
  `parity:testnet` nightly (03:17 UTC) and on demand (`workflow_dispatch`), never on pull requests; one run at a time,
  since they share the testnet account. The script runs on a one-off Fly Machine in `sin` (app
  `crypto-dashboard-parity`), not on the GitHub runner, which Bybit geo-blocks; it aborts at 8 minutes and closes what
  it opened, and every Bybit call times out after 10 s. 🔐 Its secrets (`BYBIT_TESTNET_KEY`, `BYBIT_TESTNET_SECRET`,
  `FLY_PARITY_API_TOKEN`) live in the `bybit-testnet` environment, which only `main` may use, so a branch can't run a
  changed script with the keys before review. It uploads the log as an artifact and, when a run fails, opens (or
  comments on) one GitHub issue labelled `parity`. The first green run also closes the open questions in APP_LOG (O5,
  max-reducible margin, 110090 retCode).
- **Weekly spec-drift check.** A script compares `bybitSpec.ts` constants with Bybit's public API (fee rates via the
  help-centre values we store, `instruments-info`, `risk-limit` tiers, `fundingIntervalHour`) and opens an issue when
  Bybit changes a value — today that is only caught when someone re-reads the docs.
- **Feed parity replaces the TradingView side-by-side checks (Section 6).** A nightly job samples our own
  `/api/market` quotes, 1m candles and mark / funding and Bybit's public v5 REST at the same timestamps and asserts the
  Section 6 tolerances. The TradingView checks are retired (Part B, "TradingView cross-checks — retired"):
  TradingView's paper trading follows its own fees, fills and (no) perpetual rules, so it stopped being a valid
  reference once the app copied Bybit.

### User journeys (T3)

- **Playwright** (Chromium + WebKit, plus a mobile viewport — the site is used on phones) against the app started by
  Playwright's `webServer` (server + Vite) on the replay feed and the CI Postgres.
- Each test signs up its own user through the API (a test-only seed helper, disabled in production) — no shared
  state, safe to run in parallel.
- **Smoke set on every PR** (< 3 min): sign up → open USDT Perpetual → market buy → position row → close → Closed
  P&L row; Spot buy → Assets. **Full set nightly**: the ⬜ rows of Part B (tab closed and reopened, two tabs,
  refresh, reconnect after `setOffline`, token refresh after 20 min via a fake clock, TP / SL modal, add margin,
  cross mode switch, liquidation via the price-control endpoint, multi-pane layout and sync).
- On failure: trace, video and screenshot uploaded as CI artifacts (`trace: 'on-first-retry'`). One retry in CI;
  a test that needs the retry is reported as flaky and fixed, not ignored.
- **Visual regression:** `expect(page).toHaveScreenshot()` for the stable panels (order form, account bar, leverage
  and margin-mode modals, Closed P&L, Section 5 icons) in light and dark themes, on the replay feed. Baselines live
  in the repo and are updated deliberately (`--update-snapshots`) with the visual Q&A gate.
- **Accessibility:** `@axe-core/playwright` on the dashboard, auth and settings pages; fail on serious / critical.

### Resilience (T2i, T3)

Fault-injection cases, most already unit-tested at service level (Section 18), re-run end to end: Bybit WS drops and
reconnects, a stale mark (no liquidation on a stale price), the engine restarted mid-gap and mid-funding, a lease
handoff, a DB write failure (the account reloads, nothing half-applied). The fake Bybit server gets "drop" and
"stall" controls for this.

### Performance (on demand)

**[k6](https://k6.io)** scripts: N users each holding a market WS and the private paper WS while placing orders.
Watch p95 order latency, event-loop lag and memory on the Fly machine. Run before a release that touches the feed or
the engine, against staging (A5) — never against production.

### Security

- Already in place: `pnpm audit` gate, `eslint-plugin-security`, the security rules and refactor checklist, route
  schemas with `additionalProperties: false`, auth tests.
- Add: **OWASP ZAP baseline scan** (`zaproxy/action-baseline`) weekly against staging; **Dependabot** (or Renovate)
  for grouped weekly dependency PRs, which run through the same CI; a **secret scan** (`gitleaks`) in CI.

### Production (T5)

- **Post-deploy smoke:** `deploy.yml` runs the Playwright `@prod` project after `flyctl deploy` — read-only: `/health`,
  landing page, `/chart` shows a live price, the sign-in page loads with no console errors, the market WS connects.
  A failure marks the deploy red and notifies (GitHub notification / email) so a rollback (`fly releases rollback`)
  is one command away.
- **Hourly synthetic check** (the same `@prod` project on `schedule`) catches a dead feed or an expired certificate
  between deploys.
- **Log alerts:** Fly log shipping to a free tier (e.g. Better Stack / Axiom) with an alert on `level >= 50` (error)
  (the `paper-legacy-api` watch is no longer needed: O11 removed that API on 2026-09-28).

## A5. Environments and test data

| Environment   | Used for                     | Data                                                                                                                        |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Local         | Development, pre-commit hook | Local Postgres (`docker-compose`), Bybit public feed (`BYBIT_TESTNET` picks testnet / mainnet)                              |
| CI            | T1–T3 on every PR, nightly   | Ephemeral Postgres service container; fake Bybit replay server; users seeded per test                                       |
| Staging       | k6, ZAP, release rehearsal   | **Proposed:** a second Fly app `crypto-dashboard-api-staging` (smallest machine, auto-stop) deployed from `develop`, own DB |
| Production    | T5 only                      | Read-only checks; no test accounts created                                                                                  |
| Bybit testnet | T4 only                      | A dedicated testnet sub-account; keys in GitHub `bybit-testnet` environment secrets                                         |

Test data: every automated test creates its own user and resets its account (`POST /paper/account/reset`); nothing
depends on another test's leftovers. Fixtures (replay feed, pre-BP-2 DB seed) are versioned in the repo.

## A6. Entry / exit criteria

- **A PR can merge** when CI is green (today's gates + T1p + T2i + T3 smoke as they land), coverage doesn't drop, and
  no Claude review thread is unresolved (`git.md`).
- **A release (`develop` → `main`) can merge** when, in addition: the nightly T3 full set and T4 parity run on
  `develop` are green within the last 24 h, and any open `parity` issue is either fixed or recorded as a known gap.
- **A release is done** when the post-deploy T5 smoke is green.

## A7. Defects

- Every bug fix ships with a regression test that **fails before the fix** (current practice — keep it), at the
  lowest tier that reproduces it; the test name says what broke.
- Severity: **S1** money / data wrong or lost (fix before anything else, may hot-fix `main`) · **S2** a flow blocked
  · **S3** wrong display with a workaround · **S4** cosmetic.
- A flaky test is a defect (S3) — quarantined with an issue link, never silently retried.

## A8. Automation roadmap

Each step is its own small PR to `develop`, ordered by value per effort.

| Step   | Delivers                                                                                                                                 | Converts / adds                                    | Owner action                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **P1** | CI Postgres, migration-from-empty + drift check, migration replay, repository round-trip, coverage thresholds in CI                      | T2i; 18.7                                          | —                                                    |
| **P2** | Fake Bybit replay server, Playwright (smoke on PR, full nightly), seed helper; the missing T1 / T2 tests the ⬜ rows name                | Every ⬜ row marked `(P2)` in Sections 7–15 and 19 | —                                                    |
| **P3** | ✅ Nightly `parity:testnet` workflow + issue on mismatch (2026-09-28) · ✅ weekly spec-drift check · ✅ feed parity job (M6, 2026-09-29) | 17.6.4, Section 6 → T4                             | ✅ Testnet key, environment, funds (done 2026-09-28) |
| **P4** | fast-check invariants; Stryker weekly on the engine                                                                                      | T1p; mutation score                                | —                                                    |
| **P5** | Post-deploy + scheduled prod smoke, log alerts                                                                                           | T5                                                 | Pick / approve a log sink                            |
| **P6** | Staging Fly app; ZAP baseline; k6 scripts; Dependabot; gitleaks                                                                          | Security + performance                             | Approve staging cost                                 |

After P2 the only manual rows left are look-and-feel (drag feel, sounds, animation) — the M tier.

## A9. What the owner has to do

- **Done (2026-09-28):** the Bybit testnet setup for P3.
  - An API key on testnet.bybit.com: **Read-Write**, Unified Trading → Contract **Orders** + **Positions**, no
    withdrawal, no IP restriction (GitHub's runner IPs change).
  - `BYBIT_TESTNET_KEY` / `BYBIT_TESTNET_SECRET` in the repo's `bybit-testnet` environment (only `main` may use it),
    next to `FLY_PARITY_API_TOKEN`.
  - Test USDT requested (testnet.bybit.com → Assets → Assets Overview → Request Test Coins: 10,000 USDT + 1 BTC, once
    per 24 h). The account stays Isolated; the script switches modes itself.
- **Every ~3 months:** a testnet key without an IP allow-list expires. A run failing with `33004` opens a `parity`
  issue: create a new key with the same permissions and replace the two environment secrets. `10005` means the key
  lost its Read-Write / Contract permissions; `110007` means the account ran out of test USDT (request more).
- **Still to decide:** approve the staging app and a log sink (P5, P6).
- **Ongoing:** read the red ones — a failed nightly or parity issue arrives as a GitHub notification; a green week
  needs nothing. Before a UI release, the short M list (Part B rows tiered **M**).

## A10. To-do (from this plan)

Built from every Part B row that is ⬜ not run or ⏳ blocked (84 rows; none is ⚠️ today), the open steps of A8, and
the notes that call something pending or open. Grouped by the Part B learning stage, then by roadmap step for the
infrastructure no single row owns. A to-do is done when its rows turn ✅ at the named tier and their Tier column
drops the `(Pn)` tag. Format: `what — rows — target tier (roadmap step)`.

**Stage 0 — Getting in (9)**

- [x] Account Settings modal: open, close / backdrop, name and fees fields, the footer, the two-step reset with its
      3 s timeout (fake timers) and the reset itself — rows 8.1–8.11 — T2 · RTL, 8.8 also T1 (M1); plus the failed
      reset, new row 8.12 (NEW-8-1)
- [x] Spread badge decimal places — row 9.5 — T2 · RTL (P2)
- [ ] Sell / Buy on the live quote, spread hover, stale quote after a disconnect, pane switch — rows 9.1–9.4, 9.6,
      9.7 — T3 (P2)
- [x] Layout picker, active pane, per-pane symbol / interval, no PaneHeader in the `1` layout — rows 10.1.1–10.1.6,
      10.2.1–10.2.3, 10.3.1–10.3.3, 10.5.3 — T2 · RTL (P2)
- [x] `layoutStore` hydration — row 10.1.7 — T1 (P2) _(10.2.4 clamping: already tested, flipped to ✅ in M0)_
- [ ] PaneHeader live price / change badge and connection dot — rows 10.5.1, 10.5.2 — T3 (P2)
- [ ] Public `/chart` — row 14.1.10 — T3 (P2)
- [x] Auth flows in the Playwright set, each test signing up its own user — rows 19.1, 19.2, 19.4, 19.5, 19.7, 19.8
      (M4 smoke + M5a nightly; the offline sign-out is row 19.15, a defect)
      — T3 (P2)
- [ ] Signed-out page load in the post-deploy smoke — row 19.3 — T5 (P5)

**Stage 1 — Spot basics (2)**

- [x] Assets tab → TP / SL modal on a coin held — row 14.6.7 — T2 · RTL (M1)
- [ ] Spot buy → Assets in the PR smoke set — rows 14.6.1, 14.6.8 — T3 smoke (P2)

**Stage 2 — Reading your account (3)**

- [x] Order History records: market fill, limit fill columns, cancel, rejection, a mixed sequence — rows 7.1.1,
      7.2.1, 7.2.2, 7.3.1, 7.4.1, 7.6.1 — T1 (M1)
- [x] Orders / Order History rendering: sub-tab counts and the 2-min bench, Filled sub-tab, History tab without
      rejections, column picker persistence, status colours — rows 7.1.2–7.1.4, 7.2.3, 7.3.2, 7.4.2, 7.5.1, 7.5.2,
      7.6.2 — T2 · RTL (M1)
- [ ] ✅ rows tiered T3 · Playwright but only checked by hand (A2): automate maximize / restore, and re-tier the
      sounds to M as A8 says — rows 4.12, 4.13 → T3 (P2); 4.14–4.16 → M

**Stage 3 — USDT Perpetual basics (4)**

- [ ] Perpetual smoke on every PR: sign up → open USDT Perpetual → market buy → position row → close → Closed P&L
      row (the "T3 Playwright pending" notes of Sections 1–2) — rows 1.1.1–1.1.4, 1.6.3, 17.4.1 — T3 smoke (P2)
- [ ] Offline market order, today checked by hand — row 1.7.8 — T3 with `setOffline` (P2)
- [ ] Edit a pending bracket and an open position's TP / SL in the nightly full set — rows 4.17, 4.18 — T3 (P2)
- [x] Known cosmetic gap (note under 1.4): the TP / SL exit order showed Type `MARKET` — already fixed by the
      BP-1 server engine (the exit order records `take-profit` / `stop-loss`); pinned by `actions.test` "1.4.3: the TP
      close is recorded as a filled Take Profit order" and "1.5.3: an SL close…" (2026-09-28)

**Stage 4 — Risk management (2)**

- [ ] Chart type menu → "Mark price line" — row 15.6.2 — T3 (P2)
- [ ] Add margin, and a liquidation driven through the fake feed's price control, in the nightly full set — rows
      17.1.1, 15.4.1, 15.4.2 — T3 (P2)

**Stage 5 — Advanced (4)**

- [x] Multi-symbol PnL from `lastKnownPrices` (seed the keys the Section 11 intro describes) — rows 11.1–11.8 —
      T1 (P2) _(done at T2 · RTL in `MultiSymbolPnl.test`; the T3 flow waits on the fake feed)_
- [x] Sync options persistence — row 10.4.8 — T1 (P2) _(10.4.1–10.4.3: already tested, flipped to ✅ in M0)_
- [ ] Crosshair and time-range sync on the real chart canvas — rows 10.4.4–10.4.7 — T3 (P2)
- [ ] Cross ↔ isolated mode switch in the nightly full set — row 17.5.6 — T3 (P2)

**Stage 6 — Under the hood (10)**

- [x] First green nightly testnet parity run — rows 17.6.4, 6.5 — T4 (P3; scheduled run 36517770455, 2026-09-29). It
      does **not** settle APP_LOG's open questions: the scenario never reaches a max-reducible margin or a 110090
      refusal, and its unrealised P&L is too small to prove O5 or `positionValue`'s basis — still open there
- [x] Feed parity job: Sell / Buy vs best bid / ask, last 1m candle, mark / index / funding, freshness — rows
      6.1–6.4 — T4 (P3; M6: `tools/feedParity.ts`, nightly in `feed-parity.yml`)
- [ ] Browser tab title — row 6.6 — T3 (P2)
- [ ] Spot feed in the browser: spread badge, last candle vs Bybit Spot, cached quote on reload — rows
      12.1.1–12.1.3 — T3 on the replay feed (P2)
- [ ] 24/7 engine: a limit fill and a TP while the tab is closed, a restart with a price cross during the downtime
      — rows 13.2.1, 13.2.2, 13.2.4 — T3 (P2)
- [ ] Two tabs in sync, and a trade after 20+ minutes (token refresh on a fake clock) — rows 13.3.1, 13.3.3 — T3
      (P2)
- [x] Cross-phase regression suite on a real database — row 18.7 (covers 18.1–18.6) — T2i (P1); it found 18.8
- [x] Migration replay from a pre-BP-2 seed, replacing the manual runs: BP-2 fee backfill, BP-3 one-way merge and
      leverage pin, BP-5 `ISOLATED_MARGIN` + notice — rows 14.7.1, 15.2.3, 17.5.1 — T2i (P1)
- [ ] End-to-end resilience with the fake feed's "drop" / "stall" controls: WS drop and reconnect, stale mark,
      restart mid-gap and mid-funding, lease handoff, DB write failure (A4 Resilience) — rows 15.4.5, 18.1, 18.2 —
      T2i / T3 (P2)
- [x] A dedicated test for the stale-on-error path of instruments / risk-limit (today "covered by code review") —
      row 12.3.5 — T1 (no step)

**Roadmap infrastructure (A8) not owned by one row**

_P1 — persistence (6)_

- [x] Postgres service container in `ci.yml` and a separate Vitest project for `*.int.test.ts` — T2i (P1a,
      2026-09-28)
- [x] `prisma migrate deploy` from an empty database + `prisma migrate diff` against `schema.prisma` must be empty
      — T2i (P1a)
- [x] `AccountRepository` load / save round-trip of every field — T2i (P1a; every action type, plus the Closed P&L
      trade row)
- [x] `/paper/**` and `/auth/**` route tests with real transactions, incl. `Account.version` and `deleteMany` races
      — T2i (P1c: `paperRoutes.int.test`, `authRoutes.int.test`; rows 1.7.13, 13.3.8, 18.9, 19.11, 19.12)
- [x] Coverage thresholds in both `vitest.config.ts` and `test:coverage` in CI — (P1a). Floors at today's numbers:
      server 82% lines, engine 97% lines / 85% branches, client 46% lines; raised as tests land (client 48% lines
      after the M1 account-panel tests)
- [x] SDK ↔ server contract test against the generated OpenAPI document (A4; A8 names no step) — T1 (P1d:
      `sdkContract.test`, 43 cases; it found 19.13, 19.14 and the SDK register type)

_P2 — replay feed and browser tests (7)_

- [x] Record Bybit WS / REST fixtures and serve them from a fake Bybit — (P2; M3b: `pnpm record:bybit` →
      `fixtures/bybit/recorded.json`, served by `apps/server/src/tools/fakeBybit/`)
- [x] `BYBIT_REST_URL` / `BYBIT_WS_URL` overrides, refused in production, plus the price-control and drop / stall
      endpoints — (P2; overrides M3a, controls M3b: `/__control/*` and `pnpm feed`)
- [x] Test-only user seed helper, disabled in production — (P2; M3a: `/api/test/users`, the email outbox and an
      account reset behind `ENABLE_TEST_HOOKS` + `TEST_HOOKS_SECRET`, refused at boot in production)
- [ ] Playwright setup: Chromium + WebKit + a mobile viewport, `webServer`, trace / video on retry, one CI retry —
      T3 (P2; M4 ✅ Chromium, `webServer` ×3, traces / video, one CI retry — WebKit and mobile come with the nightly set, M5)
- [ ] Smoke set on every PR (< 3 min) and the full ⬜ set nightly — T3 (P2; M4 ✅ the smoke set: 3 tests, ~9 s, the smoke
      steps of the single CI job; the full set is M5, nightly and on release PRs)
- [ ] Visual regression baselines, light and dark: order form, account bar, leverage and margin-mode modals, Closed
      P&L, Section 5 icons — T3 (P2)
- [ ] `@axe-core/playwright` on the dashboard, auth and settings pages; fail on serious / critical — T3 (P2)
      (M5a: the auth pages — /reset-password clean, three pages with the contrast defect 19.16)

_P3 — Bybit parity (1, plus the two Stage 6 T4 items)_

- [x] Weekly spec-drift check of `bybitSpec.ts` against Bybit's public API, opening an issue on a change — (P3;
      M6: `tools/specDrift.ts`, Sundays in `feed-parity.yml`; instrument rules and risk tiers — fee rates need a
      signed-in account, so they stay a manual check)

_P4 — invariants and mutation testing (2)_

- [ ] fast-check invariants over random action sequences: wallet conservation, no negative balances / margin,
      reduce-only never grows or flips, replay determinism — T1p (P4)
- [ ] Stryker weekly on `trading/engine/**`: record the score, then set a floor — (P4)

_P5 — production checks (3)_

- [x] Playwright `@prod` project after `flyctl deploy`, failing the deploy and notifying — T5 (P5; M8:
      `apps/e2e/tests-prod`, last step of `deploy.yml`)
- [x] The same project on `schedule`, every 6 h since 2026-09-29 (was hourly; the Actions budget in `git.md`) — T5 (P5; M8: `prod-smoke.yml`, opens / comments a `prod-smoke` issue)
- [ ] Fly log shipping with an alert on `level >= 50` — (P5, needs the owner's sink)

_P6 — staging, security, performance (5)_

- [ ] Staging Fly app `crypto-dashboard-api-staging` deployed from `develop`, own DB — (P6, needs the owner's
      approval)
- [ ] OWASP ZAP baseline weekly against staging — (P6)
- [ ] k6 scripts (market WS + private WS + orders), run before a feed / engine release — (P6)
- [ ] Dependabot (or Renovate) grouped weekly PRs — (P6)
- [ ] `gitleaks` secret scan in CI — (P6)

**Owner decisions (A9) (2)**

- [ ] Pick / approve a log sink — (P5)
- [ ] Approve the staging app's cost — (P6)

Recurring, not a to-do: replace the testnet key when a `parity` issue reports `33004` (about every 3 months).

**Do first:** (1) the first green testnet parity run (Stage 6, unblocks 17.6.4 / 6.5 and three APP_LOG questions);
(2) P1 — CI Postgres, migration replay and 18.7, the biggest uncovered risk in A2; (3) the P2 T1 / T2 rows that need
no new infrastructure — Sections 7, 8, 11, 10.1–10.4 store / RTL, 9.5, 14.6.7; (4) the fake Bybit feed + Playwright
smoke (perpetual, Spot, auth), which every T3 item waits on; (5) the feed parity job (6.1–6.4).

---

# Part B — Case catalogue

## Learning path index

Part B follows a beginner's learning path, from the first sign-in to the most advanced concepts, and ends with the
checks that only testers need. The sections keep their original numbers, and every case keeps its ID (`1.1.3`,
`14.6.1`, `17.6.4` …), because test names, code comments and `docs/APP_LOG.md` cite them. A section that mixed levels
is split across stages. Its heading repeats with a _(part: …)_ note, and its intro is repeated with each part.

| Stage                            | Sections / subsections, in order                                        | Purpose                                                                          |
| -------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **0 — Getting in**               | 19 (19.1–19.8, 19.13–19.19) · 8 · 14.1 · 10.1, 10.2, 10.3, 10.5 · 5 · 9 | Sign up and in, settings, pick a market, arrange charts, read Sell / Buy, spread |
| **1 — Spot basics**              | 14.6                                                                    | First trades: Spot market, limit and TP / SL orders, fees in the coin, Assets    |
| **2 — Reading your account**     | 4 (4.1–4.16, 4.21–4.23) · 7                                             | Orders / Order History / History tabs, journal, panel controls, sounds           |
| **3 — USDT Perpetual basics**    | 1 · 2 · 3 · 4 (4.17–4.18) · 14.5, 14.2, 14.3, 14.4 · 15.2               | Long / short, market, limit and stop orders, TP / SL, leverage, fees, fills      |
| **4 — Risk management**          | 15.1, 15.3, 15.4, 15.5, 15.6 · 17.1, 17.2, 17.3, 17.4                   | Mark price, liquidation, margin, risk tiers, trigger source, reduce-only, P&L    |
| **5 — Advanced**                 | 16 · 17.5 · 11 · 10.4 · 4 (4.19–4.20)                                   | Funding, cross margin, several symbols and synced panes                          |
| **6 — Under the hood (testers)** | 12 · 13 · 14.7 · 6 · 17.6 · 18 · 19 (19.9–19.12)                        | Feed per category, 24/7 engine, migrations, Bybit parity, regression suite       |

**Where did Section N go?**

| Old section                                       | Now in                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1 — Market Orders                                 | Stage 3                                                                   |
| 2 — Limit Orders                                  | Stage 3                                                                   |
| 3 — Stop Orders                                   | Stage 3                                                                   |
| 4 — Cross-cutting / Regression                    | Stage 2 (4.1–4.16, 4.21–4.23) · Stage 3 (4.17–4.18) · Stage 5 (4.19–4.20) |
| 5 — Symbol Pair Icons                             | Stage 0                                                                   |
| 6 — Price parity against Bybit                    | Stage 6                                                                   |
| 7 — Order History Tab                             | Stage 2                                                                   |
| 8 — Account Settings Modal                        | Stage 0                                                                   |
| 9 — Sell/Buy Prices & Spread                      | Stage 0                                                                   |
| 10 — Multi-Chart Layout                           | Stage 0 (10.1, 10.2, 10.3, 10.5) · Stage 5 (10.4 sync options)            |
| 11 — Multi-Symbol PnL                             | Stage 5                                                                   |
| 12 — Market data per category (BP-0)              | Stage 6                                                                   |
| 13 — Server trading engine (BP-1)                 | Stage 6                                                                   |
| 14 — Markets, Bybit fees and fill prices (BP-2)   | Stage 0 (14.1) · Stage 1 (14.6) · Stage 3 (14.2–14.5) · Stage 6 (14.7)    |
| 15 — Mark price, liquidation, re-margining (BP-3) | Stage 3 (15.2) · Stage 4 (15.1, 15.3–15.6)                                |
| 16 — Funding (BP-4)                               | Stage 5                                                                   |
| 17 — Cross margin, risk tiers, refinements (BP-5) | Stage 4 (17.1–17.4) · Stage 5 (17.5) · Stage 6 (17.6)                     |
| 18 — Cross-phase regression suite                 | Stage 6                                                                   |
| 19 — Account flows                                | Stage 0 (19.1–19.8, 19.13–19.19) · Stage 6 (19.9–19.12)                   |

---

**How to read it.** Status: ⬜ not run · ✅ pass · ❌ fail · ⚠️ partial · ⏳ blocked · ➖ superseded / retired. **TV ✓** is a historical TradingView cross-check (retired 2026-09-28, see below). **Tier** is where the case is
checked today (A3); a ⬜ row's tier is where it goes when automated, with the roadmap step (e.g. `T3 (P2)`). "Live ✓"
= checked by hand on the dev server; numbers in older ✅ notes are the record of that run and may predate a later
phase.

**What changed under Sections 1–11** (written before the Bybit parity work; the flows still hold):

- **BP-1 (2026-09-26): trading runs on the server.** T1 rows for Sections 1–4 and 7 now test the real engine in
  `apps/server/src/trading/engine/__tests__/` (`actions.test.ts`, `triggers.test.ts`); the old client store and
  monitor tests are gone. T2 rows render the real panels against `fakePaperApi` and assert the intent sent. "Persists
  in localStorage" (4.6, 4.22) now means "the server hydrates it".
- **BP-2: two markets and Bybit fees.** Sections 1–4 and 7–9 describe the leveraged form, now **USDT Perpetual**
  (`/dashboard/usdt/BTCUSDT`); Spot is 14.6 (Stage 1). Fees are 0.055% taker / 0.02% maker on notional (Spot 0.1% in the
  asset received), not the flat 0.07% in the older notes. Leverage is per symbol (the `10x ▾` chip), not in Account
  Settings (8.3).
- **BP-3: mark price and one-way mode.** Perpetual PnL uses the mark price; same-side orders merge into one position
  per symbol (1.7.9's "multiple positions" now nets into one).
- **BP-5: cross margin is the default for new accounts.** The worked numbers in Sections 1–4 assume **Isolated** — switch
  with the chip before running them. TP / SL can trigger on Last / Mark / Index (Last is the default the rows assume);
  the server also refuses a TP / SL on the wrong side of the base price (17.2.6).

**Test environment for manual rows:** local dev (`pnpm dev`), BTCUSDT live feed, a throwaway account reset between
sections (⚙️ → Reset account).

## TradingView cross-checks — retired (2026-09-28)

Until BP-2 the manual runs were checked side by side against TradingView's paper trading on Bybit BTCUSDT Spot (the
**TV ✓** column and the "TV cross-check" notes). That stopped being a valid reference once the app copied Bybit:

- TradingView's paper trading has its own fees and fill model, not Bybit's VIP-0 maker / taker fees at the best bid /
  ask;
- it has no USDT Perpetual mark price, liquidation, funding, cross margin or risk tiers;
- so a mismatch no longer says which side is wrong, and a match proves little.

Bybit itself is the reference now: the **testnet parity run** (T4, nightly) for fills, fees, margin and Closed P&L,
and the **feed parity job** (Section 6, roadmap P3) for prices. The TV ✓ values and notes below stay as the record
of the 2026-05 runs; no new TradingView checks are made. The side-by-side procedure is in git history
(`git show 8d40f88:docs/TRADING_TEST_PLAN.md`).

---

## Setup checklist (run before every section)

- [ ] Dev server running; price updating in TradingPanel header and browser tab
- [ ] Order & Account Management panel open; balance = $10,000.00
- [ ] Account reset
- [ ] Journal empty

---

## Stage 0 — Getting in

Create an account, find your way around the dashboard and read a live price before placing any order.
After this stage the learner can sign up, verify and sign in, change their settings, pick a market and a
symbol, arrange the charts, and tell the Sell (best bid) and Buy (best ask) prices and the spread apart.

### Section 19 — Account flows (auth and settings) _(rows 19.1–19.8, 19.13–19.19; 19.9–19.12 are in Stage 6)_

> Verified end to end in a real browser and in production on 2026-09-27 (releases #148, #150, #155). The first
> candidates for the T3 smoke set (P2). A wrong password on sign-in, change email / password or delete account logs
> one 401 in the browser console — deliberate (a failed login is never answered with a 2xx).

| #     | Flow                                                | Expected                                                                                                                                                                      | Status | Tier     | Test / notes                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19.1  | Register with an invalid username (`ab`)            | Inline field error; no uncaught ZodError; button doesn't stick on "Creating account…"                                                                                         | ✅     | T2 + T3  | `authFormValidation.test`; live ✓. `e2e/tests/auth/register.spec` "[19.1] a too-short username…" (nightly).                                                                                                                                                                                                |
| 19.2  | Register, then verify the email                     | Link works once; a second click / tab gets 400, not 500                                                                                                                       | ✅     | T1 + T3  | `auth.test` verify-email; live ✓. `e2e/tests/auth/register.spec` "[19.2][19.4] register, verify the email once, then sign out and back in" (smoke).                                                                                                                                                        |
| 19.3  | Signed-out page load                                | `/api/auth/refresh` answers 204, no console error                                                                                                                             | ✅     | T1 + T5  | `auth.test` refresh; prod ✓; `tests-prod/prod.spec` "[19.3] a signed-out visit loads cleanly" after every deploy and hourly.                                                                                                                                                                               |
| 19.4  | Sign in / sign out / reload                         | Session restored on reload; sign-out works even with the network down                                                                                                         | ✅     | T1 + T3  | `auth.test` login / logout; `LoginPage.returnTo.test`. `e2e/tests/auth/register.spec` "[19.2][19.4] register, verify the email once, then sign out and back in" (smoke).                                                                                                                                   |
| 19.5  | Forgot / reset password                             | Same answer whether or not the email exists; reset revokes every session and clears this browser's cookie                                                                     | ✅     | T1 + T3  | `auth.test` forgot-password / reset-password. `e2e/tests/auth/passwordReset.spec` "[19.5]…" (nightly): identical answer for any email, reset via the outbox link, the other session ended.                                                                                                                 |
| 19.6  | Settings → change email                             | One verification link, used atomically; one security-alert email                                                                                                              | ✅     | T1 + T2  | `auth.test` lifecycle; `VerifyEmailChangePage.test`.                                                                                                                                                                                                                                                       |
| 19.7  | Settings → change username / password               | Saved; a password change ends the other sessions                                                                                                                              | ✅     | T1 + T3  | `auth.test` lifecycle. `e2e/tests/auth/settings.spec` "[19.7][19.14]…", "[19.7] a password change ends the other sessions" (nightly).                                                                                                                                                                      |
| 19.8  | Settings → export / delete account                  | JSON export downloads; cancel works; "Delete Account Now" removes the user and its paper account                                                                              | ✅     | T1 + T3  | `auth.test` deletion; live ✓. `e2e/tests/auth/settings.spec` "[19.8]…" (nightly; the e2e server deletes at once, as dev mode does).                                                                                                                                                                        |
| 19.13 | Sign back in with a deletion pending (P1d)          | The "scheduled for deletion" banner with its Cancel shows (the API sends `deletionRequestedAt`; no auth response did, so the banner never appeared)                           | ✅     | T1 + T3  | `auth.test` "should send deletionRequestedAt so a pending deletion shows its banner after sign-in"; `sdkContract.test`. `e2e/tests/auth/settings.spec` "[19.13]…" (nightly, through the `request-deletion` test hook).                                                                                     |
| 19.14 | Settings → change username / email: the reply (P1d) | Username: the reply carries the user and the modal shows success (the swapped schema sent `{}`, so a successful rename showed an error). Email: the reply carries its message | ✅     | T1 + T3  | `auth.test` "updates the username", "updates the email and sends a verification link"; `sdkContract.test`. `e2e/tests/auth/settings.spec` "[19.7][19.14]…".                                                                                                                                                |
| 19.15 | Sign out with the network down (M5a)                | The user menu and Sign out stay reachable while offline, and the sign-out is finished on the server once back online (the refresh cookie would otherwise restore the session) | ✅     | T1 + T3  | Fixed (visual gate 2026-09-29): the offline notice is a bottom-centre toast; `signOutOnServer()` remembers a sign-out the server didn't get and `restoreSession()` finishes it. `session.test` "signOutOnServer() — a sign-out made offline"; `e2e/tests/auth/session.spec` "[19.15]…" (Chromium, WebKit). |
| 19.16 | Auth pages meet WCAG AA contrast (M5a)              | axe finds no serious / critical violation on /login, /register, /forgot-password, /reset-password                                                                             | ✅     | T3 · axe | Fixed (visual gate 2026-09-29): links use the new `purpleLight` token (#a99cff, 6.2:1) and are underlined; the disclaimer is 11 px at full muted colour. `e2e/tests/a11y/auth.spec` passes on all four pages.                                                                                              |
| 19.17 | Login rate limit (was NEW-19-1)                     | 10 attempts per visitor in 15 minutes, then 429 with Retry-After                                                                                                              | ✅     | T1       | `loginRateLimit.test`.                                                                                                                                                                                                                                                                                     |
| 19.18 | Unverified user (was NEW-19-2)                      | Held on /unverified, the dashboard sends them back; an immediate resend is confirmed but no second email goes out within 5 minutes (anti-spam, by design)                     | ✅     | T3       | `e2e/tests/auth/unverified.spec` (nightly).                                                                                                                                                                                                                                                                |
| 19.19 | Keyboard-only sign-in (was NEW-19-3)                | Tab reaches email → password → submit; Enter signs in                                                                                                                         | ✅     | T3       | `e2e/tests/a11y/auth.spec` "signing in works with the keyboard alone". The Sign-in button's animated wrapper is an extra tab stop (framer-motion `whileHover`); minor.                                                                                                                                     |

### Section 8 — Account Settings Modal

> Open via the **⚙️ gear** button in the **Order & Account Management** panel header.

| #    | Action                                                               | Expected                                                                                                                                                        | Status | Tier     | Notes                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Click ⚙️ gear button                                                 | Modal opens; "Account Settings" title visible                                                                                                                   | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.1] should open the modal titled …"                                                                                                          |
| 8.2  | Account name field                                                   | Shows logged-in username; field is **read-only** (cannot type)                                                                                                  | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.2] should show the signed-in username as read-only text …"                                                                                  |
| 8.3  | Leverage                                                             | **No leverage field** (BP-2): leverage is per symbol, set with the `Cross 10x ▾` / `Isolated 10x ▾` chip in the trading panel (§14.5)                           | ✅     | T2 · RTL | Removed with the per-symbol leverage. `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.3] should have no leverage field …"                                                                   |
| 8.4  | Fees field                                                           | Displays `Spot 0.1%` and `Perpetual 0.055% taker · 0.02% maker` — read-only                                                                                     | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.4] should show the Bybit VIP-0 fees …"                                                                                                      |
| 8.5  | Footer button                                                        | Reads **Done** and just closes the modal (nothing left to save)                                                                                                 | ✅     | T2 · RTL | Was "Save" (it committed the account leverage). `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.5] should close without resetting when Done is clicked"                                     |
| 8.6  | Click "Reset account" once                                           | Button changes to a confirm state (e.g. "Confirm reset?"); 3 s auto-cancel timer starts                                                                         | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.6] should ask \"Confirm reset?\" …" (fake timers)                                                                                           |
| 8.7  | Wait 3 s without confirming                                          | Button reverts to default "Reset account" text; no reset occurred                                                                                               | ✅     | T2 · RTL | Use `vi.useFakeTimers()` to advance the clock 3 s without real waiting. `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.7] should go back to \"Reset account\" … when 3 s pass unconfirmed" |
| 8.8  | Click "Reset account" → immediately click confirm within 3 s         | Modal closes; balance resets to $10,000; positions/orders/journal cleared                                                                                       | ✅     | T1 + T2  | T1: `actions.test` "reset()" clears the account state. T2: `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.8] should reset once, close the modal and show a fresh $10,000 account …"        |
| 8.9  | Click ✕ (close) button on modal                                      | Modal dismisses; no reset; no changes                                                                                                                           | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.9] should close without resetting when ✕ is clicked"                                                                                        |
| 8.10 | Click backdrop (outside modal)                                       | Modal dismisses; confirm state cleared if it was pending                                                                                                        | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.10] should close on a backdrop click …", "[8.10][8.11] should clear a pending confirm …"                                                    |
| 8.11 | Open modal while in mid-confirm state; dismiss via backdrop; re-open | Confirm state is cleared on re-open — button shows default "Reset account"                                                                                      | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" "[8.10][8.11] should clear a pending confirm when the backdrop closes the modal and it is reopened"                                             |
| 8.12 | Reset account fails (server error / offline)                         | The modal stays open with "⚠ Reset failed — your account is unchanged. Try again."; the account is untouched; the button offers "Reset account" again           | ✅     | T2 · RTL | NEW-8-1. `OrderAccountManagementPanel.test` "[8.12] should keep the modal open with an inline error…". Fixed 2026-09-28 (was: the modal closed as if the reset worked; approved in the visual gate).                    |
| 8.13 | Reset in flight                                                      | The button reads **Resetting…** (disabled) and the modal stays open until the server answers — ✕, Done and the backdrop do nothing meanwhile; success closes it | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "[8.13] should show \"Resetting…\"…".                                                                                                                                                |

### Section 14 — Markets, Bybit fees and fill prices (Bybit Parity BP-2) _(part: 14.1 — the rest of Section 14 is in Stages 1, 3 and 6)_

> Two markets: **Spot** (coin balances, 1×, no shorting) and **USDT Perpetual** (positions, per-symbol leverage).
> Reference: `docs/APP_LOG.md` Bybit Parity BP-2. ✅ in the Tier column means automated; the Notes say where. "Live ✓"
> rows were run against the dev server + the live Bybit feed on 2026-09-26 (22 checks, throwaway users deleted).

#### 14.1 Market URLs and the Trade menu

| #       | Action                                                       | Expected                                                                                                        | Status | Tier     | Notes                                         |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------ | -------- | --------------------------------------------- |
| 14.1.1  | Open `/dashboard`                                            | Redirects to the active pane's market URL, e.g. `/dashboard/spot/BTC/USDT`                                      | ✅     | T2 · RTL | `useMarketUrlSync.test` DashboardRedirect.    |
| 14.1.2  | Open `/dashboard/usdt/ETHUSDT` directly                      | Active pane shows ETHUSDT USDT Perpetual (the URL wins over the saved layout)                                   | ✅     | T2 · RTL | `useMarketUrlSync.test`.                      |
| 14.1.3  | Open `/dashboard/spot/btc/usdt`, `/dashboard/spot/PEPE/USDT` | First is replaced by `/dashboard/spot/BTC/USDT`; the unknown pair goes to the active pane's market              | ✅     | T1 + T2  | `marketRoutes.test`, `useMarketUrlSync.test`. |
| 14.1.4  | Header **Trade ▾** → USDT Perpetual                          | Pane switches market, symbol kept; URL becomes `/dashboard/usdt/<symbol>`; ✓ + purple bar on the current market | ✅     | T2 · RTL | `TradeMenu.test`.                             |
| 14.1.5  | Keyboard: focus Trade, ArrowDown, ArrowDown, Escape          | Opens on the current market, moves, wraps, closes back to the trigger                                           | ✅     | T2 · RTL | `TradeMenu.test`.                             |
| 14.1.6  | Switch market / symbol, then browser **Back**                | Back returns to the previous market; switching pane focus does not add history entries                          | ✅     | T2 · RTL | `useMarketUrlSync.test` (PUSH / REPLACE).     |
| 14.1.7  | Switch symbol or market                                      | The page does not reload: charts, feeds and the form stay mounted                                               | ✅     | T1       | `marketRoutes.test` routeKey.                 |
| 14.1.8  | Logged out, open `/dashboard/usdt/ETHUSDT` → sign in         | Lands on `/dashboard/usdt/ETHUSDT`; a foreign `from` (`//evil.example`, `/admin/…`) lands on `/dashboard`       | ✅     | T2 · RTL | `LoginPage.returnTo.test` 🔐.                 |
| 14.1.9  | In-panel **Spot \| USDT Perpetual** tabs                     | Same effect as the header menu; the SymbolBar and pane headers show "Spot" / "Perpetual" under / after the pair | ✅     | T2 · RTL | `TradingPanel.test` "market tabs".            |
| 14.1.10 | Public `/chart`                                              | Trade menu works but the URL stays `/chart`                                                                     | ⬜     | T3 (P2)  |                                               |

### Section 10.1 — Multi-Chart Layout: Layout switching

> Run with single-chart `1` layout first, then test each split layout. No TV cross-check column needed.

| #      | Action                                                        | Expected                                                                | Status | Tier        | Notes                                                                                                                                         |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1.1 | Open `ChartLayoutPicker` (grid icon in SymbolBar, right side) | Popover shows 5 SVG layout icons: `1 · 2h · 2v · 3h · 4`                | ✅     | T2 · RTL    | `MultiChartLayout.test` "should offer the 5 layouts in the picker (10.1.1)" (`layout.picker`, `layout.option` × 5 with their titles)          |
| 10.1.2 | Select **2h** (2 columns)                                     | Chart area splits into 2 side-by-side panes; PaneHeader visible on each | ✅     | T2 · RTL    | `MultiChartLayout.test` "should show %s as %i panes in its grid, each with a PaneHeader" (2h: 2 `pane`s, grid `0.5fr 0.5fr` × `1fr`)          |
| 10.1.3 | Select **2v** (2 rows)                                        | 2 stacked panes                                                         | ✅     | T2 · RTL    | Same test, 2v: 2 panes, grid `1fr` × `0.5fr 0.5fr`                                                                                            |
| 10.1.4 | Select **3h** (3 columns)                                     | 3 side-by-side panes                                                    | ✅     | T2 · RTL    | Same test, 3h: 3 panes, 3 equal columns                                                                                                       |
| 10.1.5 | Select **4** (2×2 grid)                                       | 4 panes in grid                                                         | ✅     | T2 · RTL    | Same test, 4: 4 panes, 2 × 2 grid                                                                                                             |
| 10.1.6 | Switch back to **1** (single)                                 | Single pane; PaneHeader hidden                                          | ✅     | T2 · RTL    | `MultiChartLayout.test` "should go back to one pane with no PaneHeader when 1 is picked (10.1.6, 10.5.3)"                                     |
| 10.1.7 | Refresh browser with 2h layout active                         | Layout persists (loaded from `cd-layout` localStorage)                  | ✅     | T1 · Vitest | `layoutStore.test` "should restore the 2h layout when the page reloads (10.1.7)" (the written `cd-layout` read back by `persist.rehydrate()`) |

### Section 10.2 — Multi-Chart Layout: Active pane selection

| #      | Action                                           | Expected                                                                                        | Status | Tier        | Notes                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.2.1 | In 2h layout: click right pane                   | Right pane gets animated purple border + inner glow; TradingPanel reacts to right pane's symbol | ✅     | T2 · RTL    | `MultiChartLayout.test` "should make the clicked pane active and move the border back on a second click", "should make the order form and SymbolBar follow the active pane" (`pane` gets `data-active`). The border's animation → F10 |
| 10.2.2 | Click left pane                                  | Purple border moves to left pane (animated)                                                     | ✅     | T2 · RTL    | `MultiChartLayout.test` "should make the clicked pane active and move the border back on a second click (10.2.1, 10.2.2)"                                                                                                             |
| 10.2.3 | Switch to 4-pane layout; click pane 3            | Pane 3 becomes active; animated left stripe in PaneHeader moves to pane 3                       | ✅     | T2 · RTL    | `MultiChartLayout.test` "should move the PaneHeader stripe to pane 3 in the 4-pane layout (10.2.3)" (pane index 2)                                                                                                                    |
| 10.2.4 | Switch to a smaller layout while active pane = 3 | `activePane` clamps to `paneCount − 1`; no crash                                                | ✅     | T1 · Vitest | `layoutStore.test` "clamps activePane to count-1 (not 0) when out of range"                                                                                                                                                           |

### Section 10.3 — Multi-Chart Layout: Per-pane symbol + interval

| #      | Action                                                             | Expected                                                              | Status | Tier     | Notes                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10.3.1 | In 2h layout: open PaneHeader symbol picker for pane 0; select ETH | Pane 0 switches to ETH; pane 1 stays on BTC; each shows correct price | ✅     | T2 · RTL | `MultiChartLayout.test` "should switch only pane 0 to ETH from its PaneHeader picker (10.3.1)" (pane 1 set to SOL first — it defaults to ETH). Live prices → T3 (10.5.1) |
| 10.3.2 | Use interval buttons in PaneHeader for pane 1: click 5m            | Pane 1 fetches 5m bars; pane 0 stays on its interval                  | ✅     | T2 · RTL | `MultiChartLayout.test` "should send 5m to pane 1's chart only (10.3.2)" (the mocked `ChartPanel` of pane 1 gets `5m`, pane 0 keeps `1m`)                                |
| 10.3.3 | Use SymbolBar to change active pane symbol                         | Only the active pane updates                                          | ✅     | T2 · RTL | `MultiChartLayout.test` "should change only the active pane from the SymbolBar picker (10.3.3)"                                                                          |

### Section 10.5 — Multi-Chart Layout: PaneHeader visual elements

| #      | Action                                 | Expected                                                                                  | Status | Tier     | Notes                                                                                                                                                                                                                                    |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.5.1 | Multi-pane mode: each PaneHeader shows | Symbol name, interval buttons (1m/5m/15m/1h/4h/1d), live price, ±% change badge, 5 px dot | ⬜     | T3 (P2)  | Live price + change badge require WS feed. Structure asserted at T2: `MultiChartLayout.test` "should show symbol, interval, live price with its change, and the connection dot in multi-pane mode (10.5.1 structure)" (store-fed price). |
| 10.5.2 | Connection dot state                   | Green pulse when connected; grey/off when disconnected                                    | ⬜     | T3 (P2)  | WS connected/disconnected state requires real network.                                                                                                                                                                                   |
| 10.5.3 | Single-pane mode (`1` layout)          | PaneHeader is **hidden** (not rendered)                                                   | ✅     | T2 · RTL | `MultiChartLayout.test` "should render no PaneHeader in the 1 layout (10.5.3)"                                                                                                                                                           |

### Section 5 — Symbol Pair Icons (visual regression)

> **Manual verification status (02.05.2026):** 5.1–5.7 manually verified — all ✅.
> **Automated (02.05.2026):** 5.1–5.5, 5.7 automated as T2 · RTL in `Section5SymbolPairIcons.test.tsx` (16 tests, all green). Tier upgraded from T3 · Playwright.

| #   | Scenario                                                              | Expected                                                                                                                                                                                | Status | Tier     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Open symbol picker dropdown in SymbolBar                              | Each row shows stacked base/quote coin pair — base icon (20 px) + USDT badge (13 px) bottom-right                                                                                       | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated in `Section5SymbolPairIcons.test.tsx`: 3 tests verify all SYMBOLS bases appear in dropdown, quote="USDT" on every row, at least 1 pair before dropdown opens. 340/340 green.                                                                                                                                                                                                                    |
| 5.2 | Active symbol trigger button (e.g. `BTC /USDT`)                       | Trigger shows stacked pair (18 px base) alongside symbol name, not a single icon                                                                                                        | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 2 tests verify base="BTC" for BTCUSDT pane and base="ETH" when pane symbol switches to ETHUSDT. 340/340 green.                                                                                                                                                                                                                                                                                 |
| 5.3 | Positions tab with an open position                                   | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — correct base="BTC", quote="USDT", and graceful empty state (no crash). 340/340 green.                                                                                                                                                                                                                                                                                                |
| 5.4 | Orders tab with a pending order                                       | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 2 tests — correct base="BTC" and quote="USDT" for a BTCUSDT pending order. 340/340 green.                                                                                                                                                                                                                                                                                                      |
| 5.5 | History tab (Order History) with a closed trade                       | Symbol cell shows stacked pair (16 px base) left of symbol text                                                                                                                         | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — base="BTC" for a filled order, quote="USDT", and also renders for cancelled orders. 340/340 green.                                                                                                                                                                                                                                                                                   |
| 5.6 | Unknown symbol (no icon in map) used as base or quote in `SymbolPair` | `CryptoIcon` falls back to a 2-letter text badge (first 2 chars, uppercased) — no crash. **Note:** USDT has a real icon in `CRYPTO_ICON_URLS` and renders as `<img>`, not a text badge. | ✅     | T2 · RTL | ✅ 02.05.2026 — covered by `CryptoIcon.test.tsx > unknown symbol` (3 existing tests: renders span not img, shows first 2 uppercase letters, applies size) + `SymbolPair — unknown symbol fallback (5.6)` describe block (7 new tests): both-unknown renders 'FO'+'NE' text badges, case-insensitive uppercase, known base + unknown quote (1 img + 1 badge), 1-letter symbol, USDT renders as `<img>` (has real icon). Tests: 340/340 green. |
| 5.7 | Multi-symbol: open positions in BTC and ETH simultaneously            | Each row shows the correct base icon (BTC vs ETH), not the active-pane symbol                                                                                                           | ✅     | T2 · RTL | ✅ 02.05.2026 — manually verified. Automated: 3 tests — both bases present with BTC+ETH positions, correct base for each row even when active pane is ETH, exactly 2 SymbolPair instances for 2 positions. 340/340 green.                                                                                                                                                                                                                    |

### Section 9 — Sell/Buy Prices & Spread in TradingPanel

| #   | Action                                                                          | Expected                                                                                                             | Status | Tier     | Notes                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | Open TradingPanel with a live symbol (e.g. BTCUSDT)                             | Spread badge between Sell/Buy buttons shows a numeric value (e.g. `0.10`)                                            | ⬜     | T3 (P2)  | Requires live two-sided quote feed from WebSocket. Spot bid/ask come from `orderbook.1` since BP-0 (F2) — before, spot `tickers` had no bid/ask and this badge always showed `—`.                                                                               |
| 9.2 | Hover spread badge                                                              | Tooltip shows raw bid and ask values (e.g. `Bid: 75,000.00 · Ask: 75,000.10`)                                        | ⬜     | T3 (P2)  |                                                                                                                                                                                                                                                                 |
| 9.3 | Sell button price                                                               | Matches the live **SELL** quote shown for the symbol, not a mid-price                                                | ⬜     | T3 (P2)  | Technical mapping: `SELL` corresponds to the best bid.                                                                                                                                                                                                          |
| 9.4 | Buy button price                                                                | Matches the live **BUY** quote shown for the symbol, not a mid-price                                                 | ⬜     | T3 (P2)  | Technical mapping: `BUY` corresponds to the best ask.                                                                                                                                                                                                           |
| 9.5 | Spread value decimal places                                                     | Spread and Sell / Buy at the instrument's price tick (BTCUSDT 0.1 → `0.1`, `50,000.0`; DOGEUSDT 0.00001 → `0.00001`) | ✅     | T2 · RTL | `TradingPanel.test` "Section 9 — spread (T2 · RTL)": "should show the spread and the quotes at the price tick, like Bybit" (changed 2026-09-28, NEW-9-2; was 4 decimals under 1, else 2)                                                                        |
| 9.6 | Disconnect WebSocket (network tab block) — wait for SELL/BUY quotes to go stale | Sell/Buy prices fall back to `latestPrice`; spread badge shows `—`                                                   | ⬜     | T3 (P2)  | `page.context().setOffline(true)` + await WS stale timeout.                                                                                                                                                                                                     |
| 9.7 | Switch active pane symbol (e.g. BTC → ETH in multi-pane mode)                   | Sell/Buy prices update to ETH SELL/BUY quotes immediately; spread re-renders for ETH                                 | ⬜     | T3 (P2)  |                                                                                                                                                                                                                                                                 |
| 9.8 | ~~Compare Sell/Buy vs TVP SELL/BUY at rest~~                                    | Retired with the TradingView checks — now 6.1 (vs Bybit's own bid / ask)                                             | ➖     | —        | See Section 6.                                                                                                                                                                                                                                                  |
| 9.9 | Low-priced coin (DOGEUSDT bid 0.12345 / ask 0.12346)                            | Sell `0.12345`, Buy `0.12346`, spread `0.00001` — not cut to 2 decimals (was `0.12` / `0.12` / `0.0000`, NEW-9-2)    | ✅     | T2 · RTL | `TradingPanel.test` "should show a low-priced coin at its own tick, not cut to 2 decimals (NEW-9-2)" and, on Spot before the rules load, "should show a low-priced Spot coin at its tick before the rules load"; format approved in the visual gate 2026-09-28. |

---

## Stage 1 — Spot basics

The first trade: buy and sell a coin on Spot at market, then with a limit price and with TP / SL.
After this stage the learner knows that Spot is 1× with no shorting, that the 0.1% fee is taken in the asset
received, and how to read coin balances in the Assets tab.

### Section 14 — Markets, Bybit fees and fill prices (Bybit Parity BP-2) _(part: 14.6 — the rest of Section 14 is in Stages 0, 3 and 6)_

> Two markets: **Spot** (coin balances, 1×, no shorting) and **USDT Perpetual** (positions, per-symbol leverage).
> Reference: `docs/APP_LOG.md` Bybit Parity BP-2. ✅ in the Tier column means automated; the Notes say where. "Live ✓"
> rows were run against the dev server + the live Bybit feed on 2026-09-26 (22 checks, throwaway users deleted).

#### 14.6 Spot

| #       | Action                                            | Expected                                                                                             | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14.6.1  | Spot market buy 0.1 BTC at ask 50,000             | −5,000 USDT; +0.0999 BTC (0.1% fee in BTC); avg cost 50,050.05; no position                          | ✅     | T1 + T3     | `spot.test`. Live ✓ (0.002 → 0.001998). `e2e/tests/spot/spotMarketBuy.spec` "[14.6.1][14.6.8] Your first Spot market order" (smoke, fake feed: USDT 5,000.00, BTC 0.0999, avg cost 50,050.05).                                                                                                                                    |
| 14.6.2  | Sell 0.0999 BTC at bid 51,000                     | Fee 5.0949 USDT; +5,089.8051 USDT; realized +89.8051; closed trade in History                        | ✅     | T1 · Vitest | `spot.test`.                                                                                                                                                                                                                                                                                                                      |
| 14.6.3  | Sell a coin you don't hold / more than free       | Refused (no shorting, F8): "Balance insufficient (… available)"                                      | ✅     | T1 + T2     | Live ✓.                                                                                                                                                                                                                                                                                                                           |
| 14.6.4  | Spot tabs                                         | Market and Limit only; no leverage chip; a sell has no TP / SL                                       | ✅     | T2 · RTL    | `TradingPanel.test`.                                                                                                                                                                                                                                                                                                              |
| 14.6.5  | Limit buy 0.1 @ 49,000 / limit sell 0.05 @ 52,000 | Buy reserves 4,900 USDT; sell locks 0.05 BTC, fills +2,597.40                                        | ✅     | T1 · Vitest | `spot.test`.                                                                                                                                                                                                                                                                                                                      |
| 14.6.6  | Buy with TP + SL                                  | Two conditional sells (one OCO pair) lock what the buy received; the first to fire cancels the other | ✅     | T1 · Vitest | `spot.test`. Live ✓ (legs placed).                                                                                                                                                                                                                                                                                                |
| 14.6.7  | Assets tab → TP/SL on a coin held                 | Locks the chosen quantity behind the pair                                                            | ✅     | T1 + T2     | T1: `spot.test` (the lock). T2: `SpotExitsModal.test` "SpotExitsModal — Assets → TP / SL (14.6.7)" — opens with the free quantity, sends the chosen qty + TP / SL as one request, shows the lock from the server's delta, refuses a qty above the free balance and a pair with no price, keeps the server's refusal in the modal. |
| 14.6.8  | Assets tab                                        | USDT row + each coin: balance / available / locked / avg cost / last / value / uPnL with +/−         | ✅     | T2 + T3     | `OrderAccountManagementPanel.test`. `e2e/tests/spot/spotMarketBuy.spec` "[14.6.1][14.6.8] Your first Spot market order" (smoke, fake feed: USDT 5,000.00, BTC 0.0999, avg cost 50,050.05).                                                                                                                                        |
| 14.6.9  | Assets → Sell                                     | Pane switches to that coin on Spot; the form is prefilled with the free quantity as a sell           | ✅     | T2 · RTL    |                                                                                                                                                                                                                                                                                                                                   |
| 14.6.10 | On Spot, the bottom tabs                          | Assets replaces Positions; Orders / Order History show Spot rows only                                | ✅     | T2 · RTL    |                                                                                                                                                                                                                                                                                                                                   |

---

## Stage 2 — Reading your account

Where every order, fill and close shows up: the Orders and Order History tabs, the History (closed
trades) tab, the journal and its PnL badges, the panel controls and the sounds. After this stage the learner can
follow an order from placement to close in the bottom panel.

> These rows were written on the leveraged (USDT Perpetual) form — see "What changed under Sections 1–11"; the
> bottom panel is the same on Spot. Rows that need a limit or stop order (4.2, 4.3, 7.2, 7.3, 7.6) use the order
> types taught in Stage 3 — when running the plan end to end, run them after Sections 2 and 3.

### Section 4 — Cross-cutting / Regression _(rows 4.1–4.16, 4.21–4.23: panels, persistence, journal, sounds, Orders bench; 4.17–4.18 are in Stage 3, 4.19–4.20 in Stage 5)_

| #    | Scenario                                                                                  | Expected                                                                                                                                                                                                                                                                                                                                                                                            | Status | Tier            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Switch pane symbol while TradingPanel open                                                | Header updates to new symbol; form resets (qty/price cleared); **tab stays on current selection** (Market/Limit/Stop preserved)                                                                                                                                                                                                                                                                     | ✅     | T2 · RTL        | Verified 01.05.2026 — symbol switch triggers `key` remount; form inputs cleared; tab preserved via `initialTab` + `onTabChange` lifted state in DashboardPage.                                                                                                                                                                                                                                                                      |
| 4.2  | Switch symbol while on **Limit** tab                                                      | Tab remains Limit; price input updates to new symbol's live price                                                                                                                                                                                                                                                                                                                                   | ✅     | T2 · RTL        | Verified 01.05.2026 — Limit tab preserved across remount; Buy defaults slightly below market and Sell defaults slightly above market on the new symbol, matching the live on-screen quotes as designed (`displayPrice` logic).                                                                                                                                                                                                      |
| 4.3  | Switch symbol while on **Stop** tab                                                       | Tab remains Stop; price input updates to new symbol's live price                                                                                                                                                                                                                                                                                                                                    | ✅     | T2 · RTL        | Verified 01.05.2026 — same as 4.2: Stop tab preserved; Stop Buy defaults above market and Stop Sell defaults below market on the new symbol — correct pending-side default as designed.                                                                                                                                                                                                                                             |
| 4.4  | Close TradingPanel (✕), reopen via **Trade** button in SymbolBar                          | Panel reopens on **last-used tab + side** (e.g. Limit+Sell stays Limit+Sell); **all form inputs (qty, price, TP/SL) preserved exactly as left**                                                                                                                                                                                                                                                     | ✅     | T2 · RTL        | Updated 01.05.2026 (form state) — `TradingPanel` is now always mounted; `DashboardPage` animates its wrapper width to 0 instead of unmounting; component never loses local React state on close. Tab + side lifted state unchanged. Symbol change (key reset) still clears form inputs as before. The SymbolBar toggle button reads **"Trade"** (no "CD" prefix).                                                                   |
| 4.5  | Collapse Order & Account Management panel (↓), then expand (↑)                            | All tabs still functional; panel has **no ✕ close button** — header controls: Sound · ⚙️ · Collapse/Expand · Maximize/Restore                                                                                                                                                                                                                                                                       | ✅     | T2 · RTL        | ✅ 01.05.2026 — collapse (↓) and expand (↑) work correctly; all tabs (Positions, Orders, History, Journal, Order History) remain fully functional after resize; no ✕ close button present in header as designed.                                                                                                                                                                                                                    |
| 4.6  | Place order, refresh browser                                                              | Position/pending order persists (localStorage)                                                                                                                                                                                                                                                                                                                                                      | ✅     | T1 · Vitest     | ✅ 01.05.2026 — positions and pending orders survive a hard browser refresh; Zustand `persist` middleware correctly hydrates state from `cd-paper` localStorage key. Balance, positions, orders, journal, and order history all restored as-left.                                                                                                                                                                                   |
| 4.7  | **Balance History** (and **Closed P&L** on USDT Perpetual) after a mix of wins and losses | PnL signs correct; green/red colors correct                                                                                                                                                                                                                                                                                                                                                         | ✅     | T1 · Vitest     | ✅ 01.05.2026 — History tab shows correct PnL signs and green/red color coding after a session with multiple profitable and losing closes. PnL formula `(exit − entry) × qty − commissions` verified correct.                                                                                                                                                                                                                       |
| 4.8  | Journal tab shows all system entries in order                                             | Timestamps descending (newest first); system entries cover full lifecycle: placement (`Placed LIMIT/STOP …`), fill (`Limit/Stop order filled …`), cancel (`Cancelled LIMIT/STOP …`), position open/close; auto-entries not editable, manual notes editable                                                                                                                                          | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Journal entries display **newest first** (descending timestamp order confirmed); full lifecycle covered: placement, fill, cancel, open/close entries all present and correctly ordered; auto-generated entries are read-only; manually added notes are editable.                                                                                                                                                    |
| 4.9  | Journal PnL badge — profitable close                                                      | Manual ✕ close: exec journal entry shows green `+$X.XX` pill inline after text; no badge on open/pending entries                                                                                                                                                                                                                                                                                    | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `attaches net PnL badge to the exec journal entry on a profitable close` passes (211/211). Manually verified in UI: Journal shows green `+$X.XX` pill on close entry; open/pending entries have no badge.                                                                                                                                                                                         |
| 4.10 | Journal PnL badge — losing close                                                          | Auto-closed TP/SL entry shows red `−$X.XX` pill; badge value matches Balance History net PnL for that trade                                                                                                                                                                                                                                                                                         | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `attaches negative net PnL badge to the exec journal entry on a losing close` passes (211/211). Note: a direction-profitable close still shows a red badge when net P&L is negative after commissions (fees > gross gain) — this is correct behaviour, not a bug.                                                                                                                                 |
| 4.11 | Journal PnL badge — user note                                                             | Manually added journal note has no PnL badge regardless of balance state                                                                                                                                                                                                                                                                                                                            | ✅     | T1 · Vitest     | ✅ 01.05.2026 — Vitest confirmed: `addJournalNote pnl is undefined when not provided` passes (211/211). Manually verified: manually added notes render with no PnL pill.                                                                                                                                                                                                                                                            |
| 4.12 | Maximize Order & Account Management panel (⤢)                                             | Chart area collapses (height → 0); panel fills full center column; Minimize2 icon shown; TradingPanel still visible                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: maximize (⤢) collapses chart area, panel fills full center column, Minimize2 icon appears, TradingPanel remains visible alongside.                                                                                                                                                                                                                                                               |
| 4.13 | Restore Order & Account Management panel (⤡)                                              | Chart area expands back; panel returns to previous height; Maximize2 icon shown                                                                                                                                                                                                                                                                                                                     | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: restore (⤡) expands chart area back to previous height, Maximize2 icon reappears in panel header.                                                                                                                                                                                                                                                                                                |
| 4.14 | Sound — order placed                                                                      | Crisp double-tick plays when a market/limit/stop order is submitted                                                                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: double-tick sound plays correctly on market, limit, and stop order submission.                                                                                                                                                                                                                                                                                                                   |
| 4.15 | Sound — TP/SL auto-close                                                                  | Ascending jingle (profit) or descending beep (loss) plays when position auto-closes                                                                                                                                                                                                                                                                                                                 | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: correct profit/loss sound plays on TP/SL-triggered auto-close.                                                                                                                                                                                                                                                                                                                                   |
| 4.16 | Sound — mute toggle                                                                       | Clicking mute in SoundSettings silences all subsequent sounds; unmuting restores them                                                                                                                                                                                                                                                                                                               | ✅     | T3 · Playwright | ✅ 01.05.2026 — manually verified: mute toggle in SoundSettings popover (portal-rendered, visible above panel) silences all sounds; unmuting restores them. Popover fixed to render via React portal so it is no longer clipped by the panel's overflow:hidden container.                                                                                                                                                           |
| 4.21 | TV-style Orders bench TTL — terminal rows auto-evict after 2 minutes                      | Filled / Cancelled / Rejected rows appear in **Orders** tab immediately after the event (rendered at 65% opacity + amber Clock icon). After 2 minutes from `closingTime` they disappear from Orders while remaining permanently in Order History. **All / Filled / Cancelled sub-tab counts drop live as rows expire.** Top Orders badge (working + inactive only) is never inflated by bench rows. | ✅     | T2 · RTL        | ✅ 02.05.2026 — TV-style bench lifecycle implemented in `OrderAccountManagementPanel.tsx`. Module-level `SESSION_START = Date.now()` evaluated once per page load; `BENCH_TTL_MS = 120_000` (2 min, hardcoded). Predicate: `closingTime >= SESSION_START && closingTime + BENCH_TTL_MS > now`. `now` clock state ticks every 30 s via `setInterval`. Automated in `OrderAccountManagementPanel.test.tsx` — 28 tests, 340/340 green. |
| 4.22 | Orders bench — page refresh clears terminal rows immediately                              | After a hard browser refresh, previously Filled / Cancelled / Rejected rows that were on the Orders bench are **gone immediately** — the 2-min window does not carry over. Only Working / Inactive pending rows (persisted in localStorage) survive the refresh.                                                                                                                                    | ✅     | T1+T2           | ✅ 02.05.2026 — `SESSION_START` is a module-level `const` evaluated fresh on every page load. Any `closingTime < SESSION_START` fails the bench predicate instantly — free page-refresh reset with zero store changes. Validated by test fixtures: using hardcoded May-2024 `closingTime` caused 3 tests to fail (orders evicted immediately), confirming the mechanism; fixed by switching to `FIXTURE_NOW = Date.now()`.          |
| 4.23 | Add a journal note containing HTML, e.g. `<img src=x onerror=alert(1)>`                   | The note shows as that literal text; no element is created from it and nothing runs (stored-XSS rule, `web.md`)                                                                                                                                                                                                                                                                                     | ✅     | T2 · RTL        | NEW-4-1. `OrderAccountManagementPanel.test` "Section 4 — journal notes render as plain text": "[4.23] should show a stored note with HTML in it as literal text …", "[4.23] should send a typed note verbatim and show the saved note as literal text …". The T3 half (no browser dialog, `page.on('dialog')`) comes with the Playwright set.                                                                                       |

### Section 7 — Order History Tab _(run after Sections 2 & 3 pass)_

> Covers the **Order History** tab (5th tab in the **Order & Account Management** panel). Shows all `HistoricalOrder[]` records — market + limit + stop, all statuses. **Market orders appear here** (not in the Orders tab).

#### 7.1 Market order appears in Order History

| #     | Action                                        | Expected                                                                                                                                                                                                                                                                              | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1.1 | Reset account. Place a market Buy $100        | Go to **Order History** tab — 1 row: Type = MARKET / Side = BUY / Status = Filled (green)                                                                                                                                                                                             | ✅     | T1 · Vitest | `actions.test` "Section 7 — Order History records" "[7.1.1] should record a MARKET / BUY / Filled row …"                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7.1.2 | Check **All** and **Filled** sub-tabs         | Row visible in both; count badge on tab shows 1                                                                                                                                                                                                                                       | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.1.2][7.1.3] should count one market fill in All and Filled …"                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7.1.3 | Check **Cancelled** and **Rejected** sub-tabs | Empty (no rows)                                                                                                                                                                                                                                                                       | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.1.2][7.1.3] … leave Cancelled and Rejected empty"                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7.1.4 | Check **Orders** tab (all sub-tabs)           | Market order **appears in Orders → Filled** sub-tab while within the 2-min bench TTL; after 2 min the row evicts from Orders and only remains in Order History. Orders top-level badge = 0 (no active rows). Orders → All shows 1 row (while in TTL); → Working / Inactive are empty. | ✅     | T2 · RTL    | Updated 02.05.2026: bench TTL governs visibility of terminal rows in Orders tab (see 4.21). Verify `All 1` / `Filled 1` counts in Orders immediately post-fill and `Orders` badge = 0 (active-only). After 2 min: `All 0` / `Filled 0` in Orders; Order History unaffected. `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.1.4] should show a market fill on the Orders bench without an Orders badge …", "[7.1.4] should drop the row from Orders but keep it in Order History when the 2-minute bench time has passed" (fake timers) |

#### 7.2 Limit order fill appears in Order History

| #     | Action                                              | Expected                                                                                                                                                                                     | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.2.1 | Place limit buy at live − 2%; wait for fill         | Order History → Filled sub-tab: 1 row LIMIT / BUY / Fill Price ≈ trigger price                                                                                                               | ✅     | T1 · Vitest | `actions.test` "Section 7 — Order History records" "[7.2.1][7.2.2] should record a LIMIT fill at its own price with the 0.02% maker fee …"                                                                                                                                                                                                                    |
| 7.2.2 | Verify columns: Limit Price, Fill Price, Commission | Limit Price = your trigger; **Fill Price = trigger** (a resting limit fills at its own price, BP-2 F4); Commission = qty × price × 0.0002 with "0.02% maker" under it                        | ✅     | T1 + T2     | `actions.test` "Section 7 — Order History records" "[7.2.1][7.2.2] …" (0.1 @ 49,000 at 10× → commission 0.98, fee rate 0.0002); the columns: `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.2.3] …" (Fill Price `$49,000`, Commission `0.9800 USDT` / `0.02% maker`)                                                                  |
| 7.2.3 | Orders tab — Filled sub-tab                         | Filled limit row is **also** visible in **Orders → Filled** sub-tab (TV-style), not only in Order History. Orders top-level badge remains at 0 after the limit entry fill (no active order). | ✅     | T2 · RTL    | Updated 01.05.2026: Orders tab now has a Filled sub-tab (restored). Verify the filled limit row appears in both Orders → Filled and Order History → Filled; Orders badge = 0. `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.2.3] should show a filled limit in both Orders → Filled and Order History → Filled with no Orders badge" |

#### 7.3 Cancelled order appears in Order History

| #     | Action                                                      | Expected                                                             | Status | Tier        | Notes                                                                                                                                                     |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.3.1 | Place limit buy far below market; cancel via Orders tab (✕) | Order History → Cancelled sub-tab: 1 row, Status = Cancelled (muted) | ✅     | T1 · Vitest | `actions.test` "Section 7 — Order History records" "[7.3.1] should record a Cancelled row with no commission …"                                           |
| 7.3.2 | Check All sub-tab count                                     | Count includes this cancelled record                                 | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.3.2] should raise All to 2 and Cancelled to 1 when a cancelled order joins a fill" |

#### 7.4 Rejected orders (if any) appear in Order History, not History tab

| #     | Action                                                | Expected                                                                            | Status | Tier     | Notes                                                                                                                                                                                                                                            |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.4.1 | Simulate rejection (e.g. submit order with 0 balance) | If order reaches rejected state: Order History → Rejected sub-tab shows red ⚠ badge | ✅     | T1 + T2  | `actions.test` "Section 7 — Order History records" "[7.4.1] should record a Rejected row with its reason when a triggered order cannot fill"; the red ⚠ in `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.4.1][7.4.2] …" |
| 7.4.2 | Check **Balance History** and **Closed P&L**          | Rejected orders do **not** appear there                                             | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.4.1][7.4.2] should list a rejection under Rejected with a ⚠ but keep it out of Balance History and Closed P&L"                                                            |

#### 7.5 Placing Time and Closing Time columns

| #     | Action                                           | Expected                                                                    | Status | Tier     | Notes                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.5.1 | Open column picker (⊟ icon) in Order History tab | Placing Time and Closing Time are on by default; other columns toggleable   | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.5.1] should show Placing Time and Closing Time by default and let other columns be turned on"                                                                         |
| 7.5.2 | Disable Closing Time; re-enable it               | Column disappears then reappears; preference persists after browser refresh | ✅     | T2 · RTL | jsdom localStorage can simulate the persist/hydrate cycle — no real refresh needed. `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.5.2] should hide Closing Time, keep it hidden after a reload and bring it back …" |

#### 7.6 Mix of all order types

| #     | Action                                                                  | Expected                                                                            | Status | Tier     | Notes                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.6.1 | Place market buy, limit buy (fill), stop sell (cancel) in sequence      | Order History All sub-tab shows 3 rows: MARKET/Filled, LIMIT/Filled, STOP/Cancelled | ✅     | T1 + T2  | `actions.test` "Section 7 — Order History records" "[7.6.1] should list MARKET / Filled, LIMIT / Filled and STOP / Cancelled (newest first) …"; rendered in `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.6.1][7.6.2] …" |
| 7.6.2 | Each status badge uses correct color: Filled = green, Cancelled = muted | Visual check                                                                        | ✅     | T2 · RTL | `OrderAccountManagementPanel.test` "Section 7 — Order History tab" "[7.6.1][7.6.2] should colour Filled green and Cancelled muted …" (computed colour = `tokens.ts` `color.green` / `color.muted`)                                                |

---

## Stage 3 — USDT Perpetual basics

Long and short with leverage: market, limit and stop orders with TP / SL, editing them, then what a
perpetual trade costs and fills at. After this stage the learner can open, manage and close a one-way position,
set leverage per symbol, and predict the maker / taker fee and the fill price of an order.

### Section 1 — Market Orders

> **Automation status (02.05.2026):** T1 & T2 fully automated — ~340 tests green (38 T2 RTL + ~20 T1 Vitest + 21 SLTP sanity + remaining). T3 Playwright pending. **New (02.05.2026):** SL typo safety rail tests added (1.7.11).

#### 1.1 Basic Buy (USD mode)

| #     | Action                                                            | Expected                                                                                                                                                | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 | Select **Buy**, tab = **Market**, qty mode = **USD**, enter `100` | Order info shows Margin ≈ lot-rounded fill, Trade value ≈ Margin, Commission ≈ $0.068                                                                   | ✅     |      | T2 · RTL    | Margin $98.31, Commission $0.0688                                                                                                                                                                                                                             |
| 1.1.2 | Click **Buy** button                                              | Button pulses; qty input clears                                                                                                                         | ✅     |      | T2 + T3     | `e2e/tests/perp/perpMarketLong.spec` "[1.1.2][1.1.3][1.1.4] Your first long" (smoke: isolated 10×, long 0.1 at 50,000, liq $45,149, closed at 51,000 → Closed P&L 94.44).                                                                                     |
| 1.1.3 | Go to **Positions** tab                                           | 1 LONG row appears: Entry ≈ live price, Qty > 0, TP = —, SL = —                                                                                         | ✅     | ✅   | T1 + T3     | Entry $75,625.20, Qty 0.001300, TP=—, SL=—. TV: $75,625.20, 1 s apart — within $1 ✓ `e2e/tests/perp/perpMarketLong.spec` "[1.1.2][1.1.3][1.1.4] Your first long" (smoke: isolated 10×, long 0.1 at 50,000, liq $45,149, closed at 51,000 → Closed P&L 94.44). |
| 1.1.4 | Check balance                                                     | Balance = $10,000 − actualFillAmount − commission (lot-rounded, not exactly $100)                                                                       | ✅     | ✅   | T1 + T3     | $10,000 − $98.31 − $0.0688 = $9,901.62 ✓. TV Available $9,901.65 — diff $0.03 ✓ `e2e/tests/perp/perpMarketLong.spec` "[1.1.2][1.1.3][1.1.4] Your first long" (smoke: isolated 10×, long 0.1 at 50,000, liq $45,149, closed at 51,000 → Closed P&L 94.44).     |
| 1.1.5 | Go to **Journal** tab                                             | Auto entry: `Opened LONG BTCUSDT @ $X.XX`                                                                                                               | ✅     |      | T1 · Vitest | ✅ Entry correct. Auto-logs all events (TV journal is manual-only).                                                                                                                                                                                           |
| 1.1.6 | Go to **Order History** tab → **Filled** sub-tab                  | 1 row: Type = MARKET, Side = BUY, Fill Price ≈ entry, Status = Filled. Also visible in **Orders → Filled** while in bench TTL. Top badge = active-only. | ✅     |      | T1 · Vitest | Orders badge excludes historical rows. Bench TTL: 2 min (see 4.21).                                                                                                                                                                                           |
| 1.1.7 | Check **Orders** tab → **All** sub-tab                            | Same row visible (within TTL); count badge = 1                                                                                                          | ✅     |      | T2 · RTL    | Badge drops to 0 after 2 min (only active rows).                                                                                                                                                                                                              |
| 1.1.8 | Check **Orders** tab → **Working** sub-tab                        | Empty — market orders instantly filled, never Working                                                                                                   | ✅     |      | T1 · Vitest | Working only counts pending; market orders are historical.                                                                                                                                                                                                    |

#### 1.2 Basic Sell (USD mode)

| #     | Action                                                                  | Expected                                                            | Status | TV ✓ | Tier        | Notes |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ---- | ----------- | ----- |
| 1.2.1 | Reset account. Select **Sell**, tab = **Market**, USD mode, enter `200` | Order info updates for Sell side                                    | ✅     |      | T2 · RTL    |       |
| 1.2.2 | Click **Sell** button                                                   | Position opens                                                      | ✅     |      | T1 · Vitest |       |
| 1.2.3 | Positions tab                                                           | 1 SHORT row. PnL updates live (green if price dropped, red if rose) | ✅     | ➖   | T1 · Vitest |       |

#### 1.3 Units mode

| #     | Action                                             | Expected                                                | Status | Tier        | Notes                    |
| ----- | -------------------------------------------------- | ------------------------------------------------------- | ------ | ----------- | ------------------------ |
| 1.3.1 | Click **BTC** in the Amount **BTC \| USDT** toggle | BTC is selected; placeholder `0.000000`                 | ✅     | T2 · RTL    |                          |
| 1.3.2 | Enter `0.001` units                                | Equivalent below shows ≈ live_price × 0.001 USD         | ✅     | T2 · RTL    |                          |
| 1.3.3 | Click **USDT** in the toggle                       | Input converts to USD value; equivalent shows 0.001 BTC | ✅     | T2 · RTL    |                          |
| 1.3.4 | Place order in Units mode with `0.001`             | Position qty ≈ 0.001                                    | ✅     | T1 · Vitest | Trailing zeros stripped. |

#### 1.4 Buy with Take-Profit only

| #     | Action                                                                               | Expected                                                                            | Status | TV ✓ | Tier        | Notes                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.1 | Reset. Buy $500, enable TP toggle, enter a price **above** live price (e.g. live+5%) | TP input has green border                                                           | ✅     |      | T2 · RTL    |                                                                                                                                       |
| 1.4.2 | Submit                                                                               | Position appears with TP = your price, SL = —                                       | ✅     |      | T1 · Vitest |                                                                                                                                       |
| 1.4.3 | _(wait or set TP very close)_ When live price crosses TP                             | Position closes; appears in History with profit; Orders → Filled shows entry + exit | ✅     | ✅   | T1 · Vitest | ✅ TP triggered correctly. The exit shows Type **Take Profit** (fixed since BP-1; `actions.test` "1.4.3: the TP close is recorded…"). |
| 1.4.4 | Journal tab                                                                          | Entry + Auto-close entries with green PnL badge `+$X.XX`                            | ✅     | ✅   | T1 · Vitest | Clean 2-line audit trail. PnL sign matches. TV shows verbose system log (intentional divergence).                                     |

> **Fixed:** the exit order's Type in Order History reads **Take Profit** / **Stop Loss** (the server records the leg since BP-1); `actions.test` pins it.

#### 1.5 Sell with Stop-Loss only

| #     | Action                                                                                          | Expected                                                                            | Status | TV ✓ | Tier        | Notes                                                                    |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------ |
| 1.5.1 | Reset. Sell $500, enable SL toggle, enter a price **above** live price (SHORT SL = above entry) | SL input red border                                                                 | ✅     |      | T2 · RTL    | SL input correctly red. SHORT position ~$75,545.9.                       |
| 1.5.2 | Submit                                                                                          | SHORT position with SL = price; **Orders → Working shows 1 synthetic SL BUY order** | ✅     |      | T1 · Vitest | Synthetic exit order renders correctly. Matches TV parity.               |
| 1.5.3 | When price rises to SL                                                                          | Auto-closed; Journal red PnL badge `−$X.XX`; Working order disappears               | ✅     | ✅   | T1 · Vitest | Position closed. SL order evicts from Working. Journal shows loss badge. |

> **TV parity note (1.5.2):** TV shows TP/SL as separate child "Working" orders in the Orders tab (Type = "Take Profit" or "Stop Loss"). cryptopapertrade.com now does the same — synthetic exit orders are derived from open positions and shown in Working sub-tab with correct Type label, Side (opposite of position), and price in Limit/Stop Price column. They disappear automatically when the position closes.

#### 1.6 Buy with both TP and SL

| #     | Action                                      | Expected                                                                               | Status | TV ✓ | Tier        | Notes                                                                                   |
| ----- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------ | ---- | ----------- | --------------------------------------------------------------------------------------- |
| 1.6.1 | Reset. Buy $300, TP = live+3%, SL = live−2% | Both inputs active                                                                     | ✅     |      | T2 · RTL    | Both TP and SL active with correct borders.                                             |
| 1.6.2 | Submit                                      | Position shows both TP and SL                                                          | ✅     |      | T1 · Vitest | LONG opened @ $75,429.10. Order History shows 1 BUY Filled.                             |
| 1.6.3 | Manual close via **✕** in Positions tab     | Position removed; History row appears; PnL correct; Journal shows close with PnL badge | ✅     | ✅   | T1 · Vitest | Manual ✕ close executed. TP auto-cancelled. Journal: `Closed LONG ... @ $X` with badge. |

#### 1.7 Edge cases

| #      | Scenario                                                         | Expected                                                                                                              | Status | Tier            | Notes                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.7.1  | Submit with **empty** qty                                        | Submit button disabled                                                                                                | ✅     | T2 · RTL        | No inline error text; button disabled.                                                                                                                                  |
| 1.7.2  | Submit with qty **> balance** (e.g. $99,999)                     | Error: "Insufficient balance"                                                                                         | ✅     | T1+T2           | T1: `placeOrder` returns `null`. T2: error message renders in component.                                                                                                |
| 1.7.3  | TP below entry for a Buy (e.g. live−1%)                          | Error: "Take-Profit must be above entry price for Long"                                                               | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.4  | SL above entry for a Buy (e.g. live+1%)                          | Error: "Stop-Loss must be below entry price for Long"                                                                 | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.5  | TP above entry for a Sell                                        | Error: "Take-Profit must be below entry price for Short"                                                              | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.6  | SL below entry for a Sell                                        | Error: "Stop-Loss must be above entry price for Short"                                                                | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.7  | Enter qty `0` or negative                                        | Submit button disabled (opacity 30%)                                                                                  | ✅     | T2 · RTL        |                                                                                                                                                                         |
| 1.7.8  | Disconnect from internet, submit market order                    | Error: "Waiting for live price…"                                                                                      | ✅     | T3 · Playwright | Requires `page.context().setOffline(true)`. Fixed: added `navigator.onLine` check alongside `isConnected` in both `validate()` and the submit button's `disabled` prop. |
| 1.7.9  | Place multiple positions, close them in reverse order            | Each closes at correct mark price; History accumulates                                                                | ✅     | T1 · Vitest     | Fixed: `placeOrder` nets against existing opposite-side positions before opening new ones.                                                                              |
| 1.7.10 | Reset account mid-open position                                  | Positions cleared, balance = $10,000                                                                                  | ✅     | T1 · Vitest     |                                                                                                                                                                         |
| 1.7.11 | Enter SL = 7800 for a BTC order (live ≈ $78,000)                 | Blocking confirm modal: typo warning; order not placed until explicit confirm                                         | ✅     | T2 · RTL        | SL deviating >80% from live price flagged.                                                                                                                              |
| 1.7.12 | Enter SL > 10% below entry (e.g. 11% for BTC)                    | Blocking confirm modal; large-distance warning; user must confirm                                                     | ✅     | T2 · RTL        | SL_MAX_DISTANCE = 0.1 threshold.                                                                                                                                        |
| 1.7.13 | Close by hand while the TP fires (two machines, the same moment) | Closed once: one Closed P&L row, realised P&L and balance counted once; the loser gets 404 (close) or no trigger (TP) | ✅     | T2i             | `paperRoutes.int.test` "[1.7.13] closes the position once: one Closed P&L row, the balance counted once" (was NEW-1-2).                                                 |

### Section 2 — Limit Orders _(run after Section 1 passes)_

> **Automation status (01.05.2026):** T1 & T2 fully automated — ~45 tests green. T3 Playwright pending.

#### 2.1 Limit Buy below market

| #     | Action                                                          | Expected                                                                                          | Status | TV ✓ | Tier        | Notes                                          |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ---------------------------------------------- |
| 2.1.1 | Tab = **Limit**. Price input appears pre-filled with live price | Price field pre-filled slightly below the current live quote for a Buy; no immediate-fill warning | ✅     |      | T2 · RTL    | After fix: no warning on tab switch.           |
| 2.1.2 | Set price to live − 2%, qty $200, click **Buy**                 | Pending order; balance decreases by $200 + commission                                             | ✅     | ✅   | T1 · Vitest | LIMIT BUY 0.025 @ $78,800, reserved $197.00.   |
| 2.1.3 | Go to **Orders** tab → **Working** sub-tab                      | 1 row: LIMIT / BUY / Limit Price = price; Status = Working                                        | ✅     |      | T2 · RTL    | Type, Side, Qty, Status all correct.           |
| 2.1.4 | Check **All** sub-tab count badge                               | Badge shows **1**; row visible                                                                    | ✅     |      | T2 · RTL    | Sub-tab badges: All 1 / Working 1.             |
| 2.1.5 | When price drops to trigger                                     | Order moves to **Filled**; Journal entry added                                                    | ✅     | ✅   | T1 · Vitest | Filled @ $77,673.8. TV: ~$77,677.4. Within $5. |
| 2.1.6 | Check **All** sub-tab after fill                                | Badge count unchanged (1); row status = Filled                                                    | ✅     |      | T2 · RTL    | All still shows 1; status pill: amber → green. |

#### 2.2 Limit Buy cancel

| #     | Action                                        | Expected                                                                                                  | Status | Tier        | Notes                                                 |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------- |
| 2.2.1 | Place limit buy far below market (live − 10%) | Order in **Working**; badge shows 1; **Journal shows `"Placed LIMIT Long …`**                             | ✅     | T1+T2       | T1: pendingOrders + journal. T2: badge + Working row. |
| 2.2.2 | Click **✕** cancel in Working sub-tab         | Order moves to **Cancelled**; balance fully refunded; badge disappears; **Journal shows cancel + refund** | ✅     | T1 · Vitest | Refund, order array, journal entry all verified.      |

#### 2.3 Limit Sell above market

| #     | Action                                    | Expected              | Status | TV ✓ | Tier        | Notes                                          |
| ----- | ----------------------------------------- | --------------------- | ------ | ---- | ----------- | ---------------------------------------------- |
| 2.3.1 | Tab = Limit, price = live + 2%, Sell $200 | Pending SHORT created | ✅     | ✅   | T1 · Vitest | LIMIT / SELL, Qty 0.0025, Limit Price $77,750. |
| 2.3.2 | When price rises to trigger               | SHORT position opens  | ✅     | ✅   | T1 · Vitest | Filled @ ~$77,754.5.                           |

#### 2.4 Limit with TP + SL — Pre-fill

| #     | Action                                                                                      | Expected                                                                                                                              | Status | TV ✓ | Tier        | Notes                                                                              |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ---------------------------------------------------------------------------------- |
| 2.4.1 | Limit buy $300 at live−1%, TP = live+3%, SL = live−4%                                       | 3-row bracket: parent LIMIT BUY (Working) + TP (Inactive) + SL (Inactive). Journal: `"Placed LIMIT …"`                                | ✅     |      | T1 · Vitest | Working = 1 / Inactive = 2. Journal on placement (intentional divergence from TV). |
| 2.4.2 | Cancel the **SL** inactive child leg (✕ on SL row) while limit is still pending             | SL row gone. **Order History → Cancelled** gains 1 row (Stop Loss). **Journal**: cancel entry. Balance unchanged.                     | ✅     | ✅   | T1 · Vitest | `cancelPendingExitLeg`. When limit fills, position opens with TP only.             |
| 2.4.3 | Cancel the **TP** inactive child leg (✕ on TP row) while limit is still pending             | TP row gone. **Order History → Cancelled** gains 1 row (Take Profit). **Journal**: cancel entry. Balance unchanged.                   | ✅     |      | T1 · Vitest | `cancelPendingExitLeg`. When limit fills, position opens with SL only.             |
| 2.4.4 | Cancel the **parent** limit order (✕ on Working parent row) while both TP + SL are inactive | All 3 rows move to Cancelled. **Order History → Cancelled** gains 3 rows. **Journal**: cancel + refund entry. Balance fully refunded. | ✅     | ✅   | T1 · Vitest | `cancelPendingOrder`. Builds child cancel records. Only parent margin refunded.    |

> **Pre-fill note:** Balance reserved at parent placement only. Child leg cancel has no balance effect. Parent cancel refunds full reserved amount.

#### 2.4 Limit with TP + SL — Post-fill

| #      | Action                                                            | Expected                                                                                                                                    | Status | TV ✓ | Tier        | Notes                                                                                                              |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 2.4.5  | Wait for limit to trigger (price reaches limit price)             | Parent → Filled. TP + SL children: Inactive → Working. Position in Positions with TP/SL shown. 3 Journal entries (fill + TP/SL activation). | ✅     | ➖   | T1 · Vitest | All entries emitted in correct order. Fill price = latestPrice.                                                    |
| 2.4.6  | Cancel the **Working TP** exit leg (✕ on TP row) after fill       | TP gone from Working. **Order History → Cancelled** gains 1 row (Take Profit). **Journal**: cancel entry. Position stays with SL only.      | ✅     |      | T1 · Vitest | TP moved to Cancelled. SL remains Working.                                                                         |
| 2.4.7  | Cancel the **Working SL** exit leg (✕ on SL row) after fill       | SL gone from Working. **Order History → Cancelled** gains 1 row (Stop Loss). **Journal**: cancel entry. Position stays with TP only.        | ✅     |      | T1 · Vitest | SL moved to Cancelled. TP remains Working.                                                                         |
| 2.4.8  | After limit fills, check Orders tab immediately                   | Filled parent row in **Orders → Filled** and **Order History → Filled**; active TP/SL in Working                                            | ✅     | ✅   | T1 · Vitest | Parent visible in Orders → Filled. Top badge counts active only.                                                   |
| 2.4.9  | **TP triggers** and closes the LONG (both TP + SL were active)    | Position closed. Order History → Cancelled gains SL row (no commission). Journal: auto-close with PnL badge.                                | ✅     | ✅   | T1 · Vitest | Order History shows BUY + TP (Filled) + SL (Cancelled). Placing Time = pos.openedAt (cosmetic divergence from TV). |
| 2.4.10 | **SL triggers** and closes the LONG (both TP + SL were active)    | Position closed. Order History → Cancelled gains TP row (no commission). Journal: auto-close with PnL badge.                                | ✅     |      | T1 · Vitest | SL triggered. TP sibling-cancelled. Journal red PnL badge.                                                         |
| 2.4.11 | **Manually close** (✕ position row) while both TP + SL are active | Position closed. Order History → Cancelled gains 2 TP + SL rows (no commission).                                                            | ✅     | ✅   | T1 · Vitest | Both exits cancelled. Manual close lifecycle verified.                                                             |

> **Bracket lifecycle note:** Entry, TP, and SL are three linked orders. Pre-fill: parent cancel kills the whole bracket. Post-fill: manage the trade from Positions; manage exits from the Working order rows.
> **Auto-archive note (2.4.8):** Filled parent orders are visible in **Orders → Filled** for up to 2 minutes after fill (`closingTime + BENCH_TTL_MS > now`), and permanently in **Order History → Filled**. After 2 min the row auto-evicts from the Orders bench — no manual action required. The top Orders badge reflects only active rows (pending + active exits), so parent fills never inflate the headline count.
> **Sibling-cancel note (2.4.9–2.4.11):** `closePosition` builds `siblingCancelOrders` — `placingTime = pos.openedAt`, `closingTime = close timestamp`. Known minor divergence vs TV: TV records Placing Time as original bracket placement (before limit fill); cryptopapertrade.com uses position `openedAt` (limit-fill time). Difference = limit order pending duration; cosmetic only.

#### 2.5 Edge cases

| #     | Scenario                                        | Expected                                                       | Status | Tier        | Notes                                                                                                                                                                      |
| ----- | ----------------------------------------------- | -------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5.1 | Limit Buy with TP **below** trigger price       | Validation error before placement                              | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: TP below trigger is blocked pre-submit with `Take-Profit must be above entry price for Long`.                                    |
| 2.5.2 | Limit Buy with SL **above** trigger price       | Validation error before placement                              | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: SL above trigger is blocked pre-submit with `Stop-Loss must be below entry price for Long`.                                      |
| 2.5.3 | Place limit, then switch symbol                 | Order stays in Orders tab (scoped to its own symbol)           | ✅     | T1 · Vitest | ✅ 01.05.2026 — user verified and screenshot-backed: symbol switch + additional order on another symbol worked; existing order/positions remained correctly symbol-scoped. |
| 2.5.4 | Place limit order that exceeds balance          | Error: `Insufficient balance`                                  | ✅     | T2 · RTL    | ✅ 01.05.2026 — confirmed via screenshot: oversized ETH limit order (`$20,000`) shows `Insufficient balance` and red margin-over-balance state before submission.          |
| 2.5.5 | Edit a pending limit to a price across the book | Fills now at the book price as a taker (no resting order left) | ✅     | T1 · Vitest | `fees.test` "a limit edited across the book fills now"; Spot: `spot.test` "a spot sell edited across the book sells now at the bid".                                       |

### Section 3 — Stop Orders _(run after Section 2 passes)_

> **Manual verification status (01.05.2026):** 3.1.1–3.5.3 manually verified against TVP Paper Trading (Bybit BTCUSDT Spot · 1m) — all ✅.
>
> **Automation status (01.05.2026):** T1 + T2 tests written and passing (211/211 total suite). New tests live in:
>
> - `apps/server/src/trading/engine/__tests__/actions.test.ts` — `Section 3 — Stop Orders` describe block (was `paperStore.test.ts` before BP-1) (15 T1 tests): placement, fill flow with slippage, cancel, bracket TP/SL, multiple concurrent orders, insufficient-balance guard.
> - `TradingPanel.test.tsx` — `Section 3 — Stop Orders (T2 · RTL)` describe block (5 T2 tests): the immediate-fill warnings (3.5.1 Stop Buy, 3.5.4 Stop Sell), no-warning negatives, insufficient balance on stop tab.

#### 3.1 Stop Buy above market (breakout)

| #     | Action                                      | Expected                                                                                                | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                    |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1.1 | Tab = **Stop**, price = live + 1%, Buy $200 | Pending order in Orders tab: STOP / BUY; amber tab badge shows 1                                        | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — STOP BUY BTCUSDT 0.0025 @ $77,350 (CD) / $77,400 (TV); Working sub-tab badge = 1, CD reserved $193.38, TV orders margin $193.48 ✅                                                                 |
| 3.1.2 | Check **Working** sub-tab                   | 1 row visible with STOP type pill                                                                       | ✅     | ✅   | T2 · RTL    | Verified 01.05.2026 — Working sub-tab shows 1 row with STOP type pill in both CD and TV ✅                                                                                                                               |
| 3.1.3 | When price rises to trigger                 | Order moves to **Filled** sub-tab; amber badge disappears; position opens; journal: `Stop order filled` | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — LONG 0.0025 opened @ avg fill $77,358.6; Order History shows Filled (type = Market, correct — stop converts to market on trigger), commission $0.1354; unrealized PnL −$0.02; Journal 2 entries ✅ |

#### 3.2 Stop Sell below market (breakdown)

| #     | Action                                   | Expected                                        | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------- | ----------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.2.1 | Tab = Stop, price = live − 1%, Sell $200 | Pending order: STOP / SELL; amber badge shows 1 | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — STOP SELL BTCUSDT 0.0025 @ $77,250; Working sub-tab badge = 1, balance $9,806.74, reserved $193.13. TV: same order Working, orders margin $193.10 ✅                                                                       |
| 3.2.2 | When price drops to trigger              | SHORT position opens; order in Filled sub-tab   | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 — SHORT 0.0025 opened @ avg fill $77,348 (CD) vs $77,385.5 (TV); ~$37 gap is within stop-market slippage tolerance (different trigger moments). Unrealized PnL +$0.01 in CD, +$0.03 in TV. Order History = 1, Journal = 2 ✅ |

#### 3.3 Stop cancel

| #     | Action                           | Expected            | Status | Tier        | Notes                                                                                                                                                                                                                   |
| ----- | -------------------------------- | ------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3.1 | Place stop order far from market | Order in Orders tab | ✅     | T1 · Vitest | Verified 01.05.2026 — STOP SELL BTCUSDT 0.0025 @ $77,300 (far above market); Working sub-tab shows 1 row, amber badge = 1, balance drops to $9,806.61 (reserved $193.25)                                                |
| 3.3.2 | Cancel it                        | Balance refunded    | ✅     | T1 · Vitest | Verified 01.05.2026 — order moves to Cancelled sub-tab; badge clears; journal: `Cancelled STOP Short BTCUSDT @ $77300.00 (refunded: $193.39)`; balance restored to $10,000.00. TV order history also shows Cancelled ✅ |

#### 3.4 Stop with TP + SL

| #     | Action                                          | Expected                                                                                                                                                                                              | Status | TV ✓ | Tier        | Notes                                                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.4.1 | Stop Buy at live+1%, TP = live+4%, SL = live−1% | Orders creates a 3-row bracket: parent STOP BUY + TP child + SL child (linked)                                                                                                                        | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 (screenshots): pre-trigger state matches TV — Orders badge = 3, parent STOP BUY is Working, TP+SL child legs are Inactive (Working 1 / Inactive 2). Cancelling parent before trigger cancels all 3 rows.                                                                                              |
| 3.4.2 | When triggered, position shows correct TP/SL    | Parent moves to **Orders → Filled** (and remains in **Order History → Filled**); TP/SL children become active exits; **Orders top badge = 2** active child orders; position closes from Positions tab | ✅     | ✅   | T1 · Vitest | Verified 01.05.2026 (screenshots): post-trigger matches TV — Positions shows LONG with TP $78,000 / SL $76,000; Orders top badge shows **2** (only active TP/SL). Parent STOP appears as historical Filled while TP+SL remain Working. CD avg fill $77,385.4 vs TV $77,399.7 (~$14.3 drift from trigger timing/slippage). |

#### 3.5 Edge cases

| #     | Scenario                                           | Expected                                                                                                                                                                      | Status | Tier        | Notes                                                                                                                                                                  |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.5.1 | Stop Buy price **below** market                    | An immediate-fill warning before placement: a Stop Buy at or below the current BUY price would fill at once, so the order goes in only with a second click (**Place anyway**) | ✅     | T1 · Vitest | ✅ 01.05.2026 — matched TV behavior in manual check: below-market Stop Buy is rejected; use Limit Buy for below-market entry.                                          |
| 3.5.2 | Multiple pending orders (mix of limit + stop)      | All show in Orders tab; each cancels/fills independently                                                                                                                      | ✅     | T1 · Vitest | ✅ 01.05.2026 — screenshot-backed pass: multiple simultaneous pending stop orders rendered correctly with independent working rows and counts in both CD and TV views. |
| 3.5.3 | Reset account with pending orders                  | All pending orders cleared; balance restored to $10,000                                                                                                                       | ✅     | T1 · Vitest | ✅ 01.05.2026 — user verified pass after reset flow; pending orders cleared and account returned to default state.                                                     |
| 3.5.4 | Stop Sell price **above** market (mirror of 3.5.1) | The same immediate-fill warning; placed only with **Place anyway**                                                                                                            | ✅     | T2 · RTL    | `TradingPanel.test` "Section 3 — Stop Orders (T2 · RTL)", the Stop Sell case (was mislabelled 3.5.2).                                                                  |

### Section 4 — Cross-cutting / Regression _(rows 4.17–4.18: editing an order or a position’s TP / SL)_

| #    | Scenario                                  | Expected                                                                                                                                                                                                                                            | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.17 | Edit **pending** bracket order via pencil | Journal gets a **summary** entry with parent deltas (price / qty / reserved / TP / SL) plus separate child-leg entries (`Take-Profit/Stop-Loss modification confirmed`, `... added`, or `... cancelled`) for each changed exit leg                  | ✅     | T1 · Vitest | ✅ 01.05.2026 — screenshots confirm the real UI flow for the pending-order **summary** journal row (`Modified LIMIT Long BTCUSDT — price $78400.00 → $78440.00, reserved $1999.20 → $2000.22`) before fill. Vitest also confirms the pending child-leg journal paths in `paperStore.test.ts`: `writes detailed parent and child journal entries when editing a pending order` and `writes cancel history and a descriptive journal entry when removing a pending TP child`.                                                                                                                                                                        |
| 4.18 | Edit **open position** TP/SL via pencil   | Journal gets a **summary** entry (`Modified LONG/SHORT ... exits — ...`) plus separate child-leg entries for each changed exit leg; toggling TP/SL off writes a `... cancelled ...` journal entry and also creates a Cancelled row in Order History | ✅     | T1 · Vitest | ✅ 01.05.2026 — screenshots confirm the real UI flow for editing an **open position**: Journal shows the summary row `Modified LONG BTCUSDT exits — TP $78800.00 → $78900.00, SL $78100.00 → $7800.00` plus separate `Take-Profit modification confirmed` and `Stop-Loss modification confirmed` entries; Orders shows the updated Working TP/SL child rows; Positions shows the new TP/SL values on the live position. Vitest also confirms both store paths in `paperStore.test.ts`: `writes detailed confirmation entries when editing position TP/SL` and `writes cancel history and a descriptive journal entry when removing a position TP`. |

### Section 14 — Markets, Bybit fees and fill prices (Bybit Parity BP-2) _(part: 14.5, 14.2, 14.3, 14.4 — the rest of Section 14 is in Stages 0, 1 and 6)_

> Two markets: **Spot** (coin balances, 1×, no shorting) and **USDT Perpetual** (positions, per-symbol leverage).
> Reference: `docs/APP_LOG.md` Bybit Parity BP-2. ✅ in the Tier column means automated; the Notes say where. "Live ✓"
> rows were run against the dev server + the live Bybit feed on 2026-09-26 (22 checks, throwaway users deleted).

#### 14.5 Per-symbol leverage

| #      | Action                                                                      | Expected                                                            | Status | Tier    | Notes                                     |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ------- | ----------------------------------------- |
| 14.5.1 | Leverage chip (`Isolated 10x ▾`) → 5× → Confirm on ETHUSDT (no open trades) | ETHUSDT orders use 5×; other symbols keep their own / the default   | ✅     | T1 + T2 | `fees.test`, `TradingPanel.test`. Live ✓. |
| 14.5.2 | With a BTCUSDT position or active order open                                | ~~Chip shows a lock; 422~~ — superseded by BP-3 re-margining (15.5) | ✅     | T1 + T2 | See 15.5.                                 |

#### 14.2 USDT Perpetual fees (VIP-0 taker 0.055% / maker 0.02%)

| #      | Action                                                          | Expected                                                                                                         | Status | Tier        | Notes                                           |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------- |
| 14.2.1 | Market buy 0.1 BTC at 10× with the ask at 50,000                | IM 500, open fee 2.75, fee to close 2.475 (BP-3: at the bankruptcy price) → balance −505.225; row "0.055% taker" | ✅     | T1 · Vitest | `fees.test`. Live ✓ (fee = 0.055% of notional). |
| 14.2.2 | Close it at bid 51,000                                          | Close fee 2.805; +599.67 back; realized +94.445                                                                  | ✅     | T1 · Vitest | `fees.test`.                                    |
| 14.2.3 | Resting limit buy 0.1 @ 49,000 at 10×                           | Reserves 495.1205 (IM + taker open fee + fee to close); fills at **49,000** with a 0.98 maker fee; net −493.4055 | ✅     | T1 · Vitest | `fees.test`. Live ✓ reserve.                    |
| 14.2.4 | Cancel a resting order                                          | Refunds exactly what it reserved                                                                                 | ✅     | T1 · Vitest | Live ✓.                                         |
| 14.2.5 | Order form estimate                                             | Cost = margin + est. open fee + est. close fee; "Fees: taker 0.055% · maker 0.02%" line                          | ✅     | T2 · RTL    | `TradingPanel.test` 1.1.1, `orderMath.test`.    |
| 14.2.6 | Pre-BP-2 position (entry fee 0.7 at 0.07%) closed at bid 51,000 | Uses its stored 0.7: realized +96.495 — old fees are never recomputed                                            | ✅     | T1 · Vitest | `fees.test` "never recompute".                  |

#### 14.3 Fill prices

| #      | Action                                                        | Expected                                                            | Status | Tier        | Notes                              |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ----------- | ---------------------------------- |
| 14.3.1 | Market buy / sell                                             | Buy fills at the ask, sell at the bid                               | ✅     | T1 · Vitest | `services.test`. Live ✓ ask / bid. |
| 14.3.2 | Limit buy above the ask (crosses)                             | Fills now at the ask as a taker; no pending row; history says LIMIT | ✅     | T1 · Vitest | `fees.test`. Live ✓.               |
| 14.3.3 | Stop buy triggers at 50,500 with the ask at 50,510            | Fills at 50,510 (taker)                                             | ✅     | T1 · Vitest | `triggers.test`, `fees.test`.      |
| 14.3.4 | Long TP hit                                                   | Triggers on the last price, closes at the bid                       | ✅     | T1 · Vitest | `triggers.test`.                   |
| 14.3.5 | Quote older than 10 s, or no bid / ask                        | 409 "Waiting for live price…"                                       | ✅     | T1 · Vitest | `services.test`.                   |
| 14.3.6 | Backfilled trigger (server was down)                          | Fills at the level it crossed, not today's price                    | ✅     | T1 · Vitest | `services.test`.                   |
| 14.3.7 | A spot tick never triggers a perpetual order (and vice versa) | Per-market trigger index                                            | ✅     | T1 · Vitest | `triggers.test`, `services.test`.  |

#### 14.4 Bybit size rules

| #      | Action                                     | Expected                                            | Status | Tier                   | Notes                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------ | --------------------------------------------------- | ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14.4.1 | Perp qty 0.0001 BTC                        | 422 "Order quantity lower than the minimum (0.001)" | ✅     | T1 · Vitest + T2 · RTL | Live ✓. T2: `TradingPanel.test` "should show the minimum-quantity refusal and keep the amount (14.4.1)" (the 422 text in `trade.error`, form kept); with the rules loaded the form stops 0.0001 BTC first — `TradingPanel.instrumentRules.test` "should stop a perp order under the minimum quantity before sending it (14.4.1)" |
| 14.4.2 | Limit price 10000.05 on BTCUSDT (tick 0.1) | 422 "Order price decimal too long (tick size 0.1)"  | ✅     | T1 · Vitest + T2 · RTL | Live ✓. T2: `TradingPanel.test` "should show the tick-size refusal and keep the price and amount (14.4.2)"; `TradingPanel.instrumentRules.test` "should default a limit price to the market's tick"                                                                                                                              |
| 14.4.3 | Spot order worth under 5 USDT              | 422 "Order value exceeded lower limit (5 USDT)"     | ✅     | T1 · Vitest + T2 · RTL | `spot.test`. T2: `TradingPanel.test` "should show the spot minimum-value refusal and keep the amount (14.4.3)"; `TradingPanel.instrumentRules.test` "should stop a spot order worth under 5 USDT before sending it (14.4.3)"                                                                                                     |
| 14.4.4 | Qty 0.1239 BTC (step 0.001)                | Rounded down to 0.123                               | ✅     | T1 · Vitest + T2 · RTL | `fees.test`. T2: `TradingPanel.instrumentRules.test` "should round a quantity down to the step before sending it (14.4.4)" (sends `qty: '0.123'`)                                                                                                                                                                                |

### Section 15 — Mark price, one-way positions, liquidation, re-margining (Bybit Parity BP-3) _(part: 15.2 — the rest of Section 15 is in Stage 4)_

> Reference: `docs/APP_LOG.md` Bybit Parity BP-3 and Bybit's UTA isolated-mode formulas in
> `apps/server/src/trading/bybitSpec.ts`. Worked position used below: **long 0.1 BTC @ 50,000 at 10×** — IM 500,
> fee to close 2.475, BTCUSDT tier 1 MMR 0.33% → liquidation **45,149.0** (45,148.99… rounded up to the 0.1 tick, as Bybit does), bankruptcy **45,000**.

#### 15.2 One-way mode (one position per symbol)

| #      | Action                                  | Expected                                                                                                                    | Status | Tier        | Notes                                                                                                                                                                 |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15.2.1 | Buy 0.01 @ 50,000 then 0.005 @ 60,000   | One long 0.015 @ 53,333.33; margins and fees summed; journal "Added to LONG …"                                              | ✅     | T1 · Vitest | `actions.test` merge.                                                                                                                                                 |
| 15.2.2 | Add with a TP attached                  | The new TP replaces the position's (Bybit Full-mode TP/SL); without one the position keeps its own                          | ✅     | T1 · Vitest | `fillInto`.                                                                                                                                                           |
| 15.2.3 | Migrate a DB with 3 same-side BTC longs | Merged into the oldest: qty summed, qty-weighted entry, newest TP / SL, one journal line, SymbolSetting = position leverage | ✅     | T2i         | `migrationReplay.int.test` "[15.2.3] merges three same-side BTC longs into the oldest, from stored values only (BP-3)". Earlier: dry run on dev Postgres, 2026-09-27. |

---

## Stage 4 — Risk management

What can go wrong with a leveraged position and the tools to control it: the mark price, liquidation and
bankruptcy prices, adding / reducing isolated margin, re-margining on a leverage change, risk tiers, the TP / SL
trigger source, reduce-only and close-on-trigger, and the Closed P&L record. After this stage the learner can
size a position so it survives a move, and read what a close really made or lost.

### Section 15 — Mark price, one-way positions, liquidation, re-margining (Bybit Parity BP-3) _(part: 15.1, 15.3–15.6 — 15.2 is in Stage 3)_

> Reference: `docs/APP_LOG.md` Bybit Parity BP-3 and Bybit's UTA isolated-mode formulas in
> `apps/server/src/trading/bybitSpec.ts`. Worked position used below: **long 0.1 BTC @ 50,000 at 10×** — IM 500,
> fee to close 2.475, BTCUSDT tier 1 MMR 0.33% → liquidation **45,149.0** (45,148.99… rounded up to the 0.1 tick, as Bybit does), bankruptcy **45,000**.

#### 15.1 Mark price

| #      | Action                                          | Expected                                                                        | Status | Tier        | Notes                                    |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------- |
| 15.1.1 | Positions tab with a perp position; mark ≠ last | PnL, PnL %, equity and the summary bar use the **mark**; "Mark Price" column    | ✅     | T2 · RTL    | `OrderAccountManagementPanel.test` BP-3. |
| 15.1.2 | Mark price of a symbol no pane shows            | Comes from the server's `prices` push (`mark`)                                  | ✅     | T1 · Vitest | `paperStore.test` applyPrices.           |
| 15.1.3 | TP / SL / stop on a perp position               | Still trigger on the **last** price (Bybit default); only liquidation uses mark | ✅     | T1 · Vitest | `liquidation.test` evaluateTick.         |

#### 15.3 Liquidation and bankruptcy prices

| #      | Action                                                     | Expected                                                                                                                     | Status | Tier        | Notes                                  |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------- |
| 15.3.1 | Bybit's worked example (1 BTC @ 40,000, 50×, +3,000 extra) | Fee to close 21.56, IM 821.56, MM 221.56, liquidation **36,380.25**                                                          | ✅     | T1 · Vitest | `bybitSpec.test` (reproduced exactly). |
| 15.3.2 | Worked long / short at 10×                                 | Long liq 45,149.0, bust 45,000; short liq 54,819.0, bust 55,000 (liquidation price rounded to the 0.1 tick on the safe side) | ✅     | T1 · Vitest | `liquidation.test`.                    |
| 15.3.3 | A 1× long                                                  | Can't be liquidated: liquidation price shows "—"                                                                             | ✅     | T1 + T2     |                                        |
| 15.3.4 | Tier by position value (BNB 9k vs 60k)                     | MMR 0.67% vs 0.77% — Bybit UTA moves positions between tiers automatically                                                   | ✅     | T1 · Vitest | `bybitSpec.test`.                      |
| 15.3.5 | Client estimate vs server                                  | SDK `estimatePositionRisk` matches the server maths                                                                          | ✅     | T1 · Vitest | `bybitSpec.test` parity.               |
| 15.3.6 | Order form, 0.1 BTC at 10× (ask 50,010)                    | "Est. liq. price $45,158.1" in amber with the ⓘ explainer                                                                    | ✅     | T2 · RTL    | `TradingPanel.test` BP-3.              |
| 15.3.7 | Positions tab                                              | Liq. Price (amber) and MMR meter columns; IM / MM / Last Price opt-in; saved column layouts get the new columns once         | ✅     | T2 · RTL    | `columnPrefs` migration tests.         |

#### 15.4 Liquidation in the engine

| #      | Action                                                    | Expected                                                                                                                                             | Status | Tier        | Notes                                                        |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------ |
| 15.4.1 | Mark reaches the liquidation price                        | Whole position closes at the bankruptcy price; balance unchanged (margin lost); realized −(IM + fee to close) − open fee                             | ✅     | T1 · Vitest | `liquidation.test`.                                          |
| 15.4.2 | Records                                                   | Trade `execType BustTrade`; close order `createType CreateByLiq` ("Liquidation" in Order History); TP / SL cancelled; journal + Balance History line | ✅     | T1 + T2     |                                                              |
| 15.4.3 | Active orders on the symbol                               | Cancelled and refunded first; other symbols untouched                                                                                                | ✅     | T1 · Vitest | `liquidation.test`.                                          |
| 15.4.4 | Position with no TP / SL                                  | Still watched by the engine (indexed) and liquidated on the mark tick                                                                                | ✅     | T1 · Vitest | `services.test` MatchingEngine.                              |
| 15.4.5 | Stale mark (> 10 s) or mark moved back                    | Never liquidates                                                                                                                                     | ✅     | T1 · Vitest | `services.test` runTrigger.                                  |
| 15.4.6 | Server gap                                                | Backfill replays mark-price klines; within one minute a stop-loss wins over liquidation                                                              | ✅     | T1 · Vitest | `liquidation.test`, `services.test`.                         |
| 15.4.7 | Liquidation sound                                         | Distinct from the loss sound; listed in Sound Settings                                                                                               | ✅     | T2 · RTL    | `usePaperFeed.test`.                                         |
| 15.4.8 | Notices                                                   | One-time "Positions can now be liquidated" banner (+ "How liquidation works"); a liquidation notice until dismissed                                  | ✅     | T2 · RTL    | `TradingPanel.test` BP-3.                                    |
| 15.4.9 | Deploy with a position already past its liquidation price | Liquidated on the first mark tick (no grace period, as on Bybit)                                                                                     | ✅     | M           | Checked at the BP-3 deploy, 2026-09-27 (APP_LOG BP-3 entry). |

#### 15.5 Re-margining (leverage change with a position open)

| #      | Action                                                           | Expected                                                                                           | Status | Tier        | Notes                         |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------- |
| 15.5.1 | 10× → 5× with the worked position                                | IM 500 → 1,000, fee to close → 2.2; 499.725 more margin from the wallet; journal + Balance History | ✅     | T1 · Vitest | `fees.test` re-margining.     |
| 15.5.2 | Lowering without the balance for it                              | 422 "Insufficient available balance to change leverage …"                                          | ✅     | T1 · Vitest |                               |
| 15.5.3 | Raising with no fresh mark / mark past the new liquidation price | 422 "Waiting for live price…" / "Leverage can't be raised: …"                                      | ✅     | T1 · Vitest | `fees.test`, `services.test`. |
| 15.5.4 | Active orders on the symbol                                      | Re-reserved at the new leverage (stop 0.1 @ 60,000: 606.27 → 2,005.5 at 3×)                        | ✅     | T1 · Vitest |                               |
| 15.5.5 | Leverage modal                                                   | Unlocked; previews "Position margin $X → $Y" and "Liq. price A → B"; shows a refusal inline        | ✅     | T2 · RTL    | `TradingPanel.test`.          |

#### 15.6 Chart lines

| #      | Action                                      | Expected                                                                                               | Status | Tier        | Notes                                                         |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ----------- | ------------------------------------------------------------- |
| 15.6.1 | Perp pane with a position and a limit order | Entry (side, qty, live PnL), TP / SL (dashed), Liq. (amber dashed), order + its TP / SL (dotted), Mark | ✅     | T1 · Vitest | `tradeLines.test`, `useTradeLines.test`.                      |
| 15.6.2 | Chart type menu → "Mark price line"         | Toggles the mark line (perps only, persisted, default on)                                              | ⬜     | T3 (P2)     |                                                               |
| 15.6.3 | Drag a TP line, then Confirm                | Price rounded to the tick; amend sent only after Confirm; Cancel restores the line                     | ✅     | T2 · RTL    | `useTradeLines.test`.                                         |
| 15.6.4 | With a drawing tool active                  | Lines don't take the pointer                                                                           | ✅     | T2 · RTL    |                                                               |
| 15.6.5 | Spot TP / SL leg                            | Drawn but not draggable (placed or cancelled, never edited)                                            | ✅     | T1 · Vitest |                                                               |
| 15.6.6 | Real chart: drag feel, labels, cursor       | ns-resize cursor on hover; chart doesn't pan while dragging a line                                     | ✅     | M           | Checked by hand at BP-3 (APP_LOG BP-3 entry); stays M (feel). |

### Section 17 — Cross margin, risk tiers and refinements (Bybit Parity BP-5) _(part: 17.1–17.4 — 17.5 is in Stage 5, 17.6 in Stage 6)_

> Reference: `docs/APP_LOG.md` Bybit Parity BP-5 (owner decisions O1–O12). Worked position: long 0.1 BTC at 50,000,
> 10× (IM 500, fee to close 2.475, liq 45,149.0 isolated). Live = the 2026-09-27 API + browser run on the dev
> server (throwaway account, deleted).

#### 17.1 Add / reduce margin (isolated, A)

| #      | Action                        | Expected                                                                               | Status | Tier        | Notes                     |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------- |
| 17.1.1 | Add 1,000                     | Liq ≈ 35,110; balance −1,000; journal + Balance History; leverage unchanged            | ✅     | T1 + T2     | `margin.test`, OAMP test. |
| 17.1.2 | Reduce past the added margin  | Refused (110078); reduce needs a fresh mark; a reduce that liquidates refused (110011) | ✅     | T1 · Vitest | `margin.test`.            |
| 17.1.3 | Partial close / leverage move | Extra margin shrinks pro rata / is released in full                                    | ✅     | T1 · Vitest | `margin.test`.            |
| 17.1.4 | Cross account                 | Refused ("isolated margin mode" only); the pencil is hidden                            | ✅     | T1 + live   | Live ✓ (422).             |

#### 17.2 Trigger source, reduce-only, TP / SL side (B)

| #      | Action                                    | Expected                                                                                              | Status | Tier        | Notes                        |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------- |
| 17.2.1 | SL on Mark / TP on Index                  | Fires on that source only; a leg whose source is unknown on a tick isn't checked; backfill likewise   | ✅     | T1 · Vitest | `orderRules.test`, services. |
| 17.2.2 | Leg moved to another source before firing | The stale trigger is dropped                                                                          | ✅     | T1 · Vitest | `services.test`.             |
| 17.2.3 | Reduce-only market / resting              | Capped at the position, no margin, no TP / SL; wrong side / no position refused (110017)              | ✅     | T1 + live   | Live ✓.                      |
| 17.2.4 | Position shrinks / closes                 | Resting reduce-only orders trimmed furthest-first, then cancelled                                     | ✅     | T1 · Vitest | `orderRules.test`.           |
| 17.2.5 | Close-on-trigger stop                     | Implies reduce-only; order form offers it for Stop only                                               | ✅     | T1 + T2     | TradingPanel test; live ✓.   |
| 17.2.6 | TP / SL on the wrong side (O9)            | Refused in Bybit's words vs the order price / the leg source's live price; untouched legs not checked | ✅     | T1 + live   | Live ✓ "…base_price…".       |
| 17.2.7 | SL beyond liquidation                     | Accepted; amber warning in the position TP / SL panel                                                 | ✅     | T1 + T2     | `PositionEditPanel.test`.    |

#### 17.3 Risk tiers (C)

| #      | Action                            | Expected                                                                                | Status | Tier        | Notes             |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------- | ------ | ----------- | ----------------- |
| 17.3.1 | Order / edit / leverage past cap  | Refused (110090) naming the leverage to go down to; reduce-only not counted             | ✅     | T1 · Vitest | `riskTiers.test`. |
| 17.3.2 | Liquidation above the lowest tier | Steps down to each lower tier's limit at bankruptcy; full close only in the lowest tier | ✅     | T1 · Vitest | `riskTiers.test`. |
| 17.3.3 | Backfill                          | One mark candle can take several steps (worst mark)                                     | ✅     | T1 · Vitest |                   |
| 17.3.4 | Leverage modal / MMR hover        | Tier, MMR, max position value at the chosen leverage                                    | ✅     | T2 + live   | Screenshot ✓.     |

#### 17.4 Closed P&L (D)

| #      | Action        | Expected                                                                                        | Status | Tier      | Notes                        |
| ------ | ------------- | ----------------------------------------------------------------------------------------------- | ------ | --------- | ---------------------------- |
| 17.4.1 | Partial close | Row: closed qty, entry, exit, closedPnl = PnL − open fee − close fee − funding; hover breakdown | ✅     | T1 + live | Live ✓ −0.3741 on 0.004 BTC. |
| 17.4.2 | Liquidation   | Exit type "Liquidation"; spot sells never listed                                                | ✅     | T2 · RTL  |                              |

---

## Stage 5 — Advanced

Holding positions over time and across symbols: funding payments, cross margin with account-level
liquidation, and trading several symbols in several synced panes at once. After this stage the learner can run a
multi-symbol cross-margin book and knows what funding costs to hold it.

### Section 16 — Funding (Bybit Parity BP-4)

> Reference: `docs/APP_LOG.md` Bybit Parity BP-4. fee = size × mark × rate at the funding timestamp; a positive rate: longs
> pay, shorts receive. Worked position: long 0.1 BTC at 10× (IM 500), mark 51,000, rate 0.01% → fee **0.51**.

#### 16.1 Settlement

| #      | Action                                             | Expected                                                                                                   | Status | Tier        | Notes                              |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------- |
| 16.1.1 | Long, rate +0.01%                                  | Pays 0.51: balance −0.51, realized −0.51, position Funding −0.51 (red)                                     | ✅     | T1 + T2     | `funding.test`, OAMP test.         |
| 16.1.2 | Short, rate +0.01% / long, rate −0.02%             | Receives 0.51 / 1.02 (green, "+")                                                                          | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.3 | Balance too low                                    | The shortfall comes out of the position margin; its liquidation price moves toward the mark                | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.4 | Position closed seconds after the timestamp        | Still pays (held at the timestamp), from the balance                                                       | ✅     | T1 · Vitest | `funding.test`.                    |
| 16.1.5 | Position opened after the timestamp                | Not charged                                                                                                | ✅     | T1 · Vitest | `services.test` MatchingEngine.    |
| 16.1.6 | Same timestamp twice (restart, retry, 2nd machine) | Settles once (`SymbolSetting.lastFundingAt`)                                                               | ✅     | T1 + live   | Live ✓ 2026-09-27 (second run: 0). |
| 16.1.7 | Records                                            | Funding execution row (`execType Funding`, mark as price, rate, signed fee), journal line, Balance History | ✅     | T1 + live   | Live ✓: fee 0.01936652 exact.      |
| 16.1.8 | Rate source                                        | Bybit's settled rate from funding history for exactly that timestamp; the ticker's announced rate if none  | ✅     | T1 · Vitest | `services.test`.                   |
| 16.1.9 | Mark at the timestamp                              | The mark seen at the timestamp, not the next tick's                                                        | ✅     | T1 · Vitest | `services.test`.                   |

#### 16.2 Backfill, closes, history

| #      | Action                                  | Expected                                                                                                  | Status | Tier        | Notes            |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ----------- | ---------------- |
| 16.2.1 | Server gap spanning a funding timestamp | Settled at the mark-price candle's open, in time order with the candle sweep (before a later liquidation) | ✅     | T1 · Vitest | `services.test`. |
| 16.2.2 | Close after funding                     | The closed-trade record carries the funding share; realized PnL isn't charged again                       | ✅     | T1 · Vitest | `funding.test`.  |
| 16.2.3 | Same-side add                           | The merged position keeps its funding so far                                                              | ✅     | T1 · Vitest |                  |
| 16.2.4 | Snapshot                                | Funding rows never crowd out closed-trade history (own capped list)                                       | ✅     | T1 + live   |                  |
| 16.2.5 | Funding history paging / 7-day cap      | Oldest first; both `startTime` and `endTime` sent                                                         | ✅     | T1 · Vitest | `infra.test`.    |

#### 16.3 UI

| #      | Action            | Expected                                                                                       | Status | Tier      | Notes                           |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------- | ------ | --------- | ------------------------------- |
| 16.3.1 | Perps pane header | MARK · INDEX · FUNDING / COUNTDOWN "0.0083% / 07:49:28", ticking each second; tooltip explains | ✅     | T2 + live | `SymbolBar.test`; screenshot ✓. |
| 16.3.2 | Spot pane header  | No mark / index / funding stats                                                                | ✅     | T2 · RTL  |                                 |
| 16.3.3 | Positions tab     | Funding column (default on; saved layouts get it once, before Close if its anchor is hidden)   | ✅     | T2 · RTL  | `columnPrefs` tests.            |

### Section 17 — Cross margin, risk tiers and refinements (Bybit Parity BP-5) _(part: 17.5 — the rest of Section 17 is in Stages 4 and 6)_

> Reference: `docs/APP_LOG.md` Bybit Parity BP-5 (owner decisions O1–O12). Worked position: long 0.1 BTC at 50,000,
> 10× (IM 500, fee to close 2.475, liq 45,149.0 isolated). Live = the 2026-09-27 API + browser run on the dev
> server (throwaway account, deleted).

#### 17.5 Cross margin (E)

| #      | Action                          | Expected                                                                                                 | Status | Tier            | Notes                                                                                                                                                                                           |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17.5.1 | New account                     | Cross; existing accounts isolated with a one-time notice (How it works / Switch to Cross)                | ✅     | T2 + T2i + live | Live ✓; `migrationReplay.int.test` "[17.5.1] keeps every existing account isolated with the one-time notice", "[17.5.1] opens an account created after the migration in cross, with no notice". |
| 17.5.2 | Figures                         | Margin balance, IM / MM at mark, rates, available — server = client estimate                             | ✅     | T1 · Vitest     | `bybitSpec.test` parity.                                                                                                                                                                        |
| 17.5.3 | Order on unrealised profit      | Accepted in cross, refused in isolated                                                                   | ✅     | T1 · Vitest     | `cross.test`.                                                                                                                                                                                   |
| 17.5.4 | Loss beyond a position's margin | From the wallet in cross; isolated books only what was lost                                              | ✅     | T1 · Vitest     |                                                                                                                                                                                                 |
| 17.5.5 | MM rate reaches 100%            | Orders cancelled, positions stepped down in contract order (BTC first), account ends ≥ 0                 | ✅     | T1 · Vitest     | `cross.test`, services (fresh marks).                                                                                                                                                           |
| 17.5.6 | Mode switch                     | Isolated → cross releases added margin; cross → isolated refused with every reason; same mode = no-op    | ✅     | T1 + live       | Live ✓ both ways.                                                                                                                                                                               |
| 17.5.7 | UI                              | `Cross 10x` chip; mode tabs + explainer; summary bar Margin balance / IM rate / MM meter; cross liq est. | ✅     | T2 + live       | Screenshots ✓.                                                                                                                                                                                  |

### Section 11 — Multi-Symbol PnL (`lastKnownPrices`)

> Verifies that positions in non-active symbols retain correct mark price and PnL display.
> **BP-3:** USDT Perpetual PnL now uses the **mark** price (`lastKnownMarkPrices` via `setLastKnownMarkPrice`, fed by
> linear pane tickers and the server's `prices` push), falling back to the last price until a mark arrives (15.1).
> Since BP-0, `lastKnownPrices` is keyed `category:symbol` (`spot:BTCUSDT`, `linear:BTCUSDT`) via
> `setLastKnownPrice` / `getLastKnownPrice` in `paneStore.ts`. Perpetual positions carry `category: 'linear'`
> since BP-2 and price at the mark since BP-3 — seed `linear:` mark keys (`setLastKnownMarkPrice`) in these tests.

| #    | Action                                                                     | Expected                                                                                            | Status | Tier     | Notes                                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.1 | In 2h layout: set pane 0 = BTCUSDT, pane 1 = ETHUSDT. Set pane 0 as active | TradingPanel shows BTCUSDT                                                                          | ✅     | T2 · RTL | Re-tiered from T1 (a UI flow). `MultiSymbolPnl.test` "should trade the active pane and list one row per symbol (11.1, 11.2, 11.3)" (2h, pane 0 BTCUSDT / pane 1 ETHUSDT, the form follows the clicked pane). T3 `e2e/advanced/multiSymbol.spec.ts` waits on the fake feed              |
| 11.2 | Place a market Buy $100 on BTCUSDT (active pane)                           | BTCUSDT position appears in Positions tab                                                           | ✅     | T2 · RTL | Same test: 0.01 BTC → `positions.row` `linear:BTCUSDT`                                                                                                                                                                                                                                 |
| 11.3 | Switch active pane to pane 1 (ETHUSDT). Place a market Buy $100 on ETHUSDT | ETHUSDT position appears; Positions tab now shows 2 rows                                            | ✅     | T2 · RTL | Same test: 0.1 ETH on pane 1 → 2 rows                                                                                                                                                                                                                                                  |
| 11.4 | Switch active pane back to pane 0 (BTCUSDT)                                | Both positions still visible; ETHUSDT row shows a valid mark price (not $0 or stale)                | ✅     | T2 · RTL | `MultiSymbolPnl.test` "should value the ETH row at its own mark while BTC is the active pane (11.4, 11.5)" — mark `$3,100` from the server's `prices` push (`setLastKnownMarkPrice`, linear). Re-tiered from T1: the lookup is inline in the Positions tab (`getMark`), no pure helper |
| 11.5 | Watch ETHUSDT PnL while BTCUSDT is the active pane                         | ETHUSDT PnL updates live (from `lastKnownPrices`, not the active pane price)                        | ✅     | T2 · RTL | Same test: PnL `+10.00`, then `-5.00` on the next push, BTC active throughout                                                                                                                                                                                                          |
| 11.6 | Switch to single-pane layout (`1`) showing only BTCUSDT                    | ETHUSDT position mark price still updates (pane WS closes but `lastKnownPrices` retains last value) | ✅     | T2 · RTL | `MultiSymbolPnl.test` "should keep moving the ETH row after its pane closes (11.6)" (layout `1`, pane 1 store reset as usePaneFeeds does; push → `$3,200`, `+20.00`)                                                                                                                   |
| 11.7 | Account Summary Bar — Unrealized P&L                                       | Reflects the **combined** PnL of BTC + ETH positions, not just the active pane's position           | ✅     | T2 · RTL | `MultiSymbolPnl.test` "should add both rows into the Unrealized P&L summary (11.7)" (`account.summary.upnl` `+$11.00` = BTC `+1.00` + ETH `+10.00`)                                                                                                                                    |
| 11.8 | Close ETHUSDT position manually while BTCUSDT is active                    | ETHUSDT position closes; History tab shows the correct exit price and PnL                           | ✅     | T2 · RTL | `MultiSymbolPnl.test` "should close the ETH position by its own id and list it in Closed P&L (11.8)" (`positions.row.close` → `closePosition(ethId)`; `closed-pnl.row` ETHUSDT at `3,200`, `+20.0000 USDT`). T3 half waits on the fake feed                                            |

### Section 10.4 — Multi-Chart Layout: Sync options

| #      | Action                                                          | Expected                                                                                                        | Status | Tier        | Notes                                                                                               |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------- |
| 10.4.1 | Enable **Sync Symbol** toggle (in ChartLayoutPicker)            | All panes immediately snap to the active pane's symbol                                                          | ✅     | T1 · Vitest | `layoutStore.test` "snaps all panes to active pane symbol when symbol sync is enabled"              |
| 10.4.2 | Disable **Sync Symbol**; change pane 0 symbol                   | Other panes remain on their current symbols                                                                     | ✅     | T1 · Vitest | `layoutStore.test` "updates only the target pane when sync.symbol is off"                           |
| 10.4.3 | Enable **Sync Interval** toggle                                 | All panes immediately snap to the active pane's interval                                                        | ✅     | T1 · Vitest | `layoutStore.test` "snaps all panes to active pane interval when interval sync is enabled"          |
| 10.4.4 | Enable **Sync Crosshair**; hover over pane 0 chart              | Crosshair line appears on all other panes at the same time position; Y position maps to each pane's price scale | ⬜     | T3 (P2)     | Requires real chart canvas + mouse hover events — cannot be tested in jsdom.                        |
| 10.4.5 | Move cursor off chart (pane 0 loses cursor)                     | Crosshair clears from all follower panes                                                                        | ⬜     | T3 (P2)     |                                                                                                     |
| 10.4.6 | Enable **Sync Time Range**; pan or zoom pane 0                  | All other panes adjust visible range to match                                                                   | ⬜     | T3 (P2)     |                                                                                                     |
| 10.4.7 | Enable Sync Time Range while panes are at different zoom levels | All panes snap to active pane's visible range immediately on toggle-on                                          | ⬜     | T3 (P2)     |                                                                                                     |
| 10.4.8 | Sync options persist after browser refresh                      | Toggle states restored from `cd-layout` localStorage                                                            | ✅     | T1 · Vitest | `layoutStore.test` "should restore every sync toggle as it was left when the page reloads (10.4.8)" |

### Section 4 — Cross-cutting / Regression _(rows 4.19–4.20: multi-pane TP / SL incidents)_

| #    | Scenario                                                                        | Expected                                                          | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.19 | Multi-pane: pane 0 = ETHUSDT, pane 1 = BTCUSDT. BTC price drops to SL on pane 1 | BTC position closes; ETH position is **not** affected             | ✅     | T1 · Vitest | Regression for 4.18 incident (symbol-switch bug). `useTPSLMonitor` now subscribes to all 4 pane stores independently; each evaluated against its own pane's symbol. Automated in `triggers.test.ts` "evaluateTick() symbol isolation (4.18 regression)" (the browser monitor and `useTPSLMonitor.test.ts` are gone since BP-1). |
| 4.20 | Multi-pane: pane 0 = ETHUSDT price tick at ~7500 with BTC SL typo=7800          | ETH tick does **not** close BTC position (wrong-symbol isolation) | ✅     | T1 · Vitest | Direct 4.18 incident replay. ETH price satisfies the typo SL level numerically, but pane 0 only evaluates ETHUSDT positions — BTC position is immune. Automated in `triggers.test.ts` "evaluateTick() symbol isolation (4.18 regression)" (the browser monitor and `useTPSLMonitor.test.ts` are gone since BP-1).               |

---

## Stage 6 — Under the hood (for testers)

Not a learning step: the checks that keep everything above honest. The per-category market feed, the 24/7
server engine and its restarts, migrations and deploy safety, price and fill parity against Bybit, the
cross-phase regression suite and the server-side account safeguards.

### Section 12 — Market data per category (Bybit Parity BP-0)

> Each pane reads history, live candles and quotes from its own Bybit market: `spot` (Spot) or
> `linear` (USDT Perpetual). There is no market switch UI until BP-2 — every pane is `spot`, so the
> visible app must behave exactly as before, **except** that spot bid/ask now arrive (F2).
> Linear checks go against the API/WS directly (curl / `wscat`) or by setting a pane's category in the
> store (`useLayoutStore.getState().setPaneCategory(0, 'linear')` in the devtools console).
> Reference values: `docs/APP_LOG.md` Bybit Parity reference values. **Since BP-2** the market switch exists, so the
> devtools route in 12.2.5 is superseded.

#### 12.1 Spot feed (default)

| #      | Action                                                                   | Expected                                                                                                    | Status | Tier        | Notes                                                                                                                                              |
| ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.1.1 | Open dashboard, BTCUSDT 1m                                               | Spread badge shows a number, not `—`; Sell = best bid, Buy = best ask (differ by one tick most of the time) | ⬜     | T3 (P2)     | Feed verified 2026-09-26 on the WS (badge not yet checked in a browser): spot tickers carry `bid`/`ask` from `orderbook.1` (e.g. 83969.9 / 83970). |
| 12.1.2 | Compare last 1m candle close with Bybit **Spot** BTCUSDT chart           | Closes match exactly; no step where history meets live bars                                                 | ⬜     | T3 (P2)     | History is spot-only now — no linear fallback (F1).                                                                                                |
| 12.1.3 | Reload in a quiet market (no price change for a few seconds)             | Bid/ask appear immediately after connect, not only after the next price change                              | ⬜     | T3 (P2)     | Server sends its cached quote on connect; cache is cleared when the Bybit stream disconnects.                                                      |
| 12.1.4 | Returning user: load the app with a `cd-layout` v3 entry in localStorage | Layout, symbols, intervals, chart types unchanged; every pane has `category: 'spot'`                        | ✅     | T1 · Vitest | `layoutStore.test.ts` "v3 → v4 migration". The D7 move of existing layouts to linear ships with BP-2.                                              |
| 12.1.5 | Tamper `cd-layout` → set a pane's `category` to `"inverse"`, reload      | App loads; that pane falls back to `spot`                                                                   | ✅     | T1 · Vitest | `merge` validation — category ends up in a server request.                                                                                         |

#### 12.2 USDT Perpetual feed (API / store level)

| #      | Action                                                               | Expected                                                                                                                                                | Status | Tier            | Notes                                                                                                          |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| 12.2.1 | `GET /api/market/candles?category=linear&symbol=BTCUSDT&interval=1m` | 200, `category: "linear"`; closes match Bybit's **Perpetual** BTCUSDT chart (a few $ to tens of $ off spot)                                             | ✅     | T1 · Vitest     | Verified live 2026-09-26: linear 83929.4 vs spot 83970 on the same minute.                                     |
| 12.2.2 | `GET /api/market/candles?category=inverse`                           | 400 `{ error }`, no upstream call                                                                                                                       | ✅     | T1 · Vitest     |                                                                                                                |
| 12.2.3 | WS `/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m`       | Snapshot bars tagged `linear`; `ticker` messages carry `bid`, `ask`, `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime`, `fundingIntervalHour` | ✅     | T3 · Playwright | Verified live with a WS probe 2026-09-26.                                                                      |
| 12.2.4 | WS with `category=inverse`                                           | Socket closed with code 1008                                                                                                                            | ✅     | T1 · Vitest     |                                                                                                                |
| 12.2.5 | Set pane 0 to linear in devtools (`setPaneCategory(0, 'linear')`)    | Chart reloads with perp candles; spread badge shows perp bid/ask; paneStore `markPrice`/`fundingRate` populated                                         | ➖     | —               | Superseded by the BP-2 market switch (Section 14.1); positions price by `category:symbol`, at mark since BP-3. |
| 12.2.6 | Positions tab while pane 0 is linear                                 | ⚠️ Known BP-0 gap: open positions still price from spot `lastKnownPrices`, but the live pane price is perp                                              | ➖     | —               | Superseded by the BP-2 market switch (Section 14.1); positions price by `category:symbol`, at mark since BP-3. |

#### 12.3 Instrument rules & risk limits

| #      | Action                                                   | Expected                                                                                                                   | Status | Tier        | Notes                                                                                                                                                                                                                                                                                                         |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.3.1 | `GET /api/market/instruments?category=spot`              | 9 instruments; BTCUSDT `tickSize 0.1`, `qtyStep 0.000001`, `minOrderQty 0.000001`, `minNotional 5`, `maxLeverage null`     | ✅     | T1 · Vitest | Values checked live 2026-09-26. Cached 6 h server-side.                                                                                                                                                                                                                                                       |
| 12.3.2 | `GET /api/market/instruments?category=linear`            | BTCUSDT `tickSize 0.1`, `qtyStep 0.001`, `minOrderQty 0.001`, `minNotional 5`, `maxLeverage 150`, `fundingIntervalMin 480` | ✅     | T1 · Vitest | Not yet used by the order form (lot/tick rounding moves to these in BP-2, F9).                                                                                                                                                                                                                                |
| 12.3.3 | `GET /api/market/risk-limit?symbol=BTCUSDT`              | Tiers lowest first; tier 1 `maintenanceMarginRate 0.0033`, `mmDeduction 0`                                                 | ✅     | T1 · Vitest | Live tier-1 MMR is 0.33% (the plan had quoted 0.5%); `bybitSpec.ts` uses 0.33%.                                                                                                                                                                                                                               |
| 12.3.4 | `GET /api/market/risk-limit?symbol=PEPEUSDT` / no symbol | 400, no upstream call                                                                                                      | ✅     | T1 · Vitest |                                                                                                                                                                                                                                                                                                               |
| 12.3.5 | Bybit returns an error / rate limit                      | 502 `{ error: 'Failed to fetch market data' }` — no upstream text; a stale cached value is served if one exists            | ✅     | T1 · Vitest | `BybitMarketInfo.test` "should serve the cached risk-limit tiers when Bybit answers 500 after the 6 h TTL", "should serve the cached instrument rules when every symbol call answers 500", "should answer %s with 502 and no upstream text"; also `market.test` "serves the stale value on a failed refresh…" |

### Section 13 — Server trading engine (Bybit Parity BP-1)

> Trades are executed and watched on the server (`apps/server/src/trading`). The browser sends intent only and mirrors
> the account over the private WebSocket `/api/paper/ws`. Reference: `docs/APP_LOG.md` Bybit Parity BP-1.

#### 13.1 Intent only (F11)

| #      | Action                                                                                           | Expected                                                                                  | Status | Tier        | Notes                                                                  |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------- |
| 13.1.1 | Market Buy $100                                                                                  | Request body has symbol / side / type / qty or value only; fill price = server live price | ✅     | T2 · RTL    | `TradingPanel.test` "sends intent only"; `services.test` server price. |
| 13.1.2 | `curl -X POST /api/paper/orders` with an extra `price` / `balance` field                         | The fields are stripped and never reach the engine; the order fills at the server price   | ✅     | T1 · Vitest | `paper.test` "a client-supplied price never reaches the engine".       |
| 13.1.3 | Old endpoints: `PATCH /api/paper/account`, `POST /api/paper/trades`, `POST /api/paper/positions` | 404                                                                                       | ✅     | T1 · Vitest | Removed in BP-1.                                                       |
| 13.1.4 | Market order while the server has no live price (feed down)                                      | 409 "Waiting for live price…", shown in the order form; form keeps its values             | ✅     | T1 + T2     | `paper.test` + `TradingPanel.test` "server rejection".                 |

#### 13.2 24/7 execution (F10)

| #      | Action                                                                             | Expected                                                                                            | Status | Tier        | Notes                                                              |
| ------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------ |
| 13.2.1 | Place a limit a few $ past the price, **close the tab**, wait for the fill, reopen | Position open; journal has "Limit order filled — …"; Order History has the filled limit row         | ⬜     | T3 (P2)     | Needs live feed + a running server.                                |
| 13.2.2 | Open a position with a TP near the price, close the tab, wait, reopen              | Position closed; "Auto-closed … Take-Profit hit at $X" in the journal; balance updated              | ⬜     | T3 (P2)     |                                                                    |
| 13.2.3 | TP/SL on a symbol **no pane is showing**                                           | Still triggers (the browser only watched symbols open in a pane)                                    | ✅     | T1 · Vitest | `triggers.test` symbol isolation / `services.test` MatchingEngine. |
| 13.2.4 | Restart the server with open orders; price crosses during the downtime             | On restart a "Backfilling price gap" log line; the crossed order fills at its trigger, exactly once | ⬜     | T3 (P2)     | Engine unit: `services.test` "backfills downtime".                 |

#### 13.3 Sync, sessions, safety fixes

| #      | Action                                                                  | Expected                                                                                                                                                | Status | Tier        | Notes                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 13.3.1 | Two tabs open; place / cancel / close in one                            | The other tab updates within ~1 s; each sound plays once per tab                                                                                        | ⬜     | T3 (P2)     | WS fan-out unit-tested in `paper.test`.                                                                                                                                        |
| 13.3.2 | Log out, log in as another user on the same browser                     | Nothing of the first account is shown; `cd-paper-trading` is gone from localStorage                                                                     | ✅     | T1 · Vitest | `usePaperFeed.test` sign-out + `paperStore.test` clear(). Logout leak fixed.                                                                                                   |
| 13.3.3 | Keep the dashboard open for 20+ minutes, then trade                     | Orders still work (access token refreshed ~60 s before expiry; WS re-authenticates)                                                                     | ⬜     | T3 (P2)     | `usePaperFeed.test` re-auth / 4401 refresh.                                                                                                                                    |
| 13.3.4 | S1 — a triggered order that can't fill                                  | Recorded as rejected ("Order could not be filled."), never silently dropped                                                                             | ✅     | T1 · Vitest | `actions.test` "S1".                                                                                                                                                           |
| 13.3.5 | S2 — place a limit at 1×, change leverage to 10×, let it fill           | Position size uses 1× (the order's own leverage)                                                                                                        | ✅     | T1 · Vitest | `actions.test` "S2".                                                                                                                                                           |
| 13.3.6 | S3 — a limit placed mid-candle after the candle already dipped below it | Does not fill until a tick after placement crosses it                                                                                                   | ✅     | T1 · Vitest | `triggers.test` "S3".                                                                                                                                                          |
| 13.3.7 | Filled limit / stop in Order History                                    | Row keeps its own type (LIMIT / STOP) — changed from the browser's temporary "MARKET"                                                                   | ✅     | T1 · Vitest | `actions.test` 3.1.3.                                                                                                                                                          |
| 13.3.8 | Two orders for one account at once on two machines; a burst of six      | Both apply, `Account.version` + 2; in a burst every accepted order applies once and a refused one (409 "Account changed — please retry") leaves nothing | ✅     | T2i         | `paperRoutes.int.test` "[13.3.8] two orders for one account sent at once to two machines both apply…", "[13.3.8] a burst across two machines loses no update…" (was NEW-13-2). |

### Section 14 — Markets, Bybit fees and fill prices (Bybit Parity BP-2) _(part: 14.7 — the rest of Section 14 is in Stages 0, 1 and 3)_

> Two markets: **Spot** (coin balances, 1×, no shorting) and **USDT Perpetual** (positions, per-symbol leverage).
> Reference: `docs/APP_LOG.md` Bybit Parity BP-2. ✅ in the Tier column means automated; the Notes say where. "Live ✓"
> rows were run against the dev server + the live Bybit feed on 2026-09-26 (22 checks, throwaway users deleted).

#### 14.7 Migration (D7) and deploy safety

| #      | Action                                                                   | Expected                                                                                                                                                                               | Status | Tier        | Notes                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14.7.1 | Migrate a DB with pre-BP-2 rows                                          | Positions / orders / trades become `linear`; position leverage = qty × entry / margin; entry fee 0.07% of margin; PENDING reserved = margin × 1.0007; FILLED rows carry feeRate 0.0007 | ✅     | T2i         | `migrationReplay.int.test` "[14.7.1] stamps every old position, order and trade USDT Perpetual", "[14.7.1] backfills pending orders…", "[14.7.1] marks old fills taker…"; the migrated account loads, cancels and closes through `AccountRepository`. |
| 14.7.2 | Pre-BP-2 user (saved layout) opens `/dashboard` with perpetual positions | Lands once on USDT Perpetual at the newest position's symbol; never again                                                                                                              | ✅     | T2 · RTL    | `useMarketUrlSync.test`.                                                                                                                                                                                                                              |
| 14.7.3 | New user                                                                 | Starts on Spot                                                                                                                                                                         | ✅     | T1 · Vitest | `layoutStore.test`.                                                                                                                                                                                                                                   |
| 14.7.4 | Old client (sends `usdtAmount`, no market)                               | ~~Still trades USDT Perpetual~~ — removed with O11 (2026-09-28): 400, no size                                                                                                          | ➖     | T1 · Vitest | `paper.test` "pre-BP-2 usdtAmount only".                                                                                                                                                                                                              |
| 14.7.5 | Private WS                                                               | Pushes live prices (≤ 1/s, changed only) of the markets the account holds                                                                                                              | ✅     | T1 · Vitest | `paper.test`. Live ✓.                                                                                                                                                                                                                                 |

### Section 6 — Price parity against Bybit

> **Changed 2026-09-28: the TradingView side-by-side checks are retired** (see "TradingView cross-checks — retired"
> above). This section now compares us with **Bybit itself**. Prices go through the feed parity job (A4, roadmap
> P3), which samples our `/api/market` quotes and 1m candles and Bybit's public v5 REST at the same timestamps.
> Fills and PnL go through the engine tests and the nightly testnet parity run (T4). The old TradingView rows
> 6.1–6.9 are in git history (`git show 8d40f88:docs/TRADING_TEST_PLAN.md`); none of them had been run.

| #   | Scenario                                                 | Expected                                                                                                | Status | Tier    | Notes                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Our Sell / Buy vs Bybit's best bid / ask, same moment    | Spot and linear, each symbol: equal, or at most one tick apart (the stream may be one update ahead)     | ✅     | T4      | `feedParity.ts` nightly (`feed-parity.yml`); within 0.1 % (the reads are up to a second apart, so one tick is too tight for a moving book), bid ≤ ask; first run 2026-09-29 against production: 18 markets × 5 samples and 36 closed candles, all matching.                                                 |
| 6.2 | Our last closed 1m candle vs Bybit's kline               | OHLC equal for spot and linear; no step where history meets the live bars (F1)                          | ✅     | T4      | `feedParity.ts`: every 1m candle production closes during the run has exactly Bybit's OHLC; first run 2026-09-29 against production: 18 markets × 5 samples and 36 closed candles, all matching.                                                                                                            |
| 6.3 | Our mark / index / funding rate vs Bybit's linear ticker | Equal within one tick; next funding time identical                                                      | ✅     | T4      | `feedParity.ts`: mark / index within 0.1 %, funding rate and next funding time equal; first run 2026-09-29 against production: 18 markets × 5 samples and 36 closed candles, all matching.                                                                                                                  |
| 6.4 | Feed freshness over the sample window                    | No quote older than 10 s while Bybit's is moving; the server reconnects within its backoff after a drop | ✅     | T4 + T1 | `feedParity.ts`: every market keeps sending tickers whose values match Bybit (the server's own quote age isn't visible from outside — the engine's 10 s rule is `services.test`); reconnect after a drop: `fakeBybit.test` "a stall stops the pushes; a drop closes the socket and the manager reconnects". |
| 6.5 | Fills, fees, PnL, margin vs Bybit                        | Same maths given the same fills (the testnet parity run)                                                | ✅     | T4      | Was TradingView rows 6.4–6.8. First scheduled nightly green 2026-09-29 (run 36517770455); see 17.6.4.                                                                                                                                                                                                       |
| 6.6 | Browser tab title                                        | `▲ BTC/USDT {price} +x.xx%` or `▼ …`, updating live; the arrow flips on a reversal                      | ⬜     | T3 (P2) | Was 6.9.                                                                                                                                                                                                                                                                                                    |

### Section 17 — Cross margin, risk tiers and refinements (Bybit Parity BP-5) _(part: 17.6 — the rest of Section 17 is in Stages 4 and 5)_

> Reference: `docs/APP_LOG.md` Bybit Parity BP-5 (owner decisions O1–O12). Worked position: long 0.1 BTC at 50,000,
> 10× (IM 500, fee to close 2.475, liq 45,149.0 isolated). Live = the 2026-09-27 API + browser run on the dev
> server (throwaway account, deleted).

#### 17.6 Refinements (F) and parity (G)

| #      | Action                                      | Expected                                              | Status | Tier        | Notes                                                                                                                                           |
| ------ | ------------------------------------------- | ----------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 17.6.1 | Stalled feed at a funding timestamp         | Settled at the mark candle, not a minutes-old mark    | ✅     | T1 · Vitest | `services.test`.                                                                                                                                |
| 17.6.2 | Closed before its funding settled           | The fee lands on that close's Trade row               | ✅     | T1 · Vitest | repository + engine tests.                                                                                                                      |
| 17.6.3 | Opened and closed while the engine was down | Charged by the backfill (from the closing Trade rows) | ✅     | T1 · Vitest | `services.test`.                                                                                                                                |
| 17.6.4 | Bybit testnet parity run                    | Every compared v5 field matches within 0.01           | ✅     | T4          | `parity.yml` nightly: first green by hand 2026-09-28 (run 36427289995), first scheduled green 2026-09-29 (run 36517770455), every step matches. |

### Section 18 — Cross-phase regression suite (Bybit Parity integration audit)

> The bugs found when BP-0 … BP-4 were read together (2026-09-27), plus the BP-5 review fixes that crossed phases.
> Each is pinned by the named test, which failed before its fix. Keep them green; a change here needs a reason.

| #     | Interaction                                                   | Scenario → expected                                                                                                                                                                               | Status | Tier     | Test                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18.1  | Backfill × TP / SL, liquidation, funding (BP-1 × BP-3 / BP-4) | A fill made by the backfill is stamped at its candle, so the gap's later candles still check its TP / SL, liquidation and funding                                                                 | ✅     | T1       | `services.test` "should stamp a backfilled fill at its candle…"                                                                                                                                                                                                     |
| 18.2  | Lease handoff × funding (BP-4)                                | A restart just after a funding timestamp settles it, even if Bybit hadn't listed it at takeover; a timestamp Bybit never lists is skipped                                                         | ✅     | T1       | `services.test` "should settle a timestamp missed across a restart…", "should skip an inferred takeover timestamp…"                                                                                                                                                 |
| 18.3  | Account deletion × funding (BP-4)                             | A deleted account's settlement is dropped, not retried forever (the lease's progress isn't held back)                                                                                             | ✅     | T1       | `services.test` "should drop a deleted account's settlement…"                                                                                                                                                                                                       |
| 18.4  | SL beyond liquidation × backfill (BP-3)                       | A minute crossing both a stop-loss set past the liquidation price and the liquidation price liquidates; it never stops out past bankruptcy                                                        | ✅     | T1       | `liquidation.test` "should liquidate, not stop out…"                                                                                                                                                                                                                |
| 18.5  | Reset × funding (BP-4)                                        | A reset between a timestamp and its settlement: the fresh account is not charged; a reset before it still settles                                                                                 | ✅     | T1       | `funding.test` "should not charge a fresh account…", "should still settle when the last reset was before…"; `services.test` "should load the account's last reset time…"                                                                                            |
| 18.6  | Late funding × closes (BP-4 × BP-5 D / F)                     | A fee settled after closes is split over every close after the timestamp, by quantity                                                                                                             | ✅     | T1       | `services.test` "splits a late funding fee over every close after the timestamp…"                                                                                                                                                                                   |
| 18.7  | All of the above, on a real database                          | Same scenarios through `AccountRepository` and a migrated Postgres                                                                                                                                | ✅     | T2i      | `regression.int.test` "Section 18 regression suite on Postgres [18.7]": [18.1]–[18.6], 8 tests through TradingService → AccountRepository → Postgres and the MatchingEngine on the Prisma lease row; only the market is fake. Found 18.8.                           |
| 18.8  | Two accounts, the same millisecond (P1c)                      | Two users change BTCUSDT leverage, or switch margin mode, in the same millisecond → both are saved (journal / balance ids unique across accounts; were `j-leverage-<symbol>-<ms>`, `j-mode-<ms>`) | ✅     | T1 + T2i | `cross.test` "should give two accounts switching in the same millisecond different journal and balance ids (P1c)", "…changing a symbol’s leverage in the same millisecond different ids (P1c)"; `regression.int.test` [18.3] opens two accounts in one millisecond. |
| 18.9  | DB write failure mid-transaction (was NEW-18-2)               | A close whose last write fails rolls back every write (position, trade, order, balance, version); the client gets only `{ error: 'Internal Server Error' }`; the retry succeeds                   | ✅     | T2i      | `paperRoutes.int.test` "[18.9] rolls every write back, answers a bare 500, and the retry works".                                                                                                                                                                    |
| 18.10 | Lease handoff (was NEW-18-3)                                  | Two engines on one DB: only the holder listens and acts; the other can't take an unexpired lease, then takes it and replays the gap without a second fill or funding charge                       | ✅     | T2i      | `regression.int.test` "[18.10] two engines on one database…".                                                                                                                                                                                                       |

### Section 19 — Account flows (auth and settings) _(rows 19.9–19.12; 19.1–19.8, 19.13–19.19 are in Stage 0)_

> Verified end to end in a real browser and in production on 2026-09-27 (releases #148, #150, #155). The first
> candidates for the T3 smoke set (P2). A wrong password on sign-in, change email / password or delete account logs
> one 401 in the browser console — deliberate (a failed login is never answered with a 2xx).

| #     | Flow                      | Expected                                                                                                                                             | Status | Tier | Test / notes                                                             |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ------------------------------------------------------------------------ |
| 19.9  | Rate limits per visitor   | Limits key on the visitor's IP (`Fly-Client-IP` from Fly's proxy only), not Fly's proxy address                                                      | ✅     | T1   | `clientIp.test`; prod ✓ (real IPs in `fly logs`, forged header ignored). |
| 19.10 | WebSocket connection logs | Connect / close lines carry `reqId`, `clientIp`, `userId` (private WS), close code, reason and duration                                              | ✅     | T1   | `wsLogging.test`; prod ✓.                                                |
| 19.11 | Two tabs refresh at once  | One rotation: one 200 with a new cookie, the other 401; one live token row; the new session keeps working, the old token never does; nothing revoked | ✅     | T2i  | `authRoutes.int.test` "[19.11] rotates the token once…".                 |
| 19.12 | Log out twice at once     | Both 204 (`deleteMany`, no P2025); the token row is gone and refreshes with it are refused                                                           | ✅     | T2i  | `authRoutes.int.test` "[19.12] both succeed (deleteMany, no P2025)…".    |
