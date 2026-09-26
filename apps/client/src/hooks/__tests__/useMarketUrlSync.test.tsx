/**
 * useMarketUrlSync (BP-2): the dashboard URL and the active pane's market stay in step, both
 * ways, plus the one-time D7 move to USDT Perpetual.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router';
import { handoffMarket, useMarketUrlSync } from '../useMarketUrlSync';
import { useLayoutStore } from '@/store/layoutStore';
import { usePaperStore } from '@/store/paperStore';
import { emptyState } from '@/test/fakePaperApi';
import { DashboardRedirect } from '@/pages/DashboardPage';

const navigateRef: { current: ReturnType<typeof useNavigate> | null } = { current: null };

/** Stands in for DashboardPage: runs the hook and shows where the router is. */
function Probe() {
  useMarketUrlSync();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const type = useNavigationType();
  return (
    <p data-testid="where" data-type={type}>
      {location.pathname}
    </p>
  );
}

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/dashboard/spot/:base/:quote" element={<Probe />} />
        <Route path="/dashboard/usdt/:symbol" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

const where = () => screen.getByTestId('where').textContent;
const pane = () => useLayoutStore.getState().panes[useLayoutStore.getState().activePane];

beforeEach(() => {
  cleanup();
  usePaperStore.getState().clear();
  useLayoutStore.setState((s) => ({
    activePane: 0,
    marketHandoffDone: true,
    syncOptions: { ...s.syncOptions, symbol: false },
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot', symbol: 'BTCUSDT' } : p)),
  }));
});

describe('URL → store', () => {
  it('a deep link applies its market to the active pane (the URL wins over the saved layout)', () => {
    renderAt('/dashboard/usdt/ETHUSDT');
    expect(pane()).toMatchObject({ category: 'linear', symbol: 'ETHUSDT' });
  });

  it('a non-canonical URL is replaced by the canonical one', async () => {
    renderAt('/dashboard/spot/sol/usdt');
    await waitFor(() => expect(where()).toBe('/dashboard/spot/SOL/USDT'));
    expect(pane()).toMatchObject({ category: 'spot', symbol: 'SOLUSDT' });
  });
});

describe('store → URL', () => {
  it('switching market or symbol pushes a history entry; back returns to the previous market', () => {
    renderAt('/dashboard/spot/BTC/USDT');
    act(() => useLayoutStore.getState().setPaneMarket(0, 'linear', 'BTCUSDT'));
    expect(where()).toBe('/dashboard/usdt/BTCUSDT');
    expect(screen.getByTestId('where').dataset.type).toBe('PUSH');

    act(() => navigateRef.current!(-1));
    expect(where()).toBe('/dashboard/spot/BTC/USDT');
    expect(pane()).toMatchObject({ category: 'spot', symbol: 'BTCUSDT' });
  });

  it('focusing another pane replaces the entry instead of pushing one', () => {
    useLayoutStore.setState((s) => ({
      panes: s.panes.map((p, i) => (i === 1 ? { ...p, category: 'linear', symbol: 'ETHUSDT' } : p)),
    }));
    renderAt('/dashboard/spot/BTC/USDT');
    act(() => useLayoutStore.getState().setActivePane(1));
    expect(where()).toBe('/dashboard/usdt/ETHUSDT');
    expect(screen.getByTestId('where').dataset.type).toBe('REPLACE');
  });

  it('a change unrelated to the market (an indicator) does not navigate', () => {
    renderAt('/dashboard/spot/BTC/USDT');
    act(() => useLayoutStore.getState().setPaneChartType(0, 'heikinAshi'));
    expect(screen.getByTestId('where').dataset.type).toBe('POP');
  });
});

describe('D7 — the one-time move to USDT Perpetual', () => {
  const position = (symbol: string, openedAt: number) => ({
    id: symbol,
    category: 'linear' as const,
    symbol,
    side: 'long' as const,
    quantity: '0.1',
    entryPrice: '100',
    entryUsdtAmount: '10',
    leverage: 1,
    marginMode: 'isolated' as const,
    entryFee: '0',
    closeFeeReserve: '0',
    openedAt,
  });

  it('from bare /dashboard, a pre-BP-2 account lands on its newest position’s market', () => {
    useLayoutStore.setState({ marketHandoffDone: false });
    renderAt({ pathname: '/dashboard/spot/BTC/USDT', state: { fromDefault: true } });
    act(() =>
      usePaperStore
        .getState()
        .hydrate(emptyState({ positions: [position('ETHUSDT', 1), position('SOLUSDT', 2)] }))
    );
    expect(where()).toBe('/dashboard/usdt/SOLUSDT');
    expect(pane()).toMatchObject({ category: 'linear', symbol: 'SOLUSDT' });
    expect(useLayoutStore.getState().marketHandoffDone).toBe(true);
  });

  it('an explicit market URL is respected: no move, but the hand-off is spent', () => {
    useLayoutStore.setState({ marketHandoffDone: false });
    renderAt('/dashboard/spot/BTC/USDT');
    act(() =>
      usePaperStore.getState().hydrate(emptyState({ positions: [position('ETHUSDT', 1)] }))
    );
    expect(where()).toBe('/dashboard/spot/BTC/USDT');
    expect(useLayoutStore.getState().marketHandoffDone).toBe(true);
  });

  it('never runs for a new layout (new users start on Spot)', () => {
    renderAt({ pathname: '/dashboard/spot/BTC/USDT', state: { fromDefault: true } });
    act(() =>
      usePaperStore.getState().hydrate(emptyState({ positions: [position('ETHUSDT', 1)] }))
    );
    expect(where()).toBe('/dashboard/spot/BTC/USDT');
  });

  it('handoffMarket prefers the newest position, then the newest perpetual order', () => {
    expect(handoffMarket({ positions: [], pendingOrders: [] })).toBeNull();
    expect(
      handoffMarket({
        positions: [],
        pendingOrders: [
          { category: 'spot', symbol: 'BTCUSDT', placedAt: 9 },
          { category: 'linear', symbol: 'XRPUSDT', placedAt: 1 },
        ],
      })
    ).toEqual({ category: 'linear', symbol: 'XRPUSDT' });
  });
});

describe('DashboardRedirect', () => {
  it('bare /dashboard goes to the active pane’s market, marked for the hand-off', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route path="/dashboard/spot/:base/:quote" element={<StateProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('state').textContent).toBe(
      '/dashboard/spot/BTC/USDT {"fromDefault":true}'
    );
  });
});

function StateProbe() {
  const location = useLocation();
  return (
    <p data-testid="state">
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  );
}
