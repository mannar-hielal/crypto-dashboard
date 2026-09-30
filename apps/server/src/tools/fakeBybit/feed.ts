/**
 * The fake Bybit feed's state and message builders (docs/TRADING_TEST_PLAN.md A5). Pure: no sockets,
 * no timers — server.ts drives it. Prices start from the recorded fixture (fixtures/bybit/recorded.json)
 * and move only when a test (or a person, through `pnpm feed`) says so.
 *
 * Messages and REST answers use Bybit v5's shapes: prices as strings at the instrument's tick,
 * lists newest first, `retCode: 0` envelopes.
 */

/* eslint-disable security/detect-object-injection -- a local test tool: keys are recorded-fixture or
   command-line fields, and it never runs inside the app */

export type Category = 'spot' | 'linear';
export type KlineSource = 'last' | 'mark' | 'index';

type Json = Record<string, unknown>;

export interface Recorded {
  recordedAt: string;
  instruments: Record<Category, Json[]>;
  riskLimit: Record<string, Json[]>;
  tickers: Record<Category, Record<string, Json>>;
  orderbook: { spot: Record<string, { a: string[][]; b: string[][] }> };
  fundingHistory: Record<string, Json[]>;
}

export interface Candle {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Market {
  category: Category;
  symbol: string;
  decimals: number;
  last: number;
  bid: number;
  ask: number;
  mark?: number;
  index?: number;
  fundingRate?: number;
  nextFundingTime?: number;
  fundingIntervalHour?: number;
  /** The forming 1m candle of the last price */
  bar: Candle & { volume: number };
}

const MIN = 60_000;
/** Bybit kline interval codes → milliseconds */
export const INTERVAL_MS: Record<string, number> = {
  '1': MIN,
  '3': 3 * MIN,
  '5': 5 * MIN,
  '15': 15 * MIN,
  '30': 30 * MIN,
  '60': 60 * MIN,
  '120': 120 * MIN,
  '240': 240 * MIN,
  '360': 360 * MIN,
  '720': 720 * MIN,
  D: 1_440 * MIN,
  W: 10_080 * MIN,
  M: 43_200 * MIN, // only a membership marker: W and M use calendar boundaries (bucketStart)
};

const DAY = 1_440 * MIN;
/** 1970-01-05, a Monday: Bybit's weekly candles start on Monday 00:00 UTC (the epoch was a Thursday) */
const FIRST_MONDAY = 4 * DAY;

/** The start of the candle holding `t`, on Bybit's boundaries (W: Monday, M: the 1st of the month). */
export function bucketStart(interval: string, t: number): number {
  if (interval === 'W') return Math.floor((t - FIRST_MONDAY) / (7 * DAY)) * 7 * DAY + FIRST_MONDAY;
  if (interval === 'M') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  const step = INTERVAL_MS[interval] ?? MIN;
  return Math.floor(t / step) * step;
}

/** The start of the candle before the one starting at `start`. */
export function previousStart(interval: string, start: number): number {
  if (interval === 'M') {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  }
  return bucketStart(interval, start - 1);
}

const key = (category: Category, symbol: string) => `${category}:${symbol}`;

/** Decimals of a tick like "0.10" → 1, "0.00001" → 5 (trailing zeros don't count). */
function tickDecimals(tick: string): number {
  const frac = tick.split('.')[1]?.replace(/0+$/, '') ?? '';
  return frac.length;
}

/** A number in [-1, 1] from a string, the same every time (FNV-1a). */
function noise(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

export class FakeFeed {
  private markets = new Map<string, Market>();
  private funding = new Map<string, { ts: number; rate: number }[]>();
  private overrides = new Map<string, Candle>();
  private stalledUntil: Record<Category, number> = { spot: 0, linear: 0 };

  constructor(
    private readonly recorded: Recorded,
    private readonly now: () => number = Date.now
  ) {
    this.reset();
  }

  /** Back to the recorded prices: no overrides, no funding changes, nothing stalled. */
  reset(): void {
    this.markets.clear();
    this.funding.clear();
    this.overrides.clear();
    this.stalledUntil = { spot: 0, linear: 0 };
    for (const category of ['spot', 'linear'] as const) {
      for (const instrument of this.recorded.instruments[category]) {
        const symbol = String(instrument.symbol);
        const tick = String((instrument.priceFilter as Json | undefined)?.tickSize ?? '0.01');
        const t = this.recorded.tickers[category][symbol] ?? {};
        const book = category === 'spot' ? this.recorded.orderbook.spot[symbol] : undefined;
        const last = Number(t.lastPrice);
        const m: Market = {
          category,
          symbol,
          decimals: tickDecimals(tick),
          last,
          bid: Number(book?.b[0]?.[0] ?? t.bid1Price ?? last),
          ask: Number(book?.a[0]?.[0] ?? t.ask1Price ?? last),
          bar: this.newBar(last),
        };
        if (category === 'linear') {
          m.mark = Number(t.markPrice ?? last);
          m.index = Number(t.indexPrice ?? last);
          m.fundingRate = Number(t.fundingRate ?? 0);
          // No funding timestamp until a test announces one (`/__control/funding`): the recorded one
          // is long past, and the engine would hold it as due — and ignore an earlier one set later
          m.nextFundingTime = 0;
          m.fundingIntervalHour = Number(t.fundingIntervalHour ?? 8);
        }
        this.markets.set(key(category, symbol), m);
      }
    }
    for (const [symbol, rows] of Object.entries(this.recorded.fundingHistory)) {
      this.funding.set(
        symbol,
        rows.map((r) => ({ ts: Number(r.fundingRateTimestamp), rate: Number(r.fundingRate) }))
      );
    }
  }

  private newBar(price: number): Market['bar'] {
    const start = Math.floor(this.now() / MIN) * MIN;
    return { start, open: price, high: price, low: price, close: price, volume: 0 };
  }

  market(category: Category, symbol: string): Market | undefined {
    return this.markets.get(key(category, symbol));
  }

  symbols(category: Category): string[] {
    return [...this.markets.values()].filter((m) => m.category === category).map((m) => m.symbol);
  }

  // ─── Controls ─────────────────────────────────────────────────────────────────

  /**
   * Set a market's prices. `bid` / `ask` default to `last`, `last` to the ask; on USDT Perpetual
   * the mark and index default to the last price. Returns the closed 1m candle if the minute rolled.
   */
  setQuote(
    category: Category,
    symbol: string,
    q: { bid?: number; ask?: number; last?: number; mark?: number; index?: number }
  ): { closed?: Market['bar'] } {
    const m = this.market(category, symbol);
    if (!m) throw new Error(`unknown market ${category}:${symbol}`);
    const last = q.last ?? q.ask ?? q.bid ?? m.last;
    m.last = last;
    m.bid = q.bid ?? last;
    m.ask = q.ask ?? last;
    if (category === 'linear') {
      m.mark = q.mark ?? last;
      m.index = q.index ?? last;
    }
    return this.trade(m, last);
  }

  /** Move the forming candle to `price`; roll it at a minute boundary. */
  private trade(m: Market, price: number): { closed?: Market['bar'] } {
    const minute = Math.floor(this.now() / MIN) * MIN;
    let closed: Market['bar'] | undefined;
    if (minute > m.bar.start) {
      closed = m.bar;
      m.bar = {
        start: minute,
        open: m.bar.close,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
    }
    m.bar.close = price;
    m.bar.high = Math.max(m.bar.high, price);
    m.bar.low = Math.min(m.bar.low, price);
    m.bar.volume += 0.001;
    return closed ? { closed } : {};
  }

  /** The next funding timestamp `inSeconds` from now at `rate`; its history row appears once it passes. */
  setFunding(symbol: string, rate: number, inSeconds: number, intervalHour?: number): number {
    const m = this.market('linear', symbol);
    if (!m) throw new Error(`unknown market linear:${symbol}`);
    const ts = this.now() + inSeconds * 1_000;
    m.fundingRate = rate;
    m.nextFundingTime = ts;
    if (intervalHour) m.fundingIntervalHour = intervalHour;
    const rows = this.funding.get(symbol) ?? [];
    rows.push({ ts, rate });
    this.funding.set(symbol, rows);
    return ts;
  }

  /** Candles a test puts in the history (a backfill gap, a price crossing a level). */
  setCandles(category: Category, symbol: string, source: KlineSource, candles: Candle[]): void {
    for (const c of candles) this.overrides.set(`${category}:${symbol}:${source}:${c.start}`, c);
  }

  stall(category: Category, ms: number): void {
    this.stalledUntil[category] = this.now() + ms;
  }

  isStalled(category: Category): boolean {
    return this.now() < this.stalledUntil[category];
  }

  // ─── WebSocket messages ───────────────────────────────────────────────────────

  private fmt(m: Market, v: number): string {
    return v.toFixed(m.decimals);
  }

  /** The push for one topic (`tickers.BTCUSDT`, `orderbook.1.BTCUSDT`, `kline.1.BTCUSDT`), or null. */
  message(category: Category, topic: string): Json | null {
    const parts = topic.split('.');
    const symbol = parts[parts.length - 1] ?? '';
    const m = this.market(category, symbol);
    if (!m) return null;
    const ts = this.now();
    const channel = parts[0];
    if (channel === 'tickers') {
      const data: Json = { symbol, lastPrice: this.fmt(m, m.last) };
      if (category === 'linear') {
        Object.assign(data, {
          bid1Price: this.fmt(m, m.bid),
          bid1Size: '1',
          ask1Price: this.fmt(m, m.ask),
          ask1Size: '1',
          markPrice: this.fmt(m, m.mark ?? m.last),
          indexPrice: this.fmt(m, m.index ?? m.last),
          fundingRate: String(m.fundingRate ?? 0),
          nextFundingTime: String(m.nextFundingTime ?? 0),
          fundingIntervalHour: String(m.fundingIntervalHour ?? 8),
        });
      }
      return { topic, type: 'snapshot', data, cs: ts, ts };
    }
    if (channel === 'orderbook' && category === 'spot') {
      return {
        topic,
        ts,
        type: 'snapshot',
        data: {
          s: symbol,
          b: [[this.fmt(m, m.bid), '1']],
          a: [[this.fmt(m, m.ask), '1']],
          u: ts,
          seq: ts,
        },
        cts: ts,
      };
    }
    if (channel === 'kline' && parts[1] === '1') {
      return { topic, type: 'snapshot', data: [this.klineData(m, m.bar, false)], ts };
    }
    return null;
  }

  /** A closed candle's push (confirm: true) — sent once when the minute rolls. */
  closedKlineMessage(category: Category, symbol: string, bar: Market['bar']): Json | null {
    const m = this.market(category, symbol);
    if (!m) return null;
    return {
      topic: `kline.1.${symbol}`,
      type: 'snapshot',
      data: [this.klineData(m, bar, true)],
      ts: this.now(),
    };
  }

  private klineData(m: Market, bar: Market['bar'], confirm: boolean): Json {
    return {
      start: bar.start,
      end: bar.start + MIN - 1,
      interval: '1',
      open: this.fmt(m, bar.open),
      close: this.fmt(m, bar.close),
      high: this.fmt(m, bar.high),
      low: this.fmt(m, bar.low),
      volume: bar.volume.toFixed(6),
      turnover: (bar.volume * bar.close).toFixed(4),
      confirm,
      timestamp: this.now(),
    };
  }

  // ─── REST ─────────────────────────────────────────────────────────────────────

  instruments(category: Category, symbol?: string): Json[] {
    return this.recorded.instruments[category].filter((i) => !symbol || i.symbol === symbol);
  }

  riskLimit(symbol?: string): Json[] {
    return symbol
      ? (this.recorded.riskLimit[symbol] ?? [])
      : Object.values(this.recorded.riskLimit).flat();
  }

  /** Funding history newest first, with startTime < ts ≤ endTime, only timestamps already past. */
  fundingHistory(symbol: string, startTime?: number, endTime?: number, limit = 200): Json[] {
    const now = this.now();
    return (this.funding.get(symbol) ?? [])
      .filter((r) => r.ts <= now && (startTime === undefined || r.ts >= startTime))
      .filter((r) => endTime === undefined || r.ts <= endTime)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit)
      .map((r) => ({ symbol, fundingRate: String(r.rate), fundingRateTimestamp: String(r.ts) }));
  }

  /**
   * Kline rows newest first: `[start, open, high, low, close, volume, turnover]` for the last price,
   * `[start, open, high, low, close]` for mark / index. The newest candle closes at the current
   * price; older ones wander around it deterministically; a test's candles replace their minute.
   */
  klines(
    category: Category,
    symbol: string,
    source: KlineSource,
    interval: string,
    opts: { start?: number; end?: number; limit?: number }
  ): string[][] {
    const m = this.market(category, symbol);
    if (!m || !Object.hasOwn(INTERVAL_MS, interval)) return [];
    const price =
      source === 'mark' ? (m.mark ?? m.last) : source === 'index' ? (m.index ?? m.last) : m.last;
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1_000);
    const first = opts.start === undefined ? undefined : bucketStart(interval, opts.start);
    const rows: string[][] = [];
    let start = bucketStart(interval, Math.min(opts.end ?? this.now(), this.now()));
    for (let i = 0; i < limit; i++, start = previousStart(interval, start)) {
      if (first !== undefined && start < first) break;
      const c = this.candle(m, source, interval, start, price);
      const row = [
        String(start),
        this.fmt(m, c.open),
        this.fmt(m, c.high),
        this.fmt(m, c.low),
        this.fmt(m, c.close),
      ];
      if (source === 'last') row.push('1.000000', this.fmt(m, c.close));
      rows.push(row);
    }
    return rows;
  }

  private candle(
    m: Market,
    source: KlineSource,
    interval: string,
    start: number,
    price: number
  ): Candle {
    const override =
      interval === '1'
        ? this.overrides.get(`${m.category}:${m.symbol}:${source}:${start}`)
        : undefined;
    if (override) return override;
    const newest = bucketStart(interval, this.now());
    const at = (t: number) =>
      t >= newest ? price : price * (1 + 0.002 * noise(`${m.symbol}:${source}:${interval}:${t}`));
    const open = at(previousStart(interval, start));
    const close = at(start);
    const wick = Math.abs(noise(`${m.symbol}:${interval}:${start}:wick`)) * 0.0005;
    return {
      start,
      open,
      close,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
    };
  }
}
