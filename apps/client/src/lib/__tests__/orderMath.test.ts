/**
 * Order estimates (BP-2) — the same worked numbers the server engine is tested with
 * (apps/server/src/trading/engine/__tests__/fees.test.ts, spot.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { feeRateLine, feeRatesLabel, floorToStep, maxQty, orderPreview } from '../orderMath';

describe('orderPreview()', () => {
  it('USDT Perpetual, 10×, 0.1 BTC at 50,000: IM 500, fees 2.75 + 2.75, cost 505.50', () => {
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
    expect(p.closeFee).toBeCloseTo(2.75);
    expect(p.cost).toBeCloseTo(505.5);
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

  it('USDT Perpetual keeps room for both fee estimates', () => {
    // 10,000 / (50,000 × (1 + 0.0011)) = 0.19978 → floored to the step
    expect(maxQty({ ...base, category: 'linear', side: 'buy' })).toBe(0.199);
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
