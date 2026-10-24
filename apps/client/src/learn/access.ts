/**
 * Who may open a piece of learning content (knowledge-base plan, owner 2026-10-23). Code asks for a
 * capability, never for a plan name: a plan, trial or school licence is just a set of these keys in
 * server config, so a new tier is config rather than code.
 *
 * Today everything is `learn.core` (free) and there are no payments. The keys after it are reserved
 * for the improvement tools a paid tier might sell (reports/: deep replay, event drills, AI review,
 * advanced statistics). Two rules hold now so nothing has to be rebuilt later:
 *
 * - A free item never links to a paid one (`learnGraph.test`): a free lesson never ends at a paywall.
 * - 🔐 Paid content is never bundled with the client. Its body would come from the server, which
 *   checks the key; anything in this bundle is readable by anyone.
 */

export const ENTITLEMENTS = [
  'learn.core',
  'learn.deep-dives',
  'drills.events',
  'replay.deep',
  'review.ai',
  'stats.advanced',
] as const;

export type Entitlement = (typeof ENTITLEMENTS)[number];

/** Free for everyone, signed in or not */
export const FREE: Entitlement = 'learn.core';

/** Whether a holder of `granted` may open something that needs `needed` */
export function canOpen(needed: Entitlement, granted: readonly Entitlement[]): boolean {
  return needed === FREE || granted.includes(needed);
}
