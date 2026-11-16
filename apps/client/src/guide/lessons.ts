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
import { plainText } from '@/learn/terms';
import howellsLandfill from '@/assets/lessons/howells-landfill.jpg';
import pizzaDay from '@/assets/lessons/pizza-day.jpg';
import type { TourId, PracticeTourId } from './tours';

export const LESSON_IDS = ['lesson-01', 'lesson-ownership', 'lesson-02'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export function isLessonId(value: string): value is LessonId {
  return (LESSON_IDS as readonly string[]).includes(value);
}

/** The pictures `LessonArt` can draw, all from our own tokens */
export type LessonArtId =
  | 'money'
  | 'notebook'
  | 'oneNora'
  | 'ledger'
  /** Lesson 2's Bitcoin card: the mark rising with its burst */
  | 'bitcoin'
  | 'mailbox'
  | 'stamp'
  | 'keyHolders'
  | 'custody'
  | 'queues'
  | 'tesla'
  | 'etf'
  /** Lesson 3's cold open without a photo: Bybit's quiet minute candles, and Binance.US's wick */
  | 'flashCrash'
  /** A thin queue of buy offers eaten step by step */
  | 'staircase'
  | 'candleAnatomy'
  | 'swings'
  | 'checkCoin';

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
 * history (Bybit's USDT perpetual, which reaches back before 2021 — spot doesn't), with markers.
 */
export interface ChartScene {
  /** Bitcoin, or Solana for the "smaller coins swing harder" comparison (Lesson 1, owner 2026-11-16) */
  symbol: 'BTCUSDT' | 'SOLUSDT';
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
   * line (Lesson 2's landfill, 2026-11-12): every photo states its attribution decision
   */
  credit: string | null;
}

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
  /** Bold-labelled points under the text ("**Print coins.** Write …") */
  points?: CardPoint[];
  /** A Read more under the card, to the article that goes deeper (owner 2026-11-12) */
  more?: { article: ArticleId; section?: string };
  /** The Next button's words: the question the next card answers (default "Continue") */
  nextLabel?: string;
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
/**
 * The birth of Bitcoin, staged on a summary (`GenesisReveal`, owner 2026-11-12): after the problem
 * lines, each story line fades in and out in turn, then the Bitcoin mark, with the highlight under it
 */
export interface BirthStory {
  /** Each line in turn; `emphasis`, a part of its text, is set apart (Satoshi's name) */
  lines: { text: string; emphasis?: string }[];
}

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
 * `pairs` term with its meaning. Those two have no `options` and `correct: 0`: the stored answer is
 * 0 when every slot or pair was right, 1 otherwise.
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
    genesis?: BirthStory;
  };
  /** What the close offers next: the next lesson, or a tour */
  next?: LessonNext;
  access: Entitlement;
  /**
   * Added to the screen number in the funnel's step ids (`lesson-01.21` = screen 1), so steps
   * stored before the lesson's screens changed aren't counted as today's screens
   */
  stepBase?: number;
}

export type LessonNext = { kind: 'lesson'; id: LessonId } | { kind: 'tour'; id: TourId };

// ─── Lesson 1 — Up, down and your first trade ────────────────────────────────
// From the owner's notes on Kevin and Colt's lectures (Drive docs 01–06), rewritten in our voice;
// each card's terms open the matching article (learn/articles.ts). Owner 2026-10-23: the Pizza Day
// hook, and "Try it" is Nora cheating in the notebook, inside the sheet, on every screen size.

/** Lesson 1's length: its card, the guides' meeting and the welcome card all say it */
const LESSON_01_MINUTES = 9;

/**
 * The birth of Bitcoin, staged on a summary (owner 2026-11-12). Lesson 1 told it until the rewrite
 * of 2026-11-16; Lesson 2 (why Bitcoin exists) tells it now. 2008: banks failed and governments and
 * central banks rescued them; Lehman Brothers, founded 1850, filed for bankruptcy on 15 September
 * 2008; the Bitcoin paper is dated 31 October 2008 (bitcoin-story).
 */
export const BITCOIN_BIRTH: BirthStory = {
  lines: [
    { text: 'However, for most people there was no other choice.' },
    { text: 'In 2008, that trust broke: Lehman Brothers, a 158-year-old bank, collapsed.' },
    { text: 'Banks failed, and governments rushed to rescue them with newly printed money.' },
    {
      text: 'Then someone called Satoshi Nakamoto proposed money that no one holds or controls.',
      emphasis: 'Satoshi Nakamoto',
    },
  ],
};

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

// The worked long: 2 Oct 2023 closed 27,484.1; 13 Mar 2024 closed 73,133.0
const LONG_2023: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-03-20',
  bars: 178,
  markers: [
    { date: '2023-10-02', text: 'Buy $27,484', position: 'below' },
    { date: '2024-03-13', text: 'Sell $73,133', position: 'above' },
  ],
  label:
    'Bitcoin daily candles from late September 2023 to March 2024: a buy on 2 October at $27,484, a sale on 13 March at $73,133.',
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

const lesson01: Lesson = {
  id: 'lesson-01',
  number: 1,
  // Owner 2026-11-16: the rewrite (trading basics); our own title
  title: 'Up, down and your first trade',
  stage: 'Getting started',
  minutes: LESSON_01_MINUTES,
  // Rewritten 2026-11-16 (and everyone's progress reset): today's screens are steps 61 on; the
  // versions before used 1–20 and 21–40
  stepBase: 60,
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
      nextLabel: 'Unlock how trading works',
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
      nextLabel: 'Show me the up-or-down trick',
    },
    {
      title: 'Up or down, you can win',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'Over time a price climbs, slides or drifts sideways. Most people think you only win when it climbs. Not quite. Traders can profit either way, as long as they picked the right side before the move.',
      lines: [
        { speaker: 'tick', text: 'Wait, I can make money when things go down?' },
        {
          speaker: 'tock',
          text: 'You can. You can also lose money when things go up. Same coin, two sides.',
        },
      ],
      nextLabel: 'Which button is which?',
    },
    {
      title: 'Buy and Sell',
      presenter: { who: 'tock', mood: 'smile', pose: 'point' },
      text: 'Think of it like a shop. **Buy** means you pay to own some coin, hoping it’s worth more later. **Sell** means you hand over coin for money: to cash in, to cut a loss, or (as you’ll see) to bet on a fall.',
      practice: { tour: 'practice-buy', label: 'Try a buy on the real chart' },
      nextLabel: 'Let’s practise',
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
      nextLabel: 'One more',
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
      nextLabel: 'What does “long” mean?',
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
      nextLabel: 'Show me a real one',
    },
    {
      title: 'A real long',
      presenter: { who: 'tock', mood: 'curious', pose: 'point' },
      chart: LONG_2023,
      text: 'Say you bought $1,000 of Bitcoin on the spot market at the close on 2 October 2023, at $27,484. Over the winter the price climbed. On 13 March 2024 you sold at the close: $73,133.',
      nextLabel: 'So how much is that?',
    },
    {
      title: 'The result',
      presenter: { who: 'tock', mood: 'grin', pose: 'stand' },
      text: 'Your $1,000 became about **$2,661**. That’s around **$1,661 profit**. The exchange takes a small fee on each trade, about $2 here. Still a very good trade.',
      lines: [
        { speaker: 'tick', text: 'Easy! I’ll just do that every time.' },
        {
          speaker: 'tock',
          text: '[[Hindsight|hindsight]] makes every chart look easy. Nobody knew in October.',
        },
      ],
      nextLabel: 'What does selling actually do?',
    },
    {
      title: 'Close it to keep it',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'While you hold a position, the profit on screen is only on paper: it changes with every tick. It becomes real when you **close** the position. In our app that’s the Close button on your position row. Until then, it can still shrink.',
      nextLabel: 'Can I win when it falls?',
    },
    {
      title: 'Going short',
      presenter: { who: 'tock', mood: 'calm', pose: 'stand' },
      text: 'Going **short** is the mirror move: you win when the price falls. In our app you short on the USDT Perpetual market: you open a contract that gains as the price drops. No coin changes hands; you put up USDT as margin, and the difference is paid in USDT.',
      lines: [
        { speaker: 'tick', text: 'Selling something I don’t own feels illegal.' },
        { speaker: 'tock', text: 'It’s a contract. Very normal. Very risky. Hold that thought.' },
      ],
      practice: { tour: 'practice-short', label: 'Try a short on the real chart' },
      nextLabel: 'Show me a real one',
    },
    {
      title: 'A real short',
      presenter: { who: 'tock', mood: 'curious', pose: 'point' },
      chart: SHORT_2021,
      text: 'On 10 November 2021 Bitcoin hit a then-record near $69,000 and closed at $64,894. Say you shorted 0.01 BTC there. Over the next months the price slid. On 18 June 2022 you bought it back at the close: $18,965.',
      nextLabel: 'And the result?',
    },
    {
      // A real warning (the lesson rules): a short's loss has no ceiling; liquidation on a perpetual
      title: 'The catch',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Your short opened at about $649 and closed at about $190: roughly **$459 profit**, before fees and funding. Now the catch: a price can only fall to zero, but it can rise without a ceiling. On a perpetual, the exchange closes a losing short once your margin is gone (liquidation). Shorts need a stop, always.',
      nextLabel: 'Ready for a tricky one?',
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
      nextLabel: 'Your call',
    },
    {
      title: 'The market never sleeps',
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
      nextLabel: 'Do all coins move the same?',
    },
    {
      title: 'Smaller coins swing harder',
      presenter: { who: 'tock', mood: 'frank', pose: 'point' },
      chart: SOL_2024,
      text: 'In the week to 5 August 2024, Bitcoin fell about **19%**. Solana, a smaller coin, fell about **29%**. That’s [[volatility]]: smaller coins usually swing harder, up and down. Bigger moves mean bigger chances, and bigger losses.',
      more: { article: 'price-swings', section: 'volatility' },
      nextLabel: 'Is that dangerous?',
    },
    {
      title: 'Big swings, big risks',
      presenter: { who: 'tock', mood: 'worried', pose: 'stand' },
      text: 'Fast swings attract people who promise quick riches. Some coins are hyped only to be dumped on newcomers (a [[rug pull|rug-pull]]), and some are outright scams. Rule of thumb: if someone promises a sure thing, it isn’t one. Lesson 3 shows you how to spot the tricks.',
      nextLabel: 'Let me try a trade',
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
  next: { kind: 'lesson', id: 'lesson-ownership' },
  access: FREE,
};

// ─── Lesson 2 — What is Bitcoin? ─────────────────────────────────────────────
// Owner 2026-11-08: split from Lesson 1. It answers Lesson 1's cliffhanger (many notebooks), then
// what makes bitcoin yours. A term first taught in Lesson 1 says so in the card's words.

/** Lesson 2's length: its stated objective says it too */
const LESSON_02_MINUTES = 8;

const lessonOwnership: Lesson = {
  id: 'lesson-ownership',
  number: 2,
  // Owner 2026-11-12: renamed from "Who owns a bitcoin?"
  title: 'What is Bitcoin?',
  stage: 'Getting started',
  minutes: LESSON_02_MINUTES,
  // Owner 2026-11-12: the Bitcoin card went in as card 2, so today's screens are steps 21 on and
  // earlier ones keep 1–20 (Lesson 1 too)
  stepBase: 20,
  tryWidget: 'stamp-check',
  tryIntro: 'Now be Sneaky Sam, a stranger: try to spend Sofia’s bitcoin without her stamp.',
  cards: [
    {
      // Decrypt and DL News, January 2025: in 2013 a hard drive holding the wallet for 8,000 BTC
      // that James Howells mined in 2009 was thrown out by mistake and went to Newport's landfill;
      // the High Court refused his bid to dig it up. No dollar figure: the hindsight rule of card 1
      // of Lesson 1
      title: 'A hard drive in the bin',
      // Owner 2026-11-12: the real photo, no drawing and no guide, as Lesson 1's cold open. The
      // owner confirmed they hold the rights to publish it (docs/APP_LOG.md, "Lesson 2 opens on
      // the real photo"); they gave no credit line, so none is shown
      photo: {
        src: howellsLandfill,
        // The card shows the photo's top (the frame matches Lesson 1's), so the alt names what's in view
        alt: 'A digger on a huge landfill heap; inset, a portrait of James Howells.',
        credit: null,
      },
      beats: [
        { kind: 'kicker', text: '2013 · Newport, Wales' },
        { kind: 'headline', text: 'An old hard drive was thrown out by mistake.' },
        {
          kind: 'headline',
          text: 'On it: the key to 8,000 bitcoin James Howells mined in 2009.',
          emphasis: '8,000 bitcoin',
        },
        {
          kind: 'fact',
          text: 'It went to the landfill. Without that key, nobody can move that bitcoin. Not even him.',
        },
        // Owner 2026-11-12 (the benchmark review): the lesson says what it will teach
        {
          kind: 'fact',
          text: `In the next ${LESSON_02_MINUTES} minutes: what Bitcoin is, how you receive and send it, and why that key is everything.`,
        },
      ],
      nextLabel: 'Unlock what Bitcoin really is',
    },
    {
      // Owner 2026-11-12: the mark from the end of Lesson 1, then what makes Bitcoin different. The
      // 21 million cap comes from Bitcoin's issuance rules (the block reward halves every 210,000
      // blocks; bitcoin.org FAQ); the ledger is public (the public-ledger widget)
      title: 'Money that no one controls',
      art: 'bitcoin',
      presenter: { who: 'tick', mood: 'grin' },
      // Owner 2026-11-12 (the benchmark gaps): the word "decentralized", tappable
      text: 'Bitcoin is [[decentralized]] digital money, with no bank or boss. What makes it different:',
      points: [
        {
          label: 'No one in charge.',
          text: 'No bank, company or government runs it, so nobody can freeze it or change the rules alone.',
        },
        {
          label: 'A fixed supply.',
          text: 'No more than 21 million bitcoin will ever exist. Nobody can print more.',
        },
        {
          label: 'Open to check.',
          text: 'Every payment sits in a public ledger anyone can read.',
        },
        {
          label: 'Yours, with a key.',
          text: 'Whoever holds the key can spend it: no permission needed.',
        },
      ],
      more: { article: 'bitcoin-story' },
      nextLabel: 'So who keeps the ledger?',
    },
    {
      // Owner 2026-11-12: no Nora here (a learner may come back days later), only Lesson 1's point.
      // The buttons from here walk the process: receive, send (and the check), where it is
      title: 'One ledger, thousands of copies',
      art: 'ledger',
      presenter: { who: 'tick', mood: 'grin' },
      text: 'Trusting one record keeper is a risk: whoever holds the only [[ledger]] can change it, freeze it or simply lose it. Bitcoin solves this by keeping copies everywhere. Thousands of computers around the world, called [[nodes|node]], each hold the full ledger and check every new payment. Each page, called a block, is added by miners and sealed to the one before with a fingerprint called a hash, so nobody can quietly rewrite the past.',
      // Owner 2026-11-12: mining here, with its Read more on the story article's mining section
      more: { article: 'bitcoin-story', section: 'mining' },
      nextLabel: 'How do I receive bitcoin?',
    },
    {
      title: 'A mailbox and a key',
      art: 'mailbox',
      presenter: { who: 'tock', mood: 'wink' },
      // Owner 2026-11-12: one payment, Sofia → Leo, runs through the next cards (Lesson 1's friends)
      text: 'Say Sofia wants to pay Leo 2 bitcoin. Leo shares his [[address]], and only his [[private key|private-key]] can spend what arrives there. Think of a mailbox with a lock:',
      points: [
        {
          label: 'Address.',
          text: 'The slot in Leo’s mailbox. Anyone can pay in, so he can safely share it with Sofia, or with anyone.',
        },
        {
          label: 'Private key.',
          text: 'The only key that can spend what’s paid in. Whoever has it controls that bitcoin, so Leo never shares it.',
        },
      ],
      nextLabel: 'How do I send it?',
    },
    {
      title: 'A stamp only you hold',
      art: 'stamp',
      presenter: { who: 'tick', mood: 'curious' },
      text: 'Now Sofia sends. Her wallet stamps “Sofia → Leo, 2” with her private key, a mark only she can make. The payment carries the matching checker, her public key, so every [[node]] can confirm the mark is hers, and that she has 2 bitcoin to send, before it goes into the ledger. Nobody can copy the stamp, and once the nodes accept it, [[miners|mining]] add it to a new block.',
      nextLabel: 'So where is my bitcoin?',
    },
    {
      // Owner 2026-11-12: no coin pictures or "the coins": bitcoin has no coins, a balance is the
      // ledger's entries added up
      title: 'Your bitcoin isn’t in your phone',
      art: 'keyHolders',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'Here’s the surprise: nothing moved, because there are no coins anywhere. The [[blockchain]] just gained a line, “Sofia → Leo, 2”, and a balance is what the payments to and from an address add up to. Your phone holds only the key that spends them, and a list of recovery words backs that key up. Lose the phone but keep the words, and you’re fine. Lose both, like James Howells, and nobody can ever spend that bitcoin again.',
      nextLabel: 'Can someone hold my key for me?',
    },
    {
      // Mt. Gox, Feb 2014: about 850,000 BTC reported missing (learn/articles.ts, "Getting bitcoin")
      title: 'Who holds your key?',
      art: 'custody',
      presenter: { who: 'tick', mood: 'thinking', pose: 'stand' },
      text: 'You don’t have to hold the key yourself. Leave bitcoin on an exchange and it holds the key for you: that’s [[custody]]. It’s handy, and it’s how most people start. But your bitcoin is then only as safe as the company. When Mt. Gox failed in 2014, its customers’ bitcoin went with it. Here, nothing is real bitcoin: your balance is virtual practice money, so nothing is at risk while you learn.',
    },
  ],
  moment: {
    context: 'Your phone falls in the sea. Your recovery words are safe at home.',
    question: 'What happens to your bitcoin?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['It’s gone', 'Restore it on a new phone', 'The exchange refunds it'],
    correct: 1,
    explain:
      'Your bitcoin was never in the phone: it’s recorded on the blockchain. The recovery words rebuild the key on any new phone.',
  },
  checks: [
    {
      question:
        'Someone from “support” asks for your recovery phrase to fix your wallet. What do you do?',
      // A warning, not a punishment: the only place a guide looks worried
      presenter: { who: 'tock', mood: 'worried' },
      options: ['Send it: they’re support', 'Send only half of it', 'Never share it'],
      correct: 2,
      explain:
        'A recovery phrase restores your private keys, and whoever has it controls your bitcoin. Real support never asks for it.',
    },
    {
      question:
        'In 2014 the Mt. Gox exchange collapsed and customers’ bitcoin went missing. What failed?',
      options: ['Bitcoin itself', 'The exchange that held their keys', 'The internet'],
      correct: 1,
      explain:
        'The blockchain kept working. A company that held its customers’ keys failed: the risk of letting someone else hold them.',
    },
    {
      question: 'What can a stranger do with your address?',
      options: ['Send you bitcoin', 'Spend your bitcoin', 'See your private key'],
      correct: 0,
      explain: 'An address is a mailbox slot: anyone can pay in, and only your key opens it.',
    },
  ],
  notePrompt: 'What would you like to understand better about owning bitcoin?',
  teaser: 'Next: who decides what one bitcoin costs, on the real chart.',
  canDo: [
    { text: 'Tell an address from a private key', article: 'mailboxes-keys', section: 'key' },
    { text: 'Say why recovery words stay secret', article: 'mailboxes-keys', section: 'phone' },
    {
      text: 'Explain how nodes know it’s really you',
      article: 'bitcoin-network',
      section: 'checks',
    },
  ],
  next: { kind: 'lesson', id: 'lesson-02' },
  access: FREE,
};

// ─── Lesson 3 — Who sets the price? ──────────────────────────────────────────
// Rebuilt 2026-11-12 to the owner's brief for Lesson 3: a true cold open, the price as people
// (queues, liquidity, candles, news), the moment, then the postponed volatility card and a short
// "check before you trust". Every dated price is checked against Bybit's candles (noted beside it);
// the Binance.US and Squid Game facts against the reporting (CoinDesk, The Block). The spread moved
// to the article and the buy tour's live note.

/** Lesson 3's length: its cold open says it */
const LESSON_03_MINUTES = 8;

const TESLA_2021: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2021-05-20',
  bars: 116,
  markers: [
    { date: '2021-02-08', text: 'Tesla buys', position: 'below' },
    { date: '2021-02-21', text: '$57,459', position: 'above' },
    { date: '2021-05-12', text: 'Tesla stops', position: 'above' },
  ],
  label:
    'Bitcoin daily candles from late January to May 2021: a climb after 8 February, then a sharp fall on 12 May.',
  fallback: 'tesla',
};

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

const lesson02: Lesson = {
  id: 'lesson-02',
  // Lesson 3 since 2026-11-08; the id stays, as accounts store it
  number: 3,
  title: 'Who sets the price?',
  stage: 'Getting started',
  minutes: LESSON_03_MINUTES,
  // Rebuilt on 2026-11-12 (14 screens): today's screens are steps 41 on
  stepBase: 40,
  tour: 'primer',
  tryIntro:
    'Now read the real chart: tap the price (the last deal), then two candles. We’ll tell you when each is done. Your 10,000 USDT of practice money waits in the account panel under the chart.',
  cards: [
    {
      // CoinDesk and The Block, 21 Oct 2021: 11:34 UTC, from about $65,760 to $8,200 and back within
      // the minute, "a bug in their trading algorithm". Bybit's 1-minute candle then: 65,800 → low
      // 64,200 (−2.4%); Bitstamp −2.3%. No photo (owner 2026-11-12): our drawing from Bybit's candles
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
          text: `In the next ${LESSON_03_MINUTES} minutes: who sets the price, why it swings so hard, and how to stay safe while it does.`,
        },
      ],
      // Owner 2026-11-12: every lesson's first button starts with "Unlock"
      nextLabel: 'Unlock who sets the price',
    },
    {
      title: 'Two queues meet',
      art: 'queues',
      presenter: { who: 'tock', mood: 'smile' },
      text: 'An [[exchange]] is a marketplace for coins. Buyers wait in one queue, each saying what they’ll pay; sellers wait in another, saying what they’ll accept. Say Leo, from Lesson 2, will pay $65,000 for a bitcoin, and Sofia will sell one for $65,000. The exchange matches them in a split second, and their deal becomes the number on everyone’s screen: the [[last price|last-price]]. Nobody decides it. The next deal replaces it, day and night.',
      nextLabel: 'So why did it drop to $8,200?',
    },
    {
      // Bybit perpetuals, the 365 days of 2025: median daily (high − low) / open BTCUSDT 2.98%,
      // DOGEUSDT 6.46% (×2.2)
      title: 'When the queue runs thin',
      art: 'staircase',
      presenter: { who: 'tick', mood: 'thinking' },
      text: 'Back to 21 October. One program sold a huge amount at once. It took the best buy offer, then the next, then the next, down a queue that ran thin fast. Each deal was lower, and each was “the price” for a moment. How many offers wait near the price is called [[liquidity]]. Bitcoin on a big exchange is usually deep. Smaller coins are thinner: in 2025 Dogecoin’s typical day swung about twice as far as Bitcoin’s.',
      more: { article: 'exchange-price', section: 'liquidity' },
      nextLabel: 'How does a chart show all this?',
    },
    {
      title: 'Thousands of deals, one candle',
      art: 'candleAnatomy',
      presenter: { who: 'tock', mood: 'smile' },
      text: 'Thousands of deals happen every minute, so charts sum them up. A [[candle]] covers one slice of time: its body runs from the first deal (the open) to the last (the close), and thin wicks reach the highest and lowest deals. Green means it closed higher than it opened; red, lower. Crypto never closes, so new candles keep coming, nights and holidays too. A candle shows what happened, never what comes next.',
      nextLabel: 'What makes the candles jump?',
    },
    {
      // Bybit BTCUSDT perpetual daily: 8 Feb 2021 open 38,825.5 → 21 Feb close 57,459;
      // 12 May 2021 open 56,684 → close 49,617 (−12.5%)
      title: 'Same company, opposite moves',
      art: 'tesla',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      chart: TESLA_2021,
      text: 'News changes what people are willing to pay. February 2021: Tesla said it had bought $1.5 billion of Bitcoin, and the price rose from about $39,000 to above $57,000 in two weeks. May 2021: Tesla said it would stop accepting it, and the price dropped 12.5% in a day. Same company, opposite moves. So can news tell you which way the price will go? Here’s one to judge yourself.',
      nextLabel: 'Try it with real news',
    },
    {
      // The postponed volatility-and-risk card (2026-11-12), after the Tesla and ETF charts. Bybit
      // BTCUSDT perpetual daily, 19 May 2021: open 42,903.5, low 28,801, close 36,727;
      // $100 × 28,801 / 42,903.5 = $67.13
      title: 'Big swings, both ways',
      presenter: { who: 'tick', mood: 'frank', pose: 'stand' },
      chart: MAY_2021,
      text: 'Swings like these have a name: [[volatility]] (Lesson 1). On 19 May 2021 bitcoin fell from about $42,900 to as low as $28,800, then closed the day near $36,700. It swings up just as hard, which is why no one can time it. Bigger swings mean bigger losses too: $100 of bitcoin bought that morning was worth $67 at the low. So size for the fall: only put in what you could watch drop by a third.',
      more: { article: 'price-swings', section: 'size' },
      nextLabel: 'Is a big swing the only risk?',
    },
    {
      // CoinDesk and Cointelegraph, 1 Nov 2021: the creators cashed out millions and vanished; the
      // project was unrelated to Netflix. No price is quoted (reports vary; nothing on Bybit)
      title: 'Check before you trust',
      art: 'checkCoin',
      presenter: { who: 'tock', mood: 'frank' },
      text: 'Not every risk is a swing. In October 2021 a token named after the series Squid Game climbed for days. Buyers then found they couldn’t sell it, and on 1 November its creators cashed out millions and vanished: a [[rug pull|rug-pull]] (Lesson 1). A price on a screen only means someone traded. Before you trust any coin, check who runs it, whether you can sell it, and whether it promises easy profits.',
      more: { article: 'spot-a-scam', section: 'checklist' },
      nextLabel: 'Now try it on the real chart',
    },
  ],
  // After the Tesla card: the ETF question, then the volatility and scam cards
  momentAfter: 4,
  moment: {
    // Bybit BTCUSDT perpetual daily: 10 Jan 2024 close 46,659.9 → 23 Jan close 39,900.1 (−14.5%).
    // The chart stops on the 10th until the learner has answered
    context:
      '10 January 2024: the US approves the first funds that hold Bitcoin directly, widely called the year’s biggest crypto news. The chart stops on that day.',
    question: 'What happened to the price next?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['It went up', 'It went down', 'No one could know in advance'],
    correct: 2,
    explain:
      'It fell about 15% in two weeks, but that’s hindsight: on the day, no one could know, and Tesla’s news in 2021 went the other way. Careful traders plan for both directions before they act.',
    chart: ETF_2024,
  },
  checks: [
    {
      question:
        'Few people trade a small coin, and someone sells a large amount at once. What’s most likely?',
      options: [
        'It all sells at the last price',
        'Each deal is lower than the one before',
        'The exchange holds the price still',
      ],
      correct: 1,
      explain:
        'In a thin queue, a big order takes the best buyer, then the next, at worse and worse prices. That’s how bitcoin briefly sold for $8,200 on Binance.US.',
    },
    {
      question: 'You plan to put practice money into bitcoin. Which plan sizes for the fall?',
      presenter: { who: 'tick', mood: 'thinking' },
      options: [
        'An amount I could watch drop by a third',
        'More than usual, since it rose last week',
        'No plan: big swings even out',
      ],
      correct: 0,
      explain:
        'On 19 May 2021 bitcoin fell about a third within the day. Size each trade so a fall like that would sting, not sink you. Last week’s rise says nothing about tomorrow.',
    },
    {
      question:
        'A new coin is up 80% this week, and its website promises 2% a day. What do you check first?',
      options: [
        'Who runs it, and whether you can sell it',
        'How many people are posting about it',
        'Nothing: the rise proves it’s real',
      ],
      correct: 0,
      explain:
        'A rising price only means people traded. The Squid Game token rose for days before buyers found they couldn’t sell. A promised return is a warning sign, not a reason.',
    },
  ],
  notePrompt: 'What is one thing you want to understand before your first trade?',
  teaser: 'Next: spend $100 of practice money on Bitcoin, at a price you can now read.',
  canDo: [
    { text: 'Say who set the price you see', article: 'exchange-price', section: 'last-deal' },
    {
      text: 'Explain why a thin queue makes big jumps',
      article: 'exchange-price',
      section: 'liquidity',
    },
    { text: 'Size a trade for the fall', article: 'price-swings', section: 'size' },
  ],
  recap: {
    title: 'Who sets the price?',
    points: [
      {
        text: 'Nobody sets the price: it’s the last deal between a buyer and a seller.',
        article: 'exchange-price',
        section: 'last-deal',
      },
      {
        text: 'Thin queues make big jumps, and smaller coins are thinner than Bitcoin.',
        article: 'exchange-price',
        section: 'liquidity',
      },
      {
        text: 'News can move the price either way, and the swings are big: size every trade for the fall.',
        article: 'price-swings',
        section: 'volatility',
      },
      {
        text: 'A price only means someone traded. Check who runs a coin, and whether you can sell it.',
        article: 'spot-a-scam',
        section: 'checklist',
      },
    ],
    highlight: { text: 'The price is people, trading every second.' },
  },
  next: { kind: 'tour', id: 'buy-first-coin' },
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

/**
 * The lesson as a run of screens, in order — what the sheet walks through and what the funnel
 * numbers (`lesson-02.<n>`, 1-based): cards, the moment, "try it", each question, the summary, the end.
 */
export type LessonScreen =
  | { kind: 'card'; index: number }
  | { kind: 'moment' }
  | { kind: 'try' }
  | { kind: 'check'; index: number }
  | { kind: 'summary' }
  | { kind: 'close' };

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
  return `${lesson.id}.${(lesson.stepBase ?? 0) + screen + 1}`;
}

/** The screen (0-based) a step number stands for today, or null for an earlier version's step */
export function lessonScreenOfStep(lesson: Lesson, step: number): number | null {
  const screen = step - (lesson.stepBase ?? 0) - 1;
  return screen >= 0 && screen < lessonScreens(lesson).length ? screen : null;
}

/** Every word in a card, for the 80-word rule (a term counts as the words of its label) */
export function cardWords(card: LessonCard): number {
  const text = [
    plainText(card.text ?? ''),
    ...(card.lines ?? []).map((l) => l.text),
    ...(card.meet ? [card.meet.tick, card.meet.tock, card.meet.lead, ...card.meet.list] : []),
    ...(card.points ?? []).flatMap((p) => [p.label, p.text]),
    ...(card.beats ?? []).map((b) => b.text),
  ].join(' ');
  return text.split(/\s+/).filter((w) => /\w/.test(w)).length;
}
