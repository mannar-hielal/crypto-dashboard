import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'tok' }),
}));

let desktop = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { LearnPanel } from '@/guide/LearnPanel';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { useArticleStore } from '@/learn/articleStore';

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
    getHabits.mockReset();
    getHabits.mockResolvedValue({ badges: [], learningDays: 0, streakDays: 0 });
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
  });
  afterEach(() => cleanup());

  it('should render nothing until it is opened', () => {
    renderPanel();
    expect(screen.queryByText('Guided practice')).toBeNull();
  });

  it('should list both lessons and the three tours, ticking the finished ones', () => {
    useTourStore.setState({ panelOpen: true, completed: { primer: true } });
    renderPanel();

    expect(screen.getByText('1. What is Bitcoin?')).not.toBeNull();
    expect(screen.getByText('2. Who sets the price?')).not.toBeNull();
    expect(screen.getByText('What you’re looking at')).not.toBeNull();
    expect(screen.getByText('Buy your first coin')).not.toBeNull();
    expect(screen.getByText('Sell it and read the result')).not.toBeNull();
    expect(screen.getByText('Repeat')).not.toBeNull();
    expect(screen.getAllByText('Start')).toHaveLength(4);
  });

  it('should open a lesson from the panel, and tick it once done', () => {
    useTourStore.setState({ panelOpen: true });
    renderPanel();
    fireEvent.click(document.querySelector('[data-guide="learn.lesson.start"]')!);
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useLessonStore.getState().activeId).toBe('lesson-01');

    cleanup();
    useLessonStore.getState().reset();
    useLessonStore.getState().setCompleted(['lesson-01']);
    useTourStore.setState({ panelOpen: true });
    renderPanel();
    expect(document.querySelector('[data-guide="learn.lesson.start"]')!.textContent).toBe('Repeat');
    expect(
      document.querySelector('[data-guide="learn.lesson.start"][data-guide-key="lesson-02"]')!
        .textContent
    ).toBe('Start');
  });

  it('should run a tour again on any account: navigate, close, start', () => {
    useTourStore.setState({ panelOpen: true, completed: { 'buy-first-coin': true } });
    renderPanel();

    fireEvent.click(screen.getByText('Repeat'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
  });

  it('should list the library and open an article in the drawer', () => {
    useArticleStore.getState().reset();
    useTourStore.setState({ panelOpen: true });
    renderPanel();
    expect(screen.getByText('Library')).not.toBeNull();
    expect(screen.getByText('SunCoin: money in a notebook')).not.toBeNull();

    fireEvent.click(
      document.querySelector('[data-guide="learn.article.open"][data-guide-key="exchange-price"]')!
    );
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useArticleStore.getState()).toMatchObject({ openId: 'exchange-price', from: null });
  });

  it('should close from its ✕', () => {
    useTourStore.setState({ panelOpen: true });
    renderPanel();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(useTourStore.getState().panelOpen).toBe(false);
  });

  it('should disable a tour’s Start on a phone and say why, but keep lessons open', () => {
    desktop = false;
    useTourStore.setState({ panelOpen: true });
    renderPanel();

    for (const b of document.querySelectorAll<HTMLButtonElement>(
      '[data-guide="learn.tour.start"]'
    )) {
      expect(b.disabled).toBe(true);
    }
    expect(
      document.querySelector<HTMLButtonElement>('[data-guide="learn.lesson.start"]')!.disabled
    ).toBe(false);
    expect(screen.getByText(/larger screen/)).not.toBeNull();
  });

  describe('habits', () => {
    it('should show the streak and each badge with its progress', async () => {
      getHabits.mockResolvedValue({
        learningDays: 4,
        streakDays: 2,
        badges: [
          { id: 'first-stop-loss', earned: true, progress: 1, target: 1 },
          { id: 'ten-stop-losses', earned: false, progress: 4, target: 10 },
        ],
      });
      useTourStore.setState({ panelOpen: true });
      renderPanel();

      await waitFor(() => expect(screen.getByText(/2-day learning streak/)).not.toBeNull());
      expect(screen.getByText(/4 learning days/)).not.toBeNull();
      expect(screen.getByText('Protected a trade')).not.toBeNull();
      expect(screen.getByText(/4 \/ 10/)).not.toBeNull();
      expect(getHabits).toHaveBeenCalledWith('tok');
    });

    it('should say there is no streak yet, and that habits are not about profit', async () => {
      useTourStore.setState({ panelOpen: true });
      renderPanel();

      await waitFor(() => expect(screen.getByText(/No learning streak yet/)).not.toBeNull());
      expect(screen.getByText(/never about profit/)).not.toBeNull();
    });

    it('should not load anything while the panel is closed', () => {
      renderPanel();
      expect(getHabits).not.toHaveBeenCalled();
    });

    it('should say so when the habits cannot be loaded, and keep the tours usable', async () => {
      getHabits.mockRejectedValue(new Error('offline'));
      useTourStore.setState({ panelOpen: true });
      renderPanel();

      await waitFor(() => expect(screen.getByText(/Could not load your habits/)).not.toBeNull());
      expect(screen.getAllByText('Start').length).toBeGreaterThan(0);
    });
  });
});
