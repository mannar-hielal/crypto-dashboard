import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { GuidesMeet } from '@/guide/GuidesMeet';
import { getLesson } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

const meet = getLesson('lesson-01').cards[1].meet!;
const scene = () => document.querySelector(guideSelector('lesson.meet'))!;
const shown = () =>
  [...scene().querySelectorAll<HTMLElement>('[data-shown]')].map((el) => el.dataset.shown);

describe('GuidesMeet', () => {
  beforeEach(() => {
    reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should keep every word in the page, so a screen reader reads the whole card', () => {
    render(<GuidesMeet meet={meet} done={false} onDone={() => {}} />);
    const text = scene().textContent;
    for (const words of [meet.tick, meet.tock, meet.lead, ...meet.list]) {
      expect(text).toContain(words);
    }
  });

  it('should bring Pulin in first, then Berwyn, then the list, and say when it is over', () => {
    const onDone = vi.fn();
    render(<GuidesMeet meet={meet} done={false} onDone={onDone} />);
    // Tick is on his way in; nothing else yet
    expect(shown()).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    act(() => vi.advanceTimersByTime(700));
    expect(shown().slice(0, 3)).toEqual(['true', 'true', 'false']);
    expect(onDone).not.toHaveBeenCalled();
    // Each step's timer starts once the one before is in
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(700));
    expect(shown().every((s) => s === 'true')).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should show everything when the learner taps', () => {
    const onDone = vi.fn();
    render(<GuidesMeet meet={meet} done={false} onDone={onDone} />);
    fireEvent.click(scene());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should show everything at once with reduced motion, or when seen before', () => {
    reduced = true;
    const onDone = vi.fn();
    render(<GuidesMeet meet={meet} done={false} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(shown().every((s) => s === 'true')).toBe(true);

    cleanup();
    reduced = false;
    render(<GuidesMeet meet={meet} done onDone={onDone} />);
    expect(shown().every((s) => s === 'true')).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
