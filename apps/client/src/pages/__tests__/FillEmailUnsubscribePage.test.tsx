import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const unsubscribe = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  notificationsApi: { unsubscribe: async (...a: unknown[]) => unsubscribe(...a) },
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));

import { FillEmailUnsubscribePage } from '@/pages/FillEmailUnsubscribePage';

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <FillEmailUnsubscribePage />
    </MemoryRouter>
  );

describe('FillEmailUnsubscribePage', () => {
  beforeEach(() => {
    unsubscribe.mockReset();
  });
  afterEach(() => cleanup());

  it('should switch the e-mails off once, with the token from the link', async () => {
    unsubscribe.mockResolvedValue({ message: 'You will no longer get an e-mail.' });
    renderAt('/notifications/unsubscribe?token=abc.def');

    await waitFor(() => expect(screen.getByText('Done')).not.toBeNull());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith('abc.def');
    expect(screen.getByText('You will no longer get an e-mail.')).not.toBeNull();
  });

  it('should say so, and call nothing, when the link has no token', () => {
    renderAt('/notifications/unsubscribe');

    expect(screen.getByText('That did not work')).not.toBeNull();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('should show the server’s answer for a link that is not valid', async () => {
    unsubscribe.mockRejectedValue(new Error('This link is not valid.'));
    renderAt('/notifications/unsubscribe?token=forged');

    await waitFor(() => expect(screen.getByText('This link is not valid.')).not.toBeNull());
  });
});
