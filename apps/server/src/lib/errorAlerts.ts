/**
 * Owner alerts for production errors (TEST_IMPLEMENTATION_PLAN M8; owner, 2026-09-29: "email me").
 * A Pino `logMethod` hook counts every error-level line by where it came from (the child logger's
 * `service` / `route`) and its message. Every 30 minutes, if anything was counted, one digest email
 * goes to ALERT_EMAIL. Users never see these; they are for the app owner.
 *
 * Bounded on purpose: at most 50 distinct errors per window (the rest are counted as "other"), and
 * at most 10 digests a day, since the Resend quota (100 a day) is shared with the users' emails.
 * 🔐 Only the source, a sanitised message (safeMessage) and a count are kept: never the log line's
 * objects (a request, a token, an error's details), and never an error's own message text. EmailService's own errors are not counted, so a failing send can't
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

/**
 * 🔐 The message as it may leave the server (to Resend, in the email): a line whose message is its
 * error's own `err.message` (Fastify's, a driver's — it can quote SQL, values, hosts) is reported
 * by the error's name and code instead; numbers, long hex / uuid ids and emails are masked in any
 * message, which also folds `…user 123…` / `…user 456…` into one kind (review #201).
 */
export function safeMessage(args: unknown[]): string {
  const text = args.find((a) => typeof a === 'string');
  const obj = args.find((a) => a !== null && typeof a === 'object') as
    | { err?: unknown }
    | Error
    | undefined;
  const err = obj instanceof Error ? obj : obj?.err instanceof Error ? obj.err : undefined;
  if (err && (typeof text !== 'string' || text === err.message)) {
    const code = (err as { code?: unknown }).code;
    return `${err.name}${typeof code === 'string' ? ` ${code}` : ''}`;
  }
  if (typeof text !== 'string' || !text.length) return '(no message)';
  return text
    .slice(0, 200)
    .replace(/\S+@\S+/g, '<email>') // any token with an @: simple, and no nested quantifier
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
    .replace(/\d+/g, '#');
}

/** Count one error line. `bindings` are the logger's (service / route); `args` the call's. */
export function recordError(bindings: Record<string, unknown>, args: unknown[]): void {
  const source = String(bindings.service ?? bindings.route ?? 'app');
  if (source === 'EmailService') return;
  add(source, safeMessage(args), 1);
}

function add(source: string, message: string, count: number): void {
  // The overflow bucket keeps one key, also when its count is put back after a failed send (review #201)
  let key = message === OTHER ? OTHER : `${source}\u0000${message}`;
  if (!counts.has(key) && counts.size >= MAX_KEYS) key = OTHER;
  const entry = counts.get(key) ?? {
    source: key === OTHER ? 'app' : source,
    message: key === OTHER ? OTHER : message,
    count: 0,
  };
  entry.count += count;
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
  const day = now.toISOString().slice(0, 10);
  if (day !== sentDay) {
    sentDay = day;
    sentToday = 0;
  }
  // Capped: keep counting — the next digest allowed (tomorrow's first) carries everything since
  // the last one sent, so nothing is lost silently (review #201)
  if (sentToday >= DAILY_CAP) return false;
  const entries = [...counts.values()].sort((a, b) => b.count - a.count);
  counts.clear();
  try {
    await send(entries);
  } catch (err) {
    // Not sent (Resend down): the counts go back into the window and the cap isn't used
    // The overflow bucket last, so the kinds get their slots back as before
    const restore = [...entries].sort(
      (a, b) => Number(a.message === OTHER) - Number(b.message === OTHER)
    );
    for (const e of restore) add(e.source, e.message, e.count);
    throw err;
  }
  sentToday += 1;
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
