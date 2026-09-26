/**
 * Bybit market info — instrument rules and risk-limit tiers (BYBIT_PARITY_PLAN BP-0).
 *
 * Instrument rules (tick size, qty step, min order size, max leverage) and risk-limit tiers
 * change rarely, so they are fetched from Bybit's public REST API on demand and cached for
 * CACHE_TTL_MS. Concurrent requests for the same key share one upstream fetch, and a failed
 * refresh serves the stale value when there is one.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { ALLOWED_SYMBOLS, type AllowedSymbol, type BybitCategory } from '../constants.js';

const log = logger.child({ service: 'BybitMarketInfo' });

// ─── Types ────────────────────────────────────────────────────────────────────

/** Trading rules for one symbol in one category, normalised across spot and linear. */
export interface Instrument {
  symbol: string;
  category: BybitCategory;
  /** Price increment */
  tickSize: number;
  /** Quantity increment — spot `basePrecision`, linear `qtyStep` */
  qtyStep: number;
  /** Minimum order quantity in the base coin */
  minOrderQty: number;
  /** Minimum order value in USDT — spot `minOrderAmt`, linear `minNotionalValue` */
  minNotional: number;
  /** Bybit's max leverage (linear only; we still cap at MAX_LEVERAGE) */
  maxLeverage: number | null;
  /** Funding interval in minutes (linear only) */
  fundingIntervalMin: number | null;
}

/** One risk-limit tier of a linear (USDT Perpetual) symbol. */
export interface RiskLimitTier {
  id: number;
  /** Upper bound of position value (USDT) for this tier */
  riskLimitValue: number;
  /** Maintenance margin rate, e.g. 0.005 = 0.5% */
  maintenanceMarginRate: number;
  /** Initial margin rate */
  initialMarginRate: number;
  maxLeverage: number;
  /** USDT deducted from the maintenance margin at this tier (0 for tier 1) */
  mmDeduction: number;
}

interface BybitListResponse {
  retCode: number;
  retMsg: string;
  result?: { list?: unknown[] };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const FETCH_TIMEOUT_MS = 8_000;

export function bybitRestBaseUrl(): string {
  return config.bybitTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
}

// ─── Cache ────────────────────────────────────────────────────────────────────
// Keys are fixed: 'instruments:spot' | 'instruments:linear' | 'risk-limit:{symbol}' for the
// allow-listed symbols — at most 2 + 9 entries, so the map is bounded by construction.

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return Promise.resolve(entry.value);

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = load()
    .then((value) => {
      cache.set(key, { value, fetchedAt: Date.now() });
      return value;
    })
    .catch((err: unknown) => {
      if (entry) {
        log.warn({ err, key }, 'Bybit market info refresh failed — serving stale value');
        return entry.value;
      }
      throw err;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

/** Test helper: drop cached values so each test starts cold. */
export function clearMarketInfoCache(): void {
  cache.clear();
  inFlight.clear();
}

// ─── Upstream fetch ───────────────────────────────────────────────────────────

async function fetchBybitList(path: string, params: Record<string, string>): Promise<unknown[]> {
  const url = `${bybitRestBaseUrl()}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Bybit REST error: ${res.status}`);

  const data = (await res.json()) as BybitListResponse;
  const list = data.result?.list;
  if (data.retCode !== 0 || !Array.isArray(list)) {
    throw new Error(`Bybit API error: ${data.retMsg ?? 'unknown'} [path=${path}]`);
  }
  return list;
}

/** Parse a Bybit numeric string; null when absent or non-finite. */
function num(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function field(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  // key is always a literal from this module — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  return (obj as Record<string, unknown>)[key];
}

/** Normalise one instruments-info list item; null if a required rule is missing. */
export function parseInstrument(category: BybitCategory, raw: unknown): Instrument | null {
  const symbol = field(raw, 'symbol');
  const lot = field(raw, 'lotSizeFilter');
  const tickSize = num(field(field(raw, 'priceFilter'), 'tickSize'));
  const qtyStep = num(field(lot, category === 'spot' ? 'basePrecision' : 'qtyStep'));
  const minOrderQty = num(field(lot, 'minOrderQty'));
  const minNotional = num(field(lot, category === 'spot' ? 'minOrderAmt' : 'minNotionalValue'));

  if (
    typeof symbol !== 'string' ||
    tickSize === null ||
    qtyStep === null ||
    minOrderQty === null ||
    minNotional === null
  ) {
    return null;
  }

  return {
    symbol,
    category,
    tickSize,
    qtyStep,
    minOrderQty,
    minNotional,
    maxLeverage:
      category === 'linear' ? num(field(field(raw, 'leverageFilter'), 'maxLeverage')) : null,
    fundingIntervalMin: category === 'linear' ? num(field(raw, 'fundingInterval')) : null,
  };
}

/** Normalise one risk-limit list item; null if a required field is missing. */
export function parseRiskLimitTier(raw: unknown): RiskLimitTier | null {
  const id = num(field(raw, 'id'));
  const riskLimitValue = num(field(raw, 'riskLimitValue'));
  const maintenanceMarginRate = num(field(raw, 'maintenanceMargin'));
  const initialMarginRate = num(field(raw, 'initialMargin'));
  const maxLeverage = num(field(raw, 'maxLeverage'));
  if (
    id === null ||
    riskLimitValue === null ||
    maintenanceMarginRate === null ||
    initialMarginRate === null ||
    maxLeverage === null
  ) {
    return null;
  }
  return {
    id,
    riskLimitValue,
    maintenanceMarginRate,
    initialMarginRate,
    maxLeverage,
    // Bybit sends "" for tier 1
    mmDeduction: num(field(raw, 'mmDeduction')) ?? 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Instrument rules for every allow-listed symbol in a category. */
export function getInstruments(category: BybitCategory): Promise<Instrument[]> {
  return cached(`instruments:${category}`, async () => {
    // One request per symbol: an unfiltered spot request returns every Bybit spot pair.
    const lists = await Promise.all(
      ALLOWED_SYMBOLS.map((symbol) =>
        fetchBybitList('/v5/market/instruments-info', { category, symbol })
      )
    );
    const instruments: Instrument[] = [];
    lists.forEach((list, i) => {
      // i indexes the fixed ALLOWED_SYMBOLS tuple — safe, controlled access
      // eslint-disable-next-line security/detect-object-injection
      const symbol = ALLOWED_SYMBOLS[i];
      const instrument = list.length > 0 ? parseInstrument(category, list[0]) : null;
      if (instrument) {
        instruments.push(instrument);
      } else {
        log.warn({ category, symbol }, 'Instrument missing or malformed — skipped');
      }
    });
    return instruments;
  });
}

/** Risk-limit tiers of a linear (USDT Perpetual) symbol, lowest tier first. */
export function getRiskLimit(symbol: AllowedSymbol): Promise<RiskLimitTier[]> {
  return cached(`risk-limit:${symbol}`, async () => {
    const list = await fetchBybitList('/v5/market/risk-limit', { category: 'linear', symbol });
    const tiers = list
      .map(parseRiskLimitTier)
      .filter((tier): tier is RiskLimitTier => tier !== null)
      .sort((a, b) => a.riskLimitValue - b.riskLimitValue);
    if (tiers.length === 0) throw new Error(`Bybit risk-limit empty [symbol=${symbol}]`);
    return tiers;
  });
}
