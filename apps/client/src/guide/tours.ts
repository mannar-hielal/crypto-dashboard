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
export type TourId = (typeof TOUR_IDS)[number] | PracticeTourId;

/** A Learn panel tour (not a practice trade): what the account's progress may hold */
export function isTourId(value: string): value is (typeof TOUR_IDS)[number] {
  return (TOUR_IDS as readonly string[]).includes(value);
}

/**
 * The width from which tours use the desktop layout: the order form docked beside the chart, lg and
 * up (design.md, responsive layout). Below it, phone-ready tours open the form from the bottom bar.
 */
export const TOUR_WIDE_QUERY = '(min-width: 1024px)';

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
          'You now own Bitcoin. Spot takes its 0.1% fee in the coin you receive, so you got a hair less than $100 worth.',
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
          'Place the sell order. Selling everything you bought closes your position. It fills at the Sell price.',
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

/** A practice trade: open the form (the phone's bar, or the side button), Market, $100, place it */
function practice(
  id: PracticeTourId,
  title: string,
  startUrl: string,
  side: 'buy' | 'sell',
  sideText: string,
  placed: string
): Tour {
  const phoneButton = side === 'buy' ? 'Buy / Long' : 'Sell / Short';
  const formHint = side === 'buy' ? FORM_HINT : FORM_HINT_SELL;
  return {
    id,
    title,
    blurb: 'A guided practice trade, then back to your lesson.',
    minutes: 1,
    startUrl,
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
  'Place the order. It fills right away: you now own $100 of Bitcoin. Your lesson carries on next.'
);
const practiceLong = practice(
  'practice-long',
  'Practice: go long',
  '/dashboard/usdt/BTCUSDT',
  'buy',
  'On the USDT Perpetual market, Buy / Long opens a long: you gain if the price rises.',
  'Place the order. With no short open on Bitcoin, you now hold a long position (a Buy first shrinks a short you already hold). Your lesson carries on next.'
);
// On Ethereum: one position per symbol (one-way), so a short on Bitcoin would only close the
// practice long instead of opening a short
const practiceShort = practice(
  'practice-short',
  'Practice: go short',
  '/dashboard/usdt/ETHUSDT',
  'sell',
  'On the USDT Perpetual market, Sell / Short opens a short: you gain if the price falls. This one is on Ethereum.',
  'Place the order. With no long open on Ethereum, you now hold a short position (a Sell first shrinks a long you already hold). Your lesson carries on next.'
);

export const TOURS: readonly Tour[] = [primer, buyFirstCoin, sellAndReview];
export const PRACTICE_TOURS: readonly Tour[] = [practiceBuy, practiceLong, practiceShort];

export function getTour(id: TourId): Tour {
  const tour = TOURS.find((t) => t.id === id) ?? PRACTICE_TOURS.find((t) => t.id === id);
  if (!tour) throw new Error(`Unknown tour ${id}`);
  return tour;
}
