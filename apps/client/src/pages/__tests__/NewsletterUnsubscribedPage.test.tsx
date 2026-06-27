import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

const mockUnsubscribe = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  newsletterApi: {
    unsubscribe: (...args: unknown[]) => mockUnsubscribe(...args),
  },
}));

const mockSearchParams = vi.fn();
vi.mock('react-router', () => ({
  useSearchParams: () => [mockSearchParams()],
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

vi.mock('@/components/SeoHead', () => ({
  SeoHead: () => null,
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          ({ children, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) =>
            React.createElement(tag as string, { ...props, ref }, children as React.ReactNode)
        ),
    }
  ),
}));

import { NewsletterUnsubscribedPage } from '@/pages/NewsletterUnsubscribedPage';

describe('NewsletterUnsubscribedPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('missing token', () => {
    it('shows error when no token is in URL', () => {
      mockSearchParams.mockReturnValue({ get: () => null });
      render(React.createElement(NewsletterUnsubscribedPage));
      expect(screen.getByText(/missing token/i)).not.toBeNull();
    });

    it('does not call API when token is missing', () => {
      mockSearchParams.mockReturnValue({ get: () => null });
      render(React.createElement(NewsletterUnsubscribedPage));
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows loading state while unsubscribing', () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockUnsubscribe.mockReturnValue(new Promise(() => {}));
      render(React.createElement(NewsletterUnsubscribedPage));
      expect(screen.getByText(/unsubscribing/i)).not.toBeNull();
    });
  });

  describe('success state', () => {
    it('shows success message after unsubscribing', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockUnsubscribe.mockResolvedValue({ message: 'You have been unsubscribed.' });
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(screen.getByText('Unsubscribed')).not.toBeNull();
      });
    });

    it('displays the API response message', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockUnsubscribe.mockResolvedValue({ message: 'You have been unsubscribed.' });
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(screen.getByText(/you have been unsubscribed/i)).not.toBeNull();
      });
    });

    it('shows back to homepage link on success', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockUnsubscribe.mockResolvedValue({ message: 'Done' });
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(screen.getByText(/back to homepage/i)).not.toBeNull();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when unsubscribe fails', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'invalid-token' });
      mockUnsubscribe.mockRejectedValue(new Error('Invalid link.'));
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).not.toBeNull();
        expect(screen.getByText(/invalid link/i)).not.toBeNull();
      });
    });

    it('shows generic error when API rejects with non-Error', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'bad-token' });
      mockUnsubscribe.mockRejectedValue('server error');
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /something went wrong/i })).not.toBeNull();
      });
    });

    it('calls unsubscribe with the token from URL params', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'the-token' });
      mockUnsubscribe.mockResolvedValue({ message: 'OK' });
      render(React.createElement(NewsletterUnsubscribedPage));

      await waitFor(() => {
        expect(mockUnsubscribe).toHaveBeenCalledWith('the-token');
      });
    });
  });
});
