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
const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  marketApi: { getCandles: (...a: unknown[]) => getCandles(...a) },
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));

const addJournalNote = vi.fn();
vi.mock('@/store/paperStore', () => {
  const state = { addJournalNote: (text: string) => addJournalNote(text) };
  const usePaperStore = (selector: (s: typeof state) => unknown) => selector(state);
  usePaperStore.getState = () => state;
  return { usePaperStore };
});

import { clearLessonChartCache } from '@/guide/lessonChartLoader';
import { LessonSheet } from '@/guide/LessonSheet';
import { useArticleStore } from '@/learn/articleStore';
import { useLessonStore } from '@/guide/lessonStore';
import { getLesson, lessonScreens, type LessonId } from '@/guide/lessons';
import { useTourStore } from '@/guide/tourStore';
import { useAuthStore } from '@/store/authStore';

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
    useAuthStore.setState({ accessToken: null });
    getHabits.mockReset();
  });
  afterEach(() => cleanup());

  it('should show the streak after the close for a signed-in learner, then finish on Continue', async () => {
    useAuthStore.setState({ accessToken: 'token' });
    getHabits.mockResolvedValue({
      badges: [],
      learningDays: 2,
      streakDays: 2,
      thisWeek: [true, true, false, false, false, false, false],
    });
    at(lessonScreens(lesson).length - 1);
    renderSheet();
    fireEvent.click(screen.getByText('Finish for now'));
    // The lesson waits on the streak screen; nothing has finished yet
    expect(useLessonStore.getState().activeId).toBe('lesson-02');
    await waitFor(() => expect(screen.getByText('2-day streak')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-guide="lesson.streak.continue"]')!);
    await waitFor(() => expect(useLessonStore.getState().activeId).toBeNull());
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
  });

  it('should finish straight away for a guest (no streak to show)', async () => {
    at(lessonScreens(lesson).length - 1);
    renderSheet();
    fireEvent.click(screen.getByText('Finish for now'));
    await waitFor(() => expect(useLessonStore.getState().activeId).toBeNull());
    expect(getHabits).not.toHaveBeenCalled();
  });

  it('should render nothing while no lesson runs', () => {
    renderSheet();
    expect(sheet()).toBeNull();
  });

  it('should open Lesson 3 on the flash crash drawn from our own candles, and step through the cards', () => {
    at(0);
    renderSheet();
    expect(sheet()!.textContent).toContain('One bitcoin for $8,200');
    // No photo (owner 2026-11-12): Bybit's minute candles, with Binance.US's wick drawn
    expect(sheet()!.querySelector('[data-lesson-art="flashCrash"]')).not.toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.keyDown(sheet()!, { key: 'Enter' }); // the beats in at once
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
    // Right or not, then why: the choice isn't repeated (owner 2026-11-13)
    expect(sheet()!.textContent).not.toContain('You picked');
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
    // Berwyn asked, so Berwyn grins: the guide stays through the answer (owner 2026-11-08)
    expect(sheet()!.querySelector('[data-mood="grin"]')?.getAttribute('data-guide-who')).toBe(
      'tock'
    );
    expect(sheet()!.querySelector('[data-guide-who="tick"]')).toBeNull();
  });

  it('should step aside for the tour, then come back on the questions when it ends', () => {
    at(8); // try it (the moment and two cards come before it)
    renderSheet();
    fireEvent.click(screen.getByText('Show me'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('primer');
    expect(sheet()).toBeNull();

    act(() => useTourStore.getState().close()); // skipped, closed or finished: the same
    expect(useLessonStore.getState().inTour).toBe(false);
    expect(useLessonStore.getState().screen).toBe(9);
    expect(sheet()!.textContent).toContain('Check yourself');
  });

  it('should offer no tour on a phone, only a way on', () => {
    desktop = false;
    at(8);
    renderSheet();
    expect(screen.queryByText('Show me')).toBeNull();
    expect(sheet()!.textContent).toContain('larger screen');
    fireEvent.click(screen.getByText('Continue'));
    expect(useLessonStore.getState().screen).toBe(9);
  });

  it('should save the note to the journal on the last screen, and say so', async () => {
    addJournalNote.mockResolvedValue(null);
    at(13);
    renderSheet();
    const save = screen.getByText('Save to journal') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: '  How fees work  ' },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('✓ Saved to your journal')
    );
    expect(addJournalNote).toHaveBeenCalledWith('How fees work');
    // The lesson stays on its last screen: the way on is the learner's choice
    expect(useLessonStore.getState().screen).toBe(13);
  });

  it('should say so when the note cannot be saved, and still let the learner go on', async () => {
    addJournalNote.mockResolvedValue('Network error');
    at(13);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByText('Save to journal'));
    await waitFor(() => expect(sheet()!.textContent).toContain('Could not save'));
    expect(screen.queryByText('Skip')).toBeNull();
    fireEvent.click(screen.getByText('Finish for now'));
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
    // the failed line isn't sent again on the way out
    expect(addJournalNote).toHaveBeenCalledTimes(1);
  });

  it('should save a journal line typed but not saved when the learner goes on', async () => {
    addJournalNote.mockResolvedValue(null);
    at(13);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: ' Fees come off the top ' },
    });
    fireEvent.click(screen.getByText('Finish for now'));
    expect(addJournalNote).toHaveBeenCalledWith('Fees come off the top');
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
  });

  it('should not save a journal line twice', async () => {
    addJournalNote.mockResolvedValue(null);
    at(13);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'Once' },
    });
    fireEvent.click(screen.getByText('Save to journal'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('✓ Saved to your journal')
    );
    fireEvent.click(screen.getByText('Finish for now'));
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
    expect(addJournalNote).toHaveBeenCalledTimes(1);
  });

  it('should end on the ribbon, the journal and an optional rating, and finish', () => {
    at(13);
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.finish-line"]')).not.toBeNull();
    expect(document.querySelector('[data-guide="lesson.note"]')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('4 of 5'));
    expect(useLessonStore.getState().rating).toBe(4);
    expect(screen.getByLabelText('4 of 5').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByText('Finish for now'));
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    expect(sheet()).toBeNull();
  });

  it('should finish and start the next tour from the close', () => {
    at(13);
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
    at(2, 'lesson-ownership'); // One ledger, thousands of copies: [[ledger]], [[nodes|node]]
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
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    expect(document.querySelector('[data-guide="lesson.peek"]')!.textContent).toContain('Ledger');
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.close"]')!);
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should close a peek when the learner moves to another card', () => {
    at(2, 'lesson-ownership');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"]')!);
    fireEvent.click(nextBtn()!);
    fireEvent.click(screen.getByText('← Back'));
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should open the article from a peek, wait behind it, and come back on the same card', () => {
    at(1); // Two queues meet
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
    expect(sheet()!.textContent).toContain('Two queues meet');
  });

  it('should keep a history card’s drawn picture when the chart can’t load', async () => {
    at(4); // Tesla
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

  it('should sum Lesson 3 up in four lines, each opening its article at the section', () => {
    at(12); // the summary (rebuilt 2026-11-12: a recap, no longer "You can now")
    renderSheet();
    expect(document.querySelector('#lesson-heading')!.textContent).toBe('Who sets the price?');
    expect(sheet()!.textContent).not.toContain('You can now');
    expect(document.querySelectorAll('[data-guide="lesson.recap"]')).toHaveLength(4);
    expect(document.querySelector('[data-guide="lesson.highlight"]')!.textContent).toContain(
      'The price is people'
    );
    fireEvent.click(
      document.querySelector('[data-guide="lesson.recap"][data-guide-key="volatility"]')!
    );
    expect(useArticleStore.getState()).toMatchObject({
      openId: 'price-swings',
      section: 'volatility',
      from: { lesson: 'lesson-02', screen: 12 },
    });
  });

  it('should put the moment after the Tesla card and go on teaching after it', () => {
    at(5);
    renderSheet();
    expect(sheet()!.textContent).toContain('Your call');
    fireEvent.click(option(getLesson('lesson-02').moment.correct));
    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(6);
    expect(sheet()!.textContent).toContain('Big swings, both ways');
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
    expect(nextBtn()!.textContent).toBe('Unlock the story of Bitcoin →');

    fireEvent.keyDown(sheet()!, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(1);
    expect(sheet()!.textContent).toContain('I’m Pulin.');
    expect(sheet()!.textContent).toContain('what one record keeper could get away with');
    expect(nextBtn()!.textContent).toBe('Start with money itself →');

    // Back to the cold open: it doesn't play again
    fireEvent.click(screen.getByText('← Back'));
    expect(nextBtn()!.dataset.ready).toBe('true');
  });

  it('should hold Next while the guides meet, show it all on Enter, then move on', () => {
    at(1, 'lesson-01');
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.meet"]')!.textContent).toContain(
      'I’m Berwyn.'
    );
    expect(nextBtn()!.dataset.ready).toBe('false');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(1);
    expect(nextBtn()!.dataset.ready).toBe('true');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(2);
  });

  it('should open on the real photo, credited, with no guide beside it', () => {
    at(0, 'lesson-01');
    renderSheet();
    const photo = document.querySelector('[data-guide="lesson.photo"]')!;
    expect(photo.querySelector('img')!.getAttribute('alt')).toMatch(/Laszlo Hanyecz/);
    expect(photo.textContent).toBe('Photo: Laszlo Hanyecz');
    expect(sheet()!.querySelector('[data-guide-who]')).toBeNull();
  });

  it('should open Lesson 2 on its photo with no credit line when it has none', () => {
    at(0, 'lesson-ownership');
    renderSheet();
    const photo = document.querySelector('[data-guide="lesson.photo"]')!;
    expect(photo.querySelector('img')!.getAttribute('alt')).toMatch(/James Howells/);
    expect(photo.querySelector('figcaption')).toBeNull();
    expect(sheet()!.querySelector('[data-guide-who]')).toBeNull();
  });

  it('should show the cold open’s lines at a tap on them', () => {
    at(0, 'lesson-01');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.beats"]')!);
    expect(nextBtn()!.dataset.ready).toBe('true');
    expect(useLessonStore.getState().screen).toBe(0);
  });

  it('should say Continue where a card names nothing, and not move on from an unanswered question', () => {
    at(6, 'lesson-ownership'); // Who holds your key?
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
    at(6, 'lesson-01');
    renderSheet();
    expect(sheet()!.textContent).toContain('be Nora');
    expect(screen.queryByText('Show me')).toBeNull();
    fireEvent.change(document.querySelector('[data-guide="article.nora.amount"]')!, {
      target: { value: '30' },
    });
    expect(sheet()!.textContent).toContain('still add up to 15');
    fireEvent.click(document.querySelector('[data-guide="lesson.try"]')!);
    expect(useLessonStore.getState().screen).toBe(7);
  });

  it('should finish Lesson 1 and open Lesson 2 from its close, on any screen', () => {
    desktop = false;
    at(11, 'lesson-01');
    renderSheet();
    const nextLesson = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    expect(nextLesson.textContent).toBe('Lesson 2: What is Bitcoin?');
    fireEvent.click(nextLesson);
    expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-ownership', screen: 0 });
    expect(sheet()!.textContent).toContain('A hard drive in the bin');
  });

  it('should sum Lesson 1 up as the problem, then the story of 2008, then go on', () => {
    at(10, 'lesson-01');
    renderSheet();
    expect(document.querySelector('#lesson-heading')!.textContent).toBe('The problem');
    expect(sheet()!.textContent).not.toContain('You can now');
    // A Read more on each problem while it's on screen; none at the very end (owner 2026-11-12:
    // Lesson 2 goes on)
    expect(document.querySelectorAll('[data-guide="lesson.recap"]')).toHaveLength(2);
    // Only now, with the problem on the table, does the lesson name Satoshi: in the story, which
    // ends on the Bitcoin mark and the last line (owner 2026-11-12)
    const story = document.querySelector('[data-guide="lesson.genesis"]')!;
    expect(story.textContent).toContain('Satoshi Nakamoto');
    const highlight = document.querySelector('[data-guide="lesson.highlight"]')!;
    expect(highlight.textContent).toContain('That was the birth of Bitcoin.');
    // No rule, no teaser, no stars here: they're gone, or on the last screen
    expect(document.querySelector('[data-guide="lesson.rating"]')).toBeNull();
    expect(document.querySelector('[data-guide="lesson.finish-line"]')).toBeNull();

    expect(highlight.querySelector('button')).toBeNull();
  });

  it('should open the Bitcoin card’s Read more on Lesson 2’s story article', () => {
    at(1, 'lesson-ownership'); // Money that no one controls
    renderSheet();
    expect(sheet()!.querySelector('[data-lesson-art="bitcoin"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-guide="lesson.more"]')!);
    expect(useArticleStore.getState()).toMatchObject({ openId: 'bitcoin-story' });
  });

  it('should tease the next lesson on the close, but not on a look back', () => {
    at(11, 'lesson-01');
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.teaser"]')!.textContent).toBe(
      getLesson('lesson-01').teaser
    );
    act(() =>
      useLessonStore.setState({
        returnTo: { lesson: 'lesson-ownership', screen: 2, answers: {}, rating: null },
      })
    );
    expect(document.querySelector('[data-guide="lesson.teaser"]')).toBeNull();
  });

  it('should hold Continue while the birth of Bitcoin plays, show it all on Enter, and not replay it', () => {
    at(10, 'lesson-01');
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.genesis"]')).not.toBeNull();
    expect(nextBtn()!.dataset.ready).toBe('false');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(10);
    expect(nextBtn()!.dataset.ready).toBe('true');
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(11);
    // Back to it (the last screen has no Back button of its own): complete, Continue there at once
    act(() => useLessonStore.getState().back());
    expect(useLessonStore.getState().screen).toBe(10);
    expect(nextBtn()!.dataset.ready).toBe('true');
  });

  it('should show a summary with no genesis at once', () => {
    at(12); // Lesson 3
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.genesis"]')).toBeNull();
    expect(nextBtn()!.dataset.ready).toBe('true');
  });

  it('should end Lesson 1 on the ribbon, the journal, the rating and the way to Lesson 2', () => {
    at(10, 'lesson-01');
    renderSheet();
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(11);
    expect(document.querySelector('[data-guide="lesson.finish-line"]')).not.toBeNull();
    expect(document.querySelector('[data-guide="lesson.note"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-guide="lesson.rating"]')).toHaveLength(5);
    // The way on comes last on the screen, first in its stack; finishing for now under it
    const next = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    const later = document.querySelector('[data-guide="lesson.finish"]')!;
    expect(next.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const stars = document.querySelector('[data-guide="lesson.rating"]')!;
    expect(stars.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ── Lesson 2 (owner 2026-11-08): split from Lesson 1, and it says where a term came from ──

  it('should run Lesson 2’s stamp inside the sheet, and lead to Lesson 3', () => {
    desktop = false;
    at(8, 'lesson-ownership');
    renderSheet();
    expect(sheet()!.textContent).toContain('Now be Sneaky Sam');
    fireEvent.click(
      document.querySelector('[data-guide="article.stamp.try"][data-guide-key="sam"]')!
    );
    expect(sheet()!.textContent).toContain('✗ Not Sofia’s mark');
    act(() => useLessonStore.getState().start('lesson-ownership', 13));
    expect(document.querySelector('[data-guide="lesson.next-lesson"]')!.textContent).toBe(
      'Lesson 3: Who sets the price?'
    );
  });

  it('should show where Lesson 1 taught a term, open that card, and come back', () => {
    at(2, 'lesson-ownership'); // One ledger, thousands of copies
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    const from = document.querySelector('[data-guide="lesson.peek.from"]')!;
    expect(from.textContent).toBe('From Lesson 1: A notebook, not coins →');
    // A term first taught here says nothing of the kind
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="node"]')!);
    expect(document.querySelector('[data-guide="lesson.peek.from"]')).toBeNull();

    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.from"]')!);
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-01', screen: 3 });
    const back = document.querySelector('[data-guide="lesson.return"]')!;
    expect(back.textContent).toBe('← Back to Lesson 2');
    fireEvent.click(back);
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-ownership',
      screen: 2,
      returnTo: null,
    });
    expect(document.querySelector('[data-guide="lesson.return"]')).toBeNull();
  });

  it('should save a journal line typed on a look back’s last screen when Esc leads back', async () => {
    addJournalNote.mockResolvedValue(null);
    at(2, 'lesson-ownership');
    renderSheet();
    act(() => {
      useLessonStore
        .getState()
        .visit('lesson-01', lessonScreens(getLesson('lesson-01')).length - 1);
    });
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'One keeper' },
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(addJournalNote).toHaveBeenCalledWith('One keeper');
    await waitFor(() =>
      expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-ownership', screen: 2 })
    );
  });

  it('should close only a term’s peek on Esc, and the lesson on the next Esc', () => {
    at(2, 'lesson-ownership');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
    expect(useLessonStore.getState().activeId).toBe('lesson-ownership');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBeNull();
  });

  it('should keep the journal line on a last screen with no Back, terms or Read more', () => {
    // afterNote.ts relies on it: every way off this screen saves the line first
    for (const id of ['lesson-01', 'lesson-ownership', 'lesson-02'] as const) {
      cleanup();
      at(lessonScreens(getLesson(id)).length - 1, id);
      renderSheet();
      expect(document.querySelector('[data-guide="lesson.note"]')).not.toBeNull();
      for (const anchor of [
        'lesson.back',
        'lesson.term',
        'lesson.recap',
        'lesson.can-do',
        'lesson.highlight',
        'lesson.next',
      ]) {
        expect(document.querySelector(`[data-guide="${anchor}"]`)).toBeNull();
      }
    }
  });

  it('should hold every way out while a journal save is on its way, then do the first one asked', async () => {
    let land: (v: null) => void = () => undefined;
    addJournalNote.mockImplementation(() => new Promise<null>((resolve) => (land = resolve)));
    at(13);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'Slow line' },
    });
    fireEvent.click(screen.getByText('Finish for now'));
    expect(useLessonStore.getState().noteStatus).toBe('saving');
    expect(document.querySelector('[data-guide="lesson.note.save"]')!.textContent).toBe(
      'Saving your line…'
    );
    // The line itself is locked: what's saved is what the learner sees
    expect(
      document.querySelector<HTMLTextAreaElement>('[data-guide="lesson.note"]')!.readOnly
    ).toBe(true);
    // ✕ and Esc wait with it (enabled, so the focus never falls out), and don't undo the Finish
    fireEvent.click(document.querySelector('[data-guide="lesson.close"]')!);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBe('lesson-02');

    await act(async () => land(null));
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    expect(addJournalNote).toHaveBeenCalledTimes(1);
  });

  it('should keep Tab inside the sheet, and leave Esc to the map when it’s open over it', () => {
    at(13);
    renderSheet();
    const sheetEl = document.querySelector<HTMLElement>('[data-guide="lesson.sheet"]')!;
    const focusable = [
      ...sheetEl.querySelectorAll<HTMLElement>('button:not([disabled]), textarea'),
    ];
    focusable.at(-1)!.focus();
    fireEvent.keyDown(sheetEl, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(sheetEl, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusable.at(-1));

    act(() => useTourStore.setState({ panelOpen: true }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBe('lesson-02');
    act(() => useTourStore.setState({ panelOpen: false }));
  });

  it('should wrap Tab past a Next still waiting for its cold open, and not move on under the map', () => {
    at(0, 'lesson-01');
    renderSheet();
    const sheetEl = document.querySelector<HTMLElement>('[data-guide="lesson.sheet"]')!;
    const x = document.querySelector<HTMLElement>('[data-guide="lesson.close"]')!;
    x.focus();
    // ✕ is the only control Tab can reach while the lines play: it wraps onto itself
    fireEvent.keyDown(sheetEl, { key: 'Tab' });
    expect(document.activeElement).toBe(x);

    act(() => useTourStore.setState({ panelOpen: true }));
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(0);
    act(() => useTourStore.setState({ panelOpen: false }));
    // The map closed: the sheet takes the focus back
    expect(document.activeElement).toBe(sheetEl);
  });

  it('should close a term’s peek when the lesson changes under it', () => {
    at(2, 'lesson-ownership');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    expect(document.querySelector('[data-guide="lesson.peek"]')).not.toBeNull();
    act(() => useLessonStore.getState().visit('lesson-01', 1));
    act(() => useLessonStore.getState().returnBack());
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-ownership', screen: 2 });
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should keep Lesson 2’s answers through a look back, and offer the way back at its end', () => {
    at(2, 'lesson-ownership');
    act(() => {
      useLessonStore.setState({ answers: { 8: 0 } });
    });
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.from"]')!);

    // Lesson 1's last screen leads back to Lesson 2, not on to it from the start
    const last = lessonScreens(getLesson('lesson-01')).length - 1;
    act(() => useLessonStore.setState({ screen: last }));
    const way = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    expect(way.textContent).toBe('Back to Lesson 2: What is Bitcoin?');
    expect(screen.queryByText('Finish for now')).toBeNull();
    fireEvent.click(way);
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-ownership',
      screen: 2,
      answers: { 8: 0 },
      finishes: 0,
    });
  });
});
