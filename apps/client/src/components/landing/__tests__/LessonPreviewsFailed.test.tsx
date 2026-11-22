import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// The lessons' picture module fails to load (offline, or a stale chunk after a deploy)
vi.mock('../LessonPreviews', () => {
  throw new Error('chunk failed');
});

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy when the chunk fails', () => {
  afterEach(cleanup);

  it('should cost only its own section, close the reserved gap and offer a reload, since a second import of a missing file would fail again (review 2026-11-22)', async () => {
    const { container } = render(React.createElement(LessonPreviewsLazy));
    const reload = await screen.findByRole('button', { name: /Reload the page/ });
    expect(reload).not.toBeNull();
    // The holder dropped the height it had reserved
    await waitFor(() => expect(container.firstElementChild?.className).toMatch(/holderSettled/));
  });
});
