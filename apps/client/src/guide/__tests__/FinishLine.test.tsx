import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { FinishLine } from '@/guide/FinishLine';
import { guideSelector } from '@/lib/guideAnchors';

const scene = () => document.querySelector<HTMLElement>(guideSelector('lesson.finish-line'))!;

describe('FinishLine', () => {
  beforeEach(() => {
    reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should run the guides through the ribbon, then settle', () => {
    render(<FinishLine />);
    expect(scene().dataset.state).toBe('start');
    act(() => vi.advanceTimersByTime(750));
    expect(scene().dataset.state).toBe('broken');
    act(() => vi.advanceTimersByTime(900));
    expect(scene().dataset.state).toBe('done');
    // Decorative: the heading says the lesson is done
    expect(scene().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('should show the end at a tap', () => {
    render(<FinishLine />);
    fireEvent.click(scene());
    expect(scene().dataset.state).toBe('done');
  });

  it('should show the end at once with reduced motion', () => {
    reduced = true;
    render(<FinishLine />);
    expect(scene().dataset.state).toBe('done');
  });
});
