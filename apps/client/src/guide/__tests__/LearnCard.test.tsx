import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let desktop = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { LearnCard } from '@/guide/LearnCard';
import { useTourStore } from '@/guide/tourStore';

const renderCard = () =>
  render(
    <MemoryRouter>
      <LearnCard />
    </MemoryRouter>
  );

describe('LearnCard', () => {
  beforeEach(() => {
    desktop = true;
    navigate.mockReset();
    useTourStore.getState().reset();
    useTourStore.getState().setProgress({ completed: [], cardDismissed: false });
  });
  afterEach(() => cleanup());

  it('should wait for the account’s progress, so it never flashes', () => {
    useTourStore.getState().reset();
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });

  it('should offer the primer to a new account', () => {
    renderCard();
    expect(screen.getByText('New to crypto?')).not.toBeNull();
    expect(screen.getByText('Start')).not.toBeNull();
  });

  it('should start the primer on the spot market and retire itself', () => {
    renderCard();
    fireEvent.click(screen.getByText('Start'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('primer');
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should dismiss with Not now and with the ✕', () => {
    renderCard();
    fireEvent.click(screen.getByText('Not now'));
    expect(useTourStore.getState().cardDismissed).toBe(true);
    expect(useTourStore.getState().activeId).toBeNull();

    cleanup();
    useTourStore.setState({ cardDismissed: false });
    renderCard();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should not show once dismissed, or while a tour runs', () => {
    useTourStore.setState({ cardDismissed: true });
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();

    cleanup();
    useTourStore.setState({ cardDismissed: false });
    act(() => useTourStore.getState().start('primer'));
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });

  it('should say "larger screen" on a phone and offer no Start', () => {
    desktop = false;
    renderCard();
    expect(screen.getByText(/larger screen/)).not.toBeNull();
    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.getByText('Not now')).not.toBeNull();
  });
});
