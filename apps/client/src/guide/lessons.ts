/**
 * The lessons (guided-learning plan, owner 2026-10-22): a few illustrated cards, a short tour on the
 * real screen, two or three questions, one journal line. Tick (green, the curious one) and Tock
 * (red, the calm one) present them — red is never the villain.
 *
 * Rules the tests hold every lesson to: at most six cards of at most 80 words, two or three
 * questions with a "Why", praise for the plan and never for a lucky guess, no hype. Every dated
 * price is checked against Bybit's daily candles before it ships (noted beside it).
 *
 * Knowledge base (owner 2026-10-23): card text marks up to two tappable terms (`[[label|concept]]`,
 * learn/terms.ts) that open a peek and, from it, the article; history cards show a real mini chart
 * (`chart`); the close lists what the learner can now do, each with its article.
 *
 * Pure data: no React, so the tests can walk every lesson.
 */

import { FREE, type Entitlement } from '@/learn/access';
import type { ArticleId, WidgetId } from '@/learn/articles';
import { plainText, termIds } from '@/learn/terms';
import pizzaDay from '@/assets/lessons/pizza-day.jpg';
import type { TourId, PracticeTourId } from './tours';

export const LESSON_IDS = ['lesson-01', 'lesson-ownership', 'lesson-02'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export function isLessonId(value: string): value is LessonId {
  return (LESSON_IDS as readonly string[]).includes(value);
}

/** The pictures `LessonArt` can draw, all from our own tokens */
export type LessonArtId =
  | 'ledger'
  /** Lesson 2's Bitcoin card: the mark rising with its burst */
  | 'bitcoin'
  | 'etf'
  /** Lesson 3's cold open without a photo: Bybit's quiet minute candles, and Binance.US's wick */
  | 'flashCrash'
  /** A thin queue of buy offers eaten step by step */
  | 'staircase'
  | 'candleAnatomy'
  | 'swings'
  | 'checkCoin'
  // Pictures that tell most of their card (owner 2026-11-17), each with its `ART_LABELS` line
  /** Lesson 1, Up or down: a price that climbs, one that slides, one that drifts sideways */
  | 'threePaths'
  /** Lesson 1, Buy and Sell: money for a coin, a coin for money */
  | 'buySell'
  /** Lesson 1, Close it to keep it: a result on paper, then locked in */
  | 'closeToKeep'
  /** Lesson 1, Going short: the borrowed game sold at $60, bought back at $40, $20 kept */
  | 'shortGame'
  /** Lesson 1, The market never sleeps: a shop's week of hours against crypto's */
  | 'alwaysOpen'
  /** Lesson 2, The hash links the chain: blocks carrying the one before's fingerprint */
  | 'hashChain'
  /** Lesson 2, Sealed by hard work: one old number changed, every later block broken */
  | 'sealBroken';

/**
 * What a picture shows, for screen readers. `null`: decorative (the card's text carries it all).
 * The pictures drawn to tell most of their card (owner 2026-11-17) say what they show.
 */
export const ART_LABELS: Record<LessonArtId, string | null> = {
  ledger: null,
  bitcoin: null,
  etf: null,
  flashCrash: null,
  staircase: null,
  candleAnatomy: null,
  swings: null,
  checkCoin: null,
  threePaths:
    'Three price paths: one climbs, where betting up wins; one slides, where betting down wins; one drifts sideways.',
  buySell: 'Buy: you pay money and get a coin. Sell: you hand over the coin and get money.',
  closeToKeep:
    'An open position shows +$120 on paper, which can still shrink. Closed, the +$120 is locked in and yours to keep.',
  shortGame:
    'A game’s price falls from $60 to $40: you sell a borrowed game at $60, buy one back at $40 to return, and keep $20.',
  alwaysOpen:
    'A week of opening hours: a shop opens only by day and closes on Sunday; crypto is open all day, every day.',
  hashChain:
    'Three blocks in a row: each carries the fingerprint, or hash, of the block before it, which links them into a chain.',
  sealBroken:
    'An old block’s number is changed from 5 to 9, so its fingerprint changes and the blocks after it no longer match: each must be redone.',
};

export type Speaker = 'tick' | 'tock';

/**
 * What the learner calls the guides (owner 2026-11-08: Pulin and Berwyn). The ids stay `tick` and
 * `tock` in the code; only these names are shown.
 */
export const GUIDE_NAMES: Record<Speaker, string> = { tick: 'Pulin', tock: 'Berwyn' };

/**
 * The guides' faces (owner's visual Q&A 2026-10-24; `frank` 2026-10-25: eyes straight at the
 * learner, a level mouth, for a plain truth). `worried` is for warnings only (scams, never
 * share your key), never a reaction to a wrong answer: red is never the villain.
 */
export const MOODS = [
  'smile',
  'grin',
  'wink',
  'surprised',
  'curious',
  'thinking',
  'worried',
  'calm',
  'frank',
] as const;
export type Mood = (typeof MOODS)[number];

/** `point`: one arm raised toward the scene, as a presenter does */
export type Pose = 'stand' | 'point' | 'wave';

/** Who presents a card or a question, and how */
export interface Presenter {
  who: Speaker;
  mood: Mood;
  pose?: Pose;
}

export interface LessonLine {
  speaker: Speaker;
  text: string;
}

/** A dated marker on a lesson chart */
export interface ChartMarker {
  /** YYYY-MM-DD (UTC), the candle it sits on */
  date: string;
  text: string;
  position: 'above' | 'below';
}

/**
 * A real mini chart on a card (owner's visual Q&A 2026-10-23): daily candles from our market
 * history (Bybit's USDT perpetual by default, which reaches back before 2021 — spot doesn't), with
 * markers.
 */
export interface ChartScene {
  /** Bitcoin, or Solana for the "smaller coins swing harder" comparison (Lesson 1, owner 2026-11-16) */
  symbol: 'BTCUSDT' | 'SOLUSDT';
  /**
   * Which Bybit market the candles come from: `linear` (the USDT perpetual, the default) or `spot`,
   * when the card's text is about a spot trade and its prices must match (Lesson 1's worked long,
   * fact check 2026-11-17)
   */
  category?: 'spot' | 'linear';
  /** The newest candle's date (YYYY-MM-DD, UTC) and how many daily candles end there */
  end: string;
  bars: number;
  markers: ChartMarker[];
  /** Show only up to this date until the learner has answered (the "what happened next?" moment) */
  freezeAt?: string;
  /** A Choose buy or sell plan's price, drawn as a dashed line across the chart */
  planLine?: { price: number; label: string };
  /** What the chart shows, for screen readers */
  label: string;
  /** The drawn picture shown instead when the history can't be loaded */
  fallback: LessonArtId;
}

/**
 * One line of a cold open (owner's visual Q&A 2026-10-25): the lines appear one after another, like
 * a trailer, before the Next button shows. A `counter` ticks from `from` to `to`; its `text` is the
 * finished line, which screen readers and reduced motion get straight away.
 */
export type Beat =
  | { kind: 'kicker'; text: string }
  | { kind: 'headline'; text: string; /** the words drawn big and amber */ emphasis?: string }
  | { kind: 'fact'; text: string }
  | { kind: 'counter'; text: string; label: string; from: number; to: number; prefix: string }
  | { kind: 'line'; speaker: Speaker; mood: Mood; text: string };

export interface GuidesMeeting {
  tick: string;
  tock: string;
  /** The line above the list */
  lead: string;
  list: string[];
}

export interface CardPoint {
  label: string;
  text: string;
}

export interface LessonPhoto {
  src: string;
  /** What the photo shows, for screen readers */
  alt: string;
  /**
   * Shown under the image. `null` only where the owner confirmed the rights and chose no credit
   * line: every photo states its attribution decision
   */
  credit: string | null;
}

/**
 * A worked sum under a card (owner 2026-11-17): a guide in glasses says "Let's do the math", then
 * numbered steps, one operation each with its result, and the answer set apart. Every figure comes
 * from the card's own data (the dated candles beside it) and is checked when written.
 */
export interface MathBreakdown {
  /** The guide doing the math, in glasses */
  who: Speaker;
  /** In order: what the step does ("Divide by the start") and the sum ("1.50 ÷ 12.34 = 0.12") */
  steps: { label: string; sum: string }[];
  /** The result in words, highlighted under the steps */
  answer: string;
}

/**
 * A new, harder idea told as an analogy by one guide in glasses (owner 2026-11-17), in place of the
 * guides' chit-chat. It says where the analogy stops matching when that matters.
 */
export interface Analogy {
  who: Speaker;
  text: string;
}

/**
 * The sheet's one label set, in every lesson (owner 2026-11-17): the main button always says
 * Continue, the back link Back, and the summary's button (the last screen that teaches) Finish
 * lesson. A card has no label of its own, so a question-style one can't come back.
 */
export const LESSON_LABELS = {
  next: 'Continue',
  back: 'Back',
  finish: 'Finish lesson',
} as const;

export interface LessonCard {
  title: string;
  /** Pulin or Berwyn, standing in the picture and presenting it (a photo stands alone) */
  presenter?: Presenter;
  /** The picture (a card with a `chart` shows the chart instead; a `meet` card is its own scene) */
  art?: LessonArtId;
  /** A real photograph in place of a drawing (owner 2026-11-08), with its credit */
  photo?: LessonPhoto;
  chart?: ChartScene;
  /** Either plain text (may mark `[[terms]]`), or a short exchange between the two guides */
  text?: string;
  lines?: LessonLine[];
  /** A cold open: lines revealed one by one (a card with beats shows no `text` or `lines`) */
  beats?: Beat[];
  /**
   * The guides introduce themselves (owner 2026-10-25): Tick slides in from the left, Tock from the
   * right, they meet in the middle, then what the lesson will answer fades in
   */
  meet?: GuidesMeeting;
  /** A worked sum under the text (gain, loss, percent): numbered steps, one operation each */
  math?: MathBreakdown;
  /** A new, harder idea as an analogy, told by one guide in glasses (under the text) */
  analogy?: Analogy;
  /** Bold-labelled points under the text ("**Print coins.** Write …") */
  points?: CardPoint[];
  /** A Read more under the card, to the article that goes deeper (owner 2026-11-12) */
  more?: { article: ArticleId; section?: string };
  /**
   * A quick check between cards (owner 2026-11-16: quizzes can sit mid-lesson). The card is then a
   * question screen: its `title` is the heading, the question replaces the text, and Next waits for
   * an answer.
   */
  quiz?: LessonQuestion;
  /**
   * A practice trade from this card (owner 2026-11-16): a guided arrow on the real chart, then the
   * lesson carries on at the next screen
   */
  practice?: { tour: PracticeTourId; label: string };
}

/** One "You can now…" line on the close, with the article that goes deeper */
export interface CanDo {
  text: string;
  /** The article it opens; none yet = a plain line (owner 2026-11-16) */
  article?: ArticleId;
  /** The article section to open at (an `h` block's id) */
  section?: string;
}

/**
 * How a question is answered: a list of options (multiple choice), or Buy and Sell side by side
 * under a chart and a stated plan (owner's visual Q&A, 2026-11-16). A buy-or-sell question's
 * options are exactly `['Buy', 'Sell']` and its answer follows from the plan, never a guess.
 * Drag and drop (`order`) puts `steps` into numbered slots; Match boxes (`match`) pairs each
 * `pairs` term with its meaning. Those two have no `options` (their `correct` is 0): the stored
 * answer is `correct` when every slot or pair was right, -1 otherwise.
 */
export type QuestionFormat = 'choice' | 'buy-sell' | 'order' | 'match';

export interface LessonQuestion {
  /** Default `choice` */
  format?: QuestionFormat;
  /** A buy-or-sell question's plan, shown under the chart ("Your plan: … Today it closed at …") */
  plan?: string;
  /** Drag and drop: the steps in their right order (shown shuffled) */
  steps?: string[];
  /** Match boxes: each term with its meaning (the meanings are shown shuffled) */
  pairs?: { term: string; meaning: string }[];
  question: string;
  /** A short context line above the question (a headline, a situation) */
  context?: string;
  options: string[];
  /** Index into `options` */
  correct: number;
  /** Shown after any answer: why the right one is right */
  explain: string;
  /** A chart shown with the question; a frozen one plays on once the learner has answered */
  chart?: ChartScene;
  /** The guide beside the question before it's answered (after it, the guides react) */
  presenter?: Presenter;
}

export interface Lesson {
  id: LessonId;
  number: number;
  title: string;
  stage: string;
  minutes: number;
  /** "Try it": a tour on the real screen (desktop), or an interactive piece inside the sheet */
  tour?: TourId;
  tryWidget?: WidgetId;
  /** What the learner will do in "Try it", on the screen before it */
  tryIntro: string;
  cards: LessonCard[];
  /** The mid-lesson moment: a question where the honest answer is the praised one */
  moment: LessonQuestion;
  /**
   * The card the moment follows (an index into `cards`; default the last card), so a lesson can go
   * on teaching after it (Lesson 3's volatility card comes after the ETF answer, owner 2026-11-12)
   */
  momentAfter?: number;
  checks: LessonQuestion[];
  notePrompt: string;
  /** One line on the close, above the way on: what the next lesson brings (owner 2026-11-12) */
  teaser?: string;
  /** What the learner can do after the lesson, shown on the close */
  canDo: CanDo[];
  /**
   * The close's summary, in place of "You can now" (owner 2026-11-08): a few lines, each opening its
   * article. Lessons without one list `canDo` instead.
   */
  recap?: {
    title: string;
    points: CanDo[];
    /** The conclusion; with no article it has no Read more (Lesson 1's ending, owner 2026-11-12) */
    highlight?: { text: string; article?: ArticleId; section?: string };
  };
  /**
   * The lesson the close offers next. None: the path shows what comes next (Lesson 3 since the
   * rewrite: Lesson 1's Try already runs the buy and sell tours)
   */
  next?: LessonId;
  access: Entitlement;
  /**
   * Added to the screen number in the funnel's step ids (`lesson-01.61` = screen 1 at 60), so steps
   * stored before the lesson's screens changed aren't counted as today's screens
   */
  stepBase?: number;
}

// ─── Lesson 1 — Up, down and your first trade ────────────────────────────────
// From the owner's notes on Kevin and Colt's lectures (Drive docs 01–06), rewritten in our voice;
// each card's terms open the matching article (learn/articles.ts). Owner 2026-10-23: the Pizza Day
// hook, and "Try it" is Nora cheating in the notebook, inside the sheet, on every screen size.

/** Lesson 1's length: its card, the guides' meeting and the welcome card all say it */
const LESSON_01_MINUTES = 9;

// ─── Lesson 1's charts: Bybit BTCUSDT / SOLUSDT perpetual daily candles (UTC closes, read and
// fact-checked 2026-11-16, guided-learning-topics notes 13) ─────────────────────────────────────

// Choose buy or sell 1: no close above $31,000 from 11 Sep to 22 Oct 2023; 23 Oct closed 33,092.9;
// 9 Nov closed 36,726.5
const BREAKOUT_2023: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2023-11-09',
  bars: 60,
  markers: [],
  freezeAt: '2023-10-23',
  planLine: { price: 31_000, label: 'Your plan' },
  label:
    'Bitcoin daily candles from mid September to 23 October 2023, under a dashed line at $31,000; once answered, on to 9 November.',
  fallback: 'swings',
};

// Choose buy or sell 2: every close from 15 Jul to 4 Aug 2024 above $58,000 (4 Aug 58,131.6);
// 5 Aug closed 53,988.2; the best later August close 64,181 (25 Aug), never back to 67,500
const EXIT_2024: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-08-19',
  bars: 36,
  markers: [],
  freezeAt: '2024-08-05',
  planLine: { price: 58_000, label: 'Your exit line' },
  label:
    'Bitcoin daily candles from mid July to 5 August 2024, falling through a dashed line at $58,000; once answered, on to 19 August.',
  fallback: 'swings',
};

// The worked long, a spot buy, so spot candles (fact check 2026-11-17; the perpetual closed 27,484.1
// and 73,133.0): Bybit BTCUSDT spot, 2 Oct 2023 closed 27,499.97; 13 Mar 2024 closed 73,079.40
const LONG_2023: ChartScene = {
  symbol: 'BTCUSDT',
  category: 'spot',
  end: '2024-03-20',
  bars: 178,
  markers: [
    { date: '2023-10-02', text: 'Buy $27,500', position: 'below' },
    { date: '2024-03-13', text: 'Sell $73,079', position: 'above' },
  ],
  label:
    'Bitcoin daily candles from late September 2023 to March 2024: a buy on 2 October at $27,500, a sale on 13 March at $73,079.',
  fallback: 'swings',
};

// The worked short: 10 Nov 2021 high 69,138.5, closed 64,893.5; 18 Jun 2022 closed 18,964.5
const SHORT_2021: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2022-06-25',
  bars: 240,
  markers: [
    { date: '2021-11-10', text: 'Short $64,894', position: 'above' },
    { date: '2022-06-18', text: 'Buy back $18,965', position: 'below' },
  ],
  label:
    'Bitcoin daily candles from late October 2021 to June 2022: a short on 10 November at $64,894, bought back on 18 June at $18,965.',
  fallback: 'swings',
};

// Smaller coins swing harder: 29 Jul → 5 Aug 2024 closes, SOL 182.57 → 129.70 (−29%), BTC
// 66,757.7 → 53,988.2 (−19%)
const SOL_2024: ChartScene = {
  symbol: 'SOLUSDT',
  end: '2024-08-12',
  bars: 28,
  markers: [
    { date: '2024-07-29', text: '$182.57', position: 'above' },
    { date: '2024-08-05', text: '−29%', position: 'below' },
  ],
  label:
    'Solana daily candles from mid July to mid August 2024: from $182.57 on 29 July down 29% to $129.70 on 5 August.',
  fallback: 'swings',
};

// Each lesson's `stepBase` is the SDK's `LESSON_FIRST_STEPS` − 1, written out rather than imported:
// 29 client test files mock `@crypto-dashboard/sdk` wholesale, and any of them that loads a lesson
// would then fail to load. The server keeps its own copy too (the SDK ships TypeScript source, so the
// server takes only types from it at runtime). A test on each side holds its copy to the SDK's.
const lesson01: Lesson = {
  id: 'lesson-01',
  number: 1,
  // Owner 2026-11-16: the rewrite (trading basics); our own title
  title: 'Up, down and your first trade',
  stage: 'Getting started',
  minutes: LESSON_01_MINUTES,
  // Rewritten 2026-11-16 (and everyone's progress reset): today's screens are steps 61 on; the
  // versions before used 1–20 and 21–40
  stepBase: 60, // the SDK's LESSON_FIRST_STEPS − 1 (see the note above Lesson 1)
  // Open a paper trade, then close it (owner 2026-11-16): the buy tour hands over to the sell tour
  tour: 'buy-first-coin',
  tryIntro:
    'Time to try it for real, with paper money. We’ll guide you to open a small trade on the live chart, then close it. Nothing here is real money.',
  cards: [
    {
      // bitcointalk.org, 22 May 2010: Laszlo Hanyecz in Jacksonville, Florida, paid 10,000 BTC for
      // two pizzas; the coins were worth about $41 then. 10,000 BTC passed $1 billion once Bitcoin
      // traded above $100,000 (December 2024). The owner holds the rights to the photo (2026-11-08)
      title: 'Two pizzas',
      photo: {
        src: pizzaDay,
        alt: 'Laszlo Hanyecz at a table with two children and two large pizzas in open boxes.',
        credit: 'Photo: Laszlo Hanyecz',
      },
      beats: [
        { kind: 'kicker', text: '22 May 2010 · Florida' },
        {
          kind: 'headline',
          text: 'Laszlo Hanyecz paid 10,000 bitcoin for two pizzas.',
          emphasis: '10,000 bitcoin',
        },
        { kind: 'fact', text: 'Back then, those coins were worth about $41.' },
        {
          kind: 'headline',
          text: 'Those same coins later passed $1 billion. Prices move. A lot.',
          emphasis: '$1 billion',
        },
      ],
    },
    {
      title: 'Meet your guides',
      presenter: { who: 'tick', mood: 'smile', pose: 'wave' },
      meet: {
        tick: 'Hi, I’m Pulin. I ask the questions you’re too polite to ask.',
        tock: 'And I’m Berwyn. I answer them. Usually.',
        lead: `In the next ${LESSON_01_MINUTES} minutes you’ll learn:`,
        list: [
          'how you can win when a price goes up or down',
          'what Buy, Sell, long and short really mean',
          'why your plan beats your gut',
        ],
      },
    },
    {
      title: 'Up or down, you can win',
      art: 'threePaths',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'Over time a price climbs, slides or drifts sideways. Most people think you only win when it climbs. Not quite. Traders can profit either way, as long as they picked the right side before the move.',
      lines: [
        { speaker: 'tick', text: 'Wait, I can make money when things go down?' },
        {
          speaker: 'tock',
          text: 'You can. You can also lose money when things go up. Same coin, two sides.',
        },
      ],
    },
    {
      title: 'Buy and Sell',
      art: 'buySell',
      presenter: { who: 'tock', mood: 'smile', pose: 'point' },
      text: 'Think of it like a shop. **Buy** means you pay to own some coin, hoping it’s worth more later. **Sell** means you hand over coin for money: to cash in, to cut a loss, or (as you’ll see) to bet on a fall.',
      practice: { tour: 'practice-buy', label: 'Try a buy on the real chart' },
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'buy-sell',
        plan: 'Your plan: buy if a day closes above $31,000. On 23 October 2023, Bitcoin closed at $33,093.',
        question: 'What does your plan say to do?',
        options: ['Buy', 'Sell'],
        correct: 0,
        explain:
          'Your plan set the rule before the move: a close above $31,000 means buy. It closed at $33,093, so the plan says buy. Notice you didn’t have to guess where the price goes next.',
        chart: BREAKOUT_2023,
      },
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'buy-sell',
        plan: 'You bought Bitcoin at $67,500 in July 2024. Your plan: sell if a day closes below $58,000. On 5 August 2024 it closed at $53,988.',
        question: 'What does your plan say to do?',
        options: ['Buy', 'Sell'],
        correct: 1,
        explain:
          'The close went under your $58,000 line, so the plan says sell and keep the loss small. It recovered to about $64,000 later that month, still below the $67,500 you paid. A plan can’t promise the best price; it promises you won’t freeze while a loss grows.',
        chart: EXIT_2024,
      },
    },
    {
      title: 'Going long',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'Going **long** is the classic move: buy now, sell later, hope it’s higher. Think of buying concert tickets early because you expect the show to sell out.',
      lines: [
        { speaker: 'tick', text: 'So “long” just means… buy and wait?' },
        { speaker: 'tock', text: 'Buy and plan to sell. The “later” part matters just as much.' },
      ],
      practice: { tour: 'practice-long', label: 'Try a long on the real chart' },
    },
    {
      title: 'A real long',
      presenter: { who: 'tock', mood: 'curious', pose: 'point' },
      chart: LONG_2023,
      text: 'Say you bought $1,000 of Bitcoin on the spot market at the close on 2 October 2023, at $27,500. Over the winter the price climbed. On 13 March 2024 you sold at the close: $73,079.',
    },
    {
      // Owner 2026-11-17: rewritten around the math (the hindsight line dropped). From LONG_2023's
      // spot closes (fact check 2026-11-17), rounded to $27,500 and $73,079: 73,079 − 27,500 =
      // 45,579; ÷ 27,500 = 1.6574; $1,000 → $2,657 before fees (unrounded 73,079.40 ÷ 27,499.97 =
      // 2.6574: $2,657.44); a 0.1% fee each way keeps 0.999² = 99.8%: $2,651.69 ($2,652.13 unrounded)
      title: 'The result',
      presenter: { who: 'tock', mood: 'grin', pose: 'stand' },
      text: 'You bought $1,000 of Bitcoin at $27,500 and sold it at $73,079. How much is that, in percent and in dollars? One more thing: Spot takes a 0.1% fee when you buy and again when you sell, so you keep about 99.8%.',
      math: {
        who: 'tick',
        steps: [
          { label: 'Price rise', sum: '73,079 − 27,500 = 45,579' },
          { label: 'Divide by the start', sum: '45,579 ÷ 27,500 = 1.657' },
          { label: 'As a percent', sum: '1.657 × 100 = 165.7%' },
          { label: 'Your gain', sum: '$1,000 × 1.657 = $1,657' },
          { label: 'Add your $1,000', sum: '$1,000 + $1,657 = $2,657' },
          { label: 'Keep 99.8% after fees', sum: '$2,657 × 0.998 ≈ $2,652' },
        ],
        answer:
          'Bitcoin rose about 166%. After fees, your $1,000 became about **$2,652**: about **$1,652 profit**.',
      },
    },
    {
      title: 'Close it to keep it',
      art: 'closeToKeep',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'While you hold a position, the profit on screen is only on paper: it changes with every tick. It becomes real when you **close** the position. In our app that’s the Close button on your position row. Until then, it can still shrink.',
    },
    {
      // Owner 2026-11-17: the borrowing analogy, by one guide in glasses, replaces the chit-chat; it
      // says where it stops matching (a perpetual borrows nothing)
      title: 'Going short',
      art: 'shortGame',
      presenter: { who: 'tock', mood: 'calm', pose: 'stand' },
      text: 'Going **short**, on our USDT Perpetual market, is the mirror move: you win when the price falls.',
      analogy: {
        who: 'tock',
        text: 'Think of it as borrowing. A friend lends you a $60 game, and you sell it. Next month it’s $40: buy one, give it back, keep $20. If it hits $90, you lose $30. Our perpetual borrows nothing: you put up USDT as margin, the contract settles the difference in USDT, and while it’s open you pay or receive a small funding fee.',
      },
      practice: { tour: 'practice-short', label: 'Try a short on the real chart' },
    },
    {
      title: 'A real short',
      presenter: { who: 'tock', mood: 'curious', pose: 'point' },
      chart: SHORT_2021,
      text: 'On 10 November 2021 Bitcoin hit a then-record near $69,000 and closed at $64,894. Say you shorted 0.01 BTC there. Over the next months the price slid. On 18 June 2022 you bought it back at the close: $18,965.',
    },
    {
      // A real warning (the lesson rules): a short's loss has no ceiling; liquidation on a perpetual.
      // The math (owner 2026-11-17), from SHORT_2021's closes: 0.01 × 64,893.5 = 648.94;
      // 0.01 × 18,964.5 = 189.65; 459.29 ÷ 648.94 = 0.7078
      title: 'The catch',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Back to your short of 0.01 BTC: opened at $64,894, bought back at $18,965. What did it make?',
      math: {
        who: 'tock',
        steps: [
          { label: 'Value when opened', sum: '0.01 × 64,894 = $648.94' },
          { label: 'Value when closed', sum: '0.01 × 18,965 = $189.65' },
          { label: 'Your profit', sum: '$648.94 − $189.65 = $459.29' },
          { label: 'Divide by the start', sum: '459.29 ÷ 648.94 = 0.708' },
          { label: 'As a percent', sum: '0.708 × 100 = 70.8%' },
        ],
        answer:
          'Bitcoin fell about 71%, and your short made about **$459**, before fees and funding.',
      },
      lines: [
        {
          speaker: 'tock',
          text: 'Now the catch: a price can only fall to zero, but it can rise without a ceiling. On a perpetual, the exchange closes a losing short before your margin runs out (liquidation), and that margin is lost. Shorts need a stop, always.',
        },
      ],
    },
    {
      title: 'Quick check',
      quiz: {
        context:
          'A friend messages you: “Buy Glimmer coin now, it can’t lose, trust me!” You’ve never heard of it, and you have no plan.',
        question: 'What’s your move?',
        options: ['Go long, quickly', 'Go short, it’s probably hype', 'Stay out for now'],
        correct: 2,
        explain:
          'No plan, no reason, just a tip. Long or short, you’d be guessing, and hyped tiny coins can jump 50% in an hour. Staying out is a real choice, and here it’s the smart one.',
      },
    },
    {
      title: 'The market never sleeps',
      art: 'alwaysOpen',
      presenter: { who: 'tick', mood: 'surprised', pose: 'stand' },
      text: 'Shops close at night. Crypto doesn’t. It trades **24 hours a day, 7 days a week**, holidays included. Big moves can happen while you sleep.',
      lines: [
        { speaker: 'tick', text: 'So I should never sleep?' },
        {
          speaker: 'tock',
          text: 'Please sleep. Set your plan, your stop and your target first. Fast moves can fill a stop a little worse than its price ([[slippage]]), but it still works while you sleep.',
        },
      ],
      more: { article: 'price-swings', section: 'always-open' },
    },
    {
      title: 'Smaller coins swing harder',
      presenter: { who: 'tock', mood: 'frank', pose: 'point' },
      chart: SOL_2024,
      text: 'In the week to 5 August 2024, Bitcoin fell about **19%**. Solana, a smaller coin, fell about **29%**, from $182.57 to $129.70. That’s [[volatility]]: smaller coins usually swing harder, up and down. Bigger moves mean bigger chances, and bigger losses.',
      // The math (owner 2026-11-17), from SOL_2024's closes: 52.87 ÷ 182.57 = 0.2896; Bitcoin's
      // 66,757.7 → 53,988.2: 12,769.5 ÷ 66,757.7 = 0.1913
      math: {
        who: 'tick',
        steps: [
          { label: 'Price fall', sum: '182.57 − 129.70 = 52.87' },
          { label: 'Divide by the start', sum: '52.87 ÷ 182.57 = 0.290' },
          { label: 'As a percent', sum: '0.290 × 100 = 29.0%' },
        ],
        answer:
          'Solana fell about **29%**. The same three steps for Bitcoin ($66,758 → $53,988) give about **19%**.',
      },
      more: { article: 'price-swings', section: 'volatility' },
    },
    {
      title: 'Big swings, big risks',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Fast swings attract people who promise quick riches. Some coins are hyped only to be dumped on newcomers (a [[rug pull|rug-pull]]), and some are outright scams. Rule of thumb: if someone promises a sure thing, it isn’t one. Lesson 3 shows you how to spot the tricks.',
    },
  ],
  // Your call follows the long-short-or-stay-out quiz
  momentAfter: 13,
  moment: {
    question: 'You’re about to open your first trade. Which is the best habit?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: [
      'Decide when you’d buy, when you’d sell, and why, before you click',
      'Click first, then watch how it feels',
      'Copy whatever the chart did yesterday',
    ],
    correct: 0,
    explain:
      'Deciding the when and the why in advance is what turns a guess into a plan. It’s also what stopped you from panicking in the August example.',
  },
  // The quizzes sit between the cards (owner 2026-11-16)
  checks: [],
  notePrompt: 'One sentence: what will your plan say before your next trade?',
  teaser: 'Next: where Bitcoin came from, and how thousands of computers agree on one record.',
  canDo: [],
  // Owner 2026-11-16: four lines have no article yet (plain text until they're written)
  recap: {
    title: 'What you learned',
    points: [
      { text: 'You can profit when a price rises or falls.' },
      { text: 'Buy to own; sell to cash in, cut a loss, or go short.' },
      { text: 'Long: buy now, sell later. Short: win when the price falls.' },
      { text: 'Closing a position makes the result real.' },
      {
        text: 'Crypto never closes, and smaller coins swing harder.',
        article: 'price-swings',
        section: 'volatility',
      },
    ],
    highlight: { text: 'Decide when and why before you click.' },
  },
  next: 'lesson-ownership',
  access: FREE,
};

// ─── Lesson 2 — What is Bitcoin? ─────────────────────────────────────────────
// Owner 2026-11-08: split from Lesson 1. It answers Lesson 1's cliffhanger (many notebooks), then
// what makes bitcoin yours. A term first taught in Lesson 1 says so in the card's words.

/** Lesson 2's length: its stated objective says it too */
const LESSON_02_MINUTES = 9;

// ─── Lesson 2 — Money nobody controls (rewritten 2026-11-16) ─────────────────

const lessonOwnership: Lesson = {
  // The id stays, as accounts store it (it held "what makes coins yours" until the rewrite)
  id: 'lesson-ownership',
  number: 2,
  // Owner 2026-11-16: our own title
  title: 'Money nobody controls',
  stage: 'Getting started',
  minutes: LESSON_02_MINUTES,
  // Rewritten 2026-11-16 (and everyone's progress reset): today's screens are steps 61 on, past
  // its earlier versions' 1–20 and 21–40
  stepBase: 60, // the SDK's LESSON_FIRST_STEPS − 1 (see the note above Lesson 1)
  tryWidget: 'block-chain',
  tryIntro:
    'Your turn: change a number in an old block and watch what happens to every block after it.',
  cards: [
    {
      // Block 0, created 3 January 2009; its coinbase text: "The Times 03/Jan/2009 Chancellor on brink
      // of second bailout for banks" (mempool.space/block/0; fact-checked 2026-11-16)
      title: 'A headline in the first block',
      art: 'bitcoin',
      beats: [
        { kind: 'kicker', text: '3 January 2009 · The first block' },
        {
          kind: 'headline',
          text: 'Bitcoin’s very first block carries a newspaper headline.',
          emphasis: 'newspaper headline',
        },
        {
          kind: 'fact',
          text: '“Chancellor on brink of second bailout for banks”, from The Times that morning.',
        },
        {
          kind: 'headline',
          text: 'Someone wrote it into the record on purpose. Why?',
          emphasis: 'Why?',
        },
        {
          kind: 'fact',
          text: `In the next ${LESSON_02_MINUTES} minutes: why Bitcoin exists, how thousands of computers keep one record, and what makes it different.`,
        },
      ],
    },
    {
      title: 'From the price to the thing',
      presenter: { who: 'tick', mood: 'curious', pose: 'stand' },
      lines: [
        {
          speaker: 'tick',
          text: 'In Lesson 1 I traded Bitcoin’s price. But what is the thing I was trading?',
        },
        {
          speaker: 'tock',
          text: 'Money that nobody controls. To see why anyone wanted that, go back to 2008.',
        },
      ],
    },
    {
      // Lehman Brothers, founded 1850, filed for bankruptcy on 15 September 2008 (bitcoin-story)
      title: '2008: trust broke',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'In September 2008 Lehman Brothers, a bank founded in 1850, collapsed. Others nearly followed. Governments rushed to rescue the banks with taxpayers’ money and newly created money. Many people asked a hard question: if the people in charge of money can get it this wrong, why must we trust them?',
    },
    {
      // The paper is dated 31 October 2008 (bitcoin.org/bitcoin.pdf); block 0 was created on 3 January
      // 2009 and the network launched on 9 January (fact-checked 2026-11-16)
      title: 'A paper, then a block',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'On 31 October 2008 someone called **Satoshi Nakamoto** shared a short paper: *Bitcoin: A Peer-to-Peer Electronic Cash System*. Money that people send each other directly, with no bank in the middle. On 3 January 2009 the first block was created, with that newspaper headline inside. Nobody knows who Satoshi is.',
      more: { article: 'bitcoin-story', section: 'timeline' },
    },
    {
      title: 'One record, many copies',
      art: 'ledger',
      presenter: { who: 'tock', mood: 'smile', pose: 'point' },
      text: 'Picture a class score sheet. Instead of one teacher keeping it, every pupil has a copy on their laptop. Change your own copy and it won’t match the others, so nobody accepts it. Bitcoin works like that: one [[ledger]] of every payment, copied on thousands of computers called [[nodes|node]].',
      lines: [
        { speaker: 'tick', text: 'So there’s no one teacher to bribe.' },
        { speaker: 'tock', text: 'Exactly. And no one teacher to lose the sheet.' },
      ],
      more: { article: 'bitcoin-network', section: 'three-jobs' },
    },
    {
      title: 'Sending bitcoin',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'When you send bitcoin, your wallet signs the payment with your private key, a secret that only its holder can use, a bit like a signature nobody else can copy. Then it shares the payment with the network. Nodes pass it on to each other, and within seconds thousands of computers have seen it.',
    },
    {
      title: 'Two checks, then a block',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'Nodes make two key checks: is the signature really yours, and do you still have those coins, not already spent? A payment that fails is dropped. [[Miners|mining]] then pick waiting payments, mostly by fee, and bundle them into a **block**, a new page of the ledger, on average every 10 minutes.',
      more: { article: 'bitcoin-network', section: 'checks' },
    },
    {
      // Proof of work (white paper §4, §11): costly to redo, not impossible (fact check 2026-11-16)
      title: 'Sealed by hard work',
      art: 'sealBroken',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      text: 'Each block is sealed with a code that took huge computing work to find. Change one number in an old block and the code changes. To fake it, you’d have to redo that work for the block and every block after it, faster than all the other miners together. Practically, nobody can.',
      more: { article: 'bitcoin-story', section: 'mining' },
    },
    {
      title: 'The hash links the chain',
      art: 'hashChain',
      presenter: { who: 'tock', mood: 'smile', pose: 'point' },
      text: 'Every block carries the **hash** of the block before it: a short code that works like a fingerprint. Change anything in an earlier block and its fingerprint changes, so the next block no longer matches, and the next. That’s why it’s called a [[blockchain]].',
      more: { article: 'bitcoin-network', section: 'blocks' },
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'order',
        question: 'Put a payment’s journey in order.',
        steps: [
          'You sign the payment',
          'Nodes check it',
          'It goes into a block',
          'The block is sealed and linked to the block before',
          'Every copy of the ledger adds the block',
        ],
        options: [],
        correct: 0,
        explain:
          'Sign, check, bundle, seal, share. No one in the middle approves it: the network does.',
      },
    },
    {
      title: 'No one in charge',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'That’s what [[decentralized]] means: no one in charge. No bank can freeze the ledger and no single company can switch it off. There will never be more than 21 million bitcoin, nobody can print more, and anyone can read the whole ledger. Changing the rules needs most of the network to adopt the change.',
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'match',
        question: 'Match each part of the network to its job.',
        pairs: [
          { term: 'Node', meaning: 'Keeps a full copy and checks payments' },
          { term: 'Miner', meaning: 'Bundles payments into a new block' },
          { term: 'Hash', meaning: 'Links each block to the one before' },
          { term: 'Signature', meaning: 'Proves the owner approved the payment' },
        ],
        options: [],
        correct: 0,
        explain:
          'Nodes check, miners bundle, the hash links, and your signature proves it’s yours.',
      },
    },
    {
      title: 'No borders',
      presenter: { who: 'tick', mood: 'surprised', pose: 'stand' },
      text: 'Bitcoin follows the same rules everywhere. Sending it from Lisbon to Lagos works like sending it next door: no bank holidays, no opening hours. The network itself has no borders.',
    },
    {
      title: 'Liquidity, briefly',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'How easily you can buy or sell something without moving its price is called [[liquidity]]. Bitcoin has lots of buyers and sellers, so it usually trades smoothly. Smaller coins have fewer, and prices jump more. Lesson 3 shows what that looks like.',
    },
    {
      title: 'Money that runs code',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      text: 'Bitcoin is mostly money. Other networks let people write small programs on top: rules that run by themselves, like “pay this person when that happens”. That’s why those networks are called programmable. Code can have bugs, though, so new and clever doesn’t mean safe.',
    },
    {
      // EIP-721: the token points to metadata, usually off-chain (fact check 2026-11-16)
      title: 'NFTs, briefly',
      presenter: { who: 'tock', mood: 'calm', pose: 'stand' },
      text: 'An NFT is a unique token on a blockchain, often linked to a digital ticket or a piece of art. The token usually points to the item rather than holding it, and holding it doesn’t always mean you own the item or its copyright. Like any collectible, its price is whatever someone will pay, and that can be nothing.',
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'match',
        question: 'Match each feature of Bitcoin to what it means.',
        pairs: [
          { term: 'Decentralized', meaning: 'No one is in charge' },
          { term: 'Fixed supply', meaning: 'Never more than 21 million' },
          { term: 'Open to check', meaning: 'Anyone can read the ledger' },
          { term: 'Borderless', meaning: 'The same rules in every country' },
        ],
        options: [],
        correct: 0,
        explain:
          'Together they make money that no one controls, no one can print, and anyone can check.',
      },
    },
  ],
  momentAfter: 15,
  moment: {
    context:
      'Your friend’s copy of the ledger says you paid Leo twice. Thousands of other copies say once.',
    question: 'Which do you trust?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: [
      'The thousands of copies that agree',
      'Your friend’s copy: they’re your friend',
      'Neither: ask a bank',
    ],
    correct: 0,
    explain:
      'Every copy checks the same rules, so one that disagrees is wrong or edited. When thousands of independent copies agree, that’s the ledger. No bank needed, and that’s the whole point.',
  },
  // The quizzes sit between the cards (owner 2026-11-16)
  checks: [],
  notePrompt: 'In your own words: why does Bitcoin need thousands of copies?',
  teaser: 'Next: why prices swing so hard, and how to spot a trap.',
  canDo: [],
  // Three plain lines (owner 2026-11-17: the staged birth of Bitcoin dropped after the makeover)
  recap: {
    title: 'Why Bitcoin exists',
    points: [
      {
        text: 'Bitcoin keeps one ledger, copied on thousands of computers.',
        article: 'bitcoin-network',
        section: 'three-jobs',
      },
      {
        text: 'Nodes check every payment, and blocks are linked by their hash.',
        article: 'bitcoin-network',
        section: 'blocks',
      },
      {
        text: 'No one is in charge: the network agrees.',
        article: 'bitcoin-story',
        section: 'timeline',
      },
    ],
  },
  next: 'lesson-02',
  access: FREE,
};

/** Lesson 3's length: its cold open says it */
const LESSON_03_MINUTES = 9;

const ETF_2024: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-01-23',
  bars: 40,
  markers: [
    { date: '2024-01-10', text: 'Approved', position: 'above' },
    { date: '2024-01-23', text: '−14.5%', position: 'below' },
  ],
  freezeAt: '2024-01-10',
  label:
    'Bitcoin daily candles from mid December 2023 to 10 January 2024; once answered, on to 23 January, about 15% lower.',
  fallback: 'etf',
};

// Bybit BTCUSDT perpetual daily: 19 May 2021 open 42,903.5, low 28,801 (−32.9%), close 36,727;
// 20 May +10.3% (36,727 → 40,500.5); 24 May +12.0% (34,658 → 38,817)
const MAY_2021: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2021-05-26',
  bars: 17,
  markers: [
    { date: '2021-05-19', text: 'Low $28,801', position: 'below' },
    { date: '2021-05-24', text: '+12.0%', position: 'above' },
  ],
  label:
    'Bitcoin daily candles from 10 to 26 May 2021: a long fall on 19 May to a low of $28,801, then days that rose by 10% and 12%.',
  fallback: 'swings',
};

// The halving, 20 April 2024 (block 840,000): 19 Apr closed 63,774.8; 1 May 58,298.5 (the lowest close
// after it); 20 May 71,436.9 (fact-checked 2026-11-16)
const HALVING_2024: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-05-31',
  bars: 61,
  markers: [
    { date: '2024-04-20', text: 'Halving', position: 'above' },
    { date: '2024-05-01', text: '$58,299', position: 'below' },
    { date: '2024-05-20', text: '$71,437', position: 'above' },
  ],
  label:
    'Bitcoin daily candles from April to May 2024: the halving on 20 April, a fall to $58,299 by 1 May, then a rise to $71,437 by 20 May.',
  fallback: 'swings',
};

// FTX halted withdrawals on 8 Nov 2022: 7 Nov closed 20,582.5, 9 Nov 15,891.5 (−22.8%)
const FTX_2022: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2022-11-21',
  bars: 21,
  markers: [
    { date: '2022-11-08', text: 'FTX in trouble', position: 'above' },
    { date: '2022-11-09', text: '$15,892', position: 'below' },
  ],
  label:
    'Bitcoin daily candles from 1 to 21 November 2022: a fall from $20,583 on 7 November to $15,892 on 9 November as FTX stopped paying out.',
  fallback: 'swings',
};

// 13 Apr 2021 closed 63,587.5 (a record close then); 20 Jul 2021 closed 29,765 (−53%); back above
// on 19 Oct 2021
const PEAK_2021: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2021-07-31',
  bars: 122,
  markers: [
    { date: '2021-04-13', text: '$63,588', position: 'above' },
    { date: '2021-07-20', text: '$29,765', position: 'below' },
  ],
  label:
    'Bitcoin daily candles from April to July 2021: a record close of $63,588 on 13 April, then $29,765 on 20 July.',
  fallback: 'swings',
};

// ─── Lesson 3 — News, swings and traps (rewritten 2026-11-16) ────────────────

const lesson02: Lesson = {
  // The id stays, as accounts store it (Lesson 3 since 2026-11-08)
  id: 'lesson-02',
  number: 3,
  // Owner 2026-11-16: our own title
  title: 'News, swings and traps',
  stage: 'Getting started',
  minutes: LESSON_03_MINUTES,
  // Rewritten 2026-11-16 (and everyone's progress reset): today's screens are steps 61 on; the
  // versions before used 1–40 and 41–60
  stepBase: 60, // the SDK's LESSON_FIRST_STEPS − 1 (see the note above Lesson 1)
  tour: 'primer',
  tryIntro:
    'Now read the real chart: tap the price (the last deal), then two candles. We’ll tell you when each is done. Your 10,000 USDT of practice money waits in the account panel under the chart.',
  cards: [
    {
      title: 'One bitcoin for $8,200',
      art: 'flashCrash',
      beats: [
        { kind: 'kicker', text: '21 October 2021 · Binance.US' },
        {
          kind: 'headline',
          text: 'For a moment, one bitcoin sold for $8,200.',
          emphasis: '$8,200',
        },
        {
          kind: 'fact',
          text: 'A minute earlier it cost more than $65,000. On other exchanges it barely moved.',
        },
        {
          kind: 'headline',
          text: 'Nothing was hacked. One trader’s program sold far too much, far too fast.',
        },
        {
          kind: 'fact',
          text: `In the next ${LESSON_03_MINUTES} minutes: why prices swing so hard, what moves them, and how to spot a trap.`,
        },
      ],
    },
    {
      title: 'Why so much?',
      presenter: { who: 'tick', mood: 'curious', pose: 'stand' },
      lines: [
        { speaker: 'tick', text: 'Lesson 1 said prices move. Why do they move so much?' },
        {
          speaker: 'tock',
          text: 'News, hype, thin markets, and sometimes a trap. Let’s take them one by one.',
        },
      ],
    },
    {
      title: 'Big swings, both ways',
      presenter: { who: 'tick', mood: 'frank', pose: 'stand' },
      chart: MAY_2021,
      text: 'Swings like these are [[volatility]] (Lesson 1). On 19 May 2021 bitcoin fell from about $42,900 to as low as $28,800, then closed near $36,700. It swings up just as hard, which is why no one can time it. So size for the fall: only put in what you could watch drop by a third.',
      // The math (owner 2026-11-17), from MAY_2021: (42,903.5 − 28,801) ÷ 42,903.5 = 0.3287. Kept
      // (reviewed 2026-11-17): the text never states the percent, and the sum is where "a third", the
      // sizing rule's number, comes from
      math: {
        who: 'tock',
        steps: [
          { label: 'Price fall', sum: '42,900 − 28,800 = 14,100' },
          { label: 'Divide by the start', sum: '14,100 ÷ 42,900 = 0.329' },
          { label: 'As a percent', sum: '0.329 × 100 = 32.9%' },
        ],
        answer: 'At its low that day, bitcoin was down about **33%**: a third.',
      },
      more: { article: 'price-swings', section: 'size' },
    },
    {
      title: 'News moves it, fast',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'Crypto trades all day, every day, so news hits the price within minutes, even at 3 a.m. A new law, an exchange in trouble, a big company buying: people react, and the price moves before most of us have read the headline.',
      more: { article: 'price-swings', section: 'news' },
    },
    {
      title: 'Same news, either way',
      presenter: { who: 'tock', mood: 'thinking', pose: 'point' },
      chart: HALVING_2024,
      text: 'About every four years, the reward for each new block halves: the halving. It happened on 20 April 2024, expected for years. After the 19 April close at $63,775, the price fell to $58,299 by 1 May, then rose to $71,437 by 20 May. Expected news, both directions.',
    },
    {
      title: 'The power of hype',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Hype is a crowd getting excited at once: posts, videos, “everyone’s buying”. It can push a price up fast, and it can vanish just as fast, leaving late buyers with the loss. When you feel you must buy *right now*, that’s the hype talking: a warning sign. Your plan should do the deciding.',
    },
    {
      title: 'Thousands of deals, one candle',
      art: 'candleAnatomy',
      presenter: { who: 'tock', mood: 'smile' },
      text: 'Thousands of deals happen every minute, so charts sum them up. A [[candle]] covers one slice of time: its body runs from the first deal (the open) to the last (the close), and thin wicks reach the highest and lowest deals. Green means it closed higher than it opened; red, lower. Crypto never closes, so new candles keep coming, nights and holidays too. A candle shows what happened, never what comes next.',
      more: { article: 'price-swings', section: 'candles' },
    },
    {
      title: 'A market shock',
      presenter: { who: 'tock', mood: 'frank', pose: 'point' },
      chart: FTX_2022,
      // No math (owner 2026-11-17, reviewed): the text states the 23% itself (4,691 ÷ 20,582.5 =
      // 0.2279), the sum would be the third identical fall-in-percent in a row, and the card's point is
      // one company shaking the whole market, not the size of the fall
      text: 'In November 2022 FTX, then one of the biggest exchanges, ran into trouble and stopped paying people out. Bitcoin closed at $20,583 on 7 November and at $15,892 two days later, down about 23%. One company’s collapse shook the whole market.',
    },
    {
      title: 'A plan beats panic',
      presenter: { who: 'tick', mood: 'calm', pose: 'stand' },
      lines: [
        { speaker: 'tick', text: 'If I’d held during that, I’d have panicked.' },
        {
          speaker: 'tock',
          text: 'That’s why the plan comes first: your stop, your target, how much you’d risk. Then a shock is something you prepared for, not something that decides for you. And no plan says “hurry in”.',
        },
      ],
    },
    {
      title: 'Up, then down',
      presenter: { who: 'tock', mood: 'frank', pose: 'point' },
      chart: PEAK_2021,
      text: 'On 13 April 2021 bitcoin closed at $63,588, a record close at the time. Three months later, on 20 July, it closed at $29,765, down more than half. People who bought at the top waited about six months to get back to even.',
      // The math (owner 2026-11-17), from PEAK_2021: 33,822.5 ÷ 63,587.5 = 0.5319. Kept (reviewed
      // 2026-11-17): the text says only "more than half", and the sum turns two five-digit closes into
      // the 53% that proves it
      math: {
        who: 'tock',
        steps: [
          { label: 'Price fall', sum: '63,588 − 29,765 = 33,823' },
          { label: 'Divide by the start', sum: '33,823 ÷ 63,588 = 0.532' },
          { label: 'As a percent', sum: '0.532 × 100 = 53.2%' },
        ],
        answer: 'Bitcoin fell about **53%**: more than half.',
      },
    },
    {
      title: 'Thin or deep',
      art: 'staircase',
      presenter: { who: 'tock', mood: 'smile', pose: 'stand' },
      text: 'Remember [[liquidity]] from Lesson 2? Picture buyers and sellers waiting with their prices. When many wait close to the price, the market is **deep**: a big order barely moves it. When few wait, it’s **thin**: a big order runs through them and the price jumps.',
      more: { article: 'exchange-price', section: 'liquidity' },
    },
    {
      title: 'The $8,200 moment',
      presenter: { who: 'tick', mood: 'thinking', pose: 'stand' },
      text: 'Back to 21 October 2021. One program sold a huge amount at once on one exchange. It took the best buyer, then the next, then the next, down a list that ran thin fast. Each deal was lower, and each was “the price” for a moment, until buyers came back.',
    },
    {
      title: 'Bitcoin is deep',
      presenter: { who: 'tock', mood: 'calm', pose: 'stand' },
      text: 'On the big exchanges, Bitcoin is one of the deepest markets in crypto: billions of dollars change hands every day. Smaller coins are thinner, which is one reason they swing harder. Deep doesn’t mean calm, though. It just means one order rarely moves it far.',
      more: { article: 'exchange-price', section: 'small-coins' },
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'match',
        question: 'Match each situation to what usually happens.',
        pairs: [
          {
            term: 'Few buyers waiting near the price',
            meaning: 'A big order moves the price a long way',
          },
          { term: 'Many buyers waiting near the price', meaning: 'A big order barely moves it' },
          {
            term: 'Everyone suddenly wants out',
            meaning: 'Prices fall fast, even in deep markets',
          },
          { term: 'A sudden wave of hype', meaning: 'Prices rise fast, then often fall back' },
        ],
        options: [],
        correct: 0,
        explain: 'Thin markets jump, deep ones absorb. Panic and hype can move even deep markets.',
      },
    },
    {
      title: 'A rug pull',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Some coins are traps from the start. The creators hype a new coin, people buy, the price climbs, and then the creators sell everything at once or make sure buyers can’t sell. The price collapses and the creators vanish with the money. That’s a [[rug pull|rug-pull]] (Lesson 1), a scam.',
      more: { article: 'spot-a-scam', section: 'rug-pull' },
    },
    {
      title: 'Check before you trust',
      art: 'checkCoin',
      presenter: { who: 'tock', mood: 'frank' },
      text: 'Before you trust any coin, check: who runs it, and are they named? Can you actually sell it? Does anyone promise easy or sure profits? A rising price only means people traded. It doesn’t mean the coin is real.',
      more: { article: 'spot-a-scam', section: 'checklist' },
    },
    {
      title: 'Quick check',
      quiz: {
        format: 'order',
        question: 'Put a rug pull’s steps in order.',
        steps: [
          'Creators hype a new coin',
          'People rush to buy',
          'The price climbs',
          'The creators sell everything',
          'The price collapses',
        ],
        options: [],
        correct: 0,
        explain:
          'Hype, buying, a climb, the creators cash out, the collapse. The first two steps are your chance to check and stay out.',
      },
    },
  ],
  // Your call follows the halving card (owner-approved outline: screen 6)
  momentAfter: 4,
  moment: {
    context:
      '10 January 2024: the US approves the first funds that hold Bitcoin directly, widely called the year’s biggest crypto news. The chart stops on that day.',
    question: 'What happened to the price next?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['It went up', 'It went down', 'No one could know in advance'],
    correct: 2,
    explain:
      'It fell about 15% in two weeks, but that’s hindsight: on the day, no one could know, and the halving went both ways. Careful traders plan for both directions before they act.',
    chart: ETF_2024,
  },
  // The quizzes sit between the cards (owner 2026-11-16)
  checks: [],
  notePrompt: 'Which check will you always do before buying a new coin?',
  // No teaser and no way on (review 2026-11-16): Lesson 1's Try already runs the buy and sell
  // tours, so the path, not this close, shows what comes next
  canDo: [],
  recap: {
    title: 'What moves a price',
    points: [
      {
        text: 'Prices swing hard, both ways: size for the fall.',
        article: 'price-swings',
        section: 'size',
      },
      {
        text: 'News, shocks and hype move prices, often fast.',
        article: 'price-swings',
        section: 'news',
      },
      {
        text: 'Thin markets jump; deep ones absorb.',
        article: 'exchange-price',
        section: 'liquidity',
      },
      {
        text: 'Check who runs a coin and whether you can sell it.',
        article: 'spot-a-scam',
        section: 'checklist',
      },
    ],
    highlight: { text: 'Your plan decides, not the headline.' },
  },
  access: FREE,
};

export const LESSONS: readonly Lesson[] = [lesson01, lessonOwnership, lesson02];

export function getLesson(id: LessonId): Lesson {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}

/**
 * Who stands beside a question: the guide who asks it, from the question through the answer. The
 * right answer gets their grin; "Not quite" gets them calm, never sad or worried (red is never the
 * villain).
 */
/**
 * A fixed shuffle for Drag and drop and Match boxes: the same order on every visit (seeded by the
 * question's words), and never the right order itself, so nothing is answered before a move.
 */
export function shuffledOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Still in the right order (it happens for small n): turn it by one
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

export function questionGuide(q: LessonQuestion, answer: number | undefined): Presenter {
  const asker = q.presenter ?? { who: 'tock', mood: 'thinking' };
  if (answer === undefined) return asker;
  // Owner 2026-11-08: the guide who asks stays through the answer: a grin when right, calm when not
  return { who: asker.who, mood: answer === q.correct ? 'grin' : 'calm' };
}

// ─── Screens ─────────────────────────────────────────────────────────────────

export type LessonScreen =
  | { kind: 'card'; index: number }
  | { kind: 'moment' }
  | { kind: 'try' }
  | { kind: 'check'; index: number }
  | { kind: 'summary' }
  | { kind: 'close' };

/**
 * The tour a screen hands over: the Try screen's tour, or a card's practice trade (owner
 * 2026-11-16). The one place that says which tours are a lesson's own
 */
export function screenTour(lesson: Lesson, screen: LessonScreen | undefined): TourId | undefined {
  if (screen?.kind === 'try') return lesson.tour;
  if (screen?.kind === 'card') return lesson.cards[screen.index].practice?.tour;
  return undefined;
}

/** The question a screen asks: the moment, a check, or a quiz card (null for any other screen) */
export function screenQuestion(
  lesson: Lesson,
  screen: LessonScreen | undefined
): LessonQuestion | null {
  if (screen?.kind === 'moment') return lesson.moment;
  if (screen?.kind === 'check') return lesson.checks[screen.index] ?? null;
  if (screen?.kind === 'card') return lesson.cards[screen.index].quiz ?? null;
  return null;
}

/** A tour one of the lesson's screens hands over */
export function lessonOwnsTour(lesson: Lesson, tour: TourId): boolean {
  return lessonScreens(lesson).some((screen) => screenTour(lesson, screen) === tour);
}

/**
 * The lesson as a run of screens, in order — what the sheet walks through and what the funnel
 * numbers (`lesson-02.<n>`, 1-based): cards, the moment, "try it", each question, the summary, the end.
 */
export function lessonScreens(lesson: Lesson): LessonScreen[] {
  const cards = lesson.cards.map((_, index) => ({ kind: 'card' as const, index }));
  const split = Math.min(lesson.momentAfter ?? cards.length - 1, cards.length - 1) + 1;
  return [
    ...cards.slice(0, split),
    { kind: 'moment' as const },
    ...cards.slice(split),
    { kind: 'try' as const },
    ...lesson.checks.map((_, index) => ({ kind: 'check' as const, index })),
    // Owner 2026-11-08: the summary, then the end with the journal line, the rating and the way on
    { kind: 'summary' as const },
    { kind: 'close' as const },
  ];
}

/** The funnel's step id for a screen (0-based): `lesson-ownership.3`, or `lesson-01.23` past a `stepBase` */
export function lessonStepId(lesson: Lesson, screen: number): string {
  return `${lesson.id}.${lessonStepNumber(lesson, screen)}`;
}

/** A screen's funnel step number: the server's progress `step`, which tells the versions apart */
export function lessonStepNumber(lesson: Lesson, screen: number): number {
  return (lesson.stepBase ?? 0) + screen + 1;
}

/** A finish's step: the lesson's last screen, the one rule every finish sends */
export function lessonFinishStep(lesson: Lesson): number {
  return lessonStepNumber(lesson, lessonScreens(lesson).length - 1);
}

/** The screen (0-based) a step number stands for today, or null for an earlier version's step */
export function lessonScreenOfStep(lesson: Lesson, step: number): number | null {
  const screen = step - (lesson.stepBase ?? 0) - 1;
  return screen >= 0 && screen < lessonScreens(lesson).length ? screen : null;
}

/**
 * The terms a card marks, in its text, its guides' lines and its analogy (all open the peek since
 * 2026-11-17):
 * the two-terms rule, and where a concept is taught (`learn/graph.ts`)
 */
export function cardTermIds(card: LessonCard): string[] {
  return [
    card.text ?? '',
    ...(card.lines ?? []).map((l) => l.text),
    card.analogy?.text ?? '',
  ].flatMap(termIds);
}

/** Every word in a card, for the 80-word rule (a term counts as the words of its label) */
export function cardWords(card: LessonCard): number {
  const text = [
    plainText(card.text ?? ''),
    ...(card.lines ?? []).map((l) => plainText(l.text)),
    // An analogy is prose, so it counts; a math breakdown's numbered sums don't (a worked figure)
    plainText(card.analogy?.text ?? ''),
    ...(card.meet ? [card.meet.tick, card.meet.tock, card.meet.lead, ...card.meet.list] : []),
    ...(card.points ?? []).flatMap((p) => [p.label, p.text]),
    ...(card.beats ?? []).map((b) => b.text),
  ].join(' ');
  return text.split(/\s+/).filter((w) => /\w/.test(w)).length;
}
