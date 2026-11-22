import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy before the row is near the screen', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should have no status note and no list yet (review 2026-11-22)', () => {
    // An observer that never reports the row as visible
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    render(React.createElement(LessonPreviewsLazy));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
