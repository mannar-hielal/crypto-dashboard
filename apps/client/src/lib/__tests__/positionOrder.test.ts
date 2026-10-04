/**
 * "Create limit order…": the order a Long / Short Position drawing describes (lib/positionOrder.ts).
 * TRADING_TEST_PLAN 10.7.23.
 */

import { describe, expect, it } from 'vitest';
import type { Drawing, DrawingStyle } from 'lightweight-charts-drawing';
import { positionOrderFromDrawing } from '@/lib/positionOrder';

const BTC = { tickSize: 0.1, qtyStep: 0.001 };

function position(
  kind: string,
  entry: number,
  style: Partial<DrawingStyle> = { stopLevel: 30, profitLevel: 60 },
  closePrice = entry
): Drawing {
  return {
    id: 'p',
    kind,
    points: [
      { time: 1000, price: entry },
      { time: 1100, price: closePrice },
    ],
    style,
  } as never;
}

describe('positionOrderFromDrawing', () => {
  it('[10.7.23] should read a long position as a buy limit with its target and stop', () => {
    // TV defaults: account 1000, risk 25% → 250 at risk ÷ 30 stop distance = 8.333… coins
    expect(positionOrderFromDrawing(position('long-position', 900), BTC)).toEqual({
      side: 'buy',
      price: 900,
      takeProfit: 960,
      stopLoss: 870,
      qty: 8.333,
    });
  });

  it('[10.7.23] should read a short position as a sell limit, target below and stop above', () => {
    expect(positionOrderFromDrawing(position('short-position', 900), BTC)).toEqual({
      side: 'sell',
      price: 900,
      takeProfit: 840,
      stopLoss: 930,
      qty: 8.333,
    });
  });

  it('[10.7.23] should put the prices on the tick and floor the qty to the step', () => {
    const order = positionOrderFromDrawing(
      position('long-position', 900.04, { stopLevel: 30, profitLevel: 60.03 }),
      { tickSize: 0.1, qtyStep: 1 }
    );
    expect(order).toMatchObject({ price: 900, takeProfit: 960.1, stopLoss: 870, qty: 8 });
  });

  it('[10.7.23] should use the qty the tool’s own risk inputs give', () => {
    const order = positionOrderFromDrawing(
      position('long-position', 900, {
        stopLevel: 30,
        profitLevel: 60,
        accountSize: 3000,
        riskPercent: 1,
      }),
      BTC
    );
    expect(order?.qty).toBe(1); // 30 at risk ÷ 30
  });

  it('[10.7.23] should derive the levels of a drawing saved before the level model', () => {
    const order = positionOrderFromDrawing(position('long-position', 900, {}, 920), BTC);
    expect(order).toMatchObject({ takeProfit: 920, stopLoss: 880 });
  });

  it('[10.7.23] should give no order for other drawings or unusable prices', () => {
    expect(positionOrderFromDrawing(position('horizontal-line', 900), BTC)).toBeNull();
    expect(positionOrderFromDrawing(position('long-position', 0), BTC)).toBeNull();
    // A stop below zero
    expect(positionOrderFromDrawing(position('long-position', 20), BTC)).toBeNull();
    // A qty under one step
    expect(
      positionOrderFromDrawing(
        position('long-position', 900, { stopLevel: 30, profitLevel: 60, riskPercent: 0 }),
        BTC
      )
    ).toBeNull();
  });
});
