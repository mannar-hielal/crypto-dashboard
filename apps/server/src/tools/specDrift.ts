/**
 * Weekly Bybit spec-drift check (TEST_IMPLEMENTATION_PLAN M6, test plan roadmap P3): the engine's
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
import { getInstruments, getRiskLimit } from '../services/BybitMarketInfo.js';
import {
  fallbackRiskTiers,
  fallbackRules,
  riskTiersFromBybit,
  rulesFromInstrument,
} from '../trading/bybitSpec.js';

const log = logger.child({ service: 'SpecDrift' });
/** The app's leverage cap (the risk-tier snapshot is kept up to it) */
const MAX_LEVERAGE = 10;

/** Every difference between the snapshot and Bybit, as readable lines. */
export async function specDrift(): Promise<string[]> {
  const drift: string[] = [];
  const eq = (a: Decimal, b: Decimal) => a.eq(b);

  for (const category of ALLOWED_CATEGORIES) {
    const live = new Map((await getInstruments(category)).map((i) => [i.symbol, i]));
    for (const symbol of ALLOWED_SYMBOLS) {
      const instrument = live.get(symbol);
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
