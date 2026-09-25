# Security Conventions (Cyber Security Expert)

Scope: the security _program_ for cryptopapertrade.com — threat model, supply chain, transport,
container/infra hardening, and dependency policy. Where a rule is about how a specific line of
code should look (JWT payload shape, cookie flags, Prisma query patterns), the canonical detail
lives in [`web.md`](./web.md#security) — this file is the layer above that: _why_ the posture
exists, and the controls that sit outside any single route handler.

## Threat model summary

- **Assets**: user credentials/session tokens, paper-trading account state (not real funds, but
  still user data), Bybit API keys (server-held, testnet by default), and service availability
  (market-data WS feed, order matching).
- **Primary attacker classes**: unauthenticated internet traffic against public routes
  (credential stuffing, enumeration), a malicious/compromised npm dependency (supply chain), a
  script-injection attempt via user-authored content (journal entries), and abuse of the public
  WebSocket/REST surface for resource exhaustion.
- **Not currently in scope**: this is a paper-trading (simulated funds) product — real-money
  custody, KYC/AML, and PCI-scope concerns do not apply today. Re-evaluate this file if that
  changes.

## Defense in depth — the layers, outside-in

1. **Network edge**: Fly.io TLS termination + `strictTransportSecurity` (HSTS, `maxAge: 63072000`,
   `includeSubDomains`, `preload`) forces HTTPS for the domain and its subdomains, with HSTS
   preload-list eligibility.
2. **CSP**: production-only Content-Security-Policy (`CSP_DIRECTIVES` in `apps/server/src/app.ts`)
   — `default-src 'self'`, `script-src 'self'` (no inline/eval), `object-src 'none'`,
   `frame-ancestors 'none'`, `base-uri 'none'`. `style-src` allows `'unsafe-inline'` as a
   documented, accepted tradeoff for Framer Motion's injected styles — that is a style-injection
   surface, not a script-execution one, and is the _only_ CSP relaxation permitted. CSP is
   disabled in non-production only because Swagger UI needs inline scripts there — never disable
   it in production. Violations POST to `/api/csp-violation`, which is registered **after**
   rate-limiting so the report sink itself can't be used to flood logs.
3. **CORS**: explicit origin allowlist (`origin: [config.corsOrigin]`) in every environment —
   never `origin: true` (reflect-any-origin) while `credentials: true` is set, since that
   combination lets any site read cookie-authenticated responses if `NODE_ENV` is ever
   misconfigured in a deployed environment.
4. **Rate limiting**: global 100 req/min via `@fastify/rate-limit`, with additional per-route
   limits on high-risk auth/email endpoints (see `web.md`). Disabled only when
   `config.nodeEnv === 'test'` so the suite isn't flaky against shared counters — never disabled in
   production or staging.
5. **AuthN/session**: short-lived JWT (`HS256`, pinned algorithm, ≥32-byte secret) in memory only,
   long-lived refresh token in an httpOnly cookie, hashed at rest. Full rules in `web.md`.
6. **Input boundary**: every Fastify route schema sets `additionalProperties: false` and bounds
   string length; symbol/interval inputs are checked against a fixed allowlist, never passed
   through to an upstream call unvalidated.
7. **Data layer**: Prisma's typed query builder only — no raw SQL, no string-concatenated queries.
   `eslint-plugin-security`'s recommended rule set runs across the whole repo (root
   `eslint.config.js`) to catch unsafe patterns (`child_process` with unsanitized input, unsafe
   regex, etc.) at lint time, not just at review time.
8. **Egress**: every outbound `fetch` to Bybit (or any external service) carries
   `AbortSignal.timeout(...)` — an unbounded outbound call is both a reliability and a
   resource-exhaustion risk if the upstream hangs.

## Supply-chain security

- **Postinstall-script allowlist**: `.npmrc` sets `only-built-dependencies` to an explicit list
  (`@prisma/engines`, `argon2`, `esbuild`, `prisma`). pnpm will **not** run an arbitrary package's
  install/postinstall script unless it's on this list — this is a direct mitigation against the
  most common npm supply-chain attack (a compromised transitive dependency running code at install
  time). Adding a new native/build dependency means deliberately adding it here, not just letting
  pnpm silently allow it.
- **Forced-version overrides**: `package.json`'s `pnpm.overrides` pins a long list of transitive
  dependencies (`undici`, `hono`, `brace-expansion`, `ip-address`, `fast-uri`, `js-yaml`, `axios`,
  `sharp`, `postcss`, `body-parser`, `find-my-way`, `@fastify/static`, `nanoid`, `valibot`, `ws`,
  `serialize-javascript`, `@hono/node-server`) to CVE-patched minimum versions regardless of what a
  direct dependency requests. When `pnpm audit` flags a new transitive CVE, the fix is a new
  override entry here (with a version floor, ideally a range like `existing@<fixed`: `>=fixed`),
  not a blanket `pnpm update` that may silently downgrade something else.
- **Audit gate is a hard blocker, not advisory**: `pnpm audit --audit-level=high` runs in
  `preinstall`, in the pre-commit hook, and in CI (`ci.yml`) — high/critical findings fail the
  build. Low/moderate findings are visible but non-blocking. Never bypass this with
  `--no-verify`/skipping the CI step to unblock a merge; fix or override the specific package.
- **Lockfile discipline**: CI and both Docker build stages install with `--frozen-lockfile` —
  a lockfile drift between what's committed and what's installed is treated as a build failure,
  not silently resolved.

## Secrets management

- No secret is ever hardcoded — every credential comes from an environment variable validated in
  `apps/server/src/config.ts`, which exits the process with a clear error if a `criticalVars`
  entry is missing (fail closed, not fail open).
- `.env` is git-ignored; `.env.example` documents every variable's shape with placeholder/dummy
  values only, and carries an explicit `🔐 NEVER commit real secrets to git` reminder next to the
  JWT section.
- `JWT_SECRET` has an enforced minimum entropy (≥32 bytes), checked at boot, not just documented —
  a weak secret fails startup rather than shipping.
- No secret, token, or credentialed URL is ever written to a log line — see the logging rule in
  `web.md`. This is a security control as much as a hygiene one: log aggregators are a common
  place secrets leak long after the original request is gone.
- CI injects only a dummy `DATABASE_URL` for `prisma generate` — no real credentials exist in CI
  configuration or Docker build args.

## Container & infrastructure hardening

- The production Docker image runs as a dedicated **non-root user** (`nodejs`, uid/gid 1001),
  created explicitly and given ownership of `/app` before `USER nodejs` switches out of root —
  a compromised process cannot use root privileges to escape or persist in the container.
- Multi-stage build: the builder stage (which needs dev dependencies and build tooling) is
  discarded; the runner stage installs only `--prod` dependencies, shrinking the attack surface of
  what ships to production.
- Docker base images are pinned to an exact tag (`node:24.14.1-alpine`) — never `:latest`, so a
  base-image update is a deliberate, reviewed change rather than a silent supply-chain surface.
- A `HEALTHCHECK` against `/health` lets the orchestrator (Fly.io) restart an unhealthy instance
  automatically rather than leaving a compromised or wedged process serving traffic.
- Swagger/OpenAPI docs (`/docs`) are registered **only** outside production — never ship a public,
  unauthenticated API schema to the internet.

## Client-side security posture

- Access tokens never touch persistent storage (`localStorage`/`sessionStorage`) — a successful
  XSS still can't exfiltrate a long-lived credential, only whatever's in memory for that page load.
- User-authored content is never rendered as HTML (`dangerouslySetInnerHTML`/`innerHTML` require
  explicit DOMPurify sanitization, and are prohibited without it) — this is the primary stored-XSS
  defense for the journal/notes feature.
- Persisted client state (`paperStore`, `cd-drawings`, etc.) has a `version` + `migrate` function
  specifically so a malformed or tampered `localStorage` payload can never crash or desync the app
  on load — treat client storage as attacker-controllable input, not trusted state.

## Verify a refactor is safe

A refactor's stated intent is "no behavior change," which is exactly why it's a common place for a
security regression to slip in unreviewed — a diff that looks purely structural (extract a
function, rename, move a file, flatten a conditional, consolidate call sites) can silently drop or
reorder a security-relevant line while every functional test still passes. **After finishing any
refactor — before calling it done, committing it as `refactor:`, or reporting it complete — walk
the diff against this checklist**, not just the checklist for the feature area being touched:

- [ ] **Auth/authz checks preserved and in the same order relative to the mutating operation.**
      If `onRequest: [app.authenticate]`, an ownership check, or a permission check lived on the
      pre-refactor path, confirm it's still on every path that can now reach the same effect —
      especially if the refactor extracted a helper that a _new_ caller might invoke without going
      through the original guard.
- [ ] **Every call site checked, not just the one that motivated the refactor.** If a function was
      extracted or consolidated because two places had similar logic, confirm a security property
      that was only implicitly true at one call site (e.g. "this helper is only ever called after
      the request is authenticated") still holds at every call site after the change.
- [ ] **Input validation/sanitization still runs before the data is used.** Schema validation,
      allowlist checks (`ALLOWED_SYMBOLS`/`ALLOWED_INTERVALS`), and sanitization steps are easy to
      leave behind when logic moves to a new function or file — confirm the validation step moved
      _with_ the code it was guarding, not just the code itself.
- [ ] **Error handling still fails closed.** Flattening or restructuring `try`/`catch` blocks can
      let a raw error (stack trace, DB message, internal path) bubble past the point that used to
      catch and sanitize it before it reached the client. Re-check the 5xx path still returns only
      `{ error: 'Internal Server Error' }`.
- [ ] **No new logging of sensitive data.** A refactor that changes what's in scope at a `log.*`
      call (e.g. now logging the whole request/user object for convenience) can reintroduce a
      secret/token/PII into logs that a prior, more narrowly-scoped log line avoided.
- [ ] **No new dependency introduced as a side effect.** If the refactor pulled in a new
      helper/utility package to simplify the code, it goes through the same supply-chain scrutiny
      as any other new dependency (see [Supply-chain security](#supply-chain-security)) — a
      refactor is not a lower-scrutiny path for adding a dependency.
- [ ] **The relevant `bug-sweep` priorities still get run.** "It's just a refactor" is not an
      exemption from `.claude/skills/bug-sweep` Mode B — run P1 (types) and P2 (security) at
      minimum against the diff, plus whichever other priorities the touched files map to.

If any box can't be checked with confidence from the diff alone, say so explicitly rather than
assuming the refactor is safe — a security regression hidden inside a "no behavior change" commit
is exactly the failure mode this checklist exists to catch.

## Definition of done — security checklist for a new feature

Before calling a feature "done," confirm:

- [ ] Every new route has a JSON Schema with `additionalProperties: false` and bounded string
      lengths.
- [ ] Every new protected route uses `onRequest: [app.authenticate]` and declares
      `security: [{ bearerAuth: [] }]` in its schema.
- [ ] No new `console.*`, no secret/token in any log line.
- [ ] Any new env var is in both `criticalVars` (`config.ts`) and `.env.example`.
- [ ] Any new outbound `fetch` has `AbortSignal.timeout(...)`.
- [ ] `pnpm audit --audit-level=high` is clean, or a new CVE is resolved via a `pnpm.overrides`
      entry, not suppressed.
- [ ] Any new native/build dependency is deliberately added to `.npmrc`'s
      `only-built-dependencies` — not silently allowed to run install scripts.
- [ ] User-controllable content never reaches `dangerouslySetInnerHTML`/`innerHTML` unsanitized.
- [ ] 5xx paths return only `{ error: 'Internal Server Error' }` — no stack trace or DB error text
      to the client.

## Cross-references

- Code-level security rules (JWT payload, cookie flags, Prisma patterns, rate-limit config) →
  [`web.md`](./web.md#security)
- Full pre-commit/audit checklist (P2 = Security) → `.claude/skills/bug-sweep`
- Server request-handling code shape → `.claude/skills/api-best-practices`
- Pre-launch tiered risk audit → `.claude/skills/launch-readiness-audit`
