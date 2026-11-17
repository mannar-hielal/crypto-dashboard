import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let desktop = true;
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { LearnCard } from '@/guide/LearnCard';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';

const renderCard = () =>
  render(
    <MemoryRouter>
      <LearnCard />
    </MemoryRouter>
  );

describe('LearnCard', () => {
  beforeEach(() => {
    desktop = true;
    navigate.mockReset();
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
    useTourStore.getState().setProgress({ completed: [], cardDismissed: false });
  });
  afterEach(() => cleanup());

  it('should wait for the account’s progress, so it never flashes', () => {
    useTourStore.getState().reset();
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });

  it('should offer the primer to a new account', () => {
    renderCard();
    expect(screen.getByText('New to crypto?')).not.toBeNull();
    expect(screen.getByText('Start')).not.toBeNull();
  });

  it('should open Lesson 1 and retire itself', () => {
    renderCard();
    fireEvent.click(screen.getByText('Start'));

    expect(useLessonStore.getState().activeId).toBe('lesson-01');
    expect(useLessonStore.getState().screen).toBe(0);
    expect(useTourStore.getState().activeId).toBeNull();
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should dismiss with Not now and with the ✕', () => {
    renderCard();
    fireEvent.click(screen.getByText('Not now'));
    expect(useTourStore.getState().cardDismissed).toBe(true);
    expect(useTourStore.getState().activeId).toBeNull();

    cleanup();
    useTourStore.setState({ cardDismissed: false });
    renderCard();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(useTourStore.getState().cardDismissed).toBe(true);
  });

  it('should not show once dismissed, or while a tour runs', () => {
    useTourStore.setState({ cardDismissed: true });
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();

    cleanup();
    useTourStore.setState({ cardDismissed: false });
    act(() => useTourStore.getState().start('primer'));
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });

  it('should retire as soon as Lesson 1 is finished, before any progress read says so', () => {
    act(() => useLessonStore.getState().setCompleted(['lesson-01']));
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });

  it('should offer Start on a phone too (the lesson cards work there)', () => {
    desktop = false;
    renderCard();
    expect(screen.getByText('Start')).not.toBeNull();
    expect(screen.getByText('Not now')).not.toBeNull();
  });

  it('should not show while a lesson runs', () => {
    act(() => useLessonStore.getState().start('lesson-01'));
    renderCard();
    expect(screen.queryByText('New to crypto?')).toBeNull();
  });
});
