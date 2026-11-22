import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// The lessons' picture module fails to load (offline, or a stale chunk after a deploy)
vi.mock('../LessonPreviews', () => {
  throw new Error('chunk failed');
});

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy when the chunk fails', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should cost only its own section, say so politely and close the reserved gap (review 2026-11-22)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(React.createElement(LessonPreviewsLazy));
    // Announced to assistive technology, in plain words (no button to get wrong)
    const note = screen.getByRole('status');
    // The live region is in the page before it has any words (so a screen reader announces the change)
    expect(note.textContent).toBe('');
    await waitFor(() => expect(note.textContent).toMatch(/did not load.*Refresh the page/));
    expect(screen.queryByRole('button')).toBeNull();
    // The holder dropped the height it had reserved
    await waitFor(() => expect(container.firstElementChild?.className).toMatch(/holderSettled/));
  });
});
