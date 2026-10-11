import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let desktop = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { LearnPanel } from '@/guide/LearnPanel';
import { useTourStore } from '@/guide/tourStore';

const renderPanel = () =>
  render(
    <MemoryRouter>
      <LearnPanel />
    </MemoryRouter>
  );

describe('LearnPanel', () => {
  beforeEach(() => {
    desktop = true;
    navigate.mockReset();
    useTourStore.getState().reset();
  });
  afterEach(() => cleanup());

  it('should render nothing until it is opened', () => {
    renderPanel();
    expect(screen.queryByText('Guided practice')).toBeNull();
  });

  it('should list the three tours, ticking the finished ones', () => {
    useTourStore.setState({ panelOpen: true, completed: { primer: true } });
    renderPanel();

    expect(screen.getByText('What you’re looking at')).not.toBeNull();
    expect(screen.getByText('Buy your first coin')).not.toBeNull();
    expect(screen.getByText('Sell it and read the result')).not.toBeNull();
    expect(screen.getByText('Repeat')).not.toBeNull();
    expect(screen.getAllByText('Start')).toHaveLength(2);
  });

  it('should run a tour again on any account: navigate, close, start', () => {
    useTourStore.setState({ panelOpen: true, completed: { 'buy-first-coin': true } });
    renderPanel();

    fireEvent.click(screen.getByText('Repeat'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
  });

  it('should close from its ✕', () => {
    useTourStore.setState({ panelOpen: true });
    renderPanel();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(useTourStore.getState().panelOpen).toBe(false);
  });

  it('should disable Start on a phone and say why', () => {
    desktop = false;
    useTourStore.setState({ panelOpen: true });
    renderPanel();

    for (const b of screen.getAllByText('Start')) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(/larger screen/)).not.toBeNull();
  });
});
