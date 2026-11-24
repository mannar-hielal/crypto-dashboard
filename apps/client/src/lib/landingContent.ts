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
  /** The "Start here" button under the answer (none for a self-check answer) */
  cta?: Cta;
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
    title: 'Trader or investor? Find your style',
    blurb: 'Two people, two styles. Find the one that fits you.',
    art: 'friends',
  },
  {
    number: 5,
    title: 'Coins and tokens: who has their own road',
    blurb: 'A coin has its own road, a token uses one. What each is for.',
    art: 'twoRoads',
  },
  {
    number: 6,
    title: 'Stablecoins: the coins that try to sit still',
    blurb: 'Coins that try to sit still, and why traders keep them.',
    art: 'cloakroom',
  },
  {
    number: 7,
    title: 'Your wallet, your keys: who holds them?',
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
    caption: 'Candles, indicators and drawing tools. This one needs no account.',
    alt: 'Screenshot of the chart page with a drawing toolbar on the left.',
  },
  {
    id: 'desk',
    title: 'The practice desk',
    caption: 'Pretend money to practise with. Buy, sell, and watch your balance below.',
    alt: 'Screenshot of the trading screen: chart, order form and account panel.',
  },
  {
    id: 'lesson',
    title: 'A lesson',
    caption:
      'Short cards on top of the live chart, with a picture and a button to try it for real.',
    alt: 'Screenshot of a lesson card with a drawing, floating over the chart.',
  },
] as const;

/** The Crypto path, opened (owner 2026-11-22): beside the chart on a desktop, full screen on a phone */
export const PATH_SHOTS = {
  desktop: {
    title: 'The Crypto path, beside the chart',
    caption:
      'On a computer the map opens at the side, so the chart stays in view. Your next step is highlighted.',
    alt: 'Screenshot of the trading screen with the Crypto trading path open on the right: Chapter 1, the first lesson ready to continue and the next stops locked.',
  },
  phone: {
    title: 'And on a phone',
    caption: 'It fills the screen, and the same map, the same stops and the same Continue button.',
    alt: 'Screenshot of the Crypto trading path on a phone: Chapter 1 with the first lesson ready to continue.',
  },
} as const;

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
    // Exchange academies, chart-site courses and game tutorials exist, so a tilde; the rest teach no lessons
    groups: ['some', 'some', 'some', 'no', 'no', 'no'],
  },
  {
    id: 'perps',
    feature: 'Crypto futures rules: funding, mark price, liquidation',
    us: 'yes',
    groups: ['yes', 'some', 'no', 'no', 'some', 'some'],
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
    groups: ['some', 'some', 'no', 'yes', 'some', 'no'],
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

// ─── The How it works page (it replaced the Features page) ───────────────────────────────────────────────────────

/** A cropped screenshot of the app that sits behind a feature card (the chart section) */
export type FeatureShot = 'timeframes' | 'indicators' | 'drawing' | 'layouts' | 'live';

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
      'Eight lessons in two chapters: buy and sell with long and short, how money without a bank works, why prices swing and how to spot a trap, trader or investor, coins and tokens, stablecoins, wallets and keys, and fees. Chapter 1 ends with a checkpoint. More lessons are on the way.',
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

// ─── Where the pretend money lives (the practice desk section) ───────────────

export const PRETEND_MONEY = {
  title: 'Where does the pretend money live?',
  text: 'In your account, right under the chart, in the Order & Account panel. It is only numbers saved on our server, so it can never turn into real money. Every practice trade changes it, and it is still there next time you come back.',
  callout: 'Your $10,000 of pretend money',
  resetTitle: 'Start again any time',
  resetText:
    'Open the account settings and press Reset account. It asks you twice, so you cannot do it by accident. Your balance goes back to $10,000.',
  /** The post-it beside the reset window: what a reset wipes, and what it leaves alone */
  resetLose: [
    'Your open trades and orders',
    'Your trade history, balance history and journal notes',
    'The coins you hold: your balance goes back to $10,000',
    'Your per-coin leverage settings',
  ],
  resetKeep: ['Your lessons and progress', 'Your account, name and sign-in'],
  panelAlt:
    'The Order and Account panel under the chart: a balance of $10,000.00, and one asset, USDT, 10,000.00.',
  resetAlt: 'The Account Settings window with a Reset account button and a Done button.',
} as const;
