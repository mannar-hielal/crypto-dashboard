/**
 * Weekly Bybit spec-drift check (docs/TRADING_TEST_PLAN.md roadmap P3, M6): the engine's
 * dated Bybit snapshots in trading/bybitSpec.ts against Bybit mainnet's public API — instrument rules
 * (tick, qty step, minimum qty and value) for Spot and USDT Perpetual, and every symbol's risk-limit
 * tiers. The live values are what the server uses while its cache is warm; the snapshot is its
 * fallback, and the SDK's price-tick table is held equal to it (bybitSpec.test). A drift means the
 * fallback, the SDK table and the fake feed's fixtures (`record:bybit`) need a refresh.
 *
 *   BYBIT_TESTNET=false pnpm --filter @crypto-dashboard/server exec tsx src/tools/specDrift.ts
 *
 * Runs weekly on a Fly Machine in sin (feed-parity.yml): Bybit geo-blocks GitHub's runners. Fee rates
 * aren't compared — Bybit only serves them to a signed-in account.
 */

import { Decimal } from '@prisma/client/runtime/client';
import { config } from '../config.js';
import { ALLOWED_CATEGORIES, ALLOWED_SYMBOLS } from '../constants.js';
import { logger } from '../logger.js';
import type { BybitCategory } from '../constants.js';
import {
  bybitRestBaseUrl,
  getRiskLimit,
  parseInstrument,
  type Instrument,
} from '../services/BybitMarketInfo.js';
import {
  fallbackRiskTiers,
  fallbackRules,
  riskTiersFromBybit,
  rulesFromInstrument,
} from '../trading/bybitSpec.js';

const log = logger.child({ service: 'SpecDrift' });
/** The app's leverage cap (the risk-tier snapshot is kept up to it) */
const MAX_LEVERAGE = 10;

/** Bybit's instrument, or null if Bybit answered without it; throws if it can't be read (3 tries). */
async function instrumentOf(category: BybitCategory, symbol: string): Promise<Instrument | null> {
  const url = `${bybitRestBaseUrl()}/v5/market/instruments-info?${new URLSearchParams({ category, symbol }).toString()}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        retCode: number;
        retMsg: string;
        result?: { list?: unknown[] };
      };
      if (body.retCode !== 0 || !Array.isArray(body.result?.list)) throw new Error(body.retMsg);
      const row = body.result.list.find((r) => (r as { symbol?: unknown }).symbol === symbol);
      return row ? parseInstrument(category, row) : null;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, attempt * 2_000));
    }
  }
  throw new Error(`instruments-info ${category} ${symbol} unreadable: ${String(lastError)}`);
}

/** Every difference between the snapshot and Bybit, as readable lines. */
export async function specDrift(): Promise<string[]> {
  const drift: string[] = [];
  const eq = (a: Decimal, b: Decimal) => a.eq(b);

  for (const category of ALLOWED_CATEGORIES) {
    for (const symbol of ALLOWED_SYMBOLS) {
      // One symbol per read, retried: a failed read throws (the run fails as "check failed"), so
      // only a symbol Bybit answered for without listing it is reported as drift
      const instrument = await instrumentOf(category, symbol);
      if (!instrument) {
        drift.push(`${category} ${symbol}: not listed by Bybit`);
        continue;
      }
      const now = rulesFromInstrument(instrument);
      const snap = fallbackRules(category, symbol);
      for (const k of ['tickSize', 'qtyStep', 'minOrderQty', 'minNotional'] as const) {
        // eslint-disable-next-line security/detect-object-injection -- fixed keys
        if (!eq(now[k], snap[k])) drift.push(`${category} ${symbol} ${k}: ${snap[k]} → ${now[k]}`);
      }
    }
  }

  for (const symbol of ALLOWED_SYMBOLS) {
    // The snapshot keeps every tier up to the first whose max leverage is below our 10× cap
    const live = riskTiersFromBybit(await getRiskLimit(symbol));
    const lastNeeded = live.findIndex((t) => t.maxLeverage.lt(MAX_LEVERAGE));
    const now = lastNeeded === -1 ? live : live.slice(0, lastNeeded + 1);
    const snap = fallbackRiskTiers(symbol);
    if (now.length !== snap.length) {
      drift.push(`risk tiers ${symbol}: ${snap.length} tiers → ${now.length}`);
      continue;
    }
    now.forEach((tier, i) => {
      // eslint-disable-next-line security/detect-object-injection -- same length, checked above
      const old = snap[i]!;
      for (const k of ['riskLimitValue', 'mmr', 'mmDeduction', 'imr', 'maxLeverage'] as const) {
        // eslint-disable-next-line security/detect-object-injection -- fixed keys
        const [was, is] = [old[k], tier[k]];
        if (!eq(is, was)) drift.push(`risk tier ${symbol} #${i + 1} ${k}: ${was} → ${is}`);
      }
    });
  }
  return drift;
}

async function main(): Promise<void> {
  // 🔐 Public data only, but it must be mainnet's: the snapshot is mainnet's
  if (config.bybitTestnet) throw new Error('Run with BYBIT_TESTNET=false: the snapshot is mainnet');
  const drift = await specDrift();
  if (drift.length === 0) {
    log.info('Spec drift: none — bybitSpec.ts matches Bybit');
    return;
  }
  for (const line of drift) log.warn({ drift: line }, 'Spec drift');
  log.error({ count: drift.length }, 'Spec drift found');
  process.exitCode = 1;
}

// Run only as a script (the test imports specDrift)
if (process.argv[1]?.endsWith('specDrift.ts') || process.argv[1]?.endsWith('specDrift.js')) {
  main().catch((err: unknown) => {
    log.error({ err }, 'Spec drift check failed');
    process.exitCode = 1;
  });
}
