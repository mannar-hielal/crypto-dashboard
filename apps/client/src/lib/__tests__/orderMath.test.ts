/**
 * Order estimates (BP-2) — the same worked numbers the server engine is tested with
 * (apps/server/src/trading/engine/__tests__/fees.test.ts, spot.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { feeRateLine, feeRatesLabel, floorToStep, maxQty, orderPreview } from '../orderMath';

describe('orderPreview()', () => {
  it('USDT Perpetual, 10×, 0.1 BTC at 50,000: IM 500, fees 2.75 + 2.475, cost 505.225', () => {
    const p = orderPreview({
      category: 'linear',
      side: 'buy',
      qty: 0.1,
      price: 50_000,
      leverage: 10,
      baseAsset: 'BTC',
    });
    expect(p.value).toBeCloseTo(5_000);
    expect(p.margin).toBeCloseTo(500);
    expect(p.openFee).toBeCloseTo(2.75);
    // Bybit's fee to close is priced at the bankruptcy price: 5,000 × (1 − 1/10) × 0.055%
    expect(p.closeFee).toBeCloseTo(2.475);
    expect(p.cost).toBeCloseTo(505.225);
  });

  it('estimates the liquidation price of the position the order leaves (BP-3)', () => {
    const base = {
      category: 'linear' as const,
      qty: 0.1,
      price: 50_000,
      leverage: 10,
      baseAsset: 'BTC',
      symbol: 'BTCUSDT',
    };
    // Same numbers as the server engine's liquidation.test.ts
    expect(orderPreview({ ...base, side: 'buy' }).liqPrice).toBe(45_149); // up to the 0.1 tick
    expect(orderPreview({ ...base, side: 'sell' }).liqPrice).toBe(54_819); // down to the tick
    // Adding to a long at the same price and leverage leaves the same liquidation price
    const existing = {
      side: 'long' as const,
      quantity: 0.1,
      entryPrice: 50_000,
      entryUsdtAmount: 500,
      closeFeeReserve: 2.475,
      extraMargin: 0,
    };
    expect(orderPreview({ ...base, side: 'buy', existing }).liqPrice).toBe(45_149);
    // Selling part of the long only reduces it: no new position to estimate
    expect(orderPreview({ ...base, side: 'sell', qty: 0.05, existing }).liqPrice).toBeUndefined();
    // A 1× long can't be liquidated
    expect(orderPreview({ ...base, side: 'buy', leverage: 1 }).liqPrice).toBe(0);
  });

  it('Spot buy: pays the value; the 0.1% fee comes out of the coins received', () => {
    const p = orderPreview({
      category: 'spot',
      side: 'buy',
      qty: 0.1,
      price: 50_000,
      leverage: 1,
      baseAsset: 'BTC',
    });
    expect(p).toMatchObject({ feeAsset: 'BTC' });
    expect(p.cost).toBeCloseTo(5_000);
    expect(p.fee).toBeCloseTo(0.0001);
    expect(p.received).toBeCloseTo(0.0999);
  });

  it('Spot sell: takes no USDT; receives the value less 0.1% in USDT', () => {
    const p = orderPreview({
      category: 'spot',
      side: 'sell',
      qty: 0.0999,
      price: 51_000,
      leverage: 1,
      baseAsset: 'BTC',
    });
    expect(p.cost).toBe(0);
    expect(p.fee).toBeCloseTo(5.0949);
    expect(p.received).toBeCloseTo(5_089.8051);
  });
});

describe('maxQty()', () => {
  const base = { price: 50_000, leverage: 1, usdtAvailable: 10_000, coinFree: 0.3, step: 0.001 };

  it('USDT Perpetual keeps room for the open fee and the fee to close', () => {
    // 1× long: the fee to close at bankruptcy (price 0) is 0 → 10,000 / (50,000 × 1.00055)
    expect(maxQty({ ...base, category: 'linear', side: 'buy' })).toBe(0.199);
    // 1× short: bankruptcy at 2 × entry → 10,000 / (50,000 × (1 + 0.00055 + 0.0011)) = 0.19967
    expect(maxQty({ ...base, category: 'linear', side: 'sell' })).toBe(0.199);
  });

  it('Spot buy uses the USDT balance; spot sell the free coins only', () => {
    expect(maxQty({ ...base, category: 'spot', side: 'buy' })).toBe(0.2);
    expect(maxQty({ ...base, category: 'spot', side: 'sell' })).toBe(0.3);
  });

  it('is 0 without a price', () => {
    expect(maxQty({ ...base, price: 0, category: 'spot', side: 'buy' })).toBe(0);
  });
});

describe('floorToStep()', () => {
  it('truncates to the step, without float drift', () => {
    expect(floorToStep(0.1239, 0.001)).toBe(0.123);
    expect(floorToStep(0.3, 0.1)).toBe(0.3);
    expect(floorToStep(7.9, 1)).toBe(7);
    expect(floorToStep(0.123456789, 0)).toBe(0.123456789);
  });
});

describe('fee labels', () => {
  it('shows the rates of each market', () => {
    expect(feeRatesLabel('linear')).toBe('Fees: taker 0.055% · maker 0.02%');
    expect(feeRatesLabel('spot')).toBe('Fee: 0.1%');
  });

  it('shows a fill rate with its liquidity; an old row just its 0.07%', () => {
    expect(feeRateLine({ feeRate: 0.00055, isMaker: false })).toBe('0.055% taker');
    expect(feeRateLine({ feeRate: 0.0002, isMaker: true })).toBe('0.02% maker');
    expect(feeRateLine({ feeRate: 0.0007 })).toBe('0.07%');
    expect(feeRateLine({})).toBeNull();
  });
});
