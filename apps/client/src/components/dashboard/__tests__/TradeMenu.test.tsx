/**
 * Header "Trade" market menu (BP-2): switches the active pane's market; keyboard accessible.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TradeMenu } from '../TradeMenu';
import { useLayoutStore } from '@/store/layoutStore';

const trigger = () => screen.getByRole('button', { name: 'Trade' });

beforeEach(() => {
  useLayoutStore.setState((s) => ({
    activePane: 0,
    syncOptions: { ...s.syncOptions, symbol: false },
    panes: s.panes.map((p, i) => (i === 0 ? { ...p, category: 'spot', symbol: 'ETHUSDT' } : p)),
  }));
});
afterEach(cleanup);

describe('TradeMenu', () => {
  it('starts closed and reports it (aria-expanded)', () => {
    render(<TradeMenu />);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Markets' })).toBeNull();
  });

  it('lists Spot and USDT Perpetual with their descriptions; the current one is marked', () => {
    render(<TradeMenu />);
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const spot = screen.getByRole('button', { name: /^Spot/ });
    const perp = screen.getByRole('button', { name: /^USDT Perpetual/ });
    expect(spot.getAttribute('aria-current')).toBe('true');
    expect(perp.getAttribute('aria-current')).toBeNull();
    expect(perp.textContent).toContain('Go long or short with up to 10× leverage.');
  });

  it('choosing a market switches the active pane and keeps its symbol', () => {
    render(<TradeMenu />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: /^USDT Perpetual/ }));
    expect(useLayoutStore.getState().panes[0]).toMatchObject({
      category: 'linear',
      symbol: 'ETHUSDT',
    });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('keyboard: ArrowDown opens on the current market, arrows move, Escape closes to the trigger', () => {
    render(<TradeMenu />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const spot = screen.getByRole('button', { name: /^Spot/ });
    const perp = screen.getByRole('button', { name: /^USDT Perpetual/ });
    expect(document.activeElement).toBe(spot);
    fireEvent.keyDown(spot, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(perp);
    fireEvent.keyDown(perp, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(spot); // wraps
    fireEvent.keyDown(spot, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Markets' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
