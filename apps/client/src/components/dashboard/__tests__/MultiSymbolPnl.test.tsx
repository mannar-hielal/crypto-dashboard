/**
 * Multi-symbol PnL (T2 · RTL) — docs/TRADING_TEST_PLAN.md Section 11.
 *
 * Two USDT Perpetual panes (2h: pane 0 BTCUSDT, pane 1 ETHUSDT) with the order form and the
 * account panel, as on the dashboard. The server is `fakePaperApi`, priced per symbol here: a
 * market buy opens at that symbol's ask. A position in a symbol no pane is focused on (or no pane
 * shows at all) is valued at the last known mark — seeded the way the server's `prices` push does
 * it (`applyPrices` → `setLastKnownMarkPrice`, linear only, BP-3).
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PaperActionResponse, PlaceOrderRequest } from '@crypto-dashboard/sdk';
import { MultiChartArea } from '../MultiChartArea';
import { TradingPanel } from '../TradingPanel';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
import { useLayoutStore } from '@/store/layoutStore';
import { lastKnownMarkPrices, lastKnownPrices, paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { useAuthStore } from '@/store/authStore';
import { emptyState, fakeDelta, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';
import { getByGuide, queryByGuide } from '@/test/guide';
import { guideSelector } from '@/lib/guideAnchors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

const FRAMER_PROPS = vi.hoisted(
  () =>
    new Set([
      'whileHover',
      'whileTap',
      'layoutId',
      'layout',
      'initial',
      'animate',
      'exit',
      'transition',
      'variants',
      'custom',
    ])
);

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            { children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>,
            ref: React.Ref<HTMLElement>
          ) => {
            // Drop framer-only props so they don't reach the DOM
            const rest = Object.fromEntries(
              Object.entries(props).filter(([k]) => !FRAMER_PROPS.has(k))
            );
            return React.createElement(tag, { ...rest, ref }, children);
          }
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

// lightweight-charts needs a canvas; the chart itself plays no part here
vi.mock('@/components/dashboard/ChartPanel', () => ({
  ChartPanel: () => <div data-testid="chart-mock" />,
}));

// ─── Fake server, priced per symbol ──────────────────────────────────────────

/** The pane store showing `symbol` (its quotes are what the server fills at here). */
function paneFor(symbol: string) {
  const i = useLayoutStore.getState().panes.findIndex((p) => p.symbol === symbol);
  return paneStores[i as 0 | 1 | 2 | 3].getState();
}

let seq = 0;

async function placeAtAsk(body: PlaceOrderRequest): Promise<PaperActionResponse<string | null>> {
  const id = `pos-${body.symbol}-${++seq}`;
  const price = paneFor(body.symbol).ask ?? 0;
  const qty = Number(body.qty);
  return {
    result: id,
    delta: await fakeDelta({
      positionsUpsert: [
        {
          id,
          category: 'linear',
          symbol: body.symbol,
          side: body.side === 'buy' ? 'long' : 'short',
          quantity: String(qty),
          entryPrice: String(price),
          entryUsdtAmount: String(qty * price),
          leverage: 1,
          marginMode: 'isolated',
          entryFee: '0',
          closeFeeReserve: '0',
          extraMargin: '0',
          liqPrice: '0',
          bustPrice: '0',
          positionMM: '0',
          mmr: '0.0033',
          positionIM: String(qty * price),
          openedAt: Date.now(),
        },
      ],
    }),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The order form, remounted per pane and market as DashboardPage does. */
function OrderForm() {
  const activePane = useLayoutStore((s) => s.activePane);
  const { category, symbol } = useLayoutStore((s) => s.panes[s.activePane]);
  return <TradingPanel key={`${activePane}-${category}-${symbol}`} onClose={vi.fn()} />;
}

function renderDashboard() {
  return render(
    <>
      <MultiChartArea />
      <OrderForm />
      <OrderAccountManagementPanel
        size="open"
        onSizeChange={vi.fn()}
        isMaximized={false}
        onToggleMaximize={vi.fn()}
      />
    </>
  );
}

const body = () => document.body;

function clickPane(index: number) {
  fireEvent.click(getByGuide(body(), 'pane.chart', String(index)));
}

/** The order form's header: the symbol it trades. */
function formSymbol(): string {
  const form = getByGuide(body(), 'trade.submit').closest('aside');
  return form?.querySelector('span')?.textContent ?? '';
}

/** Market buy `qty` coins of the active pane's symbol. */
async function marketBuy(qty: string) {
  const before = usePaperStore.getState().positions.length;
  fireEvent.click(getByGuide(body(), 'trade.amount-unit', 'coin'));
  fireEvent.change(getByGuide(body(), 'trade.amount'), { target: { value: qty } });
  fireEvent.click(getByGuide(body(), 'trade.submit'));
  await waitFor(() => expect(usePaperStore.getState().positions).toHaveLength(before + 1));
}

function positionRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(guideSelector('positions.row')));
}

function row(symbol: string): HTMLElement {
  return getByGuide(body(), 'positions.row', `linear:${symbol}`);
}

/** A server `prices` push for one USDT Perpetual symbol. */
function pushMark(symbol: string, mark: number) {
  act(() => {
    usePaperStore.getState().applyPrices([{ category: 'linear', symbol, last: mark, mark }]);
  });
}

/** Steps 11.1–11.3: BTC on pane 0, ETH on pane 1 — 0.01 BTC at 50,010, 0.1 ETH at 3,000. */
async function openBtcAndEth() {
  renderDashboard();
  expect(formSymbol()).toBe('BTCUSDT');
  await marketBuy('0.01');
  clickPane(1);
  expect(formSymbol()).toBe('ETHUSDT');
  await marketBuy('0.1');
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  usePaperStore.getState().clear();
  usePaperStore.getState().hydrate(emptyState());
  useAuthStore.setState({ accessToken: 'test-token' });
  resetFakePaperApi();
  fakePaperApi.placeOrder.mockImplementation(placeAtAsk);
  lastKnownPrices.clear();
  lastKnownMarkPrices.clear();
  for (const store of paneStores) store.getState().reset();

  useLayoutStore.setState((s) => ({
    layout: '2h',
    activePane: 0,
    panes: s.panes.map((p, i) =>
      i === 0
        ? { ...p, symbol: 'BTCUSDT', category: 'linear' }
        : i === 1
          ? { ...p, symbol: 'ETHUSDT', category: 'linear' }
          : p
    ),
  }));
  paneStores[0].setState({ latestPrice: 50_000, bid: 49_990, ask: 50_010, isConnected: true });
  paneStores[1].setState({ latestPrice: 3_000, bid: 2_999.9, ask: 3_000, isConnected: true });
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Section 11 — two symbols, two panes, two positions (SC-11-1)', () => {
  it('should trade the active pane and list one row per symbol (11.1, 11.2, 11.3)', async () => {
    await openBtcAndEth();

    expect(fakePaperApi.placeOrder.mock.calls.map(([b]) => [b.symbol, b.category])).toEqual([
      ['BTCUSDT', 'linear'],
      ['ETHUSDT', 'linear'],
    ]);
    expect(
      positionRows()
        .map((r) => r.getAttribute('data-guide-key'))
        .sort()
    ).toEqual(['linear:BTCUSDT', 'linear:ETHUSDT']);
  });
});

describe('Section 11 — a symbol that is not active keeps a live mark (SC-11-2)', () => {
  it('should value the ETH row at its own mark while BTC is the active pane (11.4, 11.5)', async () => {
    await openBtcAndEth();
    clickPane(0);
    expect(formSymbol()).toBe('BTCUSDT');

    pushMark('ETHUSDT', 3_100);

    const eth = row('ETHUSDT');
    expect(getByGuide(eth, 'positions.row.mark').textContent).toBe('$3,100');
    // (3,100 − 3,000) × 0.1
    expect(getByGuide(eth, 'positions.row.pnl').textContent).toBe('+10.00');

    pushMark('ETHUSDT', 2_950);
    expect(getByGuide(row('ETHUSDT'), 'positions.row.pnl').textContent).toBe('-5.00');
  });

  it('should keep moving the ETH row after its pane closes (11.6)', async () => {
    await openBtcAndEth();
    clickPane(0);

    // Back to one pane: usePaneFeeds closes pane 1's feed and resets its store
    act(() => {
      useLayoutStore.getState().setLayout('1');
      paneStores[1].getState().reset();
    });
    expect(queryByGuide(body(), 'pane', '1')).toBeNull();

    pushMark('ETHUSDT', 3_200);

    expect(getByGuide(row('ETHUSDT'), 'positions.row.mark').textContent).toBe('$3,200');
    expect(getByGuide(row('ETHUSDT'), 'positions.row.pnl').textContent).toBe('+20.00');
  });

  it('should add both rows into the Unrealized P&L summary (11.7)', async () => {
    await openBtcAndEth();
    clickPane(0);

    // BTC: the active pane's live mark, (50,110 − 50,010) × 0.01 = +1.00
    act(() => paneStores[0].setState({ markPrice: 50_110 }));
    // ETH: the last known mark, (3,100 − 3,000) × 0.1 = +10.00
    pushMark('ETHUSDT', 3_100);

    expect(getByGuide(row('BTCUSDT'), 'positions.row.pnl').textContent).toBe('+1.00');
    expect(getByGuide(row('ETHUSDT'), 'positions.row.pnl').textContent).toBe('+10.00');
    expect(getByGuide(body(), 'account.summary.upnl').textContent).toBe('+$11.00');
  });
});

describe('Section 11 — close a symbol that is not active (SC-11-3)', () => {
  it('should close the ETH position by its own id and list it in Closed P&L (11.8)', async () => {
    await openBtcAndEth();
    clickPane(0);
    pushMark('ETHUSDT', 3_200);
    const ethId = usePaperStore.getState().positions.find((p) => p.symbol === 'ETHUSDT')!.id;

    fakePaperApi.closePosition.mockImplementationOnce(async () => ({
      result: '20',
      delta: await fakeDelta({
        positionsRemove: [ethId],
        trades: [
          {
            id: 'trade-eth',
            category: 'linear',
            symbol: 'ETHUSDT',
            side: 'long',
            quantity: '0.1',
            entryPrice: '3000',
            exitPrice: '3200',
            pnl: '20',
            openedAt: Date.now() - 60_000,
            closedAt: Date.now(),
          },
        ],
      }),
    }));

    fireEvent.click(getByGuide(row('ETHUSDT'), 'positions.row.close'));

    await waitFor(() => expect(positionRows()).toHaveLength(1));
    expect(fakePaperApi.closePosition).toHaveBeenCalledWith(ethId, 'test-token');
    expect(positionRows()[0].getAttribute('data-guide-key')).toBe('linear:BTCUSDT');
    // BTC stays the active pane throughout
    expect(formSymbol()).toBe('BTCUSDT');

    fireEvent.click(screen.getByRole('button', { name: /Closed P&L/ }));
    const closed = getByGuide(body(), 'closed-pnl.row', 'trade-eth');
    expect(closed.textContent).toContain('ETHUSDT');
    expect(closed.textContent).toContain('3,200');
    expect(getByGuide(closed, 'closed-pnl.value').textContent).toBe('+20.0000 USDT');
  });
});
