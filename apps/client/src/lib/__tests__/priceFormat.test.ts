/**
 * The candles' price format per market and symbol (lib/priceFormat.ts). TRADING_TEST_PLAN 10.3.4.
 */

import { describe, expect, it } from 'vitest';
import { priceTickSize } from '@crypto-dashboard/sdk';
import { candlePriceFormat, stepDecimals } from '@/lib/priceFormat';

describe('candlePriceFormat', () => {
  it('[10.3.4] should step and round prices on the symbol’s tick in its market', () => {
    expect(candlePriceFormat('linear', 'BTCUSDT')).toEqual({
      type: 'price',
      precision: 1,
      minMove: 0.1,
    });
    // Each market's own tick (the SDK's snapshot)
    expect(candlePriceFormat('spot', 'ETHUSDT')).toMatchObject({
      minMove: priceTickSize('spot', 'ETHUSDT'),
    });
    expect(candlePriceFormat('linear', 'DOGEUSDT')).toMatchObject({ precision: 5 });
  });

  it('[10.3.4] should leave a symbol with no known tick to the library', () => {
    expect(candlePriceFormat('linear', 'NOPEUSDT')).toBeNull();
  });

  it('[10.3.4] should read a step’s decimals', () => {
    expect([0.001, 0.01, 0.1, 1, 10].map((s) => stepDecimals(s))).toEqual([3, 2, 1, 0, 0]);
    expect(stepDecimals(0)).toBe(3);
  });
});
