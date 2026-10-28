import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let desktop = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

// The history cards' mini charts: no network in tests (they fall back to the drawn picture)
const getCandles = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  marketApi: { getCandles: (...a: unknown[]) => getCandles(...a) },
}));

const addJournalNote = vi.fn();
vi.mock('@/store/paperStore', () => ({
  usePaperStore: (selector: (s: { addJournalNote: typeof addJournalNote }) => unknown) =>
    selector({ addJournalNote }),
}));

import { clearLessonChartCache } from '@/guide/lessonChartLoader';
import { LessonSheet } from '@/guide/LessonSheet';
import { useArticleStore } from '@/learn/articleStore';
import { useLessonStore } from '@/guide/lessonStore';
import { getLesson, type LessonId } from '@/guide/lessons';
import { useTourStore } from '@/guide/tourStore';

const lesson = getLesson('lesson-02');
const sheet = () => document.querySelector('[data-guide="lesson.sheet"]');
const nextBtn = () => document.querySelector<HTMLButtonElement>('[data-guide="lesson.next"]');
const option = (i: number) =>
  document.querySelector<HTMLButtonElement>(`[data-guide="lesson.option"][data-guide-key="${i}"]`)!;

const renderSheet = () =>
  render(
    <MemoryRouter>
      <LessonSheet />
    </MemoryRouter>
  );

/** Jump straight to a screen of Lesson 1 */
const at = (screen: number, id: LessonId = 'lesson-02') => {
  act(() => {
    useLessonStore.getState().start(id);
    useLessonStore.setState({ screen });
  });
};

describe('LessonSheet', () => {
  beforeEach(() => {
    desktop = true;
    navigate.mockReset();
    addJournalNote.mockReset();
    getCandles.mockReset();
    getCandles.mockRejectedValue(new Error('offline'));
    clearLessonChartCache();
    useLessonStore.getState().reset();
    useTourStore.getState().reset();
    useArticleStore.getState().reset();
  });
  afterEach(() => cleanup());

  it('should render nothing while no lesson runs', () => {
    renderSheet();
    expect(sheet()).toBeNull();
  });

  it('should show the first card with both guides talking, and step through the cards', () => {
    at(0);
    renderSheet();
    expect(sheet()!.textContent).toContain('Who decides?');
    expect(sheet()!.textContent).toContain('Tick');
    expect(sheet()!.textContent).toContain('Tock');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(1);
    expect(sheet()!.textContent).toContain(lesson.cards[1].title);
    fireEvent.click(screen.getByText('← Back'));
    expect(useLessonStore.getState().screen).toBe(0);
  });

  it('should hold Next on a question until it is answered, then explain', () => {
    at(5); // the moment
    renderSheet();
    expect(nextBtn()!.disabled).toBe(true);

    fireEvent.click(option(1)); // "It went down": right in hindsight, not the praised answer
    expect(sheet()!.textContent).toContain('Not quite.');
    // Tock reacts, calm: red is never the villain
    expect(sheet()!.querySelector('[data-mood="calm"]')?.getAttribute('data-guide-who')).toBe(
      'tock'
    );
    expect(sheet()!.textContent).toContain('hindsight');
    expect(nextBtn()!.disabled).toBe(false);
    expect(option(0).disabled).toBe(true);
  });

  it('should praise the honest answer', () => {
    at(5);
    renderSheet();
    expect(sheet()!.querySelector('[data-mood="thinking"]')).not.toBeNull();
    fireEvent.click(option(lesson.moment.correct));
    expect(sheet()!.textContent).toContain('Right.');
    expect(sheet()!.querySelector('[data-mood="grin"]')?.getAttribute('data-guide-who')).toBe(
      'tick'
    );
  });

  it('should step aside for the tour, then come back on the questions when it ends', () => {
    at(6); // try it
    renderSheet();
    fireEvent.click(screen.getByText('Show me'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('primer');
    expect(sheet()).toBeNull();

    act(() => useTourStore.getState().close()); // skipped, closed or finished: the same
    expect(useLessonStore.getState().inTour).toBe(false);
    expect(useLessonStore.getState().screen).toBe(7);
    expect(sheet()!.textContent).toContain('Check yourself');
  });

  it('should offer no tour on a phone, only a way on', () => {
    desktop = false;
    at(6);
    renderSheet();
    expect(screen.queryByText('Show me')).toBeNull();
    expect(sheet()!.textContent).toContain('larger screen');
    fireEvent.click(screen.getByText('Continue'));
    expect(useLessonStore.getState().screen).toBe(7);
  });

  it('should save the note to the journal and move on', async () => {
    addJournalNote.mockResolvedValue(null);
    at(10);
    renderSheet();
    const save = screen.getByText('Save to journal') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: '  How fees work  ' },
    });
    fireEvent.click(save);
    await waitFor(() => expect(useLessonStore.getState().screen).toBe(11));
    expect(addJournalNote).toHaveBeenCalledWith('How fees work');
  });

  it('should say so when the note cannot be saved, and still let the learner skip', async () => {
    addJournalNote.mockResolvedValue('Network error');
    at(10);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByText('Save to journal'));
    await waitFor(() => expect(sheet()!.textContent).toContain('Could not save'));
    expect(useLessonStore.getState().screen).toBe(10);
    fireEvent.click(screen.getByText('Skip'));
    expect(useLessonStore.getState().screen).toBe(11);
  });

  it('should close on the rule, take an optional rating, and finish', () => {
    at(11);
    renderSheet();
    expect(sheet()!.textContent).toContain(lesson.rule);

    fireEvent.click(screen.getByLabelText('4 of 5'));
    expect(useLessonStore.getState().rating).toBe(4);
    expect(screen.getByLabelText('4 of 5').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByText('Finish for now'));
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    expect(sheet()).toBeNull();
  });

  it('should finish and start the next tour from the close', () => {
    at(11);
    renderSheet();
    fireEvent.click(screen.getByText('Buy your first coin'));
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
  });

  it('should close with the ✕ and with Esc, without finishing', () => {
    at(2);
    renderSheet();
    fireEvent.click(screen.getByLabelText('Close the lesson'));
    expect(useLessonStore.getState().activeId).toBeNull();

    at(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBeNull();
    expect(useLessonStore.getState().completed).toEqual({});
  });

  // ── Knowledge base (owner 2026-10-23) ──────────────────────────────────────

  it('should open a term’s peek inside the card, and close it again', () => {
    at(5, 'lesson-01'); // Many notebooks, no Nora: [[nodes|node]], [[blockchain]]
    renderSheet();
    const term = document.querySelector<HTMLButtonElement>(
      '[data-guide="lesson.term"][data-guide-key="node"]'
    )!;
    expect(term.textContent).toBe('nodes');
    expect(term.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(term);
    const peek = document.querySelector('[data-guide="lesson.peek"]')!;
    expect(peek.textContent).toContain('keeps a full copy of the blockchain');
    expect(peek.textContent).toContain('Think of it as');
    expect(term.getAttribute('aria-expanded')).toBe('true');

    // Another term swaps the peek; the ✕ closes it
    fireEvent.click(
      document.querySelector('[data-guide="lesson.term"][data-guide-key="blockchain"]')!
    );
    expect(document.querySelector('[data-guide="lesson.peek"]')!.textContent).toContain(
      'Blockchain'
    );
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.close"]')!);
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should close a peek when the learner moves to another card', () => {
    at(5, 'lesson-01');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"]')!);
    fireEvent.click(nextBtn()!);
    fireEvent.click(screen.getByText('← Back'));
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should open the article from a peek, wait behind it, and come back on the same card', () => {
    at(1); // What a price is
    renderSheet();
    fireEvent.click(
      document.querySelector('[data-guide="lesson.term"][data-guide-key="last-price"]')!
    );
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.more"]')!);

    expect(useArticleStore.getState().openId).toBe('exchange-price');
    expect(useArticleStore.getState().from).toEqual({ lesson: 'lesson-02', screen: 1 });
    expect(sheet()).toBeNull(); // hidden while the article is open

    // Esc belongs to the drawer now: the lesson stays
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBe('lesson-02');

    act(() => useArticleStore.getState().close());
    expect(sheet()!.textContent).toContain('What a price is');
  });

  it('should keep a history card’s drawn picture when the chart can’t load', async () => {
    at(3); // Tesla
    renderSheet();
    await waitFor(() => expect(getCandles).toHaveBeenCalled());
    expect(getCandles.mock.calls[0]).toEqual([
      'BTCUSDT',
      '1d',
      116,
      'linear',
      Date.UTC(2021, 4, 20),
    ]);
    await waitFor(() => expect(sheet()!.querySelector('[data-lesson-art="tesla"]')).not.toBeNull());
    // The presenter stands beside the chart slot
    expect(sheet()!.querySelector('[data-mood="thinking"]')).not.toBeNull();
  });

  it('should list what the learner can now do, each opening its article at the section', () => {
    at(11);
    renderSheet();
    expect(sheet()!.textContent).toContain('You can now');
    expect(sheet()!.textContent).toContain('Read a candle’s open and close.');
    fireEvent.click(
      document.querySelector('[data-guide="lesson.can-do"][data-guide-key="candles"]')!
    );
    expect(useArticleStore.getState()).toMatchObject({
      openId: 'exchange-price',
      section: 'candles',
      from: { lesson: 'lesson-02', screen: 11 },
    });
  });

  // ── Lesson 1's cold open and the Next button (owner's visual Q&A 2026-10-25) ───

  it('should hold Next until the cold open’s lines are in, then name what comes next', () => {
    at(0, 'lesson-01');
    renderSheet();
    expect(nextBtn()!.dataset.ready).toBe('false');
    expect(nextBtn()!.getAttribute('aria-hidden')).toBe('true');
    // Enter first shows the lines, it doesn't skip the card
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(0);
    expect(nextBtn()!.dataset.ready).toBe('true');
    expect(nextBtn()!.textContent).toBe('Unlock your learning journey →');

    fireEvent.keyDown(sheet()!, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(1);
    expect(sheet()!.textContent).toContain('I’m Tick.');
    expect(sheet()!.textContent).toContain('the one thing you never share');
    expect(nextBtn()!.textContent).toBe('Start with money itself →');

    // Back to the cold open: it doesn't play again
    fireEvent.click(screen.getByText('← Back'));
    expect(nextBtn()!.dataset.ready).toBe('true');
  });

  it('should hold Next while the guides meet, show it all on Enter, then move on', () => {
    at(1, 'lesson-01');
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.meet"]')!.textContent).toContain(
      'Hi, I’m Tock.'
    );
    expect(nextBtn()!.dataset.ready).toBe('false');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(1);
    expect(nextBtn()!.dataset.ready).toBe('true');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(2);
  });

  it('should show the cold open’s lines at a tap on them', () => {
    at(0, 'lesson-01');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.beats"]')!);
    expect(nextBtn()!.dataset.ready).toBe('true');
    expect(useLessonStore.getState().screen).toBe(0);
  });

  it('should say Continue where a card names nothing, and not move on from an unanswered question', () => {
    at(6, 'lesson-01'); // A mailbox and a key
    renderSheet();
    expect(nextBtn()!.textContent).toBe('Continue →');
    fireEvent.keyDown(sheet()!, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(7); // the moment
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(7);
  });

  // ── Lesson 1: "Try it" inside the sheet, then on to Lesson 2 ─────────────────

  it('should run Lesson 1’s “Try it” inside the sheet, on a phone as well', () => {
    desktop = false;
    at(8, 'lesson-01');
    renderSheet();
    expect(sheet()!.textContent).toContain('Now be Nora');
    expect(screen.queryByText('Show me')).toBeNull();
    fireEvent.change(document.querySelector('[data-guide="article.nora.amount"]')!, {
      target: { value: '30' },
    });
    expect(sheet()!.textContent).toContain('still add up to 15');
    fireEvent.click(document.querySelector('[data-guide="lesson.try"]')!);
    expect(useLessonStore.getState().screen).toBe(9);
  });

  it('should finish Lesson 1 and open Lesson 2 from its close, on any screen', () => {
    desktop = false;
    at(13, 'lesson-01');
    renderSheet();
    const nextLesson = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    expect(nextLesson.textContent).toBe('Lesson 2: Who sets the price?');
    fireEvent.click(nextLesson);
    expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-02', screen: 0 });
    expect(sheet()!.textContent).toContain('Who decides?');
  });
});
