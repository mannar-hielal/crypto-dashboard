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
  'bitcoin-story',
  'getting-bitcoin',
  'mailboxes-keys',
  'exchange-price',
] as const;
export type ArticleId = (typeof ARTICLE_IDS)[number];

export function isArticleId(value: string): value is ArticleId {
  return (ARTICLE_IDS as readonly string[]).includes(value);
}

/** The interactive pieces an article can hold (`ArticleWidgets.tsx`) */
export type WidgetId = 'suncoin-notebook' | 'nora-cheats' | 'order-book' | 'mailbox-steps';

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
  /** The whole article in one line */
  summary: string;
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
  summary:
    'A currency doesn’t need coins or notes. It needs a trustworthy list of who paid whom, in order. Bitcoin is that list, kept by thousands of computers instead of one person.',
  minutes: 6,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'Meet SunCoin' },
    {
      kind: 'p',
      text: 'Three friends, Emi, Leo and Sofia, want to trade with their own pretend money. There are no coins and no app. There is only a notebook, kept by their friend **Nora**. She starts it by handing out the first coins: 6 to Emi, 4 to Leo and 5 to Sofia. That’s 15 SunCoins in the whole world.',
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
      text: '5 + 3 + 7 = 15, exactly what was handed out. No coin appeared or vanished. This list is called a **ledger**. Bitcoin’s ledger works the same way: your “balance” is what the list adds up to for you.',
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
      text: 'Banks, payment apps and games keep their money exactly like this, with one trusted keeper of the notebook. Mostly that works well. But it means trusting that keeper.',
    },
    { kind: 'h', text: 'Bitcoin: many notebooks and no Nora' },
    {
      kind: 'p',
      text: 'Bitcoin, launched in January 2009 by someone using the name Satoshi Nakamoto, removes Nora:',
    },
    {
      kind: 'list',
      items: [
        '**Many copies.** Thousands of computers, called **nodes**, each keep a full copy of the ledger. A new payment spreads from node to node, and each one checks it against the rules: is it signed by the owner, and do they have enough?',
        '**Pages that seal each other.** Payments are grouped into **blocks**, and each block carries a fingerprint (a hash) of the block before it. Change an old line and its fingerprint changes, which breaks every block after it. That’s why it’s called a **blockchain**.',
        '**Adding a page costs real work.** To add a block, a computer must solve a puzzle that is hard to solve but easy to check. This is called mining. Rewriting history would mean redoing that work faster than everyone else combined.',
        '**Rules nobody can bend alone.** No single person can print extra coins or move yours: every node checks the rules, and changing them needs most of the network to agree. That’s what **decentralized** means.',
      ],
    },
    { kind: 'h', text: 'What this does not mean' },
    {
      kind: 'list',
      items: [
        '**It doesn’t set the price.** The ledger records who owns what. The price is made somewhere else entirely: on exchanges, where buyers and sellers agree on deals.',
        '**Payments aren’t instant.** A payment counts once it’s in a block and more blocks are built on top. On Bitcoin that takes minutes, not seconds, and it costs a fee.',
        '**It isn’t anonymous.** Every line is public forever, though no names are written in it.',
      ],
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
      q: 'Why is it hard to change an old Bitcoin block?',
      a: 'Each block carries the previous one’s fingerprint, so a change breaks every later block, and redoing the work costs too much.',
    },
    {
      q: 'Does the blockchain decide Bitcoin’s price?',
      a: 'No. It records ownership; the price is made on exchanges.',
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
  ],
};

// ─── How an exchange sets the price ──────────────────────────────────────────

const exchangePrice: Article = {
  id: 'exchange-price',
  title: 'How an exchange sets the price',
  summary:
    'Nobody decides the price of Bitcoin. The number on your screen is the last deal between someone who wanted to buy and someone who wanted to sell.',
  minutes: 6,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'Two queues' },
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
    { kind: 'h', text: 'The gap: the spread' },
    {
      kind: 'p',
      text: 'There’s usually a small gap between the best bid and the best ask. That gap is the **spread**. If you buy at market right now, you pay the best ask; if you sold straight back, you’d get the best bid. You’d lose the spread, plus fees, even if the price didn’t move at all.',
    },
    {
      kind: 'callout',
      tone: 'chart',
      anchor: 'trade.spread',
      text: 'On the chart: the order form shows the current spread.',
    },
    { kind: 'h', text: 'Busy markets and quiet ones' },
    {
      kind: 'p',
      text: '**Liquidity** is how many offers wait close to the price. In a busy market, like Bitcoin against USDT on a large exchange, the queues are deep: your order fills close to the last price and the spread is tiny. In a quiet market a large order can eat through the queue and fill at worse and worse prices. Crypto trades around the clock, but quiet hours and quiet coins still cost more to trade.',
    },
    { kind: 'h', text: 'From deals to candles', id: 'candles' },
    {
      kind: 'p',
      text: 'Thousands of deals happen every minute, so charts summarise them. A **candle** sums up every deal in one slice of time, a minute, an hour or a day:',
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
        '**10 January 2024:** the US approved the first funds that hold Bitcoin directly, widely called the year’s biggest crypto news. Two weeks later the price was about 15% lower.',
      ],
    },
    {
      kind: 'callout',
      tone: 'idea',
      text: 'Looking back, each move feels obvious. That’s hindsight. On the day, nobody knew, which is why careful traders plan for both directions before they act.',
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
      q: 'A candle is green. What does that tell you?',
      a: 'That slice of time closed higher than it opened. Nothing about what comes next.',
    },
    {
      q: 'Good news comes out. What happens to the price?',
      a: 'It could go either way. No one knows in advance.',
    },
  ],
  sources: [
    {
      label: 'Bybit v5 API: the order book',
      url: 'https://bybit-exchange.github.io/docs/v5/market/orderbook',
    },
    {
      label: 'Prices: Bybit BTCUSDT perpetual daily candles (checked 2026-10-23)',
      url: 'https://bybit-exchange.github.io/docs/v5/market/kline',
    },
  ],
};

// ─── Mailboxes and keys ──────────────────────────────────────────────────────

const mailboxesKeys: Article = {
  id: 'mailboxes-keys',
  title: 'Mailboxes and keys: how a Bitcoin payment works',
  summary:
    'An address is a mailbox slot anyone can post bitcoin into. A private key is the only key that opens the box. Whoever holds the key controls the coins.',
  minutes: 7,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'The address: a mailbox slot' },
    {
      kind: 'p',
      text: 'To receive bitcoin, a wallet app creates an **address**. Think of a mailbox with a slot: anyone can post bitcoin through it, and no one can take anything out with the address alone. So an address is safe to share. Real addresses are long strings of letters and numbers, so apps show them as a QR code, the same string as a picture you can scan.',
    },
    {
      kind: 'p',
      text: 'A wallet can make a new address whenever you like. Using a fresh one for each payment is common practice: it makes it harder for onlookers to link all your payments together.',
    },
    { kind: 'h', text: 'The private key: the only key to the box', id: 'key' },
    {
      kind: 'table',
      head: ['', 'Address', 'Private key'],
      rows: [
        ['Does', 'Receives bitcoin', 'Spends what the address received'],
        ['Like', 'Your home address', 'Your house key and password in one'],
        ['Share it?', 'Yes, it’s safe', 'Never, with anyone'],
      ],
    },
    {
      kind: 'p',
      text: 'To spend, your wallet uses the key to **sign** the payment. Every node can check the signature is genuine without ever seeing the key. That’s how the network knows a payment really came from the owner.',
    },
    { kind: 'h', text: 'A payment, step by step' },
    { kind: 'widget', id: 'mailbox-steps' },
    {
      kind: 'callout',
      tone: 'warn',
      text: 'There is no undo. If Leo sends the wrong amount, or to the wrong address, no bank can reverse it. The only way back is asking the receiver to return it. You can post a letter; you can’t un-post it.',
    },
    { kind: 'h', text: 'The twist: your coins aren’t in your phone' },
    {
      kind: 'p',
      text: 'Your bitcoin never sits inside your phone or on an exchange’s computer. It lives on the blockchain, as entries in the public ledger. What you actually hold is the **key** that proves those entries are yours.',
    },
    {
      kind: 'list',
      items: [
        '**Lose your phone, keep your key:** most wallets give you a backup list of words, a recovery phrase, that restores the keys on another device.',
        '**Lose the key and every backup,** and the coins are locked forever. Nobody can open the box: not you, not the wallet company, not anyone.',
        '**“Bitcoin got stolen”** almost always means someone got hold of the keys, through a scam, a fake website or a hacked company. The blockchain itself wasn’t broken.',
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      text: 'One rule: never share a private key or recovery phrase, and never type it into a website or send it to “support”. Real support never asks for it.',
    },
    {
      kind: 'p',
      text: 'Who holds the key, an exchange or you, is a choice with risks either way: see **Getting bitcoin: three ways**.',
    },
    { kind: 'h', text: 'Public, but not named' },
    {
      kind: 'p',
      text: 'Every Bitcoin payment is public forever: anyone can see that one address paid another, how much and when. What they don’t see is a name. That’s **pseudonymous**, not anonymous. Once an address is linked to you, say by an exchange that checked your ID, your payments can be traced.',
    },
    { kind: 'h', text: 'On this app' },
    {
      kind: 'callout',
      tone: 'idea',
      text: 'Your practice account holds no keys and no real coins. It’s a simulated balance with nothing at risk: the safe place to learn how buying and selling feel before any of this matters.',
    },
  ],
  selfTest: [
    { q: 'What can a stranger do with your address?', a: 'Send you bitcoin. Nothing else.' },
    {
      q: 'Someone asks for your recovery phrase to “verify your wallet”. What is it?',
      a: 'A scam. Never share it.',
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
  minutes: 5,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'Three jobs' },
    {
      kind: 'p',
      text: 'Money is anything people generally accept to **swap** for things, to **compare** what things are worth, and to **keep** value for later. A banknote does all three. So, for some people, does Bitcoin.',
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
    { kind: 'h', text: 'The weakness they share' },
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
  minutes: 7,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: 'A short timeline' },
    {
      kind: 'list',
      items: [
        '**31 October 2008:** someone, or some group, using the name **Satoshi Nakamoto** publishes the Bitcoin paper. Nobody knows who it is to this day.',
        '**3 January 2009:** the network starts, with its first block.',
        '**22 May 2010:** a programmer pays 10,000 bitcoin for two pizzas, one of the first times bitcoin buys something real. The day is now called Bitcoin Pizza Day.',
      ],
    },
    { kind: 'h', text: 'The plan, in six steps' },
    {
      kind: 'list',
      ordered: true,
      items: [
        '**The problem.** Paying online means trusting a middleman, a bank or a card company. Payments can be reversed, fees add up, and everyone has to hope the middleman is honest.',
        '**The idea.** Replace “trust me” with “check it”: if two strangers can prove a payment is real, no middleman is needed.',
        '**The catch: spending twice.** A digital coin is just data, and data can be copied. What stops someone paying with the same coin twice?',
        '**A shared notebook.** Everyone keeps the full list of payments, in order. If a coin is spent twice, the second payment is rejected.',
        '**Sealed pages.** Payments are grouped into blocks, each stamped with a fingerprint of the one before. Change an old page and every later seal breaks.',
        '**Work to add a page.** Adding a block means solving a puzzle that is hard to solve and easy to check. Rewriting history would mean redoing all that work faster than everyone else together.',
      ],
    },
    { kind: 'h', text: 'Why anyone does the work: mining', id: 'mining' },
    {
      kind: 'p',
      text: 'Whoever adds a block is paid in new bitcoin and in the fees of the payments inside it. That’s **mining**. It also explains why honest players tend to win: following the rules pays better than trying to cheat them.',
    },
    { kind: 'h', text: 'Why a payment isn’t instant' },
    {
      kind: 'p',
      text: 'A new payment spreads from computer to computer, like news through a school. It counts once it’s in a block and more blocks are built on top of it. On Bitcoin that takes minutes, not seconds, and every payment pays a fee.',
    },
    { kind: 'h', text: 'Satoshis: you never need a whole coin', id: 'satoshis' },
    {
      kind: 'p',
      text: 'One bitcoin splits into 100,000,000 **satoshis**, named after the paper’s author. Buying $100 of bitcoin simply gets you a fraction of a coin, the way you can buy a slice without buying the pizza.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      text: 'Public isn’t the same as anonymous. Every payment can be seen; only the names are missing. The paper says so itself.',
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
    { q: 'How many satoshis make one bitcoin?', a: '100,000,000.' },
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
      label: 'The pizza offer on the bitcointalk forum, May 2010',
      url: 'https://bitcointalk.org/index.php?topic=137.0',
    },
  ],
};

// ─── Getting bitcoin ─────────────────────────────────────────────────────────

const gettingBitcoin: Article = {
  id: 'getting-bitcoin',
  title: 'Getting bitcoin: three ways',
  summary:
    'You can buy bitcoin on an exchange, receive it from another person, or earn it by mining. The easy way puts a company between you and your coins.',
  minutes: 6,
  checked: '2026-10-23',
  access: FREE,
  blocks: [
    { kind: 'h', text: '1. Buy it on an exchange' },
    {
      kind: 'p',
      text: 'An exchange works like a currency booth at the airport: you hand over ordinary money and receive bitcoin, for a fee. You sign up, prove who you are, link a bank account or card, and buy. The exchange is a company, though, not part of Bitcoin.',
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
  practiceSoon: 'a later lesson on exchanges and wallets',
};

/** In reading order: Lesson 1's articles (from the Drive docs, 02 to 06), then Lesson 2's */
export const ARTICLES: readonly Article[] = [
  money101,
  suncoin,
  bitcoinStory,
  gettingBitcoin,
  mailboxesKeys,
  exchangePrice,
];

export function getArticle(id: ArticleId): Article {
  const article = ARTICLES.find((a) => a.id === id);
  if (!article) throw new Error(`Unknown article ${id}`);
  return article;
}
