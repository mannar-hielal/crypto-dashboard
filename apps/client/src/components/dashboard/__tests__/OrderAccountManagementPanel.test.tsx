import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
import { migrateColPrefs } from '@/lib/columnPrefs';
import {
  usePaperStore,
  type BalanceEvent,
  type HistoricalOrder,
  type JournalEntry,
  type PendingOrder,
  type Position,
} from '@/store/paperStore';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';

// Bench-compatible fixture timestamp — evaluated once at module load, which
// happens after SESSION_START is evaluated in OrderAccountManagementPanel.tsx.
// Any closingTime >= SESSION_START satisfies isBenchHistoricalOrder; using a
// static value here keeps tests deterministic within a single run.
const FIXTURE_NOW = Date.now();

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
    <OrderAccountManagementPanel
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
  usePaperStore.getState().clear();
  paneStores[0].setState({
    latestPrice: 77_350,
    isConnected: true,
    bid: 77_340,
    ask: 77_360,
    markPrice: null,
  });
  // USDT Perpetual (positions, leveraged orders); Spot's Assets tab has its own tests
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'linear' } : p)),
  }));
});

afterEach(() => {
  cleanup();
});

// ─── Section 4.5 — Collapse/Expand panel, no ✕ close button ─────────────────

describe('Section 4.5 — OrderAccountManagementPanel header controls', () => {
  it('4.5: panel header does not contain a ✕ close button', () => {
    renderPanel();
    // The header should NOT have an X/close button — only Sound, ⚙️, Collapse/Expand, Maximize buttons
    // Look for any button with a title that suggests closing the panel itself
    const allButtons = screen.getAllByRole('button');
    const closeLabels = allButtons.filter(
      (b) =>
        b.getAttribute('title')?.toLowerCase().includes('close panel') ||
        b.getAttribute('aria-label')?.toLowerCase().includes('close panel')
    );
    expect(closeLabels).toHaveLength(0);
  });

  it('4.5: panel shows Collapse/Expand button in open state', () => {
    renderPanel();
    // size="open" — collapse button should be present
    const collapseBtn = screen.queryByTitle(/collapse/i) ?? screen.queryByLabelText(/collapse/i);
    expect(collapseBtn).toBeTruthy();
  });

  it('4.5: tabs remain functional — all 5 tab buttons render', () => {
    renderPanel();
    // Expect at least the 5 main tab buttons: Positions, Orders, Order History, Balance History, Journal
    const tabButtons = screen
      .getAllByRole('button')
      .filter(
        (b) =>
          /positions/i.test(b.textContent ?? '') ||
          /^orders/i.test(b.textContent ?? '') ||
          /order history/i.test(b.textContent ?? '') ||
          /balance history/i.test(b.textContent ?? '') ||
          /journal/i.test(b.textContent ?? '')
      );
    expect(tabButtons.length).toBeGreaterThanOrEqual(5);
  });
});

describe('OrderAccountManagementPanel Orders filled sub-tab', () => {
  it('shows a Filled sub-tab with correct counts in Orders', () => {
    seedState({
      pendingOrders: [
        {
          id: 'pending-1',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'stop',
          usdtAmount: 193.38,
          category: 'linear' as const,
          reserved: 193.38,
          triggerPrice: 77_375,
          qty: 0.0025,
          leverage: 1,
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
          category: 'linear' as const,
          margin: 193.38,
          placingTime: FIXTURE_NOW,
          closingTime: FIXTURE_NOW,
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
          category: 'linear' as const,
          margin: 193.1,
          placingTime: FIXTURE_NOW,
          closingTime: FIXTURE_NOW,
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
          category: 'linear' as const,
          margin: 193.38,
          placingTime: FIXTURE_NOW,
          closingTime: FIXTURE_NOW,
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
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
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
          category: 'linear' as const,
          margin: 193.38,
          placingTime: FIXTURE_NOW,
          closingTime: FIXTURE_NOW,
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

// ─── Section 4.6/4.7 — Account Summary Bar ───────────────────────────────────

describe('Section 4 — Account Summary Bar', () => {
  it('4.6: initial state — Balance shows $10,000.00', () => {
    renderPanel();
    expect(screen.getByText('Balance')).toBeTruthy();
    // Both Balance and Equity start at $10,000.00 — use getAllByText
    expect(screen.getAllByText('$10,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('4.6: Reserved shows "—" when there are no pending orders', () => {
    renderPanel();
    expect(screen.getByText('Reserved')).toBeTruthy();
    // Multiple "—" cells are expected (Reserved + Win Rate at minimum)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('4.6: Win Rate shows "—" when there are no closed trades', () => {
    renderPanel();
    expect(screen.getByText('Win Rate')).toBeTruthy();
    // With no trades winRate=null → "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('4.7: with a pending order, Reserved shows the reserved USDT amount', () => {
    usePaperStore.setState({
      pendingOrders: [
        {
          id: 'p-summary',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'limit',
          usdtAmount: 200,
          category: 'linear' as const,
          reserved: 200,
          triggerPrice: 50_000,
          qty: 0.004,
          leverage: 1,
          placedAt: Date.now(),
        } satisfies PendingOrder,
      ],
    });
    renderPanel();
    expect(screen.getByText('$200.00')).toBeTruthy();
  });

  it('4.7: Win Rate shows a percentage when there are closed trades', () => {
    // 1 winning trade out of 1 → 100%
    usePaperStore.setState({
      balanceLog: [
        {
          id: 'be-win',
          time: Date.now(),
          balanceBefore: 10_000,
          balanceAfter: 10_100,
          pnl: 100,
          action: 'Closed LONG BTCUSDT @ $51,000.00',
        } satisfies BalanceEvent,
      ],
    });
    renderPanel();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});

// ─── Section 4 — Positions tab ───────────────────────────────────────────────

describe('Section 4 — Positions tab', () => {
  it('4.x: shows "No open positions" when there are no positions', () => {
    renderPanel();
    expect(screen.getByText('No open positions')).toBeTruthy();
  });

  it('4.x: with a LONG position, shows the symbol and "Long" side', () => {
    usePaperStore.setState({
      positions: [
        {
          id: 'pos-long',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.002,
          entryPrice: 50_000,
          entryUsdtAmount: 100,
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
          openedAt: Date.now(),
        } satisfies Position,
      ],
    });
    renderPanel();
    expect(screen.getAllByText('BTCUSDT').length).toBeGreaterThan(0);
    expect(screen.getByText('Long')).toBeTruthy();
  });

  it('4.x: with a SHORT position, shows "Short" side', () => {
    usePaperStore.setState({
      positions: [
        {
          id: 'pos-short',
          symbol: 'BTCUSDT',
          side: 'short',
          quantity: 0.002,
          entryPrice: 50_000,
          entryUsdtAmount: 100,
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
          openedAt: Date.now(),
        } satisfies Position,
      ],
    });
    renderPanel();
    expect(screen.getByText('Short')).toBeTruthy();
  });

  it('4.x: Positions tab badge shows the count of open positions', () => {
    usePaperStore.setState({
      positions: [
        {
          id: 'p1',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.001,
          entryPrice: 50_000,
          entryUsdtAmount: 50,
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
          openedAt: Date.now(),
        },
        {
          id: 'p2',
          symbol: 'ETHUSDT',
          side: 'short',
          quantity: 0.01,
          entryPrice: 3_000,
          entryUsdtAmount: 30,
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
          openedAt: Date.now(),
        },
      ] satisfies Position[],
    });
    renderPanel();
    // Tab button accessible name includes badge count: "positions 2" or "positions2"
    expect(screen.getByRole('button', { name: /positions.*2/i })).toBeTruthy();
  });

  it('4.x: position with TP set shows the TP price in the table', () => {
    usePaperStore.setState({
      positions: [
        {
          id: 'pos-tp',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.002,
          entryPrice: 50_000,
          entryUsdtAmount: 100,
          category: 'linear' as const,
          leverage: 1,
          entryFee: 0,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 0,
          positionMM: 0,
          cumFunding: 0,
          openedAt: Date.now(),
          takeProfit: 55_000,
        } satisfies Position,
      ],
    });
    renderPanel();
    expect(screen.getByText('$55,000')).toBeTruthy();
  });
});

// ─── Section 4.7 — Balance History tab (T2) ──────────────────────────────────

describe('Section 4.7 — Balance History tab', () => {
  function switchToBalanceHistory() {
    fireEvent.click(screen.getByRole('button', { name: /balance history/i }));
  }

  it('4.7: shows "No balance history yet" when balanceLog is empty', () => {
    renderPanel();
    switchToBalanceHistory();
    expect(screen.getByText('No balance history yet')).toBeTruthy();
  });

  it('4.7: with a seeded BalanceEvent, shows the action text in the table', () => {
    usePaperStore.setState({
      balanceLog: [
        {
          id: 'be-1',
          time: Date.now(),
          balanceBefore: 10_000,
          balanceAfter: 9_900,
          pnl: -100,
          action: 'Opened LONG BTCUSDT @ $50,000.00',
        } satisfies BalanceEvent,
      ],
    });
    renderPanel();
    switchToBalanceHistory();
    expect(screen.getByText('Opened LONG BTCUSDT @ $50,000.00')).toBeTruthy();
  });

  it('4.7: BH tab badge shows count when there are entries', () => {
    usePaperStore.setState({
      balanceLog: [
        {
          id: 'be-badge',
          time: Date.now(),
          balanceBefore: 10_000,
          balanceAfter: 9_900,
          pnl: -100,
          action: 'Test entry',
        } satisfies BalanceEvent,
      ],
    });
    renderPanel();
    // Tab button name includes the count "1"
    expect(screen.getByRole('button', { name: /balance history.*1/i })).toBeTruthy();
  });
});

// ─── Section 4.8/4.9/4.10/4.11 — Journal tab (T2) ───────────────────────────

describe('Section 4.8–4.11 — Journal tab', () => {
  function switchToJournal() {
    fireEvent.click(screen.getByRole('button', { name: /journal/i }));
  }

  it('4.8: shows "No journal entries yet" when journal is empty', () => {
    renderPanel();
    switchToJournal();
    expect(screen.getByText(/No journal entries yet/)).toBeTruthy();
  });

  it('4.8: system entry (isUserNote=false) does not render an "Edit note" pencil', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-sys',
          time: Date.now(),
          text: 'Opened LONG BTCUSDT @ $50,000.00',
          isUserNote: false,
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    expect(screen.getByText('Opened LONG BTCUSDT @ $50,000.00')).toBeTruthy();
    // System entries must NOT render an editable pencil
    expect(screen.queryByTitle('Edit note')).toBeNull();
  });

  it('4.8: user note (isUserNote=true) renders an "Edit note" pencil in the DOM', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-user',
          time: Date.now(),
          text: 'My manual trade note',
          isUserNote: true,
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    expect(screen.getByText('My manual trade note')).toBeTruthy();
    expect(screen.getByTitle('Edit note')).toBeTruthy();
  });

  it('4.8: Journal tab badge shows entry count', () => {
    usePaperStore.setState({
      journal: [
        { id: 'j1', time: Date.now(), text: 'Entry one', isUserNote: false },
        { id: 'j2', time: Date.now() - 1000, text: 'Entry two', isUserNote: false },
      ] satisfies JournalEntry[],
    });
    renderPanel();
    // Tab button accessible name includes badge "2"
    expect(screen.getByRole('button', { name: /journal.*2/i })).toBeTruthy();
  });

  it('4.9: profitable close entry shows a "+$X.XX" PnL badge', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-profit',
          time: Date.now(),
          text: 'Closed LONG BTCUSDT @ $55,000.00',
          isUserNote: false,
          pnl: 98.5,
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    expect(screen.getByText('+$98.50')).toBeTruthy();
  });

  it('4.10: losing close entry shows a "$-X.XX" PnL badge', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-loss',
          time: Date.now(),
          text: 'Auto-closed LONG BTCUSDT — Stop-Loss hit at $45,000.00',
          isUserNote: false,
          pnl: -48,
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    // Component renders: {'' + '$' + pnl.toFixed(2)} → "$-48.00" (sign from toFixed)
    expect(screen.getByText('$-48.00')).toBeTruthy();
  });

  it('4.10: zero-PnL close entry shows "+$0.00" badge (breakeven)', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-zero',
          time: Date.now(),
          text: 'Closed LONG BTCUSDT @ $50,000.00',
          isUserNote: false,
          pnl: 0,
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    // Summary bar also shows +$0.00 for Unrealized/Realized P&L — use getAllByText
    expect(screen.getAllByText('+$0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('4.11: user note with no pnl field has no PnL badge', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-usernote',
          time: Date.now(),
          text: 'Looking promising for a breakout',
          isUserNote: true,
          // pnl intentionally omitted → undefined
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    const entryEl = screen.getByText('Looking promising for a breakout');
    const row = entryEl.closest('tr')!;
    // No ±$X.XX badge within the journal row
    expect(within(row).queryByText(/[+-]\$[0-9]/)).toBeNull();
  });

  it('4.11: system entry without pnl has no PnL badge', () => {
    usePaperStore.setState({
      journal: [
        {
          id: 'j-systemnopnl',
          time: Date.now(),
          text: 'Placed LIMIT Long BTCUSDT @ $48,000.00',
          isUserNote: false,
          // pnl omitted (placement entry — no close pnl)
        } satisfies JournalEntry,
      ],
    });
    renderPanel();
    switchToJournal();
    const entryEl = screen.getByText('Placed LIMIT Long BTCUSDT @ $48,000.00');
    const row = entryEl.closest('tr')!;
    // No ±$X.XX badge within the journal row
    expect(within(row).queryByText(/[+-]\$[0-9]/)).toBeNull();
  });
});

// ─── BP-2 — Spot Assets tab, per-market lists ─────────────────────────────────

describe('BP-2 — markets in the account panel', () => {
  const onSpot = () =>
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot', symbol: 'BTCUSDT' } : p)),
    }));

  const perpOrder: PendingOrder = {
    id: 'perp-1',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'limit',
    usdtAmount: 100,
    reserved: 100.11,
    triggerPrice: 70_000,
    qty: 0.001,
    leverage: 1,
    placedAt: FIXTURE_NOW,
  };
  const spotLeg: PendingOrder = {
    id: 'grp-sl',
    category: 'spot',
    symbol: 'BTCUSDT',
    side: 'sell',
    type: 'stop-loss',
    usdtAmount: 65,
    reserved: 0.001,
    triggerPrice: 65_000,
    qty: 0.001,
    leverage: 1,
    placedAt: FIXTURE_NOW,
    ocoGroup: 'grp',
  };

  it('on Spot, Assets replaces Positions and lists the USDT wallet and coins held', () => {
    onSpot();
    paneStores[0].setState({ latestPrice: 80_000 });
    usePaperStore.setState({
      balance: 5_000,
      spotBalances: [{ coin: 'BTC', free: 0.05, locked: 0.01, avgCost: 70_000 }],
      pendingOrders: [],
    });
    renderPanel();
    expect(screen.queryByRole('button', { name: /^positions/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^assets/i }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('USDT')).toBeTruthy();
    expect(within(table).getByText('BTC')).toBeTruthy();
    // (80,000 − 70,000) × 0.06 = +600.00, with a + sign (never colour alone)
    expect(within(table).getByText(/\+600\.00 \(\+14\.29%\)/)).toBeTruthy();
  });

  it('Assets → Sell switches the pane to that coin on Spot and prefills the form', async () => {
    onSpot();
    usePaperStore.setState({
      spotBalances: [{ coin: 'ETH', free: 2, locked: 0, avgCost: 3_000 }],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^assets/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    const { useOrderPrefillStore } = await import('@/store/orderPrefillStore');
    expect(useOrderPrefillStore.getState().request).toEqual({
      category: 'spot',
      symbol: 'ETHUSDT',
      side: 'sell',
      qty: 2,
    });
    expect(useLayoutStore.getState().panes[0]).toMatchObject({
      category: 'spot',
      symbol: 'ETHUSDT',
    });
  });

  it('Orders shows the active market only', () => {
    usePaperStore.setState({ pendingOrders: [perpOrder, spotLeg], orders: [], positions: [] });
    renderPanel(); // USDT Perpetual (suite default)
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    // The perpetual limit (70,000) shows; the spot stop-loss leg (65,000) doesn't
    expect(screen.queryAllByText(/70,000/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/65,000/).length).toBe(0);
    cleanup();

    onSpot();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    expect(screen.queryAllByText(/65,000/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/70,000/).length).toBe(0);
  });

  it('labels a spot stop-loss leg "Stop Loss" in the Type column (PR #136)', () => {
    onSpot();
    usePaperStore.setState({ pendingOrders: [spotLeg], orders: [], positions: [] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    expect(screen.getByText('Stop Loss')).toBeTruthy();
    expect(screen.queryByText('stop-loss')).toBeNull();
  });

  it('offers no TP / SL edit on a spot TP / SL order (it is cancelled and placed again)', () => {
    onSpot();
    usePaperStore.setState({ pendingOrders: [spotLeg], orders: [], positions: [] });
    render(
      <OrderAccountManagementPanel
        size="open"
        onSizeChange={vi.fn()}
        isMaximized={false}
        onToggleMaximize={vi.fn()}
        onEditPendingOrder={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));
    expect(screen.queryByTitle('Edit TP')).toBeNull();
    expect(screen.queryByTitle('Edit SL')).toBeNull();
  });

  it('shows a fill’s fee with its rate and liquidity', () => {
    usePaperStore.setState({
      orders: [
        {
          id: 'f1',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'market',
          qty: 0.1,
          fillPrice: 50_000,
          status: 'filled',
          commission: 2.75,
          feeRate: 0.00055,
          feeAsset: 'USDT',
          isMaker: false,
          placingTime: FIXTURE_NOW,
          closingTime: FIXTURE_NOW,
        },
      ],
      pendingOrders: [],
      positions: [],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^order history/i }));
    expect(screen.getByText('2.7500 USDT')).toBeTruthy();
    expect(screen.getByText('0.055% taker')).toBeTruthy();
  });
});

describe('BP-3 — mark price, liquidation price and MMR in the Positions tab', () => {
  const long10x: Position = {
    id: 'p-liq',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: 0.1,
    entryPrice: 50_000,
    entryUsdtAmount: 500,
    category: 'linear',
    leverage: 10,
    entryFee: 2.75,
    closeFeeReserve: 2.475,
    extraMargin: 0,
    liqPrice: 45_148.99,
    bustPrice: 45_000,
    positionIM: 502.475,
    positionMM: 18.975,
    cumFunding: 0,
    openedAt: FIXTURE_NOW,
  };

  it('values the position at the mark price, not the last price, and shows the liquidation price', () => {
    usePaperStore.setState({ positions: [long10x] });
    // Last 77,350 (pane 0 default); mark 49,000 → PnL (49,000 − 50,000) × 0.1 = −100
    paneStores[0].setState({ markPrice: 49_000 });
    renderPanel();
    expect(screen.getByText('Mark Price')).toBeTruthy();
    expect(screen.getByText('Liq. Price')).toBeTruthy();
    expect(screen.getByTestId('position-liq-price').textContent).toBe('$45,148.99');
    expect(screen.getAllByText('-100.00').length).toBeGreaterThan(0);
  });

  it('shows the maintenance-margin rate: 18.975 / (502.475 − 100) ≈ 4.7%', () => {
    usePaperStore.setState({ positions: [long10x] });
    paneStores[0].setState({ markPrice: 49_000 });
    renderPanel();
    expect(screen.getByTestId('position-mmr').textContent).toBe('4.7%');
  });

  it('unknown risk figures (pre-BP-3 server) show — instead of a safe-looking 0% meter', () => {
    usePaperStore.setState({ positions: [{ ...long10x, liqPrice: null, positionMM: null }] });
    paneStores[0].setState({ markPrice: 49_000 });
    renderPanel();
    expect(screen.getByTestId('position-liq-price').textContent).toBe('—');
    expect(screen.queryByTestId('position-mmr')).toBeNull();
  });

  it('a position that can not be liquidated shows — for its liquidation price', () => {
    usePaperStore.setState({ positions: [{ ...long10x, liqPrice: 0 }] });
    renderPanel();
    expect(screen.getByTestId('position-liq-price').textContent).toBe('—');
  });
});

describe('migrateColPrefs()', () => {
  it('adds the BP-3 and BP-4 columns to a v1 Positions layout once', () => {
    const saved = { positions: ['symbol', 'mark', 'pnl', 'pnlPct', 'close'] };
    expect(migrateColPrefs(saved, 1).positions).toEqual([
      'symbol',
      'mark',
      'liq',
      'mmr',
      'pnl',
      'pnlPct',
      'funding',
      'close',
    ]);
  });

  it('a v2 layout only gets the BP-4 Funding column; without its anchor it goes before Close', () => {
    const saved = { positions: ['symbol', 'mark', 'liq', 'pnl', 'close'] };
    expect(migrateColPrefs(saved, 2).positions).toEqual([
      'symbol',
      'mark',
      'liq',
      'pnl',
      'funding',
      'close',
    ]);
  });

  it('keeps the user’s choice once the layout is at the current version', () => {
    const saved = { positions: ['symbol', 'mark', 'pnl', 'close'] };
    expect(migrateColPrefs(saved, 3)).toEqual(saved);
  });
});

describe('BP-4 — funding in the Positions tab', () => {
  const base: Position = {
    id: 'p-fund',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: 0.1,
    entryPrice: 50_000,
    entryUsdtAmount: 500,
    category: 'linear',
    leverage: 10,
    entryFee: 2.75,
    closeFeeReserve: 2.475,
    extraMargin: 0,
    liqPrice: 45_148.99,
    bustPrice: 45_000,
    positionIM: 502.475,
    positionMM: 18.975,
    cumFunding: 0.51,
    openedAt: FIXTURE_NOW,
  };

  it('shows funding paid as money out (−, red) and received as money in (+)', () => {
    usePaperStore.setState({ positions: [base] });
    const { unmount } = renderPanel();
    expect(screen.getByText('Funding')).toBeTruthy();
    expect(screen.getByTestId('position-funding').textContent).toBe('−0.51');
    unmount();
    usePaperStore.setState({ positions: [{ ...base, cumFunding: -0.2 }] });
    renderPanel();
    expect(screen.getByTestId('position-funding').textContent).toBe('+0.20');
  });
});
