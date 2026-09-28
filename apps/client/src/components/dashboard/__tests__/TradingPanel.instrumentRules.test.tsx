/**
 * Bybit size rules in the order form, with the instrument rules loaded (T2 · RTL) —
 * docs/TRADING_TEST_PLAN.md 14.4 (SC-14.4-1, the T2 half).
 *
 * Separate from TradingPanel.test.tsx because useInstrument caches the rules per market for the
 * page load: there they never load (the form sends what it is given and the server refuses, see
 * "Section 14.4 — Bybit size rules refused by the server"); here they always do, so the form
 * rounds to the step and tick and stops an order under Bybit's minimums before sending it.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { Instrument, MarketCategory } from '@crypto-dashboard/sdk';
import { TradingPanel } from '../TradingPanel';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { useAuthStore } from '@/store/authStore';
import { emptyState, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';
import { getByGuide, queryByGuide } from '@/test/guide';

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

function useMarket(category: MarketCategory) {
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'BTCUSDT', category } : p)),
  }));
}

/** Render the form and wait until the rules for its market have loaded. */
async function renderWithRules(props: Partial<React.ComponentProps<typeof TradingPanel>> = {}) {
  const view = render(<TradingPanel onClose={vi.fn()} {...props} />);
  // The limit tab's default price is rounded to the tick once the rules are in
  fireEvent.click(getByGuide(view.container, 'trade.type.limit'));
  const tickDecimals =
    useLayoutStore.getState().panes[0].category === 'linear' ? '49990.0' : '49990.00';
  await waitFor(() =>
    expect((getByGuide(view.container, 'trade.price') as HTMLInputElement).value).toBe(tickDecimals)
  );
  if (props.initialTab !== 'limit')
    fireEvent.click(getByGuide(view.container, 'trade.type.market'));
  return view;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  usePaperStore.getState().clear();
  usePaperStore.getState().hydrate(emptyState());
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  localStorage.clear();
  paneStores[0].setState({ latestPrice: 50_000, isConnected: true, bid: 49_990, ask: 50_010 });
  useMarket('linear');
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Section 14.4 — Bybit size rules in the form (rules loaded)', () => {
  it("should default a limit price to the market's tick (BTCUSDT perp tick 0.1, spot 0.01)", async () => {
    const { container } = await renderWithRules({ initialTab: 'limit' });
    expect((getByGuide(container, 'trade.price') as HTMLInputElement).value).toBe('49990.0');
    cleanup();

    useMarket('spot');
    const spot = await renderWithRules({ initialTab: 'limit' });
    expect((getByGuide(spot.container, 'trade.price') as HTMLInputElement).value).toBe('49990.00');
    expect(getInstruments).toHaveBeenCalledWith('linear');
    expect(getInstruments).toHaveBeenCalledWith('spot');
  });

  it('should stop a perp order under the minimum quantity before sending it (14.4.1)', async () => {
    const { container } = await renderWithRules();
    fireEvent.click(getByGuide(container, 'trade.amount-unit', 'coin'));
    fireEvent.change(getByGuide(container, 'trade.amount'), { target: { value: '0.0001' } });
    fireEvent.click(getByGuide(container, 'trade.submit'));

    // 0.0001 rounds down to 0 on the 0.001 step: nothing left to trade
    expect(getByGuide(container, 'trade.error').textContent).toBe(
      'Amount too small for minimum lot size'
    );
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
    expect((getByGuide(container, 'trade.amount') as HTMLInputElement).value).toBe('0.0001');
  });

  it('should round a quantity down to the step before sending it (14.4.4)', async () => {
    const { container } = await renderWithRules();
    fireEvent.click(getByGuide(container, 'trade.amount-unit', 'coin'));
    fireEvent.change(getByGuide(container, 'trade.amount'), { target: { value: '0.1239' } });
    fireEvent.click(getByGuide(container, 'trade.submit'));

    await waitFor(() => expect(fakePaperApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeOrder.mock.calls[0][0]).toMatchObject({ qty: '0.123' });
    expect(queryByGuide(container, 'trade.error')).toBeNull();
  });

  it('should stop a spot order worth under 5 USDT before sending it (14.4.3)', async () => {
    useMarket('spot');
    const { container } = await renderWithRules();
    fireEvent.change(getByGuide(container, 'trade.amount'), { target: { value: '4' } });
    fireEvent.click(getByGuide(container, 'trade.submit'));

    expect(getByGuide(container, 'trade.error').textContent).toBe('Minimum order value is 5 USDT');
    expect(fakePaperApi.placeOrder).not.toHaveBeenCalled();
    expect((getByGuide(container, 'trade.amount') as HTMLInputElement).value).toBe('4');
  });
});
