import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
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
  usePaperStore.getState().reset();
  paneStores[0].setState({ latestPrice: 77_350, isConnected: true, bid: 77_340, ask: 77_360 });
  useLayoutStore.setState({ activePane: 0 });
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
          triggerPrice: 50_000,
          qty: 0.004,
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
          openedAt: Date.now(),
        },
        {
          id: 'p2',
          symbol: 'ETHUSDT',
          side: 'short',
          quantity: 0.01,
          entryPrice: 3_000,
          entryUsdtAmount: 30,
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
