/**
 * Assets → TP / SL on a coin held (SpotExitsModal, APP_LOG Bybit Parity BP-2) — T2 · RTL.
 *
 * Case 14.6.7 (SC-14.6-7): the modal opens from the Assets row with the free quantity, sends the
 * chosen quantity and prices to the server as one OCO pair, and the lock comes back in the
 * server's delta. The lock maths itself is tested against the engine in
 * apps/server/src/trading/engine/__tests__/spot.test.ts.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OrderAccountManagementPanel } from '../OrderAccountManagementPanel';
import { usePaperStore } from '@/store/paperStore';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useAuthStore } from '@/store/authStore';
import { fakeDelta, fakePaperApi, resetFakePaperApi } from '@/test/fakePaperApi';
import { getByGuide } from '@/test/guide';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// ─── Setup ────────────────────────────────────────────────────────────────────

/** What SC-14.6-1 leaves behind: 0.1 BTC bought at 50,000, 0.1% fee taken in BTC */
const HELD = { coin: 'BTC', free: 0.0999, locked: 0, avgCost: 50_050.05 };

function renderOnSpot() {
  return render(
    <OrderAccountManagementPanel
      size="open"
      onSizeChange={vi.fn()}
      isMaximized={false}
      onToggleMaximize={vi.fn()}
    />
  );
}

function openExits() {
  fireEvent.click(getByGuide(document.body, 'assets.row.tpsl', 'BTC'));
  return screen.getByRole('dialog', { name: 'TP / SL — BTC' });
}

beforeEach(() => {
  resetFakePaperApi();
  usePaperStore.getState().clear();
  usePaperStore.setState({ version: 7, balance: 5_000, spotBalances: [HELD] });
  useAuthStore.setState({ accessToken: 'test-token' });
  paneStores[0].setState({ latestPrice: 50_000, isConnected: true, bid: 49_999.9, ask: 50_000 });
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot', symbol: 'BTCUSDT' } : p)),
  }));
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ accessToken: null });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SpotExitsModal — Assets → TP / SL (14.6.7)', () => {
  it('[14.6.7] should open with the free quantity when TP/SL is clicked on a coin held', () => {
    renderOnSpot();
    const dialog = openExits();
    expect(within(dialog).getByText('Quantity (available 0.0999 BTC)')).toBeTruthy();
    expect((within(dialog).getByLabelText('Quantity') as HTMLInputElement).value).toBe('0.0999');
    expect((within(dialog).getByLabelText('Take profit price') as HTMLInputElement).value).toBe('');
  });

  it('[14.6.7] should send the chosen quantity and TP as one OCO request and show the lock when confirmed', async () => {
    fakePaperApi.placeSpotExits.mockImplementationOnce(async () => ({
      result: 'oco-1',
      delta: await fakeDelta({
        spotUpsert: [{ coin: 'BTC', free: '0.0499', locked: '0.05', avgCost: '50050.05' }],
      }),
    }));
    renderOnSpot();
    const dialog = openExits();
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '0.05' } });
    fireEvent.change(within(dialog).getByLabelText('Take profit price'), {
      target: { value: '52000' },
    });
    fireEvent.click(getByGuide(document.body, 'spot-exits.confirm'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fakePaperApi.placeSpotExits).toHaveBeenCalledTimes(1);
    expect(fakePaperApi.placeSpotExits).toHaveBeenCalledWith(
      { symbol: 'BTCUSDT', qty: '0.05', takeProfit: '52000' },
      'test-token'
    );
    // The server's answer locks the quantity behind the pair
    expect(getByGuide(document.body, 'assets.row.locked', 'BTC').textContent).toBe('0.05');
    expect(getByGuide(document.body, 'assets.row.free', 'BTC').textContent).toBe('0.0499');
  });

  it('[14.6.7] should send both legs when a TP and an SL are set', async () => {
    renderOnSpot();
    const dialog = openExits();
    fireEvent.change(within(dialog).getByLabelText('Take profit price'), {
      target: { value: '52000' },
    });
    fireEvent.change(within(dialog).getByLabelText('Stop loss price'), {
      target: { value: '48000' },
    });
    fireEvent.click(getByGuide(document.body, 'spot-exits.confirm'));
    await waitFor(() => expect(fakePaperApi.placeSpotExits).toHaveBeenCalledTimes(1));
    expect(fakePaperApi.placeSpotExits).toHaveBeenCalledWith(
      { symbol: 'BTCUSDT', qty: '0.0999', takeProfit: '52000', stopLoss: '48000' },
      'test-token'
    );
  });

  it('[14.6.7] should refuse without asking the server when the quantity is more than the free balance', () => {
    renderOnSpot();
    const dialog = openExits();
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '0.1' } });
    fireEvent.change(within(dialog).getByLabelText('Take profit price'), {
      target: { value: '52000' },
    });
    fireEvent.click(getByGuide(document.body, 'spot-exits.confirm'));
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a quantity up to 0.0999 BTC');
    expect(fakePaperApi.placeSpotExits).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('[14.6.7] should ask for a price without asking the server when neither TP nor SL is set', () => {
    renderOnSpot();
    const dialog = openExits();
    fireEvent.click(getByGuide(document.body, 'spot-exits.confirm'));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Set a take-profit, a stop-loss or both'
    );
    expect(fakePaperApi.placeSpotExits).not.toHaveBeenCalled();
  });

  it('[14.6.7] should keep the modal open with the server’s reason when the server refuses', async () => {
    fakePaperApi.placeSpotExits.mockImplementationOnce(() =>
      Promise.reject(new Error('TP price must be above the last price'))
    );
    renderOnSpot();
    const dialog = openExits();
    fireEvent.change(within(dialog).getByLabelText('Take profit price'), {
      target: { value: '40000' },
    });
    fireEvent.click(getByGuide(document.body, 'spot-exits.confirm'));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'TP price must be above the last price'
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(getByGuide(document.body, 'assets.row.locked', 'BTC').textContent).toBe('0');
  });
});
