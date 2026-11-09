import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { GENESIS_LAST, GenesisReveal } from '@/guide/GenesisReveal';
import { getLesson } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

const genesis = getLesson('lesson-01').recap!.genesis!;
const scene = () => document.querySelector<HTMLElement>(guideSelector('lesson.genesis'))!;
const renderScene = (onDone = vi.fn(), done = false) =>
  render(
    <GenesisReveal
      genesis={genesis}
      points={[
        { key: 'a', node: 'Printing more' },
        { key: 'b', node: 'Freezing accounts' },
      ]}
      highlight={<p>That was the birth of Bitcoin.</p>}
      done={done}
      onDone={onDone}
    />
  );

describe('GenesisReveal', () => {
  beforeEach(() => {
    reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should keep every word in the page, the whole headline included, from the start', () => {
    renderScene();
    const text = scene().textContent;
    expect(text).toContain(genesis.headline);
    expect(text).toContain('Block 0 · 3 January 2009');
    expect(text).toContain('That was the birth of Bitcoin.');
    expect(scene().dataset.step).toBe('1');
  });

  it('should run the problems, the dark, the headline, the block and the highlight, then say so', () => {
    const onDone = vi.fn();
    renderScene(onDone);
    for (let i = 0; i < 12 && !onDone.mock.calls.length; i++) {
      act(() => vi.advanceTimersByTime(2_000));
    }
    expect(scene().dataset.step).toBe(String(GENESIS_LAST));
    expect(scene().dataset.dark).toBe('true');
    expect(
      [...scene().querySelectorAll<HTMLElement>('[data-shown]')].every(
        (el) => el.dataset.shown === 'true'
      )
    ).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should keep a part not shown yet out of reach, so its hidden Read more can’t be used', () => {
    renderScene(vi.fn(), false);
    const parts = [...scene().querySelectorAll<HTMLElement>('li, div[data-shown]')];
    const highlight = parts.at(-1)!;
    expect(highlight.dataset.shown).toBe('false');
    expect(highlight.hasAttribute('inert')).toBe(true);
    // the first problem is in from the start
    expect(parts[0].hasAttribute('inert')).toBe(false);
  });

  it('should show everything at a tap', () => {
    const onDone = vi.fn();
    renderScene(onDone);
    fireEvent.click(scene());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should show the end at once with reduced motion', () => {
    reduced = true;
    const onDone = vi.fn();
    renderScene(onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(scene().dataset.step).toBe(String(GENESIS_LAST));
  });
});
