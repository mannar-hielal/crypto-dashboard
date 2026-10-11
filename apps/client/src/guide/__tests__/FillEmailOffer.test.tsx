import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const get = vi.fn();
const set = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  notificationsApi: { get: (...a: unknown[]) => get(...a), set: (...a: unknown[]) => set(...a) },
}));

let verified = true;
vi.mock('@/store/authStore', () => ({
  useAuthStore: (
    selector: (s: { accessToken: string; user: { emailVerifiedAt: string | null } }) => unknown
  ) =>
    selector({
      accessToken: 'tok',
      user: { emailVerifiedAt: verified ? '2026-10-01T00:00:00Z' : null },
    }),
}));

let pending = 1;
vi.mock('@/store/paperStore', () => ({
  usePaperStore: (selector: (s: { pendingOrders: unknown[] }) => unknown) =>
    selector({ pendingOrders: Array.from({ length: pending }, () => ({})) }),
}));

import { FillEmailOffer } from '@/guide/FillEmailOffer';
import { useTourStore } from '@/guide/tourStore';

describe('FillEmailOffer', () => {
  beforeEach(() => {
    verified = true;
    pending = 1;
    get.mockReset();
    set.mockReset();
    get.mockResolvedValue({ fillEmail: false });
    set.mockResolvedValue({ fillEmail: true });
    useTourStore.getState().reset();
    useTourStore.getState().setProgress({ completed: [], cardDismissed: true });
  });
  afterEach(() => cleanup());

  it('should offer it once the account has a resting order and has handled the welcome card', async () => {
    render(<FillEmailOffer />);
    await waitFor(() => expect(screen.getByText('Want an e-mail when it fills?')).not.toBeNull());
  });

  it.each([
    ['there is no resting order', () => (pending = 0)],
    ['the address is unverified', () => (verified = false)],
    [
      'the welcome card has not been handled yet',
      () => useTourStore.setState({ cardDismissed: false }),
    ],
    ['it was answered before', () => useTourStore.setState({ fillOfferDismissed: true })],
    ['a tour is running', () => useTourStore.getState().start('primer')],
  ])('should not show when %s', async (_label, arrange) => {
    arrange();
    render(<FillEmailOffer />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Want an e-mail when it fills?')).toBeNull();
  });

  it('should not ask when the e-mail is already on, or when it cannot tell', async () => {
    get.mockResolvedValue({ fillEmail: true });
    const { unmount } = render(<FillEmailOffer />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Want an e-mail when it fills?')).toBeNull();
    unmount();

    get.mockRejectedValue(new Error('offline'));
    render(<FillEmailOffer />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Want an e-mail when it fills?')).toBeNull();
  });

  it('should turn it on and retire the offer on "E-mail me"', async () => {
    render(<FillEmailOffer />);
    await waitFor(() => screen.getByText('E-mail me'));
    fireEvent.click(screen.getByText('E-mail me'));

    await waitFor(() => expect(useTourStore.getState().fillOfferDismissed).toBe(true));
    expect(set).toHaveBeenCalledWith({ fillEmail: true }, 'tok');
  });

  it('should keep the offer, and say why, when the server refuses', async () => {
    set.mockRejectedValue(new Error('Verify your e-mail address first'));
    render(<FillEmailOffer />);
    await waitFor(() => screen.getByText('E-mail me'));
    fireEvent.click(screen.getByText('E-mail me'));

    await waitFor(() =>
      expect(screen.getByText(/Verify your e-mail address first/)).not.toBeNull()
    );
    expect(useTourStore.getState().fillOfferDismissed).toBe(false);
  });

  it('should retire the offer on "No thanks" without changing the setting', async () => {
    render(<FillEmailOffer />);
    await waitFor(() => screen.getByText('No thanks'));
    fireEvent.click(screen.getByText('No thanks'));

    expect(useTourStore.getState().fillOfferDismissed).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });
});
