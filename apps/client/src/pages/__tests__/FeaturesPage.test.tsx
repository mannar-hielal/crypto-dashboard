import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// The page's claims must match the code: INTERVALS (lib/markets.ts), LAYOUT_ORDER
// (ChartLayoutPicker.tsx), ALLOWED_SYMBOLS (server constants.ts), PaperOrderStatus (SDK).

vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/CtaSection', () => ({ CtaSection: () => null }));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          ({ children, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) => {
            const domProps = { ...props };
            for (const k of ['variants', 'initial', 'animate', 'whileInView', 'viewport']) {
              delete domProps[k];
            }
            return React.createElement(tag, { ...domProps, ref }, children as React.ReactNode);
          }
        ),
    }
  ),
}));

import { FeaturesPage } from '@/pages/FeaturesPage';

describe('FeaturesPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('should list the 10 chart intervals when rendered', () => {
    render(React.createElement(FeaturesPage));
    expect(screen.getByText('10 Timeframes')).not.toBeNull();
    expect(screen.getByText(/1m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M/)).not.toBeNull();
  });

  it('should name the five real layout modes when rendered', () => {
    render(React.createElement(FeaturesPage));
    expect(screen.getByText(/single, 2 columns, 2 rows, 3 columns, and a 2×2 grid/)).not.toBeNull();
    expect(screen.queryByText(/1\+3/)).toBeNull();
  });

  it('should list BNB and not DOT among the pairs when rendered', () => {
    render(React.createElement(FeaturesPage));
    const pairs = screen.getByText(/BTC, ETH, SOL, BNB/);
    expect(pairs.textContent).not.toMatch(/DOT/);
  });

  it('should describe leverage, history and journal as built when rendered', () => {
    render(React.createElement(FeaturesPage));
    expect(screen.getByText(/Set per symbol, USDT Perpetual only, up to 10×/)).not.toBeNull();
    expect(screen.getByText(/filled, cancelled, and rejected orders/)).not.toBeNull();
    expect(screen.queryByText(/expired/i)).toBeNull();
    expect(screen.queryByText(/screenshots/i)).toBeNull();
  });

  it('should not make the unverified claims when rendered', () => {
    render(React.createElement(FeaturesPage));
    expect(screen.queryByText(/Sub-100ms/i)).toBeNull();
    expect(screen.queryByText('Market Overview')).toBeNull();
    expect(screen.queryByText('OHLCV History')).toBeNull();
    expect(screen.queryByText(/backtesting/i)).toBeNull();
  });
});
