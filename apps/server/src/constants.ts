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
  'find-the-fee',
  'welcome-card',
  'fill-email-offer',
  'lesson-01',
  'lesson-ownership',
  'lesson-02',
  'lesson-04',
  'lesson-coins',
  'lesson-stablecoins',
  'lesson-wallets',
  'lesson-fees',
  'lesson-dapps',
  // A chapter's checkpoint on the learning path: passed, it opens the next chapter
  'checkpoint-ch1',
  'checkpoint-ch2',
] as const;

/** The guided tours (the offers have no steps) */
export const LEARN_TOUR_IDS = [
  'primer',
  'buy-first-coin',
  'sell-and-review',
  'find-the-fee',
] as const;

/**
 * The tours the `all-tours` badge asks for: the three it asked for before chapter 2's practical stops
 * (2026-11-28). Whether those count too is the owner's open call; until then an earned badge stays.
 */
export const ALL_TOURS_BADGE_IDS = ['primer', 'buy-first-coin', 'sell-and-review'] as const;

/** The lessons (cards → a tour → questions → a journal line); mirrors `LESSON_IDS` in the client */
export const LEARN_LESSON_IDS = [
  'lesson-01',
  'lesson-ownership',
  'lesson-02',
  'lesson-04',
  'lesson-coins',
  'lesson-stablecoins',
  'lesson-wallets',
  'lesson-fees',
  'lesson-dapps',
] as const;

/**
 * 🔐 Steps one version of a lesson may use, from its first (held to the SDK's `LESSON_VERSION_SPAN`):
 * a step past it is refused, so no stored step can reach a later version's range
 */
export const LESSON_VERSION_SPAN = 40;

/**
 * Each lesson's first funnel step in its current version: the client's `stepBase` + 1 (`lessons.ts`).
 * Both are held to the SDK's `LESSON_FIRST_STEPS` by a test on each side. 🔐 A start or a finish from below it comes from a client still
 * on an earlier version (an open tab, a cached PWA), and is refused, so the reset of 2026-11-16
 * (`20261116200000_reset_lessons_1_3`) holds. Raise it with the lesson's `stepBase`. (A `version`
 * column was weighed, review rounds 8-13: it would rename the step floor, not remove the special
 * cases. An old API machine during a rollout writes rows without it too, so the reads still skip
 * them, a start still takes them over, and an old Lesson 1 finish still keeps the welcome card shut.
 * The step already marks the version, so no schema change is needed. A
 * new item id per version, `lesson-01@v3`, was weighed too, review round 25: old rows would go
 * inert, but every place that names a lesson (the path, checkpoints' taughtIn, the funnel, the
 * admin page, URLs) would have to carry the version, and an old machine still writes the old id.)
 */
export const LESSON_FIRST_STEP: Record<(typeof LEARN_LESSON_IDS)[number], number> = {
  'lesson-01': 61,
  'lesson-ownership': 101,
  'lesson-02': 101,
  'lesson-04': 101,
  'lesson-coins': 61,
  'lesson-stablecoins': 61,
  'lesson-wallets': 61,
  'lesson-fees': 61,
  'lesson-dapps': 61,
};

/** The learning path's chapter checkpoints: progress only, never events */
export const LEARN_CHECKPOINT_IDS = ['checkpoint-ch1', 'checkpoint-ch2'] as const;

/**
 * Each checkpoint's question set version: a pass carries it as its `step` (held to the SDK's
 * `CHECKPOINT_VERSIONS` by a test). 🔐 A pass from an earlier set is refused or ignored, like a lesson's
 * earlier version (owner 2026-11-17: chapter 1's questions changed with the Lessons 1–3 rewrite)
 */
export const CHECKPOINT_VERSION: Record<(typeof LEARN_CHECKPOINT_IDS)[number], number> = {
  'checkpoint-ch1': 3,
  'checkpoint-ch2': 1,
};

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
