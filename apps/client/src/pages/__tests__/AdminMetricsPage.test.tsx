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
    activityTrackedSince: '2026-10-14',
    tourFunnel: [
      {
        itemId: 'lesson-02',
        started: 6,
        completed: 5,
        steps: [{ stepId: 'lesson-02.79', viewers: 5, closedHere: 1 }],
        rating: { count: 3, average: 4.3 },
      },
      {
        itemId: 'primer',
        started: 10,
        completed: 4,
        steps: [
          { stepId: 'primer.1', viewers: 10, closedHere: 1 },
          { stepId: 'primer.2', viewers: 7, closedHere: 3 },
        ],
      },
      { itemId: 'buy-first-coin', started: 0, completed: 0, steps: [] },
    ],
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

  it('states what the numbers cannot see, with the date sign-in days are recorded from', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    await waitFor(() => expect(screen.getByText(/recorded since 2026-10-14/)).not.toBeNull());
    expect(screen.getByText(/never register/)).not.toBeNull();
  });

  it('shows the tours’ funnel: who saw each step and where they left', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    await waitFor(() => expect(screen.getByText('What you’re looking at')).not.toBeNull());
    expect(screen.getByText('4 / 10')).not.toBeNull();
    expect(screen.getByText(/40% finished/)).not.toBeNull();
    // a tour nobody opened still shows, at zero
    expect(screen.getByText('Buy your first coin')).not.toBeNull();
  });

  it('shows a lesson by its name, its screens by what they are, and its rating', async () => {
    mockGetMetrics.mockResolvedValue(metrics());
    renderPage();

    await waitFor(() =>
      // Its totals and rating count the old Lesson 3 too (the events carry no step); its screens don't
      expect(
        screen.getByText('Lesson 3: News, swings and traps (totals and rating: all versions)')
      ).not.toBeNull()
    );
    expect(screen.getByText('19. Try it on the real screen')).not.toBeNull();
    expect(screen.getByText(/rated 4.3 \/ 5 by 3/)).not.toBeNull();
  });

  it('should name Lesson 1’s steps from 61 on as today’s screens, and earlier ones as an earlier version', async () => {
    mockGetMetrics.mockResolvedValue(
      metrics({
        tourFunnel: [
          {
            itemId: 'lesson-01',
            started: 4,
            completed: 1,
            steps: [
              { stepId: 'lesson-01.6', viewers: 2, closedHere: 0 },
              { stepId: 'lesson-01.61', viewers: 3, closedHere: 0 },
            ],
          },
        ],
      })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('1. Card: Two pizzas')).not.toBeNull());
    expect(screen.getByText('Screen 6 (an earlier version of the lesson)')).not.toBeNull();
  });

  it('should list a tour’s steps in the order it runs them, marking the phone-only and desktop-only ones', async () => {
    mockGetMetrics.mockResolvedValue(
      metrics({
        tourFunnel: [
          {
            itemId: 'buy-first-coin',
            started: 3,
            completed: 1,
            steps: [
              { stepId: 'buy-first-coin.1', viewers: 2, closedHere: 0 },
              { stepId: 'buy-first-coin.2', viewers: 3, closedHere: 0 },
              { stepId: 'buy-first-coin.51', viewers: 1, closedHere: 0 },
            ],
          },
        ],
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/^51\. Tap Buy \/ Long/)).not.toBeNull());
    const rows = [...document.querySelectorAll('tr')].map((r) => r.textContent ?? '');
    const phone = rows.findIndex((t) => t.startsWith('51.'));
    const first = rows.findIndex((t) => t.startsWith('1.'));
    // The phone's first step comes first, as the tour runs it, and says which learners saw it
    expect(phone).toBeLessThan(first);
    expect(rows[phone]).toContain('(phone only)');
    expect(rows[first]).toContain('(desktop only)');
  });

  it('says so when sign-in days are not recorded yet', async () => {
    mockGetMetrics.mockResolvedValue(metrics({ activityTrackedSince: null }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/not recorded yet/)).not.toBeNull());
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
