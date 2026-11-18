import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let wide = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => wide }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { guideSelector } from '@/lib/guideAnchors';
import { CheckpointSheet } from '@/learn/CheckpointSheet';
import { getCheckpoint } from '@/learn/checkpoints';
import { usePathStore } from '@/learn/pathStore';

const checkpoint = getCheckpoint('checkpoint-ch1');

const renderSheet = () =>
  render(
    <MemoryRouter>
      <CheckpointSheet />
    </MemoryRouter>
  );

/** Answer each question through the screen: `pick(i)` is the option chosen for question i */
function answerAll(pick: (i: number) => number) {
  checkpoint.questions.forEach((_, i) => {
    fireEvent.click(document.querySelector(guideSelector('lesson.option', String(pick(i))))!);
    fireEvent.click(document.querySelector(guideSelector('checkpoint.next'))!);
  });
}

const wrongFor = (i: number) => (checkpoint.questions[i].correct === 0 ? 1 : 0);

describe('CheckpointSheet', () => {
  beforeEach(() => {
    wide = true;
    navigate.mockReset();
    usePathStore.getState().reset();
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
  });
  afterEach(() => cleanup());

  it('should render nothing when no checkpoint is being taken', () => {
    renderSheet();
    expect(document.querySelector(guideSelector('checkpoint.sheet'))).toBeNull();
  });

  it('should explain each answer and wait for one before moving on', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    const next = document.querySelector<HTMLButtonElement>(guideSelector('checkpoint.next'))!;
    expect(next.disabled).toBe(true);
    expect(screen.getByText('1 / 10')).toBeTruthy();

    fireEvent.click(
      document.querySelector(
        guideSelector('lesson.option', String(checkpoint.questions[0].correct))
      )!
    );
    expect(screen.getByText(/Right\./)).toBeTruthy();
    // The shared question view doesn't repeat the choice here either (owner 2026-11-13)
    expect(document.body.textContent).not.toContain('You picked');
    expect(next.disabled).toBe(false);
  });

  it('should pass at eight right, record it, and go back to the path', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => (i < 2 ? wrongFor(i) : checkpoint.questions[i].correct));

    expect(screen.getByText('Checkpoint passed')).toBeTruthy();
    expect(screen.getByText('8 of 10 right')).toBeTruthy();
    expect(usePathStore.getState().checkpoints).toEqual({ 'checkpoint-ch1': true });
    expect(document.querySelector(guideSelector('checkpoint.retry'))).toBeNull();

    fireEvent.click(document.querySelector(guideSelector('checkpoint.done'))!);
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useTourStore.getState().panelOpen).toBe(true);
  });

  it('should not pass at seven, point back to the lessons, and allow another try', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => (i < 3 ? wrongFor(i) : checkpoint.questions[i].correct));

    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(usePathStore.getState().checkpoints).toEqual({});
    // The three missed questions: the record's copies (Lesson 2), the plan's rule (Lesson 1) and
    // the price (Lesson 3)
    expect(
      document.querySelectorAll(guideSelector('checkpoint.review', 'lesson-ownership'))
    ).toHaveLength(1);
    expect(document.querySelectorAll(guideSelector('checkpoint.review', 'lesson-01'))).toHaveLength(
      1
    );

    fireEvent.click(document.querySelector(guideSelector('checkpoint.retry'))!);
    expect(screen.getByText('1 / 10')).toBeTruthy();
  });

  it('should open the lesson a missed question came from', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    fireEvent.click(document.querySelector(guideSelector('checkpoint.review', 'lesson-02'))!);
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useLessonStore.getState().activeId).toBe('lesson-02');
  });

  it('should start the Buy lesson first when a missed question points at Sell before Buy is done', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    // The anchor names where it goes: the Buy lesson, while Sell is locked behind it
    fireEvent.click(document.querySelector(guideSelector('checkpoint.review', 'buy-first-coin'))!);
    // Sell sells what Buy bought: locked until Buy is done (NEEDS_DONE), here as on the map
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
  });

  it('should name the Buy lesson on the Review button while Sell is locked behind it', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    const review = document.querySelector(guideSelector('checkpoint.review', 'buy-first-coin'))!;
    expect(review.textContent).toContain('Buy your first coin');
    expect(review.textContent).not.toContain('Sell it');
  });

  it('should move the Review to Sell once Buy is done, while the result is open', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    const review = (id: string) => document.querySelector(guideSelector('checkpoint.review', id));
    expect(review('buy-first-coin')!.textContent).toContain('Buy your first coin');
    act(() => useTourStore.setState({ completed: { 'buy-first-coin': true } }));
    expect(review('sell-and-review')!.textContent).toContain('Sell it and read the result');
  });

  it('should show one Review per place to go, never twin links', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    // Buy not done: every missed tour question leads to Buy, and only one button says so
    expect(
      document.querySelectorAll(guideSelector('checkpoint.review', 'buy-first-coin')).length
    ).toBe(1);
  });

  it('should send a missed tour question to the tour, on a phone too when the tour is phone-ready', () => {
    useTourStore.setState({ completed: { 'buy-first-coin': true } });
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    fireEvent.click(document.querySelector(guideSelector('checkpoint.review', 'sell-and-review'))!);
    expect(navigate).toHaveBeenCalledWith('/dashboard/spot/BTC/USDT');
    expect(useTourStore.getState().activeId).toBe('sell-and-review');

    cleanup();
    wide = false;
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    // sell-and-review is phone-ready (2026-11-16): the phone gets the button as well
    expect(
      document.querySelector(guideSelector('checkpoint.review', 'sell-and-review'))
    ).not.toBeNull();
  });

  it('should close from ✕ or Esc back to the path', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    fireEvent.click(screen.getByLabelText('Close the checkpoint'));
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useTourStore.getState().panelOpen).toBe(true);

    cleanup();
    useTourStore.getState().closePanel();
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useTourStore.getState().panelOpen).toBe(true);
  });
});
