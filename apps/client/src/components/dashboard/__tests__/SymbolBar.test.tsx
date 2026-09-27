import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SymbolBar } from '../SymbolBar';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';

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
}));

vi.mock('@number-flow/react', () => ({
  default: ({ value, className }: { value: number; className?: string }) => (
    <span className={className}>{value}</span>
  ),
}));

vi.mock('../ChartLayoutPicker', () => ({
  ChartLayoutPicker: () => <div data-testid="chart-layout-picker" />,
}));

vi.mock('@/components/ui/CryptoIcon', () => ({
  SymbolPair: ({ base }: { base: string }) => <span data-testid="symbol-pair">{base}</span>,
}));

function setupStores() {
  useLayoutStore.setState({ activePane: 0 });
  paneStores[0].setState({
    latestPrice: 50_000,
    priceChange: 100,
    bars: [
      {
        timestamp: 1,
        open: 49_800,
        high: 50_100,
        low: 49_700,
        close: 49_900,
        volume: 10,
        quoteAssetVolume: 499_000,
      },
      {
        timestamp: 2,
        open: 49_900,
        high: 50_200,
        low: 49_850,
        close: 50_000,
        volume: 12,
        quoteAssetVolume: 600_000,
      },
    ],
    isConnected: true,
  });
}

describe('SymbolBar trade button', () => {
  beforeEach(() => {
    setupStores();
  });

  afterEach(() => {
    cleanup();
  });

  it('is disabled when the trading panel is already open', () => {
    const onToggleTrading = vi.fn();
    render(
      <SymbolBar
        tradingPanelOpen
        onToggleTrading={onToggleTrading}
        leftToolbarOpen
        onToggleLeftToolbar={vi.fn()}
      />
    );

    const tradeButton = screen.getByRole('button', { name: /trade/i }) as HTMLButtonElement;
    expect(tradeButton.disabled).toBe(true);
    expect(tradeButton.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(tradeButton);
    expect(onToggleTrading).not.toHaveBeenCalled();
  });

  it('calls onToggleTrading when the trading panel is closed', () => {
    const onToggleTrading = vi.fn();
    render(
      <SymbolBar
        tradingPanelOpen={false}
        onToggleTrading={onToggleTrading}
        leftToolbarOpen={false}
        onToggleLeftToolbar={vi.fn()}
      />
    );

    const tradeButton = screen.getByRole('button', { name: /trade/i }) as HTMLButtonElement;
    expect(tradeButton.disabled).toBe(false);

    fireEvent.click(tradeButton);
    expect(onToggleTrading).toHaveBeenCalledTimes(1);
  });
});

describe('SymbolBar — USDT Perpetual stats (BP-4)', () => {
  const bar = () => (
    <SymbolBar
      tradingPanelOpen
      onToggleTrading={vi.fn()}
      leftToolbarOpen
      onToggleLeftToolbar={vi.fn()}
    />
  );

  beforeEach(() => {
    setupStores();
    vi.useFakeTimers({ now: 1_000_000 });
    paneStores[0].setState({
      markPrice: 84_331.83,
      indexPrice: 84_320.1,
      fundingRate: 0.00002184,
      nextFundingTime: 1_000_000 + 3_723_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('shows mark, index and the funding rate with a live countdown on perps', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'linear' } : p)),
    }));
    render(bar());
    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('Index')).toBeTruthy();
    const funding = screen.getByTestId('funding-stat');
    expect(funding.textContent).toContain('0.0022% / 01:02:03');
    act(() => vi.advanceTimersByTime(3_000));
    expect(funding.textContent).toContain('01:02:00');
  });

  it('shows none of them on Spot', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot' } : p)),
    }));
    render(bar());
    expect(screen.queryByTestId('funding-stat')).toBeNull();
    expect(screen.queryByText('Mark')).toBeNull();
  });
});
