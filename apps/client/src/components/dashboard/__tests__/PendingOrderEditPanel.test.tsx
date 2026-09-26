/**
 * PendingOrderEditPanel (BP-2): the funds check and its message follow the order's market.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PendingOrderEditPanel } from '../PendingOrderEditPanel';
import { usePaperStore, type PendingOrder } from '@/store/paperStore';

const spotSell: PendingOrder = {
  id: 's1',
  category: 'spot',
  symbol: 'BTCUSDT',
  side: 'sell',
  type: 'limit',
  usdtAmount: 2_600,
  reserved: 0.05, // coins locked
  triggerPrice: 52_000,
  qty: 0.05,
  leverage: 1,
  placedAt: 1,
};

const perpBuy: PendingOrder = {
  id: 'p1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  usdtAmount: 490,
  reserved: 495.39,
  triggerPrice: 49_000,
  qty: 0.1,
  leverage: 10,
  placedAt: 1,
};

beforeEach(() => usePaperStore.getState().clear());
afterEach(cleanup);

describe('PendingOrderEditPanel', () => {
  it('a spot sell is limited by coins, and says so in coins (PR #136)', () => {
    usePaperStore.setState({
      balance: 10_000,
      pendingOrders: [spotSell],
      spotBalances: [{ coin: 'BTC', free: 0.01, locked: 0.05, avgCost: 40_000 }],
    });
    render(<PendingOrderEditPanel orderId="s1" onClose={() => undefined} />);
    fireEvent.change(screen.getByDisplayValue('0.050000'), { target: { value: '1' } });
    const alert = screen.getByText(/Not enough BTC/);
    expect(alert.textContent).toContain('Required: 1');
    expect(alert.textContent).toContain('Available: 0.06');
    expect(alert.textContent).not.toContain('$');
  });

  it('a perpetual buy is limited by USDT: IM + both taker fee estimates (orderPreview)', () => {
    // 1 BTC at 49,000, 10×: 4,900 + 2 × 26.95 = 4,953.90; available 4,000 + the 495.39 it holds
    usePaperStore.setState({
      balance: 4_000,
      pendingOrders: [perpBuy],
      symbolLeverage: { BTCUSDT: 10 },
    });
    render(<PendingOrderEditPanel orderId="p1" onClose={() => undefined} />);
    fireEvent.change(screen.getByDisplayValue('0.100000'), { target: { value: '1' } });
    expect(screen.getByText(/Not enough funds/).textContent).toBe(
      'Not enough funds. Required: $4953.90, Available: $4495.39'
    );
  });
});
