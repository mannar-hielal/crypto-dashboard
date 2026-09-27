/**
 * BP-5 B: trigger sources and reduce-only / close-on-trigger survive a DB round trip, and the
 * defaults (LastPrice, false) stay out of the engine and wire shapes.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  historyOrderData,
  historyOrderFromRow,
  pendingData,
  pendingDTO,
  pendingFromRow,
  positionDTO,
  positionData,
  positionFromRow,
  type OrderRow,
  type PositionRow,
} from '../mappers.js';
import { fallbackRiskTiers } from '../bybitSpec.js';
import type { HistoricalOrder, PendingOrder, Position } from '../engine/index.js';

const D = (v: number | string) => new Decimal(v);

const position: Position = {
  id: 'p1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'long',
  quantity: D('0.1'),
  entryPrice: D(50_000),
  entryUsdtAmount: D(500),
  leverage: 10,
  entryFee: D('2.75'),
  closeFeeReserve: D('2.475'),
  openedAt: 1_800_000_000_000,
  takeProfit: D(55_000),
  stopLoss: D(48_000),
  slTriggerBy: 'MarkPrice',
};

const order: PendingOrder = {
  id: 'o1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'sell',
  type: 'stop',
  usdtAmount: D(0),
  reserved: D(0),
  triggerPrice: D(48_000),
  qty: D('0.1'),
  leverage: 10,
  placedAt: 1_800_000_000_000,
  triggerBy: 'IndexPrice',
  reduceOnly: true,
  closeOnTrigger: true,
};

/** A DB row as Prisma returns it: the written data plus the columns it fills in. */
function orderRow(data: ReturnType<typeof pendingData> | ReturnType<typeof historyOrderData>) {
  const now = new Date(1_800_000_000_000);
  return {
    id: 'db-1',
    refId: 'o1',
    averageFilledPrice: null,
    commission: D(0),
    feeRate: null,
    feeAsset: null,
    isMaker: null,
    ocoGroup: null,
    createType: null,
    rejectionReason: null,
    filledAt: null,
    cancelledAt: null,
    updatedAt: now,
    takeProfit: null,
    stopLoss: null,
    margin: D(0),
    reserved: D(0),
    leverage: 1,
    tpTriggerBy: 'LastPrice',
    slTriggerBy: 'LastPrice',
    ...data,
  } as OrderRow;
}

describe('mappers — BP-5 B order flags', () => {
  it('a position keeps a non-default leg source; LastPrice is the stored default and never surfaces', () => {
    const data = positionData(position);
    expect(data).toMatchObject({ tpTriggerBy: 'LastPrice', slTriggerBy: 'MarkPrice' });
    const row: PositionRow = { ...data, id: 'db-p1', refId: 'p1', cumFunding: D(0) };
    const back = positionFromRow(row);
    expect(back.slTriggerBy).toBe('MarkPrice');
    expect(back).not.toHaveProperty('tpTriggerBy');
    const dto = positionDTO(back, fallbackRiskTiers('BTCUSDT'));
    expect(dto.slTriggerBy).toBe('MarkPrice');
    expect(dto).not.toHaveProperty('tpTriggerBy');
  });

  it('a pending order keeps its trigger source and reduce-only / close-on-trigger flags', () => {
    const back = pendingFromRow(orderRow(pendingData(order)));
    expect(back).toMatchObject({ triggerBy: 'IndexPrice', reduceOnly: true, closeOnTrigger: true });
    expect(back).not.toHaveProperty('tpTriggerBy');
    expect(pendingDTO(back)).toMatchObject({
      triggerBy: 'IndexPrice',
      reduceOnly: true,
      closeOnTrigger: true,
    });
    // A plain order carries none of them
    const plain = pendingFromRow(
      orderRow(
        pendingData({
          ...order,
          triggerBy: undefined,
          reduceOnly: undefined,
          closeOnTrigger: undefined,
        })
      )
    );
    expect(plain).not.toHaveProperty('triggerBy');
    expect(plain).not.toHaveProperty('reduceOnly');
    expect(plain).not.toHaveProperty('closeOnTrigger');
  });

  it('an order-history row keeps the reduce-only flag', () => {
    const cancelled: HistoricalOrder = {
      id: 'o-cancel-ro-o1',
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'sell',
      type: 'stop',
      qty: D('0.1'),
      stopPrice: D(48_000),
      status: 'cancelled',
      commission: D(0),
      placingTime: 1_800_000_000_000,
      closingTime: 1_800_000_060_000,
      reduceOnly: true,
    };
    const dto = historyOrderFromRow(orderRow(historyOrderData(cancelled)));
    expect(dto).toMatchObject({ reduceOnly: true, status: 'cancelled' });
    expect(dto).not.toHaveProperty('closeOnTrigger');
    expect(dto).not.toHaveProperty('triggerBy');
  });
});
