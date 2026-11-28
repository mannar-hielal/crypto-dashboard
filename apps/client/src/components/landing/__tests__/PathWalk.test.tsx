import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import React from 'react';

import { PATH_WALK_CHAPTERS } from '@/lib/pathWalk';

const OPEN = PATH_WALK_CHAPTERS.reduce((n, c) => n + c.stops.length, 0);

async function renderWalk() {
  const { PathWalk } = await import('../PathWalk');
  return render(React.createElement(PathWalk));
}

/** The stops' groups, in the order they are drawn */
const stops = (c: HTMLElement) => [...c.querySelectorAll('svg > g[data-stop]')];
const done = (c: HTMLElement) => stops(c).filter((g) => /done/.test(g.getAttribute('class') ?? ''));

describe('PathWalk, drawn finished (no observer: a still browser, or reduced motion)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('IntersectionObserver', undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should show every stop done: nothing on the path is still to write', async () => {
    const { container } = await renderWalk();
    expect(stops(container)).toHaveLength(OPEN);
    expect(done(container)).toHaveLength(OPEN);
    expect(container.querySelectorAll('[class*="locked"]')).toHaveLength(0);
  });

  it('should count each chapter as complete on its card', async () => {
    const { container } = await renderWalk();
    const text = container.querySelector('svg')?.textContent ?? '';
    expect(text).toContain('Chapter 1 · 7 of 7 done');
    expect(text).toContain('Chapter 2 · 7 of 7 done');
  });

  it('should draw both guides, Pulin and Berwyn', async () => {
    const { container } = await renderWalk();
    expect(container.querySelector('[data-guide-who="tick"]')).not.toBeNull();
    expect(container.querySelector('[data-guide-who="tock"]')).not.toBeNull();
  });

  it('should say more chapters are coming, in the picture and for a screen reader', async () => {
    const { container } = await renderWalk();
    expect(container.querySelector('svg')?.textContent).toContain('More chapters');
    expect(screen.getByText('More chapters are on the way.')).not.toBeNull();
  });

  it('should list the whole path as text for a screen reader, with the picture hidden from it', async () => {
    const { container } = await renderWalk();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    for (const c of PATH_WALK_CHAPTERS) {
      expect(screen.getByText(`Chapter ${c.number}: ${c.title}`, { exact: false })).not.toBeNull();
      for (const s of c.stops) expect(screen.getAllByText(s.title).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/\(coming soon\)/)).toBeNull();
  });

  it('should offer no controls when there was nothing to play', async () => {
    await renderWalk();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PathWalk, played when it scrolls into view', () => {
  let observed: ((entries: { isIntersecting: boolean }[]) => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          observed = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    observed = undefined;
  });

  const scrollIntoView = () => act(() => observed?.([{ isIntersecting: true }]));
  const play = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it('should wait, with no stop done, until it is on screen', async () => {
    const { container } = await renderWalk();
    play(5000);
    expect(done(container)).toHaveLength(0);
    expect(container.querySelector('svg')?.textContent).toContain('Chapter 1 · 0 of 7 done');
  });

  it('should tick the stops one by one as the guides walk, and flash a chapter at its last stop', async () => {
    const { container } = await renderWalk();
    await scrollIntoView();
    play(2500);
    const early = done(container).length;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(OPEN);
    play(60000);
    expect(done(container)).toHaveLength(OPEN);
    expect(container.querySelector('svg')?.textContent).toContain('Chapter 2 · 7 of 7 done');
    expect(screen.getByRole('button', { name: 'Replay' })).not.toBeNull();
  });

  it('should show a chapter title with a check while it flashes, then take it away', async () => {
    const { container } = await renderWalk();
    await scrollIntoView();
    // Walk until the flash is up
    let flashed = false;
    for (let i = 0; i < 400 && !flashed; i++) {
      play(100);
      flashed = container.querySelector('[class*="flash"]') !== null;
    }
    expect(flashed).toBe(true);
    const flash = container.querySelector('[class*="flash"]') as HTMLElement;
    expect(flash.textContent).toContain('Start here: crypto and trading basics');
    expect(flash.getAttribute('aria-hidden')).toBe('true');
    play(2000);
    expect(container.querySelector('[class*="flash"]')).toBeNull();
  });

  it('should play again from the start when Replay is pressed', async () => {
    const { container } = await renderWalk();
    await scrollIntoView();
    play(60000);
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(done(container)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Replay' })).toBeNull();
    play(60000);
    expect(done(container)).toHaveLength(OPEN);
  });

  it('should pause and play from a button, keeping its place', async () => {
    const { container } = await renderWalk();
    await scrollIntoView();
    play(2500);
    const before = done(container).length;
    expect(before).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    play(30000);
    expect(done(container)).toHaveLength(before);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    play(60000);
    expect(done(container)).toHaveLength(OPEN);
  });

  it('should let a visitor pause before it starts, and then it does not start', async () => {
    const { container } = await renderWalk();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await scrollIntoView();
    play(20000);
    expect(done(container)).toHaveLength(0);
  });

  it('should swap Pause for Replay at the end, and Replay plays it again even if it was paused', async () => {
    await renderWalk();
    await scrollIntoView();
    play(60000);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.getByRole('button', { name: 'Pause' })).not.toBeNull();
  });

  it('should pause when it leaves the screen, and carry on when it returns', async () => {
    const { container } = await renderWalk();
    await scrollIntoView();
    play(2500);
    const before = done(container).length;
    await act(() => observed?.([{ isIntersecting: false }]));
    play(20000);
    expect(done(container)).toHaveLength(before);
    await scrollIntoView();
    play(60000);
    expect(done(container)).toHaveLength(OPEN);
  });
});
