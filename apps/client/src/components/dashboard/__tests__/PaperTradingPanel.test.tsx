import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PaperTradingPanel } from '../PaperTradingPanel';
import {
  usePaperStore,
  type HistoricalOrder,
  type PendingOrder,
  type Position,
} from '@/store/paperStore';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';

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
}));

function renderPanel() {
  return render(
    <PaperTradingPanel
      size="open"
      onSizeChange={vi.fn()}
      isMaximized={false}
      onToggleMaximize={vi.fn()}
    />
  );
}

function seedState({
  orders,
  pendingOrders = [],
  positions = [],
}: {
  orders: HistoricalOrder[];
  pendingOrders?: PendingOrder[];
  positions?: Position[];
}) {
  usePaperStore.setState({
    pendingOrders,
    orders,
    positions,
  });
}

beforeEach(() => {
  localStorage.clear();
  usePaperStore.getState().reset();
  paneStores[0].setState({ latestPrice: 77_350, isConnected: true, bid: 77_340, ask: 77_360 });
  useLayoutStore.setState({ activePane: 0 });
});

afterEach(() => {
  cleanup();
});

describe('PaperTradingPanel Orders filled sub-tab', () => {
  it('shows a Filled sub-tab with correct counts in Orders', () => {
    seedState({
      pendingOrders: [
        {
          id: 'pending-1',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          usdtAmount: 193.38,
          triggerPrice: 77_375,
          qty: 0.0025,
          placedAt: 1_715_000_000_000,
        },
      ],
      orders: [
        {
          id: 'filled-1',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          qty: 0.0025,
          stopPrice: 77_375,
          fillPrice: 77_385.4,
          status: 'filled',
          commission: 0.1354,
          margin: 193.38,
          placingTime: 1_715_000_000_100,
          closingTime: 1_715_000_000_200,
        },
        {
          id: 'cancelled-1',
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'stop',
          qty: 0.0025,
          stopPrice: 76_000,
          status: 'cancelled',
          commission: 0,
          margin: 193.1,
          placingTime: 1_715_000_000_300,
          closingTime: 1_715_000_000_400,
        },
      ],
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));

    expect(screen.getByRole('button', { name: /all\s*3/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /working\s*1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /filled\s*1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancelled\s*1/i })).toBeTruthy();
  });

  it('shows filled rows inside Orders > Filled and keeps them in Order History', () => {
    seedState({
      orders: [
        {
          id: 'filled-1',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          qty: 0.0025,
          stopPrice: 77_375,
          fillPrice: 77_385.4,
          status: 'filled',
          commission: 0.1354,
          margin: 193.38,
          placingTime: 1_715_000_000_100,
          closingTime: 1_715_000_000_200,
        },
      ],
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    fireEvent.click(screen.getByRole('button', { name: /filled\s*1/i }));

    expect(screen.getByText('$77,385.4')).toBeTruthy();
    expect(screen.getAllByText(/filled/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /order history/i }));
    fireEvent.click(screen.getByRole('button', { name: /filled\s*1/i }));

    expect(screen.getByText('$77,385.4')).toBeTruthy();
  });

  it('keeps Orders top badge at 2 when parent is filled and only TP/SL child orders are active', () => {
    seedState({
      positions: [
        {
          id: 'pos-1',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.0025,
          entryPrice: 77_385.4,
          entryUsdtAmount: 193.38,
          openedAt: 1_715_000_000_100,
          takeProfit: 78_000,
          stopLoss: 76_000,
        },
      ],
      orders: [
        {
          id: 'filled-1',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          qty: 0.0025,
          stopPrice: 77_375,
          fillPrice: 77_385.4,
          status: 'filled',
          commission: 0.1354,
          margin: 193.38,
          placingTime: 1_715_000_000_100,
          closingTime: 1_715_000_000_200,
        },
      ],
    });

    renderPanel();

    expect(screen.getByRole('button', { name: /orders\s*2/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /orders\s*3/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    expect(screen.getByRole('button', { name: /all\s*3/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /working\s*2/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /filled\s*1/i })).toBeTruthy();
  });
});
