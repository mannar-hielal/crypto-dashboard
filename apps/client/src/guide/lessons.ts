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
import type { TourId } from './tours';

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
  /** Lesson 2's Bitcoin card: the mark rising with its burst, as at the end of Lesson 1 */
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
  article: ArticleId;
  /** The article section to open at (an `h` block's id) */
  section?: string;
}

/**
 * How a question is answered: a list of options (multiple choice), or Buy and Sell side by side
 * under a chart and a stated plan (owner's visual Q&A, 2026-11-16). A buy-or-sell question's
 * options are exactly `['Buy', 'Sell']` and its answer follows from the plan, never a guess.
 */
export type QuestionFormat = 'choice' | 'buy-sell';

export interface LessonQuestion {
  /** Default `choice` */
  format?: QuestionFormat;
  /** A buy-or-sell question's plan, shown under the chart ("Your plan: … Today it closed at …") */
  plan?: string;
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

// ─── Lesson 1 — What is the problem? ─────────────────────────────────────────
// From the owner's notes on Kevin and Colt's lectures (Drive docs 01–06), rewritten in our voice;
// each card's terms open the matching article (learn/articles.ts). Owner 2026-10-23: the Pizza Day
// hook, and "Try it" is Nora cheating in the notebook, inside the sheet, on every screen size.

/** Lesson 1's length: its card, the guides' meeting and the welcome card all say it */
const LESSON_01_MINUTES = 5;

const lesson01: Lesson = {
  id: 'lesson-01',
  number: 1,
  // Owner 2026-11-12: renamed from "What is Bitcoin?", which is now Lesson 2's title
  title: 'What is the problem?',
  stage: 'Getting started',
  // Owner 2026-11-08: Lesson 1 is the problem only (one keeper); Lesson 2 answers it
  minutes: LESSON_01_MINUTES,
  // Its screens changed on 2026-11-08: today's are steps 21 on, earlier ones keep 1–20 (Lesson 3 too)
  stepBase: 20,
  // Nora's edit alone: the copies that outvote her are Lesson 2's answer (review 2026-11-08)
  tryWidget: 'nora-edits',
  tryIntro:
    'Your turn to be Nora. Change one line of the notebook and watch what a single pen stroke does. Nobody’s checking. That’s exactly the problem.',
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
        { kind: 'fact', text: 'Back then, they cost him $41. A fair price for two large pizzas.' },
        {
          kind: 'headline',
          text: 'Nobody in that room knew those pizzas would one day be worth over $1 billion!',
          emphasis: 'over $1 billion',
        },
      ],
      nextLabel: 'Unlock the story of Bitcoin',
    },
    {
      title: 'Meet your guides',
      presenter: { who: 'tick', mood: 'smile', pose: 'wave' },
      meet: {
        tick: 'Hi, I’m Pulin. I ask the questions you’re too polite to ask.',
        tock: 'And I’m Berwyn. I answer them. Usually.',
        lead: `In the next ${LESSON_01_MINUTES} minutes you’ll learn:`,
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
      // Owner 2026-11-13 (Lesson 1's friendlier copy): a question first, then the guides' double act
      text: 'Quick question: why is a banknote worth anything? It’s paper. It works because we all trust [[someone in charge|money]]: a government, a bank, a game company.',
      lines: [
        { speaker: 'tick', text: 'So whoever’s in charge can just… print more?' },
        {
          speaker: 'tock',
          text: 'Or change the rules overnight. Your money quietly buys less, and nobody asks you.',
        },
        { speaker: 'tick', text: 'Rude. Can we watch it happen?' },
        { speaker: 'tock', text: 'Sure. Three friends, one notebook. Meet Nora.' },
      ],
      nextLabel: 'So who keeps the record?',
    },
    {
      title: 'A notebook, not coins',
      art: 'notebook',
      presenter: { who: 'tick', mood: 'curious' },
      // Owner 2026-10-25: the three friends of the SunCoin article, and no Bitcoin until Nora's
      // problems are on the table
      text: 'Meet Emi, Leo and Sofia. Their money is SunCoin, and it lives only in Nora’s notebook. No coins, no wallets, just lines of ink. Leo buys Emi’s sticker pack for 3? Nora writes “Leo → Emi, 3”. Done. Here’s the odd part: nobody’s balance is written anywhere. Your SunCoin is whatever the lines add up to for you. That list has a name: a [[ledger]]. Remember it. It’s coming back.',
      nextLabel: 'What if Nora cheats?',
    },
    {
      // Owner 2026-10-25: the problem first, so the learner reaches "many keepers" themselves; the
      // full wording is the SunCoin article's "What can go wrong with one Nora?"
      title: 'What can go wrong with one Nora?',
      art: 'oneNora',
      presenter: { who: 'tock', mood: 'thinking', pose: 'stand' },
      text: 'SunCoin works because everyone trusts Nora. She holds the only pen. Lovely person. But picture a bad day, or a bad idea. Alone, she could:',
      points: [
        {
          label: 'Print coins.',
          text: 'Write “Start → Leo, 100”. Money from thin air, and everyone else’s buys less.',
        },
        {
          label: 'Move yours.',
          text: 'Write “Sofia → Emi, 7”. Sofia never agreed. The ink doesn’t care.',
        },
        {
          label: 'Rewrite history.',
          text: 'Change line 4 so Leo never paid. Prove otherwise. You can’t.',
        },
        {
          label: 'Lose it all.',
          text: 'Spill coffee on the only copy, and every balance is gone.',
        },
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
      'With one keeper, the keeper’s word is the money. Emi can count all she likes: the notebook says what Nora says. Next lesson: a notebook nobody holds alone.',
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
        'A bit of a trick question. The notebook only lists payments. Your balance, in SunCoin or in Bitcoin, is what the list adds up to for you.',
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
        'One pen, one boss. Even a lovely, honest Nora can have a bad day, spill her coffee or get leaned on. And nobody could check.',
    },
    {
      question: 'A central bank prints a lot more money. What happens to the money you hold?',
      options: ['It quietly buys less', 'It buys more', 'Nothing at all'],
      correct: 0,
      explain:
        'More money chasing the same stuff means each note buys less. The rules changed, and nobody asked you. Again.',
    },
  ],
  notePrompt: 'What would you like to understand better about money and Bitcoin?',
  teaser:
    'You’ve seen the problem. Next: money with no Nora at all. Spoiler: everyone gets a copy.',
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
    // Owner 2026-11-12: the story fades in line by line, then the Bitcoin mark. 2008: banks failed
    // and governments and central banks rescued them, with bailouts and newly created money; the
    // Bitcoin paper is dated 31 October 2008 (bitcoin-story). Block 0's Times headline moved to the
    // article's timeline
    genesis: {
      lines: [
        { text: 'However, for most people there was no other choice.' },
        // Lehman Brothers, founded 1850, filed for bankruptcy on 15 September 2008 (bitcoin-story)
        { text: 'In 2008, that trust broke: Lehman Brothers, a 158-year-old bank, collapsed.' },
        { text: 'Banks failed, and governments rushed to rescue them with newly printed money.' },
        {
          text: 'Then someone called Satoshi Nakamoto proposed money that no one holds or controls.',
          emphasis: 'Satoshi Nakamoto',
        },
      ],
    },
    // Owner 2026-11-12: no Read more at the very end of Lesson 1; Lesson 2 picks the story up
    highlight: { text: 'That was the birth of Bitcoin.' },
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
      text: 'In Lesson 1 we saw the risk of trusting one record keeper: whoever holds the only [[ledger]] can change it, freeze it or simply lose it. Bitcoin solves this by keeping copies everywhere. Thousands of computers around the world, called [[nodes|node]], each hold the full ledger and check every new payment. Each page, called a block, is added by miners and sealed to the one before with a fingerprint called a hash, so nobody can quietly rewrite the past.',
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
      text: 'Swings like these have a name: [[volatility]]. On 19 May 2021 bitcoin fell from about $42,900 to as low as $28,800, then closed the day near $36,700. It swings up just as hard, which is why no one can time it. Bigger swings mean bigger losses too: $100 of bitcoin bought that morning was worth $67 at the low. So size for the fall: only put in what you could watch drop by a third.',
      more: { article: 'price-swings', section: 'size' },
      nextLabel: 'Is a big swing the only risk?',
    },
    {
      // CoinDesk and Cointelegraph, 1 Nov 2021: the creators cashed out millions and vanished; the
      // project was unrelated to Netflix. No price is quoted (reports vary; nothing on Bybit)
      title: 'Check before you trust',
      art: 'checkCoin',
      presenter: { who: 'tock', mood: 'frank' },
      text: 'Not every risk is a swing. In October 2021 a token named after the series Squid Game climbed for days. Buyers then found they couldn’t sell it, and on 1 November its creators cashed out millions and vanished: a [[rug pull|rug-pull]]. A price on a screen only means someone traded. Before you trust any coin, check who runs it, whether you can sell it, and whether it promises easy profits.',
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
