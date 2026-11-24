/**
 * The words of the "How it works" page (owner 2026-11-22, from his tour page CPT-how-it-works.html;
 * it replaced the Features page). Plain English for a beginner; every technical word gets an
 * everyday picture. No profit promises, no predictions. The numbers (9 coins, 10 timeframes, 9
 * indicators, 4 charts, $10,000, 10x) are the app's own and are checked by the page's test.
 */

import type { Feature, FeatureShot } from '@/lib/landingContent';

/** One slide of the Why section: a title, a few short bullets (a bold lead and, if needed, a few words more) */
export interface WhySlideContent {
  id: string;
  title: string;
  bullets: readonly { lead: string; text?: string }[];
  /** One closing line under the bullets */
  note?: string;
}

/** The Why section (owner 2026-11-24: short, bullet points, easy to read) */
export const WHY_SLIDES: readonly WhySlideContent[] = [
  {
    id: 'why-doing',
    title: 'Learn by doing',
    bullets: [
      { lead: 'Read a short lesson.' },
      { lead: 'Try the idea on a real chart.' },
      { lead: 'Seeing it beats reading about it.' },
    ],
  },
  {
    id: 'why-money',
    title: 'Pretend money',
    bullets: [
      { lead: '$10,000', text: 'of pretend money.' },
      { lead: 'Practise as often as you like.' },
      { lead: 'No real money, ever.' },
    ],
  },
  {
    id: 'why-prices',
    title: 'Real prices',
    bullets: [
      { lead: 'Real, live prices.' },
      { lead: 'The chart moves like the real thing.' },
      { lead: 'Only the money is pretend.' },
    ],
  },
  {
    id: 'why-who',
    title: 'Who is it for?',
    bullets: [
      { lead: 'Know nothing about crypto?', text: 'Perfect.' },
      { lead: 'Curious, but scared of losing money?', text: 'Practise safely.' },
      { lead: 'Want to learn the buttons and the words?' },
    ],
    note: 'Nothing to know first. Each new word is explained when you meet it.',
  },
  {
    id: 'why-gets',
    title: 'What a beginner gets',
    bullets: [
      { lead: 'Understanding before risk:', text: 'charts, buy and sell, fees, losses.' },
      { lead: 'Free:', text: 'no card, no ads. The chart needs no account.' },
      { lead: 'Honest limits:', text: 'not advice, no promise of profit.' },
    ],
    note: 'Practice is not proof you would do well with real money.',
  },
] as const;

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
  /** Where the clip zooms in on a click: seconds into the clip, the spot (put in the middle of the view) as 0-1 fractions of the frame,
   *  and how long it stays zoomed (default 1.4 s). Sorted by `at`, kept inside the clip. */
  zoom: readonly TourZoom[];
}

/** One zoom-in on a click in a tour clip */
export interface TourZoom {
  at: number;
  x: number;
  y: number;
  /** Zoom factor; the default is 1.8 on a desktop clip and 1.4 on a phone one */
  scale?: number;
  hold?: number;
}

export const TOURS: readonly Tour[] = [
  {
    id: 'lesson',
    device: 'desktop',
    title: 'Finish a lesson',
    tab: 'A lesson',
    steps: [
      'Open the path and pick the next stop.',
      'Read the cards: one idea, short sentences. The clip shows two of them.',
      'Put the steps in order by dragging, or match each word to its meaning. Check your answer.',
      'A wrong answer shows you why, then you try again. Finish the lesson and the next stop opens.',
    ],
    zoom: [
      { at: 4.3, x: 0.87, y: 0.59, hold: 2.0 },
      { at: 10.4, x: 0.5, y: 0.52, hold: 6.6 },
      { at: 18.8, x: 0.5, y: 0.52, hold: 8.6 },
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
    zoom: [
      { at: 2.7, x: 0.92, y: 0.27, hold: 1.5 },
      { at: 4.3, x: 0.86, y: 0.3, hold: 1.0 },
      { at: 5.3, x: 0.92, y: 0.36, hold: 3.0 },
      { at: 8.4, x: 0.93, y: 0.9, hold: 1.3 },
      { at: 10.6, x: 0.2, y: 0.84, hold: 5.2 },
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
    zoom: [
      { at: 3.2, x: 0.75, y: 0.25, hold: 1.6 },
      { at: 5.2, x: 0.8, y: 0.33, hold: 1.6 },
      { at: 6.8, x: 0.3, y: 0.33, hold: 3.8 },
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
    zoom: [
      { at: 0.4, x: 0.03, y: 0.25, hold: 1.5 },
      { at: 1.9, x: 0.3, y: 0.45, hold: 2.0 },
      { at: 5.2, x: 0.72, y: 0.2, hold: 3.4 },
      { at: 9.3, x: 0.85, y: 0.15, hold: 2.6 },
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
    zoom: [
      { at: 0.4, x: 0.35, y: 0.06, hold: 2.2 },
      { at: 6.6, x: 0.15, y: 0.27, hold: 1.8 },
      { at: 8.6, x: 0.6, y: 0.55, hold: 3.8 },
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

/** The technology on each layer, shown as logo tiles (names only: the drawings live in `TechLogos`) */
export const STACK_TECH: Record<StackLayer['id'], readonly string[]> = {
  browser: ['React', 'Vite', 'Tailwind CSS', 'TypeScript'],
  server: ['Node.js', 'Fastify', 'Prisma', 'TypeScript'],
  database: ['PostgreSQL', 'Redis'],
  feed: ['Bybit'],
} as const;

/** The two roads between your browser and the server: what travels, and how it stays open */
export const STACK_LINKS: readonly string[] = [
  'HTTPS: a sealed envelope',
  'WebSocket: a phone call that stays open',
] as const;

export const HOSTING =
  "The website is served from Cloudflare Pages. The server runs on Fly.io. The database is PostgreSQL. The chart is drawn with TradingView Lightweight Charts, an open charting library. Prices come from Bybit's public market data. cryptopapertrade.com is independent: no partnership or endorsement is claimed.";

/** One two-faced card of the chart section: a big figure in front, the plain explanation on the back */
export interface FlipCard {
  id: string;
  /** The big figure on the front ('9', '10', '$10k'); a card with an icon instead leaves it empty */
  value: string;
  /** The words under the figure on the front */
  label: string;
  /** The back's heading and text */
  title: string;
  text: string;
  /** A faded real capture of the app behind both faces (decorative) */
  shot: FeatureShot | 'desk';
  icon?: 'drawing';
}

/** The chart section's cards: the counts are checked against the code in the test */
export const FLIP_CARDS: readonly FlipCard[] = [
  {
    id: 'coins',
    value: '9',
    label: 'coins: BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK',
    title: '9 real coins',
    text: 'BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX and LINK. More are planned. Prices come from a real crypto exchange feed (Bybit), and candles move as the market moves, with no page refresh.',
    shot: 'live',
  },
  {
    id: 'timeframes',
    value: '10',
    label: 'timeframes, 1m to 1M',
    title: '10 timeframes',
    text: 'Zoom from one minute to one month: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M. Each candle is one slice of that time.',
    shot: 'timeframes',
  },
  {
    id: 'indicators',
    value: '9',
    label: 'indicators',
    title: '9 indicators',
    text: 'An indicator is a line or number worked out from the price, to help you read it. EMA, SMA, Average Price, Median Price, Typical Price, VWAP, Momentum, Rate of Change and MACD. Turn each on or off and change its colour and settings.',
    shot: 'indicators',
  },
  {
    id: 'drawing',
    value: '',
    label: 'drawing tools',
    title: 'Drawing tools',
    text: 'Trend lines, Fibonacci levels, rectangles, text notes and freehand. Mark what you see, then come back to it.',
    shot: 'drawing',
    icon: 'drawing',
  },
  {
    id: 'charts',
    value: '4',
    label: 'charts at once, 5 layouts',
    title: 'Up to 4 charts at once',
    text: 'Five layouts: single, 2 columns, 2 rows, 3 columns, and a 2×2 grid. Link the coin, the timeframe and the crosshair across charts, or keep them apart.',
    shot: 'layouts',
  },
  {
    id: 'account',
    value: '$10k',
    label: 'pretend account',
    title: '$10,000 of pretend money',
    text: 'Every account starts with the same balance. Reset it any time and start again.',
    shot: 'desk',
  },
] as const;

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
