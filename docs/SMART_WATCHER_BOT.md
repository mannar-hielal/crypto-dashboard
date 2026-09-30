# Smart Watcher Bot — Research & Proposed Design

> **Owner:** Mannar Hielal · **Written:** 2026-09-30 · **Status:** 🔎 research done, being refined with the owner.
> Nothing here is built or scheduled. Implementation starts only when the owner says go, after the open questions in
> [§11](#11-open-questions-for-the-owner) are answered and Gate 0 in [§10](#10-real-money-feasibility--go--no-go) is
> cleared.
>
> **Admin only.** The bot is a private tool for the owner, never a feature offered to the app's users (see
> [§7](#7-eu--legal) for why that matters legally).

## 1. What it is

A private bot that watches the app's spot coins and trades swing uptrends on its own:

1. **Collects information** from four kinds of source:
   - trusted news and research;
   - the coin's own market data;
   - world events tied to crypto;
   - other factors: sentiment, on-chain data, macro.
2. **Decides** when a coin is entering an uptrend (or leaving one), and places the spot order(s).
3. **Manages its own risk** and exits the trade at the right moment.
4. **Journals every decision** as a one-line reason with a link to the source that drove it.

It starts on paper money, in this app's paper engine. If the pilot passes the success bar ([§3](#3-success-bar--when-can-it-touch-real-money)),
it moves to the owner's real Bybit EU account, with the owner approving trades.

## 2. Owner decisions (2026-09-30)

| Topic    | Decision                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy | Fully automatic on paper. With real money, the owner approves trades (one click per trade, at least at first).                                                                                        |
| Horizon  | Swing: hours to days. Scalping is ruled out (news is useless at that speed; it competes with high-frequency firms).                                                                                   |
| Market   | Spot only. On spot a downtrend means "sell what the bot holds and stay in cash"; shorting comes later, with futures.                                                                                  |
| Reuse    | Research only for now; whether to use libraries or build our own is decided after this document is refined.                                                                                           |
| Data     | Free sources for the pilot, to measure accuracy. Heavier paid feeds are an option once the feature is fully built.                                                                                    |
| Coins    | The app's 9 (`ALLOWED_SYMBOLS`): BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK — so the bot's orders show in Orders & Account. More top majors can be added to the app if the research calls for it. |
| Success  | The combined bar in [§3](#3-success-bar--when-can-it-touch-real-money).                                                                                                                               |
| Risk     | Two layers: the bot sizes trades and picks exits **inside** hard outer walls the server enforces. We propose the walls ([§8.3](#83-risk-walls-proposed--owner-to-approve)); the owner approves them.  |
| Region   | EU / EEA → Bybit EU (MiCA). **No USDT there:** the real account trades USDC (or EUR) pairs — see §10.                                                                                                 |

## 3. Success bar — when can it touch real money?

After a pilot of about 3 months, **all three** must hold:

1. **Beats buy-and-hold, risk-adjusted:** the bot's return ÷ its worst dip from a peak (max drawdown) is better than
   the same number for simply holding BTC over the same period. In plain words: it earned more for every 1% of pain.
2. **Ends in profit after fees.** A bot that "lost less than the market" is promising but doesn't go live.
3. **Never hits the drawdown wall** ([§8.3](#83-risk-walls-proposed--owner-to-approve)).

Win rate (share of winning trades) is **reported, never judged**: it's the easiest number to inflate (many tiny wins,
one large loss), which is why bot vendors advertise it.

Worked example, 10,000 USDT paper account over 3 months:

| Pilot              | Holding BTC                  | Bot  | Bot's worst dip  | Win rate | Verdict                                         |
| ------------------ | ---------------------------- | ---- | ---------------- | -------- | ----------------------------------------------- |
| A — rising market  | +25%, dipped −20% on the way | +10% | −4%              | 55%      | ✅ 10 ÷ 4 = 2.5 beats 25 ÷ 20 = 1.25, in profit |
| B — falling market | −30%                         | −5%  | −8%              | 45%      | ⏳ promising (saved capital) — extend the pilot |
| C — "lucky streak" | +10%                         | +15% | −15% (one trade) | 90%      | ❌ 15 ÷ 15 = 1.0, one trade nearly wiped it out |
| D — flat market    | 0%                           | +3%  | −2%              | 60%      | ✅ earned while the market went nowhere         |

**Enough evidence:** a swing bot makes maybe 20–60 trades in 3 months, which is thin. The pilot is extended rather
than judged early; target ≥ ~100 trades. The bot is also compared against a simple baseline rule (an EMA crossover
on the same coins), so we know whether the extra "smarts" add anything over a plain trend rule.

## 4. Market sweep — who already does this?

Swept 2026-09-30. **No product covers the whole idea**: none combines news, world events, sentiment and on-chain data
with automatic Bybit spot execution, its own exits, and a reason + source link per trade. The market splits into three
groups. Several sources are aggregators or press releases, not vendor pages; items marked _unverified_ could not be
confirmed. Check prices before buying anything.

### 4.1 Execution bots — trade on chart indicators only

| Product           | What it covers                                                                                                                                 | Bybit spot                                                                         | Price                                                                                                                 | EU / MiCA                                                                                                                                                                                   | Evidence / incidents                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3Commas**       | TA and TradingView signals; TP / SL / trailing exits; no reason log                                                                            | Yes                                                                                | Free; Starter $22/mo; higher tiers ([Gainium](https://gainium.io/review/3commas))                                     | Estonia-based; _unverified_                                                                                                                                                                 | **2022 API-key leak:** ZachXBT verified 44 victims losing $14.8M; the CEO confirmed the data was real; FBI probe reported ([Unchained](https://unchainedcrypto.com/3commas-confirms-api-leak-says-no-proof-of-an-inside-job/), [Bitdefender](https://www.bitdefender.com/blog/hotforsecurity/the-fbi-is-reportedly-probing-3commas-after-api-keys-leaked-on-twitter)) |
| **Cryptohopper**  | TA; the "AI designer" tunes parameters on past data                                                                                            | Yes                                                                                | Free, then $24–$107.50/mo; AI features on the top tier ([Gainium](https://gainium.io/review/cryptohopper))            | NL-based; _unverified_                                                                                                                                                                      | No audited performance                                                                                                                                                                                                                                                                                                                                                |
| **Pionex**        | Grid and DCA only                                                                                                                              | **No** (its own exchange)                                                          | No subscription; trading fees                                                                                         | Unclear: a "Pionew Ireland Ltd" is on the AMF CASP list ([AMF](https://www.amf-france.org/sites/institutionnel/files/pdf/77626/en/Pionew_Ireland_Limited.pdf)); link to Pionex _unverified_ | None audited                                                                                                                                                                                                                                                                                                                                                          |
| **Bitsgap**       | Grid, DCA, combo                                                                                                                               | Yes ([Bitsgap](https://bitsgap.com/blog/bitsgap-vs-pionex-2026-honest-comparison)) | $23–$149/mo ([Capterra](https://www.capterra.com/p/10004220/Bitsgap))                                                 | _unverified_                                                                                                                                                                                | None audited                                                                                                                                                                                                                                                                                                                                                          |
| **Coinrule**      | If-then rules on TA                                                                                                                            | Yes                                                                                | Free; paid from ~$29.99/mo ([QuickNode](https://www.quicknode.com/builders-guide/tools/coinrule-by-coinrule-limited)) | UK-based; _unverified_                                                                                                                                                                      | None                                                                                                                                                                                                                                                                                                                                                                  |
| **TradeSanta**    | DCA and grid                                                                                                                                   | Yes ([madeonsol](https://madeonsol.com/compare/coinrule-vs-tradesanta))            | _unverified_                                                                                                          | _unverified_                                                                                                                                                                                | None                                                                                                                                                                                                                                                                                                                                                                  |
| **Kryll**         | Visual TA strategy builder, marketplace                                                                                                        | Stated, _unverified_                                                               | Pay-per-use in KRL tokens; rates _unverified_                                                                         | FR-based; _unverified_                                                                                                                                                                      | Marketplace strategies sold on backtests                                                                                                                                                                                                                                                                                                                              |
| **WunderTrading** | TradingView signals, copy trading; now an MCP/REST layer for AI agents ([mcpservers](https://mcpservers.org/servers/wundertrading-mcp-server)) | Yes                                                                                | Not published ([G2](https://g2.com/products/wundertrading/pricing))                                                   | _unverified_                                                                                                                                                                                | None                                                                                                                                                                                                                                                                                                                                                                  |
| **Gunbot**        | TA; **self-hosted**                                                                                                                            | Yes                                                                                | One-time licence ~$99–$499 ([Coingape](https://coingape.com/gunbot-review-popular-user-friendly-crypto-trading-bot/)) | You run it, so no platform custody                                                                                                                                                          | None audited. Keys stay on your own machine — the best custody model in this group                                                                                                                                                                                                                                                                                    |

### 4.2 Bybit's own tools

- **Trading Bots:** the global site has Spot Grid, DCA and Futures Grid bots with AI-suggested parameters. **Bybit EU
  lists only the DCA Bot and the Spot Grid Bot** ([BTC-Echo](https://www.btc-echo.de/news/bybit-eu-startet-ki-gestutzte-trading-bots-sponsored-216601/)).
  Free apart from trading fees. TA and parameters only: no news, no reason log.
- **TradeGPT** (since Sept 2023): a free AI chat for analysis and education on Bybit data. **It does not trade**
  ([Cointelegraph](https://cointelegraph.com/news/bybit-launches-ai-trade-gpt-for-market-analysis)). Availability on
  Bybit EU _unverified_.
- **Bybit MCP** (22 Apr 2026): lets Claude, ChatGPT and similar agents read market data and trade
  ([PR Newswire](https://tools.prnewswire.com/en-us/live/20813/release/20260422EN40834)). Plumbing, not a strategy —
  but directly useful to a self-built bot.
- **Incident:** the Feb 2025 Lazarus hack took ~$1.5B in ETH from Bybit's cold wallet via a compromised Safe{Wallet}
  developer machine ([BleepingComputer](https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-a-breached-safe-wallet-developer-machine/)).
  Users' API keys were not the attack path; the lesson is exchange custody risk — keep only working capital on any
  exchange.

### 4.3 Signal & data services — none place orders

| Service           | Covers                                                                                                             | Price                                                                                                                                              | Notes                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Token Metrics** | AI ratings, "Smart Indices", TMAI agent, token-gated bots ([hellotars](https://hellotars.com/tools/token-metrics)) | ~$33–$167/mo ([NexusFi](https://nexusfi.com/d/cryptocurrency/token-metrics))                                                                       | Black-box grades; outperformance claims not audited; bots tied to a token |
| **Santiment**     | On-chain, social, dev activity; alerts; GraphQL API                                                                | Pro $49/mo ([Santiment](https://academy.santiment.net/products-and-plans/sanbase-plans))                                                           | Data only                                                                 |
| **LunarCrush**    | Social sentiment, alerts, API / MCP                                                                                | $90–$900/mo ([LunarCrush](https://lunarcrush.com/support/how-much-does-lunarcrush-cost))                                                           | Data only                                                                 |
| **Nansen**        | Wallet labels, smart-money flows, agent, API / MCP                                                                 | Pro $49–69/mo ([Nansen](https://academy.nansen.ai/articles/0414043-new-pricing-explained))                                                         | Strongest on ETH / SOL                                                    |
| **Glassnode**     | BTC / ETH on-chain metrics and alerts                                                                              | Studio ~$49/mo; API up to $749/mo ([Costbench](https://costbench.com/changelog/glassnode-plan-removed-2026-06/), _unverified_ on Glassnode's site) | Deep on BTC / ETH, thin on alts                                           |
| **CryptoPanic**   | News aggregator with vote-based sentiment, API                                                                     | Price _unverified_ (free API plan appears discontinued, see [§6](#6-data-sources-for-the-pilot--free-tier))                                        | Cheap news + link feed                                                    |
| **Kaito**         | AI search over research and social "mindshare"                                                                     | _unverified_                                                                                                                                       | Research tool, no execution                                               |

### 4.4 AI "agent traders" (2025–2026)

- **Alpha Arena, Season 1** (nof1, 17 Oct – 3 Nov 2025, $10k real money each, BTC/ETH perps on Hyperliquid) is the
  best public live evidence, though not audited. Only 2 of 6 models made money: Qwen3-Max +22%, DeepSeek +5%,
  **Claude Sonnet 4.5 −31%**, GPT-5 ≈ −59% ([ForkLog](https://forklog.com/en/news/ai-model-grok-4-2-triumphs-in-trading-tournament),
  [Yahoo](https://finance.yahoo.com/news/ai-crypto-trading-showdown-deepseek-202512124.html)). Reviewers put the losses
  down to over-trading, fees and inconsistent strategy ([WallStreetCN](https://wallstreetcn.com/articles/3771681)).
  Two weeks with one run per model is statistically meaningless either way.
- **Exchange agent layers** (Bybit MCP, WunderTrading MCP; Kraken, OKX, Coinbase and Binance reported) are plumbing,
  not proven strategies.
- **Open-source multi-agent frameworks** (e.g. CryptoFunk, [pkg.go.dev](https://pkg.go.dev/github.com/ajitpratap0/cryptofunk))
  exist without any track record. A claim that multi-agent systems beat single agents (Sharpe 1.8 vs 1.46) comes from
  a vendor blog ([Cobo](https://www.cobo.com/post/agentic-ai-crypto-strategies-2026)), _unverified_.

### 4.5 Their weaknesses, and how we beat them

| Weakness that repeats across the market                                                                                                                                                    | How our bot beats it                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Charts only** — execution bots ignore news, macro and on-chain; a bot rides into a hack headline                                                                                         | All four factors in one decision; news can block or shrink an entry (never start one on its own)                              |
| **Black box** — no reason per trade, anywhere                                                                                                                                              | A one-line reason + source link in the journal for every decision, and a full decision log for replay                         |
| **Overfit backtests, marketing win rates** — no audited track record found for any product                                                                                                 | Our own live paper pilot, judged by the combined bar in §3; win rate reported, never judged                                   |
| **Key custody** — keys stored in the vendor's cloud (3Commas: ≥ $14.8M lost)                                                                                                               | Keys never leave our server: trade-only, no withdrawals, IP-bound, in a capped sub-account ([§9](#9-security))                |
| **Subscriptions pile up** — a bot plus data feeds is easily $100–300+/mo                                                                                                                   | Free pilot stack; pay only for a feed once the pilot shows it adds accuracy                                                   |
| **Split stack** — signals in one product, execution in another, no link between them                                                                                                       | One pipeline: sources → score → risk gate → order → journal, each step logged                                                 |
| **AI agents over-trade** and lose to fees                                                                                                                                                  | The AI never places orders; deterministic rules decide, and a fee filter skips trades whose expected move doesn't cover costs |
| **EU gaps** — Bybit EU has fewer bots; several vendors' MiCA status is unclear (unlicensed exchanges had to leave the EU after 1 July 2026, [BIT](https://www.bit.com/knowledge-hub/mica)) | Built for Bybit EU's actual product set (spot) from day one                                                                   |

### 4.6 Could we just use a product instead?

**No product fits the whole brief.** Worth using as parts: Bybit's official API (or Bybit MCP) for execution; later,
if the pilot shows it helps, a paid data feed (Santiment / Nansen / Glassnode). A no-news fallback exists in Bybit EU's
Spot Grid / DCA bots. If a product were ever needed, Gunbot (self-hosted) or 3Commas / Bitsgap fed by our own signals
through TradingView webhooks would keep the decision logic with us.

## 5. Reuse vs build

### 5.1 Open-source bot frameworks

No framework fits as a whole. All the mature ones are Python, C# or Rust; our engine is TypeScript and already mirrors
Bybit, so embedding one means a second source of truth for orders and positions. None handles news or events well —
they're built around candles.

| Framework               | License, language         | Activity (Sep 2026)                     | Bybit                                         | News / LLM                                        | Backtest            | Paper mode                                             | Weakness for us                                     |
| ----------------------- | ------------------------- | --------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| **Freqtrade + FreqAI**  | GPL-3.0, Python           | 55k★, monthly releases (2026.9, 29 Sep) | Spot + futures via CCXT                       | None built in; FreqAI = ML on features you supply | Strong + hyperopt   | Dry-run                                                | GPL; news only as outside features                  |
| **Hummingbot**          | Apache-2.0, Python/Cython | 20k★, v2.17.0 (22 Sep)                  | Spot + perp                                   | "Condor" LLM harness, MCP                         | V2 controllers only | Paper connectors                                       | Built for market making / HFT, not swing            |
| **Jesse**               | MIT, Python               | 8.6k★, v3.2.3 (27 Sep)                  | _unverified_                                  | Jesse MCP; ML pipeline                            | Strong              | Advertised; live may need a paid plugin (_unverified_) | Python service                                      |
| **OctoBot**             | GPL-3.0, Python           | 6.7k★, 2.1.1 stable, 3.0 beta           | Via CCXT                                      | ChatGPT / Ollama evaluators                       | Manual bots only    | Yes                                                    | GPL; Python                                         |
| **NautilusTrader**      | LGPL-3.0, Rust + Python   | 29.5k★, 2.0.0rc5 (15 Sep)               | Stable spot + linear adapter                  | None                                              | High-fidelity       | _unverified_                                           | APIs shifting during the 2.0 migration              |
| **Superalgos**          | Apache-2.0, Node.js       | 5.7k★, only README fixes since Nov 2024 | Via CCXT                                      | No                                                | Yes                 | Yes                                                    | Effectively stale; a visual platform, not a library |
| **Lean (QuantConnect)** | Apache-2.0, C# + Python   | 21.8k★                                  | Yes, but local live needs a paid Bybit module | Alternative-data framework                        | Very strong         | Yes                                                    | Heavy; paid for Bybit live                          |

Sources: [freqtrade](https://github.com/freqtrade/freqtrade/releases), [hummingbot](https://github.com/hummingbot/hummingbot),
[jesse](https://github.com/jesse-ai/jesse), [OctoBot](https://github.com/Drakkar-Software/OctoBot/releases),
[Nautilus](https://github.com/nautechsystems/nautilus_trader/releases), [Superalgos](https://github.com/Superalgos/Superalgos/commits/master),
[Lean](https://github.com/QuantConnect/Lean), [Lean Bybit](https://github.com/QuantConnect/Lean.Brokerages.Bybit).
Some GitHub release dates displayed a year off; star counts as fetched in September 2026.

### 5.2 AI / agent projects — ideas to borrow, not code to embed

- **TradingAgents** (TauricResearch, Apache-2.0, Python/LangGraph, v0.3.1): analyst → bull/bear researcher → trader →
  risk-manager roles, many LLM vendors including Claude. Stocks-focused, no Bybit execution. **Borrow:** the role
  split and the structured decision log ([releases](https://github.com/TauricResearch/TradingAgents/releases)).
- **virattt/ai-hedge-fund** (MIT, educational, stocks only): its backtester hides the company's identity so the model
  can't recall known outcomes. **Borrow:** hide the coin's name in replays ([repo](https://github.com/virattt/ai-hedge-fund)).
- **FinRobot** (Apache-2.0): **borrow** its principle, _"models reason, software computes"_ ([repo](https://github.com/AI4Finance-Foundation/FinRobot)).
- **ElizaOS "Spartan"** (TypeScript): Solana / DeFi / memecoin trading tied to a token; hype-heavy, poor fit
  ([spartan](https://spartan.elizaos.ai)).

### 5.3 TypeScript building blocks

| Piece                                                                                                        | Verdict                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official **`bybit-api`** SDK ([sieblyio/bybit-api](https://github.com/sieblyio/bybit-api), MIT, full TS, v5) | **Use for real money later**: REST, WS with reconnect, WS order API, testnet and demo trading. Bybit EU uses its own host (`api.bybit.eu`) and keys. |
| **CCXT** ([repo](https://github.com/ccxt/ccxt), MIT)                                                         | Only if a second exchange is ever needed                                                                                                             |
| **`trading-signals`** ([repo](https://github.com/bennycode/trading-signals), TS, streaming)                  | Best-fit indicator library — or extend our own `IndicatorCalculator`, which already exists                                                           |
| `technicalindicators` / `tulind`                                                                             | Slow maintenance / native build pain — avoid                                                                                                         |
| JS backtesting (`backtest-kit`, `grademark`)                                                                 | Maturity _unverified_. Better: replay Bybit candles through our own `MatchingEngine`, so backtest and paper share one code path                      |
| Claude API tool use                                                                                          | Give the model **read-only** tools (news search, candles, funding/OI, macro calendar) and a strict JSON output; it never gets an order tool          |

### 5.4 The split

| Reuse                                                               | Build ourselves (TypeScript, in this repo)                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `bybit-api` for real execution (P4)                                 | The signal combiner (trend rules + context score)                  |
| `trading-signals` or our `IndicatorCalculator`                      | The risk gate and exit engine (ATR stops, walls, circuit breakers) |
| TradingAgents / FinRobot design patterns                            | News ingestion that keeps publish times (for honest replay)        |
| ai-hedge-fund's identity-hiding for replays                         | Candle replay on our `MatchingEngine`                              |
| Freqtrade / Jesse as an optional outside check on the pure-TA rules | The decision log + journal lines (Prisma)                          |

## 6. Data sources for the pilot — free tier

Checked 2026-09-30. Two changes in 2026 matter most: **CoinDesk Data (ex-CryptoCompare) retired its free API on
21 May 2026, and CryptoPanic's free API plan appears to be gone.**

| Factor           | Source                                            | Free-tier terms                                                                                                                                                                                                                                                                                                                                                    | Use in pilot                                |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Market           | Bybit v5 public (REST + WS)                       | 600 req / 5 s per IP, no key ([docs](https://bybit-exchange.github.io/doc-v3-offline/spot/rate-limit)). Funding, open interest and long/short ratio are perpetual data from global bybit.com — market-wide signals only (Bybit EU has no perps)                                                                                                                    | ✅ (already wired: `BybitWebSocketManager`) |
| Exchange notices | Bybit `/v5/announcements/index`                   | No auth; `type=new_crypto` for listings ([docs](https://bybit-exchange.github.io/docs/v5/announcement))                                                                                                                                                                                                                                                            | ✅                                          |
| News             | RSS: Cointelegraph, CoinDesk, The Block           | Free; automated-reuse terms _unverified_ → store headline + link only, never full text ([list](https://rss.feedspot.com/cryptocurrency_news_rss_feeds))                                                                                                                                                                                                            | ✅                                          |
| World events     | GDELT DOC 2.0                                     | Free, anonymous, 15-min updates, ~1 req / 5 s ([GDELT](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/))                                                                                                                                                                                                                                                   | ✅                                          |
| Sentiment        | alternative.me Fear & Greed                       | Free, daily, commercial use with attribution ([page](https://alternative.me/crypto/fear-and-greed-index/))                                                                                                                                                                                                                                                         | ✅                                          |
| Sentiment        | CoinMarketCap Fear & Greed                        | Free Basic plan, 10k credits/mo ([docs](https://pro.coinmarketcap.com/api/documentation))                                                                                                                                                                                                                                                                          | optional                                    |
| On-chain         | DefiLlama                                         | Free, no key, ~300 req/min ([ref](https://eco.com/support/en/articles/14800367-defillama-free-tvl-and-defi-analytics))                                                                                                                                                                                                                                             | ✅                                          |
| On-chain         | mempool.space                                     | Free, no auth (~10 req/s, not official) ([docs](https://www.mintlify.com/mempool/mempool/api/introduction))                                                                                                                                                                                                                                                        | ✅                                          |
| On-chain         | Dune                                              | 2,500 credits/mo, API included ([Dune](https://dune.com/blog/new-paid-experience))                                                                                                                                                                                                                                                                                 | optional                                    |
| On-chain         | Santiment                                         | 1,000 calls/mo, last 30 days cut off on restricted metrics ([plans](https://academy.santiment.net/products-and-plans/sanapi-plans))                                                                                                                                                                                                                                | optional (lagged)                           |
| Macro            | FRED                                              | Free key, 120 req/min                                                                                                                                                                                                                                                                                                                                              | ✅                                          |
| Macro            | FOMC / CPI dates                                  | Official Fed / BLS schedules, published a year ahead; a static calendar file                                                                                                                                                                                                                                                                                       | ✅                                          |
| Events (odds)    | Polymarket (Gamma / CLOB) + Kalshi public markets | Read-only, free, no key. Polymarket ~4,000 req / 10 s overall ([docs](https://docs.polymarket.com/api-reference/rate-limits)); Kalshi 20 reads/s ([docs](https://docs.kalshi.com/getting_started/rate_limits)). CoinMarketCap's prediction-markets page only displays Polymarket's data and has no API of its own, so the bot reads the sources directly. See §6.1 | ✅ context only                             |
| Prices           | CoinGecko Demo                                    | 30 calls/min, 10k/mo, attribution ([docs](https://docs.coingecko.com/docs/common-errors-rate-limit))                                                                                                                                                                                                                                                               | optional                                    |

**Not usable free:** CryptoPanic API (free plan discontinued, [plans](https://cryptopanic.com/developers/api/plans));
CoinDesk Data / CryptoCompare (free tier retired); NewsAPI (development only, 24 h delay; paid from $449/mo,
[pricing](https://newsapi.org/pricing)); Glassnode (API from $49/mo); CryptoQuant (API ~$99/mo); LunarCrush (free tier
has no social data); Reddit (non-commercial only); X/Twitter (pay-per-use, ~$0.005 per post read,
[ref](https://www.postproxy.dev/blog/x-api-pricing-2026/)); Farside ETF flows (web table only, self-described as
favouring speed over accuracy).

**The AI isn't free.** Classifying ~200 headlines a day with Claude Haiku 4.5 (~$1 / $5 per million input / output
tokens, third-party figure [here](https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5)) costs about
**$0.05/day ≈ $1.50/month**; running hourly stays under ~$5/month. Batching and prompt caching cut it further. See Q1.

### 6.1 Prediction markets (owner's suggestion, 2026-09-30)

**What they are:** markets where people bet on the outcome of an event (a Fed decision, a CPI print, an ETF ruling);
the price of a "yes" share is the crowd's probability. [CoinMarketCap's page](https://coinmarketcap.com/prediction-markets/)
shows Polymarket's markets; Kalshi is the US-regulated equivalent. They're the one input in the sweep that looks
**forward** at scheduled events rather than back at price.

**How reliable:**

- **Good on big, liquid events:** Kalshi's prices the day before each FOMC meeting had a perfect record of predicting
  the Fed's decision, statistically better than fed-funds futures (Federal Reserve discussion paper 2026-010,
  [link](https://www.federalreserve.gov/econres/feds/files/2026010pap.pdf)).
- **Known failures:**
  - **Resolution attack:** a UMA-token whale forced Polymarket's $7M "Ukraine minerals deal" market to resolve YES
    early (March 2025, [The Block](https://www.theblock.co/post/348171/polymarket-says-governance-attack-by-uma-whale-to-hijack-a-bets-resolution-is-unprecedented)).
  - **Fake volume:** a Columbia study estimated ~25% of Polymarket volume is wash trading, peaking near 60% in
    December 2024 (not peer-reviewed, [Fortune](https://fortune.com/2025/11/07/polymarket-wash-trading-inflated-prediction-markets-columbia-research)).
  - **Thin markets are easy to move** — a few thousand dollars can swing a small market's odds.
- **EU:** Polymarket blocks **betting** from France, Germany, Italy and Belgium (Poland reported), but its docs say
  read-only market data is not restricted ([geoblock](https://docs.polymarket.com/api-reference/geoblock)). The bot
  only reads; it never bets.

**How the bot uses them — context only, never a trigger:**

- Reads the Kalshi Fed / CPI markets and a short allowlist of liquid Polymarket macro and crypto-regulation markets
  (minimum liquidity and volume thresholds, set in P1 from what the shadow run sees).
- A big scheduled event whose odds sit near 50/50 (a real coin flip), or whose odds swung more than 20 points in
  24 h → shrink or block new entries until it resolves.
- Skips "BTC above X by date" markets: they mostly mirror the options market and add nothing to our own price data.
- Every odds reading that blocks or shrinks a trade goes in the decision log with the market's link.

## 7. EU & legal

- **Bybit EU** is licensed in Austria under MiCA and passported across the EEA
  ([Cointelegraph](https://cointelegraph.com/news/bybit-secures-mica-license-establishes-eu-hq-in-vienna)). Products:
  **spot, plus spot margin up to 10×; no derivatives** (a MiFID II licence for derivatives has been applied for,
  [AAP](https://prod-ss.aap.com.au/aapreleases/cision20250905ae66528/)). **API trading launched on 7 Sep 2026 and
  explicitly allows automated strategies** ([Trending Topics](https://www.trendingtopics.eu/bybit-trading-api/)). Its
  own host and keys: `api.bybit.eu`, testnet `api-testnet.bybit.eu` ([EU docs](https://bybit-exchange.github.io/eu-docs/v3/intro)).
  → The paper mirror should model Bybit EU's symbol list and spot fees (~0.10%), not global perpetuals. **No USDT
  pairs** (USDC and EUR only), and **a new unified fee structure starts on 5 Oct 2026** (rates not yet published,
  [fee structure](https://www.bybit.eu/en-EU/help-center/article/Trading-Fee-Structure)) — see §10.
- **Licence:** trading only for yourself is not a crypto-asset service under MiCA (no client), so **no CASP licence
  is needed** ([Houthoff](https://www.houthoff.com/insights/news/reverse-solicitation-under-mica/)). That changes the
  moment the bot manages anyone else's money, sells or shares signals, or is offered to the app's users — **which is
  why it stays admin-only.** National rules in the owner's country are _unverified_.
- **Tax (DAC8, from 1 Jan 2026):** Bybit EU reports every transaction to the tax authority, first filings in 2027
  ([CoinTracker](https://cointracker.io/blog/dac8-compliance)). A swing bot makes many taxable disposals → keep a
  per-fill ledger (time, pair, qty, price, fee, EUR value) exportable to Koinly / Blockpit. Country treatment differs
  (e.g. Germany's one-year holding exemption, Austria's 27.5%) — _unverified_ in detail.

## 8. Proposed design (not built)

### 8.1 Evidence first: what the research says about AI trading

- **Look-ahead bias is the main trap.** "Profit Mirage" ([arXiv 2510.07920](https://arxiv.org/abs/2510.07920)) finds
  published LLM trading agents' returns "collapse to a statistical zero" after the model's training cutoff; their
  predictions stay >82% unchanged when the inputs are altered — they recall, they don't reason. MemGuard-Alpha
  ([arXiv](https://arxiv.org/pdf/2603.26797)) shows models memorise price levels and headline dates.
- **StockBench** ([arXiv 2510.02209](https://arxiv.org/abs/2510.02209)): on months after the training cutoff, most LLM
  agents fail to beat buy-and-hold.
- **Crypto news sentiment** scored by ChatGPT improved the in-sample fit for Bitcoin but gave no significant
  out-of-sample gain ([readytensor](https://app.readytensor.ai/publications/leveraging-llms-for-informed-bitcoin-trading-decisions-prompting-with-social-and-news-data-reveals-X9ZePzMY34TR)).
  Positive results exist but are mostly stocks, small, and not replicated live.
- **Fees dominate:** Bybit spot is ~0.1% per side, ~0.2% round trip plus slippage — above what most positive studies
  assume.

**Consequences for the design:** only live paper results (or data after the model's cutoff) count; the model version
and prompts are frozen before the pilot; the AI is a filter, not the trigger; the bot is compared against
buy-and-hold and a plain EMA-crossover baseline.

### 8.2 Architecture — rules first, AI as a filter

```
 Sources ─► Collectors ─► Signals ─────────────► Decision ─► Risk gate ─► Paper engine ─► Journal
 (§6)       (per source,   • Trend engine          (entry /    (walls,       (TradingService,  (one line
            publish time   (4h / 1d candles:       exit /      kill switch,   existing)          + link)
            kept)          EMA regime, breakout,   hold)       code only)                        + Decision log
                           ATR, volume)                                                          (full inputs)
                           • Context score
                           (AI classifies news /
                           events into JSON; Fear &
                           Greed, flows, macro dates,
                           prediction-market odds)
```

- **Trend engine (deterministic):** decides entries and exits. Testable, replayable.
- **Context score:** can **block or shrink** an entry (e.g. a hack headline, an FOMC day, extreme greed, a coin-flip event in the prediction
  markets, §6.1); it can
  never start a trade on its own. News needs ≥ 2 independent sources, a 15–60 min confirmation delay, and the price
  itself confirming ([§9](#9-security)).
- **The AI** reads untrusted text, so it only outputs schema-validated JSON: `{ symbol (allowlist), direction, score
−1..1, confidence, reason ≤ 120 chars, sourceUrl }`. It has no tools that can place orders.
- **Risk gate (code, not the model):** sizes the position from the stop distance and the walls; rejects anything
  outside them.
- **Execution:** the existing paper engine through `TradingService` — the bot is just another client of the same
  engine the UI uses, so its orders show in Orders & Account.
- **Journal:** one line + link per decision (`JournalEntry.text` is `VarChar(500)`, capped at 200 per user — fine for
  the one-liner). **Decision log:** its own table with the full inputs, model version and gate verdict, for replay,
  audit and the per-fill tax ledger — never pruned by the journal cap.

### 8.3 Risk walls (proposed — owner to approve)

The bot decides size, stop-loss and take-profit per trade, **inside** these. They live in server config, are checked
in code before every order, and the bot can't change them.

| Wall               | Proposed value                                                        | Why                                                              |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Risk per trade     | ≤ 1% of equity (stop distance × size)                                 | Ten losers in a row cost ~10%, survivable                        |
| Per coin           | ≤ 20% of equity                                                       | One coin's crash can't sink the account                          |
| Total exposure     | ≤ 60% of equity, at most 4 open positions                             | The 9 coins move together in a sell-off; keep cash               |
| Daily loss         | −3% → no new entries until the next UTC day                           | Stops a bad day becoming a bad week                              |
| Drawdown from peak | −10% → the bot stops, closes nothing on its own, and alerts the owner | The "wall" in the success bar; a human decides what happens next |
| Fee filter         | Skip when the expected move < 3× the round-trip cost (~0.2%)          | The Alpha Arena failure mode: death by fees                      |
| Cooldown           | 4 h per coin after an exit                                            | No revenge trading / whipsaw loops                               |
| Stale data         | No entries when a key feed is older than its expected interval        | Don't trade blind                                                |

### 8.4 Phases

| Phase  | What                                                                                                                                                                                                                                 | Exit criterion                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **P0** | This document                                                                                                                                                                                                                        | Owner refined it, answered §11, cleared Gate 0 §10.1 |
| **P1** | Collectors, trend engine, context score, decision log; **shadow mode** — signals logged, no orders — for 2–4 weeks                                                                                                                   | Signals look sane to the owner; data pipeline stable |
| **P2** | Automatic paper trading with the walls, the admin kill switch and the journal lines                                                                                                                                                  | Runs a week without a wall or pipeline incident      |
| **P3** | The pilot: ~3 months (extendable, target ≥ ~100 trades) + an evaluation report against buy-and-hold and the EMA baseline                                                                                                             | The combined success bar in §3                       |
| **P4** | Bybit EU real money: Gate 0 cleared (§10.1); a venue adapter that reconciles with Bybit (exchange = source of truth); USDC quote; exchange-side stops; owner approval per trade; a separate Fly app holding the key; the rules in §9 | Owner's go                                           |

### 8.5 Codebase anchors

- `apps/server/src/constants.ts` — `ALLOWED_SYMBOLS` (the 9 coins).
- `apps/server/src/services/BybitWebSocketManager.ts`, `CandleAggregator.ts`, `IndicatorCalculator.ts` — market data
  and indicators that already exist.
- `apps/server/src/trading/TradingService.ts`, `MatchingEngine.ts` — order placement and matching; `EngineLease` — the
  single-writer lease pattern; the bot needs its own lease row (the engine's id `matching-engine` is hardcoded).
- `apps/server/prisma/schema.prisma` — one `Account` per `User`; `JournalEntry`; **no admin role exists yet** — the only admin check is `config.adminEmail` (`routes/newsletter/index.ts`) (Q4).

## 9. Security

For the paper phase most of this is design discipline; for real money (P4) all of it is required.

- **API key (P4):** read + **spot trade only** — never Withdraw, Account Transfer or Subaccount Transfer. Bound to an
  IP allowlist (a static egress IP on Fly; unbound Bybit keys expire after ~90 days,
  [ref](https://support.fireblocks.io/hc/en-us/articles/5138770767004)). A dedicated sub-account funded with a capped
  amount (sub-accounts on Bybit EU _unverified_). Rotated every 90 days and at once on any suspicion.
- **Where the key lives:** Fly secrets (encrypted; the API can't decrypt them; injected at boot,
  [Fly docs](https://docs.fly.io/apps/secrets/)). Anyone with deploy access can read them → deploy access owner-only,
  2FA, never log env vars, and the trading key in a **separate Fly app** from the public API.
- **Prompt injection (OWASP LLM01) and excessive agency (LLM06)** ([ref](https://invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025)):
  any headline can carry instructions. Mitigation: the model outputs only validated JSON with an allowlisted symbol;
  it has no order tool; a deterministic gate turns scores into orders; all limits sit outside the model; the owner
  approves live trades; news alone never triggers a trade.
- **Fake news / data poisoning:** on 9 Jan 2024 the SEC's hacked X account posted a fake ETF approval; BTC jumped to
  ~$48k and fell below $46k within 30 minutes ([The Block](https://theblock.co/news/ecosystems/2024-01-09-secs-x-account-compromised-to-post-fake-spot-bitcoin-etf-approval-271373)).
  Mitigation: ≥ 2 independent sources, a 15–60 min confirmation delay (cheap on a swing horizon), price confirmation,
  ignore single-source "breaking" regulatory headlines, weight sources (exchange API > major RSS > social).
- **Kill switch:** a global "bot enabled" flag checked before every order; one-click "cancel all + disable" for the
  admin; automatic halt on the drawdown wall, repeated API errors or stale data; revoking the key on Bybit as the last
  resort.
- **Audit log:** append-only: input snapshot → model output → gate verdict → order request / response → approver.
  Kept for the tax ledger too.
- **Admin-only access:** every bot route behind `app.authenticate` **and** an admin check (Q4); nothing about the bot
  in the public SDK surface users can call.
- **Prediction markets:** read-only, no account, no key — the bot never places a bet. Only allowlisted markets
  above a liquidity floor count, so a thin, manipulated market can't move the bot (§6.1).
- **Exchange custody:** keep only working capital on Bybit (the Feb 2025 hack was at the exchange, not users' keys).

### 9.1 Rules the software must follow (security + compliance, from §10)

1. **Own deployment, own credentials.** The bot runs apart from cryptopapertrade.com; the public build is hard-flagged
   paper-only, and the bot's live signals and positions never reach it.
2. **Self-trade guard:** never place an order that could cross the bot's own resting order; use Bybit's self-match
   prevention if the EU API offers it (_unverified_).
3. **No layering / spoofing:** a cap on the cancel-to-fill ratio; every order carries a logged reason.
4. **Public inputs only:** an allowlist of public sources, each input timestamped in the log — nothing leaked or
   non-public ever enters (MiCA Art. 89).
5. **Append-only audit + tax ledger**, kept 10 years (§10.3).
6. **Quote asset configurable** (USDC by default, EUR where listed); USDT orders refused on the EU venue.
7. **Key:** trade-only, no withdraw / transfer, IP-bound, RSA (our private key never leaves us), one account, rotated.
8. **Exchange-side stop-loss** on every live position (if the API allows it), so our server crashing can't leave a
   position unprotected.

## 10. Real-money feasibility — go / no-go

Asked by the owner on 2026-09-30: _"if we don't make sure this feature can make real money with Bybit later, we won't
build it."_ Checked the same day against Bybit EU's API and terms, EU law and our own code. Several bybit.eu pages
timed out during the check, so some Bybit EU findings come from indexed extracts — marked below.

**Verdict: conditional GO.** No legal blocker was found for a private, low-frequency spot bot trading the owner's own
money on Bybit EU. Three facts can only be confirmed on the owner's account (Gate 0, §10.1) and decide go / no-go
**before any code is written**. Nothing can guarantee profit: this section answers _can it legally and technically
trade real money_; the P3 pilot answers _does it make money_.

### 10.1 Gate 0 — owner actions, ~1 hour, no code

1. **Can a personal API key be created?** Until at least March 2026 Bybit EU only offered "Connect to Third-Party
   Applications" (broker) keys and no custom IP whitelist ([Gainium forum](https://community.gainium.io/t/bybit-eu-api-keys-not-valid-for-spot-on-local-version/4740)),
   and Bybit's v5 guide still says so today ([v5 guide](https://bybit-exchange.github.io/docs/v5/guide)). API trading
   launched on 7 Sep 2026 ([Trending Topics](https://www.trendingtopics.eu/bybit-launches-trading-api-to-connect-to-chatgpt-claude-and-co/))
   with an API bot competition (3 Sep – 1 Oct 2026, [cryptoast](https://cryptoast.fr/?p=225085)), so personal keys are
   probably open now. **Check in API Management:** a key you create yourself, spot trade on, withdraw / transfer off,
   your own IP whitelist. (Keys are made on the website only, need Google Authenticator 2FA, and may be blocked 48 h on
   a new account — [help](https://www.bybit.eu/en-EU/help-center/article/How-to-create-your-API-key/?category=ae1012f19fad1c184e).)
2. **The "bots" clause.** General Terms §9.2.2: users must not _"use any anonymizing proxies, bots, spiders, or any
   automatic devices, programs, scripts, algorithms… to access, obtain, copy, or monitor any part of the Platform"_
   ([General Terms](https://www.bybit.eu/en-EU/help-center/article/General-Terms/)). Probably aimed at scraping, and
   contradicted by Bybit EU's own API launch — but **get written confirmation from Bybit EU support** that personal
   algorithmic spot trading through the official API is allowed. That email protects the account if it's ever
   questioned.
3. **Exchange-side stops through the API.** Spot TP/SL, OCO and trailing stops exist in the EU app
   ([TP/SL](https://www.bybit.eu/en-EU/help-center/article/Introduction-to-Take-Profit-and-Stop-Loss-Spot-Trading),
   [OCO](https://www.bybit.eu/en-EU/help-center/article/One-Cancels-the-Other-OCO-Orders),
   [trailing](https://www.bybit.eu/en-EU/help-center/article/Trailing-Stop-Order-Spot-and-Spot-Margin-Trading/)).
   Confirm they can be placed via the API on `api.bybit.eu`, so a stop fires even if our server is down; and whether
   a demo or testnet API works for spot. If not, the first live tests are tiny (~€10) orders.

### 10.2 Facts that change the design

| Topic           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Consequence                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Quote currency  | **No USDT on Bybit EU** — USDC and EUR pairs only ([ANP](https://persportaal.anp.nl/artikel/CSN-190226058/bybit-eu-expands-access-to-usdc-and-eurc-through-new-stablecoin-campaigns-in-europe), [CoinGecko](https://www.coingecko.com/en/exchanges/bybit-eu)). ESMA told CASPs to stop non-MiCA stablecoins by Q1 2025 ([ESMA](https://www.esma.europa.eu/press-news/esma-news/esma-and-european-commission-publish-guidance-non-mica-compliant-arts-and-emts)); Circle's USDC is EMI-authorised ([Circle](https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law)) | The bot trades **USDC** pairs (EUR where listed); quote asset configurable. Q7 |
| Coins           | All 9 listed with USDC pairs; EUR pairs for BTC, ETH, SOL, XRP, LINK only — **BNB, DOGE, ADA, AVAX are USDC-only** ([CoinGecko](https://www.coingecko.com/en/exchanges/bybit-eu))                                                                                                                                                                                                                                                                                                                                                                                                                                                  | USDC is the one quote that covers all 9                                        |
| Fees            | 0.1% maker / 0.1% taker (non-VIP, [spot fees](https://www.bybit.eu/en-EU/help-center/article/Bybit-Spot-Fees-Explained)); **new unified structure from 5 Oct 2026**, rates unknown                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Re-check the fee filter and `bybitSpec` for the EU before P4                   |
| Hosts           | `api.bybit.eu` / `api.bytick.eu`, testnet `api-testnet.bybit.eu` ([eu-docs](https://bybit-exchange.github.io/eu-docs/v3/intro)); the official EU docs only document a Tax API. v5-compatible per community evidence ([ccxt #28665](https://github.com/ccxt/ccxt/issues/28665)); CCXT has a separate `bybiteu` class with "narrower coverage"                                                                                                                                                                                                                                                                                       | Individual spot endpoints on the EU host are _unverified_ until tested         |
| Order types     | Limit, market, spot TP/SL, OCO, trailing, TWAP in the app ([order types](https://www.bybit.eu/en-EU/help-center/article/Types-of-Orders-Available-on-Bybit)); post-only and API support _unverified_; price bands cancel far-off orders                                                                                                                                                                                                                                                                                                                                                                                            | Gate 0 item 3                                                                  |
| Rate limits     | Global v5: 600 req / 5 s per IP; spot create 20/s per UID; breach → 10-min block ([rate limits](https://bybit-exchange.github.io/docs/v5/rate-limit)). EU figures _unverified_                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A few orders a day is far below any limit                                      |
| Keys            | HMAC or self-generated RSA ([eu-docs](https://bybit-exchange.github.io/eu-docs/v3/intro)); up to 20 sub-accounts ([FAQ](https://www.bybit.eu/en-EU/help-center/article/FAQ-Standard-Subaccount/)) — API keys on them, scopes and the 90-day expiry _unverified_                                                                                                                                                                                                                                                                                                                                                                    | Prefer RSA; a capped sub-account if it can hold a key                          |
| Location        | §9.2.2 bans anonymising proxies → no VPN; restricted countries are auto-logged-out ([list](https://www.bybit.eu/en-EU/help-center/article/Service-Restricted-Countries))                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Host the bot in an EEA region with a static IP                                 |
| Account actions | Bybit EU may suspend accounts, freeze transactions and reverse "manifest error" trades ([General Terms](https://www.bybit.eu/en-EU/help-center/article/General-Terms/))                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Reconcile with the exchange continuously; keep only working capital there      |
| Demo            | A web demo account (50,000 USDC + 1 BTC + 1 ETH, spot; wiped after 30 days idle, [FAQ](https://www.bybit.eu/en-EU/help-center/article/FAQ-Demo-Trading)); a demo API for the EU _unverified_                                                                                                                                                                                                                                                                                                                                                                                                                                       | A possible free dress rehearsal between P3 and P4                              |

### 10.3 EU law — no hard blocker; the conditions to stay compliant

- **Market abuse (MiCA Art. 86–92) applies to any person**, private bots included
  ([Art. 86](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-86-scope-rules-market-abuse)).
  Maximum fines for individuals are set nationally at no less than €5M, plus disgorgement and trading bans
  ([Art. 111](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-111-administrative-penalties-and)).
  - Trading on **public** news and odds is lawful.
  - **Never trade on leaked / non-public information** — insider dealing ([Art. 89](https://www.springlex.eu/en/packages/mica/mica-regulation/article-89/)).
  - **No self-trades, wash trades, spoofing or layering** — "false signals" ([Art. 91](https://www.springlex.eu/en/packages/mica/mica-regulation/article-91/)).
  - **Never publicly talk up a coin the bot holds** without disclosing it (Art. 91(3)(c)).
  - Bybit must detect and report suspicious orders ([Art. 92](https://www.springlex.eu/en/packages/mica/mica-regulation/article-92/)),
    so the bot's order pattern must be plainly honest.
- **Licence:** none for your own money (a CASP serves "clients",
  [Art. 3](https://www.springlex.eu/en/packages/mica/mica-regulation/article-3/)). A licence **is** needed once the
  bot's trades or signals reach others: copy trading / relaying orders, managing family money (a national question —
  get advice), or hosting it for buyers. Public "performance" is only ever closed, delayed paper trades with a risk
  warning. MiFID II's algorithmic-trading rules (Art. 17) don't apply to a retail person trading spot crypto.
- **Tax — get professional advice before P4.** DAC8 (from 1 Jan 2026) has Bybit EU report identity, tax ID and per-asset
  acquisitions / disposals ([EU Commission](https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en)).
  The bot keeps a per-fill ledger — UTC time, exchange order / fill IDs, pair, side, qty, price, fee and fee asset, EUR
  rate and its source, EUR proceeds and cost basis, the reason — **for 10 years** (Germany §147 AO; Austria 7 years,
  _unverified_). Frequent automated trading can be classed as a business: Germany judges case by case
  ([FGS](https://www.fgs.de/en/news-and-insights/blog/detail/bmf-aeussert-sich-zur-ertragsteuerlichen-behandlung-von-krypto-assets));
  Austria moves to progressive rates when crypto trading is the "Schwerpunkt" of an activity
  ([BMF](https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/steuerliche-behandlung-von-kryptowaehrungen.html)).
- **Data:** headlines stored privately as a link plus a very short extract, never republished (CDSM Art. 15). Reading
  Polymarket odds isn't betting, but national gambling law is _unverified_.
- **No recourse** for the bot's losses. If the exchange fails, client crypto is segregated
  ([Art. 75](https://www.springlex.eu/en/packages/mica/mica-regulation/article-75/)) but there is no deposit guarantee.

### 10.4 Integration gaps in our code (P4 sizing)

What stands between today's paper engine and a real Bybit EU connection:

1. **USDT hardcoded** — the wallet is `Account.availableBalance`, `baseCoin()` strips `USDT`, `avgCost` is in USDT,
   error texts and `ALLOWED_SYMBOLS` are USDT pairs. No USDC / EUR anywhere.
2. **Global hosts hardcoded** — `BybitMarketInfo.ts` and `BybitWebSocketManager.ts` use `api.bybit.com` /
   `stream.bybit.com`; host overrides are refused in production (`config.ts`). Instrument rules and the `FALLBACK`
   snapshot are global mainnet values.
3. **No venue interface** — `TradingService` calls the pure engine directly, so paper state is the truth. A real
   adapter sits beside it and **reconciles** with Bybit (order, execution and wallet streams): the exchange becomes the
   source of truth.
4. **Optimistic paper fills** — a market order fills fully at the top of the book (no depth, no slippage); a resting
   limit fills in full at its price the moment the last price touches it (no queue); no partial fills; every spot fill
   pays the taker fee. **Paper results will overstate real ones** → the pilot models slippage and maker / taker, or
   its results are discounted.
5. **Paper-only spot features** — the spot TP/SL is a server-triggered OCO pair; no time-in-force, post-only, trailing
   stop, `orderLinkId`, amend, or partially-filled / cancelled states.
6. **Private-API tooling** — `bybit-api` is already a dependency, but the only signed-client code
   (`tools/bybitParity.ts`) is testnet- and perpetual-only; parity never covers spot.
7. **Secrets** — one `BYBIT_API_KEY` / `SECRET` pair is required on the public app (`criticalVars`); the trading key
   must live in a separate Fly app.
8. **Admin and loop** — admin is only `config.adminEmail`; the engine lease id is hardcoded, so the bot needs its own.

None of these is a blocker; they size P4. Item 4 matters earlier: it decides how much to trust the pilot (Q7).

## 11. Open questions for the owner

1. **AI cost:** accept ~$2–5/month for Claude Haiku to classify news, or run P1 without an AI (rules + Fear & Greed
   only) and add it later if the shadow run shows the news filter would have helped?
2. **Which account does the bot trade in?** A dedicated bot user / account (clean pilot numbers, not mixed with your
   manual trades; you sign in as it to watch its Orders & Account) — or your own account?
3. **The walls** in §8.3: approve, or adjust any value?
4. **How is "admin only" enforced?** An env allowlist of your user id (no schema change), or an `isAdmin` / role
   column on `User` (a migration, reusable later)?
5. **Where are you alerted** when a wall trips or the bot halts — email (the existing `EmailService`), or something
   else?
6. **Gate 0 (§10.1):** will you do the three account checks — create a personal key with your own IP whitelist, get
   Bybit EU support's written OK for personal API bot trading, and confirm exchange-side spot stops via the API? This
   is the go / no-go for the whole feature.
7. **Pilot quote currency:** price the paper pilot off Bybit EU's own USDC pairs (engine work, true parity with the
   real account), or keep today's USDT data as a proxy (USDC ≈ USDT, no engine work, less parity)? Either way, model
   slippage and maker / taker fees so the pilot doesn't flatter the bot.
