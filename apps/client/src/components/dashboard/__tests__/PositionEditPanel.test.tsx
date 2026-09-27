/**
 * PositionEditPanel — BP-5 B: per-leg trigger source (Last / Mark / Index), the O9 side check
 * against the leg's live price (not the entry), the amber warning for a stop-loss beyond the
 * liquidation price, and a server refusal kept in the panel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { PositionEditPanel } from '../PositionEditPanel';
import { usePaperStore, type Position } from '@/store/paperStore';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';

const pos: Position = {
  id: 'p1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'long',
  quantity: 0.1,
  entryPrice: 50_000,
  entryUsdtAmount: 500,
  leverage: 10,
  entryFee: 2.75,
  closeFeeReserve: 2.475,
  extraMargin: 0,
  liqPrice: 45_148.99,
  bustPrice: 45_000,
  positionIM: 502.475,
  positionMM: 18.975,
  cumFunding: 0,
  openedAt: 1_800_000_000_000,
};

const realUpdate = usePaperStore.getState().updatePositionExits;

beforeEach(() => {
  useLayoutStore.setState((s) => ({
    activePane: 0,
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbol: 'BTCUSDT', category: 'linear' } : p)),
  }));
  // The price has moved up since the entry: last 52,000, mark 51,000
  paneStores[0].setState({ latestPrice: 52_000, markPrice: 51_000 });
  usePaperStore.setState({ positions: [pos] });
});

afterEach(() => {
  cleanup();
  usePaperStore.setState({ updatePositionExits: realUpdate });
  usePaperStore.getState().clear();
});

function enableSl(value: string) {
  fireEvent.click(screen.getByRole('switch', { name: 'Enable stop loss' }));
  fireEvent.change(screen.getAllByRole('spinbutton').at(-1) as HTMLElement, { target: { value } });
}

describe('PositionEditPanel (BP-5 B)', () => {
  it('checks a new stop-loss against the price it triggers on, not the entry', () => {
    render(<PositionEditPanel positionId="p1" onClose={vi.fn()} />);
    // 51,500 is above the entry but below the last price: fine on Last…
    enableSl('51500');
    expect(screen.queryByText(/must be below/)).toBeNull();
    // …but above the mark (51,000): refused on Mark
    fireEvent.change(screen.getByLabelText('Stop loss trigger price'), {
      target: { value: 'MarkPrice' },
    });
    expect(screen.getByText(/Stop Loss must be below the mark price \(\$51,000/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('warns (amber, not blocking) when the stop-loss is beyond the liquidation price', () => {
    render(<PositionEditPanel positionId="p1" onClose={vi.fn()} />);
    enableSl('44000');
    expect(screen.getByText(/beyond the liquidation price \(\$45,148\.99\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('sends the trigger sources and keeps a server refusal in the panel', async () => {
    const update = vi.fn(
      async () =>
        'StopLoss:48000 set for Buy position should be lower than base_price:47000??IndexPrice'
    );
    usePaperStore.setState({ updatePositionExits: update });
    const onClose = vi.fn();
    render(<PositionEditPanel positionId="p1" onClose={onClose} />);
    enableSl('48000');
    fireEvent.change(screen.getByLabelText('Stop loss trigger price'), {
      target: { value: 'IndexPrice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('p1', null, 48_000, {
        tpTriggerBy: 'LastPrice',
        slTriggerBy: 'IndexPrice',
      })
    );
    expect((await screen.findByRole('alert')).textContent).toContain('should be lower');
    expect(onClose).not.toHaveBeenCalled();
  });
});
