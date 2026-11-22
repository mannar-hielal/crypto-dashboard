/**
 * The words of the public landing and features pages (owner's rewrite, 2026-11-22): plain English
 * for a beginner with zero trading knowledge. One place, so the pages, their tests and the FAQ's
 * JSON-LD read the same text.
 *
 * Truth rule: every line is true of the app as built today. Numbers come from the code
 * (`ALLOWED_SYMBOLS`, `INTERVALS`, `STARTING_BALANCE`, `MAX_LEVERAGE`); the claims table's sources
 * are listed in APP_LOG ("The landing and features rewrite"). No profit promises, no predictions.
 */

// ─── Where a call to action goes ─────────────────────────────────────────────

/** What a button does once the site is live, and before it (no sign-up before launch) */
export interface Cta {
  to: string;
  label: string;
  /** Before launch there is no sign-up or chart link: the button points at the newsletter form */
  preLabel: string;
}

export const CTA_CHART: Cta = {
  to: '/chart',
  label: 'Open the live chart',
  preLabel: 'Get notified when live',
};
export const CTA_REGISTER: Cta = {
  to: '/register',
  label: 'Create a free account',
  preLabel: 'Get notified when live',
};

// ─── Beginner questions ──────────────────────────────────────────────────────
// Each one is a question the research found beginners ask or fear (the education-market report:
// "not sure where to start" 68%, "don't understand how it works" 49%, "want trustworthy
// information" 70%, fear of fraud 43%; the leverage-loss studies; "practice alone doesn't create
// skill"). Each answer ends in a "Start here" button.

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** The "Start here" button under the answer */
  cta: Cta;
}

export const BEGINNER_FAQ: readonly FaqItem[] = [
  {
    id: 'where-to-start',
    question: 'I know nothing about crypto. Where do I start?',
    answer:
      'At the very beginning. The first lessons explain what crypto is and what a price chart shows, in plain words. Each new word is explained the first time you meet it. You never need to know anything first.',
    cta: {
      to: '/register',
      label: 'Start here: make a free account',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'real-money',
    question: 'Is this real money? Can I lose any?',
    answer:
      'No. This is paper trading: pretend money on real prices. You cannot lose real money here, and you cannot win any. It is practice and it is not financial advice.',
    cta: {
      to: '/chart',
      label: 'Start here: look at the live chart',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'what-is-a-chart',
    question: 'What is a chart, and what are those red and green bars?',
    answer:
      'A chart draws a price over time. Each bar is called a candle. One candle is one slice of time, say one minute. It shows where the price started, where it ended, and how high and low it went. Green means the price went up in that slice. Red means it went down.',
    cta: {
      to: '/chart',
      label: 'Start here: watch real candles move',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'does-practice-work',
    question: 'Does practising with pretend money really work?',
    answer:
      'It helps you learn the buttons and the words without any risk. It does not prove you will do well with real money, because people act differently when real cash is on the line. That is why the lessons teach risk too, not just clicking.',
    cta: {
      to: '/register',
      label: 'Start here: try the first lesson',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'lose-money',
    question: 'Do most beginners lose money?',
    answer:
      'Many do, mostly when they trade with leverage. Leverage means trading with borrowed money, so wins and losses both get bigger. Studies of everyday traders in the EU found that most accounts lost money. Here, leverage is capped at 10x, and the lessons show you the risk before the buttons.',
    cta: {
      to: '/register',
      label: 'Start here: learn the risks first',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'scams',
    question: 'How do I not get scammed?',
    answer:
      'One lesson is about exactly this: the usual traps, like a coin that "cannot lose" or a famous face that promises easy profit. The short rule is simple. If it promises easy money, slow down and check.',
    cta: {
      to: '/register',
      label: 'Start here: open the lessons',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'free',
    question: 'Is it really free? What is the catch?',
    answer:
      'The chart is free and needs no account. A free account adds the lessons and the practice desk. No card, no ads, nothing to cancel. You do need an email address to make an account.',
    cta: {
      to: '/register',
      label: 'Start here: make a free account',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'download',
    question: 'Do I need to download anything?',
    answer:
      'No. It runs in your browser. On a phone you can add it to your home screen, and it opens like an app.',
    cta: { to: '/chart', label: 'Start here: open it now', preLabel: 'Start here: get notified' },
  },
] as const;

// ─── The path cards (hero) ───────────────────────────────────────────────────

export interface PathCard {
  id: 'chart' | 'learn';
  badge: string;
  title: string;
  bullets: readonly string[];
  cta: Cta;
  /** The `data-guide` anchor of the button */
  anchor: 'landing.hero.chart' | 'landing.hero.register';
}

export const PATH_CARDS: readonly PathCard[] = [
  {
    id: 'chart',
    badge: 'No sign up',
    title: 'Open the live chart',
    bullets: [
      'Real prices for 9 coins, moving right now',
      'Indicators, drawing tools and up to 4 charts side by side',
      'Just look around. Nothing to install.',
    ],
    cta: CTA_CHART,
    anchor: 'landing.hero.chart',
  },
  {
    id: 'learn',
    badge: 'Free account',
    title: 'Start learning',
    bullets: [
      'Short lessons from zero, with quizzes and two friendly guides',
      '$10,000 of pretend money to practise with',
      'Every practice trade is saved, so you can look back',
    ],
    cta: CTA_REGISTER,
    anchor: 'landing.hero.register',
  },
] as const;

// ─── The timeline: first click to first lessons ──────────────────────────────

export interface Milestone {
  id: string;
  title: string;
  text: string;
}

export const TIMELINE: readonly Milestone[] = [
  {
    id: 'chart',
    title: 'Open the live chart',
    text: 'No sign up. Watch real candles move and press a few buttons. You cannot break anything.',
  },
  {
    id: 'account',
    title: 'Make a free account',
    text: 'An email and a password. You get $10,000 of pretend money, and your progress is kept for you.',
  },
  {
    id: 'lesson',
    title: 'Take your first lesson',
    text: 'Short cards, small quizzes and two friendly guides. If an answer is wrong, you see why, then try again.',
  },
  {
    id: 'trade',
    title: 'Make your first practice trade',
    text: 'Buy a small piece of Bitcoin with pretend money, right from the lesson.',
  },
  {
    id: 'result',
    title: 'Close it and read the result',
    text: 'Sell it, then see what you made or lost, and what the fees took. Fees are real here, so you learn about them early.',
  },
  {
    id: 'draw',
    title: 'Draw on the chart',
    text: 'Lines, shapes and notes to mark what you see. Add indicators when you are curious.',
  },
  {
    id: 'next',
    title: 'Try the next level when you are ready',
    text: 'Limit orders, take-profit and stop-loss, going long or short. Same pretend money, same real prices.',
  },
  {
    id: 'look-back',
    title: 'Look back and learn',
    text: 'Every order and every balance change is saved. Add your own notes to a trade, and see what you would do differently.',
  },
] as const;

// ─── Lesson previews (the learning side is real) ─────────────────────────────
// `art` ids are LessonArt ids (guide/lessons.ts); titles are the lessons' own (learn/path.ts order).

export interface LessonPreview {
  number: number;
  title: string;
  blurb: string;
  art:
    | 'threePaths'
    | 'hashChain'
    | 'staircase'
    | 'friends'
    | 'keyRing'
    | 'busBlock'
    | 'twoRoads'
    | 'cloakroom';
}

export const LESSON_PREVIEWS: readonly LessonPreview[] = [
  {
    number: 1,
    title: 'Up, down and your first trade',
    blurb: 'Buy and sell, going long and short, and a first real practice trade.',
    art: 'threePaths',
  },
  {
    number: 2,
    title: 'Money nobody controls',
    blurb: 'What a ledger is, and how a chain of blocks keeps it honest.',
    art: 'hashChain',
  },
  {
    number: 3,
    title: 'News, swings and traps',
    blurb: 'Why prices jump around, and how to spot a trap.',
    art: 'staircase',
  },
  {
    number: 4,
    title: 'Trader or investor?',
    blurb: 'Two people, two styles. Find the one that fits you.',
    art: 'friends',
  },
  {
    number: 7,
    title: 'Your wallet, your keys',
    blurb: 'Who really holds your crypto, and how to keep it safe.',
    art: 'keyRing',
  },
  {
    number: 8,
    title: 'Why sending crypto costs a fee',
    blurb: 'A block is a bus, and the fee is the offer for a seat.',
    art: 'busBlock',
  },
] as const;

// ─── The nine coins (ALLOWED_SYMBOLS, apps/server/src/constants.ts) ──────────

export const COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
] as const;

// ─── Screenshots ─────────────────────────────────────────────────────────────

export interface Shot {
  id: 'chart' | 'desk' | 'lesson';
  title: string;
  caption: string;
  alt: string;
}

export const SHOTS: readonly Shot[] = [
  {
    id: 'chart',
    title: 'The live chart',
    caption: 'Real candles, indicators and drawing tools. This one needs no account.',
    alt: 'The live Bitcoin chart with green and red candles, three moving-average lines and a drawing toolbar on the left.',
  },
  {
    id: 'desk',
    title: 'The practice desk',
    caption: 'Pretend money, real prices. Buy, sell, and watch your balance below.',
    alt: 'The trading screen: the chart in the middle, an order form on the right and an account panel below showing a $10,000 balance.',
  },
  {
    id: 'lesson',
    title: 'A lesson',
    caption:
      'Short cards on top of the live chart, with a picture and a button to try it for real.',
    alt: 'A lesson card called Buy and Sell, with a drawing of a coin and a dollar swapping places, floating over the live chart.',
  },
] as const;

// ─── Where we are different: the six competitor groups ───────────────────────
// Groups, never brand names. Strengths and weaknesses come from the business-strategy report's
// "Competitive landscape" and "Why a user would pick this app over each competitor group".

export type GroupId = 'exchange' | 'charting' | 'games' | 'journals' | 'bots' | 'prop';

export interface Group {
  id: GroupId;
  /** The table's column label */
  label: string;
  /** The section's headline: what we do better, in a beginner's words */
  headline: string;
  text: string;
  /** Where they are the better pick: said out loud */
  theyWin: string;
}

export const GROUPS: readonly Group[] = [
  {
    id: 'exchange',
    label: 'Exchange demo accounts',
    headline: 'No exchange account. No push to deposit.',
    text: 'A demo account inside an exchange makes you sign up with the exchange first, and it exists so you will one day deposit real money. Here the chart opens with no sign up, and nothing nudges you toward real cash.',
    theyWin:
      'They hand out a bigger balance, hundreds of coins and much higher leverage. We keep ours small on purpose.',
  },
  {
    id: 'charting',
    label: 'Charting sites',
    headline: 'Crypto rules done properly, not just a chart.',
    text: 'Charting sites draw great charts. Their paper accounts usually treat crypto futures like simple contracts. Here, perpetual positions have funding payments, a mark price, liquidation, and cross or isolated margin. Take-profit and stop-loss can trigger on the last, mark or index price.',
    theyWin: 'They cover stocks, forex and hundreds of indicators. We are crypto only.',
  },
  {
    id: 'games',
    label: 'Simulator games',
    headline: 'No ads between your trades.',
    text: 'Phone games are fun, but many are full of ads, and some make you watch one to refill your money. Here there are no ads, you can reset your account whenever you want, and the rules are the real ones: long and short, stop-loss, take-profit.',
    theyWin: 'They have leaderboards and big communities. We have no leaderboards.',
  },
  {
    id: 'journals',
    label: 'Trading journals',
    headline: 'The journal fills itself in.',
    text: 'Journals are made for people who already trade real money, and you have to import your trades. Here every order, fee and balance change is saved for you the moment it happens. You can add your own notes to any trade.',
    theyWin:
      'Once you trade for real, a dedicated journal goes deeper. We are the place to learn first.',
  },
  {
    id: 'bots',
    label: 'Bot platforms',
    headline: 'Built for learning by hand, not for bots.',
    text: 'Bot platforms use paper trading to test automatic trading bots. This app is for people who want to learn to trade themselves, one step at a time. No card, and no subscription to cancel.',
    theyWin: 'If you want automation, they are the right tool. We have none.',
  },
  {
    id: 'prop',
    label: 'Prop-firm simulators',
    headline: 'Practice only. No fees, no deadlines.',
    text: 'Prop firms sell paid challenges, with their own rules, that can lead to a funded account. We sell nothing and promise no funding. What you do here is practice. A practice record here does not help anyone get funded, and we will never say it does.',
    theyWin: 'If funded accounts are your goal, that is their business, not ours.',
  },
] as const;

// ─── The one comparison table ────────────────────────────────────────────────
// Only what is live today. A cell is a claim about the group in general ("most do this"), from
// the strategy report's competitive landscape. 'yes' = most do, 'some' = it varies, 'no' = most
// do not. Our column's sources are in APP_LOG.

export type Mark = 'yes' | 'some' | 'no';

export interface TableRow {
  id: string;
  feature: string;
  /** Our column, then one entry per group in `GROUPS` order */
  us: Mark;
  groups: readonly [Mark, Mark, Mark, Mark, Mark, Mark];
  /** A row where we lose on purpose: shown under its own heading, with a reason */
  deliberate?: boolean;
}

export const TABLE_ROWS: readonly TableRow[] = [
  {
    id: 'no-signup',
    feature: 'Open the chart with no sign up',
    us: 'yes',
    groups: ['no', 'yes', 'some', 'no', 'no', 'no'],
  },
  {
    id: 'no-exchange',
    feature: 'No exchange account or ID needed',
    us: 'yes',
    groups: ['no', 'yes', 'yes', 'yes', 'some', 'some'],
  },
  {
    id: 'free',
    feature: 'Free to practise, no card',
    us: 'yes',
    groups: ['yes', 'some', 'some', 'no', 'some', 'no'],
  },
  {
    id: 'lessons',
    feature: 'Lessons that end in a practice trade',
    us: 'yes',
    groups: ['no', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    id: 'perps',
    feature: 'Crypto futures rules: funding, mark price, liquidation',
    us: 'yes',
    groups: ['yes', 'no', 'no', 'no', 'some', 'some'],
  },
  {
    id: 'charts',
    feature: 'Charts with drawing tools and indicators',
    us: 'yes',
    groups: ['yes', 'yes', 'some', 'no', 'some', 'some'],
  },
  {
    id: 'record',
    feature: 'A saved record of your trades, with notes',
    us: 'yes',
    groups: ['some', 'some', 'some', 'yes', 'some', 'some'],
  },
  {
    id: 'no-ads',
    feature: 'No ads, no push to deposit real money',
    us: 'yes',
    groups: ['no', 'some', 'no', 'yes', 'some', 'no'],
  },
  {
    id: 'big-balance',
    feature: 'A starting balance above $10,000',
    us: 'no',
    groups: ['yes', 'yes', 'some', 'no', 'some', 'yes'],
    deliberate: true,
  },
  {
    id: 'many-coins',
    feature: 'Hundreds of coins to pick from',
    us: 'no',
    groups: ['yes', 'yes', 'some', 'no', 'yes', 'some'],
    deliberate: true,
  },
  {
    id: 'high-leverage',
    feature: 'Leverage above 10x',
    us: 'no',
    groups: ['yes', 'some', 'no', 'no', 'some', 'some'],
    deliberate: true,
  },
] as const;

export const TABLE_NOTE =
  'What most of each group does, from public pages and reviews we read in November 2026. A tick means most do it, a tilde means it varies, a cross means most do not. Not every product fits its group. The lessons row is as far as we could find.';

export const SMALL_ON_PURPOSE =
  'Why small on purpose: huge pretend balances and 100x leverage build false confidence. Here you practise with the account you would really have, and leverage stops at 10x.';

// ─── The features page ───────────────────────────────────────────────────────

export interface Feature {
  title: string;
  text: string;
}

export const LEARN_STEPS: readonly Feature[] = [
  {
    title: 'Read a short card',
    text: 'One idea at a time, in short sentences. A new word is explained the first time it shows up.',
  },
  {
    title: 'Answer a small quiz',
    text: 'Pick an answer, drag a tile, or draw a line on a chart. If you are wrong, you see why and try again.',
  },
  {
    title: 'Try it for real',
    text: 'Many lessons end with a practice trade on the live chart. Then you look at what just happened.',
  },
  {
    title: 'Check yourself',
    text: 'Chapter 1 ends with a ten-question checkpoint. Pass it to open the next chapter. Your progress is saved, so you can stop and come back.',
  },
] as const;

export const LEARN_TOPICS: readonly Feature[] = [
  {
    title: 'Chapter 1: Start here',
    text: 'Buy and sell, going long and short, why prices swing, how to spot a trap, and whether you are a trader or an investor.',
  },
  {
    title: 'Chapter 2: Your crypto toolbox',
    text: 'Coins and tokens, stablecoins, wallets and keys, and why sending crypto costs a fee. More lessons are on the way.',
  },
] as const;

export const CHART_FEATURES: readonly Feature[] = [
  {
    title: '10 timeframes',
    text: 'Zoom from one minute to one month: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M. Each candle is one slice of that time.',
  },
  {
    title: '9 indicators',
    text: 'An indicator is a line or number worked out from the price, to help you read it. EMA, SMA, Average Price, Median Price, Typical Price, VWAP, Momentum, Rate of Change and MACD. Turn each on or off and change its colour and settings.',
  },
  {
    title: 'Drawing tools',
    text: 'Trend lines, Fibonacci levels, rectangles, text notes and freehand. Mark what you see, then come back to it.',
  },
  {
    title: 'Up to 4 charts at once',
    text: 'Five layouts: single, 2 columns, 2 rows, 3 columns, and a 2×2 grid. Link the coin, the timeframe and the crosshair across charts, or keep them apart.',
  },
  {
    title: 'Live, not delayed',
    text: 'Candles update as the market moves, with no page refresh. A small light shows if the connection is healthy, and it reconnects by itself.',
  },
  {
    title: 'Full screen',
    text: 'One click for a big, quiet chart. All the tools stay in reach.',
  },
] as const;

export const DESK_FEATURES: readonly Feature[] = [
  {
    title: '$10,000 of pretend money',
    text: 'Every account starts with the same balance. Reset it any time and start again.',
  },
  {
    title: 'Three order types',
    text: 'Market: buy or sell now. Limit: wait for the price you name. Stop: wait for a trigger price, then go.',
  },
  {
    title: 'Take-profit and stop-loss',
    text: 'Set an exit on every trade. One closes it when you are happy with the gain. The other closes it before a loss grows. You pick whether they watch the last, mark or index price.',
  },
  {
    title: 'Spot or perpetual',
    text: 'Spot: buy the coin itself. Perpetual: bet on up or down, long or short, with leverage from 1x to 10x.',
  },
  {
    title: 'Leverage with a cap',
    text: 'Leverage is a magnifying glass: 10x makes gains and losses ten times bigger. We stop at 10x on purpose, and show where liquidation would hit.',
  },
  {
    title: 'It keeps working when you leave',
    text: 'Orders and exits are checked by our server, around the clock, even with the tab closed.',
  },
] as const;

export const ACCOUNT_FEATURES: readonly Feature[] = [
  {
    title: 'Open positions',
    text: 'See each trade with its live profit or loss, its entry price and its liquidation price.',
  },
  {
    title: 'Order history',
    text: 'A list of every order you made: filled, cancelled, and rejected orders, with the fee on each.',
  },
  {
    title: 'Balance history',
    text: 'Every credit and debit is written down, so you can follow your balance step by step.',
  },
  {
    title: 'Your notes',
    text: 'Add a note to any trade: why you made it, and what you learned. The app writes its own lines too, and those stay as written.',
  },
  {
    title: 'Settings and sign-in',
    text: 'Change your name, email or password, download your data, or delete your account for good. You are in charge of it.',
  },
  {
    title: 'Your progress follows you',
    text: 'Your lessons, your balance and your orders live in your account, so you can sign in on another device and pick up where you stopped.',
  },
] as const;

export const DATA_FEATURES: readonly Feature[] = [
  {
    title: '9 real coins',
    text: 'BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX and LINK. More are planned.',
  },
  {
    title: 'Real market data',
    text: 'Prices and candles come from a real crypto exchange feed (Bybit), so what you see moves like the real thing.',
  },
  {
    title: 'See the spread',
    text: 'The gap between the best buy price and the best sell price is shown for every coin. It is a small cost of every trade, so see it before you click.',
  },
] as const;

export const DEVICE_FEATURES: readonly Feature[] = [
  {
    title: 'Add it to your home screen',
    text: 'On iPhone, Android and desktop you can install it from the browser. It opens like an app.',
  },
  {
    title: 'Works on small screens',
    text: 'The chart, the order form and your account fit a phone, a tablet and a big monitor.',
  },
  {
    title: 'Nothing to download',
    text: 'Open the page and go. It is served over HTTPS, and sign-in uses a secure cookie.',
  },
] as const;

export const FEATURES_FAQ: readonly FaqItem[] = [
  {
    id: 'cost',
    question: 'What does it cost?',
    answer:
      'Nothing. The chart is free with no account, and a free account adds the lessons and the practice desk. No card needed.',
    cta: {
      to: '/register',
      label: 'Start here: make a free account',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'real',
    question: 'Is any of it real money?',
    answer:
      'No. Your $10,000 is pretend money on real prices, for learning only. It is not financial advice and it cannot become real money.',
    cta: {
      to: '/chart',
      label: 'Start here: open the live chart',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'lessons',
    question: 'Which lessons are there today?',
    answer:
      'Eight lessons in two chapters: buy and sell, long and short, how money without a bank works, why prices swing, trader or investor, coins and tokens, stablecoins, wallets and keys, and fees. Chapter 1 ends with a checkpoint. More lessons are on the way.',
    cta: {
      to: '/register',
      label: 'Start here: open lesson 1',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'coins',
    question: 'Which coins can I practise on?',
    answer: 'Nine: BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX and LINK. More are planned.',
    cta: { to: '/chart', label: 'Start here: pick a coin', preLabel: 'Start here: get notified' },
  },
  {
    id: 'phone',
    question: 'Can I use it on my phone?',
    answer: 'Yes. It fits small screens, and you can add it to your home screen from your browser.',
    cta: {
      to: '/chart',
      label: 'Start here: open it on your phone',
      preLabel: 'Start here: get notified',
    },
  },
  {
    id: 'cap',
    question: 'Why is leverage capped at 10x and the balance only $10,000?',
    answer:
      'On purpose. Huge pretend balances and very high leverage build false confidence. This way you practise with the account you would really have, and you learn what a loss feels like at a size that matters.',
    cta: {
      to: '/register',
      label: 'Start here: learn the risks first',
      preLabel: 'Start here: get notified',
    },
  },
] as const;
