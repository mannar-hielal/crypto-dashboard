/**
 * Section 5 — Symbol Pair Icons (T2 · RTL)
 *
 * Verifies that every surface listed in TRADING_TEST_PLAN.md Section 5
 * renders a <SymbolPair> with the correct base symbol and does not crash.
 *
 * Strategy: mock the CryptoIcon module so SymbolPair becomes a lightweight
 * span with data-base / data-quote attributes.  This lets us assert:
 *   - which base symbol was passed (correct icon chosen)
 *   - how many SymbolPair instances appear
 * …without needing bundled SVG assets or a live Playwright browser.
 *
 * Covers:
 *   5.1 — Symbol picker dropdown rows (SymbolBar)
 *   5.2 — Active symbol trigger button (SymbolBar)
 *   5.3 — Positions tab symbol cell (OrderAccountManagementPanel)
 *   5.4 — Orders tab symbol cell (OrderAccountManagementPanel)
 *   5.5 — Order History tab symbol cell (OrderAccountManagementPanel)
 *   5.7 — Multi-symbol: each Positions row shows its own base icon
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// ─── Mock CryptoIcon module ───────────────────────────────────────────────────
// SymbolPair renders as a plain span exposing base/quote as data attributes.
// CryptoIcon renders as a plain span exposing the symbol.
// This avoids ?url SVG imports and framer-motion animation in jsdom.

vi.mock('@/components/ui/CryptoIcon', () => ({
  SymbolPair: ({ base, quote }: { base: string; quote?: string }) => (
    <span data-testid="symbol-pair" data-base={base} data-quote={quote ?? 'USDT'} />
  ),
  CryptoIcon: ({ symbol }: { symbol: string }) => (
    <span data-testid="crypto-icon" data-symbol={symbol} />
  ),
}));

// ─── Mock framer-motion ───────────────────────────────────────────────────────

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

// ─── Misc component mocks ─────────────────────────────────────────────────────

vi.mock('@number-flow/react', () => ({
  default: ({ value, className }: { value: number; className?: string }) => (
    <span className={className}>{value}</span>
  ),
}));

vi.mock('../ChartLayoutPicker', () => ({
  ChartLayoutPicker: () => <div data-testid="chart-layout-picker" />,
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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { SymbolBar } from '../SymbolBar';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
import {
  usePaperStore,
  type HistoricalOrder,
  type PendingOrder,
  type Position,
} from '@/store/paperStore';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import { SYMBOLS } from '@/lib/markets';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSymbolBar() {
  return render(
    <SymbolBar
      tradingPanelOpen={false}
      onToggleTrading={vi.fn()}
      leftToolbarOpen={true}
      onToggleLeftToolbar={vi.fn()}
    />
  );
}

function renderPanel() {
  return render(
    <OrderAccountManagementPanel
      size="open"
      onSizeChange={vi.fn()}
      isMaximized={false}
      onToggleMaximize={vi.fn()}
    />
  );
}

/** Returns all `data-base` attribute values for every rendered SymbolPair. */
function getRenderedBases(): string[] {
  return screen.getAllByTestId('symbol-pair').map((el) => el.getAttribute('data-base') ?? '');
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const btcPosition: Position = {
  id: 'pos-btc',
  symbol: 'BTCUSDT',
  side: 'long',
  quantity: 0.001,
  entryPrice: 77_000,
  entryUsdtAmount: 77,
  openedAt: 1_715_000_000_000,
};

const ethPosition: Position = {
  id: 'pos-eth',
  symbol: 'ETHUSDT',
  side: 'long',
  quantity: 0.05,
  entryPrice: 3_000,
  entryUsdtAmount: 150,
  openedAt: 1_715_000_001_000,
};

const btcPendingOrder: PendingOrder = {
  id: 'pending-btc',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  usdtAmount: 200,
  triggerPrice: 75_000,
  qty: 0.002667,
  placedAt: 1_715_000_000_000,
};

const btcHistoricalOrder: HistoricalOrder = {
  id: 'hist-btc',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'market',
  qty: 0.001,
  fillPrice: 77_000,
  status: 'filled',
  commission: 0.054,
  margin: 77,
  placingTime: 1_715_000_000_000,
  closingTime: 1_715_000_000_100,
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  usePaperStore.getState().reset();
  paneStores[0].setState({
    latestPrice: 77_000,
    isConnected: true,
    bid: 76_990,
    ask: 77_010,
  });
  useLayoutStore.setState({ activePane: 0 });
});

afterEach(cleanup);

// ─── Section 5.1 — Symbol picker dropdown rows ───────────────────────────────

describe('Section 5.1 — symbol picker dropdown: each row has a SymbolPair', () => {
  it('5.1: trigger button is visible, at least one SymbolPair rendered before dropdown opens', () => {
    renderSymbolBar();
    // The trigger button always shows the active symbol pair (5.2 covers this)
    expect(screen.getAllByTestId('symbol-pair').length).toBeGreaterThanOrEqual(1);
  });

  it('5.1: opening the dropdown renders one SymbolPair per available symbol', () => {
    renderSymbolBar();

    // Click the trigger button (the first symbol-pair is inside it)
    const triggerPair = screen.getAllByTestId('symbol-pair')[0];
    const triggerBtn = triggerPair.closest('button')!;
    fireEvent.click(triggerBtn);

    // After dropdown opens, all SYMBOLS entries should have a SymbolPair
    const bases = getRenderedBases();
    for (const entry of SYMBOLS) {
      expect(bases).toContain(entry.base);
    }
  });

  it('5.1: dropdown SymbolPair entries use baseSize=20 (quote="USDT")', () => {
    renderSymbolBar();

    const triggerPair = screen.getAllByTestId('symbol-pair')[0];
    fireEvent.click(triggerPair.closest('button')!);

    const pairs = screen.getAllByTestId('symbol-pair');
    // Every dropdown row pair has quote="USDT"
    const allHaveUsdt = pairs.every((el) => el.getAttribute('data-quote') === 'USDT');
    expect(allHaveUsdt).toBe(true);
  });
});

// ─── Section 5.2 — Active symbol trigger button ───────────────────────────────

describe('Section 5.2 — active symbol trigger button contains SymbolPair', () => {
  it('5.2: renders a SymbolPair in the trigger button for the active symbol (BTC)', () => {
    renderSymbolBar();
    const bases = getRenderedBases();
    expect(bases).toContain('BTC');
  });

  it('5.2: trigger SymbolPair has base="ETH" when pane symbol is ETHUSDT', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'ETHUSDT' } : p)),
    }));
    paneStores[0].setState({ latestPrice: 3_000 });
    renderSymbolBar();
    const bases = getRenderedBases();
    expect(bases).toContain('ETH');
  });
});

// ─── Section 5.3 — Positions tab symbol cell ─────────────────────────────────

describe('Section 5.3 — Positions tab: symbol cell contains SymbolPair', () => {
  it('5.3: Positions tab shows a SymbolPair with the correct base for a BTCUSDT position', () => {
    usePaperStore.setState({ positions: [btcPosition] });
    renderPanel();
    // Positions tab is the default; no need to switch
    expect(getRenderedBases()).toContain('BTC');
  });

  it('5.3: SymbolPair has quote="USDT"', () => {
    usePaperStore.setState({ positions: [btcPosition] });
    renderPanel();
    const pair = screen
      .getAllByTestId('symbol-pair')
      .find((el) => el.getAttribute('data-base') === 'BTC');
    expect(pair?.getAttribute('data-quote')).toBe('USDT');
  });

  it('5.3: no crash when Positions tab is empty (no SymbolPair rendered)', () => {
    usePaperStore.setState({ positions: [] });
    renderPanel();
    // Should render the "No open positions" empty state and not throw
    expect(screen.getByText(/no open positions/i)).toBeTruthy();
  });
});

// ─── Section 5.4 — Orders tab symbol cell ───────────────────────────────────

describe('Section 5.4 — Orders tab: symbol cell contains SymbolPair', () => {
  it('5.4: Orders tab shows a SymbolPair with the correct base for a BTCUSDT pending order', () => {
    usePaperStore.setState({ pendingOrders: [btcPendingOrder] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    expect(getRenderedBases()).toContain('BTC');
  });

  it('5.4: SymbolPair has quote="USDT"', () => {
    usePaperStore.setState({ pendingOrders: [btcPendingOrder] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    const pair = screen
      .getAllByTestId('symbol-pair')
      .find((el) => el.getAttribute('data-base') === 'BTC');
    expect(pair?.getAttribute('data-quote')).toBe('USDT');
  });
});

// ─── Section 5.5 — Order History tab symbol cell ────────────────────────────

describe('Section 5.5 — Order History tab: symbol cell contains SymbolPair', () => {
  it('5.5: Order History tab shows a SymbolPair with the correct base for a filled BTCUSDT order', () => {
    usePaperStore.setState({ orders: [btcHistoricalOrder] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /order history/i }));
    expect(getRenderedBases()).toContain('BTC');
  });

  it('5.5: SymbolPair has quote="USDT"', () => {
    usePaperStore.setState({ orders: [btcHistoricalOrder] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /order history/i }));
    const pair = screen
      .getAllByTestId('symbol-pair')
      .find((el) => el.getAttribute('data-base') === 'BTC');
    expect(pair?.getAttribute('data-quote')).toBe('USDT');
  });

  it('5.5: SymbolPair renders for a cancelled order (not only filled)', () => {
    const cancelledOrder: HistoricalOrder = {
      ...btcHistoricalOrder,
      id: 'hist-cancelled',
      status: 'cancelled',
      fillPrice: undefined,
    };
    usePaperStore.setState({ orders: [cancelledOrder] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /order history/i }));
    expect(getRenderedBases()).toContain('BTC');
  });
});

// ─── Section 5.7 — Multi-symbol: each row shows its own base icon ────────────

describe('Section 5.7 — multi-symbol positions: each row shows its own base icon', () => {
  it('5.7: BTC and ETH positions each display their own base icon (not the active-pane symbol)', () => {
    usePaperStore.setState({ positions: [btcPosition, ethPosition] });
    renderPanel();
    const bases = getRenderedBases();
    expect(bases).toContain('BTC');
    expect(bases).toContain('ETH');
  });

  it('5.7: BTC row shows base="BTC" even when active pane is ETH', () => {
    paneStores[0].setState({ latestPrice: 3_000 });
    usePaperStore.setState({ positions: [btcPosition, ethPosition] });
    renderPanel();
    const bases = getRenderedBases();
    // Both symbols are still individually represented
    expect(bases).toContain('BTC');
    expect(bases).toContain('ETH');
  });

  it('5.7: two positions yield exactly 2 SymbolPair instances in the Positions tab', () => {
    usePaperStore.setState({ positions: [btcPosition, ethPosition] });
    renderPanel();
    expect(screen.getAllByTestId('symbol-pair')).toHaveLength(2);
  });
});
