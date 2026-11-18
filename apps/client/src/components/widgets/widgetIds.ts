/** The interactive pieces an article or a lesson's Try it can hold (`ArticleWidgets.tsx`) */
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
