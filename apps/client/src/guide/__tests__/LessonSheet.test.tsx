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
/** The close's Finish (Lesson 3's close: its only button) */
const finishBtn = () => document.querySelector<HTMLButtonElement>('[data-guide="lesson.finish"]')!;
const option = (i: number) =>
  document.querySelector<HTMLButtonElement>(`[data-guide="lesson.option"][data-guide-key="${i}"]`)!;

const renderSheet = () =>
  render(
    <MemoryRouter>
      <LessonSheet />
    </MemoryRouter>
  );

/** Jump straight to a screen of a lesson (Lesson 3 by default) */
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
    useTourStore.setState({ loaded: true }); // the account's progress is in
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
    // A keyboard press: the focus sits on the button that is about to go
    act(() => finishBtn().focus());
    fireEvent.click(finishBtn());
    await waitFor(() => expect(screen.getByText('2-day streak')).toBeTruthy());
    // The lesson waits on the streak screen, already counted as finished: a closed tab loses nothing
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-02',
      completed: { 'lesson-02': true },
      finishes: 1,
    });
    // The pressed button is gone: the sheet takes the focus, so the streak is read out
    expect(document.activeElement).toBe(sheet());
    fireEvent.click(document.querySelector('[data-guide="lesson.streak.continue"]')!);
    await waitFor(() => expect(useLessonStore.getState().activeId).toBeNull());
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
  });

  it('should never show the same finish’s streak twice after the learner left the close another way', async () => {
    useAuthStore.setState({ accessToken: 'token' });
    getHabits.mockResolvedValue({
      badges: [],
      learningDays: 2,
      streakDays: 2,
      thisWeek: [true, true, false, false, false, false, false],
    });
    const last = lessonScreens(lesson).length - 1;
    at(last);
    renderSheet();
    fireEvent.click(finishBtn());
    await waitFor(() => expect(screen.getByText('2-day streak')).toBeTruthy());
    // Opened again at a card from the map (the same run), then back to the close
    act(() => useLessonStore.setState({ screen: 0 }));
    act(() => useLessonStore.setState({ screen: last }));
    expect(screen.queryByText('2-day streak')).toBeNull();
    expect(finishBtn()).toBeTruthy();
  });

  it('should still show the streak when Finish is pressed again after a journal line failed to save', async () => {
    useAuthStore.setState({ accessToken: 'token' });
    getHabits.mockResolvedValue({
      badges: [],
      learningDays: 1,
      streakDays: 1,
      thisWeek: [true, false, false, false, false, false, false],
    });
    addJournalNote.mockResolvedValueOnce('Network error');
    at(lessonScreens(lesson).length - 1);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'A line' },
    });
    fireEvent.click(finishBtn());
    await waitFor(() => expect(sheet()!.textContent).toContain('Could not save'));
    // Pressed again: the finish goes through, and its streak shows
    fireEvent.click(finishBtn());
    await waitFor(() => expect(screen.getByText('1-day streak')).toBeTruthy());
  });

  it('should still finish when the streak screen is closed with ✕ or Esc', async () => {
    useAuthStore.setState({ accessToken: 'token' });
    getHabits.mockResolvedValue({
      badges: [],
      learningDays: 1,
      streakDays: 1,
      thisWeek: [true, false, false, false, false, false, false],
    });
    at(lessonScreens(lesson).length - 1);
    renderSheet();
    fireEvent.click(finishBtn());
    await waitFor(() => expect(screen.getByText('1-day streak')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Close the lesson'));
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
  });

  it('should only finish (never open the next lesson) when the streak screen is closed with ✕', async () => {
    useAuthStore.setState({ accessToken: 'token' });
    getHabits.mockResolvedValue({
      badges: [],
      learningDays: 1,
      streakDays: 1,
      thisWeek: [true, false, false, false, false, false, false],
    });
    at(lessonScreens(getLesson('lesson-01')).length - 1, 'lesson-01');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.next-lesson"]')!);
    await waitFor(() => expect(screen.getByText('1-day streak')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Close the lesson'));
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-01']).toBe(true));
    expect(useLessonStore.getState().activeId).toBeNull();
  });

  it('should finish straight away for a guest (no streak to show)', async () => {
    at(lessonScreens(lesson).length - 1);
    renderSheet();
    fireEvent.click(finishBtn());
    await waitFor(() => expect(useLessonStore.getState().activeId).toBeNull());
    expect(getHabits).not.toHaveBeenCalled();
  });

  it('should not move on past Try when another tour took its tour’s place (review 2026-11-16)', () => {
    const tryAt = lessonScreens(getLesson('lesson-01')).findIndex((x) => x.kind === 'try');
    at(tryAt, 'lesson-01');
    renderSheet();
    act(() => {
      useLessonStore.getState().enterTour('buy-first-coin');
      useTourStore.getState().start('buy-first-coin');
    });
    // The primer starts straight over it: not the buy tour's next chapter, not handed over
    act(() => useTourStore.getState().start('primer'));
    act(() => useTourStore.getState().close());
    expect(useLessonStore.getState()).toMatchObject({ inTour: false, screen: tryAt });
  });

  it('should move on past Try after the tour’s own next chapter ends (buy → sell)', () => {
    const tryAt = lessonScreens(getLesson('lesson-01')).findIndex((x) => x.kind === 'try');
    at(tryAt, 'lesson-01');
    renderSheet();
    act(() => {
      useLessonStore.getState().enterTour('buy-first-coin');
      useTourStore.getState().start('buy-first-coin');
    });
    act(() => useTourStore.getState().start('sell-and-review'));
    act(() => useTourStore.getState().close());
    expect(useLessonStore.getState()).toMatchObject({ inTour: false, screen: tryAt + 1 });
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
    // Not quite: no way on yet, only another go (owner 2026-11-17)
    expect(nextBtn()!.disabled).toBe(true);
    expect(option(0).disabled).toBe(true);
    // Only the wrong pick is marked: the right option isn't pointed at, so the next go still asks
    expect(option(lesson.moment.correct).className).not.toMatch(/right/);
    expect(option(1).className).toMatch(/wrong/);
    fireEvent.click(document.querySelector('[data-guide="lesson.retry"]')!);
    expect(sheet()!.textContent).not.toContain('Not quite.');
    expect(option(0).disabled).toBe(false);
    expect(document.activeElement).toBe(sheet());
    fireEvent.click(option(lesson.moment.correct));
    expect(sheet()!.textContent).toContain('Right.');
    expect(document.querySelector('[data-guide="lesson.retry"]')).toBeNull();
    expect(nextBtn()!.disabled).toBe(false);
  });

  it('should clear a wrong answer on Back, so the board starts afresh on the way forward', () => {
    at(5); // the moment
    renderSheet();
    fireEvent.click(option(1));
    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(5);
    expect(sheet()!.textContent).not.toContain('Not quite.');
    expect(nextBtn()!.disabled).toBe(true);
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
    at(18); // try it (the moment and the cards come before it)
    renderSheet();
    fireEvent.click(screen.getByText('Show me'));

    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('primer');
    expect(sheet()).toBeNull();

    act(() => useTourStore.getState().close()); // skipped, closed or finished: the same
    expect(useLessonStore.getState().inTour).toBe(false);
    // The quizzes sit between the cards (2026-11-16): straight on to the summary
    expect(useLessonStore.getState().screen).toBe(19);
    expect(sheet()!.textContent).toContain('What moves a price');
  });

  it('should offer no tour on a phone, only a way on', () => {
    // The primer's hover steps need a pointer: no phone path (2026-11-16)
    desktop = false;
    at(18);
    renderSheet();
    expect(screen.queryByText('Show me')).toBeNull();
    expect(sheet()!.textContent).toContain('larger screen');
    fireEvent.click(screen.getByText('Continue'));
    expect(useLessonStore.getState().screen).toBe(19);
  });

  it('should save the note to the journal on the last screen, and say so', async () => {
    addJournalNote.mockResolvedValue(null);
    at(20);
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
    expect(useLessonStore.getState().screen).toBe(20);
  });

  it('should say so when the note cannot be saved, and still let the learner go on', async () => {
    addJournalNote.mockResolvedValue('Network error');
    at(20);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByText('Save to journal'));
    await waitFor(() => expect(sheet()!.textContent).toContain('Could not save'));
    expect(screen.queryByText('Skip')).toBeNull();
    fireEvent.click(finishBtn());
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
    // the failed line isn't sent again on the way out
    expect(addJournalNote).toHaveBeenCalledTimes(1);
  });

  it('should save a journal line typed but not saved when the learner goes on', async () => {
    addJournalNote.mockResolvedValue(null);
    at(20);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: ' Fees come off the top ' },
    });
    fireEvent.click(finishBtn());
    expect(addJournalNote).toHaveBeenCalledWith('Fees come off the top');
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
  });

  it('should not save a journal line twice', async () => {
    addJournalNote.mockResolvedValue(null);
    at(20);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'Once' },
    });
    fireEvent.click(screen.getByText('Save to journal'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('✓ Saved to your journal')
    );
    fireEvent.click(finishBtn());
    await waitFor(() => expect(useLessonStore.getState().completed['lesson-02']).toBe(true));
    expect(addJournalNote).toHaveBeenCalledTimes(1);
  });

  it('should end on the ribbon, the journal and an optional rating, and finish', () => {
    at(20);
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.finish-line"]')).not.toBeNull();
    expect(document.querySelector('[data-guide="lesson.note"]')).not.toBeNull();
    // Lesson 3 offers no way on: one Finish lesson (the one label set, owner 2026-11-17), and the
    // path shows what comes next
    expect(finishBtn().textContent).toBe('Finish lesson');
    expect(document.querySelector('[data-guide="lesson.next-lesson"]')).toBeNull();
    expect(document.querySelector('[data-guide="lesson.teaser"]')).toBeNull();

    fireEvent.click(screen.getByLabelText('4 of 5'));
    expect(useLessonStore.getState().rating).toBe(4);
    expect(screen.getByLabelText('4 of 5').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(finishBtn());
    expect(useLessonStore.getState().completed['lesson-02']).toBe(true);
    expect(sheet()).toBeNull();
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
    at(4, 'lesson-ownership'); // One record, many copies: [[ledger]], [[nodes|node]]
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
    at(4, 'lesson-ownership');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"]')!);
    fireEvent.click(nextBtn()!);
    fireEvent.click(screen.getByText('← Back'));
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should open the article from a peek, wait behind it, and come back on the same card', () => {
    at(11); // Thin or deep: [[liquidity]] (Lesson 2)
    renderSheet();
    fireEvent.click(
      document.querySelector('[data-guide="lesson.term"][data-guide-key="liquidity"]')!
    );
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.more"]')!);

    expect(useArticleStore.getState().openId).toBe('exchange-price');
    expect(useArticleStore.getState().from).toEqual({ lesson: 'lesson-02', screen: 11 });
    expect(sheet()).toBeNull(); // hidden while the article is open

    // Esc belongs to the drawer now: the lesson stays
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLessonStore.getState().activeId).toBe('lesson-02');

    act(() => useArticleStore.getState().close());
    expect(sheet()!.textContent).toContain('Thin or deep');
  });

  it('should keep a history card’s drawn picture when the chart can’t load', async () => {
    at(4); // Same news, either way: the halving
    renderSheet();
    await waitFor(() => expect(getCandles).toHaveBeenCalled());
    expect(getCandles.mock.calls[0]).toEqual([
      'BTCUSDT',
      '1d',
      61,
      'linear',
      Date.UTC(2024, 4, 31),
    ]);
    await waitFor(() =>
      expect(sheet()!.querySelector('[data-lesson-art="swings"]')).not.toBeNull()
    );
    // The presenter stands beside the chart slot
    expect(sheet()!.querySelector('[data-mood="thinking"]')).not.toBeNull();
  });

  it('should sum Lesson 3 up in four lines, each opening its article at the section', () => {
    at(19); // the summary
    renderSheet();
    expect(document.querySelector('#lesson-heading')!.textContent).toBe('What moves a price');
    expect(sheet()!.textContent).not.toContain('You can now');
    expect(document.querySelectorAll('[data-guide="lesson.recap"]')).toHaveLength(4);
    expect(document.querySelector('[data-guide="lesson.highlight"]')!.textContent).toContain(
      'Your plan decides, not the headline.'
    );
    fireEvent.click(document.querySelector('[data-guide="lesson.recap"][data-guide-key="news"]')!);
    expect(useArticleStore.getState()).toMatchObject({
      openId: 'price-swings',
      section: 'news',
      from: { lesson: 'lesson-02', screen: 19 },
    });
  });

  it('should put the moment after the halving card and go on teaching after it', () => {
    at(5);
    renderSheet();
    expect(sheet()!.textContent).toContain('Your call');
    fireEvent.click(option(getLesson('lesson-02').moment.correct));
    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(6);
    expect(sheet()!.textContent).toContain('The power of hype');
  });

  // ── The inline markup (owner 2026-11-17: **word** showed its asterisks) ──────────

  it('should set **bold** and *italic* apart on every card of every lesson, never showing a *', () => {
    for (const id of ['lesson-01', 'lesson-ownership', 'lesson-02'] as const) {
      const screens = lessonScreens(getLesson(id));
      screens.forEach((s, i) => {
        if (s.kind !== 'card') return;
        at(i, id);
        const { unmount } = renderSheet();
        fireEvent.keyDown(sheet()!, { key: 'Enter' }); // a cold open's lines in at once
        expect(sheet()!.textContent, `${id} screen ${i}`).not.toMatch(/\*|\[\[/);
        unmount();
      });
    }
    at(3, 'lesson-01'); // Buy and Sell
    renderSheet();
    const bold = [...sheet()!.querySelectorAll('p strong')].map((b) => b.textContent);
    expect(bold).toEqual(['Buy', 'Sell']);
  });

  it('should make a term in a guide’s line a button that opens its peek', () => {
    const l1 = getLesson('lesson-01');
    const screenIndex = lessonScreens(l1).findIndex(
      (s) => s.kind === 'card' && l1.cards[s.index].title === 'The market never sleeps'
    );
    at(screenIndex, 'lesson-01');
    renderSheet();
    const term = document.querySelector<HTMLButtonElement>(
      '[data-guide="lesson.term"][data-guide-key="slippage"]'
    )!;
    expect(term.textContent).toBe('slippage');
    fireEvent.click(term);
    expect(document.querySelector('[data-guide="lesson.peek"]')).not.toBeNull();
  });

  // ── The math, the analogy and pictures on top (owner 2026-11-17) ─────────────────

  /** The screen of a lesson's card, by its title */
  const cardScreen = (id: LessonId, title: string) => {
    const l = getLesson(id);
    return lessonScreens(l).findIndex((x) => x.kind === 'card' && l.cards[x.index].title === title);
  };

  it('should work the result out in numbered steps under the text, by Pulin in glasses', () => {
    at(cardScreen('lesson-01', 'The result'), 'lesson-01');
    renderSheet();
    const math = document.querySelector('[data-guide="lesson.math"]')!;
    expect(math.textContent).toContain('Let’s do the math.');
    expect(math.querySelector('[data-guide-who="tick"] [data-glasses]')).not.toBeNull();
    const steps = [...math.querySelectorAll('ol li')].map((li) => li.textContent);
    expect(steps).toHaveLength(6);
    expect(steps[0]).toBe('1.Price rise73,079 − 27,500 = 45,579');
    const answer = document.querySelector('[data-guide="lesson.math.answer"]')!;
    expect(answer.querySelectorAll('strong')).toHaveLength(2);
    expect(answer.textContent).toContain('$2,652');
    // The text first, then the math; no hindsight line, no chit-chat
    const text = sheet()!.querySelector('p')!;
    expect(text.compareDocumentPosition(math) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sheet()!.textContent).not.toMatch(/hindsight|Easy!/i);
  });

  it('should explain going short with the borrowing analogy, by Berwyn in glasses, before the practice', () => {
    at(cardScreen('lesson-01', 'Going short'), 'lesson-01');
    renderSheet();
    const analogy = document.querySelector('[data-guide="lesson.analogy"]')!;
    expect(analogy.querySelector('[data-guide-who="tock"] [data-glasses]')).not.toBeNull();
    expect(analogy.textContent).toMatch(/^Berwyn Think of it as borrowing\./);
    const practice = document.querySelector('[data-guide="lesson.practice"]')!;
    expect(
      analogy.compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(sheet()!.textContent).not.toContain('feels illegal');
  });

  it('should put every card’s picture above its text (owner 2026-11-17)', () => {
    for (const id of ['lesson-01', 'lesson-ownership', 'lesson-02'] as const) {
      const l = getLesson(id);
      lessonScreens(l).forEach((x, i) => {
        if (x.kind !== 'card') return;
        const card = l.cards[x.index];
        if (!card.text || !(card.art || card.chart || card.photo)) return;
        at(i, id);
        const { unmount } = renderSheet();
        const picture = sheet()!.querySelector(
          '[data-lesson-art], [data-guide="lesson.chart"], [data-guide="lesson.photo"]'
        )!;
        const text = [...sheet()!.querySelectorAll('p')].find((p) =>
          p.textContent?.startsWith(card.text!.replace(/\*|\[\[|\]\]/g, '').slice(0, 12))
        )!;
        expect(picture, `${id}: ${card.title}`).not.toBeNull();
        expect(
          picture.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
          `${id}: ${card.title}`
        ).toBeTruthy();
        unmount();
      });
    }
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
    // One label set (owner 2026-11-17): Continue, never a card's own words
    expect(nextBtn()!.textContent).toBe('Continue →');

    fireEvent.keyDown(sheet()!, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(1);
    expect(sheet()!.textContent).toContain('I’m Pulin.');
    expect(sheet()!.textContent).toContain('how you can win when a price goes up or down');
    expect(nextBtn()!.textContent).toBe('Continue →');

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

  it('should open Lesson 2 on its drawn cold open, with no photo and no guide', () => {
    at(0, 'lesson-ownership');
    renderSheet();
    expect(document.querySelector('[data-guide="lesson.photo"]')).toBeNull();
    expect(sheet()!.querySelector('[data-lesson-art="bitcoin"]')).not.toBeNull();
    expect(sheet()!.querySelector('[data-guide-who]')).toBeNull();
    expect(sheet()!.textContent).toContain('3 January 2009');
  });

  it('should show the cold open’s lines at a tap on them', () => {
    at(0, 'lesson-01');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.beats"]')!);
    expect(nextBtn()!.dataset.ready).toBe('true');
    expect(useLessonStore.getState().screen).toBe(0);
  });

  it('should not move on from an unanswered question', () => {
    at(15, 'lesson-ownership'); // NFTs, briefly
    renderSheet();
    expect(nextBtn()!.textContent).toBe('Continue →');
    fireEvent.keyDown(sheet()!, { key: 'ArrowRight' });
    expect(useLessonStore.getState().screen).toBe(16); // the moment
    fireEvent.keyDown(sheet()!, { key: 'Enter' });
    expect(useLessonStore.getState().screen).toBe(16);
  });

  // ── Lesson 1 (rewritten 2026-11-16): practice trades, a "Try it" on the chart, then Lesson 2 ──

  it('should hand a card’s practice trade to the tour, then carry on at the next screen', () => {
    at(3, 'lesson-01'); // Buy and Sell
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.practice"]')!);
    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('practice-buy');
    expect(useLessonStore.getState().inTour).toBe(true);
    // The tour ends (finished, skipped or closed): back to the lesson, one screen on
    act(() => useTourStore.getState().close());
    expect(useLessonStore.getState()).toMatchObject({ inTour: false, screen: 4 });
  });

  it('should wait through the look at what just happened after a practice trade, then carry on', () => {
    // Owner 2026-11-17: the trade's last step hands over to its review in the account panel
    at(3, 'lesson-01'); // Buy and Sell
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.practice"]')!);
    act(() => useTourStore.setState({ stepIndex: 4 })); // its last step: place the order
    act(() => useTourStore.getState().next()); // the order placed: on to the review
    expect(useTourStore.getState().activeId).toBe('review-buy');
    expect(useLessonStore.getState()).toMatchObject({ inTour: true, screen: 3 });
    expect(sheet()).toBeNull();
    // Its last step's button, Back to the lesson: the lesson carries on one screen on
    act(() => useTourStore.setState({ stepIndex: 2 }));
    act(() => useTourStore.getState().next());
    expect(useTourStore.getState().activeId).toBeNull();
    expect(useLessonStore.getState()).toMatchObject({ inTour: false, screen: 4 });
  });

  it('should offer Lesson 1’s “Try it” on a phone too, and wait for the whole buy → sell chain', () => {
    desktop = false;
    at(18, 'lesson-01');
    renderSheet();
    expect(sheet()!.textContent).not.toContain('needs a larger screen');
    fireEvent.click(document.querySelector('[data-guide="lesson.try"]')!);
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
    // The buy tour hands over to the sell tour: the lesson keeps waiting
    act(() => useTourStore.setState({ activeId: 'sell-and-review', stepIndex: 0 }));
    expect(useLessonStore.getState()).toMatchObject({ inTour: true, screen: 18 });
    act(() => useTourStore.getState().close());
    expect(useLessonStore.getState()).toMatchObject({ inTour: false, screen: 19 });
  });

  it('should finish Lesson 1 and open Lesson 2 from its close, on any screen', () => {
    desktop = false;
    at(20, 'lesson-01');
    renderSheet();
    const nextLesson = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    expect(nextLesson.textContent).toBe('Lesson 2: Money nobody controls');
    // With a way on, finishing stays the link under it (only a close with no way on says Finish lesson)
    expect(finishBtn().textContent).toBe('Finish for now');
    fireEvent.click(nextLesson);
    expect(useLessonStore.getState().completed['lesson-01']).toBe(true);
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-ownership', screen: 0 });
    expect(sheet()!.textContent).toContain('A headline in the first block');
  });

  it('should sum Lesson 1 up in five lines, a Read more only where an article exists', () => {
    at(19, 'lesson-01');
    renderSheet();
    expect(document.querySelector('#lesson-heading')!.textContent).toBe('What you learned');
    // Owner 2026-11-16: four lines have no article yet (plain text); price swings has one
    expect(document.querySelectorAll('[data-guide="lesson.recap"]')).toHaveLength(1);
    const highlight = document.querySelector('[data-guide="lesson.highlight"]')!;
    expect(highlight.textContent).toContain('Decide when and why before you click.');
    expect(highlight.querySelector('button')).toBeNull();
    expect(nextBtn()!.dataset.ready).toBe('true');
    // The summary's button: the one finish label, in every lesson (owner 2026-11-17)
    expect(nextBtn()!.textContent).toBe('Finish lesson');
    expect(document.querySelector('[data-guide="lesson.back"]')!.textContent).toBe('← Back');
  });

  it('should open the paper card’s Read more on Lesson 2’s story article', () => {
    at(3, 'lesson-ownership'); // A paper, then a block
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.more"]')!);
    expect(useArticleStore.getState()).toMatchObject({
      openId: 'bitcoin-story',
      section: 'timeline',
    });
  });

  it('should tease the next lesson on the close, but not on a look back', () => {
    at(20, 'lesson-01');
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

  it('should sum Lesson 2 up in three plain points, with no birth story (owner 2026-11-17)', () => {
    at(19, 'lesson-ownership');
    renderSheet();
    expect(document.querySelector('#lesson-heading')!.textContent).toBe('Why Bitcoin exists');
    expect(sheet()!.querySelectorAll('ol li')).toHaveLength(3);
    expect(sheet()!.textContent).not.toMatch(/Satoshi|Lehman|birth/);
    // Shown at once, nothing staged: the button is ready
    expect(nextBtn()!.dataset.ready).toBe('true');
    expect(nextBtn()!.textContent).toBe('Finish lesson');
  });

  it('should end Lesson 1 on the ribbon, the journal, the rating and the way to Lesson 2', () => {
    at(19, 'lesson-01');
    renderSheet();
    fireEvent.click(nextBtn()!);
    expect(useLessonStore.getState().screen).toBe(20);
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

  it('should run Lesson 2’s blockchain piece inside the sheet, and lead to Lesson 3', () => {
    desktop = false;
    at(18, 'lesson-ownership');
    renderSheet();
    expect(sheet()!.textContent).toContain('change a number in an old block');
    expect(screen.queryByText('Show me')).toBeNull();
    act(() => useLessonStore.getState().start('lesson-ownership', 20));
    expect(document.querySelector('[data-guide="lesson.next-lesson"]')!.textContent).toBe(
      'Lesson 3: News, swings and traps'
    );
  });

  it('should show where Lesson 1 taught a term, open that card, and come back', () => {
    at(2, 'lesson-02'); // Big swings, both ways
    renderSheet();
    fireEvent.click(
      document.querySelector('[data-guide="lesson.term"][data-guide-key="volatility"]')!
    );
    const from = document.querySelector('[data-guide="lesson.peek.from"]')!;
    expect(from.textContent).toBe('From Lesson 1: Smaller coins swing harder →');
    fireEvent.click(from);
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-01', screen: 16 });
    const back = document.querySelector('[data-guide="lesson.return"]')!;
    expect(back.textContent).toBe('← Back to Lesson 3');
    fireEvent.click(back);
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-02',
      screen: 2,
      returnTo: null,
    });
    expect(document.querySelector('[data-guide="lesson.return"]')).toBeNull();
  });

  it('should say nothing of the kind for a term first taught on that card', () => {
    at(4, 'lesson-ownership'); // One record, many copies
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    expect(document.querySelector('[data-guide="lesson.peek.from"]')).toBeNull();
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
    at(4, 'lesson-ownership');
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
    at(20);
    renderSheet();
    fireEvent.change(document.querySelector('[data-guide="lesson.note"]')!, {
      target: { value: 'Slow line' },
    });
    fireEvent.click(finishBtn());
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
    at(20);
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
    at(4, 'lesson-ownership');
    renderSheet();
    fireEvent.click(document.querySelector('[data-guide="lesson.term"][data-guide-key="ledger"]')!);
    expect(document.querySelector('[data-guide="lesson.peek"]')).not.toBeNull();
    act(() => useLessonStore.getState().visit('lesson-01', 1));
    act(() => useLessonStore.getState().returnBack());
    expect(useLessonStore.getState()).toMatchObject({ activeId: 'lesson-ownership', screen: 4 });
    expect(document.querySelector('[data-guide="lesson.peek"]')).toBeNull();
  });

  it('should keep Lesson 3’s answers through a look back, and offer the way back at its end', () => {
    at(2, 'lesson-02');
    act(() => {
      useLessonStore.setState({ answers: { 5: 0 } });
    });
    renderSheet();
    fireEvent.click(
      document.querySelector('[data-guide="lesson.term"][data-guide-key="volatility"]')!
    );
    fireEvent.click(document.querySelector('[data-guide="lesson.peek.from"]')!);

    // Lesson 1's last screen leads back to Lesson 3, not on to Lesson 2
    const last = lessonScreens(getLesson('lesson-01')).length - 1;
    act(() => useLessonStore.setState({ screen: last }));
    const way = document.querySelector('[data-guide="lesson.next-lesson"]')!;
    expect(way.textContent).toBe('Back to Lesson 3: News, swings and traps');
    expect(screen.queryByText('Finish for now')).toBeNull();
    fireEvent.click(way);
    expect(useLessonStore.getState()).toMatchObject({
      activeId: 'lesson-02',
      screen: 2,
      answers: { 5: 0 },
      finishes: 0,
    });
  });
});
