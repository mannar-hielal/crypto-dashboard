/**
 * Shared server-side constants.
 *
 * Single source of truth for allowed symbols — imported by both the Bybit
 * plugin (for WS subscriptions) and the market routes (for REST/WS allowlist
 * validation). Keeping them in sync here prevents drift where a symbol is
 * allowed via REST but never subscribed for live data (or vice-versa).
 */

export const ALLOWED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
] as const;

export type AllowedSymbol = (typeof ALLOWED_SYMBOLS)[number];

/**
 * Bybit market categories we read data from (APP_LOG Bybit Parity BP-0): `spot` for the Spot
 * market, `linear` for USDT Perpetual. Each has its own public WS stream and REST `category=`
 * value.
 */
export const ALLOWED_CATEGORIES = ['spot', 'linear'] as const;

export type BybitCategory = (typeof ALLOWED_CATEGORIES)[number];

/**
 * What the account remembers about the guided tours (routes/learn). 🔐 An allowlist: the route's
 * schema takes only these, so a user holds at most this many rows. Mirrors `LEARN_ITEM_IDS` in the
 * SDK — a runtime import of the SDK's TypeScript source isn't available to the built server, so
 * `learn.test.ts` checks the two lists are the same.
 */
export const LEARN_ITEM_IDS = [
  'primer',
  'buy-first-coin',
  'sell-and-review',
  'welcome-card',
  'fill-email-offer',
  'lesson-01',
  'lesson-02',
  // A chapter's checkpoint on the learning path: passed, it opens the next chapter
  'checkpoint-ch1',
] as const;

/** The guided tours (the offers have no steps) */
export const LEARN_TOUR_IDS = ['primer', 'buy-first-coin', 'sell-and-review'] as const;

/** The lessons (cards → a tour → questions → a journal line); mirrors `LESSON_IDS` in the client */
export const LEARN_LESSON_IDS = ['lesson-01', 'lesson-02'] as const;

/** The learning path's chapter checkpoints: progress only, never events */
export const LEARN_CHECKPOINT_IDS = ['checkpoint-ch1'] as const;

/** Events are only accepted for these: a lesson reports its screens like a tour reports its steps */
export const LEARN_EVENT_ITEM_IDS = [...LEARN_TOUR_IDS, ...LEARN_LESSON_IDS] as const;

/** Mirrors `LEARN_EVENT_NAMES` in the SDK (checked by `learn.test.ts`, like `LEARN_ITEM_IDS`) */
export const LEARN_EVENT_NAMES = [
  'tour_started',
  'tour_step',
  'tour_completed',
  'tour_closed',
  // A lesson's optional 1–5 rating, carried as the step `<lesson>.<rating>`
  'lesson_rated',
] as const;

/** 🔐 A user holds at most this many tour events; past it the oldest are pruned (LearningEvents) */
export const MAX_LEARN_EVENTS_PER_USER = 500;

/** Older events are purged by the daily job and the privacy policy says so (§3, §7) */
export const LEARN_EVENT_RETENTION_DAYS = 180;

/** Mirrors `HABIT_BADGE_IDS` in the SDK (checked by `learn.test.ts`) */
export const HABIT_BADGE_IDS = [
  'first-stop-loss',
  'ten-stop-losses',
  'journal-week',
  'first-tour',
  'all-tours',
] as const;
