import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { GenesisReveal } from '@/guide/GenesisReveal';
import { BITCOIN_BIRTH } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

// The birth story Lesson 1 told until the rewrite; Lesson 2 tells it now (2026-11-16)
const story = BITCOIN_BIRTH;
// Steps: two problems, the clear, one per story line, the mark, the end line
const mark = 4 + story.lines.length;
const end = mark + 1;
const scene = () => document.querySelector<HTMLElement>(guideSelector('lesson.genesis'))!;
const renderScene = (onDone = vi.fn(), done = false) =>
  render(
    <GenesisReveal
      story={story}
      points={[
        { text: 'Printing more', node: 'Printing more' },
        { text: 'Freezing accounts', node: 'Freezing accounts' },
      ]}
      highlight={<span>That was the birth of Bitcoin.</span>}
      done={done}
      onDone={onDone}
    />
  );
/** The story lines on screen (the read-out copy is a `p` outside the stage) */
const lines = () => [...scene().querySelectorAll<HTMLElement>('p[aria-hidden="true"]')];
const finale = () => scene().querySelector<HTMLElement>('div[inert], div[aria-hidden]')!;

describe('GenesisReveal', () => {
  beforeEach(() => {
    reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should keep every word in the page from the start, and read the story out once, whole', () => {
    renderScene();
    const text = scene().textContent;
    for (const line of story.lines) expect(text).toContain(line.text);
    expect(text).toContain('That was the birth of Bitcoin.');
    expect(scene().dataset.step).toBe('1');
    expect(scene().querySelector('p:not([aria-hidden])')!.textContent).toBe(
      story.lines.map((l) => l.text).join(' ')
    );
  });

  it('should show one story line at a time, in order, then the mark and the last line', () => {
    const onDone = vi.fn();
    renderScene(onDone);
    const seen: number[] = [];
    for (let i = 0; i < 400 && !onDone.mock.calls.length; i++) {
      const shown = lines().filter((l) => l.dataset.shown === 'true');
      expect(shown.length).toBeLessThanOrEqual(1);
      const index = lines().findIndex((l) => l.dataset.shown === 'true');
      if (index >= 0 && seen.at(-1) !== index) seen.push(index);
      act(() => vi.advanceTimersByTime(100));
    }
    expect(seen).toEqual(story.lines.map((_, i) => i));
    expect(scene().dataset.step).toBe(String(end));
    expect(scene().dataset.dark).toBe('true');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should clear the problems for the story, and keep hidden parts out of reach', () => {
    renderScene();
    const problems = scene().querySelector('ol')!;
    expect(problems.hasAttribute('inert')).toBe(false);
    // The end, with its Read more, can't be reached before it's shown
    expect(finale().hasAttribute('inert')).toBe(true);
    for (let i = 0; i < 40; i++) act(() => vi.advanceTimersByTime(100));
    expect(Number(scene().dataset.step)).toBeGreaterThanOrEqual(3);
    expect(problems.hasAttribute('inert')).toBe(true);
    expect(problems.getAttribute('aria-hidden')).toBe('true');
  });

  it('should hold each problem long enough to read it, and read the story out after them', () => {
    const long =
      'A problem line long enough that it needs a few seconds to read, more than a short one.';
    render(
      <GenesisReveal
        story={story}
        points={[
          { text: long, node: long },
          { text: 'b', node: 'b' },
        ]}
        highlight={<span>End</span>}
        done={false}
        onDone={vi.fn()}
      />
    );
    // Review 2026-11-12: held by its length (over 3 s here), not a fixed 0.9 s
    act(() => vi.advanceTimersByTime(3_000));
    expect(scene().dataset.step).toBe('1');
    // The screen-reader story comes after the problems it answers
    const list = scene().querySelector('ol')!;
    const told = scene().querySelector('p:not([aria-hidden])')!;
    expect(list.compareDocumentPosition(told) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should keep a keyboard user’s place when the problems clear under their focus', () => {
    render(
      <GenesisReveal
        story={story}
        points={[
          { text: 'one', node: <button type="button">Read more</button> },
          { text: 'two', node: 'two' },
        ]}
        highlight={<span>End</span>}
        done={false}
        onDone={vi.fn()}
      />
    );
    scene().querySelector('button')!.focus();
    for (let i = 0; i < 400 && scene().dataset.dark !== 'true'; i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(document.activeElement).toBe(scene());
  });

  it('should show the end at a tap', () => {
    const onDone = vi.fn();
    renderScene(onDone);
    fireEvent.click(scene());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should rest on the mark alone when it played to the end, as the owner chose', () => {
    const { rerender } = render(<></>);
    let done = false;
    const scene0 = (d: boolean) => (
      <GenesisReveal
        story={story}
        points={[
          { text: 'Printing more', node: 'Printing more' },
          { text: 'Freezing accounts', node: 'Freezing accounts' },
        ]}
        highlight={<span>That was the birth of Bitcoin.</span>}
        done={d}
        onDone={() => {
          done = true;
        }}
      />
    );
    rerender(scene0(false));
    for (let i = 0; i < 400 && !done; i++) act(() => vi.advanceTimersByTime(100));
    rerender(scene0(true));
    expect(scene().dataset.full).toBe('false');
    expect(lines().every((l) => l.dataset.shown === 'false')).toBe(true);
    expect(scene().querySelector('ol')!.hasAttribute('inert')).toBe(true);
    expect(finale().hasAttribute('inert')).toBe(false);
    expect(scene().querySelector(`image[data-shown="true"]`)).not.toBeNull();
    expect(mark).toBe(end - 1);
  });

  it('should show everything, still, on a revisit or a skip: nothing is lost', () => {
    // A revisit (opened done)
    renderScene(vi.fn(), true);
    expect(scene().dataset.full).toBe('true');
    expect(lines().every((l) => l.dataset.shown === 'true')).toBe(true);
    expect(scene().querySelector('ol')!.hasAttribute('inert')).toBe(false);
    cleanup();
    // A skip at step 1 (a tap, Enter or a problem's Read more)
    const { rerender } = renderScene(vi.fn(), false);
    rerender(
      <GenesisReveal
        story={story}
        points={[
          { text: 'Printing more', node: 'Printing more' },
          { text: 'Freezing accounts', node: 'Freezing accounts' },
        ]}
        highlight={<span>That was the birth of Bitcoin.</span>}
        done
        onDone={vi.fn()}
      />
    );
    expect(scene().dataset.full).toBe('true');
    expect(lines().every((l) => l.dataset.shown === 'true')).toBe(true);
  });

  it('should give a third problem its own turn before the story', () => {
    render(
      <GenesisReveal
        story={story}
        points={['one', 'two', 'three'].map((t) => ({ text: t, node: t }))}
        highlight={<span>End</span>}
        done={false}
        onDone={vi.fn()}
      />
    );
    for (let i = 0; i < 400 && scene().dataset.step !== '3'; i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    const items = [...scene().querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => li.dataset.shown)).toEqual(['true', 'true', 'true']);
    expect(scene().dataset.dark).toBe('false');
  });

  it('should show everything at once, still, with reduced motion: problems, story and end', () => {
    reduced = true;
    const onDone = vi.fn();
    renderScene(onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(scene().dataset.step).toBe(String(end));
    expect(scene().dataset.full).toBe('true');
    // Review 2026-11-12: nobody misses the story for not wanting motion, and the problems' Read
    // more stay reachable
    expect(lines().every((l) => l.dataset.shown === 'true')).toBe(true);
    expect(scene().querySelector('ol')!.hasAttribute('inert')).toBe(false);
    expect(finale().hasAttribute('inert')).toBe(false);
  });

  it('should hide the end from screen readers until it is shown, not only while it is inert', () => {
    renderScene();
    for (let i = 0; i < 400 && Number(scene().dataset.step) < mark; i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(scene().dataset.step).toBe(String(mark));
    expect(finale().getAttribute('aria-hidden')).toBe('true');
  });

  it('should set Satoshi’s name apart from the line’s own data', () => {
    renderScene(vi.fn(), true);
    const names = [...scene().querySelectorAll('p[aria-hidden="true"] strong')].map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Satoshi Nakamoto']);
  });
});
