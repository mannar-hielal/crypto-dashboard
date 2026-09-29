# Trading — Test Implementation Plan

> **Owner:** Mannar Hielal · **Written:** 2026-09-28 · **Companion to:** `docs/TRADING_TEST_PLAN.md`
>
> `TRADING_TEST_PLAN.md` says **what** to test and where each case stands (Part A strategy, Part B case catalogue,
> A10 to-do). This file says **how** each case gets implemented, which scenario it belongs to, and **how to
> reproduce it by hand in the app** — the same steps that later drive the guided-trade bubbles.

## How to use this file

- Part B of the test plan is followed in its own order: Stage 0 → Stage 6, section by section. Every case ID
  (`14.6.1`, `17.6.4` …) is assigned to exactly one scenario below (`SC-…`), including the ✅ ones ("no action —
  covered by …").
- Scenarios the catalogue doesn't have yet are proposed as `NEW-<section>-<n>`. Add them to Part B when they are
  built, with the next free case number.
- Every section ends with a **UI reproduction** in the shared scenario-step shape (Foundations §F5) and a one-line
  **guided-trade** verdict.
- Status legend (same as Part B): ⬜ not run · ✅ pass · ❌ fail · ⚠️ partial · ⏳ blocked · ➖ superseded / retired.
  Tiers: T1 Vitest engine / lib · T1p fast-check · T2 RTL · T2i real Postgres · T3 Playwright · T4 Bybit testnet
  parity · T5 prod smoke · M manual. Roadmap steps P1–P6 are A8's.
- When a test lands, update the catalogue row (Status, Tier without the `(Pn)` tag, Notes = test file + test name),
  tick the A10 item, and mark the scenario here ✅ (Rollout §R4).

**Conventions used in the UI steps**

- Start URLs: local dev `http://localhost:5173/…` (server on `:3001`) or production `https://cryptopapertrade.com/…`.
  Exact numbers need the local fake feed (§F3); on live prices each step gives the formula or the tolerance.
- `feed quote spot BTCUSDT bid=49999.9 ask=50000` is shorthand for the fake feed's control call (§F3,
  `pnpm feed …`). Steps that use it are marked **(fake feed)** and are skipped by the guided tour.
- A step reads: `n. [anchor] action → Expect …` followed by _explain_ (the learner bubble text).
- Worked numbers with a third decimal (94.445, 505.225) show rounded by the display formatter, so they are written
  "≈". Tests assert the exact Decimal from `GET /api/paper/state` and the screen with a one-cent tolerance.
- "Isolated 10×" as a precondition: open the leverage chip (`Cross 10x ▾` / `Isolated 10x ▾`) → **Isolated** tab →
  leverage 10 → **Confirm**. New accounts start in **Cross** (BP-5); every worked number of Sections 1–4, 14 and 15
  assumes Isolated.

---

# Part 1 — Foundations (build once, used everywhere)

| #   | Foundation                                  | Effort | Roadmap | Unblocks                                        |
| --- | ------------------------------------------- | ------ | ------- | ----------------------------------------------- |
| F1  | UI anchors (`data-guide`) + typed registry  | S      | P2      | every T3 test, the guided tour                  |
| F2  | Test data & isolation (test hooks, seeding) | M      | P2      | every T3 test; T2i route tests                  |
| F3  | Deterministic market feed (fake Bybit)      | L      | P2      | exact numbers in T3; resilience; local repro    |
| F4  | Playwright setup and CI jobs                | M      | P2      | T3, T5                                          |
| F5  | Scenario-step format + step library         | M      | P2      | T3 tests, the UI reproductions, the guided tour |
| F6  | CI Postgres (T2i)                           | M      | P1      | 18.7, migration replay, repository round-trip   |
| F7  | fast-check properties (T1p)                 | M      | P4      | wallet conservation, determinism                |
| F8  | Stryker mutation testing                    | S      | P4      | engine assertion quality                        |
| F9  | SDK ↔ server contract test                  | S      | P1      | `web.md` "SDK change is never backend-only"     |
| F10 | Visual regression ✅ (M5e, local)           | M      | P2      | Section 5, look of modals / panels              |
| F11 | axe accessibility ✅ (M5a auth, M5e dash)   | S      | P2      | auth, settings, dashboard                       |
| F12 | Case-ID coverage report ✅ (gate)           | S      | P1      | keeps this file and Part B honest               |

## F1. UI anchors — `data-guide`

**Decision.** One attribute, `data-guide="<area>.<control>[.<variant>]"`, on every user-facing control a test or a
tour needs. Names are dot-namespaced, lower-kebab inside a segment, and describe **what the control means to the
user**, never how it looks: `trade.side.buy`, `trade.type.limit`, `trade.submit`, `positions.row.close`.

**Why not `data-testid`.**

| Criterion          | `data-testid` (13 files today)                | `data-guide`                                                                         |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Audience           | tests only; often stripped from prod builds   | tests **and** the guided tour, so it must ship to production                         |
| Naming             | ad hoc (`sl-confirm-modal`, `closed-pnl-row`) | a product vocabulary: area → control → variant                                       |
| Drift              | a typo only fails the one test                | typed registry: an unknown anchor is a type error in the app, the tests and the tour |
| Row-level elements | one id per row, or string-built ids           | static name + `data-guide-key` (`positions.row` + `linear:BTCUSDT`)                  |

The 16 existing `data-testid`s stay (RTL tests use them); new work uses `data-guide`, and a `data-testid` is moved
to `data-guide` only when its component is touched anyway. RTL tests may use anchors too
(`container.querySelector('[data-guide="trade.submit"]')` or a `getByGuide` helper in `src/test/`).

**Registry** — `apps/client/src/lib/guideAnchors.ts`:

```ts
// ─── Guide anchors ──────────────────────────────
// One name per user-facing control. Used by Playwright (e2e), RTL tests and the guided tour.
// Renaming an anchor is a breaking change for tours: add the new name, migrate, then remove.
export const GUIDE_ANCHORS = [
  'trade.market.spot',
  'trade.market.perp',
  'trade.side.sell',
  'trade.side.buy',
  'trade.submit',
  // …the full list below
] as const;

export type GuideAnchor = (typeof GUIDE_ANCHORS)[number];

/** Spread onto an element: <button {...guide('trade.submit')}> or guide('positions.row', 'linear:BTCUSDT') */
export function guide(anchor: GuideAnchor, key?: string) {
  return key === undefined
    ? { 'data-guide': anchor }
    : { 'data-guide': anchor, 'data-guide-key': key };
}
```

**Rules**

1. One anchor per user-facing control; the anchor goes on the element a user clicks or reads (the `<button>`, the
   `<input>`, the value `<span>`), not on a wrapper `div`.
2. Never derived from styling, layout position or text (`trade.side.buy`, not `green-button-right`).
3. Row anchors are static; the identity goes in `data-guide-key` (`positions.row` key `linear:BTCUSDT`,
   `assets.row` key `BTC`, `orders.row` key = order id, `pane` key = pane index).
4. Always through `guide()` — a raw `data-guide="…"` string is flagged in review; a check script
   (`apps/client/scripts/checkGuideAnchors.ts`, run in `pnpm lint`) fails on a registry entry no component uses.
5. Anchors carry no user data (no email, no balance) — they ship to production.
6. Playwright gets a custom selector engine (`guide=trade.submit`, `guide=positions.row@linear:BTCUSDT`), see F4.

**Starter list for Stages 0–3** (165 anchors; components named where they live today)

| Area (component)                                                                                                         | Anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth pages (`RegisterPage`, `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `UnverifiedPage`) | `auth.register.username`, `.email`, `.password`, `.submit`, `.field-error`; `auth.login.email`, `.password`, `.submit`, `.error`, `.forgot-link`; `auth.forgot.email`, `.submit`, `.message`; `auth.reset.password`, `.submit`; `auth.verify.status`; `auth.unverified.resend`, `.sign-out`                                                                                                                                                                                                                                                                                                                                                            |
| User menu + settings (`TopBar`, `SettingsModal`)                                                                         | `nav.user-menu`, `nav.settings`, `nav.sign-out`; `settings.username.input`, `.save`; `settings.email.input`, `.save`; `settings.password.current`, `.new`, `.save`; `settings.export`; `settings.delete`, `settings.delete.confirm`, `settings.delete.cancel`; `settings.close`                                                                                                                                                                                                                                                                                                                                                                        |
| Trade menu (`TradeMenu`)                                                                                                 | `nav.trade-menu`, `nav.trade-menu.option` (key `spot` / `linear`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Symbol bar (`SymbolBar`, `ChartLayoutPicker`, `ChartTypeDropdown`)                                                       | `symbolbar.symbol-picker`, `symbolbar.symbol-option` (key `BTCUSDT`), `symbolbar.trade-toggle`, `symbolbar.funding`, `symbolbar.mark`, `symbolbar.index`; `layout.picker`, `layout.option` (key `1` `2h` `2v` `3h` `4`), `layout.sync` (key `symbol` `interval` `crosshair` `timeRange`); `chart.type-menu`, `chart.mark-line`                                                                                                                                                                                                                                                                                                                         |
| Panes (`MultiChartArea`, `PaneHeader`, `ChartPanel`)                                                                     | `pane` (key index), `pane.header.symbol`, `pane.header.symbol-option` (key `BTCUSDT`), `pane.header.interval-picker`, `pane.header.interval` (key `1m` …), `pane.header.price`, `pane.header.change`, `pane.header.dot`, `pane.chart`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Order form (`TradingPanel`, `LeverageChip`, `OrderFlags`)                                                                | `trade.market.spot`, `trade.market.perp`, `trade.leverage-chip`, `trade.side.sell`, `trade.side.buy`, `trade.spread`, `trade.type.market`, `.limit`, `.stop`, `trade.price`, `trade.amount`, `trade.amount-unit` (key `coin` / `usdt`), `trade.size-step` (key `25` … `100`), `trade.exits.toggle`, `trade.tp.enable`, `trade.tp.price`, `trade.tp.source`, `trade.sl.enable`, `trade.sl.price`, `trade.sl.source`, `trade.reduce-only`, `trade.close-on-trigger`, `trade.preview.cost`, `trade.preview.fees`, `trade.preview.liq`, `trade.warning`, `trade.error`, `trade.submit`, `trade.sl-confirm`, `trade.sl-confirm.anyway`, `trade.close-panel` |
| Leverage modal (`LeverageChip`)                                                                                          | `leverage.mode` (key `cross` / `isolated`), `leverage.input`, `leverage.preview`, `leverage.tier-info`, `leverage.error`, `leverage.confirm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Account panel header (`OrderAccountManagementPanel`)                                                                     | `account.tab` (key `positions` `assets` `closedpnl` `orders` `orderhistory` `balancehistory` `journal`), `account.tab.badge`, `account.summary.balance`, `.equity`, `.upnl`, `.mm-rate`, `account.sound`, `account.settings`, `account.collapse`, `account.maximize`, `account.columns`                                                                                                                                                                                                                                                                                                                                                                |
| Account Settings modal (in `OrderAccountManagementPanel`)                                                                | `acct-settings.modal`, `.name`, `.fees`, `.reset`, `.done`, `.close`, `.backdrop`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Positions / Assets / Closed P&L                                                                                          | `positions.row` (key), `positions.row.pnl`, `.mark`, `.liq`, `.tp`, `.sl`, `.funding`, `.edit-exits`, `.adjust-margin`, `.close`; `assets.row` (key coin), `assets.row.free`, `.locked`, `.avg-cost`, `.upnl`, `.sell`, `.tpsl`; `closed-pnl.row`, `closed-pnl.value`, `closed-pnl.exit-type`                                                                                                                                                                                                                                                                                                                                                          |
| Orders / Order History / Balance History / Journal                                                                       | `orders.subtab` (key `all` `working` `inactive` `filled` `cancelled` `rejected`), `orders.subtab.count`, `orders.row` (key id), `orders.row.status`, `.cancel`, `.edit`; `order-history.row`, `order-history.row.type`, `.status`, `.fill-price`, `.commission`; `balance-history.row`; `journal.entry`, `journal.entry.pnl`, `journal.add-note`, `journal.note-input`                                                                                                                                                                                                                                                                                 |
| Dialogs (`PositionEditPanel`, `PendingOrderEditPanel`, `AdjustMarginDialog`, `SpotExitsModal`)                           | `pos-edit.tp`, `pos-edit.sl`, `pos-edit.warning`, `pos-edit.confirm`; `order-edit.price`, `order-edit.qty`, `order-edit.confirm`; `margin.mode` (key `add` / `reduce`), `margin.amount`, `margin.max`, `margin.preview`, `margin.confirm`; `spot-exits.qty`, `spot-exits.tp`, `spot-exits.sl`, `spot-exits.confirm`                                                                                                                                                                                                                                                                                                                                    |
| Notices (`CrossMarginNotice`, `LiquidationNotices`)                                                                      | `notice.cross-margin`, `notice.cross-margin.switch`, `notice.liquidation-intro`, `notice.liquidation`, `notice.dismiss`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Status (2026-09-28):** the registry (167 names — the starter list above, plus `pane.header.symbol-option` and
`pane.header.interval-picker` added by M1), `guide()`, `guideSelector()` and the RTL
helper `src/test/guide.ts` are in (step 3 of the agreed sequence). The attributes are added as M1 touches each
component, and the check script (rule 4) switches on once components use the anchors — with no uses yet it would
flag every entry.

Effort **S**: the registry, the helper, the check script and ~165 attribute additions spread over 20 components;
no behaviour change (a UI change only in the DOM, so no visual Q&A gate is needed — state that in the PR).

## F2. Test data and isolation

- **Per-test users.** Each T3 test signs up its own user with a unique email (`e2e+<worker>-<uuid>@test.local`), so
  tests run in parallel with no shared state. Nothing reuses a user across tests.
- **Test hooks plugin** — `apps/server/src/plugins/testHooks.ts`, registered **only** when `config.testHooks` is
  true. 🔐 Guards, all four required:
  1. `ENABLE_TEST_HOOKS=1` in the environment;
  2. `config.ts` exits at boot if `ENABLE_TEST_HOOKS` is set and `nodeEnv === 'production'` (fail closed, like the
     `CLIENT_URL` check);
  3. `app.ts` doesn't register the plugin at all otherwise — the routes don't exist (404), not "exist and refuse";
  4. every request carries `x-test-hooks-secret` equal to `TEST_HOOKS_SECRET` (compared in constant time), so a
     dev server left on a shared network isn't a free account factory.
- **Endpoints** (prefix `/api/test`, JSON Schema with `additionalProperties: false` like every route):

  | Route                             | Body / query                                                                                          | Does                                                                                                             |
  | --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `POST /api/test/users`            | `{ verified?: true, marginMode?: 'ISOLATED_MARGIN' \| 'REGULAR_MARGIN', leverage?: { BTCUSDT: 10 } }` | Creates a verified user through the same service code as `/register` + `/verify-email`; returns email + password |
  | `GET /api/test/outbox?to=<email>` | —                                                                                                     | Last emails "sent" to that address (in-memory ring, cap 100) — for 19.2, 19.5, 19.6 link flows                   |
  | `POST /api/test/users/:id/reset`  | —                                                                                                     | Same as `POST /api/paper/account/reset`, without a session (for `beforeEach`)                                    |

  `EmailService` gets an outbox sink used only when test hooks are on; in every other mode it keeps its
  `📧 [DEV] … (no RESEND_API_KEY set)` log line and never logs the token-bearing URL.

- **Account reset.** A test that needs a clean account in the middle calls `POST /api/paper/account/reset` (the real
  endpoint); the UI reset (8.8) is tested once, not used as setup.
- **Deterministic prices** come from F3; **deterministic time** from Playwright's `page.clock` on the client
  (bench TTL 2 min, 3 s reset confirm, 20-min token refresh). The server keeps the real clock; timestamps that matter
  (funding) are set by the fake feed relative to "now".
- **Clean-up.** CI Postgres is thrown away per job. Locally, users under `@test.local` are deleted by
  `pnpm --filter server test:e2e:clean`.

Effort **M** (plugin, outbox sink, config guard + its unit test, `.env.example` entries commented as test-only).

**Status.** ✅ M3a:

- **Routes.** `apps/server/src/routes/test/index.ts` (the three routes; users are created through the real
  `/register` and `/verify-email` handlers via `app.inject`).
- **Outbox.** `services/emailOutbox.ts` (ring of 100, a no-op unless the hooks are on).
- **Guards.** The four guards; `configGuards.test` covers the production refusal of every test-only variable.
- **Tests.** `testHooksOff.test` (404 when off); `testHooks.int.test` (seeded user signs in, unverified user's link in
  the outbox, margin mode and leverage applied, reset, 401 without the secret).
- **Deviation.** An unknown symbol in `leverage` is dropped, not refused: Fastify strips undeclared properties
  (`removeAdditional`), as on every route.
- **Not built yet.** `test:e2e:clean` comes with Playwright (M4).

## F3. Deterministic market feed — the fake Bybit server

- **Where.** `apps/server/src/test/fakeBybit.ts` (a Fastify app with `@fastify/websocket`, already dependencies),
  started by `pnpm --filter server fake-bybit` on `:4010`.
- **What it serves.** The exact Bybit v5 shapes the app reads:
  - REST: `/v5/market/kline`, `/v5/market/mark-price-kline`, `/v5/market/instruments-info`,
    `/v5/market/risk-limit`, `/v5/market/funding/history`, `/v5/market/tickers`, `/v5/market/orderbook`;
  - WS: `/v5/public/spot` and `/v5/public/linear`, answering `subscribe` ops and pushing `tickers.<S>`,
    `orderbook.1.<S>` and `kline.<i>.<S>`, with `ping`/`pong`.
- **Fixtures.** `apps/server/src/test/fixtures/bybit/` — instruments, risk-limit tiers, kline history (500 bars per
  symbol / interval the tests use) and a 5-minute recorded WS stream (JSONL). Recorded by
  `apps/server/src/tools/recordBybitFixtures.ts` against mainnet public endpoints (no key needed); re-recorded when
  the spec-drift check (P3) reports a change. Fixture files carry their recording date; a test warns when they are
  older than 180 days.
- **Price control** (`/__control/*`, only on the fake server, which never runs in production):

  | Call                                                                       | Effect                                                                                                                 |
  | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | `POST /__control/quote {category, symbol, bid, ask, last?, mark?, index?}` | Sets the book and prices, pushes one update and **re-sends it every second** so the engine's 10 s freshness rule holds |
  | `POST /__control/path {category, symbol, points: [price…], stepMs}`        | Walks the price through the points (cross a TP, reach a liquidation price)                                             |
  | `POST /__control/funding {symbol, rate, inSeconds}`                        | Sets `fundingRate` / `nextFundingTime` on the ticker and the matching funding-history row                              |
  | `POST /__control/drop {category}` · `POST /__control/stall {category, ms}` | Closes every socket · stops pushing (resilience, stale quote)                                                          |
  | `POST /__control/replay {file, speed}` · `POST /__control/reset`           | Replays a recorded stream · back to the fixture defaults                                                               |

  `apps/server/src/tools/feedCtl.ts` wraps them as `pnpm feed quote spot BTCUSDT bid=49999.9 ask=50000`, so a person
  reproducing a case locally uses the same controls as the tests.

- **How the server points at it.** Two optional env vars read in `config.ts`: `BYBIT_REST_URL` (used by the one seam
  `bybitRestBaseUrl()` in `BybitMarketInfo.ts`, which `infra.ts` and `routes/market` already call) and
  `BYBIT_WS_URL` (used in `BybitWebSocketManager.ts:60–61` in place of the hard-coded `wss://stream…bybit.com`
  hosts). 🔐 Both are validated with `new URL(...)`, and `config.ts` exits if either is set while
  `nodeEnv === 'production'`. They are not `criticalVars`; `.env.example` lists them commented, marked test-only.
  **Status:** ✅ the seam and its guards (M3a); the fake server itself is M3b.
- **Local reproduction.** `pnpm dev:e2e` (root script) starts the fake feed, the server with the overrides and
  `ENABLE_TEST_HOOKS`, and Vite — the "local dev (fake feed)" environment every UI step below refers to.

Effort **L** (server + fixtures + recorder + control CLI + config seam + tests of the fake itself against the
recorded shapes).

**Status.** ✅ M3b:

- **Where it lives.** `apps/server/src/tools/fakeBybit/`: `feed.ts` holds the state and message builders, `server.ts`
  serves REST, WS and `/__control/*`, `main.ts` starts it on 127.0.0.1.
- **Fixtures.** `pnpm record:bybit` records them (`tools/recordBybitFixtures.ts` → `fixtures/bybit/recorded.json`,
  123 KB).
- **Commands.** `pnpm feed …` (`tools/feedCtl.ts`); `pnpm dev:e2e` (`scripts/devE2e.mjs`).
- **Tests.** `fakeBybit.test.ts` (9) checks it against the app's own clients (the WS manager, market info, the
  engine's backfill reads, `/api/market/candles`) and against the recorded shapes.
- **Deviations from the plan:**
  - Kline history is generated, not recorded: a deterministic walk that ends at the current price, per interval. It
    has Bybit's row shape, and 500 bars × 7 intervals × 18 markets would be megabytes of fixtures.
  - A `klines` control puts chosen candles in a gap (13.2.4, 18.x). There is no `replay` control, because no
    scenario uses one, so no multi-megabyte WS recording is kept.
  - One WS message of each topic is recorded, for the shape test.

## F4. Playwright setup

- **Package.** A new workspace package `apps/e2e` (`@crypto-dashboard/e2e`): `@playwright/test`,
  `@axe-core/playwright`; `playwright.config.ts`; `tests/**/*.spec.ts`; `fixtures.ts`; `steps/`. Imports scenarios
  from `apps/client/src/guide/scenarios` through a tsconfig path `@guide/*`. Browsers are installed in CI with
  `pnpm exec playwright install --with-deps chromium webkit`; Playwright downloads browsers itself — no pnpm install
  script, so `.npmrc`'s `only-built-dependencies` is unchanged.
- **Projects.**

  | Project    | Device                                 | Runs                                                  |
  | ---------- | -------------------------------------- | ----------------------------------------------------- |
  | `chromium` | Desktop Chrome 1440×900                | `@smoke` on every PR; `@smoke` + `@full` nightly      |
  | `webkit`   | Desktop Safari 1440×900                | nightly                                               |
  | `mobile`   | iPhone 14 (WebKit), Pixel 7            | nightly: `@smoke` + scenarios tagged `@mobile`        |
  | `prod`     | Desktop Chrome, `baseURL` = production | `@prod` only: post-deploy + every 6 h (T5, read-only) |

- **Tags.** `@smoke` (< 3 min total: auth, Spot buy → Assets, perp open → close → Closed P&L), `@full` (the rest),
  `@prod` (read-only checks), `@mobile`, `@visual`, `@a11y`, `@quarantine`.
- **`webServer`.** Three entries: fake Bybit (`:4010`), server (`:3001`, `DATABASE_URL` = the CI Postgres,
  `BYBIT_REST_URL` / `BYBIT_WS_URL` → the fake, `ENABLE_TEST_HOOKS=1`), client (`vite preview` of a production build
  on `:5173` in CI, so CSP and the PWA shell are the real ones; `vite` dev locally). `reuseExistingServer` locally.
- **Selector engine.** `selectors.register('guide', …)` so `page.locator('guide=trade.submit')` and
  `guide=positions.row@linear:BTCUSDT` resolve `[data-guide][data-guide-key]`.
- **Fixtures.** `seededUser` (F2), `feed` (control client for F3), `signedInPage` (logs in through the UI once per
  test via `auth.login.*` and waits for `/api/paper/state`).
- **Failure evidence.** `trace: 'on-first-retry'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`;
  HTML report + traces uploaded as CI artifacts (14 days).
- **Retries and flakes.** `retries: 1` in CI, 0 locally. A test that passes only on retry is reported as flaky in the
  job summary and gets an issue (S3, A7). Quarantine = tag `@quarantine` + the issue link in the title; the PR job
  excludes `@quarantine`, the nightly runs it and reports it separately; a quarantined test older than 14 days is
  fixed or deleted.
- **CI layout.**
  - `ci.yml`, the smoke steps of its single job (PRs to `develop` / `main`): Postgres service → build → `playwright test --project=chromium
--grep @smoke --grep-invert @quarantine`. Target < 6 min wall time.
  - `e2e-nightly.yml` ("E2E full set": nightly, 02:30 UTC on `develop`; on every push to the release PR to `main`; and `workflow_dispatch`): all projects, `@smoke|@full`, then
    `@visual`, `@a11y`; opens / comments one issue labelled `e2e` on failure, like `parity.yml` does.
  - `deploy.yml`: after `flyctl deploy`, `playwright test --project=prod --grep @prod`; a failure marks the deploy red.

Effort **M**.

**Status.** ✅ M4, first cut:

- **Package.** `apps/e2e`, with `playwright.config.ts`, `env.ts`, `fixtures.ts` (`seededUser`, `feed`, `hooks`, and
  a `page` with the cookie notice pre-dismissed, since its overlay covers the order form), `steps/runScenario.ts`,
  and `scripts/startServer.mjs`. The launcher creates and migrates the throwaway `…_test` database, then starts the
  server on the fake feed with the hooks.
- **Deviations:**
  - Chromium only: WebKit, `mobile` and `prod` come with M5 / M8.
  - Locators use `guideSelector()` from the client's registry instead of a custom `guide=` selector engine: same
    selectors, typed, no registration step.
  - The client runs on `vite` in CI too; the `vite preview` build is for M5, with the visual baselines.
- **CI.** The single `ci.yml` job runs Postgres 16, installs Chromium, and runs `test:smoke` after the checks and the integration tests. Locally:
  `E2E_DATABASE_URL=… pnpm test:e2e`.

## F5. Scenario steps — one definition for Playwright, the UI reproduction and guided trade

**The shape** — `apps/client/src/guide/scenario.ts` (pure types and data, no Playwright or React import, so the
client can lazy-load scenarios for the tour and `apps/e2e` can import them):

```ts
import type { GuideAnchor } from '@/lib/guideAnchors';

export type StepAction = 'navigate' | 'click' | 'type' | 'select' | 'observe' | 'control';

export type Expectation =
  | { anchor: GuideAnchor; key?: string; text: string | RegExp } // visible text
  | { anchor: GuideAnchor; key?: string; visible: boolean }
  | { anchor: GuideAnchor; key?: string; value: string } // an input's value
  | { anchor: GuideAnchor; key?: string; enabled: boolean }
  | { url: string | RegExp };

export interface ScenarioStep {
  id: string; // 'spot-market-buy.4' — stable, cited in bug reports
  action: StepAction;
  anchor?: GuideAnchor; // the element acted on / the bubble's target (not for navigate / control)
  key?: string; // data-guide-key for row anchors
  value?: string; // text to type, option to pick, URL, or the control command
  expect?: Expectation[]; // asserted by Playwright; shown as "Expect" in the manual steps
  explain: string; // one or two learner-friendly sentences: the bubble text
  liveNote?: string; // how to judge the result on live prices (formula / tolerance)
  testOnly?: boolean; // price-control steps: skipped by the tour, marked "(fake feed)" in the doc
}

export interface Scenario {
  id: string; // 'spot-market-buy'
  title: string; // 'Your first Spot market order' — the tour title
  caseIds: string[]; // ['14.6.1', '14.6.8'] — ties the scenario to Part B
  startUrl: string; // '/dashboard/spot/BTC/USDT'
  preconditions: Precondition[]; // signed in, reset, margin mode, quotes
  steps: ScenarioStep[];
  tags: Array<'@smoke' | '@full' | '@prod' | '@mobile'>;
  tour?: { stage: 0 | 1 | 2 | 3 | 4 | 5; order: number }; // absent = not offered as a tour
}

export type Precondition =
  | { kind: 'signedIn'; marginMode?: 'ISOLATED_MARGIN' | 'REGULAR_MARGIN' }
  | { kind: 'freshAccount' }
  | {
      kind: 'quote';
      category: 'spot' | 'linear';
      symbol: string;
      bid: number;
      ask: number;
      mark?: number;
    };
```

**Status (2026-09-28):** `scenario.ts` (with `defineScenario`, which numbers the steps), `steps.ts` and the first
scenario, `scenarios/spotMarketBuy.ts`, are in, with tests that every anchor is registered and every cited case ID
exists in `TRADING_TEST_PLAN.md`.

**Status (2026-09-29, M4):**

- **Runner.** `runScenario` (apps/e2e) runs them.
- **Scenarios.** `perpMarketLong` is added.
- **Calibrated against the real UI:**
  - the cost preview reads `$5000.00 / $10000.00`, with no thousands separator;
  - the liquidation preview reads `$45,149`;
  - the leverage modal has preset buttons (`leverage.input` keyed by value), so `setIsolated` clicks one.
- **Anchors added in M4.** The TP / SL toggles and prices, the cost / fees / liq preview, the leverage chip and
  modal, the auth forms (+ `auth.register.terms`), the verify page's status (keyed by state), the user menu, and
  the Assets USDT row.

Step builders (`apps/client/src/guide/steps.ts`) keep scenarios short and identical across uses:
`openMarket('spot')`, `chooseSide('buy')`, `chooseType('market')`, `enterAmount('0.1', 'coin')`,
`enableTp('52000')`, `submit()`, `openTab('assets')`, `setIsolated(10)`.

**Worked example — "Spot market buy"** (cases 14.6.1, 14.6.8)

```ts
// apps/client/src/guide/scenarios/spotMarketBuy.ts
export const spotMarketBuy: Scenario = {
  id: 'spot-market-buy',
  title: 'Your first Spot market order',
  caseIds: ['14.6.1', '14.6.8'],
  startUrl: '/dashboard/spot/BTC/USDT',
  preconditions: [
    { kind: 'signedIn' },
    { kind: 'freshAccount' },
    { kind: 'quote', category: 'spot', symbol: 'BTCUSDT', bid: 49_999.9, ask: 50_000 },
  ],
  tags: ['@smoke', '@mobile'],
  tour: { stage: 1, order: 1 },
  steps: [
    {
      id: 'spot-market-buy.1',
      action: 'click',
      anchor: 'trade.market.spot',
      expect: [{ anchor: 'trade.leverage-chip', visible: false }],
      explain: 'Spot means you buy the coin itself. There is no leverage and no shorting.',
    },
    {
      id: 'spot-market-buy.2',
      action: 'observe',
      anchor: 'trade.side.buy',
      expect: [{ anchor: 'trade.side.buy', text: /50,000/ }],
      explain:
        'Buy shows the best ask — the lowest price a seller accepts right now. A market buy fills there.',
      liveNote:
        'On live prices the Buy button shows the current ask; it is one tick above Sell most of the time.',
    },
    {
      id: 'spot-market-buy.3',
      action: 'click',
      anchor: 'trade.type.market',
      explain: 'A market order fills immediately at the best price.',
    },
    {
      id: 'spot-market-buy.4',
      action: 'click',
      anchor: 'trade.amount-unit',
      key: 'coin',
      explain: 'Choose to enter the size in BTC instead of USDT.',
    },
    {
      id: 'spot-market-buy.5',
      action: 'type',
      anchor: 'trade.amount',
      value: '0.1',
      expect: [{ anchor: 'trade.preview.cost', text: /5,000\.00/ }],
      explain: 'Buy 0.1 BTC. The form shows what it costs before you commit.',
      liveNote: 'Cost ≈ 0.1 × the Buy price.',
    },
    {
      id: 'spot-market-buy.6',
      action: 'click',
      anchor: 'trade.submit',
      expect: [{ anchor: 'trade.amount', value: '' }],
      explain: 'Send the order. The amount field clears when it is accepted.',
    },
    {
      id: 'spot-market-buy.7',
      action: 'click',
      anchor: 'account.tab',
      key: 'assets',
      expect: [
        { anchor: 'assets.row.free', key: 'USDT', text: '5,000.00' },
        { anchor: 'assets.row.free', key: 'BTC', text: '0.0999' },
        { anchor: 'assets.row.avg-cost', key: 'BTC', text: '50,050.05' },
      ],
      explain: 'You received 0.0999 BTC: Spot takes its 0.1% fee in the coin you receive.',
      liveNote:
        'BTC received = 0.1 × 0.999; avg cost = USDT spent ÷ BTC received; USDT = 10,000 − 0.1 × ask.',
    },
  ],
};
```

**The Playwright test that consumes it** — `apps/e2e/tests/spot/spotMarketBuy.spec.ts`:

```ts
import { test } from '../../fixtures';
import { runScenario } from '../../steps/runScenario';
import { spotMarketBuy } from '@guide/scenarios/spotMarketBuy';

test(`[14.6.1][14.6.8] ${spotMarketBuy.title} @smoke @mobile`, async ({
  page,
  seededUser,
  feed,
}) => {
  await runScenario(page, spotMarketBuy, { user: seededUser, feed });
});
```

`runScenario` (≈80 lines, `apps/e2e/steps/runScenario.ts`) applies the preconditions (seed user via F2, set quotes via
F3, sign in, `goto(startUrl)`), then maps each step: `click` → `locator('guide=…').click()`; `type` → `fill`;
`select` → `selectOption`; `control` → `feed.run(value)`; `observe` → nothing; then every `expect` →
`toHaveText` / `toBeVisible` / `toHaveValue` / `toBeEnabled` / `toHaveURL` with Playwright's auto-waiting. Each step
is wrapped in `test.step(step.id + ' ' + step.explain)`, so the HTML report reads like the manual steps.

**The guided-trade overlay that consumes the same steps** — `apps/client/src/guide/GuideOverlay.tsx` (a later
feature; the plan only fixes the contract):

- Loads a scenario by id (lazy import), drops `testOnly` steps and preconditions of kind `quote` (the tour runs on
  live prices).
- For each step: finds `[data-guide="<anchor>"]` (+ key), scrolls it into view, draws a highlight ring and a bubble
  with `explain` next to it (position from `getBoundingClientRect` + `ResizeObserver`; no new dependency needed —
  `@floating-ui/react` is the fallback and would go through the supply-chain check first).
- Advances on the user's own action: `click` → a click on the anchor; `type` → an input event (the step's `value`
  is shown as a suggestion, any valid value is accepted); `observe` → a **Next** button. `expect` is not asserted in
  the tour; the `liveNote` becomes the bubble's "what you should see" line.
- If an anchor isn't on screen (panel collapsed, mobile layout), the bubble says what to open first; this is why
  every anchor is a real control, never a wrapper.

**Rendering the manual steps.** Until scenarios exist as code, the UI reproductions below are written by hand in
this shape. Once they do, `pnpm guide:doc` renders every scenario to `docs/generated/UI_REPRODUCTIONS.md`, and this
file links to it instead of repeating the steps.

Effort **M** (types, builders, `runScenario`, 3 scenarios for the smoke set; the overlay is out of scope).

## F6. CI Postgres (T2i)

`ci.yml` gets a `postgres:16-alpine` service (the tag `docker-compose.yml` pins) and a separate Vitest config,
`apps/server/vitest.int.config.ts`, run by `test:int` for `src/__tests__/int/*.int.test.ts`. One throwaway database
(its name must end in `_int` or `_test`), migrated once with `prisma migrate deploy` — never `prisma migrate reset`:
Prisma refuses it when an AI agent runs it, and it isn't needed, because CI starts empty and each test file clears its
own rows. Test files run one at a time (`fileParallelism: false`), not one schema per worker. Setup: `migrate deploy`
from empty, then `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must find no difference (drift; Prisma 7 flag names). Files: `apps/server/src/__tests__/int/migrations.int.test.ts`
(from-empty, drift), `migrationReplay.int.test.ts` (replay from `src/__tests__/int/fixtures/pre-bp1.sql` in a
second throwaway database, `…_replay_int`), `accountRepository.int.test.ts` (round-trip every
field), `regression.int.test.ts` (18.1–18.6 through the real repository), `paperRoutes.int.test.ts` and
`authRoutes.int.test.ts` (real transactions, `Account.version` conflicts, `deleteMany` races with
`Promise.all`). Used by Stages 3 (15.2.3), 5 (17.5.1) and 6 (14.7.1, 18.7). Effort **M**. Roadmap **P1**.

**Status.** P1a ✅ (#165): the CI Postgres job, `test:int`, migrations from empty + drift check, the
`AccountRepository` round-trip and coverage thresholds in CI. P1b ✅ (#175): the migration replay. The fixture predates
BP-1, so the BP-1 pending-leverage backfill runs too; the replay has its own database, because the BP-2 constraint
guard reads `pg_constraint` database-wide and a second schema would skip a foreign key. P1c, first part ✅:
`regression.int.test.ts` (18.7), which found 18.8 (ids colliding across accounts in the same millisecond). P1c,
second part ✅: `paperRoutes.int.test.ts` (two app instances on one database: 1.7.13, 13.3.8, 18.9),
`authRoutes.int.test.ts` (19.11, 19.12) and the lease handoff in `regression.int.test.ts` (18.10). P1d ✅: the
contract test (F9). Roadmap P1 is complete.

## F7. fast-check properties (T1p)

`fast-check` (MIT, dev-only, no install script) in `apps/server`. One generator of engine actions
(`place | cancel | amend | close | tick | fill | addMargin | reduceMargin | leverage | funding | reset`) over 2
symbols and both markets, with quotes drawn from a bounded random walk. Invariants checked after every action in
`apps/server/src/trading/engine/__tests__/invariants.prop.test.ts`: wallet conservation, no negative spot free /
locked, no negative isolated margin, cross account ≥ 0 after liquidation, reduce-only never grows or flips, liq price
moves toward mark as leverage rises, replay determinism. `numRuns: 200` on PRs, 5,000 nightly with a logged seed;
a shrunk counterexample becomes a named T1 regression test. Used by Stages 1, 3, 4, 5. Effort **M**. **P4**.

## F8. Stryker

`@stryker-mutator/core` + `@stryker-mutator/vitest-runner` in `apps/server`, `mutate: ['src/trading/engine/**/*.ts']`,
incremental mode, weekly workflow (`mutation.yml`, Sunday) uploading the HTML report. First run records the score;
the floor is set 2 points under it and raised quarterly. Surviving mutants in fee / liquidation maths become T1
cases. Effort **S**. **P4**.

## F9. SDK ↔ server contract test

`apps/server/src/__tests__/contract.test.ts`: build the app, `await app.ready()`, take `app.swagger()`, and for each
SDK function in `generated/CDSDK/api/*.ts` check the method + path exist and that the route's response schema lists the same property names (and
required-ness) as a fixture object typed as the SDK type — the TypeScript compiler checks the SDK half, the test the
server half. A small table maps each SDK function to its route. Fails when a route shape changes without the SDK. Effort **S**. **P1** (A8 names no step; it needs no infrastructure).

**Status.** ✅ P1d: `apps/server/src/__tests__/contract/sdkContract.test.ts` (43 cases: every SDK function, plus a
second call with every optional field for the four bodies that have them) and `fixtures.ts`, type-checked by
`apps/server/tsconfig.contract.json` inside `pnpm type-check`. No hand-kept route table: each SDK function is called
with `fetch` stubbed and its real request is matched to the OpenAPI path. A "covers every SDK function" case fails when
a new SDK function has no call. First run found three server defects (rows 19.13, 19.14) and the SDK register type missing
`acceptedTerms`, all fixed in the same PR. The paper state / delta schemas are open (`additionalProperties: true`);
`trading/mappers.ts` builds them from the SDK types, so `tsc` holds that half.

## F10. Visual regression

Playwright `toHaveScreenshot()` in the `@visual` project, chromium only, fixed viewport 1440×900, fonts self-hosted,
`animations: 'disabled'`, the fake feed frozen (`/__control/stall` after the quote), chart canvas masked where it
shows live candles. Baselines under `apps/e2e/tests/visual/__screenshots__/`, dark theme only (the app has no light theme today;
add a light set if one ships). Targets: order form (Spot, perp, with TP / SL open), account
summary bar, leverage + margin-mode modal, adjust-margin dialog, Closed P&L row with its hover breakdown, Section 5
icons, the two notices. A baseline change only lands through the visual Q&A gate (`design.md`). Stages 0, 3, 4, 5.
Effort **M**. **P2**.

**Status (M5e, 2026-09-29):** `apps/e2e/tests/visual/visual.spec.ts`, project `visual`. It covers the Spot order form, the perp order form with TP / SL open, the leverage modal, adjust margin, the summary bar, the BTC and ETH Positions rows (pair icons), and a Closed P&L row. It runs **locally only** (`pnpm --filter @crypto-dashboard/e2e test:visual`): macOS and CI Linux render fonts differently, and a baseline changes only through the visual Q&A gate, where a human compares. The project is last and alone, so no feed stall is needed; the fake feed only pushes on a control call. Masked: the seeded username, the close time, and the order form where it overlaps wide rows. Added later: the liquidation notice (a real liquidation, as the visual project runs alone) and the two-pane headers with the active stripe (10.2.x). Not captured: the cross-margin notice, which only shows for accounts migrated from before cross margin; a seeded user starts in cross.

## F11. Accessibility

`@axe-core/playwright` in the `@a11y` project on `/login`, `/register`, `/forgot-password`, the settings modal, and
`/dashboard/spot/BTC/USDT` + `/dashboard/usdt/BTCUSDT` with each bottom tab open; fail on `serious` / `critical`,
report the rest. Plus keyboard-only journeys already partly covered in RTL (14.1.5). Stage 0 mainly. Effort **S**.
**P2**.

**Status (M5e, 2026-09-29):**

- `a11y/auth.spec` (M5a) and `a11y/dashboard.spec`: Spot and USDT Perpetual with every bottom tab, and the settings modal.
- **Fixed:** the Market `tablist` held the leverage chip (`aria-required-children`), and the settings close button had no name (`button-name`). The screenshot of the order form's tab row is identical before and after.
- **Fixed after the visual Q&A gate (2026-09-29):**
  - contrast: a lighter `red` token (#ff6b7c, ≥4.7:1), `purpleLight` for text on dark (the Beta badge, active tabs and sub-tabs), brighter muted greys (range buttons, footer, settings labels);
  - the toolbar's submenu carets are siblings of their buttons (a byte-identical screenshot);
  - the table scroll regions are keyboard-reachable, with a `:focus-visible` outline only.

  Every serious / critical axe rule now blocks.

## F12. Case-ID coverage report

Every test that implements a case carries its ID in square brackets in the title (`[14.6.1]`). A script,
`scripts/caseCoverage.ts`, extracts the IDs from Part B's tables and the `[x.y.z]` tags from every
`*.test.ts(x)` / `*.spec.ts` title, and prints: rows with no test, tests citing an unknown ID, and ⬜ rows that now
have a test. Run in CI as a report (not a gate) until P2 is done, then as a gate for ⬜ → ✅ edits. Effort **S**.
**P1**.

**Status (M5e, 2026-09-29):**

- `scripts/caseCoverage.mjs` (`pnpm case-coverage`), with its `node:test` tests (`pnpm test:scripts`).
- It reads `[x.y.z]` tags, plus older titles' `(x.y.z)` when those are real rows.
- It runs as a **gate** (`--strict`) in CI and the pre-commit hook: a tag citing no row, or a ⬜ row that has a test, fails it. Its first catch was row 10.4.7.
- The list of rows no test cites stays a report: most unit tests name a section ("1.4 …"), not a row.

---

# Part 2 — Stage-by-stage implementation plan

Each section has the same five parts: **Scenarios** (table: scenario → cases → tier · tool → what exists → what to
add → roadmap step), **Not automatable**, **UI reproduction**, **Guided trade**. File paths are relative to the repo
root; `…/dashboard/__tests__/` means `apps/client/src/components/dashboard/__tests__/`, `…/engine/__tests__/` means
`apps/server/src/trading/engine/__tests__/`, `e2e/` means `apps/e2e/tests/`.

## Stage 0 — Getting in

### 19 — Account flows (19.1–19.8, 19.13, 19.14)

**Scenarios**

| Scenario                                         | Cases | Tier · tool                                     | Today                                                                                                                                                                                                                                             | To add                                                                                                                                                                                                                                                                              | Step |
| ------------------------------------------------ | ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-19-1 Register with a bad username             | 19.1  | T2 ✅ + T3 ✅                                   | `authFormValidation.test` "auth form validation"; M5a `register.spec` [19.1]                                                                                                                                                                      | `e2e/auth/register.spec.ts` @full: type `ab` → the field error text from the page's zod schema is visible; the submit button is enabled again (not stuck on "Creating account…"); no `ZodError` in `page.on('pageerror')`                                                           | P2   |
| SC-19-2 Register and verify once                 | 19.2  | T1 ✅ + T3 ✅ (smoke)                           | `auth.test` "POST /api/auth/verify-email"; `e2e/tests/auth/register.spec` (M4)                                                                                                                                                                    | `e2e/auth/register.spec.ts` @smoke: register through the form, read the link from `GET /api/test/outbox`, open it → verified; open it again in a new page → the 400 message, and no 5xx in `page.on('response')`                                                                    | P2   |
| SC-19-3 Signed-out page load                     | 19.3  | T1 ✅ + T5 ✅                                   | `auth.test` "POST /api/auth/refresh"; `apps/e2e/tests-prod/prod.spec` (M8), post-deploy + hourly                                                                                                                                                  | `e2e/prod/signedOut.spec.ts` @prod: load `/` and `/login`, `/api/auth/refresh` answers 204, zero `console.error`                                                                                                                                                                    | P5   |
| SC-19-4 Sign in, reload, sign out offline        | 19.4  | T1 ✅ + T3 ✅ (online and offline; 19.15 fixed) | `auth.test` login / logout; `LoginPage.returnTo.test`; `e2e/tests/auth/register.spec` signs in, reloads and signs out (M4); the offline sign-out is still to add; M5a `session.spec`: the offline sign-out is blocked by the banner (`test.fail`) | `e2e/auth/session.spec.ts` @smoke: sign in → reload → still on `/dashboard/…` with the username in `nav.user-menu`; `context.setOffline(true)` → `nav.sign-out` → lands on the public page; back online, `/dashboard` redirects to `/login`                                         | P2   |
| SC-19-5 Forgot and reset password                | 19.5  | T1 ✅ + T3 ✅                                   | `auth.test` forgot-password / reset-password, "refresh cookie of the browser doing the reset"; M5a `passwordReset.spec`                                                                                                                           | `e2e/auth/passwordReset.spec.ts` @full: the `auth.forgot.message` text is identical for a known and an unknown email; reset through the outbox link; a second browser context signed in before the reset is sent to `/login` on its next API call                                   | P2   |
| SC-19-6 Change email                             | 19.6  | T1 ✅ + T2 ✅                                   | `auth.test` "Protected auth lifecycle routes"; `VerifyEmailChangePage.test`                                                                                                                                                                       | No action. Optional T3 once the outbox exists (one link, used twice → second fails)                                                                                                                                                                                                 | —    |
| SC-19-7 Change username and password             | 19.7  | T1 ✅ + T3 ✅                                   | `auth.test` lifecycle; M5a `settings.spec`                                                                                                                                                                                                        | `e2e/auth/settings.spec.ts` @full: username saved and shown in `nav.user-menu`; password change in context A → context B is signed out on its next request                                                                                                                          | P2   |
| SC-19-8 Export and delete                        | 19.8  | T1 ✅ + T3 ✅                                   | `auth.test` deletion; M5a `settings.spec` (dev-mode immediate delete)                                                                                                                                                                             | `e2e/auth/settings.spec.ts` @full: `settings.export` → `page.waitForEvent('download')`, the JSON parses and holds the username and no password field; `settings.delete` → `settings.delete.cancel` keeps the account; "Delete Account Now" → signed out, and signing in again fails | P2   |
| SC-19-13 Pending deletion after sign-in          | 19.13 | T1 ✅ + T3 ✅                                   | `auth.test` "should send deletionRequestedAt…"; `sdkContract.test`; M5a `settings.spec` via the `request-deletion` test hook                                                                                                                      | `e2e/auth/settings.spec.ts` @full: request deletion → signed out → sign in → the banner shows its date and Cancel; Cancel → banner gone, and it stays gone after a reload                                                                                                           | P2   |
| SC-19-14 Username / email change replies         | 19.14 | T1 ✅ + T3 ✅                                   | `auth.test` "updates the username", "updates the email…"; `sdkContract.test`; M5a `auth/settings.spec` [19.7][19.14] (no error after a username change)                                                                                           | Folded into SC-19-7's spec: the success line shows, not an error                                                                                                                                                                                                                    | P2   |
| NEW-19-1 Login rate limit                        | —     | T1 ✅ (row 19.17)                               | `refreshRateLimit.test` covers `/refresh` only; `loginRateLimit.test`                                                                                                                                                                             | `apps/server/src/__tests__/loginRateLimit.test.ts`: with `NODE_ENV=production` for the test app, the per-route login limit answers 429 and the client shows its message (the e2e server can't test it: `skip` is on outside production)                                             | P2   |
| NEW-19-2 Unverified user                         | —     | T3 ✅ (row 19.18)                               | `UnverifiedPage.test` "UnverifiedPage sign-out"; `unverified.spec`; an immediate resend is held back by the 5-minute anti-spam guard                                                                                                              | `e2e/auth/unverified.spec.ts` @full: a user seeded with `verified: false` signs in → `/unverified`; `/dashboard/spot/BTC/USDT` redirects back; `auth.unverified.resend` puts a second email in the outbox                                                                           | P2   |
| NEW-19-3 Keyboard-only and axe on the auth pages | —     | T3 ✅ keyboard + axe (19.16 fixed)              | —; `a11y/auth.spec`                                                                                                                                                                                                                               | `e2e/a11y/auth.spec.ts` @a11y: register and sign in with Tab / Enter only; axe on `/login`, `/register`, `/forgot-password`, `/reset-password`                                                                                                                                      | P2   |
| NEW-19-4 Auth on a phone                         | —     | T3 ✅                                           | —; `register.spec`, `session.spec` tagged `@mobile` (iPhone 14, Pixel 7). The Spot scenario isn't: on a 412 px screen the order form sits off-screen behind the Trade toggle and the top bar overflows (Q3)                                       | Tag SC-19-2 and SC-19-4 `@mobile`                                                                                                                                                                                                                                                   | P2   |

**Not automatable.** The email itself (Resend delivery, how the message renders in Gmail / Outlook). Manual option:
one real sign-up on production per auth release with a personal address — check the verify and reset emails
arrive, render, and their links open the right page. Frequency: per release touching `EmailService.ts` or the auth
pages.

**UI reproduction** — start `http://localhost:5173/register` (local dev) or `https://cryptopapertrade.com/register`.
Preconditions: signed out; on local dev without `RESEND_API_KEY` the verify link is in the server log line
`📧 [DEV] …` (or `pnpm feed outbox <email>` with test hooks on).

1. [auth.register.username] type `ab` → Expect a field error under Username ("at least 3 characters"); the button is
   not stuck on "Creating account…". _Explain: "Usernames need 3–20 letters, numbers or underscores."_
2. [auth.register.username] type a valid name, [auth.register.email] your email, [auth.register.password] a password
   → [auth.register.submit] click → Expect the "check your email" page (`/unverified`). _Explain: "We send a link to
   prove the email is yours."_
3. Open the verify link → Expect "verified". Open the same link again → Expect an "invalid or already used" message,
   not an error page. _Explain: "Each link works once."_
4. [auth.login.email] / [auth.login.password] → [auth.login.submit] → Expect the dashboard. Reload → Expect you are
   still signed in. _Explain: "Your session survives a reload."_
5. [nav.user-menu] → [nav.settings] → change the username → [settings.username.save] → Expect the new name in the
   menu. _Explain: "Settings holds your profile, password, export and deletion."_
6. [settings.export] → Expect a `.json` download. [settings.delete] → [settings.delete.cancel] → Expect nothing
   changed. _Explain: "Export gives you a copy of your data; deletion is permanent."_
7. [nav.sign-out] with the network off (devtools → Offline) → Expect the signed-out page. _Explain: "Signing out
   works even without a connection."_
8. `/forgot-password` → [auth.forgot.email] an address that has no account → [auth.forgot.submit] → Expect the same
   message as for your real address. _Explain: "We never reveal whether an email has an account."_

**Guided trade:** partly — steps 2–4 make a "Create your account" tour; the rest are settings, not trading.

### 8 — Account Settings modal (8.1–8.13)

**Scenarios**

| Scenario                           | Cases                              | Tier · tool           | Today                                                                                                                                                                       | To add                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Step |
| ---------------------------------- | ---------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-8-1 Open, read, close           | 8.1, 8.2, 8.3, 8.4, 8.5, 8.9, 8.10 | T2 RTL                | ✅ T2 `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" [8.1]–[8.5], [8.9], [8.10]                                                                    | New describe "Section 8 — Account Settings modal" in `…/dashboard/__tests__/OrderAccountManagementPanel.test.tsx`: `account.settings` opens a dialog titled "Account Settings"; `acct-settings.name` has the username and `readOnly`; no leverage control inside the dialog; `acct-settings.fees` reads `Spot 0.1%` and `Perpetual 0.055% taker · 0.02% maker`; `acct-settings.done` reads "Done" and closes; ✕ and a backdrop click close without calling `fakePaperApi.reset` | P2   |
| SC-8-2 Two-step reset timer        | 8.6, 8.7, 8.11                     | T2 RTL, fake timers   | ✅ T2 `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" [8.6], [8.7], [8.10][8.11]                                                                    | Same describe, `vi.useFakeTimers()`: first click → "Confirm reset?"; `advanceTimersByTime(3000)` → "Reset account" again, reset not called; confirm state → backdrop → reopen → "Reset account"                                                                                                                                                                                                                                                                                 | P2   |
| SC-8-3 Reset clears everything     | 8.8                                | T1 ✅ + T2 ✅ + T3 ✅ | `actions.test` "reset()"; `spot.test` "spot rules and reset"; ✅ T2 `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" [8.8]; M5b `account/reset.spec` | T2: confirm within 3 s → `fakePaperApi` reset called once, modal closes, summary shows `10,000.00` after the snapshot. T3 in `e2e/account/reset.spec.ts` @full: with an open position, a resting limit and a journal note → reset → Positions, Orders and Journal empty, balance `10,000.00`                                                                                                                                                                                    | P2   |
| 8.12 Reset fails (was NEW-8-1)     | 8.12                               | T2                    | ✅ T2 `OrderAccountManagementPanel.test` "Section 8 — Account Settings modal" [8.12] — no error is shown today (S3 finding, see 8.12)                                       | **Fixed 2026-09-28** (visual gate: stay open, inline error): the modal waits for the server — "Resetting…", closes on success, shows "⚠ Reset failed — your account is unchanged. Try again." on failure. New row 8.13 covers the in-flight state.                                                                                                                                                                                                                              | P2   |
| NEW-8-2 Reset seen by a second tab | —                                  | T3                    | —                                                                                                                                                                           | Part of SC-13.3-1: tab B shows `10,000.00` within 2 s of tab A's reset                                                                                                                                                                                                                                                                                                                                                                                                          | P2   |

**Not automatable.** None.

**UI reproduction** — `http://localhost:5173/dashboard/usdt/BTCUSDT`, signed in.

1. [account.settings] click (⚙️ in the Order & Account Management header) → Expect "Account Settings". _Explain:
   "Account settings holds your paper account's name, fees and the reset."_
2. [acct-settings.name] try to type → Expect nothing changes (read-only). [acct-settings.fees] → Expect `Spot 0.1%`
   and `Perpetual 0.055% taker · 0.02% maker`; no leverage field. _Explain: "These are Bybit's VIP-0 fees. Leverage is
   set per symbol on the order form."_
3. [acct-settings.reset] click once → Expect "Confirm reset?". Wait 3 s → Expect "Reset account" again, nothing reset.
   _Explain: "Reset needs a second click within 3 seconds, so it can't happen by accident."_
4. [acct-settings.reset] twice within 3 s → Expect the modal closes; balance `10,000.00`; Positions, Orders and
   Journal empty. _Explain: "A reset gives you a fresh 10,000 USDT account."_
5. Reopen, click reset once, click outside the modal, reopen → Expect "Reset account" (confirm cleared).
   [acct-settings.done] → Expect it closes.

**Guided trade:** no — a settings check, not a learning step (a one-bubble hint on the reset is enough).

### 14.1 — Market URLs and the Trade menu (14.1.1–14.1.10)

**Scenarios**

| Scenario                                  | Cases                                          | Tier · tool | Today                                                                                                                                                                                                               | To add                                                                                                                                                          | Step |
| ----------------------------------------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-14.1-1 URL is the source of truth      | 14.1.1, 14.1.2, 14.1.3, 14.1.6, 14.1.7, 14.1.8 | T1 + T2 ✅  | `useMarketUrlSync.test` "URL → store", "store → URL", "DashboardRedirect"; `marketRoutes.test` "parseMarketPath()", "routeKey()", "safeReturnPath() — 🔐 no open redirect after sign-in"; `LoginPage.returnTo.test` | No action. The T3 perp smoke (SC-1-1) opens `/dashboard/usdt/BTCUSDT` directly and uses Back once                                                               | —    |
| SC-14.1-2 Trade menu and market tabs      | 14.1.4, 14.1.5, 14.1.9                         | T2 ✅       | `TradeMenu.test`; `TradingPanel.test` "BP-2 — market tabs and leverage"                                                                                                                                             | No action; the smoke switches market once through `nav.trade-menu`                                                                                              | —    |
| SC-14.1-3 Public `/chart`                 | 14.1.10                                        | T3 ✅       | — M5d `chart/chart.spec` [14.1.10]                                                                                                                                                                                  | `e2e/chart/publicChart.spec.ts` @full, signed out: `nav.trade-menu` → option `linear` → the pane header says "Perpetual", `page.url()` still ends with `/chart` | P2   |
| NEW-14.1-1 Unknown perp symbol in the URL | —                                              | T2          | `useMarketUrlSync.test` covers the Spot unknown pair only                                                                                                                                                           | `/dashboard/usdt/FOOUSDT` → the active pane's market URL (same rule as 14.1.3)                                                                                  | P2   |
| NEW-14.1-2 Forward after Back             | —                                              | T2          | —                                                                                                                                                                                                                   | Back then Forward restores the later market, no extra history entries                                                                                           | P2   |

**Not automatable.** None.

**UI reproduction** — signed in, `http://localhost:5173/dashboard`.

1. Open `/dashboard` → Expect the address bar becomes `/dashboard/spot/BTC/USDT` (or your last market). _Explain: "The
   address always names the market you are looking at, so you can bookmark it."_
2. [nav.trade-menu] → option **USDT Perpetual** → Expect `/dashboard/usdt/BTCUSDT`, a ✓ on the current market.
   _Explain:
   "Spot trades the coin; USDT Perpetual trades a contract with leverage."_
3. Browser **Back** → Expect Spot again, without a page reload (the chart doesn't flash). _Explain: "Back and forward
   move between markets."_
4. Type `/dashboard/spot/btc/usdt` → Expect `/dashboard/spot/BTC/USDT`. Type `/dashboard/spot/PEPE/USDT` → Expect your
   active pane's market.
5. Sign out, open `/dashboard/usdt/ETHUSDT`, sign in → Expect you land on `/dashboard/usdt/ETHUSDT`.
6. Open `/chart` signed out → [nav.trade-menu] → USDT Perpetual → Expect the chart switches, the address stays
   `/chart`.

**Guided trade:** yes — "Find your market" (steps 1–3), first tour of Stage 0.

### 10.1, 10.2, 10.3, 10.5 — Multi-chart layout

**Scenarios**

| Scenario                                    | Cases                                          | Tier · tool        | Today                                                                                                                                | To add                                                                                                                                                                                                                                                                                                                                                                                                                                                | Step |
| ------------------------------------------- | ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-10.1-1 Layout picker renders each layout | 10.1.1, 10.1.2, 10.1.3, 10.1.4, 10.1.5, 10.1.6 | T2 RTL             | —                                                                                                                                    | New `…/dashboard/__tests__/MultiChartLayout.test.tsx` rendering `ChartLayoutPicker` + `MultiChartArea` with `ChartPanel` mocked (`vi.mock('../ChartPanel')` — lightweight-charts needs a canvas): 5 `layout.option`s with titles "Single chart", "2 columns", "2 rows", "3 columns", "2×2 grid"; each gives 1 / 2 / 2 / 3 / 4 `pane` elements and the grid template of `MultiChartArea`; `pane.header.symbol` present in multi-pane, absent after `1` | P2   |
| SC-10.1-2 Layout persists                   | 10.1.7                                         | T1                 | `layoutStore.test` covers persisted chart type and category, not the layout id                                                       | Add to `apps/client/src/store/__tests__/layoutStore.test.ts`: seed `cd-layout` with `layout: '2h'`, `rehydrate()` → `layout === '2h'`                                                                                                                                                                                                                                                                                                                 | P2   |
| SC-10.2-1 Active pane                       | 10.2.1, 10.2.2, 10.2.3                         | T2 RTL + T3 visual | —                                                                                                                                    | In `MultiChartLayout.test.tsx`: clicking pane 1 sets `activePane` 1 and marks that `pane` active (`aria-current` or `data-active`, added with the anchor); in 4-pane, pane 3 carries the PaneHeader stripe. The animated border's look → F10 baseline                                                                                                                                                                                                 | P2   |
| SC-10.2-2 Clamp on a smaller layout         | 10.2.4                                         | T1 ✅              | `layoutStore.test` "clamps activePane to count-1 (not 0) when out of range"                                                          | No action — **flip the row to ✅** (the test exists)                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| SC-10.3-1 Per-pane symbol and interval      | 10.3.1, 10.3.2, 10.3.3                         | T2 RTL             | `layoutStore.test` "updates only the target pane" (store only)                                                                       | In `MultiChartLayout.test.tsx`: `pane.header.symbol` on pane 0 → ETH; pane 1 stays BTC; `pane.header.interval` `5m` on pane 1 → only pane 1's `ChartPanel` mock receives `5m`; `symbolbar.symbol-picker` changes only the active pane                                                                                                                                                                                                                 | P2   |
| SC-10.5-1 No PaneHeader in `1`              | 10.5.3                                         | T2 RTL             | —                                                                                                                                    | In `MultiChartLayout.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                        | P2   |
| SC-10.5-2 PaneHeader live price and dot     | 10.5.1, 10.5.2                                 | T3 ✅              | — M5d `feed/feedUi.spec` [10.5.1][10.5.2]: grey after cutting this page's socket (`routeWebSocket`), green again after the reconnect | `e2e/layout/paneHeader.spec.ts` @full: 2h layout; `feed quote spot BTCUSDT … last=50000` → `pane.header.price` shows `50,000`, `pane.header.change` has a sign; `pane.header.dot` green; `feed drop spot` → dot grey within 2 s; reconnect → green                                                                                                                                                                                                    | P2   |
| NEW-10-1 Feeds follow the layout            | —                                              | T2                 | —                                                                                                                                    | `usePaneFeeds` with a WebSocket mock: `4` layout opens 4 market sockets, back to `1` closes 3 (no leaked socket or timer) — the web.md "WS lifecycle" rule on the client                                                                                                                                                                                                                                                                              | P2   |
| NEW-10-2 Layout on a phone                  | —                                              | T3 mobile          | —                                                                                                                                    | `DashboardPage` switches to a mobile layout under 1024 px (`useMediaQuery('(max-width: 1023px)')`); expected layouts on a phone to be decided (open question Q3)                                                                                                                                                                                                                                                                                      | P2   |

**Not automatable.** The feel of the animated border and glow (smoothness) — M, eyeballed per UI release; the
static result is in the visual baseline.

**UI reproduction** — signed in, `http://localhost:5173/dashboard/spot/BTC/USDT`.

1. [layout.picker] (grid icon, right side of the symbol bar) → Expect 5 layout icons. _Explain: "You can watch up to
   four charts at once."_
2. [layout.option `2h`] → Expect two side-by-side charts, each with its own header. _Explain: "Each pane has its own
   symbol and interval."_
3. Click the right [pane `1`] → Expect a purple border on it; the order form's symbol follows it. _Explain: "The
   order form always trades the active pane's symbol."_
4. [pane.header.symbol] on the left pane → ETH → Expect only the left pane changes. [pane.header.interval `5m`] on
   the right pane → only the right pane changes.
5. Watch [pane.header.price] and [pane.header.dot] → Expect a live price and a green dot; switch devtools to Offline
   → Expect the dot turns grey.
6. [layout.option `4`], click pane 4, then [layout.option `2h`] → Expect pane 2 active, no error. Reload → Expect the
   2h layout is still there. [layout.option `1`] → Expect no pane header.

**Guided trade:** partly — "Watch several charts" (steps 1–4), optional in Stage 0.

### 5 — Symbol pair icons (5.1–5.7)

**Scenarios**

| Scenario                     | Cases                             | Tier · tool | Today                                                                                                                                              | To add                                                                                                                                                                                                        | Step |
| ---------------------------- | --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-5-1 Pair icons everywhere | 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 | T2 ✅       | `Section5SymbolPairIcons.test.tsx` (describes 5.1–5.5, 5.7); `CryptoIcon.test.tsx` "unknown symbol" + "SymbolPair — unknown symbol fallback (5.6)" | No action. Add the symbol picker and a Positions row with BTC + ETH to the F10 baselines (the 20 / 18 / 16 / 13 px sizes are a visual fact)                                                                   | P2   |
| NEW-5-1 Icon fails to load   | —                                 | T2          | —                                                                                                                                                  | `CryptoIcon` with a known symbol whose `<img>` fires `error` → decide: fallback badge or broken image (CryptoIcon has no `onError` today — an icon CDN outage shows broken images). Owner decision, then test | P2   |

**Not automatable.** None beyond the visual baseline.

**UI reproduction** — signed in, `/dashboard/usdt/BTCUSDT`, one BTC and one ETH position open (Stage 3 shows how).

1. [symbolbar.symbol-picker] → Expect each row shows the coin icon with a small USDT badge. _Explain: "Every pair is
   a coin quoted in USDT."_
2. [account.tab `positions`] → Expect the BTC row shows the BTC icon and the ETH row the ETH icon, whichever pane is
   active.

**Guided trade:** no.

### 9 — Sell / Buy prices and spread (9.1–9.9)

**Scenarios**

| Scenario                             | Cases              | Tier · tool   | Today                                                                                                                    | To add                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Step |
| ------------------------------------ | ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-9-1 Spread decimals               | 9.5                | T2 RTL        | —                                                                                                                        | New describe "Section 9 — spread" in `…/dashboard/__tests__/TradingPanel.test.tsx`: pane store bid 49,999.9 / ask 50,000 → `trade.spread` `0.1`; bid 50,000 / ask 50,001.3 → `1.3`; `title` = `Bid: 49,999.9 · Ask: 50,000.0` (BTCUSDT tick 0.1, since #171); DOGEUSDT bid 0.12345 / ask 0.12346 → Sell `0.12345`, Buy `0.12346`, spread `0.00001` (9.9)                                                                                                              | P2   |
| SC-9-2 Sell = bid, Buy = ask         | 9.1, 9.2, 9.3, 9.4 | T3 ✅         | M5b `trade/quotes.spec` [9.1][9.5] (Sell = bid, Buy = ask, spread and its Bid / Ask title)                               | `e2e/trade/quotes.spec.ts` @full: `feed quote spot BTCUSDT bid=49999.9 ask=50000` → `trade.side.sell` shows `49,999.9`, `trade.side.buy` `50,000.0`, `trade.spread` `0.1`, hover title as above (prices at the 0.1 tick)                                                                                                                                                                                                                                              | P2   |
| SC-9-3 Stale quote                   | 9.6                | T2 ✅ + T3 ✅ | — M5d `feed/feedUi.spec` [9.6]: `—` for Sell / Buy / spread while disconnected (fixed after the visual gate, 2026-09-29) | Same spec: `page.clock.install()`, `feed stall spot 40000` + refuse reconnects → advance 30 s (`DATA_TIMEOUT_MS` in `usePaneFeeds.ts`) → Sell / Buy fall back to the last price, `trade.spread` `—`, `trade.submit` disabled on Market                                                                                                                                                                                                                                | P2   |
| SC-9-4 Quotes follow the active pane | 9.7                | T3 ✅         | — M5d `feed/feedUi.spec` [9.7]                                                                                           | 2h layout, pane 1 = ETHUSDT with `feed quote spot ETHUSDT bid=2999.9 ask=3000`; click pane 1 → Sell / Buy show the ETH quotes at once                                                                                                                                                                                                                                                                                                                                 | P2   |
| SC-9-5 TradingView comparison        | 9.8                | ➖            | Retired → 6.1                                                                                                            | No action                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —    |
| NEW-9-1 Crossed or locked book       | —                  | T2            | —                                                                                                                        | bid ≥ ask from the feed → `trade.spread` never shows a negative number (expected `—` or `0.0000`: owner to pick)                                                                                                                                                                                                                                                                                                                                                      | P2   |
| NEW-9-2 Low-priced coins             | —                  | T2            | ✅ `TradingPanel.test` "should show a low-priced coin at its own tick" (row 9.9)                                         | **Done 2026-09-28** (visual gate: prices at the instrument tick). Sell / Buy, spread, its tooltip and the order label use the tick's decimals; before the rules load, the SDK tick snapshot for the pane's market (Spot or USDT Perpetual, `priceTickSize`), else 5 decimals under 1. Spot DOGE covered by "should show a low-priced Spot coin at its tick before the rules load"; `bybitSpec.test` holds both SDK tables equal to the server snapshot (review #171). | P2   |

**Not automatable.** None — the TradingView side-by-side was retired (6.1 replaces it).

**UI reproduction** — local dev with the fake feed (`pnpm dev:e2e`), signed in, `/dashboard/spot/BTC/USDT`.

1. `feed quote spot BTCUSDT bid=49999.9 ask=50000` **(fake feed)**.
2. [trade.side.sell] → Expect `49,999.9`. [trade.side.buy] → Expect `50,000.0`. _Explain: "Sell shows the best bid —
   what a buyer pays you now. Buy shows the best ask — what a seller asks."_
3. [trade.spread] hover → Expect `0.1` and the tooltip `Bid: 49,999.9 · Ask: 50,000.0` (every price at the coin's tick). _Explain: "The spread is the
   gap between them — the cost of trading at market both ways."_
4. `feed stall spot 40000` **(fake feed)**, wait 30 s → Expect `—` in the spread and the Market button disabled.
   On live prices: devtools → Offline instead.
5. Two panes, right pane ETHUSDT; click it → Expect Sell / Buy switch to ETH's prices at once.

Live prices: Sell < Buy, usually one tick apart (BTC tick 0.1); the tooltip values must equal the two buttons.

**Guided trade:** yes — "Read Sell, Buy and the spread" (steps 2–3), last tour of Stage 0.

---

## Stage 1 — Spot basics

### 14.6 — Spot (14.6.1–14.6.10)

**Scenarios**

| Scenario                                         | Cases          | Tier · tool                 | Today                                                                                                                                                                                                             | To add                                                                                                                                                                                                                                            | Step |
| ------------------------------------------------ | -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-14.6-1 Spot market buy → Assets               | 14.6.1, 14.6.8 | T1 ✅ + T2 ✅ + T3 ✅ smoke | `spot.test` "spot market buy — 0.1 BTC at ask 50,000"; `OrderAccountManagementPanel.test` "on Spot, Assets replaces Positions and lists the USDT wallet and coins held"; `e2e/tests/spot/spotMarketBuy.spec` (M4) | The F5 worked example: `e2e/spot/spotMarketBuy.spec.ts` @smoke @mobile — USDT free `5,000.00`, BTC free `0.0999`, avg cost `50,050.05`, no Positions tab                                                                                          | P2   |
| SC-14.6-2 Spot market sell, realized PnL         | 14.6.2         | T1 ✅ + T3 ✅               | `spot.test` "spot market sell — 0.0999 BTC at bid 51,000"; M5b `spot/spotRoundTrip.spec` on SOLUSDT (buy 10 at 150, sell 9.99 at 160 → USDT 10,096.80)                                                            | `e2e/spot/spotRoundTrip.spec.ts` @full: after SC-14.6-1, `feed quote spot BTCUSDT bid=51000 ask=51000.1`, sell 0.0999 → USDT `10,089.81` (5,000 + 5,089.8051), fee `5.0949` in Order History, Balance History realized `+89.81`                   | P2   |
| SC-14.6-3 No shorting                            | 14.6.3         | T1 ✅ + T2 ✅               | `spot.test` "spot rules and reset"; `TradingPanel.test` "BP-2 — Spot form"                                                                                                                                        | No action                                                                                                                                                                                                                                         | —    |
| SC-14.6-4 Spot form shape                        | 14.6.4         | T2 ✅                       | `TradingPanel.test` "BP-2 — Spot form"                                                                                                                                                                            | No action                                                                                                                                                                                                                                         | —    |
| SC-14.6-5 Spot limit orders                      | 14.6.5         | T1 ✅                       | `spot.test` "spot limit orders"                                                                                                                                                                                   | No action (the reservation `4,900` is also asserted in SC-14.6-2's spec on the way)                                                                                                                                                               | —    |
| SC-14.6-6 Spot TP / SL as an OCO pair            | 14.6.6         | T1 ✅ + T3 ✅               | `spot.test` "spot TP / SL — an OCO pair sharing one coin lock"; M5b `spot/spotTpSl.spec` on XRPUSDT (99.9 locked; TP at 2.6 → USDT 10,009.48; SL cancelled)                                                       | `e2e/spot/spotTpSl.spec.ts` @full: buy 0.1 with TP 52,000 and SL 48,000 → BTC locked `0.0999`, two working orders; `feed path spot BTCUSDT 50000,51000,52000` → TP fills, SL cancelled, BTC 0                                                     | P2   |
| SC-14.6-7 Assets → TP / SL modal                 | 14.6.7         | T1 ✅ + T2                  | `spot.test` (lock); ✅ T2 `SpotExitsModal.test` "SpotExitsModal — Assets → TP / SL (14.6.7)" (a qty above the free balance shows "Enter a quantity up to …" — Confirm stays enabled)                              | New describe in `…/dashboard/__tests__/SpotExitsModal.test.tsx`: `assets.row.tpsl` (BTC) opens "Quantity (available 0.0999 BTC)"; qty 0.05 + TP → `fakePaperApi` gets `POST /api/paper/spot/exits` with qty 0.05; Confirm disabled for qty > free | P2   |
| SC-14.6-8 Assets → Sell prefill                  | 14.6.9         | T2 ✅                       | `OrderAccountManagementPanel.test` "Assets → Sell switches the pane to that coin on Spot and prefills the form"                                                                                                   | No action                                                                                                                                                                                                                                         | —    |
| SC-14.6-9 Bottom tabs on Spot                    | 14.6.10        | T2 ✅                       | `OrderAccountManagementPanel.test` "Orders shows the active market only"                                                                                                                                          | No action                                                                                                                                                                                                                                         | —    |
| NEW-14.6-1 Max button on Spot buy                | —              | T2 + T1                     | `orderMath.test` "maxQty()"                                                                                                                                                                                       | `trade.size-step` `100` with 10,000 USDT at ask 50,000 → a qty that passes the server (≤ 0.2 after step rounding) and is not refused "Balance insufficient"                                                                                       | P2   |
| NEW-14.6-2 Sell what TP / SL has locked          | —              | T1                          | —                                                                                                                                                                                                                 | After SC-14.6-6's lock, a market sell of 0.0999 is refused with the available amount 0 in the message                                                                                                                                             | P2   |
| NEW-14.6-3 Min order value boundary              | —              | T1                          | `spot.test` covers "under 5 USDT" (14.4.3)                                                                                                                                                                        | Exactly 5 USDT is accepted, 4.99 refused (boundary pair)                                                                                                                                                                                          | P2   |
| NEW-14.6-4 Spot fee on a coin with a coarse step | —              | T1                          | —                                                                                                                                                                                                                 | DOGEUSDT buy where 0.1% of the qty isn't a multiple of the step → the received amount and the fee follow Bybit's rounding (confirm with a T4 spot trade — the parity run is linear-only today)                                                    | P4   |

**Not automatable.** None.

**UI reproduction** — the F5 worked example is this section's reproduction (steps `spot-market-buy.1`–`.7`); then:

8. `feed quote spot BTCUSDT bid=51000 ask=51000.1` **(fake feed)**. [trade.side.sell] → [trade.amount] `0.0999` →
   [trade.submit] → Expect USDT `10,089.81`, BTC `0`. _Explain: "Selling pays the 0.1% fee in USDT: 0.0999 × 51,000 ×
   0.1% = 5.09."_ Live: fee = qty × bid × 0.001.
9. [account.tab `orderhistory`] → Expect two Filled MARKET rows, Commission `0.0001 BTC` and `5.0949 USDT`.
10. [trade.type.limit] → [trade.side.buy] → [trade.price] `49000` → [trade.amount] `0.1` → [trade.submit] → Expect a
    working order and USDT available down by `4,900`. _Explain: "A limit order waits for your price and reserves the
    money now."_
11. [orders.row.cancel] → Expect the `4,900` back.
12. Market buy 0.1 with [trade.exits.toggle] → [trade.tp.enable] `52000` and [trade.sl.enable] `48000` → Expect two
    working orders and BTC locked `0.0999`. _Explain: "Take-profit and stop-loss are one pair: when one fills, the
    other is cancelled."_
13. [assets.row.tpsl `BTC`] → Expect the TP / SL modal with the free quantity. [assets.row.sell `BTC`] → Expect the
    form switches to Sell with the free quantity filled in.
14. Try [trade.side.sell] `1` BTC → Expect "Balance insufficient (… available)". _Explain: "On Spot you can only sell
    what you own."_

**Guided trade:** yes — three tours: "Your first Spot market order" (F5 steps 1–7), "Sell and see your profit"
(8–9), "Protect a Spot buy with TP / SL" (12–13).

---

## Stage 2 — Reading your account

### 4 — Panels, persistence, journal, sounds, Orders bench (4.1–4.16, 4.21–4.23)

**Scenarios**

| Scenario                                              | Cases                     | Tier · tool   | Today                                                                                                                                                                                                                                                                     | To add                                                                                                                                                                                                                                                                                  | Step |
| ----------------------------------------------------- | ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-4-1 Form across a symbol change and close / reopen | 4.1, 4.2, 4.3, 4.4        | T2 ✅         | `TradingPanel.test` "4.1 Symbol change (key remount) resets form, preserves tab", "4.2 …Limit tab…", "4.3 …Stop tab…", "4.4 TradingPanel tab + side preserved via props (close/reopen parity)"                                                                            | No action                                                                                                                                                                                                                                                                               | —    |
| SC-4-2 Panel header controls                          | 4.5                       | T2 ✅         | `OrderAccountManagementPanel.test` "Section 4.5 — OrderAccountManagementPanel header controls"                                                                                                                                                                            | No action                                                                                                                                                                                                                                                                               | —    |
| SC-4-3 Survives a reload                              | 4.6                       | T1 ✅ + T3 ✅ | `paperStore.test` "hydrate()"; server holds the state since BP-1; M5d `engine/twoTabs.spec` (the reload step)                                                                                                                                                             | No action — covered end to end by SC-13.3-1's reload step                                                                                                                                                                                                                               | —    |
| SC-4-4 PnL signs and journal                          | 4.7, 4.8, 4.9, 4.10, 4.11 | T1 ✅ + T2 ✅ | `actions.test` "4.7 History PnL signs…", "4.8 Journal entries are newest-first…", "4.9 …profitable close", "4.10 …losing close", "4.11 …user note has no badge"; `OrderAccountManagementPanel.test` "Section 4.7 — Balance History tab", "Section 4.8–4.11 — Journal tab" | No action. Catalogue note: the "History tab" of 4.7 / 7.4.2 is now **Balance History** (and **Closed P&L** on perps)                                                                                                                                                                    | —    |
| SC-4-5 Maximize and restore                           | 4.12, 4.13                | T3 ✅         | Checked by hand (tiered T3, never automated); M5d `chart/chart.spec` [4.12][4.13]                                                                                                                                                                                         | `e2e/panels/maximize.spec.ts` @full: `account.maximize` → the chart area's bounding box height is 0, the panel fills the column, `trade.submit` still visible, button title "Restore panel"; again → heights restored ±2 px                                                             | P2   |
| SC-4-6 Sounds                                         | 4.14, 4.15, 4.16          | T2 + M        | `usePaperFeed.test` (liquidation sound, 15.4.7)                                                                                                                                                                                                                           | T2 in `apps/client/src/hooks/__tests__/useTradingSound.test.tsx`: spy the play function; an order placed → "Market order placed" / "Pending order queued"; a TP close → "Closed with profit"; muted in `SoundSettings` → no call. Re-tier the rows to **M** for audibility, as A10 says | P2   |
| SC-4-7 Orders bench TTL                               | 4.21, 4.22                | T2 ✅         | `OrderAccountManagementPanel.test` "OrderAccountManagementPanel Orders filled sub-tab" (`BENCH_TTL_MS`, `SESSION_START`)                                                                                                                                                  | No action                                                                                                                                                                                                                                                                               | —    |
| 4.23 Journal note is plain text (was NEW-4-1)         | 4.23                      | T2 + T3       | ✅ T2 `OrderAccountManagementPanel.test` "Section 4 — journal notes render as plain text" [4.23] (T3 still to add)                                                                                                                                                        | A note `<img src=x onerror=alert(1)>` renders as that literal text; no `img` element, no dialog (`page.on('dialog')`) — the `web.md` stored-XSS rule                                                                                                                                    | P2   |
| NEW-4-2 Journal note length                           | —                         | T1 + T2       | route schema `maxLength: 500`                                                                                                                                                                                                                                             | 500 characters accepted, 501 refused with a message in the note editor (not a silent drop)                                                                                                                                                                                              | P2   |

**Not automatable.** Whether the sounds are audible and distinct (4.14–4.16): M. Checklist per UI release touching
`TradingSoundContext.tsx`: place market / limit, hit a TP and an SL on the fake feed, mute and unmute, on Chrome and
Safari with the volume at 50%.

**UI reproduction** — signed in, `/dashboard/usdt/BTCUSDT`, one open position.

1. [symbolbar.symbol-picker] → ETH while on [trade.type.limit] → Expect the Limit tab stays, the price field shows
   ETH's price. _Explain: "Changing the symbol clears the form but keeps your order type."_
2. [trade.close-panel] then [symbolbar.trade-toggle] → Expect the form comes back exactly as you left it.
3. [account.collapse] then expand; [account.maximize] → Expect the chart area disappears and the panel fills the
   column; again → Expect the chart returns. _Explain: "Maximize the panel when you review your trades."_
4. [account.tab `journal`] → Expect newest entries first; the close entry has a green `+$X.XX` or red `−$X.XX` pill.
   [journal.add-note] → type a note → Expect it saved without a pill. _Explain: "The journal records every action;
   add your own notes on why you traded."_
5. [account.sound] → mute → place an order → Expect silence; unmute → Expect the double tick.
6. Place and cancel a limit order → [account.tab `orders`] → Expect the Cancelled row at 65% opacity with a clock
   icon; after 2 minutes (or a reload) it's gone from Orders and still in Order History.

**Guided trade:** partly — "Your journal" (step 4) is a good short tour; the rest is panel housekeeping.

### 7 — Order History tab (7.1.1–7.6.2)

**Scenarios**

| Scenario                                    | Cases                                    | Tier · tool | Today                                                                                                                                                                          | To add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Step |
| ------------------------------------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-7-1 History records for every outcome    | 7.1.1, 7.2.1, 7.2.2, 7.3.1, 7.4.1, 7.6.1 | T1 + T3 ✅  | ✅ T1 `actions.test` "Section 7 — Order History records" (T3 still to add); M5d `engine/orderHistory.spec` (market, filled limit, cancelled limit; the Rejected case stays T1) | New describe "Section 7 — Order History records" in `…/engine/__tests__/actions.test.ts` asserting the `HistoricalOrder` fields: market buy → `MARKET` / `BUY` / `Filled`; limit buy 0.1 @ 49,000 at 10× → fill price `49,000`, commission `0.98`, fee rate 0.02% maker; cancel → `Cancelled`; a triggered order that can't fill → `Rejected` "Order could not be filled."; market + limit fill + stop cancel → 3 rows in that order. T3 `e2e/account/orderHistory.spec.ts` @full walks the same sequence on the fake feed | P2   |
| SC-7-2 Sub-tabs and counts                  | 7.1.2, 7.1.3, 7.1.4, 7.2.3, 7.3.2        | T2 RTL      | ✅ T2 `OrderAccountManagementPanel.test` "Section 7 — Order History tab" [7.1.2]–[7.3.2]                                                                                       | Extend that describe with Order History's own sub-tabs: one market fill → All 1 / Filled 1 / Cancelled 0 / Rejected 0; Orders top badge 0; with `vi.setSystemTime(+120_001 ms)` the row leaves Orders and stays in Order History; a cancel raises All to 2                                                                                                                                                                                                                                                                 | P2   |
| SC-7-3 Rejections stay out of trade history | 7.4.2                                    | T2 RTL      | ✅ T2 `OrderAccountManagementPanel.test` "Section 7 — Order History tab" [7.4.1][7.4.2]                                                                                        | A rejected record is in Order History → Rejected (red ⚠) and not in Balance History or Closed P&L                                                                                                                                                                                                                                                                                                                                                                                                                          | P2   |
| SC-7-4 Placing / Closing Time columns       | 7.5.1, 7.5.2                             | T2 RTL      | ✅ T2 `OrderAccountManagementPanel.test` "Section 7 — Order History tab" [7.5.1], [7.5.2]                                                                                      | `account.columns` on Order History: Placing Time and Closing Time on by default; toggling Closing Time off hides the column and writes the preference; unmount + remount (same jsdom `localStorage`) → still off                                                                                                                                                                                                                                                                                                           | P2   |
| SC-7-5 Status colours                       | 7.6.2                                    | T2 RTL      | ✅ T2 `OrderAccountManagementPanel.test` "Section 7 — Order History tab" [7.6.1][7.6.2]                                                                                        | `orders.row.status` for Filled uses the green token and Cancelled the muted token (`tokens.ts`), asserted on the computed style                                                                                                                                                                                                                                                                                                                                                                                            | P2   |
| NEW-7-1 Long history                        | —                                        | T2          | —                                                                                                                                                                              | 500 Order History rows render in < 300 ms in jsdom and the list stays capped at what the snapshot sends                                                                                                                                                                                                                                                                                                                                                                                                                    | P2   |

**Not automatable.** None.

**UI reproduction** — signed in, account reset, `/dashboard/usdt/BTCUSDT`, Isolated 10×. Fake feed:
`feed quote linear BTCUSDT bid=49999.9 ask=50000 mark=50000`.

1. [trade.type.market] → [trade.side.buy] → [trade.amount] `0.01` BTC → [trade.submit].
2. [account.tab `orderhistory`] → Expect 1 row MARKET / BUY / Filled (green); [orders.subtab `filled`] count 1,
   Cancelled and Rejected empty. _Explain: "Order History keeps every order you ever placed, whatever happened to
   it."_
3. [account.tab `orders`] → Expect the same row in Filled with a clock icon; the top badge shows no number.
   _Explain: "The Orders tab shows what is still working; finished orders stay for 2 minutes."_
4. [trade.type.limit] → [trade.price] `49000` → [trade.amount] `0.1` → [trade.submit]; `feed path linear BTCUSDT
50000,49000` **(fake feed)** → Expect Order History: LIMIT, Fill Price `49,000`, Commission `0.98` with "0.02%
   maker". _Explain: "A resting limit order fills at its own price and pays the lower maker fee."_ Live: place the
   limit a few $ under the Buy price and wait; commission = qty × limit × 0.0002.
5. Place a stop sell far below, then [orders.row.cancel] → Expect STOP / Cancelled (muted).
6. [account.columns] → turn off Closing Time → Expect the column disappears; reload → Expect it stays off.

**Guided trade:** yes — "Follow an order from placement to history" (steps 1–5, with 4 on live prices as a waiting
step).

---

## Stage 3 — USDT Perpetual basics

All worked numbers use **long 0.1 BTC @ 50,000, Isolated 10×**: IM 500, open fee 2.75, fee to close 2.475 → balance
−505.225; close at bid 51,000 → close fee 2.805, +599.67 back, realized +94.445; liq 45,149.0 (45,148.99
rounded up to the 0.1 tick), bankruptcy 45,000.
Fake feed for all of them: `feed quote linear BTCUSDT bid=49999.9 ask=50000 mark=50000`.

### 1 — Market orders (1.1.1–1.7.12)

**Scenarios**

| Scenario                                    | Cases                                                           | Tier · tool                                   | Today                                                                                                                                                                                                                                                                                          | To add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Step |
| ------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| SC-1-1 **Perp smoke**: open, see, close     | 1.1.1, 1.1.2, 1.1.3, 1.1.4, 1.6.3                               | T1 ✅ + T2 ✅ + T3 ✅ smoke                   | `actions.test` "1.1 Basic Buy", "1.6 Buy with both TP and SL"; `TradingPanel.test` "1.1 Basic Buy"; `fees.test` "market open — 10×, qty 0.1 at ask 50,000"; `e2e/tests/perp/perpMarketLong.spec` (M4: open, close at 51,000, Closed P&L 94.44; the partial close is SC-17.4-1's)               | `e2e/perp/perpOpenClose.spec.ts` @smoke @mobile (scenario `perp-market-long`): seeded Isolated 10×; via `nav.trade-menu` to USDT Perpetual; buy 0.1 → `trade.amount` clears; `positions.row` `linear:BTCUSDT` qty `0.100`, entry `50,000`, liq `45,149.0`; available balance `9,494.78` (10,000 − 505.225); `feed quote … bid=51000 ask=51000.1 mark=51000` → `positions.row.close` → row gone, the Closed P&L rows add up to ≈ `+94.45` (two rows of ≈ `+47.22` after SC-17.4-1's partial close), balance ≈ `10,094.45` | P2   |
| SC-1-2 Records of a market buy              | 1.1.5, 1.1.6, 1.1.7, 1.1.8                                      | T1 ✅ + T2 ✅                                 | `actions.test` "1.1 Basic Buy"; `OrderAccountManagementPanel.test` "Orders filled sub-tab"                                                                                                                                                                                                     | No action (the smoke asserts the Order History row once)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —    |
| SC-1-3 Market short                         | 1.2.1, 1.2.2, 1.2.3                                             | T1 ✅ + T2 ✅ + T3 ✅                         | `actions.test` "1.2 Basic Sell"; `TradingPanel.test` "1.2 Basic Sell"; M5b `perp/perpShort.spec`                                                                                                                                                                                               | `e2e/perp/perpShort.spec.ts` @full: sell 0.1 at bid 50,000 → SHORT row; `feed path linear BTCUSDT 50000,49000` → `positions.row.pnl` positive and green; back to 51,000 → negative and red                                                                                                                                                                                                                                                                                                                               | P2   |
| SC-1-4 Amount unit                          | 1.3.1, 1.3.2, 1.3.3, 1.3.4                                      | T1 ✅ + T2 ✅                                 | `TradingPanel.test` "1.3 Amount unit (BTC \| USDT)"; `actions.test` "1.3 Units mode"                                                                                                                                                                                                           | No action. Catalogue note: the toggle is now **BTC \| USDT** (`trade.amount-unit`), not `⇄ Units` / `⇄ USD`                                                                                                                                                                                                                                                                                                                                                                                                              | —    |
| SC-1-5 TP / SL on a market order            | 1.4.1, 1.4.2, 1.4.4, 1.5.1, 1.5.2, 1.5.3, 1.6.1, 1.6.2          | T1 ✅ + T2 ✅ + T3 ✅ (1.5.3 ⚠️ badge format) | `actions.test` "1.4 …", "1.5 …", "1.6 …"; `TradingPanel.test` "1.4 …", "1.5 …", "1.6 …"; `triggers.test` "checkTPSL() — long positions" / "— short positions"; M5b `perp/perpTpSl.spec` [1.4.3], [1.5.3]: both exits fire; the loss badge reads `$-10.12`, not `−$10.12` (visual gate pending) | `e2e/perp/perpTpSl.spec.ts` @full: long 0.1 with TP 51,000 → `feed path linear BTCUSDT 50000,51000` → row gone, journal pill green; short 0.1 with SL 51,000 → Working shows the synthetic SL BUY order; path to 51,000 → closed, pill red, Working empty                                                                                                                                                                                                                                                                | P2   |
| SC-1-6 TP exit labelled "MARKET" (known S4) | 1.4.3                                                           | T1 + T2 (defect fix)                          | ✅ `actions.test` "1.4.3: the TP close is recorded as a filled Take Profit order", "1.5.3: an SL close…"                                                                                                                                                                                       | **Already fixed** by the BP-1 server engine (the exit order records `take-profit` / `stop-loss`, which Order History shows as Take Profit / Stop Loss); regression tests added 2026-09-28, catalogue note corrected.                                                                                                                                                                                                                                                                                                     | P2   |
| SC-1-7 Form validation and SL safety rails  | 1.7.1, 1.7.2, 1.7.3, 1.7.4, 1.7.5, 1.7.6, 1.7.7, 1.7.11, 1.7.12 | T2 ✅ (+ T1 ✅ for 1.7.2)                     | `TradingPanel.test` "1.7 Edge cases", "Section 1.7.11 — SL typo safety rails"; `sltpSanity.test` (all describes)                                                                                                                                                                               | No action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —    |
| SC-1-8 Offline market order                 | 1.7.8                                                           | T3 ✅                                         | M5b `perp/offline.spec` (the button is disabled offline — the row now says so)                                                                                                                                                                                                                 | `e2e/perp/offline.spec.ts` @full: `context.setOffline(true)` → `trade.submit` disabled on Market (the button checks `navigator.onLine`); the "Waiting for live price…" text where the form shows it — align the row's wording with what the UI does (disabled button vs error text)                                                                                                                                                                                                                                      | P2   |
| SC-1-9 Several positions, reset             | 1.7.9, 1.7.10                                                   | T1 ✅                                         | `actions.test` "netting (one-way positions)", "reset()"                                                                                                                                                                                                                                        | No action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —    |
| NEW-1-1 Double-click Buy                    | —                                                               | T2 + T3                                       | —                                                                                                                                                                                                                                                                                              | Two clicks within 50 ms → one `POST /api/paper/orders` (the `placing` state disables the button); T3 counts requests with `page.on('request')`                                                                                                                                                                                                                                                                                                                                                                           | P2   |
| 1.7.13 Close while a TP fires (was NEW-1-2) | 1.7.13                                                          | T2i ✅                                        | `paperRoutes.int.test` "[1.7.13] closes the position once…" (P1c)                                                                                                                                                                                                                              | Done: machine A's close and machine B's TP trigger at once → one close                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P1   |
| NEW-1-3 Perp smoke on a phone               | —                                                               | T3 mobile                                     | —                                                                                                                                                                                                                                                                                              | SC-1-1 under 1024 px: the order form opens as a full-width overlay (`DashboardPage` `isMobile`); closing it shows the Positions row                                                                                                                                                                                                                                                                                                                                                                                      | P2   |

**Not automatable.** None.

**UI reproduction** — local dev with the fake feed, signed in, account reset, `/dashboard/usdt/BTCUSDT`, **Isolated
10×** (see "How to use").

1. [nav.trade-menu] → USDT Perpetual → Expect `/dashboard/usdt/BTCUSDT` and the leverage chip `Isolated 10x`.
   _Explain: "USDT Perpetual lets you go long or short with leverage."_
2. [trade.side.buy] → [trade.type.market] → [trade.amount-unit `coin`] → [trade.amount] `0.1` → Expect
   [trade.preview.cost] ≈ `505.23` (margin 500 + fees) and [trade.preview.liq] `$45,158.1` with the ask at 50,010,
   `$45,149.0` at 50,000. _Explain: "At 10× you put up 500 USDT of margin for a 5,000 USDT position."_
3. [trade.submit] → Expect the amount clears and a LONG row: qty `0.100`, entry `50,000`, TP `—`, SL `—`. _Explain:
   "A market buy opens a long at the ask."_
4. Expect the available balance `9,494.78`. _Explain: "Margin plus the opening fee and the fee reserved to close are
   set aside."_ Live: 10,000 − qty × ask × (1/10 + 0.00055) − fee to close.
5. `feed quote linear BTCUSDT bid=51000 ask=51000.1 mark=51000` **(fake feed)** → Expect PnL `+100` (at mark
   51,000). [positions.row.close] → Expect the row gone, balance ≈ `10,094.45`, [account.tab `closedpnl`] ≈ `+94.45`.
   _Explain: "The profit is 100, minus 2.75 to open and 2.81 to close."_
6. [trade.side.sell] 0.1 → Expect a SHORT row; its PnL turns green when the price falls.
7. Buy with [trade.tp.enable] a price **below** the entry → Expect "Take-Profit must be above entry price for Long";
   [trade.sl.price] `5000` (a typo for 50,000) → Expect the blocking typo warning ([trade.sl-confirm]).
8. Devtools → Offline → Expect the Market button disabled.

Live prices: entry = the Buy price at the click; PnL uses the **mark** (Positions "Mark Price" column); tolerance =
one tick × qty.

**Guided trade:** yes — "Your first long" (steps 1–5) and "Going short" (step 6); step 7 is a good "Mistakes the form
catches" mini-tour.

### 2 — Limit orders (2.1.1–2.5.4)

**Scenarios**

| Scenario                             | Cases                                             | Tier · tool          | Today                                                                                                   | To add                                                                                                                                                                                                                                                                           | Step |
| ------------------------------------ | ------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-2-1 Limit buy waits, then fills   | 2.1.1, 2.1.2, 2.1.3, 2.1.4, 2.1.5, 2.1.6          | T1 ✅ + T2 ✅        | `actions.test` "2.1 Limit Buy below market"; `TradingPanel.test` "2.1 Limit Buy below market"           | No action; the T3 walk is SC-7-1's spec                                                                                                                                                                                                                                          | —    |
| SC-2-2 Cancel refunds                | 2.2.1, 2.2.2                                      | T1 ✅                | `actions.test` "2.2 Limit Buy cancel"                                                                   | No action                                                                                                                                                                                                                                                                        | —    |
| SC-2-3 Limit sell opens a short      | 2.3.1, 2.3.2                                      | T1 ✅                | `actions.test` "2.3 Limit Sell above market"                                                            | No action                                                                                                                                                                                                                                                                        | —    |
| SC-2-4 Bracket before the fill       | 2.4.1, 2.4.2, 2.4.3, 2.4.4                        | T1 ✅                | `actions.test` "2.4 Limit with TP + SL — Pre-fill"                                                      | No action                                                                                                                                                                                                                                                                        | —    |
| SC-2-5 Bracket after the fill        | 2.4.5, 2.4.6, 2.4.7, 2.4.8, 2.4.9, 2.4.10, 2.4.11 | T1 ✅ + T3 ✅        | `actions.test` "2.4 Limit with TP + SL — Post-fill"; M5b `perp/limitBracket.spec` [2.4.1][2.4.5][2.4.9] | `e2e/perp/limitBracket.spec.ts` @full: limit buy 0.1 @ 49,000 with TP 51,000 / SL 47,000 → Working 1 / Inactive 2; `feed path linear BTCUSDT 50000,49000` → parent Filled, TP / SL Working; path to 51,000 → Order History BUY Filled + TP Filled + SL Cancelled (no commission) | P2   |
| SC-2-6 Limit edge cases              | 2.5.1, 2.5.2, 2.5.3, 2.5.4                        | T1 ✅ + T2 ✅        | `TradingPanel.test` "2.5 Edge cases"; `actions.test` "2.5 Edge cases"                                   | No action                                                                                                                                                                                                                                                                        | —    |
| NEW-2-1 Edit a limit across the book | —                                                 | T1 ✅ (uncatalogued) | `fees.test` "PR #136 review — editing a limit across the book is priced at the book"                    | Add the row to Part B (it's tested, not catalogued)                                                                                                                                                                                                                              | —    |
| NEW-2-2 Limit exactly at the ask     | —                                                 | T1                   | `fees.test` "crossing limit — trades now as a taker" (above the ask)                                    | Limit buy at exactly the ask → taker fill now (Bybit crosses at `price ≥ ask`); at ask − one tick → rests as maker                                                                                                                                                               | P2   |

**Not automatable.** None.

**UI reproduction** — as Section 1 (fake feed, Isolated 10×).

1. [trade.type.limit] → Expect [trade.price] pre-filled just under the Buy price, no warning. _Explain: "A limit order
   sets the worst price you accept."_
2. [trade.price] `49000`, [trade.amount] `0.1`, [trade.exits.toggle] → [trade.tp.enable] `51000`,
   [trade.sl.enable] `47000` → [trade.submit] → Expect [account.tab `orders`] Working 1 (LIMIT BUY) and Inactive 2
   (TP, SL); available down by `495.12`. _Explain: "The TP and SL wait until the entry fills."_
3. [orders.row.cancel] on the SL row → Expect only the SL cancelled, balance unchanged. Re-add it via
   [orders.row.edit].
4. `feed path linear BTCUSDT 50000,49000` **(fake feed)** → Expect the parent Filled at `49,000` (maker `0.98`), TP
   and
   SL Working, a LONG row with both. Live: wait for the price to reach your limit.
5. `feed path linear BTCUSDT 49000,51000` → Expect the position closed by the TP, the SL row Cancelled with no
   commission, a green journal pill.
6. A limit buy **above** the Buy price → Expect the warning that it fills now at the ask as a taker.

**Guided trade:** yes — "Enter at your price with a limit order" (steps 1–2, 4) and "A full bracket" (2–5).

### 3 — Stop orders (3.1.1–3.5.3)

**Scenarios**

| Scenario                            | Cases                             | Tier · tool          | Today                                                                                                                                                                                                                      | To add                                                                                                                                                                                                                                                            | Step |
| ----------------------------------- | --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-3-1 Stop buy / stop sell trigger | 3.1.1, 3.1.2, 3.1.3, 3.2.1, 3.2.2 | T1 ✅ + T2 ✅        | `actions.test` "3.1 Stop Buy placement and fill", "3.2 Stop Sell placement and fill"; `triggers.test` "checkPendingTrigger() — Stop Buy" / "— Stop Sell"; `fees.test` "stop — triggers on last, fills at the ask as taker" | No action. Catalogue note: Section 3's intro cites `paperStore.test.ts`; since BP-1 these tests are in `actions.test.ts`                                                                                                                                          | —    |
| SC-3-2 Stop cancel                  | 3.3.1, 3.3.2                      | T1 ✅                | `actions.test` "3.3 Cancel stop order"                                                                                                                                                                                     | No action                                                                                                                                                                                                                                                         | —    |
| SC-3-3 Stop with a bracket          | 3.4.1, 3.4.2                      | T1 ✅                | `actions.test` "3.4 Stop buy with TP + SL bracket"                                                                                                                                                                         | No action                                                                                                                                                                                                                                                         | —    |
| SC-3-4 Stop edge cases              | 3.5.1, 3.5.2, 3.5.3               | T1 ✅ + T2 ✅        | `TradingPanel.test` "3.5 Stop order direction warnings", "3.5 Edge cases"; `actions.test` "3.5 Multiple stop orders coexist"                                                                                               | No action. Catalogue note: 3.5.1 says "validation error"; the form shows an immediate-fill **warning** with "Place anyway" — align the row. `TradingPanel.test` also labels its Stop-Sell-above-market test "3.5.2", which in Part B is "multiple pending orders" | —    |
| NEW-3-1 Stop sell above market      | —                                 | T2 ✅ (uncatalogued) | `TradingPanel.test` "3.5.2: Stop Sell above market price shows immediate-fill warning…"                                                                                                                                    | Add as its own Part B row and renumber the test title                                                                                                                                                                                                             | —    |

**Not automatable.** None.

**UI reproduction** — fake feed, Isolated 10×.

1. [trade.type.stop] → [trade.side.buy] → [trade.price] `50500` → [trade.amount] `0.1` → [trade.submit] → Expect
   Working: STOP / BUY. _Explain: "A stop buy waits for a breakout above the price, then buys at market."_
2. `feed quote linear BTCUSDT bid=50500 ask=50510 last=50500` **(fake feed)** → Expect a LONG filled at `50,510`
   (the ask, taker). _Explain: "When the stop triggers it becomes a market order, so it fills at the ask."_
3. A stop buy **below** the Buy price → Expect the "will fill immediately — Use a Limit Buy" warning.
4. Place a stop far away, [orders.row.cancel] → Expect the reserve refunded in full.

**Guided trade:** yes — "Catch a breakout with a stop order" (steps 1–2).

### 4.17–4.18 — Editing an order or a position's TP / SL

**Scenarios**

| Scenario                                             | Cases      | Tier · tool           | Today                                                                                                                                                                                                                            | To add                                                                                                                                                                                                                                                                                                                                         | Step |
| ---------------------------------------------------- | ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-4-8 Edit a pending bracket and a position's exits | 4.17, 4.18 | T1 ✅ + T2 ✅ + T3 ✅ | `actions.test` "4.17 Edit pending bracket order — rich journal entries", "4.18 Edit open position TP/SL — rich journal entries"; `PendingOrderEditPanel.test`; `PositionEditPanel.test`; M5b `perp/editOrders.spec` [4.17][4.18] | `e2e/perp/editOrders.spec.ts` @full: `orders.row.edit` on a limit 0.1 @ 49,000 → `order-edit.price` 49,100 → journal `Modified LIMIT Long BTCUSDT — price $49000.00 → $49100.00, reserved …`; `positions.row.edit-exits` → TP 52,000 → journal summary + "Take-Profit modification confirmed"; SL toggled off → Cancelled row in Order History | P2   |

**Not automatable.** None.

**UI reproduction** — one pending limit with TP / SL and one open position.

1. [orders.row.edit] (pencil) → [order-edit.price] +100 → [order-edit.confirm] → Expect a journal summary line with
   the old → new price and reserve. _Explain: "You can move a waiting order instead of cancelling it."_
2. [positions.row.edit-exits] → [pos-edit.tp] a new price → [pos-edit.confirm] → Expect the new TP in the row and two
   journal lines. Turn the SL off → Expect a Cancelled SL row in Order History.

**Guided trade:** yes — "Move your take-profit" (step 2).

### 14.5 — Per-symbol leverage

**Scenarios**

| Scenario                      | Cases          | Tier · tool   | Today                                                                                                                | To add                                                                                                                        | Step |
| ----------------------------- | -------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-14.5-1 Leverage per symbol | 14.5.1, 14.5.2 | T1 ✅ + T2 ✅ | `fees.test` "per-symbol leverage"; `TradingPanel.test` "BP-2 — market tabs and leverage" (14.5.2 superseded by 15.5) | No action; F10 baseline of the leverage modal                                                                                 | P2   |
| NEW-14.5-1 Leverage bounds    | —              | T2 + T1       | —                                                                                                                    | `leverage.input` 0, 11 (the modal says "max 10×") and 2.5 → refused inline; the server refuses the same values (route schema) | P2   |

**UI reproduction.**

1. On ETHUSDT, [trade.leverage-chip] → [leverage.input] `5` → [leverage.confirm] → Expect the chip `… 5x`.
2. Switch to BTCUSDT → Expect BTC keeps its own leverage. _Explain: "Leverage is set per symbol, like on Bybit."_

**Guided trade:** yes — part of "Set your leverage and margin mode" (with SC-15.5 and SC-17.5).

### 14.2, 14.3, 14.4 — Fees, fill prices, size rules

**Scenarios**

| Scenario                                  | Cases                                                  | Tier · tool             | Today                                                                                                                                                                                                                                                 | To add                                                                                                                                                       | Step |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| SC-14.2-1 Taker open and close            | 14.2.1, 14.2.2                                         | T1 ✅ (+ T3 via SC-1-1) | `fees.test` "market open — 10×, qty 0.1 at ask 50,000"                                                                                                                                                                                                | No action — SC-1-1's balance `9,494.78` / `10,094.45` checks the same numbers in the browser                                                                 | —    |
| SC-14.2-2 Maker limit, reserve and refund | 14.2.3, 14.2.4                                         | T1 ✅                   | `fees.test` "resting limit — fills at its own price as maker (F4)"                                                                                                                                                                                    | No action                                                                                                                                                    | —    |
| SC-14.2-3 Form estimate                   | 14.2.5                                                 | T2 ✅                   | `TradingPanel.test` 1.1.1; `orderMath.test` "orderPreview()", "fee labels"                                                                                                                                                                            | No action                                                                                                                                                    | —    |
| SC-14.2-4 Old fees never recomputed       | 14.2.6                                                 | T1 ✅                   | `fees.test` "never recompute: pre-BP-2 rows keep the 0.07% they paid"                                                                                                                                                                                 | No action                                                                                                                                                    | —    |
| SC-14.3-1 Fill prices                     | 14.3.1, 14.3.2, 14.3.3, 14.3.4, 14.3.5, 14.3.6, 14.3.7 | T1 ✅ (+ T4)            | `services.test` "TradingService" / "MatchingEngine"; `fees.test` "crossing limit — trades now as a taker", "stop — triggers on last…"; `triggers.test` "live triggers — fire on the last price, fill like Bybit", "evaluateCandle() — backfill sweep" | No action; the nightly parity run (SC-17.6-2) compares fill prices with Bybit                                                                                | —    |
| SC-14.4-1 Bybit size rules                | 14.4.1, 14.4.2, 14.4.3, 14.4.4                         | T1 ✅ + T2              | `fees.test` "Bybit's size rules (F9)"; `spot.test`                                                                                                                                                                                                    | Add T2: each 422 text appears in `trade.error` without clearing the form (only the 409 path is tested: `TradingPanel.test` "server rejection")               | P2   |
| NEW-14.2-1 Fees on the minimum size       | —                                                      | T1p                     | —                                                                                                                                                                                                                                                     | Property (F7): for any qty on the step and price on the tick, fee = qty × price × rate exactly to 8 dp (Decimal), open + close fees never exceed the reserve | P4   |

**Not automatable.** None.

**UI reproduction** — fake feed, Isolated 10×.

1. [trade.amount] `0.1` → Expect [trade.preview.fees] "taker 0.055% · maker 0.02%" and a cost that includes both fee
   estimates. _Explain: "Market orders pay the taker fee; resting limit orders pay the lower maker fee."_
2. Market buy → [account.tab `orderhistory`] → Expect commission `2.75` "0.055% taker".
3. [trade.amount] `0.0001` → [trade.submit] → Expect "Order quantity lower than the minimum (0.001)". [trade.price]
   `10000.05` on a limit → Expect "Order price decimal too long (tick size 0.1)".
4. `feed quote linear BTCUSDT … ` then stall 15 s **(fake feed)** → market buy → Expect "Waiting for live price…".

**Guided trade:** partly — step 1–2 as "What a trade costs"; steps 3–4 are tester checks.

### 15.2 — One-way mode

**Scenarios**

| Scenario                                  | Cases          | Tier · tool | Today                                                                         | To add                                                                                                                                                                                                                          | Step |
| ----------------------------------------- | -------------- | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-15.2-1 Same-side orders merge          | 15.2.1, 15.2.2 | T1 ✅       | `actions.test` "netting (one-way positions)"; `fillInto`                      | No action. T3 check folded into SC-11-1 (two buys → one row)                                                                                                                                                                    | —    |
| SC-15.2-2 Migration merges old duplicates | 15.2.3         | T2i ✅      | `migrationReplay.int.test` "[15.2.3] merges three same-side BTC longs…" (P1b) | Done. Was: `migrations.int.test.ts` (F6): seed three same-side BTC longs pre-BP-3 → after migrate: one position, qty summed, qty-weighted entry, newest TP / SL, one journal line, `SymbolSetting.leverage` = position leverage | P1   |

**UI reproduction.**

1. Buy 0.01 at 50,000, then `feed quote … ask=60000`, buy 0.005 → Expect **one** LONG row qty `0.015`, entry
   `53,333.33`, journal "Added to LONG …". _Explain: "One position per symbol: a second buy adds to it and averages
   the entry."_

**Guided trade:** yes — "Adding to a position" (one step, after "Your first long").

---

## Stage 4 — Risk management

Worked position again: **long 0.1 BTC @ 50,000, Isolated 10×** — IM 500, fee to close 2.475, BTCUSDT tier-1 MMR
0.33% → liq **45,149.0**, bankruptcy **45,000** (the short mirror: **54,819.0**). Since PR #163 the liquidation
price is rounded to the 0.1 tick on the safe side (long up, short down), and IM includes margin added by hand.
The price-control endpoint is what makes this stage testable end to end: on live prices nobody waits for a 10% move.

### 15.1 — Mark price

**Scenarios**

| Scenario                                        | Cases                  | Tier · tool           | Today                                                                                                                                                                                                                                                                                 | To add                                                                                                                                                                                                                    | Step |
| ----------------------------------------------- | ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-15.1-1 PnL on the mark, triggers on the last | 15.1.1, 15.1.2, 15.1.3 | T1 ✅ + T2 ✅ + T3 ✅ | `OrderAccountManagementPanel.test` "BP-3 — mark price, liquidation price and MMR in the Positions tab"; `paperStore.test` "applyDelta()" (server `prices` push); `liquidation.test` "evaluateTick — liquidation on the mark price"; M5c `risk/risk.spec` [15.1.1][15.1.2] on LINKUSDT | `e2e/risk/markPrice.spec.ts` @full: `feed quote linear BTCUSDT bid=50499.9 ask=50500 last=50500 mark=50000` → `positions.row.mark` `50,000`, `positions.row.pnl` `0.00` (not +50); a TP at 50,400 fires on the last price | P2   |

**Not automatable.** None.

**UI reproduction** — fake feed, the worked long open.

1. `feed quote linear BTCUSDT bid=50499.9 ask=50500 last=50500 mark=50000` **(fake feed)** → Expect
   [positions.row.mark] `50,000` and PnL `0.00`, although the last price is 50,500. _Explain: "Perpetual PnL uses the
   mark price — a fair price that one big trade can't move — so a spike can't liquidate you."_
2. [symbolbar.mark] and [symbolbar.index] → Expect MARK 50,000. Live: MARK and the last price differ by a few dollars.

**Guided trade:** yes — "Mark price vs last price" (steps 1–2 on live prices, as an observe-only tour).

### 15.3 — Liquidation and bankruptcy prices

**Scenarios**

| Scenario                      | Cases                          | Tier · tool          | Today                                                                                                                                                                                                         | To add                                                                                                                          | Step |
| ----------------------------- | ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-15.3-1 Bybit's formulas    | 15.3.1, 15.3.2, 15.3.4, 15.3.5 | T1 ✅                | `bybitSpec.test` "isolated margin — Bybit's worked example (BP-3)", "bybitSpec"; `liquidation.test` "liquidation and bankruptcy prices"                                                                       | No action; F7 adds "liq price moves toward the mark as leverage rises"                                                          | P4   |
| SC-15.3-2 Liq price on screen | 15.3.3, 15.3.6, 15.3.7         | T2 ✅ + T3 visual ✅ | `TradingPanel.test` "BP-3 — liquidation in the USDT Perpetual form"; `OrderAccountManagementPanel.test` "BP-3 …", "migrateColPrefs()"; M5e `visual.spec`: the perp order form shows "Est. liq. price $45,149" | F10 baseline of the order form with "Est. liq. price $45,158.1" (ask 50,010) and of a Positions row with Liq. Price + MMR meter | P2   |

**Not automatable.** None.

**UI reproduction.**

1. `feed quote linear BTCUSDT bid=50009.9 ask=50010 mark=50010` → [trade.amount] `0.1` → Expect [trade.preview.liq]
   `$45,158.1` in amber with an ⓘ. _Explain: "If the mark price falls to this level, the position is closed and you
   lose its margin."_
2. Open it → Expect [positions.row.liq] ≈ `45,158` and the MMR meter.
3. Leverage 1× → Expect liq `—`. Live: liq ≈ entry × (1 − 1/leverage + MMR) for a long, rounded up to the
   tick (the form's number is the reference).

**Guided trade:** yes — part of "What liquidation means" (with 15.4).

### 15.4 — Liquidation in the engine

**Scenarios**

| Scenario                                            | Cases                  | Tier · tool               | Today                                                                                                                                                                                                                                 | To add                                                                                                                                                                                                                                                                                                                            | Step |
| --------------------------------------------------- | ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-15.4-1 Liquidation seen in the browser           | 15.4.1, 15.4.2         | T1 ✅ + T2 ✅ + T3 ✅     | `liquidation.test` "liquidatePosition — the whole position margin is lost"; `OrderAccountManagementPanel.test` "BP-5 D — Closed P&L tab"; M5c `risk/risk.spec` [15.4.1][15.4.2] on LINKUSDT (liq `$18.122`; the balance is unchanged) | `e2e/risk/liquidation.spec.ts` @full: worked long; `feed quote linear BTCUSDT bid=45100 ask=45100.1 mark=45140` → within 2 s the row is gone; Order History type "Liquidation"; `closed-pnl.exit-type` "Liquidation", `closed-pnl.value` ≈ `−505.23`; balance unchanged at `9,494.78`; `notice.liquidation` shown until dismissed | P2   |
| SC-15.4-2 Engine liquidation rules                  | 15.4.3, 15.4.4, 15.4.6 | T1 ✅                     | `liquidation.test` "evaluateCandle — backfilled liquidation (mark-price candles)"; `services.test` "MatchingEngine"                                                                                                                   | No action                                                                                                                                                                                                                                                                                                                         | —    |
| SC-15.4-3 Stale mark never liquidates               | 15.4.5                 | T1 ✅ (re-tiered from T3) | `services.test` "MatchingEngine" (runTrigger); M5d: not reproducible end to end — the server stamps `seenAt` on arrival, so a mark is stale only when no ticker arrives, and then nothing triggers a check                            | `e2e/resilience/staleMark.spec.ts` @full: `feed quote … mark=45000 ageMs=15000` (the control stamps the ticker 15 s old) → position still open after 3 s; a fresh mark 45,000 → liquidated                                                                                                                                        | P2   |
| SC-15.4-4 Sound and notices                         | 15.4.7, 15.4.8         | T2 ✅                     | `usePaperFeed.test`; `TradingPanel.test` "BP-3 — liquidation in the USDT Perpetual form"                                                                                                                                              | No action                                                                                                                                                                                                                                                                                                                         | —    |
| SC-15.4-5 Deploy with a position past its liq price | 15.4.9                 | M ✅ (one-off)            | Checked at the BP-3 deploy, 2026-09-27                                                                                                                                                                                                | No action — a one-off deploy event. If the engine's start-up path changes, add a T2i: start `MatchingEngine` with a stored position past its liq price → liquidated on the first mark tick                                                                                                                                        | —    |
| NEW-15.4-1 Liquidation while the tab is closed      | —                      | T3                        | —                                                                                                                                                                                                                                     | Like SC-13.2-1: open the worked long, close the page, drive the mark to 45,140, reopen → Closed P&L "Liquidation" and the liquidation notice                                                                                                                                                                                      | P2   |

**Not automatable.** None.

**UI reproduction** — fake feed, worked long open. On live prices a liquidation can't be produced on demand; the
fake feed is the intended route (a tour explains the numbers instead, see below).

1. `feed quote linear BTCUSDT bid=45100 ask=45100.1 mark=45140` **(fake feed)** → Expect the position disappears, the
   liquidation sound, [notice.liquidation]. _Explain: "The mark crossed the liquidation price, so the whole position
   closed at the bankruptcy price 45,000."_
2. [account.tab `closedpnl`] → Expect Exit Type "Liquidation", ≈ `−505.23`. _Explain: "You lose the margin (500), the
   fee to close (2.475) and the opening fee (2.75)."_
3. [account.tab `orderhistory`] → Expect a "Liquidation" row; the TP / SL were cancelled.

**Guided trade:** yes — "What liquidation means" as an observe-only tour on live prices (explain the numbers on the
form and the row, never force a liquidation).

### 15.5 — Re-margining on a leverage change

**Scenarios**

| Scenario                         | Cases                          | Tier · tool   | Today                                                                                                                                | To add                                                                                                                                                                                                                         | Step |
| -------------------------------- | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| SC-15.5-1 Engine re-margining    | 15.5.1, 15.5.2, 15.5.3, 15.5.4 | T1 ✅         | `fees.test` "leverage change with an open position — re-margining (BP-3)", "a pending order keeps its own leverage"; `services.test` | No action                                                                                                                                                                                                                      | —    |
| SC-15.5-2 Leverage modal preview | 15.5.5                         | T2 ✅ + T3 ✅ | `TradingPanel.test` "BP-5 E — margin mode in the leverage chip and modal"; M5c `risk/risk.spec` [15.5.5] ($502.48 → $1002.20)        | `e2e/risk/remargin.spec.ts` @full: worked long; chip → 5 → `leverage.preview` "Position margin $500 → $1,000" and a Liq. price A → B; Confirm → the Positions row shows margin `1,000` and liq = B; available down by `499.73` | P2   |

**UI reproduction.**

1. With the worked long, [trade.leverage-chip] → [leverage.input] `5` → Expect [leverage.preview] "Position margin
   $500 → $1,000" and a lower liq price. _Explain: "Lower leverage puts more margin behind the position and moves the
   liquidation price away."_
2. [leverage.confirm] → Expect the row updated and the balance down `499.73`.
3. With too little balance → Expect "Insufficient available balance to change leverage …" inline.

**Guided trade:** yes — "Change leverage on an open position".

### 15.6 — Chart lines

**Scenarios**

| Scenario                         | Cases                          | Tier · tool    | Today                                                                                              | To add                                                                                                                                                                                                                                                                                        | Step |
| -------------------------------- | ------------------------------ | -------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-15.6-1 Lines and dragging     | 15.6.1, 15.6.3, 15.6.4, 15.6.5 | T1 ✅ + T2 ✅  | `tradeLines.test` "buildTradeLines()", "hitTestTradeLine()", "roundToTick()"; `useTradeLines.test` | No action                                                                                                                                                                                                                                                                                     | —    |
| SC-15.6-2 Mark price line toggle | 15.6.2                         | T3 ✅ (toggle) | — M5d `chart/chart.spec` [15.6.2]; the line itself → M5e screenshot                                | `e2e/chart/markLine.spec.ts` @full: `chart.type-menu` → `chart.mark-line` shows "✓ Mark price line" by default on a perp pane; click → no ✓; reload → still off; on a Spot pane the item is absent. The line itself → F10 screenshot of the pane with a frozen feed (canvas can't be queried) | P2   |
| SC-15.6-3 Drag feel              | 15.6.6                         | M              | Checked at BP-3                                                                                    | Stays M — see below                                                                                                                                                                                                                                                                           | —    |

**Not automatable.** 15.6.6 (ns-resize cursor, no chart pan while dragging, label legibility): M, per UI release
touching `useTradeLines.ts` / `TradeLineAmend.tsx`. Checklist: drag a TP line up and down on Chrome and Safari with a
mouse and a trackpad; Cancel restores it; Confirm moves it by whole ticks. A screen recording attached to the release
PR is the evidence.

**UI reproduction.**

1. Perp pane with the worked long + a limit order → Expect entry, TP / SL (dashed), Liq. (amber dashed), the order
   (dotted) and Mark lines.
2. Drag the TP line → Expect a Confirm / Cancel prompt; Confirm → the TP moves by whole ticks.
3. [chart.type-menu] → [chart.mark-line] → Expect the Mark line hides.

**Guided trade:** partly — "Manage a trade from the chart" (step 2) once drag works on touch; desktop-only today.

### 17.1 — Add / reduce margin (isolated)

**Scenarios**

| Scenario                            | Cases          | Tier · tool           | Today                                                                                                                                                         | To add                                                                                                                                                                                                                       | Step |
| ----------------------------------- | -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-17.1-1 Add margin in the browser | 17.1.1         | T1 ✅ + T2 ✅ + T3 ✅ | `margin.test` "adjustMargin() — add"; `OrderAccountManagementPanel.test` "BP-5 A — add / reduce margin from the Positions row"; M5c `risk/risk.spec` [17.1.1] | `e2e/risk/addMargin.spec.ts` @full: `positions.row.adjust-margin` → `margin.mode` add → `margin.amount` 1000 → `margin.confirm` → liq ≈ `35,110`, available −1,000, leverage chip unchanged, journal + Balance History lines | P2   |
| SC-17.1-2 Reduce rules              | 17.1.2, 17.1.3 | T1 ✅                 | `margin.test` "adjustMargin() — reduce", "extra margin through the position's life (Bybit)"                                                                   | No action                                                                                                                                                                                                                    | —    |
| SC-17.1-3 Not in cross              | 17.1.4         | T1 ✅ + T3 ✅         | `cross.test`; live ✓ (422); M5c `advanced/advanced.spec` [17.5.6][17.1.4]                                                                                     | One assertion in SC-17.5-2's spec: in Cross, `positions.row.adjust-margin` is absent                                                                                                                                         | P2   |
| NEW-17.1-1 Reduce boundary          | —              | T1                    | —                                                                                                                                                             | Reduce exactly the max reducible → accepted; + 0.01 → 110078                                                                                                                                                                 | P2   |

**UI reproduction.**

1. Worked long, Isolated → [positions.row.adjust-margin] → [margin.mode `add`] → [margin.amount] `1000` → Expect
   [margin.preview] a new liq ≈ `35,110`. _Explain: "Adding margin pushes the liquidation price further away without
   changing the position size."_
2. [margin.confirm] → Expect the row's Liq. Price updated and the balance −1,000.
3. [margin.mode `reduce`] → Expect "Max reducible (margin you added)".

**Guided trade:** yes — "Add margin to survive a move".

### 17.2 — Trigger source, reduce-only, TP / SL side

**Scenarios**

| Scenario                                   | Cases                  | Tier · tool   | Today                                                                                                                                                                 | To add                                               | Step |
| ------------------------------------------ | ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- |
| SC-17.2-1 Trigger source                   | 17.2.1, 17.2.2         | T1 ✅         | `orderRules.test` "BP-5 B — TP / SL and stops trigger on the price they are set to"; `services.test`                                                                  | No action                                            | —    |
| SC-17.2-2 Reduce-only and close-on-trigger | 17.2.3, 17.2.4, 17.2.5 | T1 ✅ + T2 ✅ | `orderRules.test` "BP-5 B — reduce-only and close-on-trigger"; `TradingPanel.test` "BP-5 B — order flags and trigger source (USDT Perpetual)"                         | No action; SC-17.4-1's smoke uses a reduce-only sell | —    |
| SC-17.2-3 TP / SL side and SL past liq     | 17.2.6, 17.2.7         | T1 ✅ + T2 ✅ | `orderRules.test` "BP-5 B — TP / SL must be on the right side of the base price (O9)"; `triggers.test` "O9: …"; `PositionEditPanel.test` "PositionEditPanel (BP-5 B)" | No action                                            | —    |

**UI reproduction.**

1. [trade.tp.source] → Mark → Expect the TP labelled "Mark". _Explain: "Choose which price triggers your TP / SL: Last
   (default), Mark or Index."_
2. [trade.reduce-only] with no position → Expect "Reduce-only needs an open position on this symbol to reduce".
3. [trade.type.stop] → Expect [trade.close-on-trigger] offered.
4. [positions.row.edit-exits] → SL below the liq price → Expect the amber warning ([pos-edit.warning]).

**Guided trade:** partly — "Reduce-only closes, never opens" (step 2) is useful; trigger source is advanced.

### 17.3 — Risk tiers

**Scenarios**

| Scenario                                    | Cases                  | Tier · tool          | Today                                                                                                                                          | To add                                                                                | Step |
| ------------------------------------------- | ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| SC-17.3-1 Tier caps and partial liquidation | 17.3.1, 17.3.2, 17.3.3 | T1 ✅ (+ T4)         | `riskTiers.test` "BP-5 C — risk-limit cap (110090)", "BP-5 C — partial liquidation steps down the tiers (O7)"                                  | No action; the parity run answers the open 110090 retCode question (SC-17.6-2)        | —    |
| SC-17.3-2 Tier info in the modal            | 17.3.4                 | T2 ✅ + T3 visual ✅ | `TradingPanel.test` "BP-5 C — tier info in the leverage modal (O6)"; screenshot ✓; M5e `visual.spec` `leverage-modal.png` (with the tier line) | F10 baseline of the modal with `leverage.tier-info`, replacing the one-off screenshot | P2   |

**UI reproduction.**

1. [trade.leverage-chip] → Expect tier, MMR and the max position value at the chosen leverage ([leverage.tier-info]).
   _Explain: "Bigger positions need more maintenance margin, so the maximum leverage falls as size grows."_
2. Hover the MMR meter in a Positions row → Expect the same tier.

**Guided trade:** no — reference information, not an action.

### 17.4 — Closed P&L

**Scenarios**

| Scenario                             | Cases  | Tier · tool                | Today                                                                                                                                                                         | To add                                                                                                                                                                                                                                                                                                | Step |
| ------------------------------------ | ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-17.4-1 Partial close in the smoke | 17.4.1 | T1 ✅ + T3 ✅              | `mappers.test` "mappers — BP-5 D Closed P&L"; live ✓; M5d `advanced/advanced.spec` [17.4.1] (on ADAUSDT: `+47.2225 USDT`), not in the smoke — the smoke's BTC price is shared | In `perpOpenClose.spec.ts` @smoke, before the full close: reduce-only market sell 0.05 at bid 51,000 → `closed-pnl.row` qty `0.05`, `closed-pnl.value` `+47.22` (PnL 50 − open-fee share 1.375 − close fee 1.4025); hover shows that breakdown; the second close adds another `+47.22` (total 94.445) | P2   |
| SC-17.4-2 Liquidation in Closed P&L  | 17.4.2 | T2 ✅ (+ T3 via SC-15.4-1) | `OrderAccountManagementPanel.test` "BP-5 D — Closed P&L tab"                                                                                                                  | No action                                                                                                                                                                                                                                                                                             | —    |

**UI reproduction.**

1. Worked long; `feed quote linear BTCUSDT bid=51000 ask=51000.1 mark=51000` **(fake feed)**.
2. [trade.side.sell] → [trade.reduce-only] → [trade.amount] `0.05` → [trade.submit] → [account.tab `closedpnl`] →
   Expect a row qty `0.05`, `+47.22`; hover → PnL 50.00, open fee −1.375, close fee −1.4025. _Explain: "Closed P&L is
   what a close really made, after both fees and any funding."_ Live: closedPnl = (exit − entry) × qty − open fee ×
   share − qty × exit × 0.00055 − funding.

**Guided trade:** yes — "Take partial profit and read Closed P&L".

---

## Stage 5 — Advanced

### 16 — Funding

Worked position: long 0.1 BTC at 10× (IM 500), mark 51,000, rate 0.01% → fee **0.51**.

**Scenarios**

| Scenario                                         | Cases                                                          | Tier · tool                   | Today                                                                                                                                                                                                                                                            | To add                                                                                                                                                                                                                                                                                                        | Step |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-16-1 A long pays funding, seen in the browser | 16.1.1                                                         | T1 ✅ + T2 ✅ + T3 ✅         | `funding.test` "settleFunding — who pays"; `OrderAccountManagementPanel.test` "BP-4 — funding in the Positions tab"; M5c `advanced/advanced.spec` [16.1.1] on ADAUSDT (`−0.51`)                                                                                  | `e2e/advanced/funding.spec.ts` @full: worked long, `feed quote linear BTCUSDT … mark=51000`, `feed funding BTCUSDT rate=0.0001 inSeconds=5` → after the timestamp `positions.row.funding` `−0.51` (red), balance −0.51, journal and Balance History lines; a second run of the same timestamp changes nothing | P2   |
| SC-16-2 Settlement rules                         | 16.1.2, 16.1.3, 16.1.4, 16.1.5, 16.1.6, 16.1.7, 16.1.8, 16.1.9 | T1 ✅                         | `funding.test` "settleFunding — who pays", "— once per timestamp", "— where the money comes from"; `services.test` "funding (BP-4)"                                                                                                                              | No action                                                                                                                                                                                                                                                                                                     | —    |
| SC-16-3 Backfill, closes, history                | 16.2.1, 16.2.2, 16.2.3, 16.2.4, 16.2.5                         | T1 ✅                         | `services.test` "funding (BP-4)"; `funding.test` "funding and Closed P&L"; `infra.test` "fetchFundingHistory() (BP-4)"                                                                                                                                           | No action                                                                                                                                                                                                                                                                                                     | —    |
| SC-16-4 Funding on screen                        | 16.3.1, 16.3.2, 16.3.3                                         | T2 ✅ + T3 visual ✅ (column) | `SymbolBar.test` "SymbolBar — USDT Perpetual stats (BP-4)"; `funding.test` (client lib) "formatFundingCountdown()", "formatFundingRate()"; `columnPrefs` tests; M5e `visual.spec` Positions rows show the Funding column; a non-zero funding look isn't captured | F10 baseline of the perp SymbolBar with `page.clock` frozen (replaces "screenshot ✓")                                                                                                                                                                                                                         | P2   |
| NEW-16-1 Countdown rollover                      | —                                                              | T2                            | `formatFundingCountdown()` is tested, the ticking isn't                                                                                                                                                                                                          | Fake timers across `nextFundingTime` → the countdown jumps to the next interval, never shows a negative or `00:00:00` for more than a second                                                                                                                                                                  | P2   |
| NEW-16-2 Non-8-hour funding interval             | —                                                              | T1                            | —                                                                                                                                                                                                                                                                | A symbol whose instrument says `fundingIntervalMin: 240` settles every 4 h (timestamps from the instrument, not a constant)                                                                                                                                                                                   | P2   |

**Not automatable.** None.

**UI reproduction** — fake feed, worked long open.

1. [symbolbar.funding] → Expect "0.0100% / 00:00:05" counting down (fake feed) — live: the current rate and the time
   to
   the next 00:00 / 08:00 / 16:00 UTC. _Explain: "Every 8 hours longs pay shorts (or the reverse when the rate is
   negative) to keep the perpetual close to spot."_
2. `feed funding BTCUSDT rate=0.0001 inSeconds=5` **(fake feed)**, wait 6 s → Expect [positions.row.funding] `−0.51`
   and a Balance History line. _Explain: "0.1 BTC × 51,000 × 0.01% = 0.51 USDT."_ Live: fee = qty × mark at the
   timestamp × rate.
3. Switch the pane to Spot → Expect no MARK / INDEX / FUNDING stats.

**Guided trade:** yes — "What funding costs you" (observe-only on live prices, steps 1 and 3; step 2 explained, not
forced).

### 17.5 — Cross margin

**Scenarios**

| Scenario                                    | Cases                          | Tier · tool       | Today                                                                                                                                                                                                                                      | To add                                                                                                                                                                                                                                                                                                                      | Step |
| ------------------------------------------- | ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-17.5-1 New vs migrated accounts          | 17.5.1                         | T2 ✅ + T2i ✅    | `paperStore.test` "margin mode (BP-5 E)"; `migrationReplay.int.test` "[17.5.1] …" ×2 (P1b)                                                                                                                                                 | `migrations.int.test.ts` (F6): a pre-BP-5 account migrates to `ISOLATED_MARGIN` with the notice flag set; a new account is `REGULAR_MARGIN`. T3 half: the seeded new user sees no `notice.cross-margin`, a migrated one does                                                                                                | P1   |
| SC-17.5-2 Mode switch in the browser        | 17.5.6                         | T1 ✅ + T3 ✅     | `cross.test` "BP-5 E — margin-mode switch (Bybit set-margin-mode, O3)"; live ✓; M5c `advanced/advanced.spec` [17.5.6]: the refusal is tested with a reason (mark below the isolated liq) — a healthy position may switch back, as on Bybit | `e2e/advanced/marginMode.spec.ts` @full: Isolated long with 1,000 added → chip → `leverage.mode` cross → Confirm → available +1,000 (added margin released), `positions.row.adjust-margin` absent (17.1.4); back to Isolated with a position → `leverage.error` lists every reason; choosing the current mode sends nothing | P2   |
| SC-17.5-3 Cross maths                       | 17.5.2, 17.5.3, 17.5.4, 17.5.5 | T1 ✅             | `cross.test` "BP-5 E — cross account figures…", "— order acceptance and losses in cross", "— account liquidation at a 100% MM rate"; `bybitSpec.test` "cross account figures (BP-5 E) — server and client estimate agree"                  | No action                                                                                                                                                                                                                                                                                                                   | —    |
| SC-17.5-4 Cross UI                          | 17.5.7                         | T2 ✅ + T3 visual | `TradingPanel.test` "BP-5 E — margin mode in the leverage chip and modal"; `OrderAccountManagementPanel.test` summary bar                                                                                                                  | F10 baselines: `Cross 10x` chip, mode tabs + explainer, summary bar (Margin balance / IM rate / MM meter)                                                                                                                                                                                                                   | P2   |
| NEW-17.5-1 Cross liquidation in the browser | —                              | T3                | —                                                                                                                                                                                                                                          | Cross, long BTC + long ETH; `feed path linear BTCUSDT …` down until `account.summary.mm-rate` reaches 100% → orders cancelled, BTC stepped down first, account ≥ 0, one notice                                                                                                                                              | P2   |

**Not automatable.** None.

**UI reproduction** — signed in as a **new** account (starts in Cross).

1. [trade.leverage-chip] → Expect `Cross 10x`; the modal shows **Cross | Isolated** tabs with an explainer. _Explain:
   "Cross shares your whole balance between positions; Isolated limits each position's loss to its own margin."_
2. Open the worked long → Expect [account.summary.mm-rate] and an estimated cross liq price; no Add margin pencil.
3. Switch to [leverage.mode `isolated`] with the position open → Expect the refusal listing the reasons.
4. Old account: Expect the one-time [notice.cross-margin] with "How it works" / "Switch to Cross".

**Guided trade:** yes — "Cross or Isolated?" (steps 1–2).

### 11 — Multi-symbol PnL

**Scenarios**

| Scenario                                      | Cases                  | Tier · tool   | Today                                                                                                                                   | To add                                                                                                                                                                                                                                                                                                                                                                                                                                    | Step |
| --------------------------------------------- | ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-11-1 Two symbols, two panes, two positions | 11.1, 11.2, 11.3       | T2 ✅ + T3 ✅ | `paneStore.test` "lastKnownPrices" (keys only); M5c `advanced/advanced.spec` [11.1][11.2][11.8] (ADA + BTC by URL, not a 2-pane layout) | These rows are UI flows, not pure logic: T2 in new `…/dashboard/__tests__/MultiSymbolPnl.test.tsx` rendering `TradingPanel` + `OrderAccountManagementPanel` on `fakePaperApi` with a 2h layout (pane 0 BTC, pane 1 ETH): the form follows the active pane; placing on each adds a row (2 rows). T3 `e2e/advanced/multiSymbol.spec.ts` @full on the fake feed                                                                              | P2   |
| SC-11-2 Non-active symbols keep a live mark   | 11.4, 11.5, 11.6, 11.7 | T1            | `paneStore.test` "keeps spot and linear prices for the same symbol apart"                                                               | T1 in `apps/client/src/lib/__tests__/positionMath.test.ts` (or the helper the Positions tab uses): seed `setLastKnownMarkPrice` for `linear:ETHUSDT` (not `spot:` — the Section 11 intro predates BP-2; perp positions carry `linear` and price at the mark since BP-3); the ETH row's PnL uses it while BTC is active; after the ETH pane closes (layout `1`), a server `prices` push still moves it; summary Unrealized P&L = BTC + ETH | P2   |
| SC-11-3 Close a non-active symbol             | 11.8                   | T2 ✅ + T3 ✅ | —; M5c `advanced/advanced.spec` [11.8]                                                                                                  | `positions.row.close` on ETH while BTC is active → `fakePaperApi` close gets the ETH position id; Closed P&L row for ETHUSDT with its own exit price                                                                                                                                                                                                                                                                                      | P2   |

**Not automatable.** None.

**UI reproduction** — fake feed with BTC and ETH quotes (`feed quote linear ETHUSDT bid=2999.9 ask=3000 mark=3000`).

1. [layout.option `2h`]; pane 0 BTCUSDT, pane 1 ETHUSDT; click pane 0 → Expect the order form on BTCUSDT.
2. Buy 0.01 BTC; click pane 1; buy 0.1 ETH → Expect two Positions rows. _Explain: "You can hold positions in several
   symbols; each has its own row and PnL."_
3. Click pane 0; `feed quote linear ETHUSDT … mark=3100` **(fake feed)** → Expect the ETH row PnL `+10.00` although
   ETH
   isn't the active pane; [account.summary.upnl] = BTC PnL + 10.
4. [layout.option `1`] (BTC only); move ETH again → Expect the ETH row still updates.
5. [positions.row.close `linear:ETHUSDT`] → Expect a Closed P&L row for ETHUSDT.

**Guided trade:** yes — "Trade two symbols side by side" (steps 1–3).

### 10.4 — Sync options

**Scenarios**

| Scenario                                              | Cases                          | Tier · tool                        | Today                                                                                                                                                                                                                                  | To add                                                                                                                                                                                                                                                                                                                                                                                  | Step |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-10.4-1 Symbol and interval sync                    | 10.4.1, 10.4.2, 10.4.3         | T1 ✅                              | `layoutStore.test` "snaps all panes to active pane symbol when symbol sync is enabled", "updates only the target pane when sync.symbol is off", "snaps all panes to active pane interval when interval sync is enabled"                | No action — **flip the rows to ✅** (the tests exist)                                                                                                                                                                                                                                                                                                                                   | —    |
| SC-10.4-2 Sync toggles persist                        | 10.4.8                         | T1                                 | `layoutStore.test` persists chart type and category, not `sync`                                                                                                                                                                        | Add: toggle symbol + crosshair, `rehydrate()` from the written `cd-layout` → same `sync` object                                                                                                                                                                                                                                                                                         | P2   |
| SC-10.4-3 Crosshair and time-range sync on the canvas | 10.4.4, 10.4.5, 10.4.6, 10.4.7 | T3 ✅ (10.4.4–10.4.6; 10.4.7 open) | `chartSync.test` "isTimeSyncPeer", "canDriveTimeSync", "runPaneDataPush" (logic); M5d `chart/chartSync.spec` via `window.__cdCharts` (`VITE_E2E` builds only); found and fixed 10.4.5 (followers kept the crosshair after a mouse-out) | `e2e/layout/chartSync.spec.ts` @full: builds with `VITE_E2E=1` expose `window.__cdCharts[pane]` (visible logical range + last crosshair time, read-only, compiled out otherwise); hover pane 0 → every follower reports the same time; mouse out → all clear; pan / zoom pane 0 → ranges equal; toggling time sync on with different zooms → they snap. One F10 screenshot for the look | P2   |

**Not automatable.** The feel of synced panning (lag, jitter) on a slow laptop: M, per release touching
`MultiChartArea.tsx` / `chartSync.ts`.

**UI reproduction.**

1. [layout.option `4`] → [layout.picker] → [layout.sync `symbol`] → Expect every pane shows the active pane's symbol.
   _Explain: "Sync Symbol keeps all panes on one coin, e.g. to compare timeframes."_
2. [layout.sync `interval`] off, change one pane's interval → Expect only it changes.
3. [layout.sync `crosshair`] → hover a pane → Expect the crosshair on all panes at the same time.
4. [layout.sync `timeRange`] → zoom one pane → Expect all follow.
5. Reload → Expect the toggles as you left them.

**Guided trade:** partly — "Compare timeframes" (steps 1, 3) for chart-minded learners.

### 4.19–4.20 — Multi-pane TP / SL incidents

**Scenarios**

| Scenario                                   | Cases      | Tier · tool | Today                                                                                                                                                                                                    | To add                                                                                                                 | Step |
| ------------------------------------------ | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-4-9 A tick only triggers its own symbol | 4.19, 4.20 | T1 ✅       | `triggers.test` "evaluateTick() symbol isolation (4.18 regression)": "an ETH tick does NOT close a BTCUSDT position", "wrong-symbol SL typo: an ETH tick at 7500 does NOT close a BTC Long with SL=7800" | No action. Catalogue note: the rows cite `useTPSLMonitor.test.ts`, removed with BP-1; point them at `triggers.test.ts` | —    |

**Not automatable.** None. **UI reproduction:** not reproducible on purpose — the typo SL of 7,800 is now stopped by
the SL typo guard (1.7.11) and triggers run on the server per symbol. To see the guard: [trade.sl.price] `7800` on a
BTC order → Expect [trade.sl-confirm]. **Guided trade:** no.

---

## Stage 6 — Under the hood (for testers)

These sections are not learning steps, so none of them is a guided tour; their UI reproductions are tester
procedures.

### 12 — Market data per category

**Scenarios**

| Scenario                                    | Cases                          | Tier · tool            | Today                                                                                                                                                               | To add                                                                                                                                                                                                                                                  | Step |
| ------------------------------------------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-12.1-1 Spot bid / ask from `orderbook.1` | 12.1.1                         | T3 ✅                  | Feed verified on the WS 2026-09-26; M5d `feed/feedUi.spec` [12.1.1] (Spot tickers without bid / ask; the book gives Sell / Buy)                                     | `e2e/feed/spotQuotes.spec.ts` @full: the fake feed sends Spot `tickers` **without** bid / ask and `orderbook.1` with them (as Bybit does) → `trade.spread` shows a number, Sell = the book's bid                                                        | P2   |
| SC-12.1-2 History meets live with no step   | 12.1.2                         | T3 ✅ + T4             | — M5d `chart/chartSync.spec` [12.1.2] (steps of exactly 60 s); the "equal to Bybit" half is SC-6-1                                                                  | T3: fixture history ends at candle N, the live stream continues at N+1; `window.__cdCharts[0]` (the `VITE_E2E` hook of SC-10.4-3) returns strictly increasing times with no gap or duplicate. The "equal to Bybit" half is the feed parity job (SC-6-1) | P2   |
| SC-12.1-3 Cached quote on connect           | 12.1.3                         | T3 ✅ (the cache half) | — M5d `feed/feedUi.spec` [12.1.3]: the reload shows the cached quote; the "cleared on disconnect" half would need the global feed `drop`, which cuts parallel specs | `feed quote spot BTCUSDT … repeat=false` then silence; reload → `trade.spread` shows the number within 1 s, before any new push; `feed drop spot` → a reload shows `—` (the cache is cleared on disconnect)                                             | P2   |
| SC-12.1-4 Persisted layout category         | 12.1.4, 12.1.5                 | T1 ✅                  | `layoutStore.test` "persisted category", "setPaneCategory()"                                                                                                        | No action                                                                                                                                                                                                                                               | —    |
| SC-12.2-1 Linear REST / WS validation       | 12.2.1, 12.2.2, 12.2.4         | T1 ✅                  | `market.test` "GET /api/market/candles", "WS /api/market/ws — category"                                                                                             | No action                                                                                                                                                                                                                                               | —    |
| SC-12.2-2 Linear ticker fields              | 12.2.3                         | T1 (re-tier from T3)   | Verified live with a WS probe                                                                                                                                       | Extend `market.test` "WS /api/market/ws — category" with a mocked Bybit linear ticker → the client message carries `bid`, `ask`, `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTime`, `fundingIntervalHour`. The live half is SC-6-1            | P2   |
| SC-12.2-3 Superseded devtools checks        | 12.2.5, 12.2.6                 | ➖                     | Superseded by the BP-2 market switch                                                                                                                                | No action                                                                                                                                                                                                                                               | —    |
| SC-12.3-1 Instruments and risk limits       | 12.3.1, 12.3.2, 12.3.3, 12.3.4 | T1 ✅                  | `market.test` "GET /api/market/instruments", "GET /api/market/risk-limit"                                                                                           | No action; the weekly spec-drift check (P3) watches the values                                                                                                                                                                                          | P3   |
| SC-12.3-2 Stale on error                    | 12.3.5                         | T1                     | "covered by code review"                                                                                                                                            | `apps/server/src/services/__tests__/BybitMarketInfo.test.ts`: fetch OK → advance past the 6 h TTL → Bybit 500 → the stale cached value is served; with no cache → route 502 `{ error: 'Failed to fetch market data' }`, no upstream text                | —    |

**Not automatable.** None.

**UI / tester reproduction.**

1. `curl 'http://localhost:3001/api/market/instruments?category=linear' | jq '.[] | select(.symbol=="BTCUSDT")'` →
   Expect `tickSize 0.1`, `qtyStep 0.001`, `minOrderQty 0.001`, `minNotional 5`, `maxLeverage 150`,
   `fundingIntervalMin 480`.
2. `curl 'http://localhost:3001/api/market/candles?category=inverse&symbol=BTCUSDT&interval=1m'` → Expect 400.
3. `/dashboard/spot/BTC/USDT` → [trade.spread] a number; reload in a quiet market → Expect it at once.
4. `wscat -c 'ws://localhost:3001/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m'` → Expect `ticker`
   messages with `markPrice`, `fundingRate`, `nextFundingTime`.

### 13 — Server trading engine (24/7)

**Scenarios**

| Scenario                                  | Cases                                  | Tier · tool     | Today                                                                                                                                                                                                                                                                                               | To add                                                                                                                                                                                                                                                                                                                  | Step |
| ----------------------------------------- | -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-13.1-1 Intent only                     | 13.1.1, 13.1.2, 13.1.3, 13.1.4         | T1 ✅ + T2 ✅   | `TradingPanel.test` (sends intent only, server rejection); `paper.test` "a client-supplied price never reaches the engine", "POST /orders"                                                                                                                                                          | No action                                                                                                                                                                                                                                                                                                               | —    |
| SC-13.2-1 Fills while the tab is closed   | 13.2.1, 13.2.2                         | T3 ✅           | Checked by hand; M5d `engine/tabClosed.spec` on Spot BNBUSDT (a limit fill and a TP, no page open)                                                                                                                                                                                                  | `e2e/engine/tabClosed.spec.ts` @full: place a limit 0.1 @ 49,000 (and, second test, a long with TP 51,000); `page.close()`; `feed path linear BTCUSDT …` crosses; new page → Positions / Order History / journal "Limit order filled — …" / "Auto-closed … Take-Profit hit at $51,000"                                  | P2   |
| SC-13.2-2 Symbols no pane shows           | 13.2.3                                 | T1 ✅           | `triggers.test` symbol isolation; `services.test` "MatchingEngine"                                                                                                                                                                                                                                  | No action                                                                                                                                                                                                                                                                                                               | —    |
| SC-13.2-3 Restart with a cross in the gap | 13.2.4                                 | T3 ✅ (nightly) | `services.test` "backfills downtime" (unit); M5d `resilience/restart.spec` with `restartableServer.ts` (its own port and `_restart_test` database, so the main engine keeps its lease); the gap candle is put in the minute after the orders, since the engine ignores a candle older than an order | `e2e/engine/restartBackfill.spec.ts` @full with a `restartableServer` fixture (spawns the built server itself, not `webServer`): open a limit, stop the server, `feed klines` puts a candle through 49,000 in the gap, start it → stdout has "Backfilling price gap", the order filled once at 49,000, one journal line | P2   |
| SC-13.3-1 Two tabs stay in sync           | 13.3.1                                 | T3 ✅           | `paper.test` "WS /api/paper/ws (BP-1)" (fan-out); M5d `engine/twoTabs.spec` on Spot AVAXUSDT (NEW-8-2 included); the once-per-tab sound check isn't automated                                                                                                                                       | `e2e/engine/twoTabs.spec.ts` @full: two pages, one context; place / cancel / close in A → B updates within 2 s; a `VITE_E2E` sound log shows each sound once per tab; reset in A → B shows `10,000.00` (NEW-8-2); reload B → same state (4.6)                                                                           | P2   |
| SC-13.3-2 Trade after 20 minutes          | 13.3.3                                 | T3 ✅           | `usePaperFeed.test` re-auth / 4401 refresh; `session.test` "msUntilExpiry()"; M5d `engine/tokenRefresh.spec` (page clock +20 min → one refresh → a market order)                                                                                                                                    | `e2e/engine/tokenRefresh.spec.ts` @full: `page.clock.install()`, fast-forward 20 min → one `/api/auth/refresh`, the paper WS re-authenticates (no 4401 close in the frames), then a market order succeeds. If the server's access-token lifetime can be shortened for e2e, run it with a 60 s token so expiry is real   | P2   |
| SC-13.3-3 Safety fixes                    | 13.3.2, 13.3.4, 13.3.5, 13.3.6, 13.3.7 | T1 ✅           | `usePaperFeed.test` sign-out; `paperStore.test` "clear()"; `actions.test` "BP-1 safety fixes"; `triggers.test` S3; `fees.test` "a pending order keeps its own leverage"                                                                                                                             | No action                                                                                                                                                                                                                                                                                                               | —    |
| NEW-13-1 Server restart mid-session       | —                                      | T3              | —                                                                                                                                                                                                                                                                                                   | With `restartableServer`: kill and restart while a page is open → the paper WS reconnects, snapshot resync, no duplicated journal or Order History rows                                                                                                                                                                 | P2   |
| 13.3.8 Concurrent writes (was NEW-13-2)   | 13.3.8                                 | T2i ✅          | `paperRoutes.int.test` "[13.3.8] two orders … both apply", "[13.3.8] a burst … loses no update" (P1c)                                                                                                                                                                                               | Done: two app instances on one database                                                                                                                                                                                                                                                                                 | P1   |

**Not automatable.** None. (Long real-time soak — the engine running days with live prices — is a monitoring
concern: the T5 scheduled check (every 6 h) plus the log alert.)

**Tester reproduction.** 1. Place a limit a few $ past the price, close the tab, wait for the price, reopen → Expect
the fill. 2. Local: stop the server (`Ctrl-C`), let the price cross, start it → Expect "Backfilling price gap" in the
log and one fill. 3. Two tabs side by side → act in one, Expect the other within ~1 s. 4. Leave the dashboard open 25
minutes, then trade → Expect it works.

### 14.7 — Migration (D7) and deploy safety

**Scenarios**

| Scenario                                      | Cases                  | Tier · tool    | Today                                                                                                                                           | To add                                                                                                                                                                                                           | Step |
| --------------------------------------------- | ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-14.7-1 Pre-BP-2 rows migrate               | 14.7.1                 | T2i ✅         | `migrationReplay.int.test` "[14.7.1] …" ×3 (P1b)                                                                                                | `migrations.int.test.ts` (F6): the pre-BP-2 seed → positions / orders / trades `linear`; leverage = qty × entry / margin; entry fee 0.07% of margin; PENDING reserved = margin × 1.0007; FILLED `feeRate 0.0007` | P1   |
| SC-14.7-2 Client-side migration and new users | 14.7.2, 14.7.3, 14.7.5 | T1 ✅ + T2 ✅  | `useMarketUrlSync.test` "D7 — the one-time move to USDT Perpetual"; `layoutStore.test` "marketHandoffDone (D7, v5)"; `paper.test` (prices push) | No action                                                                                                                                                                                                        | —    |
| SC-14.7-3 Old client payload                  | 14.7.4                 | ➖ (test kept) | `paper.test` "pre-BP-2 usdtAmount only" (now 400)                                                                                               | No action                                                                                                                                                                                                        | —    |

**Tester reproduction.** `pnpm --filter @crypto-dashboard/server test:int` against a throwaway Postgres (README
"Testing"); `migrationReplay.int.test.ts` replays every migration over `fixtures/pre-bp1.sql`.

### 6 — Price parity against Bybit

**Scenarios**

| Scenario                  | Cases              | Tier · tool            | Today                                                                                                                                                                             | To add                                                                                                                                                                                                                                                                          | Step |
| ------------------------- | ------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SC-6-1 Feed parity job    | 6.1, 6.2, 6.3, 6.4 | T4 ✅                  | `apps/server/src/tools/feedParity.ts` + `.github/workflows/feed-parity.yml` (M6): nightly on the parity Fly Machine in `sin`; first run 2026-09-29 green (18 markets, 36 candles) | Done. Deviations: 0.1 % instead of one tick (the two reads are up to a second apart); freshness is "keeps sending matching tickers" (the server's quote age isn't public). Weekly `specDrift.ts` in the same workflow                                                           | P3   |
| SC-6-2 Testnet parity run | 6.5, 17.6.4        | T4 ✅                  | `parity.yml` + `apps/server/src/tools/bybitParity.ts`; `bybitParity.test` "Bybit v5 adapter (BP-5 G)", "diffFields"                                                               | No action to build — first green nightly 2026-09-28 (run 36427289995 on `main`, every step matches Bybit; fixes in PR #163, released in #164). M0 flips both rows and closes APP_LOG's O5, max-reducible margin and 110090 questions. Extend later with a Spot leg (NEW-14.6-4) | P3   |
| SC-6-3 Browser tab title  | 6.6                | T1 ✅ (format) + T3 ✅ | `useDocumentTitle.test` "buildTitle()", "formatPrice()"; M5d `feed/feedUi.spec` [6.6] (ETH, ▲ at 100,000 / ▼ at 1)                                                                | `e2e/feed/tabTitle.spec.ts` @full: `feed quote spot BTCUSDT … last=50000` then `last=50100` → `page.title()` starts `▲ BTC/USDT 50,100.00 +`; a drop below the previous close → `▼`                                                                                             | P2   |

**Not automatable.** None — this section exists to replace the manual TradingView checks.

**Tester reproduction.** Open Bybit's BTCUSDT Perpetual page and `/dashboard/usdt/BTCUSDT` side by side: Sell / Buy
equal Bybit's best bid / ask or one tick apart; MARK and FUNDING equal; the countdown ends at the same time.

### 17.6 — Refinements and parity

**Scenarios**

| Scenario                     | Cases                  | Tier · tool | Today                                                                                                                                              | To add                          | Step |
| ---------------------------- | ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---- |
| SC-17.6-1 Funding edge cases | 17.6.1, 17.6.2, 17.6.3 | T1 ✅       | `services.test` "funding (BP-4)"; `cross.test` "BP-5 F — funding for a position closed before its settlement"; `services.test` "AccountRepository" | No action (17.6.4 is in SC-6-2) | —    |

**Not automatable.** None. **Tester reproduction** (fake feed): open the worked long, `feed funding BTCUSDT
rate=0.0001 inSeconds=10`, close the position at second 5 → after the timestamp the fee lands on that close's Closed
P&L row (17.6.2); `feed stall linear 60000` across the timestamp → settled at the mark candle (17.6.1).

### 18 — Cross-phase regression suite

**Scenarios**

| Scenario                             | Cases                              | Tier · tool          | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | To add                                                                                                                                                                                     | Step |
| ------------------------------------ | ---------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| SC-18-1 Pinned cross-phase bugs      | 18.1, 18.2, 18.3, 18.4, 18.5, 18.6 | T1 ✅ + T3 ✅ (18.1) | `services.test` "should stamp a backfilled fill at its candle…", "should settle a timestamp missed across a restart…", "should skip an inferred takeover timestamp…", "should drop a deleted account's settlement…", "splits a late funding fee over every close after the timestamp…"; `liquidation.test` "should liquidate, not stop out…"; `funding.test` "should not charge a fresh account…", "should still settle when the last reset was before…"; M5d `resilience/restart.spec` covers 18.1 (a TP in the gap, once); 18.2 (funding just before a restart) stays T1 | Keep. End to end (A4 Resilience) in `e2e/resilience/restart.spec.ts` @full with `restartableServer`: restart mid-gap with a TP in the gap (18.1) and just after a funding timestamp (18.2) | P2   |
| SC-18-2 The same on a real database  | 18.7, 18.8                         | T2i ✅               | `regression.int.test` "[18.1]"–"[18.6]" (P1c); 18.8 found by it, fixed with T1 `cross.test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Done: 18.1–18.6 through TradingService → AccountRepository → Postgres and the MatchingEngine on the Prisma lease row, fake market only                                                     | P1   |
| NEW-18-1 Engine invariants           | —                                  | T1p                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The F7 property suite as its own Part B section (conservation, no negatives, reduce-only, determinism)                                                                                     | P4   |
| 18.9 DB write failure (was NEW-18-2) | 18.9                               | T2i ✅               | `paperRoutes.int.test` "[18.9] rolls every write back…" (P1c)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Done: the transaction's journal write throws → all rolled back, bare 500, retry succeeds                                                                                                   | P1   |
| 18.10 Lease handoff (was NEW-18-3)   | 18.10                              | T2i ✅               | `regression.int.test` "[18.10] two engines on one database…" (P1c)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Done                                                                                                                                                                                       | P1   |

**Not automatable.** None. **Tester reproduction:** these are engine interactions no UI shows directly; run
`pnpm --filter server test -- services liquidation funding` (T1) and, after F6, `pnpm --filter server test:int`. The
restart cases can be seen locally: open a position with a TP near the price, stop the server, let the fake feed cross
the TP, start it → one "Auto-closed" journal line.

### 19 — Account flows (19.9–19.12)

**Scenarios**

| Scenario                                    | Cases        | Tier · tool | Today                                                                                                    | To add                                                           | Step |
| ------------------------------------------- | ------------ | ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---- |
| SC-19-9 Rate limits per visitor and WS logs | 19.9, 19.10  | T1 ✅       | `clientIp.test` "isFlyProxyPeer", "clientIpFor"; `wsLogging.test` "WebSocket connection logging"; prod ✓ | No action; the P5 log alert watches production                   | —    |
| SC-19-11 Refresh and logout races           | 19.11, 19.12 | T2i ✅      | `authRoutes.int.test` (P1c)                                                                              | Done: real `deleteMany` on Postgres, same-token requests at once | P1   |

**Not automatable.** Only in production, behind Fly's proxy: the real client IP. **Tester reproduction:**
`fly logs -a <app>` while opening the dashboard → connect / close lines carry `reqId`, `clientIp` (your IP, not a Fly
address), `userId` on the private WS, close code and duration; a forged `Fly-Client-IP` header from outside is
ignored.

---

# Part 3 — Rollout plan

## R1. Order of work

Ordered by value per effort and by dependency: the cheap, infrastructure-free tests first (they turn many ⬜ rows
green in days), the real-database layer next (the biggest uncovered risk in A2), then the fake feed that every
browser test waits on.

| Milestone                                                                                                     | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Foundations                            | Roadmap / A10 items                                                    | Effort                                     | Done when                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **M0 — Hygiene** ✅ (R3 closed 2026-09-29)                                                                    | ~~First green nightly `parity:testnet`~~ done 2026-09-28 (run 36427289995); catalogue fixes listed in R3; flip the rows whose tests already exist (10.2.4, 10.4.1–10.4.3)                                                                                                                                                                                                                                                                                           | F12                                    | P3 (6.5, 17.6.4); A10 "Do first" 1                                     | S                                          | parity green once ✅; `caseCoverage` report runs in CI                                                 |
| **M1 — No-infra tests** ✅ (#169–#172)                                                                        | SC-8-1/2/3, SC-7-1…5, SC-10.1-1/2, SC-10.2-1, SC-10.3-1, SC-10.5-1, SC-10.4-2, SC-11-1/2/3 (T2 half), SC-9-1, SC-14.6-7, SC-1-6 (TP label fix), SC-12.3-2, SC-14.4-1 (T2), NEW-4-1, NEW-8-1, NEW-9-2                                                                                                                                                                                                                                                                | F1 (anchors on the touched components) | P2 T1 / T2 rows; A10 "Do first" 3                                      | M (≈ 1 week)                               | those rows ✅ at T1 / T2 without `(P2)`; anchors registry merged                                       |
| **M2 — Real database** ✅ (#165, #175–#178)                                                                   | CI Postgres, migrate-from-empty + drift, migration replay (14.7.1, 15.2.3, 17.5.1), repository round-trip, 18.7, route tests with races (NEW-1-2, NEW-13-2, NEW-18-2, NEW-18-3), contract test, coverage thresholds. P1a (#165) ✅ CI Postgres, migrate-from-empty + drift, repository round-trip, coverage thresholds; P1b ✅ replay; P1c ✅ 18.7 (found 18.8), the races 1.7.13, 13.3.8, 18.9, 18.10, 19.11, 19.12; P1d ✅ the contract test (found 19.13, 19.14) | F6, F9                                 | P1 (all A10 P1 items); A10 "Do first" 2                                | M–L (≈ 1.5 weeks)                          | `test:int` job green on every PR; the three "Manual" migration rows are T2i ✅                         |
| **M3 — Test hooks + fake Bybit** ✅ (#180, M3b)                                                               | `ENABLE_TEST_HOOKS` plugin, outbox, `BYBIT_REST_URL` / `BYBIT_WS_URL` seam with the production refusal, fake server, fixtures + recorder, `pnpm feed`, `pnpm dev:e2e`                                                                                                                                                                                                                                                                                               | F2, F3                                 | P2 infrastructure (A10 "P2 — replay feed" items 1–3)                   | L (≈ 2 weeks)                              | the app runs locally on the fake feed; every UI step marked **(fake feed)** in this file works by hand |
| **M4 — Playwright smoke + scenario format** ✅ (M4 PR)                                                        | `apps/e2e`, selector engine, `runScenario`, scenarios `spot-market-buy`, `perp-market-long` (with the partial close), `register-and-sign-in`; `e2e-smoke` job on PRs                                                                                                                                                                                                                                                                                                | F4, F5                                 | P2 smoke (A10 Stage 1 / 3 smoke items, Stage 0 auth); A10 "Do first" 4 | M (≈ 1 week)                               | smoke < 3 min on every PR, green 10 runs in a row                                                      |
| **M5 — Full nightly set** (M5a #185 ✅, M5b #187 ✅, M5c #189 ✅, M5d #195, M5e visual / axe / case coverage) | All remaining T3 scenarios of Stages 0–6, `@mobile`, visual baselines, axe, resilience with `restartableServer`. Left: the owner's Q4 (crossed-book display, a broken icon's fallback). The guided tour is deferred until the test plan is done (owner, 2026-09-29)                                                                                                                                                                                                 | F10, F11                               | P2 full (the rest of A10's T3 items)                                   | L (≈ 3 weeks, can run in parallel with M6) | nightly green 5 nights running; no ⬜ row left in Part B except M rows                                 |
| **M6 — Parity and drift** ✅ (M6 PR)                                                                          | Feed parity job (SC-6-1), weekly spec-drift check                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                      | P3; A10 "Do first" 5                                                   | M                                          | 6.1–6.4 ✅ at T4                                                                                       |
| **M7 — Depth** (deferred: the owner did not approve fast-check / Stryker, 2026-09-29)                         | fast-check invariants, Stryker weekly                                                                                                                                                                                                                                                                                                                                                                                                                               | F7, F8                                 | P4                                                                     | M                                          | property suite on PRs; mutation score recorded and floored                                             |
| **M8 — Production** ✅ smoke + error digest by email (2026-09-29)                                             | `@prod` project post-deploy + every 6 h, log alert                                                                                                                                                                                                                                                                                                                                                                                                                  | F4 `prod` project                      | P5 (needs the owner's log sink)                                        | S                                          | a failed prod smoke marks the deploy red                                                               |
| **M9 — Staging and security** (deferred 2026-09-29, except Dependabot for GitHub Actions)                     | Staging app, ZAP, k6, Dependabot, gitleaks                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                      | P6 (needs the owner's approval)                                        | M                                          | as A8                                                                                                  |
| **Guided trade MVP** (separate feature)                                                                       | `GuideOverlay` over the M4 scenarios: "Your first Spot market order", "Your first long"                                                                                                                                                                                                                                                                                                                                                                             | F1, F5                                 | —                                                                      | M                                          | a learner completes both tours on live prices                                                          |

## R2. The first five things to build

**Agreed sequence** (with the owner, 2026-09-28): (1) this plan document; (2) M0 hygiene — the R3 catalogue fixes, the
row flips, the rounded worked numbers in `TRADING_TEST_PLAN.md`; (3) anchor registry + scenario types; (4) P1a (#165);
(5) M1 no-infra tests, then P1b–P1d; then M3 onwards. The list below is the reasoning behind it.

1. ✅ **Anchor registry + scenario types** (`guideAnchors.ts`, `guide/scenario.ts`, `guide/steps.ts`) — tiny, and it
   fixes the contract both tests and the guided tour depend on before 100 attributes get written ad hoc.
2. ✅ **CI Postgres with migration drift + replay** (F6) — closes the largest risk A2 names (persistence only meets a
   real database in production) and turns three "Manual" rows into T2i.
3. **The no-infra RTL / T1 rows** (M1: Settings modal, Order History, layout, spread, Assets TP / SL, the TP label
   defect) — about 50 ⬜ rows plus four status flips in a week, anchors added as the components are touched.
4. **Test hooks + the `BYBIT_*_URL` seam + the fake Bybit server** (F2, F3) — everything in T3 waits on it, and it
   gives the owner exact numbers on local dev.
5. **Playwright + `runScenario` + the three smoke scenarios** (F4, F5) — the first end-to-end safety net on every PR
   and the first two guided-trade tours for free.

## R3. Catalogue fixes found while writing this plan

These are corrections to `TRADING_TEST_PLAN.md` Part B, for the M0 PR (not made in this change):

- 4.19, 4.20 cite `useTPSLMonitor.test.ts` (deleted in BP-1) → `triggers.test.ts` "evaluateTick() symbol isolation
  (4.18 regression)".
- Section 3's intro cites `paperStore.test.ts` "Section 3 — Stop Orders" → `actions.test.ts` "Section 3 — Stop Orders".
- 3.5.1 says "validation error"; the form shows an immediate-fill warning with "Place anyway". `TradingPanel.test`'s
  "3.5.2" test is the Stop Sell mirror, not Part B's 3.5.2 → catalogue it as its own row (NEW-3-1).
- 10.2.4, 10.4.1, 10.4.2, 10.4.3 are ⬜ but already tested in `layoutStore.test.ts` → ✅ T1.
- Section 11's intro says "seed `spot:` keys"; perp positions carry `linear` since BP-2 and price at the mark since
  BP-3 → seed `linear:` mark keys.
- 1.3.x describe `⇄ Units` / `⇄ USD`; the control is now **BTC | USDT**.
- 4.7 and 7.4.2 say "History tab"; it is **Balance History** (and **Closed P&L** on perps).
- 8.3 and "What changed" mention a `1x ▾` chip; it reads `Cross 10x` / `Isolated 10x` since BP-5.
- Tested but uncatalogued: "editing a limit across the book is priced at the book" (NEW-2-1).
- Worked numbers predate the tick rounding (PR #163): liq ≈ 45,148.99 → 45,149.0 (intro, Stage 3 / 4 notes, 15.3.2),
  15.3.2's short ≈ 54,819.10 → 54,819.0, 15.3.6's "$45,158.02" → "$45,158.1".

## R4. Keeping the statuses true

- **Test titles carry case IDs** (`[14.6.1]`); `scripts/caseCoverage.ts` (F12) lists rows without a test and tests
  citing unknown IDs. A ⬜ → ✅ edit in Part B must name a test the report can find.
- **Per PR**: the PR that lands a test updates its Part B row (Status ✅, Tier without `(Pn)`, Notes = file + test
  name), ticks the A10 line when all its rows are done, and marks the scenario here ✅ in its "Today" column.
- **NEW scenarios**: when built, they get the next free number in their Part B section and the NEW id is replaced
  here by the case id.
- **Monthly**: re-run the M checklists that are due (sounds, drag feel, email rendering) and date them in the row's
  Notes; read the Stryker trend and the flaky-test issues.

## R5. Counts

| Stage   | Scenarios (`SC-`) | Of which no action (✅ or ➖) | New automation in `SC-` | NEW proposed |
| ------- | ----------------- | ----------------------------- | ----------------------- | ------------ |
| 0       | 27                | 6                             | 21                      | 13           |
| 1       | 9                 | 5                             | 4                       | 4            |
| 2       | 12                | 5                             | 7                       | 3            |
| 3       | 29                | 20                            | 9                       | 8            |
| 4       | 23                | 12                            | 11                      | 2            |
| 5       | 15                | 5                             | 10                      | 3            |
| 6       | 26                | 12                            | 14                      | 5            |
| **All** | 141               | 65                            | 76                      | 38           |

New automation by tier (a scenario that adds two tiers counts in both; T3 includes the visual baselines):

| Tier          | T1  | T1p | T2  | T2i | T3  | T4  | T5  |
| ------------- | --- | --- | --- | --- | --- | --- | --- |
| `SC-` to add  | 7   | 0   | 18  | 4   | 50  | 2   | 1   |
| `NEW-` to add | 10  | 2   | 14  | 4   | 11  | 0   | 0   |

Manual-only (M) after this plan: 4.14–4.16 (audibility; their trigger is T2), 15.6.6 (drag feel), 15.4.9 (a one-off
deploy check, done), plus three M checklists without a case ID — email rendering (Section 19), the active-pane
animation (10.2), synced-pan feel (10.4).

---

# Part 4 — Risks and open questions for the owner

**Risks**

1. **Fake-feed fidelity.** A fake that drifts from Bybit's shapes makes T3 green while production breaks. Mitigation:
   fixtures recorded from Bybit, the feed parity job (SC-6-1) and the testnet run (SC-6-2) as the check on the fake,
   re-record on spec drift.
2. **Test hooks reaching production.** Mitigation: four independent guards (F2) and a unit test that boots the config
   with `NODE_ENV=production` + `ENABLE_TEST_HOOKS=1` and expects an exit.
3. **Anchors are a public contract.** Renaming one silently breaks tours and tests. Mitigation: the typed registry,
   the unused-anchor check, and a rename = add, migrate, remove.
4. **CI time and flakiness.** WebKit, mobile, visual and resilience run nightly only; the PR smoke stays under 3 min;
   a flaky test is a defect with a 14-day quarantine limit.
5. **Canvas assertions** (chart sync, lines) rely on a `VITE_E2E` hook compiled out of production builds; if it ever
   ships, it only exposes read-only chart ranges.

**Open questions**

- **Q1.** Guided trade: opt-in from a "Learn" menu, or offered once to new accounts? Does progress need saving per
  user (server) or is the browser enough?
- **Q2.** Tours run on live prices, so steps with exact numbers become "what you should see" formulas. Is that the
  experience you want, or should a tour run against a practice feed?
- **Q3.** (M5a finding: on a 412 px screen the top bar overflows — the username is clipped — and the order form
  is off-screen until the Trade toggle; the phone tests cover auth only until this is decided.) Phones: is trading on a phone (the full-width order form under 1024 px) a supported flow to test in the PR
  smoke, or nightly only? Which multi-chart layouts should a phone offer (NEW-10-2)?
  **Answered 2026-09-29:** support phone trading, and make the UI responsive on small phones and tablets (the owner delegated the layout). Done in the phone-trading PR: rows 20.1–20.4. Phones run in the nightly set (`@mobile`), not the PR smoke.
- **Q4.** NEW-9-1 crossed book: show `—` or `0.0000`? NEW-5-1 broken coin icon: fall back to the text badge?
- **Q5.** Approve adding `@playwright/test`, `@axe-core/playwright`, `fast-check` and Stryker as dev dependencies (no
  install scripts; Playwright downloads browsers itself in CI).
  **Answered 2026-09-29:** Playwright + axe approved (M4, M5, M8); fast-check and Stryker not approved, so M7 is
  deferred.
- **Q6.** Can the e2e server run with a short access-token lifetime (SC-13.3-2), or should the test rely on the
  client clock only?
- **Q7.** The feed parity job reads production's public `/api/market` from the Fly parity machine — acceptable, or
  should it wait for the staging app (P6)?
  **Answered 2026-09-29:** yes, production. M9 (staging, ZAP, k6, gitleaks) is deferred at the owner's discretion:
  an always-on staging machine isn't worth its cost and upkeep before launch. Dependabot for GitHub Actions only.
