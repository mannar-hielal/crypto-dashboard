/**
 * Infrastructure adapters for the matching engine: the EngineLease store (Prisma) and the Bybit
 * 1m-candle sources used for backfill (APP_LOG Bybit Parity BP-1; mark-price candles BP-3), and the
 * settled funding rates (BP-4).
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { bybitRestBaseUrl } from '../services/BybitMarketInfo.js';
import { bybitBreakers, fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../logger.js';
import type { Candle, Category } from './engine/index.js';
import type { LeaseStore } from './MatchingEngine.js';

const LEASE_ID = 'matching-engine';
const MAX_BACKFILL_CANDLES = 1000;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Engine lease on a single EngineLease row — plain Prisma writes, no raw SQL advisory lock
 * (web.md: no raw SQL). Taking it over requires the previous holder's lease to have expired.
 */
export function prismaLeaseStore(prisma: PrismaClient): LeaseStore {
  return {
    async tryAcquire(holder, ttlMs) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      try {
        await prisma.engineLease.create({ data: { id: LEASE_ID, holder, expiresAt } });
        return { acquired: true, lastTickAt: null };
      } catch (err) {
        // P2002: the row exists — take it only if it expired (or is already ours)
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
      const taken = await prisma.engineLease.updateMany({
        where: { id: LEASE_ID, OR: [{ expiresAt: { lt: now } }, { holder }] },
        data: { holder, expiresAt },
      });
      if (taken.count === 0) return { acquired: false, lastTickAt: null };
      const row = await prisma.engineLease.findUnique({ where: { id: LEASE_ID } });
      return { acquired: true, lastTickAt: row?.lastTickAt ?? null };
    },

    async renew(holder, ttlMs, lastTickAt) {
      const renewed = await prisma.engineLease.updateMany({
        where: { id: LEASE_ID, holder },
        data: {
          expiresAt: new Date(Date.now() + ttlMs),
          ...(lastTickAt ? { lastTickAt } : {}),
        },
      });
      return renewed.count === 1;
    },

    async release(holder) {
      await prisma.engineLease.updateMany({
        where: { id: LEASE_ID, holder },
        data: { expiresAt: new Date(0) },
      });
    },
  };
}

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result?: { list?: string[][] };
}

/** Longest gap replayed from candles (7 days of 1m candles, 11 requests) */
const MAX_BACKFILL_MS = 7 * 24 * 60 * 60_000;

/**
 * Which price a backfill candle is built from: the last traded price (`/v5/market/kline` — TP/SL,
 * stops and limit fills trigger on it) or the mark price (`/v5/market/mark-price-kline`, USDT
 * Perpetual only — liquidation triggers on it, BP-3) or the index price
 * (`/v5/market/index-price-kline`, USDT Perpetual only — for a TP / SL / stop set to trigger on the
 * index, BP-5 B). A leg set to the mark price reads the mark candles.
 */
export type CandleSource = 'last' | 'mark' | 'index';

const CANDLE_PATH: Record<CandleSource, string> = {
  last: '/v5/market/kline',
  mark: '/v5/market/mark-price-kline',
  index: '/v5/market/index-price-kline',
};

/**
 * 1m candles of the market's own category covering [fromMs, toMs], oldest first. Bybit returns
 * the newest ≤ 1000 candles of a range, so pages are fetched backwards from `toMs` until `fromMs`
 * is covered. A gap longer than MAX_BACKFILL_MS is cut to its newest part, with a warning.
 */
export async function fetchCandles(
  category: Category,
  symbol: string,
  fromMs: number,
  toMs: number,
  source: CandleSource = 'last'
): Promise<Candle[]> {
  let start = Math.floor(fromMs / 60_000) * 60_000;
  if (toMs - start > MAX_BACKFILL_MS) {
    logger
      .child({ service: 'MatchingEngine' })
      .warn(
        { symbol, fromMs, toMs },
        'Backfill gap exceeds 7 days — replaying the newest 7 days only'
      );
    start = toMs - MAX_BACKFILL_MS;
  }
  const byStart = new Map<number, Candle>();
  let end = toMs;
  while (end >= start) {
    const page = await fetchCandlePage(category, symbol, start, end, source);
    for (const c of page) byStart.set(c.start, c);
    if (page.length < MAX_BACKFILL_CANDLES) break; // reached the start of the range
    const oldest = Math.min(...page.map((c) => c.start));
    if (oldest <= start) break;
    end = oldest - 1;
  }
  return [...byStart.values()].filter((c) => c.start >= start).sort((a, b) => a.start - b.start);
}

async function fetchCandlePage(
  category: Category,
  symbol: string,
  start: number,
  end: number,
  source: CandleSource
): Promise<Candle[]> {
  const params = new URLSearchParams({
    category,
    symbol,
    interval: '1',
    start: String(start),
    end: String(end),
    limit: String(MAX_BACKFILL_CANDLES),
  });
  // source is a typed union key — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  const path = CANDLE_PATH[source];
  const res = await fetchWithRetry(
    `${bybitRestBaseUrl()}${path}?${params.toString()}`,
    bybitBreakers.backfill,
    { timeoutMs: FETCH_TIMEOUT_MS }
  );
  if (!res.ok) throw new Error(`Bybit REST error: ${res.status}`);
  const data = (await res.json()) as BybitKlineResponse;
  const list = data.result?.list;
  if (data.retCode !== 0 || !Array.isArray(list)) {
    throw new Error(`Bybit API error: ${data.retMsg ?? 'unknown'} [${source} backfill ${symbol}]`);
  }
  // Each item: [startTime, open, high, low, close, …], newest first (mark candles stop at close)
  return list
    .map((item) => ({
      start: parseInt(item[0], 10),
      open: new Decimal(item[1]),
      high: new Decimal(item[2]),
      low: new Decimal(item[3]),
    }))
    .filter((c) => Number.isFinite(c.start));
}

// ─── Funding history (BP-4) ─────────────────────────────────────────────────────

interface BybitFundingResponse {
  retCode: number;
  retMsg: string;
  result?: { list?: { fundingRate?: string; fundingRateTimestamp?: string }[] };
}

/** One settled funding: the rate Bybit applied at `ts`. */
export interface FundingRate {
  ts: number;
  rate: Decimal;
}

const FUNDING_PAGE = 200;

/**
 * Settled funding rates of a USDT Perpetual symbol with `fromMs < ts ≤ toMs`, oldest first, from
 * `/v5/market/funding/history` (newest first, ≤ 200 per page, paged back with `endTime`; `startTime`
 * alone is an error, so both are always sent). Capped like the candle backfill (7 days).
 */
export async function fetchFundingHistory(
  symbol: string,
  fromMs: number,
  toMs: number
): Promise<FundingRate[]> {
  const start = Math.max(fromMs, toMs - MAX_BACKFILL_MS);
  const byTs = new Map<number, FundingRate>();
  let end = toMs;
  while (end > start) {
    const params = new URLSearchParams({
      category: 'linear',
      symbol,
      startTime: String(start),
      endTime: String(end),
      limit: String(FUNDING_PAGE),
    });
    const res = await fetchWithRetry(
      `${bybitRestBaseUrl()}/v5/market/funding/history?${params.toString()}`,
      bybitBreakers.backfill,
      { timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) throw new Error(`Bybit REST error: ${res.status}`);
    const data = (await res.json()) as BybitFundingResponse;
    const list = data.result?.list;
    if (data.retCode !== 0 || !Array.isArray(list)) {
      throw new Error(`Bybit API error: ${data.retMsg ?? 'unknown'} [funding history ${symbol}]`);
    }
    const page = list
      .map((item) => ({
        ts: parseInt(item.fundingRateTimestamp ?? '', 10),
        rate: new Decimal(item.fundingRate ?? 'NaN'),
      }))
      .filter((f) => Number.isFinite(f.ts) && f.rate.isFinite());
    for (const f of page) byTs.set(f.ts, f);
    if (page.length < FUNDING_PAGE) break;
    const oldest = Math.min(...page.map((f) => f.ts));
    if (oldest <= start) break;
    end = oldest - 1;
  }
  return [...byTs.values()]
    .filter((f) => f.ts > fromMs && f.ts <= toMs)
    .sort((a, b) => a.ts - b.ts);
}
