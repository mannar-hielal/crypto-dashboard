import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

// The lessons' picture module fails to load (offline, or a stale chunk after a deploy)
vi.mock('../LessonPreviews', () => {
  throw new Error('chunk failed');
});

import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy when the chunk fails', () => {
  afterEach(cleanup);

  it('should cost only its own section, close the reserved gap and offer a retry (review 2026-11-22)', async () => {
    const { container } = render(React.createElement(LessonPreviewsLazy));
    const retry = await screen.findByRole('button', { name: /Try again/ });
    expect(retry).not.toBeNull();
    // The holder dropped the height it had reserved
    await waitFor(() => expect(container.firstElementChild?.className).toMatch(/holderSettled/));
    // A retry tries the import again (it fails again here, and the button comes back)
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: /Try again/ })).not.toBeNull();
  });
});
