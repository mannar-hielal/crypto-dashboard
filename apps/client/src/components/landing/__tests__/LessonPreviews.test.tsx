import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { LESSON_PREVIEWS } from '@/lib/landingContent';
import { LessonPreviewsLazy } from '../LessonPreviewsLazy';

describe('LessonPreviewsLazy', () => {
  afterEach(cleanup);

  it('should load the lessons own pictures and titles when the row is near', async () => {
    const { container } = render(React.createElement(LessonPreviewsLazy));
    const list = await screen.findByRole(
      'list',
      { name: 'A peek at the lessons' },
      { timeout: 15000 }
    );
    expect(list.querySelectorAll('li')).toHaveLength(LESSON_PREVIEWS.length);
    expect(container.querySelectorAll('svg[data-lesson-art]')).toHaveLength(LESSON_PREVIEWS.length);
    expect(screen.getByText('Up, down and your first trade')).not.toBeNull();
  }, 20000);
});
