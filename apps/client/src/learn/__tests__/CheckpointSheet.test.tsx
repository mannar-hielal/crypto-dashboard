import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByText('1 / 5')).toBeTruthy();

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

  it('should pass at four right, record it, and go back to the path', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => (i === 0 ? wrongFor(0) : checkpoint.questions[i].correct));

    expect(screen.getByText('Checkpoint passed')).toBeTruthy();
    expect(screen.getByText('4 of 5 right')).toBeTruthy();
    expect(usePathStore.getState().checkpoints).toEqual({ 'checkpoint-ch1': true });
    expect(document.querySelector(guideSelector('checkpoint.retry'))).toBeNull();

    fireEvent.click(document.querySelector(guideSelector('checkpoint.done'))!);
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useTourStore.getState().panelOpen).toBe(true);
  });

  it('should not pass at three, point back to the lessons, and allow another try', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => (i < 2 ? wrongFor(i) : checkpoint.questions[i].correct));

    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(usePathStore.getState().checkpoints).toEqual({});
    const reviews = document.querySelectorAll(
      guideSelector('checkpoint.review', 'lesson-ownership')
    );
    expect(reviews).toHaveLength(2);

    fireEvent.click(document.querySelector(guideSelector('checkpoint.retry'))!);
    expect(screen.getByText('1 / 5')).toBeTruthy();
  });

  it('should open the lesson a missed question came from', () => {
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    renderSheet();
    answerAll((i) => wrongFor(i));
    fireEvent.click(document.querySelector(guideSelector('checkpoint.review', 'lesson-02'))!);
    expect(usePathStore.getState().checkpointId).toBeNull();
    expect(useLessonStore.getState().activeId).toBe('lesson-02');
  });

  it('should send a missed tour question to the tour on a larger screen, and only name it on a phone', () => {
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
    expect(
      document.querySelector(guideSelector('checkpoint.review', 'sell-and-review'))
    ).toBeNull();
    expect(screen.getByText(/on a larger screen/)).toBeTruthy();
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
