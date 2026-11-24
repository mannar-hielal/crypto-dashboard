/**
 * The words of the "How it works" page (owner 2026-11-22, from his tour page CPT-how-it-works.html;
 * it replaced the Features page). Plain English for a beginner; every technical word gets an
 * everyday picture. No profit promises, no predictions. The numbers (9 coins, 10 timeframes, 9
 * indicators, 4 charts, $10,000, 10x) are the app's own and are checked by the page's test.
 */

import type { Feature } from '@/lib/landingContent';

export const WHY_POINTS: readonly Feature[] = [
  {
    title: 'Learn by doing',
    text: 'Read a short lesson. Then try the idea on a real chart. Seeing it beats reading about it.',
  },
  {
    title: 'Pretend money',
    text: 'You get $10,000 of pretend money. You can practise as often as you like. No real money is ever involved.',
  },
  {
    title: 'Real prices',
    text: 'The prices are real and live, so the chart moves like the real thing. Only the money is pretend.',
  },
] as const;

export const WHO_FOR: readonly string[] = [
  'People who know nothing about crypto or trading.',
  'People who are curious but scared of losing money.',
  'Anyone who wants to learn the buttons and the words in a safe place.',
] as const;

export const BEGINNER_GETS = {
  understanding:
    'You learn what a chart shows, what buy and sell mean, what a fee costs, and what a loss feels like, before any real money is near.',
  free: 'It is free: no card, no ads, nothing to cancel. The chart needs no account. A free account adds the lessons and the practice desk.',
  limits:
    'This is paper trading only. It is not financial advice and promises no profit. Practising helps you learn the buttons and the words, but it does not prove you would do well with real money, because people act differently when real cash is on the line. The $10,000 balance and the 10x leverage cap are small on purpose.',
} as const;

/** The two halves of the app */
export const HALVES: readonly { title: string; points: readonly string[] }[] = [
  {
    title: 'The learning path',
    points: [
      'Short lessons from zero',
      'Small quizzes',
      'A "try it on the chart" moment',
      'Two friendly guides',
    ],
  },
  {
    title: 'The live chart and practice desk',
    points: [
      'Live prices for 9 coins',
      'Drawing tools and indicators',
      'Up to 4 charts side by side',
      'A $10,000 pretend account',
      'Every practice trade saved',
    ],
  },
] as const;

export const TRICK = 'You learn an idea. Then you try it on a real chart. That is the whole trick.';

/** One short clip of the real app: a little tour, with its steps in words under it */
export interface Tour {
  id: 'lesson' | 'chart' | 'journal' | 'draw' | 'pnl';
  /** Which screen the clip was recorded on */
  device: 'desktop' | 'phone';
  title: string;
  /** The tab label */
  tab: string;
  steps: readonly string[];
}

export const TOURS: readonly Tour[] = [
  {
    id: 'lesson',
    device: 'desktop',
    title: 'Finish a lesson',
    tab: 'A lesson',
    steps: [
      'Open the path and pick the next stop.',
      'Read the cards: one idea, short sentences. The clip is sped up.',
      'Answer the quiz. A wrong answer shows you why, then you try again.',
      'Finish the lesson and the next stop opens.',
    ],
  },
  {
    id: 'chart',
    device: 'desktop',
    title: 'Try it on the chart',
    tab: 'Try it on the chart',
    steps: [
      'The lesson says "Try a buy on the real chart".',
      'Place a practice buy with pretend money.',
      'See the order in Order and Account Management.',
      'Watch your balance and your trade move with the live price.',
    ],
  },
  {
    id: 'journal',
    device: 'phone',
    title: 'Keep a journal',
    tab: 'The journal',
    steps: [
      'Open Orders and Account, then the Journal tab.',
      'Tap the pencil and write a note: why you took the trade.',
      'Press Enter. The note is saved with your trades.',
    ],
  },
  {
    id: 'draw',
    device: 'desktop',
    title: 'Draw and add an indicator',
    tab: 'Draw on the chart',
    steps: [
      'Pick the trend line and draw it with two clicks.',
      'Add an indicator, here a moving average of the price.',
      'Switch the timeframe, and the same chart zooms out.',
    ],
  },
  {
    id: 'pnl',
    device: 'phone',
    title: 'Check a price and your profit or loss',
    tab: 'Price and profit',
    steps: [
      'Open the chart on your phone. The price moves live.',
      'Open Orders and Account to see your balance and your profit or loss.',
      'Slide the Assets table to read the profit or loss of each coin.',
    ],
  },
] as const;

const PARTS_TEXT = {
  browser:
    'The website you see and click. It shows things and takes your orders. It does no cooking.',
  server: 'Where the real work happens: checking, filling orders, keeping score.',
  database: 'It remembers your account, your trades, your lessons and your notes.',
  feed: 'The server listens to a real crypto exchange (Bybit) and relays the prices to you.',
} as const;

export const WORDS_PICTURED: readonly Feature[] = [
  {
    title: 'WebSocket: a phone call that stays open',
    text: 'A normal page load is a letter: you send, wait, get one reply. The live chart keeps a call open, so new prices arrive the moment they happen. No refresh.',
  },
  {
    title: 'The fill engine: the cashier',
    text: 'It fills your order at the shown price. It also watches your waiting orders and your exits, day and night, even when your browser is closed.',
  },
  {
    title: 'HTTPS: a sealed envelope',
    text: 'What travels between your browser and the server is scrambled on the way, so nobody in the middle can read it.',
  },
  {
    title: 'Login token: a wristband for the evening',
    text: 'After you sign in, your browser holds a short-lived token, kept only in memory. It proves who you are for 15 minutes.',
  },
  {
    title: 'Cookie: the ticket stub',
    text: 'A small note your browser keeps, hidden from page scripts. It lets you get a fresh wristband without typing your password again. It lasts 7 days.',
  },
  {
    title: 'Password hashing: scrambling an egg',
    text: 'The server keeps a scrambled version of your password. You cannot unscramble an egg, so even the owner cannot read it.',
  },
] as const;

/** One layer of the architect diagram: a part of the system, in the restaurant picture */
export interface StackLayer {
  id: 'browser' | 'server' | 'database' | 'feed';
  title: string;
  /** The restaurant picture, in a few words */
  tag: string;
  text: string;
  does: string;
  without: string;
  /** Titles of the WORDS_PICTURED cards that belong to this layer */
  words: readonly string[];
}

export const STACK: readonly StackLayer[] = [
  {
    id: 'browser',
    title: 'Your browser',
    tag: 'The shop window and counter',
    text: PARTS_TEXT.browser,
    does: 'Shows the chart and the lessons, and takes your clicks.',
    without: 'Nothing to look at or press.',
    words: ['Login token: a wristband for the evening', 'Cookie: the ticket stub'],
  },
  {
    id: 'server',
    title: 'The server',
    tag: 'The kitchen and back office',
    text: PARTS_TEXT.server,
    does: 'Checks your balance, fills your orders and keeps score.',
    without: 'Nobody to fill an order or check the money.',
    words: ['The fill engine: the cashier', 'Password hashing: scrambling an egg'],
  },
  {
    id: 'database',
    title: 'The database',
    tag: 'The filing cabinet',
    text: PARTS_TEXT.database,
    does: 'Keeps your account, trades, lessons and notes safe between visits.',
    without: 'Every visit would start from zero.',
    words: [],
  },
  {
    id: 'feed',
    title: 'The live price feed',
    tag: 'The live radio broadcast',
    text: PARTS_TEXT.feed,
    does: 'Brings real prices from Bybit to the server, as they change.',
    without: 'The chart would have no live prices.',
    words: [],
  },
] as const;

/** The two roads between your browser and the server: what travels, and how it stays open */
export const STACK_LINKS: readonly string[] = [
  'HTTPS: a sealed envelope',
  'WebSocket: a phone call that stays open',
] as const;

export const HOSTING =
  "The website is served from Cloudflare Pages. The server runs on Fly.io. The database is PostgreSQL. The chart is drawn with TradingView Lightweight Charts, an open charting library. Prices come from Bybit's public market data. cryptopapertrade.com is independent: no partnership or endorsement is claimed.";

/** The big numbers of the chart section: the counts are checked against the code in the test */
export const CHART_STATS: readonly { value: string; label: string }[] = [
  { value: '9', label: 'coins: BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK' },
  { value: '10', label: 'timeframes, 1m to 1M' },
  { value: '9', label: 'indicators' },
  { value: '4', label: 'charts at once, 5 layouts' },
  { value: '$10k', label: 'pretend account' },
] as const;

export const GUIDES: readonly Feature[] = [
  {
    title: 'Pulin',
    text: 'The green candle. Asks the questions a beginner would ask.',
  },
  {
    title: 'Berwyn',
    text: 'The red candle. Answers, usually with an everyday analogy.',
  },
] as const;

export const PATH_CHAPTERS: readonly { title: string; stops: readonly string[] }[] = [
  {
    title: 'Chapter 1: Start here: crypto and trading basics',
    stops: [
      'Lesson 1 · Up, down and your first trade',
      'Lesson 2 · Money nobody controls',
      'Practice: buy your first coin',
      'Practice: sell and review',
      'Lesson 3 · News, swings and traps',
      'Lesson 4 · Trader or investor? Find your style',
      'Checkpoint: 10 questions, pass at 8',
    ],
  },
  {
    title: 'Chapter 2: Your crypto toolbox: coins, wallets and the networks behind them',
    stops: [
      'Lesson 5 · Coins and tokens',
      'Lesson 6 · Stablecoins',
      'Lesson 7 · Your wallet, your keys',
      'Lesson 8 · Why sending crypto costs a fee',
      'More lessons are on the way.',
    ],
  },
] as const;

export const QUIZ_TYPES: readonly string[] = [
  'Pick the right answer',
  'Drag steps into the right order',
  'Choose buy or sell',
  'Match boxes: each word with its meaning',
  'Draw a line on a chart',
] as const;

export const QUIZ_NOTE = 'A wrong answer shows you why, and you try again. No lives, no timers.';

export const CHECKPOINT =
  'Chapter 1 ends with ten mixed questions. Pass with 8 to open the next chapter. Already know it? You can take it early.';

export const NOT_THIS: readonly Feature[] = [
  {
    title: 'Not real money',
    text: 'The $10,000 is pretend. You cannot lose real money here, and you cannot win any. It cannot become real money.',
  },
  {
    title: 'Not advice',
    text: 'Nothing here tells you what to buy or sell. It is for learning only.',
  },
  {
    title: 'No promise of profit',
    text: 'Many beginners lose money, mostly when they trade with leverage. The lessons show the risk before the buttons.',
  },
  {
    title: 'Small on purpose',
    text: 'Huge pretend balances and very high leverage build false confidence. Here you practise with the account you would really have, and leverage stops at 10x.',
  },
] as const;

export const REMEMBER: readonly string[] = [
  'It is a practice app: pretend money, real prices.',
  'It has two halves: lessons, and a live chart with a practice desk.',
  'The server is the kitchen: it does the real work, even when you are away.',
  'Your account is remembered in a database, and kept safe with scrambled passwords and short-lived tokens.',
  'It is not advice and not real money. Learn first, risk nothing.',
] as const;

export const WORD_LIST: readonly { word: string; plain: string; picture: string }[] = [
  { word: 'Paper trading', plain: 'Practising with pretend money', picture: 'A flight simulator' },
  {
    word: 'Candle',
    plain: 'One slice of time on the chart: open, high, low, close',
    picture: 'A one-line diary of a minute',
  },
  {
    word: 'Long / short',
    plain: 'A bet that the price goes up / down',
    picture: 'Betting on rain or sun',
  },
  {
    word: 'Leverage',
    plain: 'Trading with borrowed power, so wins and losses grow',
    picture: 'A magnifying glass',
  },
  {
    word: 'Liquidation',
    plain: 'A leveraged trade closed by force when it loses too much',
    picture: 'The line you must not cross',
  },
  {
    word: 'Indicator',
    plain: 'A line worked out from the price',
    picture: 'A weather average',
  },
  {
    word: 'Spread',
    plain: 'The small gap between the buy price and the sell price',
    picture: "A shop's buy and sell rates",
  },
  {
    word: 'Browser / website',
    plain: 'What you see and click',
    picture: 'The shop window and counter',
  },
  { word: 'Server', plain: 'The computer that does the real work', picture: 'The kitchen' },
  { word: 'Database', plain: 'Where data is stored', picture: 'A filing cabinet' },
  {
    word: 'Price feed',
    plain: 'A stream of live prices from an exchange',
    picture: 'A live radio broadcast',
  },
  {
    word: 'WebSocket',
    plain: 'A connection that stays open',
    picture: 'A phone call, not letters',
  },
  { word: 'Fill engine', plain: 'Code that fills and watches orders', picture: 'The cashier' },
  { word: 'Token', plain: 'A short-lived proof you are signed in', picture: 'A wristband' },
  { word: 'Cookie', plain: 'A small note your browser keeps', picture: 'The ticket stub' },
  { word: 'Hashing', plain: 'Scrambling a password one way', picture: 'Scrambling an egg' },
  { word: 'HTTPS', plain: 'A scrambled, private connection', picture: 'A sealed envelope' },
  {
    word: 'Take-profit / stop-loss',
    plain: 'Exits that close a trade at a gain / before a bigger loss',
    picture: 'A goal line and a safety net',
  },
  {
    word: 'Stablecoin',
    plain: 'A coin that tries to keep a steady price',
    picture: 'A coat check ticket',
  },
] as const;

export const CHECK_YOURSELF: readonly { question: string; answer: string; why: string }[] = [
  {
    question: 'Is the money in this app real?',
    answer: 'No.',
    why: 'It is pretend money on real prices. You cannot lose or win real money.',
  },
  {
    question: 'What are the two halves of the app?',
    answer: 'The learning path and the live chart with a practice desk.',
    why: 'You learn an idea, then try it on a real chart.',
  },
  {
    question: 'What does one candle show?',
    answer: 'Open, high, low and close for one slice of time.',
    why: 'Green closed higher than it opened. Red closed lower.',
  },
  {
    question: 'Which part is "the kitchen"?',
    answer: 'The server.',
    why: 'It does the real work. The website is the shop window.',
  },
  {
    question: 'Why does the live chart use a WebSocket?',
    answer: 'It is a call that stays open.',
    why: 'New prices arrive the moment they happen, with no refresh.',
  },
  {
    question: 'Does your trade get filled when your browser is closed?',
    answer: 'Waiting orders and exits, yes.',
    why: "The server's fill engine watches them day and night.",
  },
  {
    question: "Why can't even the owner read your password?",
    answer: 'It is hashed.',
    why: 'Only a scrambled copy is kept, and you cannot unscramble an egg.',
  },
  {
    question: 'Why is the balance only $10,000 and leverage at most 10x?',
    answer: 'On purpose.',
    why: 'Huge balances and very high leverage build false confidence.',
  },
] as const;
