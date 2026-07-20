---
name: api-best-practices
description: Use whenever adding or modifying a REST route or WebSocket handler on apps/server in cryptopapertrade.com — including Bybit proxy extensions, funding/OI endpoints, new auth routes, or extending ALLOWED_SYMBOLS / ALLOWED_INTERVALS. Covers timeframe validation, Bybit error-class typing, exponential-backoff + circuit-breaker retry, REST + WS lifecycle (ping/pong/30s), symbol-set validation caching, ring-buffer memory bounds, AbortSignal timeouts. Complements the pr-review-checklist (which enforces) — this skill is the "how to write it right in the first place" reference. NOT for client-side work — use lightweight-charts-patterns or paper-trading-logic there.
---

# API Best Practices — cryptopapertrade.com server

Adapted from `emeraldls/mmt-api-skills` → `skills/mmt-api-best-practices/SKILL.md` + its 21 per-rule files. Dropped (MMT-specific, not applicable): multi-exchange colon syntax, CBOR encoding, MMT tier semantics, MMT authentication, aggregation cost multipliers. Preserved (portable, Bybit-direct): timeframe validation, type systems, error patterns & typed error class, exponential backoff + circuit breaker, WebSocket lifecycle (ping/pong/30s), symbol-set validation cache, ring-buffer memory bounds, AbortSignal timeouts.

This is a **reference** skill — the code-shape companion to **`bug-sweep`**. `bug-sweep` tells you what to verify (priorities P1–P12, diff-aware pre-commit gate); this skill tells you what good code looks like in the first place.

## Timeframe validation — single source of truth

Add to `generated/CDSDK` (shared server + client):

```typescript
export const TF_SECONDS: Record<string, number> = {
  '1s': 1,
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '12h': 43200,
  '1d': 86400,
  '1w': 604800,
} as const;

export type Interval = keyof typeof TF_SECONDS;

export function alignToTimeframe(timestamp: number, tfSeconds: number): number {
  return Math.floor(timestamp / tfSeconds) * tfSeconds;
}

export function isValidInterval(tf: string): tf is Interval {
  return tf in TF_SECONDS;
}
```

`apps/server/src/constants.ts` already has `ALLOWED_INTERVALS` — reconcile it with `TF_SECONDS`. Any new interval must (a) be added to `TF_SECONDS` and `ALLOWED_INTERVALS`, (b) get a server proxy route test, (c) get a client `INTERVAL_LABELS` entry per `apps/client/src/lib/markets.ts`.

**Bybit-specific**: Bybit returns `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M` — `1M` requires special handling (variable second count). Don't ship `1M` to the UI without a UTC-month-boundary alignment function.

## Symbol-set validation cache (drop stale symbols fast)

```typescript
import { ALLOWED_SYMBOLS } from '../constants.js';

// Frozen set — initialized once at process boot, refreshed only on constants change
const VALID_SYMBOLS = new Set<string>(ALLOWED_SYMBOLS);

export function isValidSymbol(symbol: string): boolean {
  // Bybit returns 'BTCUSDT'; lowercase comparison for client ergonomics
  return VALID_SYMBOLS.has(symbol.toUpperCase());
}

// Fast-fail in route schema validator instead of fetching from upstream
fastify.get('/api/market/history', {
  schema: {
    querystring: {
      type: 'object',
      required: ['symbol', 'interval'],
      properties: {
        symbol: { type: 'string', enum: ALLOWED_SYMBOLS },   // ← Fastify validates for us
        interval: { type: 'string', enum: Object.keys(TF_SECONDS) },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      additionalProperties: false,
    },
  },
}, async (req, reply) => { ... });
```

Cross-reference **`pr-review-checklist`** section 3 (Fastify schemas with `additionalProperties: false`).

## Typed error class — kill `any` in error handling

```typescript
// apps/server/src/types/errors.ts
export type BybitErrorCode =
  | 'BYBIT_RATE_LIMITED'
  | 'BYBIT_TIMEOUT'
  | 'BYBIT_INTERNAL_ERROR'
  | 'BYBIT_SERVICE_UNAVAILABLE'
  | 'BYBIT_INVALID_SYMBOL'
  | 'BYBIT_INVALID_INTERVAL'
  | 'BYBIT_UNAUTHORIZED'
  | 'BYBIT_UNKNOWN';

const RETRYABLE_CODES: ReadonlySet<BybitErrorCode> = new Set([
  'BYBIT_RATE_LIMITED',
  'BYBIT_TIMEOUT',
  'BYBIT_INTERNAL_ERROR',
  'BYBIT_SERVICE_UNAVAILABLE',
]);

export class BybitApiError extends Error {
  readonly code: BybitErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    httpStatus: number,
    code: BybitErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BybitApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  get isRetryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }
}
```

ESLint `no-explicit-any` is an error per AGENTS.md — `details: Record<string, unknown>` satisfies the rule. The 5xx handler in `app.ts` should check `instanceof BybitApiError` so it doesn't leak internal Bybit errors to the client (return only `{ error: 'Internal Server Error' }` — `bug-sweep` P2-31 error-handling).

## Retry + circuit breaker — fetch helper

```typescript
// apps/server/src/lib/fetchWithRetry.ts
import { AbortSignal } from 'node:abort-controller';
import { BybitApiError } from '../types/errors.js';

export class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly resetMs = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt > this.resetMs) this.state = 'half-open';
      else throw new Error('CircuitBreakerOpen');
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}

export async function fetchWithRetry(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
  breaker = new CircuitBreaker(),
  maxRetries = 4
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await breaker.execute(() =>
        fetch(url, {
          ...opts,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000), // `bug-sweep` P3-56 (AbortSignal required)
        })
      );
    } catch (e) {
      lastErr = e;
      if (e instanceof BybitApiError && !e.isRetryable) throw e; // 400/401/403 — fail fast
      if (attempt === maxRetries - 1) break;
      const delay = Math.min(1000 * 2 ** attempt, 30_000); // 1s, 2s, 4s, 8s cap
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastErr;
}
```

Use this wrapper for every outbound call to Bybit or any other external service. The existing `fetchHistoricalCandles` in `apps/server/src/services/...` already uses `AbortSignal.timeout(n)` per `bug-sweep` P3-56 — extend the same discipline with the retry wrapper.

## WebSocket lifecycle — ping/pong/30s with 10s pong timeout

```typescript
// Bybit direct or upstream WS — server-side
let pingInterval: NodeJS.Timeout;
let pongTimeout: NodeJS.Timeout;

ws.onopen = () => {
  pingInterval = setInterval(() => {
    try {
      ws.send(JSON.stringify({ op: 'ping' })); // Bybit's ping — op:'ping'
      pongTimeout = setTimeout(() => {
        ws.close();
        // → onclose handler runs reconnect with backoff
      }, 10_000);
    } catch (e) {
      log.warn({ err: e }, 'WS ping failed');
    }
  }, 30_000);
};

ws.onmessage = (event) => {
  let msg: unknown;
  try {
    msg = JSON.parse(event.data.toString());
  } catch {
    return;
  }
  if (msg && typeof msg === 'object' && 'op' in msg && (msg as any).op === 'pong') {
    clearTimeout(pongTimeout); // pong arrived in time — reset
  }
  // ... dispatch to handlers
};

ws.onclose = () => {
  clearInterval(pingInterval);
  clearTimeout(pongTimeout);
  // → initiate reconnect if not intentional
};
```

Cleanup order on intentional close (see `bug-sweep` P3):

```typescript
function cleanup() {
  ws.onclose = null; // ← prevents onclose firing reconnect
  clearInterval(pingInterval);
  clearTimeout(pongTimeout);
  if (ws.readyState === 1 /* OPEN */) ws.close(1000);
}
```

This pattern already exists in part in `BybitWebSocketManager.ts` — audit before extending.

## Ring buffer memory bounds

Server aggregator maps can grow unbounded across sessions. Always defend with a cap.

```typescript
// 500-bar snapshot (already in paneStore)
const SNAPSHOT_SIZE = 500;
const MAX_BARS = 1000;

function addBar(bars: CandleBar[], bar: CandleBar): CandleBar[] {
  const next = bars.length >= MAX_BARS ? [...bars.slice(-MAX_BARS + 1), bar] : [...bars, bar];
  return next.slice(-MAX_BARS);
}

// Orderbook snapshot — cap depth to N levels (Bybit orderbook.200 already caps to 200)
function trimOrderbook(book: OrderBook, maxLevels = 200) {
  if (book.bids.size > maxLevels) {
    const drop = [...book.bids.keys()].sort((a, b) => b - a).slice(maxLevels);
    for (const p of drop) book.bids.delete(p);
  }
  // same for asks
}
```

Reference **`pr-review-checklist`** §10 (Performance & Memory): ring buffers must cap; `deleteMany` not `delete` for idempotent operations.

## Logger discipline

```typescript
import log from '../logger.js'; // Pino child

// ✅ Structured context — Pino serializes Error objects correctly
try {
  await fetchBybit(url);
} catch (e) {
  log.error({ err: e, symbol, interval }, 'Bybit fetch failed');
  throw new BybitApiError(502, 'BYBIT_TIMEOUT', 'Upstream timeout');
}

// ❌ DON'T: passing strings only loses stack trace
log.error('Bybit fetch failed' + e.message);

// ❌ DON'T: logging the raw response body (may contain sensitive market data, unbounded size)
log.debug({ raw: event.data }, 'WS message'); // `bug-sweep` P8-99 violation
```

Per `bug-sweep` P8-99 — switch to `log.debug({ msg_type: (msg as any).type }, 'WS message')` (one-line type tag, no payload).

## Common pitfalls to catch in review (cross-reference `bug-sweep` P3 + P8 before merging any new endpoint)

1. **Floating promises** — `@typescript-eslint/no-floating-promises` is error in server source. Every async fire-and-forget must be `void`-prefixed explicitly.
2. **Missing `AbortSignal.timeout` on outbound `fetch`** — required on every call to Bybit; default 8s.
3. **WS listener handler not unregistered on both `'close'` and `'error'`** — Set grows; memory leak.
4. **`socket.readyState !== 1` not checked before `socket.send`** — throws on (CLOSING/CLOSED).
5. **Reconnect timer not `clearTimeout`'d on unmount before `.close()`** — race fires the reconnect after intentional disconnect.
6. **`console.*` in app code** — Pino is the only logger; `console` is only OK in `config.ts` (bootstrap) per AGENTS.md.
7. **5xx returns stack trace or DB error to client** — only `{ error: 'Internal Server Error' }` is allowed (REVIEW §2).
8. **Enum-like intervals encoded as loose strings** — use `as const` arrays or `TF_SECONDS` keys, never string literals.

## When NOT to use this skill

- **Client-side work** (React, Zustand, charts) → use **`lightweight-charts-patterns`** or **`paper-trading-logic`**.
- **Visual / design decisions** → **`figma-theme-source`**.
- **Pre-commit review checklist** → **`pr-review-checklist`** (that one is verification; this one is design).
- **Drawing / chart primitives** → **`drawing-tools`**.
- **Trading workflow** (entry/stop/size planning) → **`position-sizer`** or **`pre-trade-discipline-gate`**.

## Output discipline

- Cite exact `apps/server/...` files when proposing an addition or change.
- New env var → also to `criticalVars` in `config.ts` AND `.env.example`.
- New `Decimal` field → `@db.Decimal(20, 8)`, never `Float` (REVIEW §3).
- New route → schema with `tags`, `summary`, `response` codes, `additionalProperties: false`, `security: [{ bearerAuth: [] }]` for protected routes (REVIEW §3).
- Run `pnpm --filter @crypto-dashboard/server type-check` and `pnpm lint` after any server change.
- Propose changes first — don't apply without explicit user approval per AGENTS.md "no implementation without explicit instruction" rule.
