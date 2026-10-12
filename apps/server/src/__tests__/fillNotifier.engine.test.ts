/**
 * The fill e-mail against the engine's REAL deltas. The first version of FillNotifier matched a
 * fill by the pending order's bare id while the engine writes the history row as `o-<id>`, so it
 * never sent a single e-mail on production — and its unit tests, which hand-made events with the
 * same id on both sides, could not see it. Everything here is produced by the engine.
 */

import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  applyDelta,
  cancelPending,
  executeTrigger,
  placePending,
  placeSpotLimit,
  placeSpotMarket,
  type AccountState,
  type InstrumentRules,
} from '../trading/engine/index.js';
import { deltaDTO } from '../trading/mappers.js';
import { FillNotifier, filledRestingOrders } from '../services/FillNotifier.js';
import type { PaperEvent } from '../trading/PaperEventBus.js';

const D = (v: number | string) => new Decimal(v);
let n = 0;
const ctx = () => ({ now: 1_800_000_000_000 + ++n, newId: () => `id${++n}` });
const quote = (bid: number, ask: number) => ({
  last: D((bid + ask) / 2),
  bid: D(bid),
  ask: D(ask),
});

const SPOT_RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.000001'),
  minOrderQty: D('0.000001'),
  minNotional: D(5),
};
const PERP_RULES: InstrumentRules = {
  tickSize: D('0.1'),
  qtyStep: D('0.001'),
  minOrderQty: D('0.001'),
  minNotional: D(5),
};

const fresh = (): AccountState => ({
  balance: D(10_000),
  realizedPnl: D(0),
  leverage: 1,
  symbolLeverage: {},
  symbolFundingAt: {},
  spot: [],
  positions: [],
  pendingOrders: [],
});

/** The event the bus would carry for an engine action's delta */
const asEvent = (delta: Parameters<typeof deltaDTO>[0], state: AccountState): PaperEvent => ({
  userId: 'u1',
  delta: deltaDTO(delta, 1),
  state,
});

describe('FillNotifier on the engine’s real deltas', () => {
  it('should see a resting spot limit buy that fills', () => {
    const placed = placeSpotLimit(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      SPOT_RULES,
      ctx()
    );
    const resting = applyDelta(fresh(), placed.delta);
    const orderId = resting.pendingOrders[0].id;

    const fill = executeTrigger(
      resting,
      { kind: 'fill', orderId, price: D(48_950) },
      quote(48_940, 48_960),
      ctx()
    );
    const event = asEvent(fill.delta, resting);

    // the shape the e-mail depends on: the pending id leaves, the history row is `o-<id>`
    expect(event.delta.pendingRemove).toContain(orderId);
    expect(event.delta.orders[0].id).toBe(`o-${orderId}`);

    const found = filledRestingOrders(event);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'limit',
      category: 'spot',
    });
  });

  it('should see a resting USDT Perpetual limit order that fills', () => {
    const placed = placePending(
      fresh(),
      {
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        triggerPrice: D(49_000),
        size: { qty: D('0.01') },
      },
      quote(49_990, 50_000),
      PERP_RULES,
      ctx()
    );
    expect(placed.invalid).toBeUndefined();
    const resting = applyDelta(fresh(), placed.delta);
    const orderId = resting.pendingOrders[0].id;

    const fill = executeTrigger(
      resting,
      { kind: 'fill', orderId, price: D(49_000) },
      quote(48_990, 49_000),
      ctx()
    );
    const found = filledRestingOrders(asEvent(fill.delta, resting));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ symbol: 'BTCUSDT', category: 'linear' });
  });

  it('should not see a market buy, nor the cancel of a resting order', () => {
    const market = placeSpotMarket(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      SPOT_RULES,
      ctx()
    );
    expect(filledRestingOrders(asEvent(market.delta, fresh()))).toHaveLength(0);

    const placed = placeSpotLimit(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      SPOT_RULES,
      ctx()
    );
    const resting = applyDelta(fresh(), placed.delta);
    const cancelled = cancelPending(resting, resting.pendingOrders[0].id, ctx());
    expect(filledRestingOrders(asEvent(cancelled.delta, resting))).toHaveLength(0);
  });

  it('should send the e-mail for the engine’s fill, end to end through the notifier', async () => {
    const placed = placeSpotLimit(
      fresh(),
      { symbol: 'BTCUSDT', side: 'buy', triggerPrice: D(49_000), size: { qty: D('0.1') } },
      quote(49_990, 50_000),
      SPOT_RULES,
      ctx()
    );
    const resting = applyDelta(fresh(), placed.delta);
    const fill = executeTrigger(
      resting,
      { kind: 'fill', orderId: resting.pendingOrders[0].id, price: D(48_950) },
      quote(48_940, 48_960),
      ctx()
    );

    const send = vi.fn().mockResolvedValue(undefined);
    const notifier = new FillNotifier(
      {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            email: 'trader@example.test',
            username: 'trader',
            fillEmailOptIn: true,
            emailVerifiedAt: new Date(),
            deletionRequestedAt: null,
          }),
        },
      } as never,
      { subscribeAll: vi.fn(), hasListeners: vi.fn().mockReturnValue(false) } as never,
      { sendOrderFilledEmail: send } as never
    );

    expect(await notifier.handle(asEvent(fill.delta, resting))).toBe(1);
    expect(send.mock.calls[0][2]).toMatchObject({ symbol: 'BTCUSDT', side: 'Buy', type: 'limit' });
  });
});
