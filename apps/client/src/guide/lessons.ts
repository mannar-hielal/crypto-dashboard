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
import pizzaDay from '@/assets/lessons/pizza-day.jpg';
import type { TourId } from './tours';

export const LESSON_IDS = ['lesson-01', 'lesson-ownership', 'lesson-02'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export function isLessonId(value: string): value is LessonId {
  return (LESSON_IDS as readonly string[]).includes(value);
}

/** The pictures `LessonArt` can draw, all from our own tokens */
export type LessonArtId =
  | 'hook'
  | 'money'
  | 'notebook'
  | 'oneNora'
  | 'ledger'
  | 'mailbox'
  | 'hardDrive'
  | 'stamp'
  | 'keyHolders'
  | 'custody'
  | 'queues'
  | 'busy'
  | 'tesla'
  | 'etf';

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
  credit: string;
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
  /** The Next button's words: the question the next card answers (default "Continue") */
  nextLabel?: string;
}

/** One "You can now…" line on the close, with the article that goes deeper */
/** The birth of Bitcoin, staged on a summary (`GenesisReveal`): a real headline in a real block */
export interface Genesis {
  kicker: string;
  headline: string;
  caption: string;
}

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
  /**
   * The close's summary, in place of "You can now" (owner 2026-11-08): a few lines, each opening its
   * article. Lessons without one list `canDo` instead.
   */
  recap?: { title: string; points: CanDo[]; highlight?: CanDo; genesis?: Genesis };
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

// ─── Lesson 1 — What is Bitcoin? ─────────────────────────────────────────────
// From the owner's notes on Kevin and Colt's lectures (Drive docs 01–06), rewritten in our voice;
// each card's terms open the matching article (learn/articles.ts). Owner 2026-10-23: the Pizza Day
// hook, and "Try it" is Nora cheating in the notebook, inside the sheet, on every screen size.

const lesson01: Lesson = {
  id: 'lesson-01',
  number: 1,
  title: 'What is Bitcoin?',
  stage: 'Getting started',
  // Owner 2026-11-08: Lesson 1 is the problem only (one keeper); Lesson 2 answers it
  minutes: 4,
  // Its screens changed on 2026-11-08: today's are steps 21 on, earlier ones keep 1–20 (Lesson 3 too)
  stepBase: 20,
  // Nora's edit alone: the copies that outvote her are Lesson 2's answer (review 2026-11-08)
  tryWidget: 'nora-edits',
  tryIntro:
    'Now be Nora. Change one line of the notebook and see what a single pen stroke does, with nobody to check it.',
  cards: [
    {
      // bitcointalk.org, 22 May 2010: Laszlo Hanyecz in Jacksonville, Florida, paid 10,000 BTC for
      // two pizzas, about $41 then. Bitcoin traded above $100,000 for much of 2025, so "over $1
      // billion" holds without picking a day. Owner 2026-10-25: show the number, then twist it into
      // hindsight (nobody knew), so it teaches rather than sells. Owner 2026-10-28: no counter, and
      // the billion lands in the last line, said plainly rather than by Tock
      title: 'Two pizzas',
      // Owner 2026-11-08: the real photo, no drawing and no guide; the owner holds the rights
      // The owner confirmed on 2026-11-08 that they hold the rights to publish this photograph
      // (docs/APP_LOG.md, "Lesson 1 opens on the real photo"); credited under the image
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
        { kind: 'fact', text: 'Back then, they cost him $41.' },
        {
          kind: 'headline',
          text: 'Nobody in that room knew those pizzas would one day be worth over $1 billion!',
          emphasis: 'over $1 billion',
        },
      ],
      nextLabel: 'Unlock your learning journey',
    },
    {
      title: 'Meet your guides',
      presenter: { who: 'tick', mood: 'smile', pose: 'wave' },
      meet: {
        tick: 'Hi, I’m Pulin.',
        tock: 'Hi, I’m Berwyn.',
        lead: 'In the next 4 minutes you’ll learn:',
        list: [
          'why money needs someone you trust',
          'what one record keeper could get away with',
          'the question Bitcoin was built to answer',
        ],
      },
      nextLabel: 'Start with money itself',
    },
    {
      // Owner 2026-10-25: no Satoshi yet. The learner first sees what's wrong with someone in charge
      // (more printed, rules changed), then meets money with no one in charge
      title: 'Money runs on trust',
      art: 'money',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'Bank notes, coins, even game tokens work because we trust [[someone in charge|money]]: a government, a bank, a game company. Handy, until they print more or change the rules overnight, and your money quietly buys less. To see why that matters, shrink it down to three friends and one notebook.',
      nextLabel: 'So who keeps the record?',
    },
    {
      title: 'A notebook, not coins',
      art: 'notebook',
      presenter: { who: 'tick', mood: 'curious' },
      // Owner 2026-10-25: the three friends of the SunCoin article, and no Bitcoin until Nora's
      // problems are on the table
      text: 'Three friends, Emi, Leo and Sofia, whose only money is SunCoin, a made-up coin kept in Nora’s notebook. Leo buys Emi’s sticker pack for 3: nothing changes hands, Nora writes “Leo → Emi, 3”. Nobody’s balance is written down: it’s what the lines add up to. That list is a [[ledger]].',
      nextLabel: 'What if Nora cheats?',
    },
    {
      // Owner 2026-10-25: the problem first, so the learner reaches "many keepers" themselves; the
      // full wording is the SunCoin article's "What can go wrong with one Nora?"
      title: 'What can go wrong with one Nora?',
      art: 'oneNora',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      text: 'SunCoin works only because everyone trusts Nora. With one pen she could:',
      points: [
        { label: 'Print coins.', text: '“Start → Leo, 100”, and everyone’s coins buy less.' },
        { label: 'Move yours.', text: '“Sofia → Emi, 7”, though Sofia never agreed.' },
        { label: 'Rewrite history.', text: 'Change line 4 so Leo never paid.' },
        { label: 'Lose it all.', text: 'Coffee on the only copy.' },
      ],
      nextLabel: 'Could money work with no Nora?',
    },
  ],
  moment: {
    context: 'Nora writes “Start → Nora, 50” in the only notebook.',
    question: 'Who can stop her?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['Nobody: she holds the only pen', 'The bank', 'Emi, by checking her balance'],
    correct: 0,
    explain:
      'With one keeper, the keeper’s word is the money. Next lesson: a notebook nobody holds alone.',
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
      question: 'Why is one notebook keeper a risk?',
      options: [
        'She could print, move or rewrite coins, and nobody could check',
        'She might write too slowly',
        'There is no risk if she’s a friend',
      ],
      correct: 0,
      explain:
        'One pen means one person decides what the notebook says. Even an honest keeper can make a mistake, or be pressured.',
    },
    {
      question: 'A central bank prints a lot more money. What happens to the money you hold?',
      options: ['It quietly buys less', 'It buys more', 'Nothing at all'],
      correct: 0,
      explain:
        'More money chasing the same goods means each note buys less: the rules changed without asking you.',
    },
  ],
  notePrompt: 'What would you like to understand better about money and Bitcoin?',
  canDo: [
    { text: 'Say why money depends on trust', article: 'money-101', section: 'weakness' },
    { text: 'Explain where a balance lives', article: 'suncoin', section: 'no-balances' },
    { text: 'Say why one notebook keeper is a risk', article: 'suncoin', section: 'one-nora' },
  ],
  // Owner 2026-11-08: the close sums up the problem that led to Bitcoin, and only now names Satoshi
  recap: {
    title: 'The problem',
    // Owner 2026-11-08: what goes wrong when money sits with a central authority, then the answer
    points: [
      {
        text: 'When a government or central bank controls money, it can print more of it, and the money you hold quietly buys less.',
        article: 'money-101',
        section: 'weakness',
      },
      {
        text: 'It can also freeze accounts, block payments or change the rules overnight, and you can’t check it or say no.',
        article: 'suncoin',
        section: 'one-nora',
      },
    ],
    // Block 0 (3 January 2009) carries this headline in its first transaction; Bitcoin Wiki,
    // "Genesis block", and the block itself on mempool.space (bitcoin-story's sources)
    genesis: {
      kicker: 'Block 0 · 3 January 2009',
      headline: 'The Times 03/Jan/2009 — Chancellor on brink of second bailout for banks',
      caption: 'Satoshi Nakamoto wrote that headline into Bitcoin’s very first block.',
    },
    // The Bitcoin paper is dated 31 October 2008, during the financial crisis (bitcoin-story)
    highlight: {
      text: 'In 2008, as banks failed, someone called Satoshi Nakamoto proposed money that no one holds or controls. That was the birth of Bitcoin.',
      article: 'bitcoin-story',
      section: 'timeline',
    },
  },
  next: { kind: 'lesson', id: 'lesson-ownership' },
  access: FREE,
};

// ─── Lesson 2 — Who owns a bitcoin? ──────────────────────────────────────────
// Owner 2026-11-08: split from Lesson 1. It answers Lesson 1's cliffhanger (many notebooks), then
// what makes coins yours. A term first taught in Lesson 1 says so in the card's words.

const lessonOwnership: Lesson = {
  id: 'lesson-ownership',
  number: 2,
  title: 'Who owns a bitcoin?',
  stage: 'Getting started',
  minutes: 6,
  tryWidget: 'stamp-check',
  tryIntro: 'Now be Sneaky Sam: try to spend Sofia’s coins without her stamp.',
  cards: [
    {
      // Decrypt and DL News, January 2025: in 2013 a hard drive holding the wallet for 8,000 BTC
      // that James Howells mined in 2009 was thrown out by mistake and went to Newport's landfill;
      // the High Court refused his bid to dig it up. No dollar figure: the hindsight rule of card 1
      // of Lesson 1
      title: 'A hard drive in the bin',
      art: 'hardDrive',
      presenter: { who: 'tock', mood: 'calm' },
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
          text: 'It went to the landfill. Without that key, nobody can move those coins. Not even him.',
        },
      ],
      nextLabel: 'Who keeps that record?',
    },
    {
      title: 'Many notebooks, no Nora',
      art: 'ledger',
      presenter: { who: 'tick', mood: 'grin' },
      text: 'In Lesson 1, Nora’s [[ledger]] had one keeper. Bitcoin’s has thousands: computers called [[nodes|node]], each with a full copy, checking every payment. Every page is sealed to the one before, so nobody can quietly rewrite the past.',
      nextLabel: 'So what makes coins mine?',
    },
    {
      title: 'A mailbox and a key',
      art: 'mailbox',
      presenter: { who: 'tock', mood: 'wink' },
      text: 'Your bitcoin sits behind two things, an [[address]] and a [[private key|private-key]]:',
      points: [
        { label: 'Address.', text: 'A mailbox slot: anyone can pay in, and it’s safe to share.' },
        {
          label: 'Private key.',
          text: 'The only key that opens it. Whoever has it controls the coins, so never share it.',
        },
      ],
      nextLabel: 'How do the nodes know it’s me?',
    },
    {
      title: 'A stamp only you hold',
      art: 'stamp',
      presenter: { who: 'tick', mood: 'curious' },
      text: 'Your private key works like a stamp only you hold: every payment carries its mark. Everyone has the matching checker, your public key, so the [[nodes|node]] can check the mark, but nobody can copy the stamp.',
      nextLabel: 'What if I lose my phone?',
    },
    {
      title: 'Your coins aren’t in your phone',
      art: 'keyHolders',
      presenter: { who: 'tock', mood: 'frank', pose: 'stand' },
      text: 'The coins stay on the [[blockchain]]; your phone holds only the key. A list of recovery words backs it up: lose the phone, keep the words, and you’re fine. Lose both, like James Howells, and nobody can open the box.',
      nextLabel: 'Can someone hold it for me?',
    },
    {
      // Mt. Gox, Feb 2014: about 850,000 BTC reported missing (learn/articles.ts, "Getting bitcoin")
      title: 'Who holds your key?',
      art: 'custody',
      presenter: { who: 'tick', mood: 'thinking', pose: 'stand' },
      text: 'Leave coins on an exchange and it holds the key for you: that’s [[custody]]. Handy, but if the company fails, as Mt. Gox did in 2014, the coins go with it.',
    },
  ],
  moment: {
    context: 'Your phone falls in the sea. Your recovery words are safe at home.',
    question: 'What happens to your bitcoin?',
    presenter: { who: 'tock', mood: 'thinking' },
    options: ['It’s gone', 'Restore it on a new phone', 'The exchange refunds it'],
    correct: 1,
    explain:
      'The coins never left the blockchain. The recovery words rebuild the key on any new phone.',
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
        'A recovery phrase restores your private keys, and whoever has it controls your coins. Real support never asks for it.',
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
  // Lesson 3 since 2026-11-08; the id stays, as accounts store it
  number: 3,
  title: 'Who sets the price?',
  stage: 'Getting started',
  minutes: 5,
  // Its note screen became the summary on 2026-11-08: today's screens are steps 21 on
  stepBase: 20,
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
      text: 'The ledger from Lessons 1 and 2 records who owns what; the price is made elsewhere. An [[exchange]] matches people who want to buy with people who want to sell. The price on your screen is simply their [[last deal|last-price]].',
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
  return [
    ...lesson.cards.map((_, index) => ({ kind: 'card' as const, index })),
    { kind: 'moment' as const },
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

/** Every word in a card, for the 50-word rule (a term counts as the words of its label) */
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
