import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { counterValue, formatDollars } from '@/guide/beats';
import { BEAT_MS, CardBeats } from '@/guide/CardBeats';
import { getLesson, type Beat } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

const beats = getLesson('lesson-01').cards[0].beats!;
// No lesson uses a counter since 2026-10-28; the beat kind stays for a later card
const withCounter: Beat[] = [
  ...beats,
  {
    kind: 'counter',
    label: 'In 2025:',
    text: 'In 2025: over $1 billion.',
    from: 41,
    to: 1_000_000_000,
    prefix: 'over $',
  },
];
const lines = () =>
  [...document.querySelectorAll<HTMLElement>('[data-beat]')].map((el) => el.dataset.shown);

describe('CardBeats', () => {
  beforeEach(() => {
    reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should keep every line in the page, so a screen reader reads the whole card', () => {
    render(<CardBeats beats={withCounter} done={false} onDone={() => {}} />);
    const text = document.querySelector(guideSelector('lesson.beats'))!.textContent;
    expect(text).toContain('22 May 2010');
    expect(text).toContain('10,000 bitcoin');
    // The counter's words are its finished line, whatever the number on screen shows
    expect(text).toContain('In 2025: over $1 billion.');
    expect(text).toContain('worth over $1 billion!');
  });

  it('should bring the lines in one by one, then say the reveal is over', () => {
    const onDone = vi.fn();
    render(<CardBeats beats={beats} done={false} onDone={onDone} />);
    expect(lines().slice(0, 2)).toEqual(['true', 'false']);
    act(() => vi.advanceTimersByTime(BEAT_MS));
    expect(onDone).not.toHaveBeenCalled();
    // Each line's timer starts once the one before is in
    for (let i = 0; i < beats.length + 1; i++) act(() => vi.advanceTimersByTime(2_000));
    expect(lines().every((shown) => shown === 'true')).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should show everything when the learner taps, without leaving the card', () => {
    const onDone = vi.fn();
    render(<CardBeats beats={beats} done={false} onDone={onDone} />);
    fireEvent.click(document.querySelector(guideSelector('lesson.beats'))!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should show everything at once with reduced motion', () => {
    reduced = true;
    const onDone = vi.fn();
    render(<CardBeats beats={beats} done={false} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(lines().every((shown) => shown === 'true')).toBe(true);
  });

  it('should show the finished number when the card was seen before', () => {
    render(<CardBeats beats={withCounter} done onDone={() => {}} />);
    expect(document.querySelector('[aria-hidden="true"] strong')?.textContent).toBe(
      'over $1 billion'
    );
  });
});

describe('the counter', () => {
  it('should climb by the same factor each moment, from the start to the end', () => {
    expect(counterValue(41, 1e9, 0)).toBe(41);
    expect(counterValue(41, 1e9, 1)).toBeCloseTo(1e9);
    expect(counterValue(41, 1e9, 2)).toBeCloseTo(1e9);
    const mid = counterValue(41, 1e9, 0.5);
    expect(mid).toBeGreaterThan(100_000);
    expect(mid).toBeLessThan(1_000_000);
  });

  it('should read as words, not a wall of digits', () => {
    expect(formatDollars(41)).toBe('$41');
    expect(formatDollars(41_000)).toBe('$41 thousand');
    expect(formatDollars(1e9)).toBe('$1 billion');
  });
});
