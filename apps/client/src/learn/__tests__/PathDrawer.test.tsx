import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string; user: null }) => unknown) =>
      selector({ accessToken: 'tok', user: null }),
    { getState: () => ({ accessToken: 'tok', user: null }) }
  ),
}));

let wide = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => wide }));

const navigate = vi.fn();
/** Tours to treat as not phone-ready (the path's two are today; a later tour may not be) */
const notOnPhones = new Set<string>();
vi.mock('@/guide/tours', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/guide/tours')>();
  return {
    ...mod,
    runsHere: (id: Parameters<typeof mod.runsHere>[0], wide: boolean) =>
      notOnPhones.has(id) ? wide : mod.runsHere(id, wide),
  };
});

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { useLessonStore } from '@/guide/lessonStore';
import { getLesson, lessonScreens } from '@/guide/lessons';
import { useTourStore } from '@/guide/tourStore';
import { guideSelector } from '@/lib/guideAnchors';
import { useArticleStore } from '@/learn/articleStore';
import { PathDrawer } from '@/learn/PathDrawer';
import { usePathStore } from '@/learn/pathStore';

const renderDrawer = () =>
  render(
    <MemoryRouter>
      <PathDrawer />
    </MemoryRouter>
  );

const nodeButton = (key: string) =>
  document.querySelector<HTMLButtonElement>(`${guideSelector('path.node', key)} button`)!;

describe('PathDrawer', () => {
  beforeEach(() => {
    wide = true;
    navigate.mockReset();
    getHabits.mockReset();
    getHabits.mockResolvedValue({ badges: [], learningDays: 0, streakDays: 0 });
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
    usePathStore.getState().reset();
    useArticleStore.getState().reset();
  });
  afterEach(() => cleanup());

  it('should render nothing until it is opened', () => {
    renderDrawer();
    expect(document.querySelector(guideSelector('path.drawer'))).toBeNull();
  });

  it('should show chapter 1 with its stops, the next step marked, and chapter 2 coming soon', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();

    expect(screen.getByRole('dialog', { name: 'Crypto trading path' })).toBeTruthy();
    expect(screen.getByText('Start here: crypto and trading basics')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(nodeButton('lesson:lesson-01').getAttribute('aria-label')).toBe(
      'Lesson, on the real chart: Up, down and your first trade, next step'
    );
    expect(nodeButton('lesson:lesson-02').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Trade with a plan')).toBeTruthy();
    expect(screen.getAllByText(/Coming soon/).length).toBeGreaterThan(0);
    // The legend names the two icons, and nothing says "Hands-on" any more (owner 2026-11-12)
    const legend = screen.getByRole('list', { name: 'Kinds of stop' }).textContent;
    expect(legend).toContain('Practice on the real chart');
    expect(document.body.textContent).not.toContain('Hands-on');
    expect(
      screen.getByRole('progressbar', { name: 'Path progress' }).getAttribute('aria-valuenow')
    ).toBe('0');
  });

  it('should ring a begun lesson with how much is done, and mark what is done on the chart with a dumbbell', () => {
    // Owner 2026-11-12, after Duolingo: a ring for a lesson part done, a dumbbell for practice
    act(() => useLessonStore.getState().setReached({ 'lesson-01': 4 }));
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    const screens = lessonScreens(getLesson('lesson-01')).length;
    const lesson1 = nodeButton('lesson:lesson-01');
    expect(lesson1.querySelector('[data-progress]')!.getAttribute('data-progress')).toBe(
      (5 / screens).toFixed(2)
    );
    expect(lesson1.getAttribute('aria-label')).toContain(`, 5 of ${screens} screens`);
    // A lesson is a book, with no badge; what's done on the real chart is a dumbbell: the
    // practice, and Lessons 1 and 3, whose "Try it" is there (Lesson 1's since 2026-11-16)
    expect(lesson1.querySelector('.lucide-dumbbell')).not.toBeNull();
    const lesson2 = nodeButton('lesson:lesson-ownership');
    expect(lesson2.querySelector('.lucide-book-open')).not.toBeNull();
    expect(lesson2.querySelector('.lucide-dumbbell')).toBeNull();
    expect(nodeButton('lesson:lesson-02').querySelector('.lucide-dumbbell')).not.toBeNull();
    expect(nodeButton('lesson:lesson-02').getAttribute('aria-label')).toContain(
      'Lesson, on the real chart: News, swings and traps'
    );
    expect(nodeButton('tour:buy-first-coin').querySelector('.lucide-dumbbell')).not.toBeNull();
    // A lesson not begun has no ring
    expect(nodeButton('lesson:lesson-ownership').querySelector('[data-progress]')).toBeNull();
  });

  it('should start the next lesson and close the map', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(nodeButton('lesson:lesson-01'));
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useLessonStore.getState().activeId).toBe('lesson-01');
  });

  it('should explain a locked stop instead of starting it', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(nodeButton('lesson:lesson-02'));
    expect(useLessonStore.getState().activeId).toBeNull();
    expect(useTourStore.getState().panelOpen).toBe(true);
    expect(screen.getByText('Finish “Money nobody controls” first.')).toBeTruthy();
  });

  it('should never make a coming-soon stop focusable', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    const soon = document.querySelector(guideSelector('path.chapter', 'ch2'))!;
    expect(soon.querySelectorAll('button')).toHaveLength(0);
  });

  it('should offer the checkpoint under the first locked stop, and open it', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(document.querySelector(guideSelector('path.test-out'))!);
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(usePathStore.getState().checkpointId).toBe('checkpoint-ch1');
  });

  it('should run a tour on a larger screen: navigate, close, start', () => {
    useLessonStore.getState().setCompleted(['lesson-01', 'lesson-ownership', 'lesson-02']);
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(nodeButton('tour:buy-first-coin'));
    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState()).toMatchObject({ panelOpen: false, activeId: 'buy-first-coin' });
  });

  it('should start a phone-ready tour on a phone, with no "larger screen" note', () => {
    // The path's tours open the form from the phone's bar since 2026-11-16; a tour that isn't
    // phone-ready still gets the note and its "skip for now"
    wide = false;
    useLessonStore.getState().setCompleted(['lesson-01', 'lesson-ownership', 'lesson-02']);
    useTourStore.setState({ panelOpen: true });
    renderDrawer();

    fireEvent.click(nodeButton('tour:buy-first-coin'));
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
    expect(screen.queryByText(/needs a laptop or tablet/)).toBeNull();
  });

  it('should let a phone skip a tour that needs a larger screen, which opens the next stop', () => {
    // Every tour on the path is phone-ready today: the flow is kept for a later one that isn't
    notOnPhones.add('buy-first-coin');
    wide = false;
    useLessonStore.getState().setCompleted(['lesson-01', 'lesson-ownership', 'lesson-02']);
    useTourStore.setState({ panelOpen: true });
    renderDrawer();

    fireEvent.click(nodeButton('tour:buy-first-coin'));
    expect(useTourStore.getState().activeId).toBeNull();
    expect(screen.getByText(/needs a laptop or tablet/)).toBeTruthy();

    fireEvent.click(document.querySelector(guideSelector('path.tour.skip', 'buy-first-coin'))!);
    expect(usePathStore.getState().skippedTours).toEqual({ 'buy-first-coin': true });
    expect(
      document
        .querySelector(guideSelector('path.node', 'tour:sell-and-review'))!
        .getAttribute('data-state')
    ).toBe('current');
    notOnPhones.clear();
  });

  it('should show what a chapter covers from its book button', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(document.querySelector(guideSelector('path.chapter.info', 'ch1'))!);
    const overview = document.querySelector(guideSelector('path.chapter.overview'))!;
    expect(overview.textContent).toContain('News, swings and traps');
    // Each lesson's summary lines (the lessons sum up there since 2026-11-16)
    expect(overview.textContent).toContain('What you’ll learn');
    expect(overview.textContent).toContain('Closing a position makes the result real.');
  });

  it('should show the streak, and keep the library and habits in their own tab', async () => {
    getHabits.mockResolvedValue({
      learningDays: 4,
      streakDays: 2,
      badges: [{ id: 'ten-stop-losses', earned: false, progress: 4, target: 10 }],
    });
    useTourStore.setState({ panelOpen: true });
    renderDrawer();

    await waitFor(() =>
      expect(document.querySelector(guideSelector('learn.streak'))!.textContent).toContain('2')
    );
    fireEvent.click(document.querySelector(guideSelector('path.tab', 'library'))!);
    expect(screen.getByText('SunCoin: money in a notebook')).toBeTruthy();
    expect(screen.getByText(/4 \/ 10/)).toBeTruthy();
    expect(screen.getByText(/never about profit/)).toBeTruthy();

    fireEvent.click(document.querySelector(guideSelector('learn.article.open', 'exchange-price'))!);
    expect(useTourStore.getState().panelOpen).toBe(false);
    expect(useArticleStore.getState().openId).toBe('exchange-price');
  });

  it('should say so when the habits cannot be loaded', async () => {
    getHabits.mockRejectedValue(new Error('offline'));
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(document.querySelector(guideSelector('path.tab', 'library'))!);
    await waitFor(() => expect(screen.getByText(/Could not load your habits/)).toBeTruthy());
  });

  it('should close from its ✕, from Esc and from the dimmed backdrop', () => {
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.click(screen.getByLabelText('Close the learning path'));
    expect(useTourStore.getState().panelOpen).toBe(false);

    cleanup();
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useTourStore.getState().panelOpen).toBe(false);

    cleanup();
    useTourStore.setState({ panelOpen: true });
    renderDrawer();
    const drawer = document.querySelector(guideSelector('path.drawer'))!;
    fireEvent.mouseDown(drawer);
    expect(useTourStore.getState().panelOpen).toBe(true);
    fireEvent.mouseDown(drawer.parentElement!);
    expect(useTourStore.getState().panelOpen).toBe(false);
  });
});
