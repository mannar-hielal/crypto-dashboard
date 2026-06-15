# Pre-Commit Review Checklist

> Run through every section that is relevant to your change before pushing.
> Covers everything currently in the codebase, starting from Phase 1, kept current across all phases — update this file when new patterns are introduced.

---

## 1. TypeScript & Type Safety

- [ ] No `any` — every value has a concrete type; use `unknown` + type guard when the shape is truly unknown.
- [ ] No non-null assertions (`!`) without a preceding runtime guard that proves the value exists.
- [ ] No type-casting with `as Foo` unless the cast is genuinely safe (e.g. after a `JSON.parse` with a runtime guard).
- [ ] Discriminated unions used where a value can be one of several shapes (e.g. `WsMessage`, `OrderStatus`).
- [ ] New public-facing interfaces added to `generated/CDSDK/types/index.ts` — not scattered in component files.
- [ ] If a server response shape changes, the matching SDK type and every consumer are updated in the same commit.
- [ ] TypeScript strict mode passes — run `pnpm type-check` before committing; CI blocks on failures.
- [ ] Enum-like values are typed as `const` arrays or `as const` objects, not loose `string`.

---

## 2. Security

### Authentication & Tokens

- [ ] Access tokens are stored only in Zustand memory — never in `localStorage`, `sessionStorage`, or cookies.
- [ ] Refresh tokens are always SHA-256 hashed before DB writes — raw tokens live only in httpOnly cookies.
- [ ] Cookie options (`httpOnly`, `sameSite`, `secure`) match `COOKIE_BASE_OPTIONS` exactly — mismatched options prevent cookie deletion on logout.
- [ ] Every new protected route uses `onRequest: [app.authenticate]`.
- [ ] JWT payload contains only `userId` and `email` — no sensitive fields (roles, passwords, PII).
- [ ] Password fields are never included in any API response (`omit: { password: true }` on every user query).

### JWT Hardening [Phase 1+]

- [ ] 🔐 `JWT_SECRET` has at least 32 bytes (256 bits) of entropy — validated at startup in `config.ts` by checking `Buffer.byteLength(config.jwtSecret, 'utf8') >= 32`; process exits with a clear error if not met.
- [ ] 🔐 JWT algorithm is explicitly declared as `HS256` in `app.ts` (`algorithms: ['HS256']` option on `@fastify/jwt`) — prevents `alg: none` downgrade attacks if library defaults ever change.
- [ ] 🔐 Access token is **never** passed as a URL query parameter — only via `Authorization: Bearer` header. JWTs in URLs leak to server logs, browser history, and `Referer` headers.

### CSRF & Cookie Posture [Phase 1+]

- [ ] 🔐 CSRF defence relies on the Bearer token strategy: every state-mutating endpoint requires a valid JWT in Zustand memory (not readable from a cookie). `/refresh` and `/logout` are CSRF-safe by design — logout is benign and `/refresh` without a valid httpOnly cookie is a no-op. No CSRF token or double-submit cookie is required.
- [ ] 🔐 Cookie `sameSite` is **`lax`** in development and **`none` + `secure: true`** in production — this is the only approved combination; never use `sameSite: strict` without verifying cross-domain redirect flows still work. Match `COOKIE_BASE_OPTIONS` exactly on every `setCookie` / `clearCookie` call.

### Input Validation

- [ ] Every new Fastify route has a JSON Schema with `additionalProperties: false` — extra fields are rejected before the handler runs.
- [ ] String inputs have `maxLength` to prevent memory exhaustion.
- [ ] Email inputs use the existing regex pattern; password inputs enforce the complexity pattern.
- [ ] Symbol/interval inputs are validated against the allowlists in `src/constants.ts` and `ALLOWED_INTERVALS` — never trust raw query params.
- [ ] New WebSocket message handlers check `rawData.length` before `JSON.parse` (64KB guard already in place for Bybit messages).

### Secrets & Logging

- [ ] No credentials, secrets, tokens, or full URLs with credentials are logged — `log.error({ err })` only, never `log.error(rawToken)`.
- [ ] No new `console.*` calls — use the Pino `log` child logger; `console.*` is allowed only in `config.ts` (bootstraps before logger).
- [ ] No new hardcoded secrets or API keys — all come from validated `config.ts` env vars.
- [ ] If a new critical env var is added, it is added to the `criticalVars` list in `config.ts` and `.env.example`.

### Rate Limiting

- [ ] High-risk new routes (register, login, email-based flows) have per-route `rateLimit` config.
- [ ] Rate limit `skip` callbacks return `process.env.NODE_ENV !== 'production'` so tests never hit counters.

### Error Handling

- [ ] 5xx errors are logged server-side and return only `{ error: 'Internal Server Error' }` to the client — no stack traces, DB error messages, or internal paths leak.
- [ ] Endpoint that queries by email always returns the same response whether or not the email exists (anti-enumeration — see `forgot-password`).
- [ ] `deleteMany` is used instead of `delete` for token invalidation so concurrent requests get count=0 (atomic, no P2025 race).
- [ ] 🔐 The `app.ts` error handler logs `request.url` on 5xx — verify no sensitive data (tokens, passwords) can appear in a server route URL. POST bodies are never in the URL; audit every GET route for sensitive query params before adding one.
- [ ] 🔐 When `/refresh` detects a token already consumed (`deleteMany` returns `count=0`), **all** refresh tokens for that `userId` are revoked immediately (`deleteMany({ where: { userId: stored.userId } })`) — a race or token theft means the attacker's newly issued token must also be killed, not just the victim's stale one.

### Client-Side Security [Phase 2+]

- [ ] 🔐 `dangerouslySetInnerHTML` is prohibited without explicit HTML sanitization (e.g. DOMPurify) — React's default JSX rendering is safe; any raw HTML injection is not.
- [ ] 🔐 User-typed content (e.g. journal entries in `paperStore`) renders as plain text only — never as HTML. No component may pass user strings to `dangerouslySetInnerHTML` or `innerHTML`.
- [ ] 🔐 `paperStore` `persist()` uses a `version` number and a `migrate` function so a malformed or tampered localStorage snapshot never crashes the app on hydration — always increment `version` when adding new required state fields.

### Production-Readiness [Phase 1+]

- [x] 🔐 **Dependency CVEs**: `pnpm audit` is part of the pre-release gate — `high` or `critical` findings block deployment. Run before every release; do not ship with known critical CVEs.
- [ ] 🔐 **HTTP Security Headers**: in production, verify Helmet enables HSTS with `includeSubDomains`, CSP whitelists only known origins (no `unsafe-inline` / `unsafe-eval`), and `corsOrigin` is never `*`.
- [ ] 🔐 **Authenticated WebSocket tokens** [Phase 3+]: future authenticated WebSocket endpoints must pass JWT via the `Authorization` header in the HTTP upgrade request — never as a `?token=` query parameter (query params appear in access logs and browser history).

---

## 3. Backend — Fastify & Prisma

### Routes & Schemas

- [ ] Every route has a `schema` object with `tags`, `summary`, and `response` codes documented.
- [ ] New routes are registered under the correct prefix (`/api/auth`, `/api/market`).
- [ ] Route schemas use the shared `errorResponse` / `tokenResponse` objects — no inline duplicates.
- [ ] Protected routes declare `security: [{ bearerAuth: [] }]` in their schema so Swagger UI shows the lock icon.

### Prisma / Database

- [ ] No raw SQL — all queries use the Prisma typed API.
- [ ] New `Decimal` fields use `@db.Decimal(20, 8)` for financial precision — never `Float`.
- [ ] New models/relations have `onDelete: Cascade` where the child should not outlive the parent.
- [ ] New filterable fields (e.g. `userId`, `status`) have a `@@index` in the schema.
- [ ] Any schema change is accompanied by a migration (`pnpm prisma migrate dev`) and the migration file is committed.
- [ ] Concurrent-safe operations use `updateMany`/`deleteMany` with the unique field in `where` and check `count` — never assume `findUnique` + `delete` is atomic.
- [ ] Interactive transactions (`$transaction(async (tx) => …)`) are used when multiple writes must succeed or fail together.
- [ ] Sensitive operations that must be idempotent use `deleteMany` not `delete` (no P2025 error on double-call).

### Promises & Async

- [ ] No floating promises — `void` operator is used deliberately when fire-and-forget is intentional; `await` is used everywhere else.
- [ ] `@typescript-eslint/no-floating-promises` ESLint rule is active for server source — verify `pnpm lint` passes.
- [ ] `AbortSignal.timeout(n)` is used on every outbound `fetch` call (see `fetchHistoricalCandles`).

---

## 4. Frontend — React & Zustand

### Zustand Store Selectors

- [ ] Components subscribe with fine-grained selectors (`useStore((s) => s.specificField)`) — never `useStore()` (subscribes to entire store and causes cascade re-renders on every update).
- [ ] Selectors for stable action functions (`placeOrder`, `closePosition`, etc.) are extracted individually so they don't cause unnecessary re-renders.
- [ ] `paperStore` fields that cap arrays (`history`, `orders`, `journal`) use `.slice(0, MAX_*)` on every `set` call — no unbounded growth.
- [ ] New persisted state fields in `paperStore` are handled gracefully if they are missing in an older localStorage snapshot (Zustand `persist` merge strategy).

### React Hooks & Effects

- [ ] `useEffect` cleanup returns a function that cancels pending work (timers, WebSocket connections, `isMountedRef.current = false`).
- [ ] `isMountedRef` guard is in place before calling `setState` or store actions inside async operations.
- [ ] WebSocket `onclose` handler is set to `null` before calling `.close()` in cleanup — prevents auto-reconnect firing after intentional disconnect.
- [ ] No `setState` called inside `useEffect` that reacts to state it sets (infinite loop).
- [ ] **No during-render `setState`** — calling `setState` conditionally during render forces an extra render and behaves unpredictably under StrictMode/concurrent mode. When a component needs to reset local state on a prop change, add `key={prop}` on the _parent_ side instead; React remounts the component with fresh state automatically.
- [ ] `useEffect` dependency arrays are accurate — no missing deps, no over-broad deps that trigger on every render.

### Component Design

- [ ] New props interfaces are defined above the component (co-located), not in a separate types file unless shared.
- [ ] Sub-components extracted to named functions (`JournalRow`, etc.) avoid re-defining inside the parent render to prevent identity-based re-renders.
- [ ] `key` props on list items use stable unique IDs (e.g. `entry.id`, `pos.id`) — never array index.
- [ ] Framer Motion `variants` objects are defined outside the component (module-level constant) to avoid re-creation on every render.

### TP/SL & Trading Logic

- [ ] TP/SL direction is validated before the order is placed:
  - Long: TP must be > entry price; SL must be < entry price.
  - Short: TP must be < entry price; SL must be > entry price.
- [ ] `placeOrder` includes entry commission in the balance check (`usdtAmount + fee > balance`) — prevents going negative on 100% orders.
- [ ] `closePosition` applies `Math.max(0, returnAmount)` — balance never goes below zero.
- [ ] **`realizedPnl` subtracts BOTH legs of commission** — entry commission (`entryUsdtAmount × COMMISSION_RATE`) AND exit commission (`qty × exitPrice × COMMISSION_RATE`). Omitting either leg overstates realized profit.
- [ ] `useTPSLMonitor` only evaluates positions matching the active `symbol` — cross-symbol false triggers are a known bug risk.

---

## 5. WebSocket — Server & Client

- [ ] New server WS handlers call `unsubscribe()` inside both `socket.on('close')` and `socket.on('error')` — no memory leak from orphaned listeners.
- [ ] `socket.readyState === 1` (OPEN) is checked before every `socket.send()`.
- [ ] Client `usePriceFeed` reconnect timer is cleared on unmount before the WebSocket is closed.
- [ ] Any new message type sent over `/api/market/ws` is added to the `WsMessage` discriminated union in `generated/CDSDK/types/index.ts`.
- [ ] Server-side `BybitWebSocketManager` subscriber count does not grow unboundedly — listener Set entries are deleted via the returned unsubscribe function.

---

## 6. Tests

- [ ] Every new feature or bug fix has at least one test case.
- [ ] New route handlers have a happy-path test and at least one error/edge-case test.
- [ ] New store actions in `paperStore` / `marketStore` have unit tests that verify state transitions.
- [ ] **Complex business logic inside hooks is extracted into a pure function and tested independently** — hooks are hard to test in isolation; a pure helper (e.g. `checkTPSL`) can be unit-tested with zero React/store setup, giving faster and more precise coverage.
- [ ] **Test `beforeEach` / teardown helpers reset ALL store fields** — use the store's own `reset()` action rather than a partial `setState`. Partial resets silently leave new fields (e.g. `orders`, `journal`, `realizedPnl`) at their previous values, causing state leakage between tests and flaky assertions as the store evolves.
- [ ] Tests do not depend on real databases, real external APIs, or network calls — Prisma and EmailService are always mocked.
- [ ] The Prisma mock uses `Symbol.for('skip-override')` so decorations are visible across plugin scopes (see `auth.test.ts` pattern).
- [ ] `vi.fn()` mocks for Prisma methods that return `{ count: N }` use `mockResolvedValue({ count: 1 })` by default and override with `mockResolvedValueOnce` per test — avoids cross-test pollution.
- [ ] Test descriptions follow the pattern `describe('route/function') → it('should <action> when <condition>')`.
- [ ] After adding tests, `pnpm test` passes for the whole suite (server + client) without skips.
- [ ] New tests do not import from `dist/` or `generated/` — always import from `src/`.

---

## 7. Shared SDK (`generated/CDSDK`)

- [ ] `generated/CDSDK` is the single source of truth for shared types and API functions — do not duplicate type definitions in `apps/client/src`.
- [ ] API function changes in `generated/CDSDK/api/` are backward-compatible, or all callers in `apps/client/src` are updated in the same commit.
- [ ] The `@crypto-dashboard/sdk` import path is used in client code, never a relative path into `generated/`.
- [ ] `wsUrl()` in `generated/CDSDK/api/market.ts` must stay in sync with the server route prefix (`/api/market/ws`).

---

## 8. Logging

- [ ] Use `logger.child({ service: 'ServiceName' })` or `logger.child({ route: 'routeName' })` — scoped child loggers, not the root logger directly.
- [ ] Log levels are used correctly:
  - `log.debug` — verbose internal state (disabled in production by default).
  - `log.info` — significant lifecycle events (connect, disconnect, subscribe).
  - `log.warn` — recoverable anomalies (dropped message, non-finite field).
  - `log.error` — unexpected failures; always include `{ err }` as structured context.
- [ ] Error objects are passed as `{ err: error }`, never as a string via `.message` alone (Pino serializes Error objects correctly).
- [ ] Do not log `rawData` from external WebSocket messages — could be large or contain sensitive market data.

---

## 9. Configuration & Environment

- [ ] Any new required env var is added to `criticalVars` in `config.ts` AND to `.env.example`.
- [ ] Production-specific checks (like `CLIENT_URL` validation) exit the process early with a clear error message.
- [ ] URLs read from env vars are validated with `new URL(...)` and fail fast on startup — never silently use a malformed URL.
- [ ] `config.nodeEnv` is used for environment branching — never `process.env.NODE_ENV` directly in application code outside `config.ts` and `routes/auth/index.ts`.

---

## 10. Performance & Memory

- [ ] New in-memory collections (Maps, Sets, arrays) that grow over time have a cap or a cleanup strategy.
- [ ] `MAX_BARS = 500` ring-buffer logic is preserved in `marketStore.addBar` — do not break the `slice(-MAX_BARS)` trim.
- [ ] `SNAPSHOT_SIZE = 500` in `bybit.ts` — any new snapshot Map follows the same `shift()` pattern.
- [ ] Indicator managers (`IndicatorManager`, `EMACalculator`, etc.) are keyed per `symbol:interval` — do not share state across symbols or intervals.
- [ ] `CandleAggregator` per-symbol state is isolated — verify new symbols do not bleed data into existing symbol histories.

---

## 11. Code Style & Conventions

- [ ] `pnpm lint` passes with zero errors (ESLint + TypeScript-ESLint rules).
- [ ] `pnpm format` has been run — Prettier formatting is consistent.
- [ ] `pnpm type-check` passes — no TypeScript compile errors.
- [ ] Commit message follows the prefix convention:
  - `feat:` new feature
  - `fix:` bug fix
  - `security:` hardening
  - `chore:` tooling / deps / config
  - `setup:` infrastructure
  - `docs:` documentation only
- [ ] One testable unit of work per commit — do not batch unrelated changes.
- [ ] Section dividers use the existing style: `// ─── Section Name ──────────────`.
- [ ] Security comments (`🔐`) are added when a decision was made for a security reason — helps future reviewers understand intent.

---

## 12. Docker & Infrastructure

- [ ] Changes to `docker-compose.yml` (ports, volumes, env vars) are reflected in `README.md` setup instructions.
- [ ] New Docker services use pinned image versions — no `:latest` tags.
- [ ] `fly.toml` changes are intentional — check health check paths, port, and memory settings match server config.

---

## Quick Self-Checklist (run every time)

- [ ] `pnpm type-check` passes (server + client)
- [ ] `pnpm lint` and `pnpm format` pass
- [ ] `pnpm test` passes (server + client)
- [ ] No secrets committed (audited against `.env.example`)
- [ ] Protected routes use `onRequest: [app.authenticate]`
- [ ] API changes synced to `generated/CDSDK`
- [ ] Database migrations committed
