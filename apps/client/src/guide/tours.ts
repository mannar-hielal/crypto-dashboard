/**
 * The guided tours (docs/GUIDED_TRADE_MVP.md, reshaped 2026-10-11): short chapters of at most five
 * steps, chained — a primer that only reads, then buying a first coin, then selling it back and
 * reading the result. Research (reports/) says completion falls fast past five steps.
 *
 * Steps that repeat a scenario action reuse the shared builders in `steps.ts` (one wording for the
 * form's controls everywhere); the learner-facing text for the new ones lives here. Pure data: no
 * React, so the tests can walk every tour.
 */

import type { GuideAnchor } from '@/lib/guideAnchors';
import { chooseType, openTab, submit } from './steps';
import type { StepDraft } from './scenario';

export const TOUR_IDS = ['primer', 'buy-first-coin', 'sell-and-review'] as const;
export type TourId = (typeof TOUR_IDS)[number];

export function isTourId(value: string): value is TourId {
  return (TOUR_IDS as readonly string[]).includes(value);
}

export type TourStepKind = 'observe' | 'click' | 'type' | 'quiz';

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
  quiz?: TourQuiz;
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
  steps: TourStep[];
}

const FORM_HINT = 'Open the order form with the Trade button in the bar above the chart.';

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

function numbered(id: TourId, steps: Array<Omit<TourStep, 'id'>>): TourStep[] {
  return steps.map((s, i) => ({ ...s, id: `${id}.${i + 1}` }));
}

// ─── 1. What you're looking at ───────────────────────────────────────────────

const primer: Tour = {
  id: 'primer',
  title: 'What you’re looking at',
  blurb: 'Price, chart, practice money — in about a minute, no trading yet.',
  minutes: 1,
  startUrl: '/dashboard/spot/BTC/USDT',
  next: 'buy-first-coin',
  steps: numbered('primer', [
    {
      kind: 'observe',
      anchor: 'symbolbar.price',
      text: 'This is Bitcoin’s live price, in dollars. USDT is a coin built to stay worth one dollar, so a price in USDT reads like a price in dollars.',
    },
    {
      kind: 'observe',
      anchor: 'symbolbar.symbol-picker',
      text: 'BTCUSDT means Bitcoin priced in USDT. Open this any time to pick another coin.',
    },
    {
      kind: 'observe',
      anchor: 'pane.chart',
      text: 'Each bar is a slice of time. Its top and bottom are the highest and lowest price in that time, so a tall bar means the price moved a lot.',
    },
    {
      kind: 'observe',
      anchor: 'account.summary.balance',
      text: 'This is your practice balance. It is play money: nothing here can cost you real money, so this is a safe place to make mistakes.',
      missingHint: 'Open the account panel under the chart to see your balance.',
    },
    {
      kind: 'observe',
      anchor: 'trade.side.buy',
      text: 'Ready? Your first practice trade takes about three minutes. You will buy a small amount of Bitcoin, then sell it back.',
      nextLabel: 'Start my first trade',
      missingHint: FORM_HINT,
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
  steps: numbered('buy-first-coin', [
    fromDraft(
      {
        action: 'observe',
        anchor: 'trade.side.buy',
        explain:
          'You are on Spot: you buy the coin itself. Buy shows the price you pay right now — the lowest price a seller accepts.',
        liveNote:
          'Sell is a little lower than Buy; that gap is the spread, a small cost of every trade.',
      },
      { missingHint: FORM_HINT }
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
      submit({ explain: 'Place the order. It fills immediately, and the amount field clears.' }),
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
    fromDraft(submit({ explain: 'Place the sell order. It fills at the Sell price.' }), {
      doneWhenEmpty: 'trade.amount',
      missingHint: FORM_HINT,
    }),
    {
      kind: 'observe',
      text: 'Done. You paid a 0.1% fee when you bought and again when you sold, so unless the price moved in your favour you finish a little behind. A small loss is normal: this is what practice is for.',
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

export const TOURS: readonly Tour[] = [primer, buyFirstCoin, sellAndReview];

export function getTour(id: TourId): Tour {
  const tour = TOURS.find((t) => t.id === id);
  if (!tour) throw new Error(`Unknown tour ${id}`);
  return tour;
}
