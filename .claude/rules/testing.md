---
paths:
  - '**/__tests__/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*.spec.ts'
  - '**/vitest.config.ts'
  - 'apps/client/src/guide/**'
---

# Testing Conventions (Senior Test Manager)

Scope: both packages' Vitest suites (`apps/server`, `apps/client`). Goal: every change is provably
correct without depending on real infrastructure, and the suite stays fast and deterministic.

## Test philosophy

- Every new feature or bug fix ships with at least one test case in the same commit — a fix
  without a regression test is not considered done.
- New route handlers get a happy-path test **and** at least one error/edge-case test.
- New store actions (`paperStore`, `paneStore`, `layoutStore`) get unit tests that verify the
  resulting state transition, not just that the action "runs."
- Complex business logic inside a hook is extracted into a pure function and tested independently
  of React. Hooks are expensive to set up in isolation; a pure helper (e.g. `checkTPSL`) needs no
  React/store scaffolding to test. See [`react.md`](./react.md#hooks--effects).
- Tests never depend on a real database, a real external API, or a real network call. Prisma and
  any outbound service (e.g. `EmailService`) are always mocked. **One exception:** integration
  tests named `*.int.test.ts` (server, `src/__tests__/int/`) run on a real Postgres through
  `pnpm --filter @crypto-dashboard/server test:int` (`vitest.int.config.ts`, the "Integration
  tests (Postgres)" step of the single CI job). `pnpm test` and the pre-commit hook exclude them, so they still need
  no database. They use a throwaway database whose name ends in `_int` / `_test`, migrated with
  `prisma migrate deploy` (never a reset), and each file clears its own rows. The migration replay
  creates and drops a second throwaway database beside it (`…_replay_int`), never any other.
- New tests import from `src/`, never from `dist/` or `generated/`.
- `pnpm test` must pass for the whole suite (server + client), with no skipped tests, before a
  change is considered mergeable.
- **Property tests (T1p)** — `apps/server/src/trading/engine/__tests__/invariants.prop.test.ts`, fast-check. They run
  in `pnpm test` with 200 runs and a fixed seed, so a PR's result never depends on luck; `engine-depth.yml` runs
  5,000 with a fresh seed weekly. A failure prints its seed and the shrunk action list: reproduce with
  `FC_SEED=<seed> FC_NUM_RUNS=5000 pnpm --filter @crypto-dashboard/server test:props`, then pin it as a named T1
  test. A new engine action gets its generator in the same change.
- **Mutation testing** — `pnpm --filter @crypto-dashboard/server test:mutation` (Stryker, `src/trading/engine`,
  ~8 minutes locally). The floor is `thresholds.break` in `apps/server/stryker.config.json`: raised as the score
  rises, never lowered.

## Naming & structure

- Test descriptions follow `describe('route/function name')` → `it('should <action> when <condition>')`.
- `beforeEach`/teardown resets shared state via the subject's own `reset()` action rather than a
  partial `setState({...})` — a partial reset silently leaves newer fields at a stale value from a
  prior test, which shows up later as a flaky, hard-to-explain assertion failure.

## Server tests (`apps/server`, Vitest, `environment: 'node'`)

- Env vars are injected directly in `vitest.config.ts` (`NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`,
  etc.) **before** any test module loads, so `config.ts` never calls `process.exit(1)` for a
  missing var during a test run.
- Prisma is mocked at the plugin boundary, not per-query:

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

  The `Symbol.for('skip-override')` marker is required so the decoration is visible across plugin
  scopes — a plain mock without it silently fails to override in some route registration orders.

- Individual Prisma method mocks default to `mockResolvedValue({ count: 1 })` (or the relevant
  shape) and override per-test with `mockResolvedValueOnce` — this avoids cross-test pollution from
  a shared default that a later test forgets to reset.
- Exercise routes by injecting into the built app, not by starting a real HTTP listener:
  `app.inject({ method: 'GET', url: '...' })`.
- Coverage: `pnpm test:coverage` uses the v8 provider, includes `src/**/*.ts`, excludes
  `src/index.ts`, `src/**/__tests__/**` and the command-line tools' entry points (`src/tools/*.ts`,
  `src/tools/fakeBybit/main.ts`; the fake feed's logic stays counted), and fails below the `coverage.thresholds` floors in each
  package's `vitest.config.ts` (raised as tests land, never lowered). The pre-commit hook and CI both
  run it.

## Client tests (`apps/client`, Vitest, `environment: 'jsdom'`)

- Store tests manipulate state directly rather than rendering a component tree just to trigger an
  action:

  ```ts
  useLayoutStore.setState({ layout: '4' });
  useLayoutStore.getState().setActivePane(2);
  expect(useLayoutStore.getState().activePane).toBe(2);
  ```

- Where a store action depends on cross-store or async behavior, prefer extracting that logic into
  a pure function first (see philosophy above) and unit-test the pure function directly.

## End-to-end tests and the catalogue

`apps/e2e` (Playwright) runs the app on the fake Bybit feed with the test hooks — layout, projects and tags in
`docs/TRADING_TEST_PLAN.md` A4, the hooks and the fake feed in A5.

- **Case IDs.** A test that implements a Part B row of `docs/TRADING_TEST_PLAN.md` carries its ID in square brackets
  in the title (`[14.6.1]`); `case-coverage` (see Gates) reads them.
- **Keeping the statuses true.** The commit that lands a test updates its row: Status ✅, Tier without the `(Pn)`
  tag, Notes = the file and the test name; it ticks the A10 item once all its rows are done. A new case gets the
  next free number in its section. The manual (M) checks in `docs/UI_REPRODUCTIONS.md` are re-run on a release that
  touches their files and dated in the row's notes.
- **Anchors** (`apps/client/src/lib/guideAnchors.ts`). Tests, the manual reproductions and the guided tour find a
  control by `data-guide="<area>.<control>[.<variant>]"`, set only through `guide()` — never `data-testid`, text or
  CSS for new work. The name says what the control means to the user, never how it looks; it goes on the element
  the user clicks or reads, not a wrapper. Row anchors are static; the identity goes in `data-guide-key`
  (`positions.row` + `linear:BTCUSDT`). No user data in an anchor: they ship to production. A rename breaks tours:
  add the new name, migrate, then remove. `guideAnchors.test` checks the names are unique and well formed.
- **Scenario steps** (`apps/client/src/guide/scenario.ts`, `steps.ts`, `scenarios/`). One definition — anchor,
  action, `expect`, `explain`, `liveNote`, `testOnly` — drives the Playwright test (`apps/e2e/steps/runScenario.ts`),
  is written out in `docs/UI_REPRODUCTIONS.md` and becomes the guided tour. Pure data, no React or Playwright
  import; `scenarios.test` checks every anchor is registered and every cited case ID exists.
- **Flaky tests.** One retry in CI; a test that passes only on retry is a defect (S3), fixed rather than retried
  again (`TRADING_TEST_PLAN.md` A7).

## Gates — what "passing" means before a commit/PR

Pre-commit hook (`.husky/pre-commit`), in order: `audit` → `type-check` (server + client + e2e) →
`test:coverage` + `test:hooks` + `test:scripts` → `case-coverage --strict` → `lint-staged` → `lint`.
`case-coverage --strict` (`scripts/caseCoverage.mjs`) fails when a test title's `[x.y.z]` cites no
row of `docs/TRADING_TEST_PLAN.md`, or a ⬜ row has a test: flip the row in the same commit. CI (`ci.yml`) additionally runs
`format:check`, `build` and the Postgres integration job (`test:int`, CI only — it needs a database).
A change is not ready to push until all of these are green locally — don't rely on CI to catch a
gate that `pnpm test`/`pnpm lint`/`pnpm type-check` would have caught first.

| Command                                             | What it verifies                                               |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm run audit`                                    | No high/critical CVEs in dependencies                          |
| `pnpm --filter @crypto-dashboard/server type-check` | Server TS compiles clean, plus the SDK-typed contract fixtures |
| `pnpm --filter @crypto-dashboard/client type-check` | Client TS compiles clean (`tsconfig.app.json`)                 |
| `pnpm test:coverage`                                | The Vitest suites, no skips, above the coverage floors         |
| `pnpm format:check`                                 | Prettier formatting is consistent                              |
| `pnpm lint`                                         | ESLint (flat config), zero errors across all packages          |

## Cross-references

- Full pre-commit/proactive-audit checklist (P6 = Tests, plus every priority's test implications)
  → `.claude/skills/bug-sweep`
- Trading-domain test scenarios (TP/SL, commission math, journal behavior) →
  `docs/TRADING_TEST_PLAN.md` and `.claude/skills/paper-trading-logic`
- Process rule that gates all of the above: no test (or any code) gets written speculatively —
  work happens only against an explicit instruction → `.claude/skills/session-bootstrap`
