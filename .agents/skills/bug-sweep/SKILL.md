---
name: bug-sweep
description: Use for two complementary modes on cryptopapertrade.com — (A) proactive bug hunt / regression sweep / "what needs fixing" / "find issues" / "audit weaknesses" / "find latent bugs"; (B) reactive PR / pre-commit / "review this diff" / "is this ready to push" / "CI gate" / "verify my change". Mode A returns a prioritized file:line-cited bug list. Mode B maps the current diff to applicable priorities and returns a pass/fail audit report. Both modes scan for TS-strict / Zustand / WebSocket / Prisma / Fastify / auth / JWT / React / drawing / paper-trading / SDK / config / perf / Docker pitfalls known to bite this repo. Consolidates the former docs/REVIEW_CHECKLIST.md (251 items) into a single source of truth. Trigger words: bug, regression, sweep, smell, audit weaknesses, find issues, hunt (mode A); review, pre-commit, PR check, audit, ready to push, CI (mode B).
---

# Bug Sweep — cryptopapertrade.com (canonical review gate)

Single source of truth for pre-commit / pre-launch / proactive audit checks. Consolidates the former `docs/REVIEW_CHECKLIST.md` (12 sections, 251 items) into priorities P1–P12. Two modes:

- **Mode A — Proactive Sweep**: scan any scope (a directory, a feature area, the whole repo) for every priority pattern. Output: prioritized bug list with `file:line` and fix sketches.
- **Mode B — PR / Pre-Commit Gate**: inspect the current `git diff` and run only the priorities that apply to the changed files. Output: structured audit report + suggested commit message.

Both modes use the same priority list below. Always cite `file:line` for every claim. If you can't evidence, mark `❓ Verify`. Do not implement fixes — present findings; user drives the fix.

## How to pick a mode

- User says "find bugs / sweep / smell / audit / regression" → **Mode A**.
- User says "review this / pre-commit / PR check / ready to push / is this OK" → **Mode B**.
- Ambiguous → ask: "Sweep for bugs across the repo, or pre-commit review of your staged diff?"

## Mode B — diff-to-priority map

After `git status --porcelain` + `git diff` (staged + unstaged), run only the priorities whose triggers appear in the diff:

| Changed file/pattern                                                                                                   | Priorities to run                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Any TS/TSX                                                                                                             | P1 (TS strict), P11 (Code style)                                                                       |
| `apps/server/src/routes/**`, `apps/server/src/plugins/**`, `apps/server/src/config.ts`, `apps/server/src/app.ts`       | P1, P2 (Security), P3 (Backend), P8 (Logging), P9 (Config), P4 (Tests if added)                        |
| `apps/server/prisma/schema.prisma` or `apps/server/prisma/migrations/**`                                               | P3 (Prisma subsection)                                                                                 |
| `generated/CDSDK/**`                                                                                                   | P7 (SDK — also every caller)                                                                           |
| `apps/client/src/store/**`                                                                                             | P4 (Frontend, esp. Zustand selectors + persist version)                                                |
| `apps/client/src/hooks/**`                                                                                             | P4 (React Hooks & Effects)                                                                             |
| `apps/client/src/components/**`                                                                                        | P4 (Component Design), P2 (Client-side security)                                                       |
| Trading logic (`paperStore`, `useTPSLMonitor`, `usePendingOrderMonitor`, `PositionEditPanel`, `PendingOrderEditPanel`) | P4 (TP/SL & Trading Logic), see **`paper-trading-logic`** skill                                        |
| `apps/server/src/services/**`, `apps/server/src/services/BybitWebSocketManager.ts`                                     | P5 (WebSocket), P10 (Performance)                                                                      |
| `apps/client/src/hooks/usePaneFeeds.ts`, `apps/client/src/hooks/usePriceFeed.ts`                                       | P5 (WebSocket)                                                                                         |
| New/updated tests                                                                                                      | P6 (Tests — patterns: `reset()` not partial `setState`, mock Prisma via `Symbol.for('skip-override')`) |
| `docker-compose.yml`, `fly.toml`, `.github/workflows/**`                                                               | P12 (Docker & Infra)                                                                                   |
| New env var                                                                                                            | P9 (Config) — must add to `criticalVars` and `.env.example`                                            |
| New rate-limited route                                                                                                 | P2 (Rate Limiting subsection)                                                                          |
| New persisted Zustand field                                                                                            | P2 (Client-side security) — bump `version` + write `migrate`; P10 (caps)                               |
| In-memory collections (Map/Set/array)                                                                                  | P10 (Performance & Memory — cap or cleanup)                                                            |
| `apps/client/src/lib/drawing/**`, `DrawingPrimitive`, `drawingStore`, `useDrawingInteraction`                          | P-Drawing (see **`drawing-tools`** skill for detail)                                                   |
| UI/visual changes                                                                                                      | session-bootstrap skill visual Q&A gate + `tokens.ts` discipline + `pnpm format`                       |

Then run gates — `pnpm type-check` (server + client), `pnpm lint`, `pnpm format:check`, `pnpm test`. Report failures with command + first error.

---

# Priorities P1–P12 (consolidates REVIEW_CHECKLIST Section 1–12)

## P1 — TypeScript & Type Safety (REVIEW §1)

1. No `any` — every value has a concrete type; use `unknown` + type guard when shape is truly unknown. `no-explicit-any` is ESLint **error**.
2. No non-null assertions (`!`) without a preceding runtime guard that proves the value exists.
3. No `as Foo` cast unless genuinely safe (e.g. after `JSON.parse` with a runtime guard). Search for `as any`, `as unknown`, broad casts.
4. Discriminated unions used where a value can be one of several shapes (e.g. `WsMessage`, `OrderStatus`, `OrderDisplayRow`).
5. New public-facing interfaces go in `generated/CDSDK/types/index.ts` — not scattered in component files.
6. If a server response shape changes, the matching SDK type AND every consumer are updated in the same commit.
7. `pnpm type-check` passes (server + client) — CI blocks on failures.
8. Enum-like values typed as `const` arrays or `as const` objects, never loose strings — `erasableSyntaxOnly: true` prohibits `enum`.

## P2 — Security (REVIEW §2)

### Authentication & Tokens

9. Access tokens stored only in Zustand memory — never `localStorage`, `sessionStorage`, or cookies.
10. Refresh tokens always SHA-256 hashed before DB writes — raw tokens live only in httpOnly cookies.
11. Cookie options (`httpOnly`, `sameSite`, `secure`) match `COOKIE_BASE_OPTIONS` exactly — mismatched options prevent cookie deletion on logout.
12. Every new protected route uses `onRequest: [app.authenticate]`.
13. JWT payload contains only `userId` + `email` — no roles, passwords, PII.
14. Password fields never in any API response (`omit: { password: true }` on every user query / Prisma select).

### JWT Hardening (🔐)

15. 🔐 `JWT_SECRET` has ≥ 32 bytes (256 bits) of entropy — checked at `config.ts` startup (`Buffer.byteLength(config.jwtSecret, 'utf8') >= 32`); exits with clear error if not.
16. 🔐 JWT algorithm explicitly `HS256` in `app.ts` (`algorithms: ['HS256']` on `@fastify/jwt`) — prevents `alg: none` downgrade.
17. 🔐 Access token **never** passed as URL query parameter — only `Authorization: Bearer` header. JWTs in URLs leak to logs, history, Referer.

### CSRF & Cookie Posture (🔐)

18. 🔐 CSRF defence = Bearer token strategy: every state-mutating endpoint requires valid JWT in Zustand memory. `/refresh` and `/logout` CSRF-safe by design. No CSRF token / double-submit cookie needed.
19. 🔐 Cookie `sameSite` is **`lax`** in dev, **`none` + `secure: true`** in prod. Never `strict` without verifying cross-domain redirects. Match `COOKIE_BASE_OPTIONS` on every `setCookie` / `clearCookie`.

### Input Validation

20. Every new Fastify route has a JSON Schema with `additionalProperties: false` — extra fields rejected pre-handler.
21. String inputs have `maxLength` to prevent memory exhaustion.
22. Email inputs use existing regex pattern; password inputs enforce complexity pattern.
23. Symbol/interval inputs validated against `apps/server/src/constants.ts` allowlists (`ALLOWED_SYMBOLS`, `ALLOWED_INTERVALS`). Never trust raw query params.
24. New WebSocket message handlers check `rawData.length` before `JSON.parse` (64KB guard for Bybit messages exists).

### Secrets & Logging

25. No credentials / secrets / tokens / full URLs with credentials logged. `log.error({ err })` only — never `log.error(rawToken)`.
26. No new `console.*` outside `config.ts` (which bootstraps before Pino). Pino `log` is the only logger.
27. No new hardcoded secrets / API keys — all from validated `config.ts` env vars.
28. New critical env var → added to `criticalVars` in `config.ts` AND `.env.example`.

### Rate Limiting

29. High-risk new routes (register, login, email flows) have per-route `rateLimit` config.
30. Rate limit `skip` callbacks return `process.env.NODE_ENV !== 'production'` so tests never hit counters.

### Error Handling

31. 5xx errors logged server-side, return only `{ error: 'Internal Server Error' }` to client — no stack traces / DB error messages / internal paths leak.
32. Endpoint that queries by email returns identical response whether or not the email exists (anti-enumeration — see `/forgot-password`).
33. `deleteMany` used (not `delete`) for token invalidation so concurrent requests get `count=0` (atomic, no P2025 race).
34. 🔐 `app.ts` error handler logs `request.url` on 5xx — verify no sensitive data appears in URL. Audit every GET route for sensitive query params.
35. 🔐 When `/refresh` detects token already consumed (`deleteMany` returns `count=0`), **all** refresh tokens for `userId` are revoked (`deleteMany({ where: { userId: stored.userId } })`).

### Client-Side Security (🔐)

36. 🔐 `dangerouslySetInnerHTML` prohibited without explicit DOMPurify sanitization.
37. 🔐 User-typed content (journal entries in `paperStore.journal[]`) renders as plain text — never as HTML. No component passes user strings to `dangerouslySetInnerHTML` or `innerHTML`.
38. 🔐 `paperStore` `persist()` has `version` number + `migrate` function. Malformed/tampered localStorage never crashes app on hydration. Bump `version` on every new required state field.

### Production-Readiness (🔐)

39. 🔐 `pnpm audit` is part of pre-release gate — `high`/`critical` findings block deployment.
40. 🔐 HTTP Security Headers: in prod, verify Helmet enables HSTS with `includeSubDomains`, CSP whitelists only known origins (no `unsafe-inline` / `unsafe-eval`), and `corsOrigin` is never `*`. Audit `apps/server/src/app.ts`.
41. 🔐 Authenticated WebSocket endpoints [Phase 3+]: JWT via `Authorization` header in HTTP upgrade — never `?token=` query.

## P3 — Backend — Fastify & Prisma (REVIEW §3)

### Routes & Schemas

42. Every route has `schema` object with `tags`, `summary`, and `response` codes documented.
43. New routes registered under correct prefix (`/api/auth`, `/api/market`).
44. Route schemas use shared `errorResponse` / `tokenResponse` objects — no inline duplicates.
45. Protected routes declare `security: [{ bearerAuth: [] }]` in schema so Swagger UI shows lock icon.

### Prisma / Database

46. No raw SQL — all queries via Prisma typed API.
47. New `Decimal` fields use `@db.Decimal(20, 8)` — never `Float`. Grep `Float` in `schema.prisma`.
48. New models/relations have `onDelete: Cascade` where child should not outlive parent.
49. New filterable fields (`userId`, `status`, etc.) have `@@index` in schema.
50. Any schema change accompanied by migration (`pnpm prisma migrate dev`) AND migration file committed.
51. Concurrent-safe operations use `updateMany`/`deleteMany` with unique field in `where` and check `count` — never assume `findUnique` + `delete` is atomic.
52. Interactive transactions (`$transaction(async (tx) => …)`) when multiple writes must succeed or fail together.
53. Sensitive idempotent operations use `deleteMany` not `delete` (no P2025 error on double-call).

### Promises & Async

54. No floating promises — `void` operator for fire-and-forget, `await` everywhere else.
55. `@typescript-eslint/no-floating-promises` ESLint rule active for server source — verify `pnpm lint` passes.
56. 🔐 `AbortSignal.timeout(n)` on every outbound `fetch` (see `fetchHistoricalCandles` pattern).

## P4 — Frontend — React & Zustand (REVIEW §4)

### Zustand Store Selectors

57. Components subscribe with fine-grained selectors (`useStore((s) => s.specificField)`) — never `useStore()` (causes cascade re-renders).
58. Stable action functions (`placeOrder`, `closePosition`, etc.) extracted individually — don't cause unnecessary re-renders.
59. `paperStore` arrays cap (`history`, `orders`, `journal`) use `.slice(0, MAX_*)` on every `set` — no unbounded growth. Any new persisted array → add cap.
60. New persisted state fields in `paperStore` handled gracefully if missing in older localStorage snapshot (Zustand `persist` merge strategy).

### React Hooks & Effects

61. `useEffect` cleanup returns a function that cancels pending work (timers, WS, `isMountedRef.current = false`).
62. `isMountedRef` guard in place before `setState` / store actions inside async operations.
63. WebSocket `onclose` set to `null` before calling `.close()` in cleanup — prevents auto-reconnect firing after intentional disconnect.
64. No `setState` called inside `useEffect` that reacts to state it sets (infinite loop).
65. **No during-render `setState`** — calling `setState` conditionally during render forces extra render + behaves unpredictably under StrictMode/concurrent. Use `key={prop}` on parent side instead.
66. `useEffect` dependency arrays accurate — no missing deps, no over-broad deps triggering on every render.

### Component Design

67. New props interfaces defined above the component (co-located), not in separate types file unless shared.
68. Sub-components extracted to named functions (`JournalRow`, etc.) outside the parent render — prevents identity-based re-renders.
69. `key` props on list items use stable unique IDs (`entry.id`, `pos.id`) — never array index.
70. Framer Motion `variants` objects defined outside the component (module-level constant) — avoid re-creation on every render.

### TP/SL & Trading Logic (cross-ref **`paper-trading-logic`** skill)

71. TP/SL direction validated before order placed:
    - Long: TP > entry, SL < entry.
    - Short: TP < entry, SL > entry.
72. `placeOrder` includes entry commission in balance check (`usdtAmount + fee > balance` → reject).
73. `closePosition` applies `Math.max(0, returnAmount)` — balance never goes negative.
74. `realizedPnl` subtracts BOTH legs of commission — entry commission (`entryUsdtAmount × COMMISSION_RATE`) AND exit commission (`qty × exitPrice × COMMISSION_RATE`). Omitting either overstates profit.
75. `useTPSLMonitor` only evaluates positions matching active `symbol` — cross-symbol false triggers are a known bug risk.

## P5 — WebSocket — Server & Client (REVIEW §5)

76. New server WS handlers call `unsubscribe()` inside BOTH `socket.on('close')` AND `socket.on('error')` — no memory leak from orphaned listeners.
77. `socket.readyState === 1` (OPEN) checked before every `socket.send()`.
78. Client `usePaneFeeds` reconnect timer cleared on unmount BEFORE the WebSocket is closed.
79. Any new message type over `/api/market/ws` added to `WsMessage` discriminated union in `generated/CDSDK/types/index.ts`.
80. Server-side `BybitWebSocketManager` subscriber count does not grow unboundedly — listener Set entries deleted via returned unsubscribe function.

## P6 — Tests (REVIEW §6)

81. Every new feature or bug fix has at least one test case.
82. New route handlers have happy-path AND at least one error/edge-case test.
83. New store actions in `paperStore` / `paneStore` / `layoutStore` have unit tests verifying state transitions.
84. Complex business logic inside hooks extracted into pure function and tested independently — hooks are hard to test in isolation; pure helpers (`checkTPSL`) can be unit-tested with zero React/store setup.
85. Test `beforeEach` / teardown helpers reset ALL store fields — use store's own `reset()` action rather than partial `setState`. Partial resets silently leave new fields (`orders`, `journal`, `realizedPnl`) at previous values causing state leakage + flaky assertions.
86. Tests do not depend on real databases, real external APIs, or network calls — Prisma and EmailService always mocked.
87. Prisma mock uses `Symbol.for('skip-override')` so decorations are visible across plugin scopes (see `auth.test.ts`).
88. `vi.fn()` mocks for Prisma methods returning `{ count: N }` use `mockResolvedValue({ count: 1 })` by default, override per-test with `mockResolvedValueOnce` — avoids cross-test pollution.
89. Test descriptions follow `describe('route/function') → it('should <action> when <condition>')`.
90. After adding tests, `pnpm test` passes for whole suite (server + client) without skips.
91. New tests do not import from `dist/` or `generated/` — always import from `src/`.

## P7 — Shared SDK `generated/CDSDK` (REVIEW §7)

92. `generated/CDSDK` is single source of truth for shared types + API functions — no duplicate type definitions in `apps/client/src`.
93. API function changes in `generated/CDSDK/api/` are backward-compatible, or all callers in `apps/client/src` updated in same commit.
94. `@crypto-dashboard/sdk` import path used in client code — never relative path into `generated/`.
95. `wsUrl()` in `generated/CDSDK/api/market.ts` stays in sync with server route prefix (`/api/market/ws`).

## P8 — Logging (REVIEW §8)

96. Use `logger.child({ service: 'ServiceName' })` or `logger.child({ route: 'routeName' })` — scoped child loggers, not root logger direct.
97. Log levels used correctly:
    - `log.debug` — verbose internal state (disabled in production by default).
    - `log.info` — significant lifecycle events (connect, disconnect, subscribe).
    - `log.warn` — recoverable anomalies (dropped message, non-finite field).
    - `log.error` — unexpected failures; always include `{ err }` as structured context.
98. Error objects passed as `{ err: error }`, never as string via `.message` alone (Pino serializes Error objects correctly).
99. Do not log `rawData` from external WS messages — could be large or contain sensitive market data.

## P9 — Configuration & Environment (REVIEW §9)

100. Any new required env var added to `criticalVars` in `config.ts` AND `.env.example`.
101. Production-specific checks (like `CLIENT_URL` validation) exit process early with clear error message.
102. URLs read from env vars validated with `new URL(...)` and fail fast on startup — never silently use malformed URL.
103. `config.nodeEnv` used for environment branching — never `process.env.NODE_ENV` directly in application code outside `config.ts` and `routes/auth/index.ts`.

## P10 — Performance & Memory (REVIEW §10)

104. New in-memory collections (Maps, Sets, arrays) that grow over time have cap or cleanup strategy.
105. `MAX_BARS = 1000` ring-buffer logic preserved in `paneStore.addBar` — do not break `slice(-MAX_BARS)` trim. (Raised from 500 to 1000 to match `INTERVAL_FETCH_LIMIT` server max.)
106. `SNAPSHOT_SIZE = 500` in `bybit.ts` — any new snapshot Map follows same `shift()` pattern.
107. Indicator managers (`IndicatorManager`, `EMACalculator`, etc.) keyed per `symbol:interval` — no shared state across symbols or intervals.
108. `CandleAggregator` per-symbol state isolated — verify new symbols do not bleed data into existing symbol histories.
109. Bybit orderbook throttle: `bybit.ts` throttles `orderbook.1` to 500ms per symbol. New ticker/sub paths must respect it.

## P11 — Code Style & Conventions (REVIEW §11)

110. `pnpm lint` passes with zero errors (ESLint + TypeScript-ESLint rules).
111. `pnpm format` has been run — Prettier formatting is consistent (100 print width, single quotes, trailing commas `es5`).
112. `pnpm type-check` passes — no TS compile errors.
113. Commit message follows prefix convention: `feat:` · `fix:` · `security:` · `chore:` · `setup:` · `docs:`.
114. One testable unit of work per commit — no batching unrelated changes.
115. Section dividers use existing style: `// ─── Section Name ──────────────`.
116. Security comments (`🔐`) added when a decision was made for security reasons — helps future reviewers understand intent.
117. No hardcoded hex / font strings / font sizes in components — always from `@/lib/tokens`. Canvas libs read `tokens.ts` directly. Path alias `@/` = `./src/` only — no deep relative chains.

## P12 — Docker & Infrastructure (REVIEW §12)

118. Changes to `docker-compose.yml` (ports, volumes, env vars) reflected in `README.md` setup instructions.
119. New Docker services use pinned image versions — no `:latest` tags.
120. `fly.toml` changes intentional — verify health check paths, port, memory settings match server config.

---

# Trading-logic specific pitfalls (P-Trade) — corroborate with **`paper-trading-logic`** skill

These were in the original bug-sweep and are now subsumed under P4 Trading Logic + tracked in detail in the paper-trading-logic skill. Verify they don't regress:

121. `realizedPnl` commission double-count / omission (P-74 restated).
122. Balance negative path: any new close path must inherit `Math.max(0, returnAmount)` (P-73).
123. `useTPSLMonitor` scope — only active symbol positions.
124. `paperStore.persist` version matches current schema.
125. Editable price/qty inputs must be `type="text" inputMode="decimal"` + `.replace(/,/g,'')` parse — never `type="number"` (locale commas break it).
126. Edit-panel phantom buttons: `onEditPosition && <button ...>` guard, never optional-chain `onClick?:`.
127. Duplicate-pencil regression: pending STOP rows must NOT show a limit-price pencil — limit-price pencil only when `isPending && type === 'limit'`, stop-price pencil when `isPending && type === 'stop'`.
128. Sibling-cancel journal noise: auto-cancelled sibling TP/SL on position close must NOT add a journal note. Don't add "for completeness".

---

# Drawing-system pitfalls (P-Drawing) — corroborate with **`drawing-tools`** skill

129. `getBoundingClientRect()` for toolbar position (`ChartPanel.tsx:382–403`): latent scroll bug. Confirm no new usage unless repositioned on scroll/resize.
130. `cloneDrawing` must not mangle parallel channel's 3-point geometry — check `drawingStore.ts` `cloneDrawing`. If still does naive `priceOffset` on every shape, flag.
131. Hit-test parity: every new shape must go through `hitTestBodies` dispatch in `coordinates.ts`. Never re-implement inline.
132. `cd-drawings` version matches schema; new `ShapeData` variant ⇒ version bump + `migrate` covers new variant.
133. Locked drawings still deletable via eraser — `isLocked` blocks drag/handle drag only, not eraser click. Don't add guard that breaks this.
134. UI-only tools (Text, Freehand, Polyline) must NOT be claimed implemented in docs. If `DRAWING_TOOLS.md` contradicts code, fix the doc (user-permitting).
135. Cosmetic exit-order Type label mismatch: Order History shows `MARKET` vs TradingView's `Take Profit`. Non-blocking — track, don't silently change.

---

# TS-strict + conventions (P-ClientTS) — corroborates P1/P11

136. `verbatimModuleSyntax: true` → every type import is `import type { ... }` (or inline `import { type Foo }`).
137. `erasableSyntaxOnly: true` → no `enum` and no `namespace`. Grep `enum ` / `namespace ` in `apps/client/src`.
138. `noUnusedLocals` / `noUnusedParameters` → no dead bindings committed.

---

## Output — Mode A (proactive sweep)

```
# Bug Sweep — <scope>

P1 (block launch):
  [server] JWT passed as URL param  apps/server/src/routes/market/index.ts:88
        → switch to Authorization header; tests must mock header.

P2 (correctness):
  [client] realizedPnl omits exit commission  apps/client/src/store/paperStore.ts:571
        → subtract `exitCommission` before set.

P3 (memory/ws):
  …

P4 (drawing):
  …

P5 (ts/conventions):
  …

P6 (server):
  …

P12 (docker/infra):
  …

P-Trade (trading logic):
  …

P-Drawing (drawing system):
  …

P-ClientTS (TS strict):
  …
```

Always cite `file:line`. If you can't evidence, mark `❓ Verify`. Do NOT fix anything yourself — present the list and let the user pick. Run `pnpm --filter @crypto-dashboard/client type-check` and `pnpm lint` and report the pass/fail status as part of the sweep.

## Output — Mode B (PR / pre-commit gate)

After running the diff-aware priorities from the table above, plus the gates:

```
## Review: <commit/branch>

Scope: <N files, server|client|sdk|docs>

### Applicable priorities: P1, P2, P4, P6, P11

✅ Pass — <checklist item>  (file:line)
❌ Fail — <checklist item>  (file:line) → <one-line fix suggestion>
⚠️ N/A  — <checklist item>  (reason)

### Gates
pnpm type-check (server): PASS
pnpm type-check (client): PASS
pnpm lint: PASS
pnpm format:check: FAIL — run `pnpm format`
pnpm test: PASS

Suggested commit:
<type>: <one-line subject>

<optional body: why + verified gates>
```

Never invoke `git commit` unless the user says so. Never auto-edit files based on the audit — present findings, user instructs.

## Cross-references

- **`session-bootstrap`** — enforces the no-implementation-without-instruction rule that gates these findings.
- **`paper-trading-logic`** — P-Trade detail + app-side state map.
- **`drawing-tools`** — P-Drawing detail + ISeriesPrimitive architecture.
- **`lightweight-charts-patterns`** — chart feed + lifecycle patterns; run P5 and P10 before chart changes.
- **`api-best-practices`** — server code patterns for _writing it right in the first place_; this skill is the _verify-it_ companion.
- **`launch-readiness-audit`** — pre-launch tier analysis; calls P1/P2 for blocker-level checks.
- **`figma-theme-source`** — UI/visual source of truth; relevant when P11 / P-117 fires on hardcoded hex.
