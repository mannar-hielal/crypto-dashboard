import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';

import { LESSON_PREVIEWS } from '@/lib/landingContent';
import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should load the lessons own pictures and titles when the row is near', async () => {
    const { container } = render(React.createElement(LessonPreviewsLazy));
    // Where the row does not scroll (no phone width here) the list itself carries the name
    const list = await screen.findByRole(
      'list',
      { name: `Lessons, ${LESSON_PREVIEWS.length} cards` },
      { timeout: 15000 }
    );
    expect(list.querySelectorAll('li')).toHaveLength(LESSON_PREVIEWS.length);
    expect(screen.queryByRole('region')).toBeNull();
    expect(container.querySelectorAll('svg[data-lesson-art]')).toHaveLength(LESSON_PREVIEWS.length);
    expect(screen.getByText('Up, down and your first trade')).not.toBeNull();
  }, 20000);

  it('should be a labelled, focusable region where the row scrolls sideways (a phone)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(React.createElement(LessonPreviewsLazy));
    const region = await screen.findByRole(
      'region',
      { name: 'Lesson previews' },
      { timeout: 15000 }
    );
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.querySelectorAll('li')).toHaveLength(LESSON_PREVIEWS.length);
  }, 20000);

  it('should follow a resize across 768 px: the region and tab stop appear on a phone width and go on a wide one', async () => {
    let matches = false;
    const listeners: Array<() => void> = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => {},
    }));
    render(React.createElement(LessonPreviewsLazy));
    await screen.findByRole(
      'list',
      { name: `Lessons, ${LESSON_PREVIEWS.length} cards` },
      { timeout: 15000 }
    );
    expect(screen.queryByRole('region')).toBeNull();
    matches = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(screen.getByRole('region', { name: 'Lesson previews' }).getAttribute('tabindex')).toBe(
      '0'
    );
    matches = false;
    act(() => listeners.forEach((fn) => fn()));
    expect(screen.queryByRole('region')).toBeNull();
  }, 20000);
});
