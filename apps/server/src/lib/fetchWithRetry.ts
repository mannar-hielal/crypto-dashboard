/**
 * Outbound HTTP with a timeout, bounded retries and a circuit breaker (api-best-practices,
 * APP_LOG Bybit Parity BP-0 follow-up / BP-3 step 0).
 *
 * - Every attempt carries `AbortSignal.timeout` (🔐 an unbounded upstream call is a
 *   resource-exhaustion risk).
 * - Only transient failures are retried: a network error, a timeout, HTTP 429 or a 5xx. A 4xx is
 *   returned to the caller at once — retrying a bad request can't fix it.
 * - Backoff is exponential with jitter, capped, and the attempt count is small: callers on a
 *   request path (chart history) must answer quickly, and every caller already has a fallback
 *   (stale cache, a retry on the next tick).
 * - A CircuitBreaker per upstream stops a dead Bybit from being hammered: after `threshold`
 *   consecutive failures it fails fast for `resetMs`, then lets calls through again.
 */

import { config } from '../config.js';

export class CircuitOpenError extends Error {
  constructor(readonly upstream: string) {
    super(`Circuit open for ${upstream}`);
    this.name = 'CircuitOpenError';
  }
}

/** Upstream answered with a status worth retrying (429 / 5xx). */
class RetryableStatusError extends Error {
  constructor(readonly status: number) {
    super(`Upstream HTTP ${status}`);
    this.name = 'RetryableStatusError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    readonly upstream: string,
    private readonly threshold = 5,
    private readonly resetMs = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Test helper: back to closed with no failures counted. */
  reset(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.resetMs) {
      // Half-open: let calls through; the next failure re-opens it immediately
      this.openedAt = null;
      this.failures = this.threshold - 1;
      return false;
    }
    return true;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) throw new CircuitOpenError(this.upstream);
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = this.now();
      throw err;
    }
  }
}

export interface RetryOptions {
  timeoutMs?: number;
  /** Total attempts, including the first (default 3) */
  attempts?: number;
  /** First backoff delay; doubles per retry (default 300 ms, 0 under test) */
  baseDelayMs?: number;
}

const MAX_DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch` with timeout + retry + breaker. Resolves with the Response (callers check `res.ok` for
 * non-retryable statuses); rejects with the last error once the attempts are used up, or with
 * CircuitOpenError while the breaker is open.
 */
export async function fetchWithRetry(
  url: string,
  breaker: CircuitBreaker,
  opts: RetryOptions = {}
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelay = opts.baseDelayMs ?? (config.nodeEnv === 'test' ? 0 : 300);
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await breaker.execute(async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000) });
        if (res.status === 429 || res.status >= 500) throw new RetryableStatusError(res.status);
        return res;
      });
    } catch (err) {
      lastErr = err;
      if (err instanceof CircuitOpenError || attempt === attempts - 1) break;
      const delay = Math.min(baseDelay * 2 ** attempt, MAX_DELAY_MS);
      if (delay > 0) await sleep(delay + Math.random() * (delay / 2));
    }
  }
  if (lastErr instanceof RetryableStatusError) {
    throw new Error(`Bybit REST error: ${lastErr.status}`);
  }
  throw lastErr;
}

/** One breaker per Bybit upstream, shared by every caller of that endpoint family. */
export const bybitBreakers = {
  kline: new CircuitBreaker('bybit-kline'),
  marketInfo: new CircuitBreaker('bybit-market-info'),
  backfill: new CircuitBreaker('bybit-backfill'),
};

/** Test helper: close every Bybit breaker so one test's outage can't leak into the next. */
export function resetBybitBreakers(): void {
  for (const b of Object.values(bybitBreakers)) b.reset();
}
