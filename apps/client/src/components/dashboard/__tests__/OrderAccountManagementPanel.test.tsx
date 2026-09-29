import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
import { migrateColPrefs } from '@/lib/columnPrefs';
import { color } from '@/lib/tokens';
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
import { useAuthStore } from '@/store/authStore';
import { fakeDelta, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';
import { getByGuide, queryByGuide } from '@/test/guide';

// Bench-compatible fixture timestamp — evaluated once at module load, which
// happens after SESSION_START is evaluated in OrderAccountManagementPanel.tsx.
// Any closingTime >= SESSION_START satisfies isBenchHistoricalOrder; using a
// static value here keeps tests deterministic within a single run.
const FIXTURE_NOW = Date.now();

// Trading runs on the server (BP-1): store actions call paperApi. The fake records the intent and
// answers with a delta, so no test in this file reaches the network.
vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

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
  resetFakePaperApi();
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

  it('4.10: losing close entry shows a "-$X.XX" PnL badge', () => {
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
    // Like Bybit (visual gate 2026-09-29): the sign before the $
    expect(screen.getByText('-$48.00')).toBeTruthy();
  });

  it('4.10: zero-PnL close entry shows "$0.00" (no sign) badge (breakeven)', () => {
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
    // Zero carries no sign, like Bybit; the summary bar shows $0.00 too — use getAllByText
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1);
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

  it('cross (BP-5 E): account figures in the summary bar, the estimated liq price, no margin pencil', () => {
    usePaperStore.setState({
      positions: [{ ...long10x, marginMode: 'cross', liqPrice: null, bustPrice: null }],
      balance: 95,
      marginMode: 'REGULAR_MARGIN',
    });
    paneStores[0].setState({ markPrice: 49_000 });
    renderPanel();
    // Wallet 597.475, −100 at mark: margin balance 497.475; MM 18.5955 → 3.7%
    expect(screen.getByText('Margin Balance').nextElementSibling?.textContent).toBe('$497.48');
    // Available = margin balance − IM at mark (492.4255)
    expect(screen.getByText('Available').nextElementSibling?.textContent).toBe('$5.05');
    expect(
      within(screen.getByTestId('account-mm-rate')).getByTestId('position-mmr').textContent
    ).toBe('3.7%');
    // The position's liquidation price: where the margin balance meets the MM (≈ 44,193)
    expect(screen.getByTestId('position-liq-price').textContent).toMatch(/^\$44,19\d/);
    expect(screen.queryByRole('button', { name: 'Adjust margin for BTCUSDT' })).toBeNull();
  });

  it('shows the one-time cross notice to a pre-BP-5 isolated account; Switch to Cross asks the server', async () => {
    const setMarginMode = vi.fn(async () => null);
    const realSet = usePaperStore.getState().setMarginMode;
    usePaperStore.setState({ marginModeNotice: true, setMarginMode });
    renderPanel();
    const notice = screen.getByTestId('cross-margin-notice');
    fireEvent.click(within(notice).getByRole('button', { name: 'How it works' }));
    expect(notice.textContent).toContain('whole available balance backs every position');
    fireEvent.click(within(notice).getByRole('button', { name: 'Switch to Cross' }));
    await waitFor(() => expect(setMarginMode).toHaveBeenCalledWith('REGULAR_MARGIN'));
    // Dismissed: gone, and remembered
    fireEvent.click(
      within(notice).getByRole('button', { name: 'Dismiss the cross margin notice' })
    );
    expect(screen.queryByTestId('cross-margin-notice')).toBeNull();
    expect(localStorage.getItem('cd-cross-margin-notice-dismissed')).toBe('1');
    usePaperStore.setState({ setMarginMode: realSet });
  });

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

  it('shows the risk-limit tier and MMR on hover of the meter (BP-5 C, O6)', () => {
    usePaperStore.setState({ positions: [long10x] });
    paneStores[0].setState({ markPrice: 49_000 });
    renderPanel();
    expect(screen.getByTestId('position-mmr').getAttribute('title')).toBe(
      'Risk-limit tier 1 (up to 300,000 USDT) · MMR 0.33%'
    );
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
    expect(screen.getByTestId('position-funding').textContent).toBe('-0.51');
    unmount();
    usePaperStore.setState({ positions: [{ ...base, cumFunding: -0.2 }] });
    renderPanel();
    expect(screen.getByTestId('position-funding').textContent).toBe('+0.20');
  });
});

describe('BP-5 A — add / reduce margin from the Positions row', () => {
  // The tests stub the store action; clear() resets data only, so put the real one back
  const realAdjust = usePaperStore.getState().adjustPositionMargin;
  afterEach(() => usePaperStore.setState({ adjustPositionMargin: realAdjust }));

  const pos: Position = {
    id: 'p-margin',
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

  it('the pencil on Margin opens the dialog, previews the new liq. price and sends the amount', async () => {
    const adjust = vi.fn(async () => null);
    usePaperStore.setState({ positions: [pos], balance: 5_000, adjustPositionMargin: adjust });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust margin for BTCUSDT' }));
    const dialog = screen.getByRole('dialog', { name: /Adjust margin/ });
    fireEvent.change(within(dialog).getByLabelText('Margin amount'), {
      target: { value: '1000' },
    });
    // IM 500 + 1,000 added → liq ≈ 35,110 (server maths: margin.test)
    expect(within(dialog).getByTestId('adjust-margin-preview').textContent).toMatch(
      /\$45,148\.99 → \$35,1/
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(adjust).toHaveBeenCalledWith('p-margin', 1000));
  });

  it('Reduce is limited to the margin added by hand, and a refusal shows inline', async () => {
    const adjust = vi.fn(
      async () => 'Liquidation will be triggered immediately by this adjustment'
    );
    usePaperStore.setState({
      positions: [{ ...pos, extraMargin: 300 }],
      adjustPositionMargin: adjust,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust margin for BTCUSDT' }));
    const dialog = screen.getByRole('dialog', { name: /Adjust margin/ });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Reduce' }));
    expect(dialog.textContent).toContain('Max reducible (margin you added): $300.00');
    fireEvent.change(within(dialog).getByLabelText('Margin amount'), { target: { value: '400' } });
    expect(
      (within(dialog).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Margin amount'), { target: { value: '300' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Liquidation will be');
    expect(adjust).toHaveBeenCalledWith('p-margin', -300);
  });
});

describe('BP-5 D — Closed P&L tab', () => {
  it('lists USDT Perpetual closes with Bybit closedPnl and the fee / funding breakdown on hover', () => {
    usePaperStore.setState({
      history: [
        {
          id: 't1',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.05,
          entryPrice: 50_000,
          exitPrice: 51_000,
          pnl: 50,
          openedAt: FIXTURE_NOW - 60_000,
          closedAt: FIXTURE_NOW,
          openFee: 1.375,
          closeFee: 1.4025,
          closedPnl: 47.2225,
        },
        {
          id: 't2',
          category: 'linear',
          symbol: 'ETHUSDT',
          side: 'short',
          quantity: 1,
          entryPrice: 3_000,
          exitPrice: 3_300,
          pnl: -300,
          openedAt: FIXTURE_NOW - 120_000,
          closedAt: FIXTURE_NOW - 60_000,
          liquidated: true,
          funding: 0.5,
        },
        {
          id: 't3',
          category: 'spot',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.01,
          entryPrice: 50_000,
          exitPrice: 51_000,
          pnl: 10,
          openedAt: FIXTURE_NOW - 60_000,
          closedAt: FIXTURE_NOW,
        },
      ],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Closed P&L/ }));
    const rows = screen.getAllByTestId('closed-pnl-row');
    expect(rows).toHaveLength(2); // the spot sell is not a closed position
    const [btc, eth] = screen.getAllByTestId('closed-pnl-value');
    expect(btc.textContent).toBe('+47.2225 USDT');
    expect(btc.getAttribute('title')).toBe(
      'Open fee $1.3750 · Close fee $1.4025 · Funding $0.0000'
    );
    // A pre-BP-5 row: gross − funding, fees unknown
    expect(eth.textContent).toBe('-300.5000 USDT');
    expect(eth.getAttribute('title')).toBe('Open fee — · Close fee — · Funding $0.5000');
    expect(rows[1].textContent).toContain('Liquidation');
  });
});

// ─── Section 8 — Account Settings modal (SC-8-1, SC-8-2, SC-8-3; NEW-8-1 = 8.12) ─

describe('Section 8 — Account Settings modal', () => {
  const body = () => document.body;
  const modal = () => queryByGuide(body(), 'acct-settings.modal');
  const resetButton = () => getByGuide(body(), 'acct-settings.reset');
  const balanceShown = () => screen.getByText('Balance').nextElementSibling?.textContent;

  function openSettings() {
    fireEvent.click(getByGuide(body(), 'account.settings'));
    return getByGuide(body(), 'acct-settings.modal');
  }

  /** An account with something in every list, so a reset has something to clear */
  function seedBusyAccount() {
    usePaperStore.setState({
      version: 3,
      balance: 8_000,
      positions: [
        {
          id: 'pos-reset',
          symbol: 'BTCUSDT',
          side: 'long',
          quantity: 0.02,
          entryPrice: 50_000,
          entryUsdtAmount: 1_000,
          category: 'linear',
          leverage: 1,
          entryFee: 0.55,
          closeFeeReserve: 0,
          extraMargin: 0,
          liqPrice: 0,
          bustPrice: 0,
          positionIM: 1_000,
          positionMM: 5,
          cumFunding: 0,
          openedAt: FIXTURE_NOW,
        },
      ],
      pendingOrders: [
        {
          id: 'limit-reset',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'limit',
          usdtAmount: 490,
          reserved: 491,
          triggerPrice: 49_000,
          qty: 0.01,
          leverage: 1,
          placedAt: FIXTURE_NOW,
        },
      ],
      journal: [{ id: 'j-reset', time: FIXTURE_NOW, text: 'Why I bought', isUserNote: true }],
    });
  }

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      user: { id: 'u1', email: 'trader@test.local', username: 'trader42' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ accessToken: null, user: null });
  });

  // ── SC-8-1 Open, read, close ──────────────────────────────────────────────

  it('[8.1] should open the modal titled "Account Settings" when the gear is clicked', () => {
    renderPanel();
    expect(modal()).toBeNull();
    const dialog = openSettings();
    expect(within(dialog).getByText('Account Settings')).toBeTruthy();
  });

  it('[8.2] should show the signed-in username as read-only text when the modal is open', () => {
    renderPanel();
    openSettings();
    const name = getByGuide(body(), 'acct-settings.name');
    expect(name.textContent).toBe('trader42');
    // Plain text, not a field: nothing inside it can take typing
    expect(name.tagName).not.toBe('INPUT');
    expect(name.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
    expect(name.getAttribute('contenteditable')).toBeNull();
  });

  it('[8.3] should have no leverage field when the modal is open (leverage is per symbol)', () => {
    renderPanel();
    const dialog = openSettings();
    expect(within(dialog).queryByText(/leverage/i)).toBeNull();
    expect(dialog.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  it('[8.4] should show the Bybit VIP-0 fees as read-only text when the modal is open', () => {
    renderPanel();
    openSettings();
    const fees = getByGuide(body(), 'acct-settings.fees');
    expect(fees.textContent).toContain('Spot 0.1%');
    expect(fees.textContent).toContain('Perpetual 0.055% taker · 0.02% maker');
    expect(fees.querySelector('input')).toBeNull();
  });

  it('[8.5] should close without resetting when Done is clicked', () => {
    renderPanel();
    openSettings();
    const done = getByGuide(body(), 'acct-settings.done');
    expect(done.textContent).toBe('Done');
    fireEvent.click(done);
    expect(modal()).toBeNull();
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
  });

  it('[8.9] should close without resetting when ✕ is clicked', () => {
    renderPanel();
    openSettings();
    fireEvent.click(getByGuide(body(), 'acct-settings.close'));
    expect(modal()).toBeNull();
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
  });

  it('[8.10] should close on a backdrop click but stay open on a click inside the modal', () => {
    renderPanel();
    const dialog = openSettings();
    fireEvent.click(dialog);
    expect(modal()).not.toBeNull();
    fireEvent.click(getByGuide(body(), 'acct-settings.backdrop'));
    expect(modal()).toBeNull();
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
  });

  // ── SC-8-2 Two-step reset timer ───────────────────────────────────────────

  it('[8.6] should ask "Confirm reset?" without resetting when Reset account is clicked once', () => {
    vi.useFakeTimers();
    renderPanel();
    openSettings();
    expect(resetButton().textContent).toBe('Reset account');
    fireEvent.click(resetButton());
    expect(resetButton().textContent).toBe('Confirm reset?');
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
  });

  it('[8.7] should go back to "Reset account" with nothing reset when 3 s pass unconfirmed', () => {
    vi.useFakeTimers();
    renderPanel();
    openSettings();
    fireEvent.click(resetButton());
    act(() => vi.advanceTimersByTime(2_999));
    expect(resetButton().textContent).toBe('Confirm reset?');
    act(() => vi.advanceTimersByTime(1));
    expect(resetButton().textContent).toBe('Reset account');
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
    expect(modal()).not.toBeNull();
  });

  it('[8.10][8.11] should clear a pending confirm when the backdrop closes the modal and it is reopened', () => {
    vi.useFakeTimers();
    renderPanel();
    openSettings();
    fireEvent.click(resetButton());
    expect(resetButton().textContent).toBe('Confirm reset?');
    fireEvent.click(getByGuide(body(), 'acct-settings.backdrop'));
    expect(modal()).toBeNull();
    openSettings();
    expect(resetButton().textContent).toBe('Reset account');
    // The old timer is gone too: nothing flips the fresh button later
    act(() => vi.advanceTimersByTime(5_000));
    expect(resetButton().textContent).toBe('Reset account');
    expect(fakePaperApi.resetAccount).not.toHaveBeenCalled();
  });

  // ── SC-8-3 Reset clears everything ────────────────────────────────────────

  it('[8.8] should reset once, close the modal and show a fresh $10,000 account when confirmed within 3 s', async () => {
    seedBusyAccount();
    fakePaperApi.resetAccount.mockImplementationOnce(async () => ({
      result: true,
      delta: await fakeDelta({
        reset: true,
        account: {
          balance: '10000',
          realizedPnl: '0',
          leverage: 1,
          symbolLeverage: {},
          version: 4,
        },
      }),
    }));
    renderPanel();
    expect(balanceShown()).toBe('$8,000.00');
    openSettings();
    fireEvent.click(resetButton());
    fireEvent.click(resetButton());

    // The modal closes once the server has reset the account
    await waitFor(() => expect(modal()).toBeNull());
    await waitFor(() => expect(balanceShown()).toBe('$10,000.00'));
    expect(fakePaperApi.resetAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No open positions')).toBeTruthy();
    fireEvent.click(getByGuide(body(), 'account.tab', 'orders'));
    expect(screen.getByText('No orders')).toBeTruthy();
    fireEvent.click(getByGuide(body(), 'account.tab', 'journal'));
    expect(screen.getByText(/No journal entries yet/)).toBeTruthy();
  });

  // ── NEW-8-1 (8.12) Reset fails ────────────────────────────────────────────

  it('[8.12] should keep the modal open with an inline error and the account unchanged when the reset fails', async () => {
    seedBusyAccount();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakePaperApi.resetAccount.mockImplementationOnce(() =>
      Promise.reject(new Error('Service unavailable'))
    );
    renderPanel();
    openSettings();
    fireEvent.click(resetButton());
    fireEvent.click(resetButton());
    await waitFor(() => expect(fakePaperApi.resetAccount).toHaveBeenCalledTimes(1));

    // The modal stays open and says the reset failed; the button offers a retry
    const error = await waitFor(() => getByGuide(body(), 'acct-settings.error'));
    expect(error.textContent).toContain('Reset failed — your account is unchanged');
    expect(modal()).not.toBeNull();
    expect(resetButton().textContent).toBe('Reset account');
    // Nothing was wiped locally: the server's last state is still shown
    expect(balanceShown()).toBe('$8,000.00');
    expect(usePaperStore.getState().positions).toHaveLength(1);
    expect(usePaperStore.getState().pendingOrders).toHaveLength(1);
    expect(usePaperStore.getState().journal).toHaveLength(1);
    // Starting another reset, or reopening the modal, clears the error
    fireEvent.click(resetButton());
    expect(queryByGuide(body(), 'acct-settings.error')).toBeNull();
    quiet.mockRestore();
  });

  it('[8.13] should show "Resetting…" and keep the modal open while the reset is in flight', async () => {
    seedBusyAccount();
    let finish: (v: Awaited<ReturnType<typeof fakePaperApi.resetAccount>>) => void = () => {};
    fakePaperApi.resetAccount.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );
    renderPanel();
    openSettings();
    fireEvent.click(resetButton());
    fireEvent.click(resetButton());

    await waitFor(() => expect(resetButton().textContent).toBe('Resetting…'));
    expect((resetButton() as HTMLButtonElement).disabled).toBe(true);
    expect(modal()).not.toBeNull();
    // It can't be dismissed mid-request, or a failure would go unseen (review #172)
    expect((getByGuide(body(), 'acct-settings.close') as HTMLButtonElement).disabled).toBe(true);
    expect((getByGuide(body(), 'acct-settings.done') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByGuide(body(), 'acct-settings.close'));
    fireEvent.click(getByGuide(body(), 'acct-settings.done'));
    fireEvent.click(getByGuide(body(), 'acct-settings.backdrop'));
    expect(modal()).not.toBeNull();

    await act(async () => {
      finish({
        result: true,
        delta: await fakeDelta({
          reset: true,
          account: {
            balance: '10000',
            realizedPnl: '0',
            leverage: 1,
            symbolLeverage: {},
            version: 4,
          },
        }),
      });
    });
    await waitFor(() => expect(modal()).toBeNull());
  });
});

// ─── Section 7 — Order History tab (SC-7-2 … SC-7-5) ─────────────────────────
// The records themselves (what the engine writes for each outcome, SC-7-1) are tested in
// apps/server/src/trading/engine/__tests__/actions.test.ts "Section 7 — Order History records".

describe('Section 7 — Order History tab', () => {
  const body = () => document.body;
  const tab = (key: string) => getByGuide(body(), 'account.tab', key);
  const badge = (key: string) => queryByGuide(body(), 'account.tab.badge', key);
  const subtab = (key: string) => getByGuide(body(), 'orders.subtab', key);
  const count = (key: string) => queryByGuide(body(), 'orders.subtab.count', key)?.textContent;
  const historyRows = () => body().querySelectorAll('[data-guide="order-history.row"]');
  const orderRows = () => body().querySelectorAll('[data-guide="orders.row"]');

  const marketFill = (at = FIXTURE_NOW): HistoricalOrder => ({
    id: 'mkt-1',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'market',
    qty: 0.002,
    fillPrice: 50_000,
    status: 'filled',
    commission: 0.055,
    feeRate: 0.00055,
    feeAsset: 'USDT',
    isMaker: false,
    placingTime: at,
    closingTime: at,
  });
  const limitFill: HistoricalOrder = {
    id: 'lmt-1',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'limit',
    qty: 0.1,
    limitPrice: 49_000,
    fillPrice: 49_000,
    status: 'filled',
    commission: 0.98,
    feeRate: 0.0002,
    feeAsset: 'USDT',
    isMaker: true,
    placingTime: FIXTURE_NOW,
    closingTime: FIXTURE_NOW,
  };
  const stopCancel: HistoricalOrder = {
    id: 'stp-1',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'sell',
    type: 'stop',
    qty: 0.002,
    stopPrice: 40_000,
    status: 'cancelled',
    commission: 0,
    placingTime: FIXTURE_NOW,
    closingTime: FIXTURE_NOW,
  };
  const rejected: HistoricalOrder = {
    id: 'rej-1',
    category: 'linear',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'market',
    qty: 0.4,
    status: 'rejected',
    commission: 0,
    rejectionReason: 'Not enough funds to complete the order.',
    placingTime: FIXTURE_NOW,
    closingTime: FIXTURE_NOW,
  };

  /** A colour token as the browser reports an inline colour */
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── SC-7-2 Sub-tabs and counts ────────────────────────────────────────────

  it('[7.1.2][7.1.3] should count one market fill in All and Filled and leave Cancelled and Rejected empty', () => {
    seedState({ orders: [marketFill()] });
    renderPanel();
    expect(badge('orderhistory')?.textContent).toBe('1');
    fireEvent.click(tab('orderhistory'));
    expect(count('all')).toBe('1');
    expect(count('filled')).toBe('1');
    expect(count('cancelled')).toBeUndefined();
    expect(count('rejected')).toBeUndefined();
    expect(historyRows()).toHaveLength(1);
    expect(getByGuide(body(), 'order-history.row.type', 'mkt-1').textContent).toBe('Market');
    expect(getByGuide(body(), 'order-history.row.status', 'mkt-1').textContent).toBe('filled');

    fireEvent.click(subtab('filled'));
    expect(historyRows()).toHaveLength(1);
    fireEvent.click(subtab('cancelled'));
    expect(historyRows()).toHaveLength(0);
    expect(screen.getByText('No order history')).toBeTruthy();
    fireEvent.click(subtab('rejected'));
    expect(historyRows()).toHaveLength(0);
  });

  it('[7.1.4] should show a market fill on the Orders bench without an Orders badge when it has just filled', () => {
    seedState({ orders: [marketFill()] });
    renderPanel();
    // The top badge counts working orders only
    expect(badge('orders')).toBeNull();
    fireEvent.click(tab('orders'));
    expect(count('all')).toBe('1');
    expect(count('filled')).toBe('1');
    expect(count('working')).toBeUndefined();
    expect(count('inactive')).toBeUndefined();
    expect(getByGuide(body(), 'orders.row.status', 'mkt-1').textContent).toBe('Filled');
    fireEvent.click(subtab('working'));
    expect(orderRows()).toHaveLength(0);
    fireEvent.click(subtab('inactive'));
    expect(orderRows()).toHaveLength(0);
  });

  it('[7.1.4] should drop the row from Orders but keep it in Order History when the 2-minute bench time has passed', () => {
    vi.useFakeTimers();
    seedState({ orders: [marketFill(Date.now())] });
    renderPanel();
    fireEvent.click(tab('orders'));
    expect(orderRows()).toHaveLength(1);

    // BENCH_TTL_MS = 120,000; the bench clock ticks every 30 s
    act(() => vi.advanceTimersByTime(150_000));
    expect(orderRows()).toHaveLength(0);
    expect(count('all')).toBeUndefined();
    expect(count('filled')).toBeUndefined();

    fireEvent.click(tab('orderhistory'));
    expect(historyRows()).toHaveLength(1);
    expect(count('filled')).toBe('1');
  });

  it('[7.2.3] should show a filled limit in both Orders → Filled and Order History → Filled with no Orders badge', () => {
    seedState({ orders: [limitFill] });
    renderPanel();
    expect(badge('orders')).toBeNull();
    fireEvent.click(tab('orders'));
    fireEvent.click(subtab('filled'));
    expect(getByGuide(body(), 'orders.row', 'lmt-1')).toBeTruthy();

    fireEvent.click(tab('orderhistory'));
    fireEvent.click(subtab('filled'));
    expect(getByGuide(body(), 'order-history.row.type', 'lmt-1').textContent).toBe('Limit');
    expect(getByGuide(body(), 'order-history.row.fill-price', 'lmt-1').textContent).toBe('$49,000');
    expect(getByGuide(body(), 'order-history.row.commission', 'lmt-1').textContent).toBe(
      '0.9800 USDT0.02% maker'
    );
  });

  it('[7.3.2] should raise All to 2 and Cancelled to 1 when a cancelled order joins a fill', () => {
    seedState({ orders: [marketFill()] });
    renderPanel();
    fireEvent.click(tab('orderhistory'));
    expect(count('all')).toBe('1');
    act(() => {
      usePaperStore.setState((s) => ({ orders: [stopCancel, ...s.orders] }));
    });
    expect(count('all')).toBe('2');
    expect(count('cancelled')).toBe('1');
    expect(badge('orderhistory')?.textContent).toBe('2');
    fireEvent.click(subtab('cancelled'));
    expect(historyRows()).toHaveLength(1);
    expect(getByGuide(body(), 'order-history.row.status', 'stp-1').textContent).toBe('cancelled');
  });

  // ── SC-7-3 Rejections stay out of trade history ───────────────────────────

  it('[7.4.1][7.4.2] should list a rejection under Rejected with a ⚠ but keep it out of Balance History and Closed P&L', () => {
    seedState({ orders: [rejected, marketFill()] });
    usePaperStore.setState({
      balanceLog: [
        {
          id: 'be-open',
          time: FIXTURE_NOW,
          balanceBefore: 10_000,
          balanceAfter: 9_899.945,
          pnl: 0,
          action: 'Opened LONG BTCUSDT @ $50,000.00',
        },
      ],
    });
    renderPanel();
    fireEvent.click(tab('orderhistory'));
    expect(count('rejected')).toBe('1');
    fireEvent.click(subtab('rejected'));
    expect(historyRows()).toHaveLength(1);
    const status = getByGuide(body(), 'order-history.row.status', 'rej-1');
    expect(status.textContent).toBe('Rejected');
    expect(status.getAttribute('title')).toBe('Not enough funds to complete the order.');
    expect(status.querySelector('svg')).not.toBeNull(); // the ⚠ icon
    expect(status.style.color).toBe(rgb(color.red));

    fireEvent.click(tab('balancehistory'));
    const bh = body().querySelectorAll('[data-guide="balance-history.row"]');
    expect(bh).toHaveLength(1);
    expect(bh[0].textContent).toContain('Opened LONG BTCUSDT');
    expect(screen.queryByText(/reject/i)).toBeNull();

    fireEvent.click(tab('closedpnl'));
    expect(screen.queryAllByTestId('closed-pnl-row')).toHaveLength(0);
    expect(screen.getByText('No closed positions yet')).toBeTruthy();
  });

  // ── SC-7-4 Placing / Closing Time columns ─────────────────────────────────

  it('[7.5.1] should show Placing Time and Closing Time by default and let other columns be turned on', () => {
    seedState({ orders: [marketFill()] });
    renderPanel();
    fireEvent.click(tab('orderhistory'));
    const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers()).toEqual(expect.arrayContaining(['Placing Time', 'Closing Time']));
    expect(headers()).not.toContain('Order ID');

    fireEvent.click(getByGuide(body(), 'account.columns'));
    fireEvent.click(screen.getByRole('button', { name: 'Order ID' }));
    expect(headers()).toContain('Order ID');
  });

  it('[7.5.2] should hide Closing Time, keep it hidden after a reload and bring it back when toggled again', () => {
    seedState({ orders: [marketFill()] });
    const { unmount } = renderPanel();
    fireEvent.click(tab('orderhistory'));
    const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent);

    fireEvent.click(getByGuide(body(), 'account.columns'));
    fireEvent.click(screen.getByRole('button', { name: 'Closing Time' }));
    expect(headers()).not.toContain('Closing Time');
    expect(headers()).toContain('Placing Time');
    const saved = JSON.parse(localStorage.getItem('cd-paper-col-prefs') ?? '{}') as Record<
      string,
      string[]
    >;
    expect(saved.orderhistory).not.toContain('closingTime');

    // A reload: a fresh mount reads the same localStorage
    unmount();
    renderPanel();
    fireEvent.click(tab('orderhistory'));
    expect(headers()).not.toContain('Closing Time');

    fireEvent.click(getByGuide(body(), 'account.columns'));
    fireEvent.click(screen.getByRole('button', { name: 'Closing Time' }));
    expect(headers()).toContain('Closing Time');
    // Back in its own place, after Placing Time
    expect(headers().indexOf('Closing Time')).toBe(headers().indexOf('Placing Time') + 1);
  });

  // ── SC-7-5 Status colours ─────────────────────────────────────────────────

  it('[7.6.1][7.6.2] should colour Filled green and Cancelled muted when the three kinds of order are listed', () => {
    seedState({ orders: [stopCancel, limitFill, marketFill()] });
    renderPanel();
    fireEvent.click(tab('orderhistory'));
    expect(
      [...historyRows()].map((r) => [
        within(r as HTMLElement).getByText(/^(Market|Limit|Stop)$/).textContent,
        r.querySelector('[data-guide="order-history.row.status"]')?.textContent,
      ])
    ).toEqual([
      ['Stop', 'cancelled'],
      ['Limit', 'filled'],
      ['Market', 'filled'],
    ]);
    const colourOf = (id: string) =>
      getComputedStyle(getByGuide(body(), 'order-history.row.status', id)).color;
    expect(colourOf('mkt-1')).toBe(rgb(color.green));
    expect(colourOf('lmt-1')).toBe(rgb(color.green));
    expect(colourOf('stp-1')).toBe(rgb(color.muted));
  });
});

// ─── NEW-4-1 (4.23) — a journal note is plain text (web.md stored-XSS rule) ──

describe('Section 4 — journal notes render as plain text', () => {
  const PAYLOAD = '<img src=x onerror=alert(1)>';
  const SCRIPT = '<script>window.__pwned = true</script>';

  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'test-token' });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null });
  });

  it('[4.23] should show a stored note with HTML in it as literal text when the Journal tab opens', () => {
    usePaperStore.setState({
      journal: [
        { id: 'j-xss', time: FIXTURE_NOW, text: PAYLOAD, isUserNote: true },
        { id: 'j-script', time: FIXTURE_NOW - 1, text: SCRIPT, isUserNote: true },
      ] satisfies JournalEntry[],
    });
    renderPanel();
    fireEvent.click(getByGuide(document.body, 'account.tab', 'journal'));

    const entry = getByGuide(document.body, 'journal.entry', 'j-xss');
    expect(within(entry).getByText(PAYLOAD)).toBeTruthy();
    expect(within(getByGuide(document.body, 'journal.entry', 'j-script')).getByText(SCRIPT));
    // No element was created from the note: no <img>, no <script>, nothing ran
    expect(document.body.querySelector('img')).toBeNull();
    expect(document.body.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('[4.23] should send a typed note verbatim and show the saved note as literal text when it contains HTML', async () => {
    usePaperStore.setState({ version: 1 });
    fakePaperApi.addNote.mockImplementationOnce(async () => ({
      result: 'j-new',
      delta: await fakeDelta({
        journal: [{ id: 'j-new', time: Date.now(), text: PAYLOAD, isUserNote: true }],
      }),
    }));
    renderPanel();
    fireEvent.click(getByGuide(document.body, 'account.tab', 'journal'));
    fireEvent.click(getByGuide(document.body, 'journal.add-note'));
    // Re-query after each event: the framer-motion stub remounts motion.* children on render
    const noteInput = () => getByGuide(document.body, 'journal.note-input');
    fireEvent.change(noteInput(), { target: { value: PAYLOAD } });
    expect((noteInput() as HTMLInputElement).value).toBe(PAYLOAD);
    fireEvent.keyDown(noteInput(), { key: 'Enter' });

    await waitFor(() =>
      expect(queryByGuide(document.body, 'journal.entry', 'j-new')).not.toBeNull()
    );
    expect(fakePaperApi.addNote).toHaveBeenCalledWith({ text: PAYLOAD }, 'test-token');
    const entry = getByGuide(document.body, 'journal.entry', 'j-new');
    expect(within(entry).getByText(PAYLOAD)).toBeTruthy();
    expect(entry.querySelector('img')).toBeNull();
    expect(document.body.querySelector('img')).toBeNull();
  });
});
