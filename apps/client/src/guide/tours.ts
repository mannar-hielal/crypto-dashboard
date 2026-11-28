/**
 * The guided tours (docs/GUIDED_TRADE_MVP.md, reshaped 2026-10-11): short chapters of at most five
 * steps — a primer of three small tasks on the live chart (Lesson 3's "Try it", guide/lessons.ts),
 * then buying a first coin, (its own map stop, owner 2026-11-17) selling it back, and chapter 2's
 * practice buy that finds its fee and its swap with a practice wallet (owner 2026-11-28); each ends
 * with a look at what it changed (in the account panel, or the practice wallet). Research (reports/) says completion falls fast
 * past five steps.
 *
 * Steps that repeat a scenario action reuse the shared builders in `steps.ts` (one wording for the
 * form's controls everywhere); the learner-facing text for the new ones lives here. Pure data: no
 * React, so the tests can walk every tour.
 */

import { WIDE_LAYOUT_QUERY } from '@/lib/breakpoints';
import type { GuideAnchor } from '@/lib/guideAnchors';
import type { HoverWant } from './chartHover';
import { chooseType, openTab, submit } from './steps';
import type { StepDraft } from './scenario';

/** The Learn panel's tours: their progress is saved and they report the funnel */
export const TOUR_IDS = [
  'primer',
  'buy-first-coin',
  'sell-and-review',
  'find-the-fee',
  'try-a-swap',
] as const;
/**
 * Practice trades started from a lesson card (owner 2026-11-16): a guided arrow on the real chart,
 * then back to the lesson. Not saved or reported on their own: the lesson's screens are.
 */
export const PRACTICE_TOUR_IDS = ['practice-buy', 'practice-long', 'practice-short'] as const;
export type PracticeTourId = (typeof PRACTICE_TOUR_IDS)[number];
/**
 * What just happened (owner 2026-11-17): each practice trade chains to a short look at the account
 * panel (the coin bought, the open long or short) before the lesson carries on. Chained, never started
 * on their own, so each chapter keeps to five steps; not saved or reported either.
 */
export const PRACTICE_REVIEW_IDS = ['review-buy', 'review-long', 'review-short'] as const;
export type PracticeReviewId = (typeof PRACTICE_REVIEW_IDS)[number];
/**
 * The same look after a practical lesson of the map (owner 2026-11-17: one job per practical lesson,
 * then a walkthrough of what it changed): Buy's look at the coin bought, and Sell's two chapters
 * (Assets and Order History, then the result and Balance History), and the fee's look (the order's
 * Commission, and how it differs from a network fee). Chained from the lesson's own
 * tour, so the lesson stays one map stop and each chapter keeps to five steps; not saved or
 * reported on their own (the lesson's tour is, finished at its order)
 */
export const PATH_REVIEW_IDS = [
  'review-first-coin',
  'review-sell',
  'review-sell-result',
  'review-fee',
  'review-swap',
  'review-swap-clean',
] as const;
export type PathReviewId = (typeof PATH_REVIEW_IDS)[number];
/** The path's tours: saved, reported and counted (a practice trade is none of these) */
export type PathTourId = (typeof TOUR_IDS)[number];
export type TourId = PathTourId | PracticeTourId | PracticeReviewId | PathReviewId;

/** A Learn panel tour (not a practice trade): what the account's progress may hold */
export function isTourId(value: string): value is PathTourId {
  return (TOUR_IDS as readonly string[]).includes(value);
}

export type TourStepKind = 'observe' | 'click' | 'type' | 'quiz' | 'hover';

export interface TourQuiz {
  question: string;
  options: string[];
  /** Index into `options` */
  correct: number;
  /** Shown after any answer: why the right one is right */
  explain: string;
}

export interface TourStep {
  /** `<tour id>.<n>` — stable, used by events */
  id: string;
  kind: TourStepKind;
  /** The control the ring goes around; absent = a centred card */
  anchor?: GuideAnchor;
  key?: string;
  /**
   * `click`: the control whose click finishes the step, when the ring goes around more than it (a
   * request to read before its Sign button, so the bubble never covers what it asks about)
   */
  clickAnchor?: GuideAnchor;
  /**
   * An action that can't be done twice (a signature, a connection): once this run is past it, Back
   * never returns to it, which would ask for a control that is gone
   */
  once?: true;
  text: string;
  /** "You should see …", muted, for live prices where numbers move */
  liveNote?: string;
  /** `type`: the value to suggest */
  suggest?: string;
  /** `observe`: the label of the button that moves on */
  nextLabel?: string;
  /** `click`: the step is done when this input has been emptied (an accepted order clears it) */
  doneWhenEmpty?: GuideAnchor;
  /** What to open first when the control isn't on screen */
  missingHint?: string;
  /** `hover`: the candle the learner must point at (guide/chartHover.ts) */
  hover?: HoverWant;
  quiz?: TourQuiz;
  /**
   * Only on this screen size (owner 2026-11-16: practice trades on phones too): a phone opens the
   * order form from its Buy / Long and Sell / Short bar, a larger screen has the form beside the
   * chart. Absent = everywhere.
   */
  screen?: 'phone' | 'desktop';
}

export interface Tour {
  id: TourId;
  title: string;
  blurb: string;
  minutes: number;
  /** The page the tour runs on; the starter navigates there first */
  startUrl: string;
  /** The tour the last step hands over to */
  next?: TourId;
  /**
   * Works on a phone too (owner 2026-11-16): its steps open the order form from the phone's bar.
   * Others (the primer's hover steps) need a larger screen.
   */
  phoneReady?: true;
  steps: TourStep[];
}

// Owner 2026-11-16 (practice trades on phones too): the form opens from the Trade button above the
// chart on a larger screen, from the Buy / Long or Sell / Short bar at the bottom on a phone
const FORM_HINT =
  'Open the order form: the Trade button above the chart, or Buy / Long at the bottom on a phone.';
/** The same for a sell: a phone's Sell / Short opens the form on the right side */
const FORM_HINT_SELL =
  'Open the order form: the Trade button above the chart, or Sell / Short at the bottom on a phone.';
/** The phone's Buy / Long and Sell / Short bar hides while the order form or an edit panel is open */
const PHONE_BAR_HINT =
  'Close the open panel first: the Buy / Long and Sell / Short bar is at the bottom of the screen.';

/** The account panel's way in, when it isn't on screen (a phone opens it after an order) */
const PANEL_HINT = 'Open the account panel under the chart.';
/**
 * The Sell lesson with no Bitcoin to sell (owner 2026-11-17): buy a little first. A hint, not a
 * button: a step has no action of its own, and the Buy lesson is one tap away on the map
 */
const NO_BITCOIN_HINT =
  'Open the Assets tab to find your Bitcoin. None there? You need some to sell: do “Buy your first coin” on the learning map first, then come back to this lesson.';

/** A shared scenario step as a tour step (click / type / observe, same anchor, same words) */
function fromDraft(draft: StepDraft, over: Partial<TourStep> = {}): Omit<TourStep, 'id'> {
  const kind: TourStepKind =
    draft.action === 'type' ? 'type' : draft.action === 'observe' ? 'observe' : 'click';
  return {
    kind,
    ...(draft.anchor ? { anchor: draft.anchor } : {}),
    ...(draft.key ? { key: draft.key } : {}),
    text: draft.explain,
    ...(draft.liveNote ? { liveNote: draft.liveNote } : {}),
    ...over,
  };
}

/**
 * Step ids `<tour>.<n>`, stable for the funnel: steps for every screen size and desktop-only steps are
 * numbered 1, 2, … in order (the ids the tours had before phones, 2026-11-16); phone-only steps are
 * numbered from 51, so adding one never renumbers a step whose events are already stored
 */
function numbered(id: TourId, steps: Array<Omit<TourStep, 'id'>>): TourStep[] {
  let main = 0;
  let phone = 50;
  return steps.map((s) => ({ ...s, id: `${id}.${s.screen === 'phone' ? ++phone : ++main}` }));
}

/**
 * The wide layout right now. Its own query (`WIDE_LAYOUT_QUERY`, the narrow one's exact negation),
 * not the narrow query negated: the same answer in a browser, but the tests stub matchMedia per query, and
 * the tours' tests stub this one (weighed, review after release #302)
 */
export function isWideScreen(): boolean {
  // No matchMedia (tests, old browsers): the desktop layout
  return typeof window.matchMedia !== 'function' || window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

/**
 * Where Back goes from `stepIndex`, or null when nowhere: never onto a phone-only step this run
 * already passed (tapping Buy / Long), since the form it opened may still be open and its bar hidden
 */
export function backIndex(
  steps: readonly TourStep[],
  stepIndex: number,
  passed: readonly string[]
): number | null {
  let to = stepIndex - 1;
  while (
    to >= 0 &&
    (steps[to].screen === 'phone' || steps[to].once) &&
    passed.includes(steps[to].id)
  ) {
    to--;
  }
  return to >= 0 ? to : null;
}

/** A tour can run here: a larger screen, or a phone when the tour is phone-ready */
export function runsHere(id: TourId, wide: boolean): boolean {
  return wide || !!getTour(id).phoneReady;
}

/** The steps a tour shows on this screen size (`wide`: the desktop layout) */
export function tourSteps(tour: Tour, wide: boolean): TourStep[] {
  return tour.steps.filter((s) => !s.screen || s.screen === (wide ? 'desktop' : 'phone'));
}

// ─── 1. What you're looking at ───────────────────────────────────────────────

// Lesson 3's "Try it on the real screen" (guide/lessons.ts) — it runs inside the lesson, or alone
// from the Learn panel. Three tasks the app checks (owner 2026-10-23: the learner proves the skill on
// the live chart); the practice balance is named in the lesson's "Try it" screen instead.
const primer: Tour = {
  id: 'primer',
  title: 'What you’re looking at',
  blurb: 'Tap the live price and read two candles — no trading yet.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  steps: numbered('primer', [
    {
      kind: 'click',
      anchor: 'symbolbar.price',
      text: 'Tap the live price. It’s the last deal between a buyer and a seller, and it changes with every new one. USDT is a coin built to stay at one dollar, so read it as dollars.',
    },
    {
      kind: 'hover',
      anchor: 'pane.chart',
      hover: 'last',
      text: 'Hover the newest candle, on the far right. It’s still being drawn: its close is the price you just tapped.',
    },
    {
      kind: 'hover',
      anchor: 'pane.chart',
      hover: 'falling',
      text: 'Now find a red candle and hover it. Red means that slice of time closed lower than it opened.',
    },
  ]),
};

// ─── 2. Buy your first coin ──────────────────────────────────────────────────

const buyFirstCoin: Tour = {
  id: 'buy-first-coin',
  title: 'Buy your first coin',
  blurb: 'Spend $100 of practice money on Bitcoin.',
  minutes: 2,
  startUrl: '/dashboard/spot/BTC/USDT',
  // One job (owner 2026-11-17): buy, then a look at the coin bought; selling is its own map stop
  next: 'review-first-coin',
  phoneReady: true,
  steps: numbered('buy-first-coin', [
    // A phone opens the form from its bar (it isn't docked beside the chart there)
    {
      kind: 'click',
      anchor: 'trade.mobile.buy',
      text: 'Tap Buy / Long to open the order form. Buy if you expect the price to rise; buying to gain from a rise is called going long.',
      missingHint: PHONE_BAR_HINT,
      screen: 'phone',
    },
    fromDraft(
      {
        action: 'observe',
        anchor: 'trade.side.buy',
        explain:
          'Every trade starts with two choices: Buy if you expect the price to rise, Sell to get out. Buying to gain from a rise is called going long. You are on Spot: you buy the coin itself. Buy shows the price you pay right now — the lowest price a seller accepts.',
        liveNote:
          'Sell is a little lower than Buy; that gap is the spread, a small cost of every trade.',
      },
      { missingHint: FORM_HINT, screen: 'desktop' }
    ),
    fromDraft(chooseType('market'), {
      text: 'Choose Market: buy right now at the best available price.',
      missingHint: FORM_HINT,
    }),
    fromDraft(
      {
        action: 'click',
        anchor: 'trade.amount-unit',
        key: 'usdt',
        explain:
          'Choose USDT, so you can type how many dollars to spend instead of how many coins.',
      },
      { missingHint: FORM_HINT }
    ),
    fromDraft(
      {
        action: 'type',
        anchor: 'trade.amount',
        value: '100',
        explain:
          'Type 100: that is $100 of Bitcoin. The form shows what it costs before you commit.',
        liveNote: 'Cost should read about $100.00. Spot also takes a 0.1% fee.',
      },
      { suggest: '100', missingHint: FORM_HINT }
    ),
    fromDraft(
      // Owner 2026-11-12: what you hold now, and that it's only on paper until closed (selling is
      // its own map stop since 2026-11-17, not the next tour)
      submit({
        explain:
          'Place the order. It fills immediately and the amount field clears. You now hold a position: $100 of Bitcoin, long. Its profit or loss is only on paper until you close it by selling. Next, a quick look at where it shows up.',
      }),
      {
        doneWhenEmpty: 'trade.amount',
        missingHint: FORM_HINT,
      }
    ),
  ]),
};

// ─── 3. Sell it back and read the result ─────────────────────────────────────

// (Tours carry no version like a lesson's stepBase: after the 2026-11-17 split the funnel lists the
// old sell-and-review.4/.5 events as bare steps, and "completed" now means sold, not quizzed. Weighed,
// review after #308: one-off, read with the APP_LOG note)
const sellAndReview: Tour = {
  id: 'sell-and-review',
  title: 'Sell it and read the result',
  blurb: 'Sell your Bitcoin back and see what the fees did.',
  minutes: 3,
  startUrl: '/dashboard/spot/BTC/USDT',
  // One job (owner 2026-11-17): sell, then a look at what it changed, in two chapters
  next: 'review-sell',
  phoneReady: true,
  steps: numbered('sell-and-review', [
    fromDraft(
      openTab('assets', {
        explain: 'Open Assets to find the Bitcoin you bought in “Buy your first coin”.',
      }),
      { missingHint: `${PANEL_HINT} Then its Assets tab.` }
    ),
    {
      kind: 'click',
      anchor: 'assets.row.sell',
      key: 'BTC',
      text: 'Press Sell to put all of your Bitcoin into the order form, ready to sell.',
      // Nothing to sell (sold elsewhere, or the lesson started from a checkpoint): buy first
      missingHint: NO_BITCOIN_HINT,
    },
    fromDraft(
      submit({
        explain:
          'Place the sell order. Selling all of your Bitcoin closes your position (any you bought in a practice trade too). It fills at the Sell price. Next, a look at what changed.',
      }),
      {
        doneWhenEmpty: 'trade.amount',
        missingHint: 'Open the Assets tab and press Sell on your Bitcoin again.',
      }
    ),
  ]),
};

// ─── 4. Find the fee on your trade (chapter 2's practice, owner 2026-11-28) ──

/**
 * One job: a $100 practice buy, then the walkthrough of its Commission in Order History, set beside
 * the network fee of Lesson 8 (a practice order moves nothing on a blockchain, so it has none)
 */
const findTheFee: Tour = {
  id: 'find-the-fee',
  title: 'Find the fee on your trade',
  blurb: 'Make a $100 practice buy, then read what it cost.',
  minutes: 2,
  startUrl: '/dashboard/spot/BTC/USDT',
  next: 'review-fee',
  phoneReady: true,
  steps: tradeSteps('find-the-fee', {
    side: 'buy',
    sideText: 'We buy a little Bitcoin with practice money, so there is a fee to find.',
    placed: 'Place the order. It fills right away. Next, we find what it cost you.',
    // (Shown after "You should see:". Skip first, then sell: the step ends on any accepted order, so a
    // sell made during it would finish the stop with no buy to read. And no reset advice: a refused
    // order may have another cause, and a reset deletes the account's history; review 2026-11-28)
    placedNote:
      'The amount field emptying, or on a small screen the form closing. If not, read the form’s message. Not enough USDT? Press Skip tour, free some (for example, sell some coin), then start “Find the fee on your trade” again from the learning map.',
  }),
};

// ─── 5. Try a swap with a practice wallet (chapter 2, owner 2026-11-28) ──────

/** The swap panel closed mid-tour has no way to be reopened on its own: start the stop again */
const SWAP_HINT = 'Close this guide, then start the stop again from the learning map.';

/**
 * One job: a swap in a pretend app with a pretend wallet (practice/SwapPanel.tsx), docked where the
 * order form sits; then what changed, and taking a no-limit permission back. Nothing is real, nothing
 * asks for an address or secret words, and the paper account is untouched
 */
const trySwap: Tour = {
  id: 'try-a-swap',
  title: 'Try a swap with a practice wallet',
  blurb: 'Try a pretend swap, read the costs, take a permission back.',
  minutes: 3,
  startUrl: '/dashboard/spot/BTC/USDT',
  next: 'review-swap',
  phoneReady: true,
  steps: numbered('try-a-swap', [
    {
      kind: 'click',
      once: true,
      anchor: 'swap.connect',
      text: 'This wallet is for practice: nothing here is real, and it never asks for your recovery phrase. In real life, connecting shows the app your address. It does not let the app take your tokens. Press Connect.',
      missingHint: 'Open the App tab.',
    },
    {
      // One step for the amount and the button: a separate amount step could be skipped past by
      // pressing Review first, leaving the guide asking for a control behind the wallet's sheet
      kind: 'click',
      once: true,
      anchor: 'swap.offer',
      clickAnchor: 'swap.review',
      text: 'Pick 100 or 200 pretend USDC. Read what you get, the minimum, and the costs: the pool fee, price impact and network fees. Then press Review swap.',
      missingHint: 'Open the App tab.',
    },
    {
      kind: 'click',
      once: true,
      anchor: 'swap.request',
      clickAnchor: 'swap.sign',
      text: 'First the wallet asks: may the app use your USDC? Pick “Only” your amount, or “No limit”. Then press Sign.',
      missingHint: SWAP_HINT,
    },
    {
      kind: 'click',
      once: true,
      anchor: 'swap.request',
      clickAnchor: 'swap.sign',
      text: 'Now the swap itself. Read what will happen, then press Sign. Next, we look at what changed.',
      missingHint: SWAP_HINT,
    },
  ]),
};

/** What just happened: the Wallet tab's balances, costs and permissions, then Revoke */
const reviewSwap: Tour = {
  id: 'review-swap',
  title: 'What just happened',
  blurb: 'Your balances, the costs and the permissions.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  next: 'review-swap-clean',
  phoneReady: true,
  steps: numbered('review-swap', [
    {
      kind: 'click',
      anchor: 'swap.tab',
      key: 'wallet',
      text: 'A pretend block confirms your swap in a moment. Open the Wallet tab.',
      missingHint: SWAP_HINT,
    },
    {
      kind: 'observe',
      anchor: 'swap.balances',
      text: 'Your USDC went down by what you paid, and the ETH you got arrived. You also paid a little ETH: each transaction you signed here paid a network fee.',
      missingHint: 'Open the Wallet tab.',
    },
    {
      kind: 'observe',
      anchor: 'swap.receipt',
      text: 'Three costs. The pool fee and price impact (your own swap moved the price) are already inside the ETH you got. The network fees are extra, paid in ETH.',
      missingHint: 'Open the Wallet tab. The swap shows once the block confirms it.',
    },
    {
      kind: 'observe',
      anchor: 'swap.permissions',
      text: 'This list shows what each app can still take. A permission for only your amount is used up by the swap. A no-limit one stays open until you remove it.',
      missingHint: 'Open the Wallet tab.',
    },
    {
      kind: 'click',
      once: true,
      // The ring goes round the whole card, so the bubble never hides whose permission it is
      anchor: 'swap.permissions',
      clickAnchor: 'swap.revoke',
      text: 'Clean up: press Revoke on an open permission. Closing or disconnecting an app does not remove it. No Revoke button left? Press Skip tour: you have already cleaned up.',
      missingHint: 'Open the Wallet tab.',
    },
  ]),
};

/** The revoke's own signature, and what it cost */
const reviewSwapClean: Tour = {
  id: 'review-swap-clean',
  title: 'Clean up',
  blurb: 'Sign the revoke and see it gone.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: numbered('review-swap-clean', [
    {
      kind: 'click',
      once: true,
      anchor: 'swap.request',
      clickAnchor: 'swap.sign',
      text: 'Removing a permission is a transaction too, so the wallet asks. Press Sign.',
      missingHint: 'Press Revoke on an open permission, on the Wallet tab.',
    },
    {
      kind: 'observe',
      anchor: 'swap.permissions',
      text: 'Done: that app cannot take your USDC now. It cost a small network fee. In real life, check old permissions now and then, with a tool you trust.',
      missingHint: 'Open the Wallet tab.',
    },
  ]),
};

/** The practice swap's chapters: while one runs, its panel is docked on the dashboard */
const SWAP_TOUR_IDS: readonly TourId[] = ['try-a-swap', 'review-swap', 'review-swap-clean'];

export function isSwapTour(id: TourId | null): boolean {
  return id !== null && SWAP_TOUR_IDS.includes(id);
}

// ─── Practice trades from a lesson card (owner 2026-11-16) ──────────────────

/** What a $100 market trade says at its start and at its order; the other steps are the same */
interface TradeWords {
  side: 'buy' | 'sell';
  /** On the larger screen's side button, and after "Tap Buy / Long …" on a phone */
  sideText: string;
  /** The order's step */
  placed: string;
  /** Shown under the order's step, for an order the form may refuse */
  placedNote?: string;
}

/**
 * A $100 market trade: open the form (the phone's bar, or the side button), Market, USDT, 100, place
 * it. Five steps on each screen size
 */
function tradeSteps(id: TourId, words: TradeWords): TourStep[] {
  const { side, sideText, placed, placedNote } = words;
  const phoneButton = side === 'buy' ? 'Buy / Long' : 'Sell / Short';
  const formHint = side === 'buy' ? FORM_HINT : FORM_HINT_SELL;
  return numbered(id, [
    {
      kind: 'click',
      anchor: side === 'buy' ? 'trade.mobile.buy' : 'trade.mobile.sell',
      text: `Tap ${phoneButton} to open the order form. ${sideText}`,
      missingHint: PHONE_BAR_HINT,
      screen: 'phone',
    },
    {
      ...fromDraft(
        {
          action: 'click',
          anchor: side === 'buy' ? 'trade.side.buy' : 'trade.side.sell',
          explain: sideText,
        },
        { missingHint: formHint }
      ),
      screen: 'desktop',
    },
    fromDraft(chooseType('market'), {
      text: 'Choose Market: trade right now at the best available price.',
      missingHint: formHint,
    }),
    fromDraft(
      {
        action: 'click',
        anchor: 'trade.amount-unit',
        key: 'usdt',
        explain: 'Choose USDT, so you can type dollars instead of coins.',
      },
      { missingHint: formHint }
    ),
    fromDraft(
      {
        action: 'type',
        anchor: 'trade.amount',
        value: '100',
        explain: 'Type 100: a $100 practice trade. Nothing here is real money.',
      },
      { suggest: '100', missingHint: formHint }
    ),
    fromDraft(submit({ explain: placed }), {
      doneWhenEmpty: 'trade.amount',
      missingHint: formHint,
      ...(placedNote ? { liveNote: placedNote } : {}),
    }),
  ]);
}

/**
 * A practice trade from a lesson card: the $100 trade, then its review chapter (`next`) shows what
 * just happened in the account panel
 */
function practice(
  id: PracticeTourId,
  title: string,
  startUrl: string,
  side: 'buy' | 'sell',
  sideText: string,
  placed: string,
  next: PracticeReviewId
): Tour {
  return {
    id,
    title,
    blurb: 'A guided practice trade, then back to your lesson.',
    minutes: 1,
    startUrl,
    next,
    phoneReady: true,
    steps: tradeSteps(id, { side, sideText, placed }),
  };
}

const practiceBuy = practice(
  'practice-buy',
  'Practice: buy',
  '/dashboard/spot/BTC/USDT',
  'buy',
  'Buy means you pay to own some coin.',
  'Place the order. It fills right away: you now own $100 of Bitcoin. Next, a quick look at what changed.',
  'review-buy'
);
const practiceLong = practice(
  'practice-long',
  'Practice: go long',
  '/dashboard/usdt/BTCUSDT',
  'buy',
  'On the USDT Perpetual market, Buy / Long opens a long: you gain if the price rises.',
  'Place the order. With no short open on Bitcoin, you now hold a long position (a Buy first shrinks a short you already hold). Next, a quick look at it.',
  'review-long'
);
// On Ethereum: one position per symbol (one-way), so a short on Bitcoin would only close the
// practice long instead of opening a short
const practiceShort = practice(
  'practice-short',
  'Practice: go short',
  '/dashboard/usdt/ETHUSDT',
  'sell',
  'On the USDT Perpetual market, Sell / Short opens a short: you gain if the price falls. This one is on Ethereum.',
  'Place the order. With no long open on Ethereum, you now hold a short position (a Sell first shrinks a long you already hold). Next, a quick look at it.',
  'review-short'
);

// ─── What just happened: after each practice trade (owner 2026-11-17) ────────

/** The last step's button: the lesson carries on after it */
const BACK_TO_LESSON = 'Back to the lesson';

/**
 * The coin just bought, in Assets: open the tab, Bitcoin's row (the fee, Avg cost), its unrealized
 * PnL. One wording for a card's practice buy and the Buy lesson (owner 2026-11-17); only where it
 * ends differs (`last`: the last step's button, the default Finish when absent)
 */
function boughtSteps(id: 'review-buy' | 'review-first-coin', last?: string): TourStep[] {
  return numbered(id, [
    fromDraft(
      openTab('assets', {
        explain: 'Your order filled. Open Assets: it lists every coin you hold.',
      }),
      { missingHint: `${PANEL_HINT} Then its Assets tab.` }
    ),
    {
      kind: 'observe',
      anchor: 'assets.row',
      key: 'BTC',
      text: 'This row is your Bitcoin. You paid $100; you hold a hair less (about $99.90 of Bitcoin) because Spot’s 0.1% fee is taken in the coin. Avg cost is what you paid per coin, fee included, so a hair above the price you bought at.',
      missingHint: 'Open the Assets tab to find your Bitcoin.',
    },
    {
      kind: 'observe',
      anchor: 'assets.row.upnl',
      key: 'BTC',
      text: 'Unrealized PnL is what you’d gain or lose if you sold right now, before the selling fee. It changes as the price moves, and becomes real only when you sell.',
      missingHint: 'Open the Assets tab to find your Bitcoin.',
      ...(last ? { nextLabel: last } : {}),
    },
  ]);
}

const reviewBuy: Tour = {
  id: 'review-buy',
  title: 'What just happened',
  blurb: 'Where your practice buy shows up.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: boughtSteps('review-buy', BACK_TO_LESSON),
};

/** The long or short just opened, in Positions: open the tab, then read its row */
function reviewPosition(
  id: Exclude<PracticeReviewId, 'review-buy'>,
  startUrl: string,
  symbol: 'BTCUSDT' | 'ETHUSDT',
  row: string
): Tour {
  return {
    id,
    title: 'What just happened',
    blurb: 'Where your practice position shows up.',
    minutes: 1,
    startUrl,
    phoneReady: true,
    steps: numbered(id, [
      fromDraft(
        openTab('positions', {
          explain:
            'Your order filled. Open Positions: every long and short you hold is listed there.',
        }),
        { missingHint: `${PANEL_HINT} Then its Positions tab.` }
      ),
      {
        kind: 'observe',
        anchor: 'positions.row',
        key: `linear:${symbol}`,
        text: row,
        missingHint: 'Open the Positions tab to find your position.',
        nextLabel: BACK_TO_LESSON,
      },
    ]),
  };
}

const reviewLong = reviewPosition(
  'review-long',
  '/dashboard/usdt/BTCUSDT',
  'BTCUSDT',
  'This is your long on Bitcoin: Side says Long, Avg Fill Price is where you got in, and Unrealized P&L moves with the Mark Price. It becomes real when you close the position with the ✕ (Close) at the end of the row.'
);
const reviewShort = reviewPosition(
  'review-short',
  '/dashboard/usdt/ETHUSDT',
  'ETHUSDT',
  'This is your short on Ethereum: Side says Short. Its Unrealized P&L grows when the price falls and shrinks when it rises. It becomes real when you close it with the ✕ (Close) at the end of the row.'
);

// ─── What just happened: after the Buy and Sell lessons (owner 2026-11-17) ───

/** The Buy lesson's look: the same steps as a card's practice buy, ending the lesson */
const reviewFirstCoin: Tour = {
  id: 'review-first-coin',
  title: 'What just happened',
  blurb: 'Where your first coin shows up.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  // "Done": the map's lesson ends here, and from Lesson 1's Try it hands back to the lesson
  steps: boughtSteps('review-first-coin', 'Done'),
};

/** The Sell lesson's look, chapter 1: the coin gone from Assets, the sell in Order History */
const reviewSell: Tour = {
  id: 'review-sell',
  title: 'What just happened',
  blurb: 'Where your sell shows up.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  next: 'review-sell-result',
  phoneReady: true,
  steps: numbered('review-sell', [
    {
      kind: 'observe',
      anchor: 'assets.row',
      key: 'USDT',
      text: 'You sold your Bitcoin: its row is gone (unless some is still held for an order). The dollars are back in USDT, usually a little under what you started with: you paid a 0.1% fee on the buy and another on the sell.',
      missingHint: `${PANEL_HINT} Then its Assets tab.`,
    },
    fromDraft(
      openTab('orderhistory', {
        explain: 'Open Order History: every order you placed, newest first.',
      }),
      { missingHint: PANEL_HINT }
    ),
    {
      kind: 'observe',
      anchor: 'order-history.row',
      // (one step for the row, Commission included: that column can be hidden, so no step of its own)
      text: 'The top row is your sell. Side says Sell, Type says Market (it filled at once), Qty is how much Bitcoin you sold, Fill Price is the price you got, and Status says Filled. Commission is its fee: 0.1% of what you sold, paid in USDT (your buy paid its 0.1% in Bitcoin).',
      missingHint: 'Open the Order History tab to find your sell.',
      nextLabel: 'Next →',
    },
  ]),
};

/** The Sell lesson's look, chapter 2: the result made real, Balance History, then the fees' lesson */
const reviewSellResult: Tour = {
  id: 'review-sell-result',
  title: 'Your result',
  blurb: 'What your sell made or lost, fees included.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: numbered('review-sell-result', [
    {
      kind: 'observe',
      anchor: 'account.summary.realized-pnl',
      text: 'Realized P&L, above the tabs, adds up the results of the trades you have closed, fees included. This trade’s result is in it now, and it no longer moves with the price: it’s real.',
      missingHint: PANEL_HINT,
    },
    fromDraft(
      openTab('balancehistory', {
        explain: 'Open Balance History: every change to your USDT balance, newest first.',
      }),
      { missingHint: PANEL_HINT }
    ),
    {
      kind: 'observe',
      anchor: 'balance-history.row',
      text: 'The top row is your sell. Balance Before and Balance After show the USDT it brought back, Realized P&L is this trade’s result after both fees, and Action says what made the change: the Spot sell, its amount and its price.',
      missingHint: 'Open the Balance History tab to find your sell.',
    },
    {
      kind: 'observe',
      text: 'Done: your position is closed, so the result is now real. Had the price risen by more than the fees, you’d have taken a profit. You paid a 0.1% fee when you bought and again when you sold, so unless the price moved in your favour you finish a little behind. A small loss is normal: this is what practice is for.',
      nextLabel: 'One quick question',
    },
    {
      kind: 'quiz',
      text: 'Check yourself',
      quiz: {
        question:
          'The price rose 0.05% between your buy and your sell. After fees, are you in profit?',
        options: ['Yes, the price went up', 'No, the fees were bigger'],
        correct: 1,
        explain:
          'Fees were 0.1% each way, about 0.2% in total. A 0.05% rise does not cover that, so you are slightly behind — price has to move further than the fees before a trade pays.',
      },
    },
  ]),
};

/** The fee's look: the buy in Order History, its Commission, and the fee it did not pay */
const reviewFee: Tour = {
  id: 'review-fee',
  title: 'What just happened',
  blurb: 'Where your trade’s fee shows up.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: numbered('review-fee', [
    fromDraft(
      openTab('orderhistory', {
        explain:
          'Your order filled. Open Order History: your finished orders on this market, newest first.',
      }),
      { missingHint: `${PANEL_HINT} Then its Order History tab.` }
    ),
    {
      kind: 'observe',
      anchor: 'order-history.row',
      // No key: the newest row, the buy
      text: 'With the All filter, the top row is your buy. Side says Buy, Type says Market, Fill Price is the price you got, and Status says Filled.',
      // (The tab keeps the filter last picked: a filled buy shows under All and Filled only)
      missingHint: 'Open the Order History tab, then its All filter, to find your buy.',
    },
    {
      kind: 'observe',
      anchor: 'order-history.row.commission',
      text: 'Commission is the fee for this trade. On a Spot buy it is taken in the coin: 0.1% of the Bitcoin you bought, worth about 10 cents. The small line under it shows the rate. Taker means your order took an offer already waiting, so it filled at once.',
      missingHint:
        'Open the Order History tab. No Commission column? Turn it on with the Customize columns button (the sliders icon at the right of the tabs).',
    },
    {
      kind: 'observe',
      text: 'A real exchange charges a fee like this for matching your order; here it is simulated. A network fee, from Lesson 8, is different: it is the cost of using a blockchain, for example when you send crypto. Your practice buy moved nothing on a blockchain, so it has none.',
      nextLabel: 'One quick question',
    },
    {
      kind: 'quiz',
      text: 'Check yourself',
      quiz: {
        question:
          'You buy coins on an exchange, then send them to your own wallet. Which fees would you expect?',
        options: [
          'Only the trading fee',
          'A trading fee for the buy, and a network fee for the send',
          'No fees: moving your own coins is free',
        ],
        correct: 1,
        explain:
          'The buy pays a trading fee. The send goes over a blockchain, so it has a network cost. An exchange usually charges you for it as a withdrawal fee, which may be different from the network cost itself.',
      },
    },
  ]),
};

export const TOURS: readonly Tour[] = [primer, buyFirstCoin, sellAndReview, findTheFee, trySwap];
export const PRACTICE_TOURS: readonly Tour[] = [practiceBuy, practiceLong, practiceShort];
export const PRACTICE_REVIEWS: readonly Tour[] = [reviewBuy, reviewLong, reviewShort];
export const PATH_REVIEWS: readonly Tour[] = [
  reviewFirstCoin,
  reviewSell,
  reviewSellResult,
  reviewFee,
  reviewSwap,
  reviewSwapClean,
];

export function getTour(id: TourId): Tour {
  const tour =
    TOURS.find((t) => t.id === id) ??
    PRACTICE_TOURS.find((t) => t.id === id) ??
    PRACTICE_REVIEWS.find((t) => t.id === id) ??
    PATH_REVIEWS.find((t) => t.id === id);
  if (!tour) throw new Error(`Unknown tour ${id}`);
  return tour;
}
