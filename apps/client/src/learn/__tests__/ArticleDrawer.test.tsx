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

import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { ArticleDrawer } from '@/learn/ArticleDrawer';
import { useArticleStore } from '@/learn/articleStore';

const drawer = () => document.querySelector('[role="dialog"]');
const renderDrawer = () =>
  render(
    <MemoryRouter>
      <ArticleDrawer />
    </MemoryRouter>
  );
const open = (...args: Parameters<ReturnType<typeof useArticleStore.getState>['open']>) =>
  act(() => useArticleStore.getState().open(...args));

describe('ArticleDrawer', () => {
  beforeEach(() => {
    desktop = true;
    navigate.mockReset();
    useArticleStore.getState().reset();
    useLessonStore.getState().reset();
    useTourStore.getState().reset();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('should render nothing while no article is open', () => {
    renderDrawer();
    expect(drawer()).toBeNull();
  });

  it('should show an article from the library: title, time, self-test, sources folded away', () => {
    renderDrawer();
    open('suncoin');
    expect(screen.getByRole('heading', { name: 'SunCoin: money in a notebook' })).toBeTruthy();
    expect(drawer()!.textContent).toContain('3 min read');
    expect(drawer()!.textContent).toContain('Library');
    expect(drawer()!.textContent).toContain('Quick self-test');

    const sources = document.querySelector('[data-guide="article.sources"]') as HTMLDetailsElement;
    expect(sources.open).toBe(false);
    const link = sources.querySelector('a')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should run the SunCoin notebook a line at a time, and start over', () => {
    renderDrawer();
    open('suncoin');
    const next = document.querySelector<HTMLButtonElement>('[data-guide="article.notebook.next"]')!;
    expect(drawer()!.textContent).toContain('The notebook is empty.');
    for (let i = 0; i < 6; i++) fireEvent.click(next);
    expect(next.disabled).toBe(true);
    expect(drawer()!.textContent).toContain('6 of 6 lines');
    expect(drawer()!.textContent).toContain('none appeared or vanished');
    fireEvent.click(document.querySelector('[data-guide="article.notebook.reset"]')!);
    expect(drawer()!.textContent).toContain('0 of 6 lines');
  });

  it('should show what Nora’s edit does, and the other notebooks outvoting it', () => {
    renderDrawer();
    open('suncoin');
    fireEvent.change(document.querySelector('[data-guide="article.nora.amount"]')!, {
      target: { value: '30' },
    });
    expect(drawer()!.textContent).toContain('Leo now has -24');
    expect(drawer()!.textContent).toContain('still add up to 15');
    fireEvent.click(document.querySelector('[data-guide="article.nora.copies"]')!);
    expect(drawer()!.textContent).toContain('4 of 5 copies still say Leo paid 3');
  });

  it('should end SunCoin on the problem, and answer it in the network article', () => {
    renderDrawer();
    open('suncoin');
    expect(drawer()!.textContent).toContain('their own pretend money: SunCoin');
    expect(drawer()!.textContent).toContain('what would you fix?');
    expect(drawer()!.textContent).not.toMatch(/bitcoin/i);

    open('bitcoin-network');
    expect(drawer()!.textContent).toContain('4 min read');
    expect(drawer()!.textContent).toContain('Three jobs, every node');
    expect(drawer()!.textContent).toContain('Nora’s four problems, answered');
    expect(
      document.querySelector('[aria-label="Sofia’s stamp and the stamp-checker"]')
    ).toBeTruthy();
    expect(drawer()!.textContent).toContain('Lesson 2: One record, many copies →');
  });

  it('should step through a payment with the mailbox, and say a later lesson practises it', () => {
    renderDrawer();
    open('mailboxes-keys');
    fireEvent.click(
      document.querySelector('[data-guide="article.mailbox.step"][data-guide-key="3"]')!
    );
    expect(drawer()!.textContent).toContain('The box is locked');
    // Keys and custody moved to a later lesson (2026-11-16)
    expect(drawer()!.textContent).toContain('a later lesson on keys and custody');
  });

  it('should send the story article back to the Lesson 2 card whose Read more opens it', () => {
    renderDrawer();
    open('bitcoin-story');
    // Owner 2026-11-12: no "Coming in a later lesson" once a lesson card links here
    expect(drawer()!.textContent).not.toContain('Coming in a later lesson');
    expect(drawer()!.textContent).toContain('Lesson 2: A paper, then a block');
    expect(drawer()!.textContent).toContain('Satoshi');
  });

  it('should come back to the lesson it was opened from', () => {
    act(() => useLessonStore.getState().start('lesson-01', 2));
    renderDrawer();
    open('suncoin', { from: { lesson: 'lesson-01', screen: 2 } });
    fireEvent.click(screen.getByText('← Back to Lesson 1'));
    expect(drawer()).toBeNull();
    expect(useLessonStore.getState().screen).toBe(2);
  });

  it('should open the lesson at the card that teaches it', () => {
    renderDrawer();
    open('suncoin');
    fireEvent.click(document.querySelector('[data-guide="article.practice"]')!);
    expect(drawer()).toBeNull();
    // Lesson 2's ledger card (Lesson 1's notebook moved to a later lesson, 2026-11-16)
    expect(useLessonStore.getState().activeId).toBe('lesson-ownership');
    expect(useLessonStore.getState().screen).toBe(4);
  });

  it('should take a look back home when the practice link is the lesson it came from', () => {
    act(() => {
      useLessonStore.getState().start('lesson-ownership', 5);
      useLessonStore.getState().answer(0);
      useLessonStore.getState().visit('lesson-01', 3);
    });
    renderDrawer();
    open('bitcoin-network', { from: { lesson: 'lesson-01', screen: 3 } });
    fireEvent.click(screen.getByText('Lesson 2: One record, many copies →'));
    // Home, answers kept, at the card the link teaches
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-ownership',
      answers: { 5: 0 },
      returnTo: null,
    });
    expect(useLessonStore.getState().screen).not.toBe(5);
  });

  it('should start a practice tour on a larger screen only', () => {
    renderDrawer();
    open('exchange-price');
    fireEvent.click(
      document.querySelector('[data-guide="article.practice"][data-guide-key="primer"]')!
    );
    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('primer');

    cleanup();
    desktop = false;
    renderDrawer();
    open('exchange-price');
    const tour = document.querySelector<HTMLButtonElement>(
      '[data-guide="article.practice"][data-guide-key="primer"]'
    )!;
    expect(tour.disabled).toBe(true);
  });

  it('should end the lesson on screen before a practice tour, so its sheet stays away', () => {
    act(() => {
      useLessonStore.getState().start('lesson-ownership', 2);
      useLessonStore.getState().visit('lesson-01', 1);
    });
    renderDrawer();
    open('exchange-price', { from: { lesson: 'lesson-01', screen: 1 } });
    fireEvent.click(
      document.querySelector('[data-guide="article.practice"][data-guide-key="primer"]')!
    );
    expect(useLessonStore.getState()).toMatchObject({ activeId: null, returnTo: null });
    expect(useTourStore.getState().activeId).toBe('primer');
  });

  it('should open at the asked-for section', () => {
    renderDrawer();
    open('exchange-price', { section: 'liquidity' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.getElementById('article-section-liquidity')).not.toBeNull();
  });

  it('should close with ✕, Esc and a click outside', () => {
    renderDrawer();
    open('suncoin');
    fireEvent.click(screen.getByLabelText('Close the article'));
    expect(drawer()).toBeNull();
    open('suncoin');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(drawer()).toBeNull();
    open('suncoin');
    fireEvent.click(document.querySelector('[data-guide="article.drawer"]')!);
    expect(drawer()).toBeNull();
  });
});
