/**
 * The knowledge-base articles (knowledge-base plan, owner 2026-10-23): the depth behind the lessons,
 * written in our own voice from the owner's notes and checked against sources. An article opens in
 * the drawer beside the dashboard; a lesson waits behind it ("Back to Lesson 1").
 *
 * An article lists the concepts it explains (`concepts.ts`). Which lesson cards send learners here,
 * and where the learner can practise, are worked out from those lists (`graph.ts`), never written by
 * hand. Sources sit in a folded list at the end so the reading itself never leaves the app.
 *
 * Text is plain, with `**bold**` as the only markup. Pure data: no React, so the tests can walk it.
 */

import type { GuideAnchor } from '@/lib/guideAnchors';
import { FREE, type Entitlement } from './access';

export const ARTICLE_IDS = [
  'money-101',
  'suncoin',
  'bitcoin-network',
  'bitcoin-story',
  'getting-bitcoin',
  'mailboxes-keys',
  'exchange-price',
  'price-swings',
  'spot-a-scam',
] as const;
export type ArticleId = (typeof ARTICLE_IDS)[number];

export function isArticleId(value: string): value is ArticleId {
  return (ARTICLE_IDS as readonly string[]).includes(value);
}

/** The interactive pieces an article can hold (`ArticleWidgets.tsx`) */
export type WidgetId =
  | 'suncoin-notebook'
  | 'nora-cheats'
  /** Nora's edit alone, no copies to check it: Lesson 1 shows the problem, Lesson 2 the answer */
  | 'nora-edits'
  | 'order-book'
  | 'mailbox-steps'
  | 'node-jobs'
  | 'gossip'
  | 'balance-history'
  | 'stamp-check'
  | 'block-chain'
  | 'nora-answered'
  | 'address-key'
  | 'key-scenarios'
  | 'public-ledger'
  /** Bitcoin's story: the three dates on a rail, each with its picture (owner 2026-11-12) */
  | 'bitcoin-timeline'
  /** Bitcoin's story, mining: miners race to find a fingerprint starting 0000 (owner 2026-11-12) */
  | 'mining-race'
  /** How an exchange sets the price: sell into a busy and a thin queue (owner 2026-11-12) */
  | 'eat-the-queue'
  /** Candles, news and big swings: a candle drawn deal by deal */
  | 'candle-builder'
  /** The same −32.9% day at different trade sizes */
  | 'swing-sizer'
  /** Check before you trust: red flag or not? */
  | 'scam-check';

export type ArticleBlock =
  /** A section heading; `id` lets a lesson link straight to it */
  | { kind: 'h'; text: string; id?: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'table'; head: string[]; rows: string[][] }
  /** `idea`: the big idea; `warn`: a caution; `chart`: where to see it on the real screen */
  | { kind: 'callout'; tone: 'idea' | 'warn' | 'chart'; text: string; anchor?: GuideAnchor }
  | { kind: 'widget'; id: WidgetId };

export interface SelfTestItem {
  q: string;
  a: string;
}

export interface Source {
  label: string;
  url: string;
}

export interface Article {
  id: ArticleId;
  title: string;
  /** The whole article in one line, under the title (SunCoin has none: owner 2026-10-28) */
  summary?: string;
  minutes: number;
  /** Last fact-check (YYYY-MM-DD) */
  checked: string;
  access: Entitlement;
  blocks: ArticleBlock[];
  selfTest: SelfTestItem[];
  sources: Source[];
  /** Until a lesson practises this article's concepts: where it will be practised */
  practiceSoon?: string;
}

// ─── SunCoin: money in a notebook ────────────────────────────────────────────

const suncoin: Article = {
  id: 'suncoin',
  title: 'SunCoin: money in a notebook',
  minutes: 3,
  checked: '2026-10-28',
  access: FREE,
  // Owner 2026-10-25: this article only lays out the problem; the answer is the next article's
  blocks: [
    {
      kind: 'p',
      text: 'Three friends, Emi, Leo and Sofia, want their own pretend money: **SunCoin**. No bank, no app, no blockchain. Just a notebook, kept by their friend **Nora**, who takes the job very seriously. She hands out the first SunCoins: 6 to Emi, 4 to Leo and 5 to Sofia. That’s 15 SunCoins in the whole world. Small economy. Big responsibility.',
    },
    { kind: 'widget', id: 'suncoin-notebook' },
    { kind: 'h', text: 'A payment is just one new line' },
    {
      kind: 'p',
      text: 'Leo wants Emi’s sticker pack for 3 SunCoins. Nothing physical changes hands. Leo tells Nora “Send 3 to Emi”, and Nora writes one line: Leo → Emi, 3. Later Sofia pays Leo 2 for a sketch, and Emi pays Sofia 4 for a concert ticket. Two more lines. Nothing is ever rubbed out.',
    },
    { kind: 'h', text: 'The surprise: nobody’s balance is written down', id: 'no-balances' },
    {
      kind: 'p',
      text: 'Look at the notebook again. There’s no “Emi has 5” anywhere, only the list. To know what anyone has, you read it from the top and keep a running count:',
    },
    {
      kind: 'list',
      items: ['**Emi:** +6, +3, −4 = 5', '**Leo:** +4, −3, +2 = 3', '**Sofia:** +5, −2, +4 = 7'],
    },
    {
      kind: 'p',
      text: '5 + 3 + 7 = 15, exactly what was handed out. No coin appeared or vanished. This list is called a **ledger**, and your “balance” is simply what the list adds up to for you.',
    },
    { kind: 'h', text: 'What can go wrong with one Nora?', id: 'one-nora' },
    {
      kind: 'p',
      text: 'SunCoin works only because everyone trusts Nora. With a pen she could:',
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        '**Print coins.** Write “Start → Leo, 100”, and everyone else’s coins buy less.',
        '**Move your coins without asking.** Write “Sofia → Emi, 7” when Sofia never agreed.',
        '**Rewrite history.** Quietly change line 4 so that Leo never paid.',
        '**Lose everything.** Spill coffee on the only copy, and every balance is gone.',
      ],
    },
    { kind: 'widget', id: 'nora-cheats' },
    {
      kind: 'p',
      text: 'Nora doesn’t even have to be dishonest. She can make a mistake, get pressured by a friend, or simply be away when Leo needs to pay. Banks, payment apps and games keep their money exactly like this, with one trusted keeper of the notebook. Mostly that works well. But it always means trusting that keeper.',
    },
    { kind: 'h', text: 'Your turn: what would you fix?', id: 'what-to-fix' },
    {
      kind: 'p',
      text: 'Look at the four risks again. They share one cause: a single person holds the only pen and the only copy. Now imagine the notebook weren’t Nora’s alone. What if every friend kept a copy, checked each new line before writing it down, and nobody could change the past without the others noticing?',
    },
    {
      kind: 'callout',
      tone: 'idea',
      text: '**The question SunCoin leaves us with:** can money work with no Nora at all, kept and checked by many people who don’t need to trust each other? Lesson 2, and the article after this one, show one answer.',
    },
  ],
  selfTest: [
    {
      q: 'In Nora’s notebook, where is Emi’s balance written?',
      a: 'Nowhere. It’s worked out by reading the list from the top.',
    },
    {
      q: 'Name two things a single notebook keeper could do to cheat.',
      a: 'Print coins, move coins without asking, or rewrite history.',
    },
    {
      q: 'What happens to SunCoin if the only notebook is lost?',
      a: 'Every balance is gone: the notebook is the money.',
    },
    {
      q: 'What do all four risks have in common?',
      a: 'One person holds the only pen and the only copy.',
    },
  ],
  sources: [
    {
      label: 'Investopedia, “What Is a Ledger?”',
      url: 'https://www.investopedia.com/terms/l/ledger.asp',
    },
    {
      label: 'Bank of England, “Money creation in the modern economy” (2014)',
      url: 'https://www.bankofengland.co.uk/quarterly-bulletin/2014/q1/money-creation-in-the-modern-economy',
    },
  ],
};

// ─── Many notebooks, no Nora: how Bitcoin's network keeps the record ─────────
// From the owner's "Bitcoin mining for beginners" page (2026-10-25), retold with SunCoin's cast:
// Nora is the keeper Bitcoin removes, so the one paying here is Sofia. The lecture's 2018 numbers
// are left out or replaced by ones that don't date (sources below). Nodes and miners are kept apart:
// every node stores, relays and checks; miners are the nodes that also race to add the next page.

const bitcoinNetwork: Article = {
  id: 'bitcoin-network',
  title: 'Many notebooks, no Nora: how Bitcoin keeps the record',
  summary:
    'Thousands of computers each keep a copy of the ledger and check every payment, so nobody has to trust a Nora.',
  minutes: 4,
  checked: '2026-11-08',
  access: FREE,
  // Owner 2026-11-08: short, and a graphic for every process; the long text version lives in git
  blocks: [
    {
      kind: 'callout',
      tone: 'idea',
      text: '**SunCoin without Nora:** each of those computers is a **node**. Anyone can run one, and there is no off switch.',
    },
    { kind: 'h', text: 'Three jobs, every node', id: 'three-jobs' },
    { kind: 'widget', id: 'node-jobs' },
    {
      kind: 'p',
      text: 'Relaying is gossip, checked at every step. Send a payment and watch it spread:',
    },
    { kind: 'widget', id: 'gossip' },
    { kind: 'h', text: 'Two checks for every payment', id: 'checks' },
    {
      kind: 'p',
      text: '**1. Does Sofia have the coins?** No balance is stored, as in Nora’s notebook: a node adds up her history.',
    },
    { kind: 'widget', id: 'balance-history' },
    {
      kind: 'p',
      text: '**2. Is it really Sofia?** She marks each payment with a stamp only she holds, her **private key**. Everyone has a matching checker, her **public key**, which can test a mark but never make one.',
    },
    { kind: 'widget', id: 'stamp-check' },
    {
      kind: 'callout',
      tone: 'idea',
      text: '**The key idea:** checking a mark is easy for anyone; making one without the private key is practically impossible.',
    },
    { kind: 'h', text: 'Pages that seal each other', id: 'blocks' },
    {
      kind: 'p',
      text: 'Payments are grouped into pages called **blocks**, each sealed with a fingerprint of the one before. That chain is the **blockchain**. Try changing an old line:',
    },
    { kind: 'widget', id: 'block-chain' },
    {
      kind: 'p',
      text: 'About every 10 minutes, **miners** race to add the next page by solving a costly puzzle, and the winner is paid in new bitcoin plus fees. Every node checks the page before accepting it.',
    },
    { kind: 'h', text: 'Nora’s four problems, answered', id: 'answered' },
    { kind: 'widget', id: 'nora-answered' },
    {
      kind: 'callout',
      tone: 'warn',
      text: '**“Decentralized” is a spectrum, not a switch:** a few big groups of miners (pools) find most blocks today.',
    },
  ],
  selfTest: [
    {
      q: 'Name the three jobs every node does.',
      a: 'Store the ledger, relay payments, verify payments.',
    },
    {
      q: 'Why can’t Sneaky Sam spend Sofia’s coins?',
      a: 'He can’t make Sofia’s mark without her private key, and her public key catches any fake.',
    },
    {
      q: 'What happens if someone changes an old line in the blockchain?',
      a: 'That page’s fingerprint changes, so the seal on every later page breaks and every node rejects it.',
    },
  ],
  sources: [
    {
      label: 'Satoshi Nakamoto, “Bitcoin: A Peer-to-Peer Electronic Cash System” (2008)',
      url: 'https://bitcoin.org/bitcoin.pdf',
    },
    {
      label: 'Bitcoin developer guide: the peer-to-peer network',
      url: 'https://developer.bitcoin.org/devguide/p2p_network.html',
    },
    {
      label: 'Bitnodes: reachable Bitcoin nodes, counted live',
      url: 'https://bitnodes.io/',
    },
  ],
};

// ─── How an exchange sets the price ──────────────────────────────────────────
// Rewritten for the rebuilt Lesson 3 (2026-11-12): the candles and news moved to `price-swings`;
// liquidity got the Binance.US story, slippage and the eat-the-queue widget.

const exchangePrice: Article = {
  id: 'exchange-price',
  title: 'How an exchange sets the price',
  summary:
    'Nobody decides the price of Bitcoin. The number on your screen is the last deal between someone who wanted to buy and someone who wanted to sell.',
  minutes: 4,
  checked: '2026-11-12',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'Two queues', id: 'queues' },
    {
      kind: 'p',
      text: 'An **exchange** is a marketplace for coins. Buyers say what they’re willing to pay: these are **bids**. Sellers say what they’re willing to accept: these are **asks**. The exchange keeps them in two queues sorted by price, buyers bidding up from below and sellers asking down from above. Together they are the **order book**.',
    },
    { kind: 'widget', id: 'order-book' },
    { kind: 'h', text: 'The last deal is “the price”', id: 'last-deal' },
    {
      kind: 'p',
      text: 'A deal happens when the two queues meet: a buyer agrees to pay what the cheapest seller asks, or a seller agrees to take what the highest buyer bids. The exchange matches them in a fraction of a second, and that deal’s price becomes the **last price**, the big number at the top of your chart.',
    },
    {
      kind: 'p',
      text: 'Then the next deal happens, and the next. That’s why the price ticks while you watch. More eager buyers take the asks one by one, and the price climbs; more eager sellers take the bids, and it falls. Nobody pushes a button marked “price”. The price is people.',
    },
    {
      kind: 'callout',
      tone: 'chart',
      anchor: 'symbolbar.price',
      text: 'On the chart: the live price at the top of the screen. Watch it for ten seconds and count the deals.',
    },
    { kind: 'h', text: 'The gap: the spread', id: 'spread' },
    {
      kind: 'p',
      text: 'There’s usually a small gap between the best bid and the best ask. That gap is the **spread**, and it’s the first thing every trade costs you. Buy at market and you pay the best ask; sell straight back and you get the best bid. You’d lose the spread, plus fees, even if the price didn’t move at all.',
    },
    {
      kind: 'callout',
      tone: 'chart',
      anchor: 'trade.spread',
      text: 'On the chart: the order form shows the current spread.',
    },
    { kind: 'h', text: 'When the queue runs thin', id: 'liquidity' },
    {
      kind: 'p',
      text: '**Liquidity** is how many offers wait close to the price. On 21 October 2021, at 11:34 UTC, a trading program on the Binance.US exchange sold a huge amount of bitcoin at once. It took the best bid, then the next, then the next, down a queue that ran thin fast. For a moment one bitcoin sold for **$8,200**, about 87% below the price a minute earlier. Within the minute it was back. Other exchanges barely moved: on Bybit that minute’s low was about 2% down. The exchange said the trader’s algorithm had a bug.',
    },
    {
      kind: 'p',
      text: 'Each of those deals was “the price” for an instant. The gap between the price you expected and the price you actually got is called **slippage**. Try it below: sell the same amount into a busy queue and a thin one.',
    },
    { kind: 'widget', id: 'eat-the-queue' },
    { kind: 'h', text: 'Small coins, thin queues', id: 'small-coins' },
    {
      kind: 'p',
      text: 'Bitcoin against USDT on a large exchange is one of the deepest markets in crypto. Smaller coins are thinner. In 2025 a typical day’s range, from the day’s high to its low, was about 3% for Bitcoin and about 6.5% for Dogecoin on Bybit: roughly twice as wide. Many smaller coins are thinner still, and the way out is hardest exactly when everyone wants out at once. A later lesson looks at other coins in more depth.',
    },
    { kind: 'h', text: 'Don’t eat the whole queue', id: 'limit' },
    {
      kind: 'p',
      text: 'A **market order** takes whatever is waiting, at whatever price. A **limit order** sets the worst price you’ll accept: what can fill at that price or better fills, and the rest waits in the queue until someone meets it, or until you cancel it. Trading an amount the queue can absorb, and using a limit when it’s thin, keeps slippage small.',
    },
  ],
  selfTest: [
    {
      q: 'What does the big price number on your screen mean?',
      a: 'The price of the most recent deal.',
    },
    {
      q: 'You buy at market and sell straight back a second later. Why do you get back less?',
      a: 'You bought at the ask and sold at the bid: the spread, plus fees, is gone.',
    },
    {
      q: 'A big sell order hits a thin queue. What happens to the last price?',
      a: 'It falls to the last level the order reached: each deal is lower than the one before.',
    },
    {
      q: 'What does a limit order protect you from?',
      a: 'Slippage past a price you set: the part that can’t fill at your price waits instead.',
    },
  ],
  sources: [
    {
      label: 'Bybit v5 API: the order book',
      url: 'https://bybit-exchange.github.io/docs/v5/market/orderbook',
    },
    {
      label:
        'CoinDesk: Bitcoin flash crash on Binance.US attributed to a trader’s algorithm bug (21 Oct 2021)',
      url: 'https://www.coindesk.com/markets/2021/10/21/bitcoin-price-flash-crash-on-binanceus-attributed-to-trader-algorithm-bug',
    },
    {
      label: 'The Block: Binance.US blames the flash crash to $8,200 on a bug (21 Oct 2021)',
      url: 'https://www.theblock.co/post/121657/binance-us-blames-bitcoin-flash-crash-to-8200-on-a-bug-in-a-clients-trading-algorithm',
    },
    {
      label:
        'Prices: Bybit BTCUSDT and DOGEUSDT perpetual candles, 1-minute and daily (checked 2026-11-12)',
      url: 'https://bybit-exchange.github.io/docs/v5/market/kline',
    },
  ],
};

// ─── Candles, news and big swings ────────────────────────────────────────────
// New for the rebuilt Lesson 3 (2026-11-12): candles and news moved from `exchange-price`, plus the
// postponed volatility section and "size for the fall". Prices: Bybit BTCUSDT perpetual daily.

const priceSwings: Article = {
  id: 'price-swings',
  title: 'Candles, news and big swings',
  summary:
    'A candle sums up a slice of deals. News moves the price either way, and crypto’s swings are big in both directions, so the size of a trade matters more than its timing.',
  minutes: 4,
  checked: '2026-11-12',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'From deals to candles', id: 'candles' },
    {
      kind: 'p',
      text: 'Thousands of deals happen every minute, so charts sum them up. A **candle** covers every deal in one slice of time, a minute, an hour or a day:',
    },
    {
      kind: 'list',
      items: [
        '**Open:** the first deal’s price in that slice.',
        '**Close:** the last deal’s price.',
        '**High and low:** the thin lines, called wicks, reach the highest and lowest deals.',
        '**Colour:** green if it closed higher than it opened, red if lower.',
      ],
    },
    { kind: 'widget', id: 'candle-builder' },
    {
      kind: 'p',
      text: 'A candle describes what already happened. A green candle doesn’t mean “buy” and a red one doesn’t mean “sell”. It’s a weather report, not a forecast.',
    },
    {
      kind: 'callout',
      tone: 'chart',
      anchor: 'pane.chart',
      text: 'On the chart: hover the newest candle on the far right. It’s still being drawn, so its close is the last price.',
    },
    { kind: 'h', text: 'A market that never closes', id: 'always-open' },
    {
      kind: 'p',
      text: 'Stock markets close at night and at weekends. Crypto trades every hour of every day, so new candles keep coming through nights and holidays. Quieter hours often mean thinner queues, and a thin queue jumps further when a big order arrives (see how an exchange sets the price, on liquidity).',
    },
    { kind: 'h', text: 'Why news doesn’t tell you the direction', id: 'news' },
    {
      kind: 'p',
      text: 'If price is people, news moves it by changing what people are willing to pay. But nobody knows in advance how people will react:',
    },
    {
      kind: 'list',
      items: [
        '**8 February 2021:** Tesla said it had bought $1.5 billion of Bitcoin. Over the next two weeks the price rose from about $39,000 to above $57,000.',
        '**12 May 2021:** Tesla said it would stop accepting Bitcoin. The price fell 12.5% that day.',
        '**24 September 2021:** China’s central bank declared crypto business illegal. Bitcoin’s low that day was 9.3% below its open, and it closed 4.5% down: a real drop, not the wipe-out some retellings describe.',
        '**10 January 2024:** the US approved the first funds that hold Bitcoin directly, widely called the year’s biggest crypto news. Two weeks later the price was about 15% lower.',
      ],
    },
    {
      kind: 'callout',
      tone: 'idea',
      text: 'Looking back, each move feels obvious. That’s hindsight. On the day, nobody knew, which is why careful traders plan for both directions before they act.',
    },
    { kind: 'h', text: 'Big, fast swings: volatility', id: 'volatility' },
    {
      kind: 'p',
      text: '**Volatility** is how far and how fast a price swings. On 19 May 2021 bitcoin opened near $42,900, fell as low as $28,801, 32.9% down, and closed the day near $36,700. The next day it rose 10.3%, and on 24 May it rose 12.0%. Swings run both ways, which is exactly why no one can time them. Even in a calmer year like 2025, bitcoin’s typical day still ranged about 3% from high to low.',
    },
    { kind: 'h', text: 'Size for the fall', id: 'size' },
    {
      kind: 'p',
      text: 'What you could lose is the amount you put in times the fall. You can’t choose the swing, but you choose the amount. Before a trade, picture a fall like 19 May’s and ask whether you could watch it calmly. If not, the trade is too big. Practice money is the place to learn how a fall feels, before it’s your own.',
    },
    { kind: 'widget', id: 'swing-sizer' },
  ],
  selfTest: [
    {
      q: 'A candle is green. What does that tell you?',
      a: 'That slice of time closed higher than it opened. Nothing about what comes next.',
    },
    {
      q: 'Good news comes out. What happens to the price?',
      a: 'It could go either way. No one knows in advance.',
    },
    {
      q: 'What is volatility?',
      a: 'How far and how fast a price swings, in both directions.',
    },
    {
      q: 'Two traders live through the same −30% day; one loses $30, the other $300. What differed?',
      a: 'Only the size of their trades. The swing was the same for both.',
    },
  ],
  sources: [
    {
      label: 'Prices: Bybit BTCUSDT perpetual daily candles (checked 2026-11-12)',
      url: 'https://bybit-exchange.github.io/docs/v5/market/kline',
    },
    {
      label: 'Tesla’s annual report for 2020 (Form 10-K, filed 8 Feb 2021), SEC EDGAR',
      url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&type=10-K',
    },
    {
      label: 'SEC Chair’s statement on the approval of spot bitcoin funds (10 Jan 2024)',
      url: 'https://www.sec.gov/news/statement/gensler-statement-spot-bitcoin-011023',
    },
  ],
};

// ─── Check before you trust ──────────────────────────────────────────────────
// New for the rebuilt Lesson 3 (2026-11-12). Squid Game token: CoinDesk and Cointelegraph, 1 Nov
// 2021. No price is quoted: reports vary and nothing can be checked against Bybit.

const spotAScam: Article = {
  id: 'spot-a-scam',
  title: 'Check before you trust: rug pulls and fake coins',
  summary:
    'A price on a screen only means someone traded. Before you trust a coin, check who runs it, whether you can sell it, and what it promises.',
  minutes: 4,
  checked: '2026-11-12',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'The Squid Game token', id: 'squid' },
    {
      kind: 'p',
      text: 'In late October 2021 a new token named after the Netflix series Squid Game appeared. It had nothing to do with Netflix. Its price climbed for days, and headlines about the climb brought in more buyers. Then buyers found they couldn’t sell it. On 1 November its creators cashed out millions of dollars, its website and social accounts disappeared, and the price fell to almost nothing. The rise had been real deals, between real buyers and a project built to trap them.',
    },
    { kind: 'h', text: 'How a rug pull works', id: 'rug-pull' },
    {
      kind: 'p',
      text: 'A **rug pull** is when a coin’s creators take the buyers’ money and vanish. The creators usually hold most of the coins and control the money waiting to buy them. Sometimes the code itself stops ordinary holders from selling. Once enough buyers are in, the creators sell everything into their money and leave. It’s the thin queue at its worst: when you want out, there is no queue at all.',
    },
    { kind: 'h', text: 'Three checks before you trust a coin', id: 'checklist' },
    {
      kind: 'list',
      ordered: true,
      items: [
        '**Who runs it?** Real, named people or a company that can be held to account somewhere. An anonymous team is a red flag on its own.',
        '**Can you sell it?** A real, busy queue on a large exchange, not just one website. If a small test sale fails, stop.',
        '**What does it promise?** No honest project promises a fixed return. “2% a day” is a warning, not a reason.',
      ],
    },
    { kind: 'widget', id: 'scam-check' },
    { kind: 'h', text: 'The same trick in other costumes', id: 'costumes' },
    {
      kind: 'p',
      text: 'The pattern repeats with new clothes. Fake “support” asks for your recovery phrase (Lesson 2: never share it). Copycat coins borrow a famous name or logo. Apps show your balance growing but ask for a fee before you can withdraw: if you can’t take it out, it isn’t yours. Popularity proves nothing either: a celebrity post or a week of rises only means people traded.',
    },
    { kind: 'h', text: 'Why smart people fall for it', id: 'why' },
    {
      kind: 'p',
      text: 'Scams don’t win by fooling careless people. They win by hurrying careful ones. A countdown, a “last chance”, a friend who says they already doubled their money: each one pushes you to act before you check. A rising price adds to it, because a chart that only goes up looks like proof. It isn’t. It only shows that people traded, and in a rug pull many of those trades are the creators’ own. The fix is dull and it works: slow down, run the three checks, and if anything fails, walk away. Missing a real chance costs you nothing; walking into a trap can cost you everything you put in.',
    },
    { kind: 'h', text: 'If you’ve already been caught', id: 'caught' },
    {
      kind: 'p',
      text: 'Stop sending money, even if you’re told a fee will unlock what you’ve lost: that’s the same scam asking twice. Keep the messages, addresses and receipts. Report it to the police and, in the US, to the Federal Trade Commission. Be wary of anyone who then offers to recover your coins for a fee: “recovery” services are one of the most common follow-up scams.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      text: 'Here, everything is practice money. Out there, a promise of sure returns is the clearest warning sign there is.',
    },
  ],
  selfTest: [
    {
      q: 'What made the Squid Game token a trap, besides its crash?',
      a: 'Buyers couldn’t sell it, and its creators vanished with the money.',
    },
    {
      q: 'Name the three checks before you trust a coin.',
      a: 'Who runs it, whether you can sell it, and what it promises.',
    },
    {
      q: 'Someone from “support” asks for your recovery phrase. What is it?',
      a: 'A scam. Never share it: whoever has it controls your coins.',
    },
  ],
  sources: [
    {
      label:
        'CoinDesk: Squid Game token crashes; developers say they’ve left the project (1 Nov 2021)',
      url: 'https://www.coindesk.com/markets/2021/11/01/squid-game-token-crashes-developers-say-theyve-left-the-project/',
    },
    {
      label: 'US Federal Trade Commission: what to know about cryptocurrency and scams',
      url: 'https://consumer.ftc.gov/articles/what-know-about-cryptocurrency-and-scams',
    },
  ],
  practiceSoon: 'Lesson 4, Not all crypto is Bitcoin',
};

// ─── Mailboxes and keys ──────────────────────────────────────────────────────

const mailboxesKeys: Article = {
  id: 'mailboxes-keys',
  title: 'Mailboxes and keys: how a Bitcoin payment works',
  summary:
    'An address is a mailbox slot anyone can post bitcoin into. A private key is the only key that opens the box. Whoever holds the key controls the bitcoin.',
  minutes: 3,
  checked: '2026-11-12',
  access: FREE,
  // Owner 2026-11-08: the Many notebooks recipe, one line of text and a graphic to tap
  blocks: [
    { kind: 'h', text: 'Two things, two rules', id: 'key' },
    { kind: 'widget', id: 'address-key' },
    { kind: 'h', text: 'A payment, step by step' },
    { kind: 'widget', id: 'mailbox-steps' },
    {
      kind: 'callout',
      tone: 'warn',
      text: '**There is no undo.** Send the wrong amount, or to the wrong address, and no bank can reverse it. You can post a letter; you can’t un-post it.',
    },
    { kind: 'h', text: 'Your bitcoin isn’t in your phone', id: 'phone' },
    {
      kind: 'p',
      text: 'Your bitcoin is recorded on the blockchain, not stored in your phone. Your phone holds only the key, and a list of **recovery words** backs it up. See what each loss means:',
    },
    { kind: 'widget', id: 'key-scenarios' },
    {
      kind: 'callout',
      tone: 'warn',
      text: '**One rule:** never share a private key or recovery words, and never type them into a website. Real support never asks for them.',
    },
    { kind: 'h', text: 'Public, but not named', id: 'public' },
    {
      kind: 'p',
      text: 'Every payment is public forever, but it shows addresses, not names. That’s **pseudonymous**, not anonymous:',
    },
    { kind: 'widget', id: 'public-ledger' },
    {
      kind: 'callout',
      tone: 'idea',
      text: '**On this app** your practice account holds no keys and no real coins: the safe place to learn before any of this matters.',
    },
  ],
  selfTest: [
    { q: 'What can a stranger do with your address?', a: 'Send you bitcoin. Nothing else.' },
    {
      q: 'Someone asks for your recovery words to “verify your wallet”. What is it?',
      a: 'A scam. Never share them.',
    },
    {
      q: 'Where does your bitcoin actually live?',
      a: 'On the blockchain. You hold the key.',
    },
    {
      q: 'Is Bitcoin anonymous?',
      a: 'No, pseudonymous: payments are public, and can be traced once an address is linked to you.',
    },
  ],
  sources: [
    {
      label:
        'Satoshi Nakamoto, “Bitcoin: A Peer-to-Peer Electronic Cash System” (2008), §10 Privacy',
      url: 'https://bitcoin.org/bitcoin.pdf',
    },
  ],
};

// ─── Money 101 ───────────────────────────────────────────────────────────────

const money101: Article = {
  id: 'money-101',
  title: 'Money 101: what makes something money',
  summary:
    'Money is whatever people accept for paying, for swapping and for comparing what things are worth. Almost every kind depends on someone in charge, and that is the weakness Bitcoin was built around.',
  minutes: 2,
  checked: '2026-10-23',
  access: FREE,
  // Lesson 1's money-and-trust cards moved to a later lesson in the rewrite (owner 2026-11-16)
  practiceSoon: 'a later lesson on money and trust',
  blocks: [
    { kind: 'h', text: 'Three jobs' },
    {
      kind: 'p',
      text: 'Here’s a strange thought: a banknote is paper, yet a baker hands you bread for it. Why? Because money is anything people accept to **swap** for things, to **compare** what things are worth, and to **keep** value for later. A banknote does all three. So, for some people, does Bitcoin. (The baker doesn’t mind which, as long as it works.)',
    },
    { kind: 'h', text: 'Three classic kinds' },
    {
      kind: 'list',
      ordered: true,
      items: [
        '**Commodity money** is money that is also a thing: gold, silver, salt. It’s valuable because it’s rare and takes effort to get.',
        '**Representative money** is a paper promise for a thing: a certificate you could, in principle, swap back for gold.',
        '**Fiat money** is money because a government says so: dollars, euros, francs. Nothing stands behind it except trust in the government and in each other, and the government can print more.',
      ],
    },
    { kind: 'h', text: 'The fourth kind: digital money' },
    {
      kind: 'p',
      text: 'Money that lives only on computers. Gamers know it well. **V-Bucks** buy skins in Fortnite, and Epic Games sets their price. **Robux** can even be turned back into real money by some creators, on Roblox’s terms. Rare **game skins** trade for real money, a bit like collectable cards, but the game company can change the rules.',
    },
    {
      kind: 'callout',
      tone: 'idea',
      text: 'All of these are only as safe as the company running them. If it changes the rules, shuts down or closes your account, your balance can shrink or vanish.',
    },
    { kind: 'h', text: 'The weakness they share', id: 'weakness' },
    {
      kind: 'p',
      text: 'Every kind except the gold in your hand depends on **someone in charge**: a government, a bank or a company. When that someone prints too much or changes the rules, the money suffers. Venezuela and Zimbabwe saw prices run out of control; in 2016 India withdrew its two largest banknotes almost overnight.',
    },
    { kind: 'h', text: 'Why this sets up Bitcoin' },
    {
      kind: 'p',
      text: 'Bitcoin was proposed in 2008, as the financial crisis hit the banks, and launched in January 2009. Its central idea is money with no one in charge: the records are kept and checked by many independent computers, and the rules can’t be changed by any one of them. That is what **decentralized** means.',
    },
  ],
  selfTest: [
    { q: 'Which kind of money is also a useful thing?', a: 'Commodity money, like gold.' },
    {
      q: 'Which kind is money only because a government says so?',
      a: 'Fiat money: dollars, euros, francs.',
    },
    {
      q: 'What does almost every kind of money depend on?',
      a: 'Trust in someone in charge: a government, a bank or a company.',
    },
    { q: 'What problem was Bitcoin designed around?', a: 'Having to trust one authority.' },
  ],
  sources: [
    {
      label: 'Bank of England: what is money?',
      url: 'https://www.bankofengland.co.uk/explainers/what-is-money',
    },
    {
      label: 'Satoshi Nakamoto, “Bitcoin: A Peer-to-Peer Electronic Cash System” (2008)',
      url: 'https://bitcoin.org/bitcoin.pdf',
    },
  ],
};

// ─── Bitcoin's story ─────────────────────────────────────────────────────────

const bitcoinStory: Article = {
  id: 'bitcoin-story',
  title: 'Bitcoin’s story, and its plan in plain words',
  summary:
    'In 2008 someone called Satoshi Nakamoto published a nine-page plan for online cash without a bank. Its idea fits in one line: replace “trust me” with “check it”.',
  minutes: 3,
  checked: '2026-11-12',
  access: FREE,
  // Practised in Lesson 2's Bitcoin card, whose Read more opens it (owner 2026-11-12)
  blocks: [
    { kind: 'h', text: 'A short timeline', id: 'timeline' },
    { kind: 'widget', id: 'bitcoin-timeline' },
    // Owner 2026-11-12: the plan as one-liners; mining expanded, last, with the mining race
    { kind: 'h', text: 'The plan, in six steps' },
    {
      kind: 'list',
      ordered: true,
      items: [
        '**The problem:** paying online means trusting a middleman.',
        '**The idea:** replace “trust me” with “check it”.',
        '**The catch:** digital money is data, and data can be spent twice.',
        '**A shared notebook:** everyone keeps every payment, in order.',
        '**Sealed pages:** each block carries a fingerprint of the one before.',
        '**Work to add a page:** miners solve a hard puzzle first (see Mining, below).',
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      text: 'Public isn’t the same as anonymous. Every payment can be seen; only the names are missing. The paper says so itself.',
    },
    { kind: 'h', text: 'Mining: how a new block is added', id: 'mining' },
    {
      kind: 'p',
      text: 'Miners gather the payments waiting to be recorded into a block. Before it can join the chain, they must find a number that gives the block a fingerprint, its **hash**, starting with a long run of zeros. There is no shortcut: only guessing, trillions of times a second. Try it:',
    },
    { kind: 'widget', id: 'mining-race' },
    {
      kind: 'p',
      text: 'The first miner to find one shares the block. Every node checks it with a single calculation (hard to find, easy to check) and adds it to its copy, and the race starts again. A new block comes about every **10 minutes**: every 2,016 blocks, roughly two weeks, the puzzle gets harder or easier to keep that pace.',
    },
    {
      kind: 'p',
      text: 'The winner is paid twice: in **new bitcoin**, the block reward, and in the **fees** of the payments inside. The reward halves every 210,000 blocks, about every four years: 50, 25, 12.5, 6.25, and 3.125 bitcoin since April 2024. That is why no more than 21 million bitcoin will ever exist; the last are due around 2140.',
    },
    {
      kind: 'p',
      text: 'It also keeps the record honest. To rewrite an old block, a cheater would have to redo its work and the work of every block after it, faster than all the other miners together. Following the rules pays better than cheating.',
    },
    {
      kind: 'callout',
      tone: 'idea',
      text: 'Mining today runs in warehouses of specialised machines and uses a lot of electricity. A laptop can’t compete, and you never need to mine to own bitcoin.',
    },
  ],
  selfTest: [
    {
      q: 'Who wrote the Bitcoin paper?',
      a: 'Someone using the name Satoshi Nakamoto. Nobody knows who.',
    },
    {
      q: 'What problem does a shared notebook solve?',
      a: 'Spending the same coin twice: everyone can see it was already spent.',
    },
    {
      q: 'Why do miners do the work?',
      a: 'They are paid in new bitcoin and fees for each block they add.',
    },
    {
      q: 'Why is a block hard to add but easy to check?',
      a: 'Finding the winning number takes trillions of guesses; checking it takes one calculation.',
    },
    {
      q: 'What happens to the block reward about every four years?',
      a: 'It halves: it’s 3.125 bitcoin since April 2024, which caps the supply at 21 million.',
    },
  ],
  sources: [
    {
      label: 'Satoshi Nakamoto, “Bitcoin: A Peer-to-Peer Electronic Cash System” (2008)',
      url: 'https://bitcoin.org/bitcoin.pdf',
    },
    {
      label: 'The first Bitcoin block, 3 January 2009 (block explorer)',
      url: 'https://mempool.space/block/0',
    },
    {
      label: 'Bitcoin Wiki, “Genesis block” (the headline inside block 0)',
      url: 'https://en.bitcoin.it/wiki/Genesis_block',
    },
    {
      label: 'The pizza offer on the bitcointalk forum, May 2010',
      url: 'https://bitcointalk.org/index.php?topic=137.0',
    },
    {
      label: 'Bitcoin Wiki, “Controlled supply” (the reward schedule and halvings)',
      url: 'https://en.bitcoin.it/wiki/Controlled_supply',
    },
    {
      label: 'Bitcoin Wiki, “Difficulty” (retargeting every 2,016 blocks)',
      url: 'https://en.bitcoin.it/wiki/Difficulty',
    },
  ],
};

// ─── Getting bitcoin ─────────────────────────────────────────────────────────

const gettingBitcoin: Article = {
  id: 'getting-bitcoin',
  title: 'Getting bitcoin: three ways',
  summary:
    'You can buy bitcoin on an exchange, receive it from another person, or earn it by mining. The easy way puts a company between you and your coins.',
  minutes: 3,
  checked: '2026-11-12',
  access: FREE,
  blocks: [
    { kind: 'h', text: '1. Buy it on an exchange' },
    {
      kind: 'p',
      text: 'An exchange works like a currency booth at the airport: you hand over ordinary money and receive bitcoin, for a fee. You sign up, prove who you are, link a bank account or card, and buy. The exchange is a company, though, not part of Bitcoin.',
    },
    {
      kind: 'p',
      text: 'You never need a whole coin: one bitcoin splits into 100,000,000 **satoshis**, named after Bitcoin’s author, so $100 simply buys a fraction of one.',
    },
    { kind: 'h', text: 'Who holds the key?', id: 'custody' },
    {
      kind: 'p',
      text: '**An exchange holds it for you.** When you buy on an exchange, it usually keeps the keys and shows you a balance, like a coat check: convenient, and someone else guards your coat. It’s easy to use, a lost password can be reset, and buying and selling is quick. The risk: you depend on that company. If it’s hacked, goes bust or freezes withdrawals, your balance may be stuck or lost.',
    },
    {
      kind: 'list',
      items: [
        'In February 2014 **Mt. Gox**, then the largest Bitcoin exchange, collapsed after reporting about 850,000 bitcoin missing; about 200,000 were later found. Mt. Gox failed, Bitcoin didn’t.',
        'In February 2025 attackers took about $1.5 billion of Ether from **Bybit**, one of the largest exchanges, by tricking the process used to approve a transfer from its storage wallet. The FBI attributed it to North Korean hackers. Bybit said it covered the loss and customers kept their balances. The blockchain wasn’t broken; one company’s process was.',
      ],
    },
    {
      kind: 'p',
      text: '**You hold it yourself,** in a wallet you control, like taking your coat home. No company can freeze or lose your coins. The risk: it’s all on you. Lose the key and the backup, or get tricked into revealing them, and there’s no one to call.',
    },
    {
      kind: 'p',
      text: 'Neither is right for everyone. People say “not your keys, not your coins”; the other half of that sentence is “your keys, your responsibility”.',
    },
    {
      kind: 'p',
      text: 'Before trusting an exchange with money, check: is it licensed or registered where you live? How has it handled problems before? Does it publish independent proof that it holds customers’ funds (proof of reserves)? Are fees shown clearly before you buy? Does it offer strong two-factor login, with an app or a hardware key rather than only SMS? We don’t recommend any exchange: rankings change fast, and many “best exchange” lists are paid adverts.',
    },
    { kind: 'h', text: '2. Receive it from someone' },
    {
      kind: 'p',
      text: 'Like being paid in cash, but digital. Someone sends bitcoin to your **address**, and there is no exchange in the middle. See **Mailboxes and keys** for how that works.',
    },
    { kind: 'h', text: '3. Earn it by mining' },
    {
      kind: 'p',
      text: 'Computers that add blocks to the chain are paid in new bitcoin. Today that takes specialised machines and a lot of electricity, so it is the least beginner-friendly way.',
    },
  ],
  selfTest: [
    {
      q: 'What’s the easiest way to get bitcoin, and its biggest weakness?',
      a: 'Buying on an exchange; you depend on that one company.',
    },
    { q: 'When Mt. Gox collapsed, did Bitcoin fail?', a: 'No. The exchange did.' },
    {
      q: 'Name two things to check before choosing an exchange.',
      a: 'Any two of: licensed where you live, its security record, proof of reserves, clear fees, strong two-factor login.',
    },
  ],
  sources: [
    {
      label: 'Bitcoin.org: choosing an exchange (a neutral list by region)',
      url: 'https://bitcoin.org/en/exchanges',
    },
    {
      label: 'MPR News (Reuters/AP): “Bitcoin exchange MtGox files for bankruptcy”, 28 Feb 2014',
      url: 'https://www.mprnews.org/story/2014/02/28/bitcoin-exchange-mtgox-files-for-bankruptcy',
    },
    {
      label: 'FBI: “North Korea Responsible for $1.5 Billion Bybit Hack”, 26 Feb 2025',
      url: 'https://www.ic3.gov/PSA/2025/PSA250226',
    },
  ],
};

/** In reading order: Lesson 1's articles (from the Drive docs, 02 to 06), then Lesson 2's */
export const ARTICLES: readonly Article[] = [
  money101,
  suncoin,
  bitcoinNetwork,
  bitcoinStory,
  gettingBitcoin,
  mailboxesKeys,
  exchangePrice,
  priceSwings,
  spotAScam,
];

export function getArticle(id: ArticleId): Article {
  const article = ARTICLES.find((a) => a.id === id);
  if (!article) throw new Error(`Unknown article ${id}`);
  return article;
}
