/**
 * Nightly feed parity (TEST_IMPLEMENTATION_PLAN SC-6-1, rows 6.1–6.4): what cryptopapertrade.com
 * shows against Bybit at the same moments, for the 9 symbols × Spot / USDT Perpetual. It reads the
 * public API only — production's market WebSocket (the one the dashboard uses) and Bybit mainnet's
 * public REST — and changes nothing anywhere.
 *
 *   pnpm --filter @crypto-dashboard/server exec tsx src/tools/feedParity.ts
 *
 * Per market, `FEED_PARITY_SAMPLES` samples (default 10) `FEED_PARITY_EVERY_MS` apart (30 s):
 *   - 6.1  last, bid and ask within 0.1 % of Bybit's, and bid ≤ ask (the two reads are up to a
 *          second apart, so "one tick" is too tight for a moving book);
 *   - 6.3  mark and index within 0.1 %, the funding rate and next funding time equal (linear);
 *   - 6.4  every market keeps sending tickers. The dashboard is sent one only when a value changes,
 *          so a quiet market can be silent for a while: the last one received is compared (the
 *          server's own quote freshness isn't visible from outside).
 * A market fails a check when more than 20 % of its samples miss, and at once if it never sends a
 * ticker. Then 6.2: every 1m candle production closed during the run has exactly Bybit's OHLC for
 * that minute, and a run of 2+ minutes must see candles close.
 *
 * Runs on a Fly Machine in sin (feed-parity.yml): Bybit geo-blocks GitHub's runners.
 */

import pino from 'pino';
import { ALLOWED_CATEGORIES, ALLOWED_SYMBOLS } from '../constants.js';

/* eslint-disable security/detect-object-injection -- a command-line tool: keys are the fixed
   market / field names below, never request data */

type Category = (typeof ALLOWED_CATEGORIES)[number];

const API = (process.env.FEED_PARITY_API ?? 'https://api.cryptopapertrade.com').replace(/\/+$/, '');
const WS_API = API.replace(/^http/, 'ws');
const BYBIT = 'https://api.bybit.com';
const SAMPLES = Number(process.env.FEED_PARITY_SAMPLES ?? 10);
const EVERY_MS = Number(process.env.FEED_PARITY_EVERY_MS ?? 30_000);
const WARMUP_MS = 15_000;
const TOLERANCE = 0.001;
const MAX_MISS_SHARE = 0.2;

const log = pino({ name: 'feedParity' });

interface Ticker {
  lastPrice: number;
  bid: number | null;
  ask: number | null;
  markPrice?: number;
  indexPrice?: number;
  fundingRate?: number;
  nextFundingTime?: number;
}

interface Kline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  confirm?: boolean;
}

interface Market {
  category: Category;
  symbol: string;
  ticker?: Ticker;
  receivedAt: number;
  closed: Map<number, Kline>;
  misses: Record<string, number>;
  stale: number;
  samples: number;
}

const key = (m: Pick<Market, 'category' | 'symbol'>) => `${m.category}:${m.symbol}`;

async function bybit(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BYBIT}${path}?${new URLSearchParams(params).toString()}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Bybit ${path}: HTTP ${res.status}`);
  const body = (await res.json()) as {
    retCode: number;
    retMsg: string;
    result: Record<string, unknown>;
  };
  if (body.retCode !== 0) throw new Error(`Bybit ${path}: ${body.retMsg}`);
  return body.result;
}

/** Bybit's view of one market now: last, bid, ask (+ mark, index, funding for linear). */
async function bybitQuote(m: Market): Promise<Ticker> {
  const [t] = (await bybit('/v5/market/tickers', { category: m.category, symbol: m.symbol }))
    .list as Record<string, string>[];
  if (!t) throw new Error(`Bybit has no ticker for ${key(m)}`);
  if (m.category === 'linear') {
    return {
      lastPrice: Number(t.lastPrice),
      bid: Number(t.bid1Price),
      ask: Number(t.ask1Price),
      markPrice: Number(t.markPrice),
      indexPrice: Number(t.indexPrice),
      fundingRate: Number(t.fundingRate),
      nextFundingTime: Number(t.nextFundingTime),
    };
  }
  // Spot tickers have no book: the best level, as the app reads it (orderbook.1)
  const book = await bybit('/v5/market/orderbook', {
    category: 'spot',
    symbol: m.symbol,
    limit: '1',
  });
  const best = (side: unknown) => Number((side as string[][])[0]?.[0]);
  return { lastPrice: Number(t.lastPrice), bid: best(book.b), ask: best(book.a) };
}

function watch(m: Market): WebSocket {
  const ws = new WebSocket(
    `${WS_API}/api/market/ws?category=${m.category}&symbol=${m.symbol}&interval=1m`
  );
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data)) as {
      type: string;
      bar?: { kline: Kline };
      bars?: { kline: Kline }[];
    } & Partial<Ticker>;
    if (msg.type === 'ticker' && typeof msg.lastPrice === 'number') {
      m.ticker = msg as Ticker;
      m.receivedAt = Date.now();
    }
    const bars = msg.type === 'bar' && msg.bar ? [msg.bar] : [];
    for (const bar of bars) {
      if (bar.kline.confirm) m.closed.set(bar.kline.timestamp, bar.kline);
    }
  };
  ws.onerror = () => log.warn({ market: key(m) }, 'Production market WebSocket error');
  return ws;
}

const off = (ours: number | null | undefined, theirs: number | null | undefined) =>
  ours == null || theirs == null || !Number.isFinite(ours) || !Number.isFinite(theirs)
    ? true
    : Math.abs(ours - theirs) / Math.abs(theirs) > TOLERANCE;

async function sample(m: Market): Promise<void> {
  m.samples++;
  if (!m.ticker) {
    m.stale++;
    return;
  }
  const ours = m.ticker;
  const theirs = await bybitQuote(m);
  const miss = (check: string, failed: boolean) => {
    if (failed) m.misses[check] = (m.misses[check] ?? 0) + 1;
  };
  miss('last', off(ours.lastPrice, theirs.lastPrice));
  miss('bid', off(ours.bid, theirs.bid));
  miss('ask', off(ours.ask, theirs.ask));
  miss('bid ≤ ask', ours.bid == null || ours.ask == null || ours.bid > ours.ask);
  if (m.category === 'linear') {
    miss('mark', off(ours.markPrice, theirs.markPrice));
    miss('index', off(ours.indexPrice, theirs.indexPrice));
    miss('funding rate', ours.fundingRate !== theirs.fundingRate);
    miss('next funding time', ours.nextFundingTime !== theirs.nextFundingTime);
  }
}

/** Closed candles whose OHLC differs from Bybit's for the same minute. */
async function candleMismatches(m: Market, since: number): Promise<string[]> {
  const problems: string[] = [];
  for (const k of m.closed.values()) {
    // Closed during the run (a candle's timestamp is its start)
    if (k.timestamp + 60_000 <= since) continue;
    const { list } = await bybit('/v5/market/kline', {
      category: m.category,
      symbol: m.symbol,
      interval: '1',
      start: String(k.timestamp),
      end: String(k.timestamp),
    });
    const row = (list as string[][]).find((r) => Number(r[0]) === k.timestamp);
    if (!row) {
      problems.push(`${key(m)} candle ${new Date(k.timestamp).toISOString()}: Bybit has none`);
      continue;
    }
    const [, o, h, l, c] = row.map(Number);
    if ([k.open, k.high, k.low, k.close].some((v, i) => v !== [o, h, l, c][i])) {
      problems.push(
        `${key(m)} candle ${new Date(k.timestamp).toISOString()}: ours ${k.open}/${k.high}/${k.low}/${k.close}, Bybit ${o}/${h}/${l}/${c}`
      );
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const markets: Market[] = ALLOWED_CATEGORIES.flatMap((category) =>
    ALLOWED_SYMBOLS.map((symbol) => ({
      category,
      symbol,
      receivedAt: 0,
      closed: new Map<number, Kline>(),
      misses: {},
      stale: 0,
      samples: 0,
    }))
  );
  const sockets = markets.map(watch);
  const started = Date.now();
  await new Promise((r) => setTimeout(r, WARMUP_MS));

  for (let i = 0; i < SAMPLES; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EVERY_MS));
    await Promise.all(markets.map(sample));
  }
  for (const ws of sockets) ws.close();

  const problems: string[] = [];
  for (const m of markets) {
    if (m.stale > 0)
      problems.push(`${key(m)}: no ticker yet in ${m.stale} of ${m.samples} samples`);
    for (const [check, count] of Object.entries(m.misses)) {
      if (count / m.samples > MAX_MISS_SHARE) {
        problems.push(`${key(m)} ${check}: off in ${count} of ${m.samples} samples`);
      }
    }
    problems.push(...(await candleMismatches(m, started)));
  }
  const candles = markets.reduce(
    (n, m) => n + [...m.closed.keys()].filter((t) => t + 60_000 > started).length,
    0
  );
  if (candles === 0 && Date.now() - started >= 120_000) {
    problems.push('no 1m candle closed on any market during the run');
  }

  if (problems.length === 0) {
    log.info(
      { markets: markets.length, samples: SAMPLES, candles },
      'Feed parity: every market matches Bybit'
    );
    return;
  }
  for (const p of problems) log.warn({ problem: p }, 'Feed parity mismatch');
  log.error({ count: problems.length, candles }, 'Feed parity: mismatches found');
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  log.error({ err }, 'Feed parity run failed');
  process.exitCode = 1;
});
