# Web/Platform Conventions (Senior Web Developer)

Scope: cross-cutting architecture, security, backend (`apps/server/src/**`), and shared SDK
(`generated/CDSDK`) conventions for cryptopapertrade.com. Stack: Fastify 5 + Prisma 7 on the
server, a shared typed SDK between server and client.

## Architecture boundaries

- `generated/CDSDK` is the single source of truth for shared types and API functions — no
  duplicate type definitions inside `apps/client/src`. Client code imports it as
  `@crypto-dashboard/sdk`, never via a relative path into `generated/`.
- If a server response shape changes, the matching SDK type **and** every consumer are updated in
  the same commit — an SDK change is never "backend-only."
- New public-facing interfaces are added to `generated/CDSDK/types/index.ts`, not scattered across
  route or component files.
- `wsUrl()` in `generated/CDSDK/api/market.ts` must stay in sync with the server's WS route prefix
  (`/api/market/ws`).

## Security

Code-shape rules below. For the broader program these rules sit inside — threat model,
supply-chain policy, secrets management, container hardening — see [`security.md`](./security.md).

### Authentication & tokens

- Access tokens live only in Zustand memory on the client — never `localStorage`,
  `sessionStorage`, or a non-httpOnly cookie.
- Refresh tokens are always SHA-256 hashed before a DB write; the raw token exists only inside an
  httpOnly cookie.
- Cookie options (`httpOnly`, `sameSite`, `secure`) must exactly match `COOKIE_BASE_OPTIONS` on
  every `setCookie`/`clearCookie` call — a mismatch silently prevents cookie deletion on logout.
- Every protected route uses `onRequest: [app.authenticate]`.
- JWT payload carries only `userId` + `email` — never roles, passwords, or other PII.
- Password fields are never present in an API response (`omit: { password: true }` on every
  user query/select).

### JWT hardening 🔐

- `JWT_SECRET` must have ≥32 bytes (256 bits) of entropy, checked at `config.ts` startup
  (`Buffer.byteLength(config.jwtSecret, 'utf8') >= 32`) — process exits with a clear error if not.
- JWT algorithm is pinned explicitly to `HS256` in `app.ts`'s `@fastify/jwt` registration — this
  prevents an `alg: none` downgrade attack.
- An access token is never passed as a URL query parameter — only via `Authorization: Bearer`.
  Tokens in URLs leak into server logs, browser history, and the `Referer` header.

### CSRF & cookie posture 🔐

- CSRF defence is the Bearer-token strategy: every state-mutating endpoint requires a valid JWT
  held in memory, which a cross-site request cannot forge. `/refresh` and `/logout` are CSRF-safe
  by this design — no CSRF token or double-submit cookie is needed.
- Cookie `sameSite` is `lax` in dev and `none` + `secure: true` in prod. Never set `strict` without
  first verifying cross-domain redirect behavior.

### Input validation

- Every Fastify route schema sets `additionalProperties: false` so unexpected fields are rejected
  before the handler runs.
- Every string input has a `maxLength` to bound memory usage.
- Symbol/interval query params are validated against the `ALLOWED_SYMBOLS`/`ALLOWED_INTERVALS`
  allowlists in `apps/server/src/constants.ts` — never trust a raw query param directly, and prefer
  encoding the allowlist directly into the route's JSON Schema `enum` so Fastify validates it.
- New WebSocket message handlers check `rawData.length` against a size guard (64KB for Bybit
  messages) before calling `JSON.parse`.

### Secrets & logging

- No credentials, secrets, tokens, or credentialed URLs are ever logged. Use
  `log.error({ err })`, never `log.error(rawToken)` or string-concatenated error messages.
- `console.*` is prohibited outside `config.ts` (which bootstraps before Pino exists) — Pino's
  `log` is the only logger in application code.
- No hardcoded secrets or API keys anywhere — everything comes from validated `config.ts` env vars.
- Any new critical env var is added to both `criticalVars` in `config.ts` **and** `.env.example`.

### Rate limiting

- High-risk routes (register, login, email flows) get a per-route `rateLimit` config.
- Rate-limit `skip` callbacks return `process.env.NODE_ENV !== 'production'` so the test suite
  never trips the limiter.

### Error handling

- 5xx errors are logged server-side but the client only ever receives
  `{ error: 'Internal Server Error' }` — no stack trace, DB error text, or internal path leaks out.
- An endpoint that looks up a user by email returns an identical response whether or not that
  email exists (anti-enumeration — see `/forgot-password`).
- Token invalidation uses `deleteMany` (not `delete`) so a concurrent duplicate request gets
  `count: 0` back instead of a `P2025` race error.
- If `/refresh` detects a token that was already consumed (`deleteMany` returns `count: 0`), every
  refresh token for that `userId` is revoked — treat token reuse as a compromise signal.

### Client-side security 🔐

- `dangerouslySetInnerHTML` is prohibited without explicit DOMPurify sanitization.
- User-authored text (journal entries, etc.) always renders as plain text — never through
  `dangerouslySetInnerHTML`/`innerHTML`.

### Production readiness 🔐

- `pnpm audit --audit-level=high` is a hard pre-release gate; it also runs in `preinstall` and the
  pre-commit hook.
- In production, verify Helmet enables HSTS with `includeSubDomains`, CSP allows only known
  origins (no `unsafe-inline`/`unsafe-eval`), and CORS origin is never `*`.

## Backend patterns — Fastify & Prisma

- Every route has a `schema` object with `tags`, `summary`, and documented `response` codes.
  Protected routes also declare `security: [{ bearerAuth: [] }]` so Swagger UI shows the lock icon.
- Route schemas reuse shared objects (`errorResponse`, `tokenResponse`) — no inline duplicates.
- No raw SQL — all database access goes through Prisma's typed API.
- Money/price fields are `@db.Decimal(20, 8)` in the Prisma schema, never `Float`.
- New models/relations set `onDelete: Cascade` where the child must not outlive the parent.
- New filterable fields (`userId`, `status`, etc.) get an `@@index`.
- Every schema change ships with a committed migration (`pnpm prisma migrate dev`).
- Concurrent-safe writes use `updateMany`/`deleteMany` with a unique `where` and check the
  returned `count` — never assume `findUnique` followed by `delete`/`update` is atomic.
- Multi-write operations that must succeed or fail together use an interactive transaction
  (`$transaction(async (tx) => …)`).
- No floating promises — fire-and-forget async calls are explicitly `void`-prefixed, everything
  else is `await`ed. `@typescript-eslint/no-floating-promises` is an ESLint error on server source.
- Every outbound `fetch` to an external service sets `AbortSignal.timeout(n)` (default 8s) and,
  ideally, goes through the shared retry/circuit-breaker wrapper — see
  `.agents/skills/api-best-practices` for the full `fetchWithRetry`/`CircuitBreaker` implementation.

## WebSocket lifecycle (server and client)

- Server WS handlers call `unsubscribe()` inside **both** `socket.on('close')` and
  `socket.on('error')` — a listener registered only on `close` leaks on abnormal disconnects.
- `socket.readyState === 1` (OPEN) is checked before every `socket.send()`.
- Ping/pong keepalive: ping every 30s, close if no pong within 10s, and clear the interval/timeout
  in the `onclose` handler.
- On an intentional close, cleanup order matters: set `.onclose = null` first (prevents the
  reconnect handler from firing), then clear timers, then `.close()`.
- Every new message type over `/api/market/ws` is added to the `WsMessage` discriminated union in
  `generated/CDSDK/types/index.ts`.

## Logging discipline

- Use scoped child loggers — `logger.child({ service: 'ServiceName' })` or
  `logger.child({ route: 'routeName' })` — not the root logger directly.
- Log levels: `debug` = verbose internal state (off by default in prod); `info` = significant
  lifecycle events (connect/disconnect/subscribe); `warn` = recoverable anomalies; `error` =
  unexpected failures, always with `{ err }` as structured context (never `err.message` as a bare
  string — Pino serializes `Error` objects correctly on its own).
- Never log `rawData` from an external WebSocket message — it can be large and may contain
  sensitive market data. Log a one-line type tag instead (`log.debug({ msg_type }, 'WS message')`).

## Configuration & environment

- Any new required env var is added to `criticalVars` in `config.ts` **and** `.env.example` in the
  same change.
- Production-specific checks (e.g. `CLIENT_URL` validation) exit the process early with a clear
  error message rather than degrading silently.
- URLs read from env vars are validated with `new URL(...)` at startup and fail fast if malformed.
- Use `config.nodeEnv`, never `process.env.NODE_ENV` directly, outside of `config.ts` itself and
  `routes/auth/index.ts`.

## Performance & memory

- Any new in-memory collection (`Map`, `Set`, array) that grows over time has an explicit cap or
  cleanup strategy — this is the single most common source of slow leaks in this codebase.
- Ring-buffer trims (`MAX_BARS = 1000` in `paneStore.addBar`, `SNAPSHOT_SIZE = 500` in `bybit.ts`)
  follow the existing `slice(-N)`/`shift()` pattern — don't invent a new trimming strategy per
  feature.
- Indicator/aggregator state is keyed per `symbol:interval` (or per-symbol) — never shared across
  symbols/intervals, and never allowed to bleed data between them.

## Code style (shared, client + server)

- Prettier: 100 print width, single quotes, trailing commas (`es5`), LF line endings — run
  `pnpm format` / CI-gated by `pnpm format:check`.
- ESLint: `no-explicit-any` is an error, `eqeqeq` (`===`) is required, `no-console` is a warning
  (Pino is the real logger server-side).
- Section divider comment style: `// ─── Section Name ──────────────`.
- Add a `// 🔐` comment when a line exists specifically for a security reason — it tells the next
  reviewer the decision was intentional, not incidental.
- Commit prefixes: `feat:`, `fix:`, `security:`, `chore:`, `setup:`, `docs:`. One testable unit of
  work per commit — don't batch unrelated changes.

## Infrastructure

- Changes to `docker-compose.yml` (ports, volumes, env vars) are reflected in `README.md` setup
  instructions in the same change.
- Docker services use pinned image versions — never `:latest`.
- `fly.toml` changes are intentional and verified against the server's actual health-check path,
  port, and memory settings.

## Cross-references

- Server code-shape deep dive (retry/circuit-breaker, WS ping/pong, ring buffers, typed error
  classes) → `.agents/skills/api-best-practices`
- Full pre-commit/audit checklist → `.agents/skills/bug-sweep` (P2, P3, P5, P7–P10, P12)
- Pre-launch tiered audit → `.agents/skills/launch-readiness-audit`
