/**
 * The guided tours (docs/GUIDED_TRADE_MVP.md, reshaped 2026-10-11): short chapters of at most five
 * steps — a primer of three small tasks on the live chart (Lesson 3's "Try it", guide/lessons.ts),
 * then buying a first coin chained to selling it back and reading the result. Research (reports/)
 * says completion falls fast past five steps.
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
export const TOUR_IDS = ['primer', 'buy-first-coin', 'sell-and-review'] as const;
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
/** The path's tours: saved, reported and counted (a practice trade is none of these) */
export type PathTourId = (typeof TOUR_IDS)[number];
export type TourId = PathTourId | PracticeTourId | PracticeReviewId;

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
  while (to >= 0 && steps[to].screen === 'phone' && passed.includes(steps[to].id)) to--;
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
  next: 'sell-and-review',
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
      // Owner 2026-11-12 (the benchmark gaps): what you hold now, and that it's only on paper until
      // closed
      submit({
        explain:
          'Place the order. It fills immediately and the amount field clears. You now hold a position: $100 of Bitcoin, long. Its profit or loss is only on paper until you close it by selling, in the next tour.',
      }),
      {
        doneWhenEmpty: 'trade.amount',
        missingHint: FORM_HINT,
      }
    ),
  ]),
};

// ─── 3. Sell it back and read the result ─────────────────────────────────────

const sellAndReview: Tour = {
  id: 'sell-and-review',
  title: 'Sell it and read the result',
  blurb: 'Sell your Bitcoin back and see what the fees did.',
  minutes: 2,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: numbered('sell-and-review', [
    fromDraft(
      openTab('assets', {
        explain:
          'You now own Bitcoin. Spot takes its 0.1% fee in the coin you receive, so you got a hair less than you paid for.',
      }),
      { missingHint: 'Open the account panel under the chart, then the Assets tab.' }
    ),
    {
      kind: 'click',
      anchor: 'assets.row.sell',
      key: 'BTC',
      text: 'Press Sell to put all of your Bitcoin into the order form, ready to sell.',
      missingHint: 'Open the Assets tab to find your Bitcoin.',
    },
    fromDraft(
      submit({
        explain:
          'Place the sell order. Selling all of your Bitcoin closes your position (any you bought in a practice trade too). It fills at the Sell price.',
      }),
      {
        doneWhenEmpty: 'trade.amount',
        missingHint: 'Open the Assets tab and press Sell on your Bitcoin again.',
      }
    ),
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

// ─── Practice trades from a lesson card (owner 2026-11-16) ──────────────────

/**
 * A practice trade: open the form (the phone's bar, or the side button), Market, $100, place it; then
 * its review chapter (`next`) shows what just happened in the account panel
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
  const phoneButton = side === 'buy' ? 'Buy / Long' : 'Sell / Short';
  const formHint = side === 'buy' ? FORM_HINT : FORM_HINT_SELL;
  return {
    id,
    title,
    blurb: 'A guided practice trade, then back to your lesson.',
    minutes: 1,
    startUrl,
    next,
    phoneReady: true,
    steps: numbered(id, [
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
      }),
    ]),
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

/** The account panel's way in, when it isn't on screen (a phone opens it after an order) */
const PANEL_HINT = 'Open the account panel under the chart.';
/** The last step's button: the lesson carries on after it */
const BACK_TO_LESSON = 'Back to the lesson';

const reviewBuy: Tour = {
  id: 'review-buy',
  title: 'What just happened',
  blurb: 'Where your practice buy shows up.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  phoneReady: true,
  steps: numbered('review-buy', [
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
      text: 'Unrealized PnL is what you’d gain or lose if you sold right now, before the selling fee. It changes with every tick, and becomes real only when you sell.',
      missingHint: 'Open the Assets tab to find your Bitcoin.',
      nextLabel: BACK_TO_LESSON,
    },
  ]),
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

export const TOURS: readonly Tour[] = [primer, buyFirstCoin, sellAndReview];
export const PRACTICE_TOURS: readonly Tour[] = [practiceBuy, practiceLong, practiceShort];
export const PRACTICE_REVIEWS: readonly Tour[] = [reviewBuy, reviewLong, reviewShort];

export function getTour(id: TourId): Tour {
  const tour =
    TOURS.find((t) => t.id === id) ??
    PRACTICE_TOURS.find((t) => t.id === id) ??
    PRACTICE_REVIEWS.find((t) => t.id === id);
  if (!tour) throw new Error(`Unknown tour ${id}`);
  return tour;
}
