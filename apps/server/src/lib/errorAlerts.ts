/**
 * Owner alerts for production errors (TEST_IMPLEMENTATION_PLAN M8; owner, 2026-09-29: "email me").
 * A Pino `logMethod` hook counts every error-level line by where it came from (the child logger's
 * `service` / `route`) and its message. Every 30 minutes, if anything was counted, one digest email
 * goes to ALERT_EMAIL. Users never see these; they are for the app owner.
 *
 * Bounded on purpose: at most 50 distinct errors per window (the rest are counted as "other"), and
 * at most 10 digests a day, since the Resend quota (100 a day) is shared with the users' emails.
 * 🔐 Only the source, the message and a count are kept: never the log line's objects (a request,
 * a token, an error's details). EmailService's own errors are not counted, so a failing send can't
 * alert about itself.
 */

import type { LogFn, Logger } from 'pino';

export const DIGEST_WINDOW_MS = 30 * 60_000;
export const MAX_KEYS = 50;
export const DAILY_CAP = 10;
const OTHER = 'other errors (more than 50 kinds in this window)';

export interface DigestEntry {
  source: string;
  message: string;
  count: number;
}

const counts = new Map<string, DigestEntry>();
let sentDay = '';
let sentToday = 0;

/** Count one error line. `bindings` are the logger's (service / route); `args` the call's. */
export function recordError(bindings: Record<string, unknown>, args: unknown[]): void {
  const source = String(bindings.service ?? bindings.route ?? 'app');
  if (source === 'EmailService') return;
  const text = args.find((a) => typeof a === 'string');
  const message = typeof text === 'string' && text.length ? text.slice(0, 200) : '(no message)';
  let key = `${source}\u0000${message}`;
  if (!counts.has(key) && counts.size >= MAX_KEYS) key = OTHER;
  const entry = counts.get(key) ?? {
    source: key === OTHER ? 'app' : source,
    message: key === OTHER ? OTHER : message,
    count: 0,
  };
  entry.count += 1;
  counts.set(key, entry);
}

/** Pino `hooks.logMethod`: counts error / fatal lines (level ≥ 50), then logs as usual. */
export function errorAlertHook(
  this: Logger,
  inputArgs: Parameters<LogFn>,
  method: LogFn,
  level: number
) {
  if (level >= 50) recordError(this.bindings(), inputArgs as unknown[]);
  return method.apply(this, inputArgs);
}

/**
 * Send what was counted (if anything, and under the daily cap), then start a new window. Returns
 * whether a digest went out. `now` is injectable for the tests.
 */
export async function flushDigest(
  send: (entries: DigestEntry[]) => Promise<void>,
  now = new Date()
): Promise<boolean> {
  if (counts.size === 0) return false;
  const entries = [...counts.values()].sort((a, b) => b.count - a.count);
  counts.clear();
  const day = now.toISOString().slice(0, 10);
  if (day !== sentDay) {
    sentDay = day;
    sentToday = 0;
  }
  if (sentToday >= DAILY_CAP) return false;
  sentToday += 1;
  await send(entries);
  return true;
}

/** Start the 30-minute digest; returns a stop function. Never keeps the process alive. */
export function startErrorDigest(send: (entries: DigestEntry[]) => Promise<void>): () => void {
  const timer = setInterval(() => {
    // A failed send is logged by EmailService (which is not counted) — never thrown from a timer
    void flushDigest(send).catch(() => undefined);
  }, DIGEST_WINDOW_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** For the tests only */
export function resetErrorAlerts(): void {
  counts.clear();
  sentDay = '';
  sentToday = 0;
}
