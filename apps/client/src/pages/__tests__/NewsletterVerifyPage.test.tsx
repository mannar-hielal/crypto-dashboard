import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

const mockVerify = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  newsletterApi: {
    verify: (...args: unknown[]) => mockVerify(...args),
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

import { NewsletterVerifyPage } from '@/pages/NewsletterVerifyPage';

describe('NewsletterVerifyPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('missing token', () => {
    it('shows error when no token is in URL', () => {
      mockSearchParams.mockReturnValue({ get: () => null });
      render(React.createElement(NewsletterVerifyPage));
      expect(screen.getByText(/missing verification token/i)).not.toBeNull();
    });

    it('does not call API when token is missing', () => {
      mockSearchParams.mockReturnValue({ get: () => null });
      render(React.createElement(NewsletterVerifyPage));
      expect(mockVerify).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows loading state while verifying', () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockVerify.mockReturnValue(new Promise(() => {}));
      render(React.createElement(NewsletterVerifyPage));
      expect(screen.getByText(/confirming your subscription/i)).not.toBeNull();
    });
  });

  describe('success state', () => {
    it('shows success message after verification', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockVerify.mockResolvedValue({ message: 'Email verified. You are on the waitlist!' });
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(screen.getByText(/you're on the list/i)).not.toBeNull();
      });
    });

    it('displays the API response message', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockVerify.mockResolvedValue({ message: 'Email verified. You are on the waitlist!' });
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(screen.getByText(/email verified/i)).not.toBeNull();
      });
    });

    it('shows back to homepage link on success', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'valid-token' });
      mockVerify.mockResolvedValue({ message: 'Verified!' });
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(screen.getByText(/back to homepage/i)).not.toBeNull();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when verification fails', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'invalid-token' });
      mockVerify.mockRejectedValue(new Error('Invalid or expired link.'));
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).not.toBeNull();
        expect(screen.getByText(/invalid or expired link/i)).not.toBeNull();
      });
    });

    it('shows generic error when API rejects with non-Error', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'bad-token' });
      mockVerify.mockRejectedValue('server error');
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /verification failed/i })).not.toBeNull();
      });
    });

    it('calls verify with the token from URL params', async () => {
      mockSearchParams.mockReturnValue({ get: () => 'the-token' });
      mockVerify.mockResolvedValue({ message: 'OK' });
      render(React.createElement(NewsletterVerifyPage));

      await waitFor(() => {
        expect(mockVerify).toHaveBeenCalledWith('the-token');
      });
    });
  });
});
