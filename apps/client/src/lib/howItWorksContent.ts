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

export const DAY_STEPS: readonly Feature[] = [
  {
    title: 'Open the chart',
    text: 'No sign up. Watch real candles move and press a few buttons. You cannot break anything.',
  },
  {
    title: 'Make a free account',
    text: 'An email and a password. You get $10,000 of pretend money, and your progress is kept for you.',
  },
  {
    title: 'Read a lesson card',
    text: 'One idea at a time, in short sentences. New words are explained when they first show up.',
  },
  {
    title: 'Answer a quiz',
    text: 'Pick an answer. If you are wrong, you see why, then try again.',
  },
  {
    title: 'Place a practice buy',
    text: 'Buy a small piece of Bitcoin with pretend money, right from the lesson.',
  },
  {
    title: 'Watch it on the chart',
    text: 'See your trade move with the live price, with its profit or loss.',
  },
  {
    title: 'Close it and look back',
    text: 'Sell it. See what you made or lost, and what the fees took.',
  },
  {
    title: 'Read your history',
    text: 'Every order and every balance change is saved. Add your own notes to a trade.',
  },
] as const;

/** The restaurant picture: the four parts of the system (a left-to-right flow) */
export const PARTS: readonly Feature[] = [
  {
    title: 'Your browser',
    text: 'The shop window and counter. The website you see and click. It shows things and takes your orders. It does no cooking.',
  },
  {
    title: 'The server',
    text: 'The kitchen and back office. Where the real work happens: checking, filling orders, keeping score.',
  },
  {
    title: 'The database',
    text: 'A filing cabinet. It remembers your account, your trades, your lessons and your notes.',
  },
  {
    title: 'The live price feed',
    text: 'A live radio broadcast. The server listens to a real crypto exchange (Bybit) and relays the prices to you.',
  },
] as const;

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

export const HOSTING =
  "The website is served from Cloudflare Pages. The server runs on Fly.io. The database is PostgreSQL. The chart is drawn with TradingView Lightweight Charts, an open charting library. Prices come from Bybit's public market data. cryptopapertrade.com is independent: no partnership or endorsement is claimed.";

export const CANDLE: readonly Feature[] = [
  { title: 'Open', text: 'Where the price started in that slice of time.' },
  { title: 'Close', text: 'Where it ended.' },
  {
    title: 'High and low',
    text: 'The thin lines (the wicks) show the highest and lowest price it touched.',
  },
  { title: 'Colour', text: 'Green: it closed higher than it opened. Red: it closed lower.' },
] as const;

export const THREE_WORDS: readonly Feature[] = [
  {
    title: 'Long and short',
    text: 'Long: you hope the price goes up. Short: you hope it goes down. You can practise both.',
  },
  {
    title: 'Leverage',
    text: 'A magnifying glass. 10x makes gains and losses ten times bigger. Here it stops at 10x.',
  },
  {
    title: 'Liquidation',
    text: 'If a leveraged trade loses too much, it is closed for you and the money you put into it is gone. The app shows where that line is.',
  },
] as const;

export interface Flow {
  id: string;
  title: string;
  steps: readonly Feature[];
  note?: string;
}

export const FLOWS: readonly Flow[] = [
  {
    id: 'chart',
    title: 'The live chart',
    steps: [
      { title: 'The market', text: 'People buy and sell all day and night. Prices change.' },
      { title: 'The price feed', text: 'The exchange broadcasts every change, like a live radio.' },
      {
        title: 'Our server',
        text: 'It listens, tidies the data and passes it on over an open call.',
      },
      { title: 'Your screen', text: 'The candle grows live. No refresh needed.' },
    ],
  },
  {
    id: 'trade',
    title: 'A practice trade',
    steps: [
      { title: 'You click Buy', text: 'The order travels to the server.' },
      {
        title: 'Balance check',
        text: 'The server asks: do you have enough pretend money?',
      },
      {
        title: 'The engine fills it',
        text: 'The cashier fills it at the live price, and takes the fee.',
      },
      {
        title: 'Account updates',
        text: 'Your balance and trade are written in the filing cabinet.',
      },
      { title: 'You see it', text: 'It shows in Positions and History.' },
    ],
    note: 'The engine keeps watching your waiting orders and exits after this, even with your tab closed.',
  },
  {
    id: 'lesson',
    title: 'A lesson',
    steps: [
      { title: 'A card', text: 'One idea, short sentences, a picture.' },
      { title: 'A quiz', text: 'Wrong? You see why, and try again.' },
      {
        title: 'Try it on the chart',
        text: 'A practice trade on the live chart, then a look at what happened.',
      },
      {
        title: 'Progress saved',
        text: 'Kept in your account, so any device can pick up.',
      },
      { title: 'Next lesson', text: 'The next stop on the path opens.' },
    ],
  },
  {
    id: 'signin',
    title: 'Signing in safely',
    steps: [
      {
        title: 'You type your password',
        text: 'It travels in a sealed envelope (HTTPS).',
      },
      {
        title: 'The server checks',
        text: 'It compares with the scrambled copy. It never keeps the real password.',
      },
      {
        title: 'Wristband and stub',
        text: 'You get a token (wristband, 15 min, memory only) and a cookie (ticket stub, 7 days).',
      },
      {
        title: 'Why it is safe',
        text: 'The wristband is short-lived and never saved to disk. The stub is hidden from page scripts and stored scrambled on the server.',
      },
    ],
  },
] as const;

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
