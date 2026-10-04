/**
 * "Create limit order…" from a Long / Short Position drawing: the limit request it puts in the
 * prefill store fills the order form (T2 · RTL) — docs/TRADING_TEST_PLAN.md 10.7.23.
 * The instrument rules load here (as in TradingPanel.instrumentRules.test), so the form rounds to
 * the step and tick as it does in the app.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instrument, MarketCategory } from '@crypto-dashboard/sdk';
import { TradingPanel } from '../TradingPanel';
import { useLayoutStore } from '@/store/layoutStore';
import { useOrderPrefillStore, type OrderPrefill } from '@/store/orderPrefillStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { useAuthStore } from '@/store/authStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';
import { getByGuide } from '@/test/guide';
import type { GuideAnchor } from '@/lib/guideAnchors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** BTCUSDT rules as Bybit publishes them (the server's /api/market/instruments shape). */
const RULES = vi.hoisted(
  (): Record<'spot' | 'linear', Instrument> => ({
    linear: {
      symbol: 'BTCUSDT',
      category: 'linear',
      tickSize: 0.1,
      qtyStep: 0.001,
      minOrderQty: 0.001,
      minNotional: 5,
      maxLeverage: 100,
      fundingIntervalMin: 480,
    },
    spot: {
      symbol: 'BTCUSDT',
      category: 'spot',
      tickSize: 0.01,
      qtyStep: 0.000001,
      minOrderQty: 0.000001,
      minNotional: 5,
      maxLeverage: null,
      fundingIntervalMin: null,
    },
  })
);

const getInstruments = vi.hoisted(() =>
  vi.fn(async (category: MarketCategory = 'spot') => ({
    category,
    instruments: [RULES[category as 'spot' | 'linear']],
  }))
);

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@crypto-dashboard/sdk')>();
  return {
    ...sdk,
    paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
    marketApi: { ...sdk.marketApi, getInstruments },
  };
});

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            { children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>,
            ref: React.Ref<HTMLElement>
          ) => React.createElement(tag, { ...props, ref }, children)
        ),
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useAnimation: () => ({ start: vi.fn() }),
}));

vi.mock('@/hooks/TradingSoundContext', () => ({
  useTradingSoundCtx: () => ({
    playOrderPlaced: vi.fn(),
    playOrderQueued: vi.fn(),
    playOrderFilled: vi.fn(),
    playProfit: vi.fn(),
    playLoss: vi.fn(),
    volume: 0.5,
    muted: false,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
  }),
  TradingSoundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A short position's order: sell 0.01 at 51,000, TP 49,000, SL 52,000 */
const SHORT: OrderPrefill = {
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'sell',
  qty: 0.01,
  type: 'limit',
  price: 51000,
  takeProfit: 49000,
  stopLoss: 52000,
};

const value = (container: HTMLElement, anchor: GuideAnchor) =>
  (getByGuide(container, anchor) as HTMLInputElement).value;

function expectFilled(container: HTMLElement) {
  expect(getByGuide(container, 'trade.type.limit').getAttribute('aria-selected')).toBe('true');
  expect(value(container, 'trade.price')).toBe('51000');
  expect(value(container, 'trade.tp.price')).toBe('49000');
  expect(value(container, 'trade.sl.price')).toBe('52000');
  expect(value(container, 'trade.amount')).toBe('0.01');
  expect(getByGuide(container, 'trade.amount-unit', 'coin').getAttribute('aria-pressed')).toBe(
    'true'
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  usePaperStore.getState().clear();
  usePaperStore.getState().hydrate(emptyState());
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  localStorage.clear();
  useOrderPrefillStore.getState().clear();
  paneStores[0].setState({ latestPrice: 50_000, isConnected: true, bid: 49_990, ask: 50_010 });
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'BTCUSDT', category: 'linear' } : p)),
  }));
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TradingPanel — a limit order from a position drawing', () => {
  it('[10.7.23] should open on Limit with the side, price, TP, SL and qty when mounted', async () => {
    useOrderPrefillStore.getState().prefill(SHORT);
    const onSideChange = vi.fn();
    const onTabChange = vi.fn();
    const { container } = render(
      <TradingPanel onClose={vi.fn()} onSideChange={onSideChange} onTabChange={onTabChange} />
    );
    expectFilled(container);
    expect(onSideChange).toHaveBeenCalledWith('sell');
    expect(onTabChange).toHaveBeenCalledWith('limit');
    expect(useOrderPrefillStore.getState().request).toBeNull();
    await waitFor(() => expect(getInstruments).toHaveBeenCalled());

    // Nothing is placed until the user submits; then the order carries the drawing's levels
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
    fireEvent.click(getByGuide(container, 'trade.submit'));
    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({
      side: 'sell',
      type: 'limit',
      qty: '0.01',
      triggerPrice: '51000',
      takeProfit: '49000',
      stopLoss: '52000',
    });
  });

  it('[10.7.23] should take a request live, after the side and tab change, without clearing it', () => {
    const { container } = render(<TradingPanel onClose={vi.fn()} initialTab="market" />);
    fireEvent.change(getByGuide(container, 'trade.amount'), { target: { value: '100' } });
    act(() => useOrderPrefillStore.getState().prefill(SHORT));
    expectFilled(container);
  });

  it('[10.7.23] should leave a request made for another pane to that pane’s form', () => {
    const { container } = render(<TradingPanel onClose={vi.fn()} />);
    act(() => {
      useLayoutStore.getState().setActivePane(1);
      useOrderPrefillStore.getState().prefill(SHORT);
    });
    expect(useOrderPrefillStore.getState().request).toEqual(SHORT);
    // Still this pane's untouched Market form
    expect(getByGuide(container, 'trade.type.limit').getAttribute('aria-selected')).toBe('false');
  });
});
