/**
 * Test-only email outbox (docs/TRADING_TEST_PLAN.md A5): with the test hooks on, every email the app
 * "sends" is also kept here, so an end-to-end test can read the link a user would click
 * (`GET /api/test/outbox?to=…`). Off (a no-op) in every other mode — production refuses the test
 * hooks at boot (config.ts).
 */

import { config } from '../config.js';

export type OutboxKind =
  | 'password-reset'
  | 'verify-email'
  | 'verify-email-change'
  | 'email-changed-alert'
  | 'deletion-requested'
  | 'deletion-cancelled'
  | 'deletion-warning'
  | 'deletion-completed'
  | 'newsletter-confirmation'
  | 'order-filled';

export interface OutboxEmail {
  to: string;
  kind: OutboxKind;
  /** The link the email carries, if any */
  url?: string;
  /** Unix ms */
  sentAt: number;
}

/** Bounded: the oldest email is dropped past this */
export const OUTBOX_CAP = 100;
const outbox: OutboxEmail[] = [];

export function recordOutboxEmail(email: Omit<OutboxEmail, 'sentAt'>): void {
  if (!config.testHooks) return;
  outbox.push({ ...email, to: email.to.toLowerCase(), sentAt: Date.now() });
  if (outbox.length > OUTBOX_CAP) outbox.shift();
}

/** Emails sent to `to`, newest first. */
export function outboxFor(to: string): OutboxEmail[] {
  const address = to.toLowerCase();
  return outbox.filter((e) => e.to === address).reverse();
}

export function clearOutbox(): void {
  outbox.length = 0;
}
