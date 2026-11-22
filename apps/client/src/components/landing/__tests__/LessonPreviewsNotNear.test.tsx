import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy before the row is near the screen', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should have an empty status region ready and no list yet', () => {
    // An observer that never reports the row as visible
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    render(React.createElement(LessonPreviewsLazy));
    // In the page before any failure, so a later failure is announced
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
