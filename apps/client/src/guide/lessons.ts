/**
 * The lessons (guided-learning plan, owner 2026-10-22): a few illustrated cards, a short tour on the
 * real screen, two or three questions, one journal line. Tick (green, the curious one) and Tock
 * (red, the calm one) present them — red is never the villain.
 *
 * Rules the tests hold every lesson to: at most five cards of at most 50 words, two or three
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
import type { TourId } from './tours';

export const LESSON_IDS = ['lesson-01', 'lesson-02'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export function isLessonId(value: string): value is LessonId {
  return (LESSON_IDS as readonly string[]).includes(value);
}

/** The pictures `LessonArt` can draw, all from our own tokens */
export type LessonArtId =
  | 'hook'
  | 'pizza'
  | 'money'
  | 'notebook'
  | 'ledger'
  | 'mailbox'
  | 'queues'
  | 'busy'
  | 'tesla'
  | 'etf';

export type Speaker = 'tick' | 'tock';

/**
 * The guides' faces (owner's visual Q&A 2026-10-24). `worried` is for warnings only (scams, never
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
  symbol: 'BTCUSDT';
  /** The newest candle's date (YYYY-MM-DD, UTC) and how many daily candles end there */
  end: string;
  bars: number;
  markers: ChartMarker[];
  /** Show only up to this date until the learner has answered (the "what happened next?" moment) */
  freezeAt?: string;
  /** What the chart shows, for screen readers */
  label: string;
  /** The drawn picture shown instead when the history can't be loaded */
  fallback: LessonArtId;
}

export interface LessonCard {
  title: string;
  /** Tick or Tock, standing in the picture and presenting it */
  presenter: Presenter;
  /** The picture (a card with a `chart` shows the chart instead) */
  art: LessonArtId;
  chart?: ChartScene;
  /** Either plain text (may mark `[[terms]]`), or a short exchange between the two guides */
  text?: string;
  lines?: LessonLine[];
}

/** One "You can now…" line on the close, with the article that goes deeper */
export interface CanDo {
  text: string;
  article: ArticleId;
  /** The article section to open at (an `h` block's id) */
  section?: string;
}

export interface LessonQuestion {
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
  checks: LessonQuestion[];
  notePrompt: string;
  /** What the learner can do after the lesson, shown on the close */
  canDo: CanDo[];
  rule: string;
  teaser: string;
  /** What the close offers next: the next lesson, or a tour */
  next?: LessonNext;
  access: Entitlement;
}

export type LessonNext = { kind: 'lesson'; id: LessonId } | { kind: 'tour'; id: TourId };

// ─── Lesson 1 — What is Bitcoin? ─────────────────────────────────────────────
// From the owner's notes on Kevin and Colt's lectures (Drive docs 01–06), rewritten in our voice;
// each card's terms open the matching article (learn/articles.ts). Owner 2026-10-23: the Pizza Day
// hook, and "Try it" is Nora cheating in the notebook, inside the sheet, on every screen size.

const lesson01: Lesson = {
  id: 'lesson-01',
  number: 1,
  title: 'What is Bitcoin?',
  stage: 'Getting started',
  minutes: 6,
  tryWidget: 'nora-cheats',
  tryIntro:
    'Now be Nora. Change one line of the notebook and see what a single pen stroke does, then let the other notebooks check it.',
  cards: [
    {
      // bitcointalk.org, 22 May 2010: 10,000 BTC for two pizzas. No "worth $X today": that's hindsight
      title: 'Two pizzas',
      art: 'pizza',
      presenter: { who: 'tick', mood: 'surprised' },
      lines: [
        { speaker: 'tick', text: 'On 22 May 2010, someone paid 10,000 bitcoin for two pizzas.' },
        {
          speaker: 'tock',
          text: 'Why would anyone accept it? To see, start with what money is.',
        },
      ],
    },
    {
      // Bitcoin paper: 31 Oct 2008; first block: 3 Jan 2009
      title: 'Money runs on trust',
      art: 'money',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      text: 'Notes, coins, even game tokens work because people trust [[someone in charge|money]]: a government, a bank, a game company. They can print more or change the rules. In 2008, as banks failed, [[Satoshi Nakamoto|satoshi-nakamoto]] proposed money with no one in charge.',
    },
    {
      title: 'A notebook, not coins',
      art: 'notebook',
      presenter: { who: 'tick', mood: 'curious' },
      text: 'Picture three friends whose only money is a notebook kept by Nora. Each payment is one new line, and nobody’s balance is written down: it’s what the list adds up to. That list is a [[ledger]]. Bitcoin keeps one too.',
    },
    {
      title: 'Many notebooks, no Nora',
      art: 'ledger',
      presenter: { who: 'tick', mood: 'grin' },
      text: 'Bitcoin’s ledger is kept by thousands of computers, called [[nodes|node]], each with a full copy. They check every payment, and each page is sealed to the one before, so nobody can quietly rewrite the past. That chain of pages is the [[blockchain]].',
    },
    {
      title: 'A mailbox and a key',
      art: 'mailbox',
      presenter: { who: 'tock', mood: 'wink' },
      text: 'Your bitcoin [[address]] is like a mailbox slot: anyone can pay into it, and it’s safe to share. Your [[private key|private-key]] is the only key that opens it. Whoever has the key controls the coins, so never share it.',
    },
  ],
  moment: {
    context: 'Nora quietly changes line 4, so the notebook says Leo paid 30 instead of 3.',
    question: 'With thousands of copies of the notebook, what happens?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['Her edit is accepted', 'The other copies reject it', 'Bitcoin stops working'],
    correct: 1,
    explain:
      'The other copies still say 3, so her copy is outvoted. To change Bitcoin’s past, someone would have to out-work the whole network at once.',
  },
  checks: [
    {
      question: 'In Nora’s notebook, where is Emi’s balance written?',
      options: [
        'On its own line in the notebook',
        'Nowhere: it’s worked out by reading the list',
        'On Emi’s phone',
      ],
      correct: 1,
      explain:
        'The notebook only lists payments. A balance, in SunCoin or in Bitcoin, is what the list adds up to for you.',
    },
    {
      question:
        'Someone from “support” asks for your recovery phrase to fix your wallet. What do you do?',
      // A warning, not a punishment: the only place a guide looks worried
      presenter: { who: 'tock', mood: 'worried' },
      options: ['Send it: they’re support', 'Send only half of it', 'Never share it'],
      correct: 2,
      explain:
        'A recovery phrase restores your private keys, and whoever has it controls your coins. Real support never asks for it.',
    },
    {
      // Mt. Gox, Feb 2014: about 850,000 BTC reported missing (learn/articles.ts, "Getting bitcoin")
      question:
        'In 2014 the Mt. Gox exchange collapsed and customers’ bitcoin went missing. What failed?',
      options: ['Bitcoin itself', 'The exchange that held their keys', 'The internet'],
      correct: 1,
      explain:
        'The blockchain kept working. A company that held its customers’ keys failed: the risk of letting someone else hold them.',
    },
  ],
  notePrompt: 'What would you like to understand better about Bitcoin?',
  canDo: [
    { text: 'Explain where a balance lives', article: 'suncoin', section: 'no-balances' },
    { text: 'Say why one notebook keeper is a risk', article: 'suncoin', section: 'one-nora' },
    { text: 'Tell an address from a private key', article: 'mailboxes-keys', section: 'key' },
  ],
  rule: 'Bitcoin replaces “trust me” with “check it”.',
  teaser: 'Next: who sets the price of a bitcoin?',
  next: { kind: 'lesson', id: 'lesson-02' },
  access: FREE,
};

// ─── Lesson 2 — Who sets the price? ──────────────────────────────────────────
// Concise and about trading (Finelo's Lessons 1 and 2 as the model, never their wording or hype).
// What Bitcoin is belongs to Lesson 1; one sentence bridges back to it.

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

const lesson02: Lesson = {
  id: 'lesson-02',
  number: 2,
  title: 'Who sets the price?',
  stage: 'Getting started',
  minutes: 5,
  tour: 'primer',
  tryIntro:
    'Now do it on the real chart: three quick tasks, and we’ll tell you when each one’s done. Your 10,000 USDT of practice money waits in the account panel under the chart.',
  cards: [
    {
      title: 'Who decides?',
      art: 'hook',
      presenter: { who: 'tick', mood: 'curious', pose: 'wave' },
      lines: [
        { speaker: 'tick', text: 'Who decides what one Bitcoin costs?' },
        {
          speaker: 'tock',
          text: 'No one in charge. Everyone who is buying and selling it — right now, every second.',
        },
      ],
    },
    {
      title: 'What a price is',
      art: 'queues',
      presenter: { who: 'tock', mood: 'smile' },
      text: 'Lesson 1’s ledger records who owns what; the price is made elsewhere. An [[exchange]] matches people who want to buy with people who want to sell. The price on your screen is simply their [[last deal|last-price]].',
    },
    {
      title: 'A market that never closes',
      art: 'busy',
      presenter: { who: 'tick', mood: 'grin' },
      text: 'Crypto trades every hour of every day, across borders. In a busy market a buyer or seller is usually close to the price: that’s [[liquidity]]. The small gap between the best offer to buy and to sell is the [[spread]], a cost on every trade.',
    },
    {
      // Bybit BTCUSDT perpetual daily: 8 Feb 2021 open 38,825.5 → 21 Feb close 57,459;
      // 12 May 2021 open 56,684 → close 49,617 (−12.5%)
      title: 'Same company, opposite moves',
      art: 'tesla',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      chart: TESLA_2021,
      text: 'February 2021: Tesla said it had bought $1.5 billion of Bitcoin. The price rose from about $39,000 to above $57,000 in two weeks. May 2021: Tesla said it would stop accepting Bitcoin. The price fell 12.5% in a day.',
    },
    {
      // Bybit BTCUSDT perpetual daily: 10 Jan 2024 close 46,659.9 → 23 Jan close 39,900.1 (−14.5%).
      // The chart stops on the 10th: what came next is the moment's question, so this card mustn't
      // give it away
      title: 'Good news…',
      art: 'etf',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      chart: ETF_2024,
      text: '10 January 2024: the US approved the first funds that hold Bitcoin directly, widely called the year’s biggest crypto news. The chart stops on that day. Before you see what came next: what would you expect?',
    },
  ],
  moment: {
    context: '10 January 2024: “US approves the first spot Bitcoin funds.”',
    question: 'What happened to the price next?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['It went up', 'It went down', 'No one could know in advance'],
    correct: 2,
    explain:
      'It fell about 15% in two weeks, but that’s hindsight. On the day, no one could know. That’s why careful traders plan for both directions before they act.',
    chart: ETF_2024,
  },
  checks: [
    {
      question: 'What sets Bitcoin’s price on an exchange?',
      options: [
        'The company behind Bitcoin',
        'The last deal between a buyer and a seller',
        'The government',
      ],
      correct: 1,
      explain:
        'No one issues the price. It is simply the latest trade between someone buying and someone selling.',
    },
    {
      question: 'A big company announces it is buying Bitcoin. What happens to the price?',
      options: ['It rises', 'It falls', 'It could do either; no one knows in advance'],
      correct: 2,
      explain:
        'Tesla’s purchase came before a rise, but the 2024 fund approval came before a fall. News moves prices, in a direction no one can know beforehand.',
    },
    {
      question: 'A green candle means…',
      options: [
        'The price ended that period higher than it started',
        'It is a good time to buy',
        'Someone made a profit',
      ],
      correct: 0,
      explain: 'A candle describes what already happened in that slice of time. It is not advice.',
    },
  ],
  notePrompt: 'What is one thing you want to understand before your first trade?',
  canDo: [
    { text: 'Say who set the price you see', article: 'exchange-price', section: 'last-deal' },
    { text: 'Read a candle’s open and close', article: 'exchange-price', section: 'candles' },
    {
      text: 'Explain why news doesn’t tell you the direction',
      article: 'exchange-price',
      section: 'news',
    },
  ],
  rule: 'A price is people, not a prediction.',
  teaser: 'Next: spend $100 of practice money on your first coin.',
  next: { kind: 'tour', id: 'buy-first-coin' },
  access: FREE,
};

export const LESSONS: readonly Lesson[] = [lesson01, lesson02];

export function getLesson(id: LessonId): Lesson {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}

/**
 * Who stands beside a question: its presenter until it's answered, then a reaction. The right answer
 * gets Tick's grin; "Not quite" gets Tock, calm, never sad or worried (red is never the villain).
 */
export function questionGuide(q: LessonQuestion, answer: number | undefined): Presenter {
  if (answer === undefined) return q.presenter ?? { who: 'tock', mood: 'thinking' };
  return answer === q.correct ? { who: 'tick', mood: 'grin' } : { who: 'tock', mood: 'calm' };
}

// ─── Screens ─────────────────────────────────────────────────────────────────

/**
 * The lesson as a run of screens, in order — what the sheet walks through and what the funnel
 * numbers (`lesson-02.<n>`, 1-based): cards, the moment, "try it", each question, the note, the end.
 */
export type LessonScreen =
  | { kind: 'card'; index: number }
  | { kind: 'moment' }
  | { kind: 'try' }
  | { kind: 'check'; index: number }
  | { kind: 'note' }
  | { kind: 'close' };

export function lessonScreens(lesson: Lesson): LessonScreen[] {
  return [
    ...lesson.cards.map((_, index) => ({ kind: 'card' as const, index })),
    { kind: 'moment' as const },
    { kind: 'try' as const },
    ...lesson.checks.map((_, index) => ({ kind: 'check' as const, index })),
    { kind: 'note' as const },
    { kind: 'close' as const },
  ];
}

/** Every word in a card, for the 50-word rule (a term counts as the words of its label) */
export function cardWords(card: LessonCard): number {
  const text = [plainText(card.text ?? ''), ...(card.lines ?? []).map((l) => l.text)].join(' ');
  return text.split(/\s+/).filter((w) => /\w/.test(w)).length;
}
