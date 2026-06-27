import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetSubscribers = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  newsletterApi: {
    getSubscribers: (...args: unknown[]) => mockGetSubscribers(...args),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/components/SeoHead', () => ({
  SeoHead: () => null,
}));

vi.mock('@/components/Footer', () => ({
  Footer: () => React.createElement('div', { 'data-testid': 'footer' }),
}));

import { AdminNewsletterPage } from '@/pages/AdminNewsletterPage';
import type { SubscriberInfo } from '@crypto-dashboard/sdk';

function makeSubscriber(overrides: Partial<SubscriberInfo> & { email: string }): SubscriberInfo {
  return {
    id: 'sub-1',
    status: 'verified',
    createdAt: '2025-01-01T00:00:00.000Z',
    verifiedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AdminNewsletterPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows a loading spinner on mount', () => {
      mockGetSubscribers.mockReturnValue(new Promise(() => {}));
      render(React.createElement(AdminNewsletterPage));
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeNull();
    });
  });

  describe('error state', () => {
    it('shows error message when fetch fails', async () => {
      mockGetSubscribers.mockRejectedValue(new Error('Network error'));
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText('Network error')).not.toBeNull();
      });
    });

    it('shows generic error when fetch rejects with non-Error', async () => {
      mockGetSubscribers.mockRejectedValue('server error');
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText('Failed to load subscribers')).not.toBeNull();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when there are no subscribers', async () => {
      mockGetSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText('No subscribers found.')).not.toBeNull();
      });
    });
  });

  describe('subscribers table', () => {
    beforeEach(() => {
      const subscribers = [
        makeSubscriber({ email: 'alice@test.com', status: 'verified' }),
        makeSubscriber({ email: 'bob@test.com', id: 'sub-2', status: 'pending', verifiedAt: null }),
      ];
      mockGetSubscribers.mockResolvedValue({ subscribers, total: 2 });
    });

    it('renders subscriber rows', async () => {
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText('alice@test.com')).not.toBeNull();
        expect(screen.getByText('bob@test.com')).not.toBeNull();
      });
    });

    it('shows the total subscriber count', async () => {
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText(/2 subscribers?/i)).not.toBeNull();
      });
    });

    it('renders status badges with correct labels', async () => {
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(screen.getByText('Verified')).not.toBeNull();
        expect(screen.getByText('Pending')).not.toBeNull();
      });
    });
  });

  describe('status filter', () => {
    beforeEach(() => {
      mockGetSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
    });

    it('renders all four filter buttons', () => {
      render(React.createElement(AdminNewsletterPage));
      const buttons = ['All', 'Pending', 'Verified', 'Unsubscribed'];
      for (const label of buttons) {
        expect(screen.getByText(label)).not.toBeNull();
      }
    });

    it('calls getSubscribers with status filter when clicked', async () => {
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(mockGetSubscribers).toHaveBeenCalledWith('test-token', undefined);
      });

      fireEvent.click(screen.getByText('Pending'));

      await waitFor(() => {
        expect(mockGetSubscribers).toHaveBeenCalledWith('test-token', 'pending');
      });
    });

    it('calls getSubscribers without filter for All', async () => {
      render(React.createElement(AdminNewsletterPage));

      await waitFor(() => {
        expect(mockGetSubscribers).toHaveBeenCalledWith('test-token', undefined);
      });

      mockGetSubscribers.mockClear();
      mockGetSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
      fireEvent.click(screen.getByText('Verified'));

      await waitFor(() => {
        expect(mockGetSubscribers).toHaveBeenCalledWith('test-token', 'verified');
      });

      mockGetSubscribers.mockClear();
      mockGetSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
      fireEvent.click(screen.getByText('All'));

      await waitFor(() => {
        expect(mockGetSubscribers).toHaveBeenCalledWith('test-token', undefined);
      });
    });
  });

  describe('header', () => {
    it('shows the page title', () => {
      mockGetSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
      render(React.createElement(AdminNewsletterPage));
      expect(screen.getByText('Newsletter Subscribers')).not.toBeNull();
    });
  });
});
