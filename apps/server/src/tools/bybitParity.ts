/**
 * Bybit testnet API-parity run (APP_LOG Bybit Parity BP-5 G) — nightly in CI (parity.yml) or by hand.
 *
 *   pnpm --filter @crypto-dashboard/server parity:testnet
 *
 * Replays a fixed BTCUSDT scenario on Bybit testnet (the account in BYBIT_API_KEY / SECRET) and on
 * the paper engine, then compares Bybit's v5 fields with the engine's, mapped through
 * trading/bybitParity.ts. There is no shared order book, so each step feeds Bybit's own fill price
 * into the engine and compares the maths that follows: position margin figures, liquidation /
 * bankruptcy prices, add margin, TP / SL by trigger source, a reduce-only partial close's Closed
 * P&L, and the cross account figures.
 *
 * 🔐 Refuses to run unless BYBIT_TESTNET=true — it places real orders. Keys come from config.ts
 * and are never logged. It trades 0.001 BTC and closes everything it opened before it ends.
 *
 * Not scripted (they need wall-clock timing): funding settlement and liquidation — compare those
 * by hand from execution/list (execType Funding / BustTrade).
 */

import { Decimal } from '@prisma/client/runtime/client';
import { RestClientV5 } from 'bybit-api';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getRiskLimit } from '../services/BybitMarketInfo.js';
import { accountFigures, riskTiersFromBybit } from '../trading/bybitSpec.js';
import {
  adjustMargin,
  applyDelta,
  placeMarket,
  updatePositionExits,
  type AccountState,
  type EngineContext,
} from '../trading/engine/index.js';
import { positionDTO, tradeDTO } from '../trading/mappers.js';
import {
  diffFields,
  toBybitClosedPnl,
  toBybitPosition,
  toBybitWallet,
  type FieldDiff,
} from '../trading/bybitParity.js';

const log = logger.child({ service: 'BybitParity' });
const SYMBOL = 'BTCUSDT';
const QTY = '0.001';
const LEVERAGE = 10;
/**
 * 🔐 Unattended runs (parity.yml) must never leave a position open. Past DEADLINE_MS the scenario
 * is aborted: every later response throws, so it stops placing orders and its own `finally` cleans
 * up. If it is stuck instead, the deadline cleans up itself after ABORT_GRACE_MS. Either way the
 * process exits no later than ABORT_GRACE_MS + HARD_EXIT_MS after the deadline, even if the cleanup
 * hangs. Every Bybit call times out after REQUEST_TIMEOUT_MS, and a cleanup that can't confirm the
 * position is flat fails the run.
 */
const DEADLINE_MS = 8 * 60_000;
const ABORT_GRACE_MS = 30_000;
const HARD_EXIT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** 'aborted' once the deadline passes (the scenario must stop); 'cleanup' while closing out. */
let phase: 'run' | 'aborted' | 'cleanup' = 'run';

const POSITION_FIELDS = [
  'size',
  'avgPrice',
  'positionValue',
  'leverage',
  'liqPrice',
  'bustPrice',
  'positionIM',
  'positionMM',
] as const;
const CLOSED_PNL_FIELDS = [
  'closedSize',
  'avgEntryPrice',
  'avgExitPrice',
  'openFee',
  'closeFee',
  'closedPnl',
] as const;
const WALLET_FIELDS = [
  'totalPerpUPL',
  'totalMarginBalance',
  'totalInitialMargin',
  'totalMaintenanceMargin',
  'totalAvailableBalance',
] as const;

type Row = Record<string, unknown>;

/** Unwrap a Bybit response; a non-zero retCode throws (the message, never the request). */
function unwrap<T>(step: string, res: { retCode: number; retMsg: string; result: T }): T {
  if (res.retCode !== 0) throw new Error(`${step}: Bybit ${res.retCode} ${res.retMsg}`);
  return res.result;
}

/**
 * The scenario's unwrap: once the deadline has fired (phase is no longer 'run') every later
 * response throws, so a late request can never lead the scenario on to its next order — not even
 * while the cleanup is running. The cleanup itself uses `unwrap`.
 */
function ok<T>(step: string, res: { retCode: number; retMsg: string; result: T }): T {
  if (phase !== 'run') throw new Error(`${step}: aborted — the parity run passed its deadline`);
  return unwrap(step, res);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  // 🔐 Real orders: testnet only
  if (!config.bybitTestnet) {
    log.error('BYBIT_TESTNET is not true — the parity run only trades on testnet');
    return 2;
  }
  const client = new RestClientV5(
    {
      key: config.bybitApiKey,
      secret: config.bybitApiSecret,
      testnet: true,
    },
    { timeout: REQUEST_TIMEOUT_MS } // the library's default is 5 minutes
  );
  /**
   * The scenario's view of the client: once the deadline has fired, every call throws before it is
   * sent, so no new request (mutating or not) can reach Bybit alongside the cleanup. The cleanup uses
   * `client` directly.
   */
  const live = new Proxy(client, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (phase !== 'run') {
          throw new Error(`${String(prop)}: not sent — the parity run passed its deadline`);
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  const tiers = riskTiersFromBybit(await getRiskLimit(SYMBOL));
  let seq = 0;
  const ctx = (): EngineContext => ({
    now: Date.now(),
    newId: () => `parity-${++seq}`,
    riskTiers: () => tiers,
  });
  const report: { step: string; diffs: FieldDiff[] }[] = [];
  const check = (step: string, bybit: Row, paper: Row, fields: readonly string[]) => {
    const diffs = diffFields(bybit, paper, fields);
    report.push({ step, diffs });
    log.info({ step, diffs: diffs.length ? diffs : 'match' }, 'Parity step');
  };
  const rules = {
    tickSize: new Decimal(0),
    qtyStep: new Decimal(0),
    minOrderQty: new Decimal(0),
    minNotional: new Decimal(0),
  };
  const quoteAt = (p: string) => {
    const price = new Decimal(p);
    return { last: price, bid: price, ask: price, mark: price };
  };
  const lastFill = async (orderId: string) => {
    for (let i = 0; i < 10; i++) {
      const list = ok(
        'execution/list',
        await live.getExecutionList({ category: 'linear', symbol: SYMBOL, orderId })
      ).list;
      if (list.length) return list[0];
      await pause(500);
    }
    throw new Error(`No execution for order ${orderId}`);
  };
  const bybitPosition = async () =>
    ok('position/list', await live.getPositionInfo({ category: 'linear', symbol: SYMBOL }))
      .list[0] as unknown as Row;

  // Close whatever is still open (either side), and leave the account isolated as found. A cleanup
  // that can't confirm the position is flat fails the run, whatever the diffs said.
  let cleaned = false;
  let cleanupFailed = false;
  const openPosition = async () =>
    unwrap('position/list', await client.getPositionInfo({ category: 'linear', symbol: SYMBOL }))
      .list[0] as unknown as Row | undefined;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (phase === 'run') phase = 'cleanup';
    try {
      const pos = await openPosition();
      const size = String(pos?.size ?? '0');
      if (new Decimal(size || '0').gt(0)) {
        unwrap(
          'cleanup close',
          await client.submitOrder({
            category: 'linear',
            symbol: SYMBOL,
            side: pos?.side === 'Sell' ? 'Buy' : 'Sell',
            orderType: 'Market',
            qty: size,
            reduceOnly: true,
          })
        );
        await pause(1_000);
        const left = String((await openPosition())?.size ?? '0');
        if (new Decimal(left || '0').gt(0))
          throw new Error(`cleanup: ${left} ${SYMBOL} still open`);
      }
    } catch (err) {
      cleanupFailed = true;
      log.error({ err }, 'Cleanup failed — a testnet position may be open; close it by hand');
    }
    await client.setMarginMode('ISOLATED_MARGIN').catch(() => undefined);
  };
  const deadline = setTimeout(() => {
    log.error({ deadlineMs: DEADLINE_MS }, 'Parity run passed its deadline — aborting');
    phase = 'aborted';
    // Hard stop, armed whichever path ends up cleaning up (the scenario's `finally` or the grace
    // timer below), so a cleanup that hangs can't keep the machine running
    setTimeout(() => {
      log.error('Parity run did not finish after its deadline — exiting');
      process.exit(1);
    }, ABORT_GRACE_MS + HARD_EXIT_MS).unref();
    // The scenario normally reaches its own `finally` within one request timeout; only a stuck
    // run gets cleaned up from here, so the two never place closing orders at the same time
    setTimeout(() => {
      if (cleaned) return;
      log.error('Parity run is stuck — cleaning up from the deadline');
      void cleanup().finally(() => process.exit(1));
    }, ABORT_GRACE_MS).unref();
  }, DEADLINE_MS);

  let state: AccountState = {
    balance: new Decimal(100_000),
    realizedPnl: new Decimal(0),
    leverage: LEVERAGE,
    symbolLeverage: { [SYMBOL]: LEVERAGE },
    symbolFundingAt: {},
    spot: [],
    positions: [],
    pendingOrders: [],
  };

  try {
    // ── 0. The account must start flat ────────────────────────────────────────
    // A position left by an earlier run would add to step 1's buy and skew every diff. Fail
    // loudly instead; the `finally` below still closes the leftover, so the next run starts clean.
    const leftover = await bybitPosition();
    if (new Decimal(String(leftover?.size ?? '0') || '0').gt(0)) {
      throw new Error(
        `account not flat: ${String(leftover?.size)} ${SYMBOL} already open (closing it in cleanup)`
      );
    }

    // ── 1. Isolated, 10×, market buy ──────────────────────────────────────────
    // Usually already isolated (the cleanup leaves it so); a refusal is logged, not fatal
    const isolated = await live.setMarginMode('ISOLATED_MARGIN');
    if (isolated.retCode !== 0) {
      log.warn({ retCode: isolated.retCode, retMsg: isolated.retMsg }, 'set-margin-mode isolated');
    }
    await live
      .setLeverage({
        category: 'linear',
        symbol: SYMBOL,
        buyLeverage: String(LEVERAGE),
        sellLeverage: String(LEVERAGE),
      })
      .catch(() => undefined); // 110043 "leverage not modified" is fine
    const buy = ok(
      'order/create',
      await live.submitOrder({
        category: 'linear',
        symbol: SYMBOL,
        side: 'Buy',
        orderType: 'Market',
        qty: QTY,
      })
    );
    const buyFill = await lastFill(buy.orderId);
    const opened = placeMarket(
      state,
      { symbol: SYMBOL, side: 'buy', size: { qty: new Decimal(QTY) } },
      quoteAt(buyFill.execPrice),
      rules,
      ctx()
    );
    state = applyDelta(state, opened.delta);
    const paperPos = () => toBybitPosition(positionDTO(state.positions[0], tiers));
    check(
      'open (isolated 10×)',
      await bybitPosition(),
      paperPos() as unknown as Row,
      POSITION_FIELDS
    );

    // ── 2. Add margin ─────────────────────────────────────────────────────────
    ok(
      'position/add-margin',
      await live.addOrReduceMargin({ category: 'linear', symbol: SYMBOL, margin: '10' })
    );
    state = applyDelta(
      state,
      adjustMargin(
        state,
        state.positions[0].id,
        new Decimal(10),
        ctx(),
        new Decimal(buyFill.execPrice)
      ).delta
    );
    check('add margin +10', await bybitPosition(), paperPos() as unknown as Row, POSITION_FIELDS);

    // ── 3. Stop-loss on the mark price ────────────────────────────────────────
    const sl = new Decimal(buyFill.execPrice).times('0.95').toDecimalPlaces(1).toString();
    ok(
      'position/trading-stop',
      await live.setTradingStop({
        category: 'linear',
        symbol: SYMBOL,
        stopLoss: sl,
        slTriggerBy: 'MarkPrice',
        tpslMode: 'Full',
        positionIdx: 0,
      })
    );
    state = applyDelta(
      state,
      updatePositionExits(state, state.positions[0].id, null, new Decimal(sl), ctx(), {
        slTriggerBy: 'MarkPrice',
      }).delta
    );
    check('stop-loss by mark', await bybitPosition(), paperPos() as unknown as Row, [
      'stopLoss',
      'slTriggerBy',
    ]);

    // ── 4. Reduce-only partial close → Closed P&L ────────────────────────────
    const half = new Decimal(QTY).div(2).toString();
    const sell = ok(
      'order/create',
      await live.submitOrder({
        category: 'linear',
        symbol: SYMBOL,
        side: 'Sell',
        orderType: 'Market',
        qty: half,
        reduceOnly: true,
      })
    );
    const sellFill = await lastFill(sell.orderId);
    const closed = placeMarket(
      state,
      { symbol: SYMBOL, side: 'sell', size: { qty: new Decimal(half) }, reduceOnly: true },
      quoteAt(sellFill.execPrice),
      rules,
      ctx()
    );
    state = applyDelta(state, closed.delta);
    await pause(1_000);
    const bybitClose = ok(
      'position/closed-pnl',
      await live.getClosedPnL({ category: 'linear', symbol: SYMBOL, limit: 1 })
    ).list[0] as unknown as Row;
    check(
      'reduce-only half close — closed P&L',
      bybitClose,
      toBybitClosedPnl(tradeDTO(closed.delta.trades[0])) as unknown as Row,
      CLOSED_PNL_FIELDS
    );

    // ── 5. Cross: the account figures of what is left ─────────────────────────
    ok('set-margin-mode cross', await live.setMarginMode('REGULAR_MARGIN'));
    const wallet = ok(
      'account/wallet-balance',
      await live.getWalletBalance({ accountType: 'UNIFIED' })
    ).list[0] as unknown as Row & { totalWalletBalance: string };
    const bybitPos = await bybitPosition();
    const figures = accountFigures(
      new Decimal(String(wallet.totalWalletBalance)),
      [
        {
          side: 'long',
          quantity: state.positions[0].quantity,
          entryPrice: state.positions[0].entryPrice,
          leverage: LEVERAGE,
          mark: new Decimal(String(bybitPos.markPrice)),
          tiers,
        },
      ],
      new Decimal(0)
    );
    // Other coins / positions on the testnet account shift the wallet-level totals: compare with
    // an otherwise empty testnet account
    check('cross account figures', wallet, toBybitWallet(figures) as unknown as Row, WALLET_FIELDS);
  } finally {
    clearTimeout(deadline);
    await cleanup();
  }

  if (cleanupFailed) return 1;
  const failed = report.filter((r) => r.diffs.length > 0);
  log.info(
    { steps: report.length, mismatched: failed.map((r) => r.step) },
    failed.length ? 'Parity run: mismatches found' : 'Parity run: every step matches Bybit'
  );
  return failed.length ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    log.error({ err }, 'Parity run failed');
    process.exitCode = 1;
  });
