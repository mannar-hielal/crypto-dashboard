/**
 * Migration replay on a real Postgres (T2i, test plan roadmap P1): a database as the app left it
 * before BP-1 (fixtures/pre-bp1.sql), brought up to date by `prisma migrate deploy`, must carry
 * the data migrations' backfills (BP-1 pending leverage, BP-2 fees and categories, BP-3 one-way
 * merge, BP-5 isolated for existing accounts) and still load and trade through AccountRepository.
 *
 * It runs in a second throwaway database next to the integration one (`…_replay_int`), created
 * and dropped here, so the from-empty database the other files use is untouched. Not a separate
 * schema: the BP-2 migration's constraint guard reads `pg_constraint` database-wide. The pre-BP-1
 * migrations are applied as SQL and recorded as applied (`migrate resolve`), the fixture is
 * loaded, then `migrate deploy` runs the rest.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Decimal } from '@prisma/client/runtime/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { AccountRepository } from '../../trading/AccountRepository.js';
import { fallbackRiskTiers } from '../../trading/bybitSpec.js';
import {
  applyDelta,
  cancelPending,
  closePosition,
  type EngineContext,
  type Quote,
} from '../../trading/engine/index.js';
import { createUser } from './db.js';
import { SERVER_DIR, assertThrowawayDatabase, prisma } from './prismaCli.js';

/** The first migration the fixture predates: the server trading engine */
const FIRST_REPLAYED = '20260926090000_bp1_server_engine';
const MIGRATIONS_DIR = join(SERVER_DIR, 'prisma/migrations');
const FIXTURE = join(SERVER_DIR, 'src/__tests__/int/fixtures/pre-bp1.sql');

const baseUrl = process.env.DATABASE_URL as string;
/** crypto_dashboard_int → crypto_dashboard_replay_int, on the same server */
const replayUrl = (() => {
  const u = new URL(baseUrl);
  u.pathname = u.pathname.replace(/_(int|test)$/, '') + '_replay_int';
  return u.toString();
})();
const replayDb = new URL(replayUrl).pathname.slice(1);

let db: PrismaClient;
let deployOutput = '';
/** 🔐 Set only once this file created the replay database: afterAll never drops anything else */
let created = false;
/** The whole setup ran: only then does a failed drop get reported (else setup's error is the one) */
let ready = false;

/** `prisma <args>` on the replay database; throws with the CLI output when it fails. */
function run(args: string[], input?: string, url = replayUrl): string {
  const res = prisma(args, url, input);
  if (res.status !== 0) throw new Error(`prisma ${args.join(' ')} failed:\n${res.output}`);
  return res.output;
}

beforeAll(() => {
  // 🔐 Dropped and rebuilt from the integration database's server: throwaway names only
  assertThrowawayDatabase(baseUrl);
  assertThrowawayDatabase(replayUrl);
  // One statement per call: CREATE / DROP DATABASE can't run inside a multi-statement batch
  run(['db', 'execute', '--stdin'], `DROP DATABASE IF EXISTS "${replayDb}" WITH (FORCE);`, baseUrl);
  run(['db', 'execute', '--stdin'], `CREATE DATABASE "${replayDb}";`, baseUrl);
  created = true;

  // A fixed path inside the repo (no input reaches it)
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const folders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const before = folders.filter((name) => name < FIRST_REPLAYED);
  expect(before.length).toBeGreaterThan(0);
  expect(folders).toContain(FIRST_REPLAYED);

  for (const name of before) {
    run(['db', 'execute', '--file', join('prisma/migrations', name, 'migration.sql')]);
    run(['migrate', 'resolve', '--applied', name]);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  run(['db', 'execute', '--stdin'], readFileSync(FIXTURE, 'utf8'));
  deployOutput = run(['migrate', 'deploy']);

  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: replayUrl }),
  });
  ready = true;
}, 180_000);

// Vitest runs afterAll even when beforeAll threw — including when the guard refused the database
afterAll(async () => {
  await db?.$disconnect();
  if (!created) return;
  const drop = prisma(
    ['db', 'execute', '--stdin'],
    baseUrl,
    `DROP DATABASE IF EXISTS "${replayDb}" WITH (FORCE);`
  );
  if (ready) expect(drop.status, drop.output).toBe(0);
});

const str = (v: { toString(): string } | null | undefined) =>
  v === null || v === undefined ? null : v.toString();

describe('migration replay from a pre-BP-1 database', () => {
  it('applies every later migration and leaves no drift', () => {
    expect(deployOutput).toContain(FIRST_REPLAYED);
    expect(run(['migrate', 'status'])).toContain('Database schema is up to date');
    const diff = prisma(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      replayUrl
    );
    expect(diff.output).not.toMatch(/\[\+\]|\[-\]|\[\*\]/);
    expect(diff.status).toBe(0);
  });

  it('[14.7.1] stamps every old position, order and trade USDT Perpetual (D7)', async () => {
    const [positions, orders, trades] = await Promise.all([
      db.position.findMany(),
      db.order.findMany(),
      db.trade.findMany(),
    ]);
    expect(positions.length + orders.length + trades.length).toBeGreaterThan(0);
    for (const row of [...positions, ...orders, ...trades]) {
      expect(row.category, row.id).toBe('linear');
    }
    expect(trades[0]).toMatchObject({ execType: 'Trade', feeRate: null });
    expect(str(trades[0]?.funding)).toBe('0');
    expect(str(trades[0]?.openFee)).toBe('0');
  });

  it('[14.7.1] backfills pending orders: BP-1 leverage from qty × price / margin, BP-2 reserve at the 0.07% they took', async () => {
    const pending = await db.order.findMany({
      where: { status: 'PENDING' },
      orderBy: { id: 'asc' },
    });
    expect(pending.map((o) => [o.id, o.leverage, str(o.reserved), o.feeRate, o.triggerBy])).toEqual(
      [
        // 0.3 × 40,000 / 1,200 = 10×; 1,200 × 1.0007
        ['rp-o1', 10, '1200.84', null, 'LastPrice'],
        // 1 × 2,800 / 1,400 = 2×; 1,400 × 1.0007
        ['rp-o2', 2, '1400.98', null, 'LastPrice'],
      ]
    );
  });

  it('[14.7.1] marks old fills taker at 0.07% in USDT; a cancelled order gets no fee or reserve', async () => {
    const filled = await db.order.findUniqueOrThrow({ where: { id: 'rp-o3' } });
    expect([str(filled.feeRate), filled.feeAsset, filled.isMaker, str(filled.reserved)]).toEqual([
      '0.0007',
      'USDT',
      false,
      '0',
    ]);
    const cancelled = await db.order.findUniqueOrThrow({ where: { id: 'rp-o4' } });
    expect([
      cancelled.feeRate,
      cancelled.feeAsset,
      cancelled.isMaker,
      str(cancelled.reserved),
    ]).toEqual([null, null, null, '0']);
  });

  it('[15.2.3] merges three same-side BTC longs into the oldest, from stored values only (BP-3)', async () => {
    const btc = await db.position.findMany({ where: { symbol: 'BTCUSDT' } });
    expect(btc).toHaveLength(1);
    const p = btc[0]!;
    expect({
      id: p.id,
      refId: p.refId,
      qty: str(p.quantity),
      entry: str(p.entryPrice),
      margin: str(p.margin),
      entryFee: str(p.entryFee),
      leverage: p.leverage,
      tp: str(p.takeProfit),
      sl: str(p.stopLoss),
    }).toEqual({
      id: 'rp-p1',
      refId: 'client-pos-1',
      qty: '0.4',
      // (0.2 × 50,000 + 0.1 × 52,000 + 0.1 × 51,000) / 0.4
      entry: '50750',
      margin: '2550',
      // 0.07% of each margin (BP-2), summed: 0.7 + 0.728 + 0.357
      entryFee: '1.785',
      // 20,300 / 2,550 = 7.96 → 8
      leverage: 8,
      // the newest take-profit (rp-p2) and the newest stop-loss (rp-p3)
      tp: '56000',
      sl: '47000',
    });

    const eth = await db.position.findMany({ where: { symbol: 'ETHUSDT' } });
    expect(eth.map((e) => [e.id, e.leverage, str(e.entryFee)])).toEqual([['rp-p4', 5, '0.84']]);

    const journal = await db.journalEntry.findMany({ where: { userId: 'rp-u1' } });
    expect(journal.map((j) => j.text)).toEqual([
      'Merged 3 LONG BTCUSDT positions into one (one-way mode, as on Bybit) @ avg $50750.00',
    ]);

    const settings = await db.symbolSetting.findMany({
      where: { accountId: 'rp-a1' },
      orderBy: { symbol: 'asc' },
    });
    expect(settings.map((s) => [s.symbol, s.leverage, s.marginMode, s.leveragePinned])).toEqual([
      ['BTCUSDT', 8, 'isolated', true],
      ['ETHUSDT', 5, 'isolated', true],
    ]);
  });

  it('[17.5.1] keeps every existing account isolated with the one-time notice (BP-5 O2)', async () => {
    const accounts = await db.account.findMany({ orderBy: { id: 'asc' } });
    expect(accounts.map((a) => [a.id, a.marginMode, a.marginModeNotice, a.version])).toEqual([
      ['rp-a1', 'ISOLATED_MARGIN', true, 0],
      ['rp-a2', 'ISOLATED_MARGIN', true, 0],
    ]);
  });

  describe('the migrated account in the engine', () => {
    const D = (v: number | string) => new Decimal(v);
    const quote = (price: number): Quote => ({
      last: D(price),
      bid: D(price),
      ask: D(price),
      mark: D(price),
      index: D(price),
    });
    let ids = 0;
    const ctx = (): EngineContext => ({
      now: Date.now(),
      newId: () => `replay-${++ids}`,
      riskTiers: fallbackRiskTiers,
      markPrice: () => D(51_000),
    });
    const repo = () => new AccountRepository(db, fallbackRiskTiers);

    it('loads with its positions, pending orders, per-symbol leverage and balance', async () => {
      const { state, version } = await repo().load('rp-u1');
      expect(version).toBe(0);
      expect(state.balance.toString()).toBe('3670.555');
      expect(state.marginMode).toBeUndefined(); // isolated
      expect(state.symbolLeverage).toEqual({ BTCUSDT: 8, ETHUSDT: 5 });
      expect(
        state.positions.map((p) => [
          p.id,
          p.side,
          p.leverage,
          p.quantity.toString(),
          p.entryFee.toString(),
        ])
      ).toEqual([
        ['client-pos-1', 'long', 8, '0.4', '1.785'],
        ['rp-p4', 'short', 5, '2', '0.84'],
      ]);
      expect(
        state.pendingOrders.map((o) => [o.id, o.type, o.leverage, o.reserved.toString()])
      ).toEqual([
        ['client-ord-1', 'limit', 10, '1200.84'],
        ['rp-o2', 'stop', 2, '1400.98'],
      ]);
    });

    it('refunds an old pending order its full reserve on cancel', async () => {
      const out = await repo().mutate('rp-u1', ({ state }) =>
        cancelPending(state, 'client-ord-1', ctx())
      );
      expect(out?.result).toBe(true);
      const { state } = await repo().load('rp-u1');
      expect(state.balance.toString()).toBe('4871.395'); // 3,670.555 + 1,200.84
      expect(state.pendingOrders.map((o) => o.id)).toEqual(['rp-o2']);
    });

    it('closes the merged position and reads back what the engine computed', async () => {
      const out = await repo().mutate('rp-u1', ({ state }) =>
        closePosition(state, 'client-pos-1', quote(51_000), ctx())
      );
      expect(out?.result).not.toBeNull();
      const { state } = await repo().load('rp-u1');
      expect(state.positions.map((p) => p.id)).toEqual(['rp-p4']);
      expect(state.balance.toString()).toBe(applyDelta(out!.before, out!.delta).balance.toString());
      // Margin back plus profit: 2,550 + 0.4 × (51,000 − 50,750) = 2,650, less the close fee
      expect(state.balance.gt(D('4871.395').plus(2_600))).toBe(true);
    });

    it('serves the old history rows in the snapshot', async () => {
      const snap = await repo().snapshot('rp-u1');
      expect(snap.trades.some((t) => t.id === 'rp-t1')).toBe(true);
    });

    it('loads the account that never traded', async () => {
      const { state } = await repo().load('rp-u2');
      expect(state.balance.toString()).toBe('10000');
      expect(state.positions).toEqual([]);
      expect(state.pendingOrders).toEqual([]);
    });

    it('[17.5.1] opens an account created after the migration in cross, with no notice', async () => {
      const loaded = await repo().load(await createUser(db));
      expect(loaded.state.marginMode).toBe('REGULAR_MARGIN');
      expect(loaded.marginModeNotice).toBe(false);
    });
  });
});
