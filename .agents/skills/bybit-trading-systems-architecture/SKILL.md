---
name: bybit-trading-systems-architecture
description: Use when designing or extending the trading-engine half of cryptopapertrade.com — especially Phase 6 AI bot prep. Covers event-driven WebSocket-first architecture, local state management (orderbook, candles, positions), multi-symbol monitoring across the 9 ALLOWED_SYMBOLS, real-time trade stream + VWAP/heatmap detection, position management with Bybit funding, backtesting candle reconstruction from REST pagination. Critically: NO cross-exchange arbitrage (single Bybit venue only). Triggers: "AI bot architecture", "Phase 6 prep", "automated strategy", "real-time Bybit feed design", "backtesting reconstruction", "funding-rate tracking".
---

# Bybit Trading Systems Architecture — cryptopapertrade.com

Adapted from `emeraldls/mmt-api-skills` → `skills/mmt-trading-systems/SKILL.md` + its 12 per-rule files. Dropped (out of scope for a Bybit-only paper app): cross-exchange arbitrage, multi-exchange execution patterns, MMT-specific position management data fields. Preserved (portable): event-driven WS architecture, state-management primitives, multi-symbol monitoring across the 9 `ALLOWED_SYMBOLS`, real-time trade-stream processing, position management with Bybit funding, backtesting candle reconstruction from paginated REST.

This is a **reference / architecture** skill, not a workflow skill like the tradermonty TA skills. It's most useful before any Phase 6 wiring — design the engine shape once, then plug strategies in.

## Phase 6 context (from `docs/APP_LOG.md`)

> Phase 6: AI trading bot — 3-role system: Scanner + Analyst + Executor, paper mode only
> Phase 6b: AI bot connected to Bybit live trading (requires Phase 5 + Phase 6 proven)

This skill is the architectural backbone for Phase 6 + 6b. The three roles map as:

| Role         | Job                                                                                               | Lives in                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Scanner**  | Subscribe to multi-symbol feeds; emit raw signals (breakouts, regime shifts, funding extremes)    | server-side WS aggregator alongside `BybitWebSocketManager`                                   |
| **Analyst**  | Combine signals + TA + regime; produce ranked hypothesis cards → verdict                          | invokes **`technical-analyst`**, **`trade-hypothesis-ideator`**, **`backtest-expert`** skills |
| **Executor** | Translate verdict → paper order (`paperStore.placeOrder` or `placeLimitOrder` / `placeStopOrder`) | invokes **`position-sizer`**, **`pre-trade-discipline-gate`** skills                          |

## Event-driven architecture

WS is the event source; polling is anti-pattern. Layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Scanner (server)                                          │
│  - Subscribes to Bybit WS for N symbols + funding + OI     │
│  - Emits normalized events to a queue (Redis pub/sub)      │
└────────────────────┬────────────────────────────────────────┘
                     │ event stream
┌────────────────────▼────────────────────────────────────────┐
│  Analyst (server) — pulls events, runs strategies          │
│  - Per-strategy worker (one process per strategy config)   │
│  - Holds local state: candle buffer, orderbook snapshot    │
│  - Emits verdicts: { symbol, side, confidence, IOC expiry }│
└────────────────────┬────────────────────────────────────────┘
                     │ verdict
┌────────────────────▼────────────────────────────────────────┐
│  Executor (server) — gated by discipline + circuit breaker │
│  - Consults drawdown-circuit-breaker daily artifact        │
│  - Consults pre-trade-discipline-gate per-trade             │
│  - Calls paperStore.placeOrder(...) OR Bybit API in 6b      │
└─────────────────────────────────────────────────────────────┘
```

**Rule**: separation is mandatory. The Scanner never places orders. The Analyst never sees the API key. The Executor never holds the strategy logic. This prevents feedback loops where a losing strategy sees its own order stream and second-guesses.

## State management primitives

### Local orderbook snapshot + deltas

```typescript
interface OrderBookLevel {
  price: number;
  size: number;
}
interface OrderBook {
  bids: Map<number, number>; // price → size, sorted desc
  asks: Map<number, number>;
  lastUpdateId: number; // Bybit's `u` field — monotonic, drop stale
  lastUpdateTs: number;
}

function applyDelta(
  book: OrderBook,
  delta: { price: number; side: 'b' | 'a'; size: number; u: number }
) {
  if (delta.u < book.lastUpdateId) return; // stale — drop
  if (delta.u > book.lastUpdateId + 1 && book.lastUpdateId) {
    // GAP — resync via REST snapshot
    return 'GAP_DETECTED';
  }
  book.lastUpdateId = delta.u;
  const side = delta.side === 'b' ? book.bids : book.asks;
  if (delta.size === 0) side.delete(delta.price);
  else side.set(delta.price, delta.size);
}
```

**Bybit specificity**: Bybit's `orderbook.1.{symbol}` and `orderbook.200.{symbol}` push snapshots, not deltas. Different from Binance. Skip the delta logic above if subscribing to those — full replace.

### Candle aggregation

Already implemented in `apps/server/src/services/BybitWebSocketManager.ts` `CandleAggregator`. Pattern reinforced:

```typescript
class CandleAggregator {
  private current: CandleBar | null = null;

  onTrade(t: TradePublic) {
    const tf = TF_SECONDS[this.interval];
    const bucket = Math.floor(t.t / tf) * tf;

    if (!this.current || this.current.time !== bucket) {
      if (this.current) this.emit('candle-closed', this.current);
      this.current = { time: bucket, open: t.p, high: t.p, low: t.p, close: t.p, volume: t.q };
    } else {
      this.current.high = Math.max(this.current.high, t.p);
      this.current.low = Math.min(this.current.low, t.p);
      this.current.close = t.p;
      this.current.volume += t.q;
    }
  }

  // emit partial updates too — see real-time candlestick rule
  setInterval(() => {
    if (this.current) this.emit('candle-partial', this.current);
  }, 250);                      // 4Hz — throttle for UI
}
```

`TF_SECONDS` table belongs in `generated/CDSDK` shared types (see **`api-best-practices`** skill).

## Multi-symbol monitoring (the 9 ALLOWED_SYMBOLS)

```typescript
const SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
];

class MultiSymbolScanner {
  private subs = new Map<string, () => void>();

  async start() {
    for (const sym of SYMBOLS) {
      const unsub = bybitWs.subscribe(`kline.1m.${sym}`, (msg) => this.onCandle(sym, msg));
      this.subs.set(sym, unsub);
    }
    // plus: orderbook.1.{sym}, publicTrade.{sym}, ticker.{sym}
  }

  async stop() {
    for (const unsub of this.subs.values()) unsub(); // cleanup both 'close' and 'error'
    this.subs.clear();
  }

  private onCandle(sym: string, candle: CandleBar) {
    eventBus.emit('candle', { symbol: sym, ...candle });
  }
}
```

**Subscription limits**: Bybit's WS limit is 200 args per subscribe call. Use one subscribe call per channel family with array args — don't fire 9 separate subscribe calls for 9 symbols. Cross-reference **`pr-review-checklist`** section 5 (WS listener cleanup).

## Real-time trade stream — VWAP / large trade detection

```typescript
function rollingVwap(trades: TradePublic[], windowMs = 5 * 60_000): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const filtered = trades.filter((t) => t.t >= cutoff);
  if (!filtered.length) return 0;
  const notional = filtered.reduce((acc, t) => acc + t.p * t.q, 0);
  const vol = filtered.reduce((acc, t) => acc + t.q, 0);
  return vol ? notional / vol : 0;
}

function detectWhale(trades: TradePublic[], thresholdNotionalUsdt = 100_000) {
  return trades.filter((t) => t.p * t.q >= thresholdNotionalUsdt);
}
```

For the **heatmap** (liquidity walls): subscribe to `orderbook.200.{sym}` and track price levels where cumulative size on a side is > N× running average. These are the levels to watch for bounce-or-break tests.

## Position management with Bybit funding

```typescript
interface OpenPosition {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number;
  liquidation_price: number | null;
  opened_at: number;
  cumulative_funding_usdt: number; // running ledger
}

function applyFundingEvent(pos: OpenPosition, rate: number) {
  // Bybit settles funding every 8h on perp positions
  // long pays funding when rate > 0; short pays when rate < 0
  const notional = pos.qty * pos.entry_price;
  const payment = notional * rate; // +rate = long pays; -rate = short receives
  pos.cumulative_funding_usdt += pos.side === 'long' ? payment : -payment;
}
```

**Tracker subscription**: `apps/server/src/services/BybitWebSocketManager.ts` should expose a `subscribeFunding(symbol, cb)` alongside the existing `subscribeTicker`. Equivalents for OI: `subscribeOi`.

## Backtesting — candle reconstruction from paginated REST

```typescript
async function fetchBybitHistory(symbol: string, interval: string, from: number, to: number) {
  const allBars: CandleBar[] = [];
  let cursor = from;
  const maxBars = 1000; // Bybit's per-request limit (server cap in cryptopapertrade)
  while (cursor < to) {
    const limit = Math.min(maxBars, Math.ceil((to - cursor) / TF_SECONDS[interval]));
    const url = `/api/market/history?symbol=${symbol}&interval=${interval}&start=${cursor}&limit=${limit}`;
    const bars = await fetch(url).then((r) => r.json());
    if (!bars.length) break;
    allBars.push(...bars);
    cursor = bars[bars.length - 1].time + TF_SECONDS[interval]; // advance past last bar
    if (bars.length < maxBars) break; // exhausted
    await sleep(250); // respect rate limit
  }
  return allBars.filter((b) => b.time >= from && b.time <= to);
}
```

**Reconstructing custom timeframes**: ifyou need 2h bars but only have 1h, you can't fetch 2h directly from `/api/market/history` unless it's in `ALLOWED_INTERVALS`. Aggregate:

```typescript
function aggregateTo(bars: CandleBar[], targetTfSeconds: number): CandleBar[] {
  const byBucket = new Map<number, CandleBar>();
  for (const b of bars) {
    const bucket = Math.floor(b.time / targetTfSeconds) * targetTfSeconds;
    const cur = byBucket.get(bucket);
    if (!cur) {
      byBucket.set(bucket, { ...b, time: bucket });
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  return [...byBucket.values()].sort((a, b) => a.time - b.time);
}
```

This is exactly the math Bybit does server-side for `4h`/`1d`/`1w`; client aggregation is acceptable for backtest inputs (small drift risk). For live trading execution, do NOT aggregate client-side — fetch the canonical interval.

## Risk-of-ruin + the bot's stop envelope

The bot must respect:

1. **`drawdown-circuit-breaker`** decision JSON — gate at the start of each UTC day; do not place new orders if `HALTED` or `COOLDOWN` active. Phase 6 bot reads this artifact; doesn't recompute.
2. **`pre-trade-discipline-gate`** — every bot candidate order must pass the same checklist a human order would. Programmatic candidates still set `plan_in_journal: true` (via auto-journal entry) and `stop_predefined: true` (mandatory).
3. **`position-sizer`** — every bot order sized per the same risk rules. Bot may use fractional Kelly if `paperStore.history.length >= 100` samples show positive expectancy; else fixed 1%.
4. **`signal-postmortem`** — every closed bot trade feeds back; if FP rate > 30% over 20 trades, the Analyst downgrades that strategy's confidence and a `trade-hypothesis-ideator` cycle kicksoff.

## Compose with other skills

- **`technical-analyst`** — provides per-symbol chart reads; the Scanner consumes regime tags as part of signal metadata.
- **`position-sizer`** + **`pre-trade-discipline-gate`** + **`drawdown-circuit-breaker`** — Executor's gate chain.
- **`paper-trading-logic`** — the app's `paperStore` interface; bot Executor calls the same actions ("placeOrder" etc.).
- **`backtest-expert`** — pre-Phase-6 validation; any strategy config fed to the bot must pass Deploy verdict first.
- **`signal-postmortem`** + **`trade-hypothesis-ideator`** — post-trade feedback loop; triggers an iterated hypothesis card if false-positive cluster detects.
- **`lightweight-charts-patterns`** — chart-level patterns the bot may subscribe to (regime change visuals, OI jumps in chart overlay) — but bot shouldn't act on chart visuals, only on structured data.
- **`bug-sweep`** P3 (WS listeners cleanup) + P10 (memory caps) before any new aggregator service ships.

## What's NOT here (deliberately)

- **Cross-exchange arbitrage**: dropped. Cryptopapertrade is Bybit-only. If multi-venue ever matters, restore from the MMT original.
- **Borrow / locate / SEC Rule 201 SSR / FINRA PDT**: dropped — equity-specific, doesn't apply to crypto perps.
- **External execution venue patterns**: dropped. The Executor lives server-side and calls `paperStore` (paper mode) or Bybit REST (`POST /v5/order/create`) in Phase 6b — no separate venue abstraction.
- **MMT's CBOR encoding**: dropped — your Fastify server already emits JSON; CBOR for the server↔Bybit hop is overkill.

## Output discipline

- Cite `apps/server/src/services/BybitWebSocketManager.ts`, `apps/server/src/routes/market/index.ts`, `apps/server/src/constants.ts` when assuming existing services.
- Reference Phase 6 / 6b in APP_LOG.md when designing bot boundaries.
- Run **`pr-review-checklist`** sections 5 (WS), 10 (perf/memory), 3 (Prisma) before any new server route or aggregator service.
- Run **`bug-sweep`** P1 / P3 / P10 on any new bot loop — target the exact same patterns a human code change would.
- Treat this skill as design input, not implementation. Any actual bot implementation = code change = requires user's explicit approval per the AGENTS.md rule.
