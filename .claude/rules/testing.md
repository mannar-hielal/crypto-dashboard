---
paths:
  - '**/__tests__/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/vitest.config.ts'
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
  any outbound service (e.g. `EmailService`) are always mocked.
- New tests import from `src/`, never from `dist/` or `generated/`.
- `pnpm test` must pass for the whole suite (server + client), with no skipped tests, before a
  change is considered mergeable.

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
  `src/index.ts` and `src/**/__tests__/**`.

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

## Gates — what "passing" means before a commit/PR

Pre-commit hook (`.husky/pre-commit`), in order: `audit` → `type-check` (server + client) →
`test` → `lint-staged` → `lint`. CI (`ci.yml`) additionally runs `format:check` and `build`.
A change is not ready to push until all of these are green locally — don't rely on CI to catch a
gate that `pnpm test`/`pnpm lint`/`pnpm type-check` would have caught first.

| Command                                             | What it verifies                                      |
| --------------------------------------------------- | ----------------------------------------------------- |
| `pnpm run audit`                                    | No high/critical CVEs in dependencies                 |
| `pnpm --filter @crypto-dashboard/server type-check` | Server TS compiles clean                              |
| `pnpm --filter @crypto-dashboard/client type-check` | Client TS compiles clean (`tsconfig.app.json`)        |
| `pnpm test`                                         | Server + client Vitest suites, no skips               |
| `pnpm format:check`                                 | Prettier formatting is consistent                     |
| `pnpm lint`                                         | ESLint (flat config), zero errors across all packages |

## Cross-references

- Full pre-commit/proactive-audit checklist (P6 = Tests, plus every priority's test implications)
  → `.claude/skills/bug-sweep`
- Trading-domain test scenarios (TP/SL, commission math, journal behavior) →
  `docs/TRADING_TEST_PLAN.md` and `.claude/skills/paper-trading-logic`
- Process rule that gates all of the above: no test (or any code) gets written speculatively —
  work happens only against an explicit instruction → `.claude/skills/session-bootstrap`
