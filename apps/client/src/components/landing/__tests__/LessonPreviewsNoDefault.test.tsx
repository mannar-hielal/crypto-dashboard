import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// A stale chunk after a deploy: the module resolves, but without its component
vi.mock('../LessonPreviews', () => ({}));

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy when the module has no component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should say so and close the reserved gap instead of leaving it empty (review 2026-11-22)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(React.createElement(LessonPreviewsLazy));
    const note = screen.getByRole('status');
    await waitFor(() => expect(note.textContent).toMatch(/did not load.*Refresh the page/));
    await waitFor(() => expect(container.firstElementChild?.className).toMatch(/holderSettled/));
  });
});
