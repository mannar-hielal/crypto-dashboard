import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// The module loads, but the previews throw while rendering (a broken picture)
vi.mock('../LessonPreviews', () => ({
  default: () => {
    throw new Error('render failed');
  },
}));

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy when a preview throws on render', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should show the same plain note and close the reserved gap (review 2026-11-22)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(React.createElement(LessonPreviewsLazy));
    const note = screen.getByRole('status');
    await waitFor(() => expect(note.textContent).toMatch(/did not load.*Refresh the page/));
    await waitFor(() => expect(container.firstElementChild?.className).toMatch(/holderSettled/));
  });
});
