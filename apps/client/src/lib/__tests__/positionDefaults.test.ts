/**
 * A new Long / Short Position's risk inputs from the account (lib/positionDefaults.ts).
 * TRADING_TEST_PLAN 10.7.26.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { positionDefaultStyle } from '@/lib/positionDefaults';
import { useLayoutStore } from '@/store/layoutStore';
import { usePaperStore } from '@/store/paperStore';

function activePane(category: 'spot' | 'linear', symbol = 'BTCUSDT') {
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol, category } : p)),
  }));
}

beforeEach(() => {
  usePaperStore.getState().clear();
  activePane('linear');
});

afterEach(() => {
  usePaperStore.getState().clear();
});

describe('positionDefaultStyle', () => {
  it('[10.7.26] should size a new position on the paper balance and the symbol’s leverage', () => {
    usePaperStore.setState({ balance: 5000.555, leverage: 10, symbolLeverage: { BTCUSDT: 5 } });
    expect(positionDefaultStyle('long-position')).toEqual({
      accountSize: 5000.55,
      leverage: 5,
      qtyPrecision: '3', // the rules not loaded: 3 decimals
    });
    activePane('linear', 'ETHUSDT');
    expect(positionDefaultStyle('short-position')).toMatchObject({ leverage: 10 });
  });

  it('[10.7.26] should use 1× on Spot and keep the factory account with no balance', () => {
    activePane('spot');
    usePaperStore.setState({ balance: 0 });
    const style = positionDefaultStyle('long-position');
    expect(style).toMatchObject({ leverage: 1 });
    expect(style).not.toHaveProperty('accountSize');
  });

  it('[10.7.26] should leave every other tool to its factory style', () => {
    expect(positionDefaultStyle('trend-line')).toBeUndefined();
  });
});
