import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

const mockGetMetrics = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  adminApi: {
    getRetentionMetrics: (...args: unknown[]) => mockGetMetrics(...args),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}));

let mockEmail = 'admin@example.com';
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (s: { accessToken: string; user: { email: string } }) => unknown) => {
    const state = { accessToken: 'test-token', user: { email: mockEmail } };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/Footer', () => ({ Footer: () => null }));

import { AdminMetricsPage } from '@/pages/AdminMetricsPage';
import type { RetentionCohort, RetentionMetricsResponse } from '@crypto-dashboard/sdk';

const rate = (count: number, eligible: number) => ({ count, eligible });

function cohort(over: Partial<RetentionCohort> = {}): RetentionCohort {
  return {
    weekStart: '2026-10-05',
    signups: 14,
    verified: 11,
    activated: rate(4, 8),
    medianHoursToFirstOrder: 2.4,
    activeWeek1: rate(2, 8),
    activeWeek2: rate(0, 0),
    activeWeek4: rate(0, 0),
    resetUsers: 1,
    firstOrderWithStopLoss: rate(1, 4),
    ...over,
  };
}

function metrics(over: Partial<RetentionMetricsResponse> = {}): RetentionMetricsResponse {
  return {
    generatedAt: '2026-10-11T10:42:00.000Z',
    windowWeeks: 12,
    truncated: false,
    totals: cohort({ weekStart: null, signups: 128, verified: 96 }),
    cohorts: [
      cohort({ weekStart: '2026-10-05' }),
      cohort({ weekStart: '2026-09-28', signups: 12 }),
    ],
    ...over,
  };
}

const renderPage = () =>
  render(React.createElement(MemoryRouter, null, React.createElement(AdminMetricsPage)));

describe('AdminMetricsPage', () => {
  beforeEach(() => {
    mockEmail = 'admin@example.com';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads with the access token and shows the totals strip and a row per cohort', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    // 128 shows in the strip and in the 'All weeks' row
    await waitFor(() => expect(screen.getAllByText('128')).toHaveLength(2));
    expect(mockGetMetrics).toHaveBeenCalledWith('test-token');
    expect(screen.getByText('96 verified')).not.toBeNull();
    expect(screen.getByText('05 Oct')).not.toBeNull();
    // ICU renders September as "Sept" in en-GB on newer Node
    expect(screen.getByText(/^28 Sep/)).not.toBeNull();
  });

  it('shows a rate as count / eligible with the percentage, and a dash when nobody is eligible', async () => {
    mockGetMetrics.mockResolvedValue(metrics({ cohorts: [cohort()] }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText('50%').length).toBeGreaterThan(0));
    // Wk 2 / Wk 4 have no eligible user yet in this cohort
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('warns when the row cap truncated the window', async () => {
    mockGetMetrics.mockResolvedValue(metrics({ truncated: true }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/lower bound/i)).not.toBeNull());
  });

  it('states what the numbers cannot see', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    await waitFor(() => expect(screen.getByText(/only watch charts/i)).not.toBeNull());
  });

  it('shows the server error', async () => {
    mockGetMetrics.mockRejectedValue(new Error('Forbidden'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Forbidden')).not.toBeNull());
  });

  it('refreshes on demand', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    await waitFor(() => expect(screen.getByText('Refresh')).not.toBeNull());
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(mockGetMetrics).toHaveBeenCalledTimes(2));
  });

  it('redirects a non-admin away and never calls the API', async () => {
    mockEmail = 'someone@example.com';
    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });
});
