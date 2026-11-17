import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getHabits = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  learnApi: { getHabits: (...a: unknown[]) => getHabits(...a) },
}));
let reduced = true;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { StreakView } from '@/guide/StreakView';
import { guideSelector } from '@/lib/guideAnchors';
import { useTourStore } from '@/guide/tourStore';

const habits = {
  badges: [],
  learningDays: 5,
  streakDays: 3,
  thisWeek: [true, true, true, false, false, false, false],
};

describe('StreakView', () => {
  beforeEach(() => {
    getHabits.mockReset();
    reduced = true;
    useTourStore.setState({ loaded: true }); // the account's progress is in
  });
  afterEach(cleanup);

  it('should read the habits with the token and show the streak and the line', async () => {
    getHabits.mockResolvedValue(habits);
    render(<StreakView accessToken="t" onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText('3-day streak')).toBeTruthy());
    expect(getHabits).toHaveBeenCalledWith('t');
    expect(screen.getByText('3-day learning streak')).toBeTruthy();
    expect(screen.getByText('Come back tomorrow to keep it going.')).toBeTruthy();
  });

  it('should mark this week’s learning days, Monday first, in words for screen readers', async () => {
    getHabits.mockResolvedValue(habits);
    render(<StreakView accessToken="t" onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText('Wed: learned')).toBeTruthy());
    expect(screen.getByText('Mon: learned')).toBeTruthy();
    expect(screen.getByText('Thu: not yet')).toBeTruthy();
  });

  it('should still show the streak when the week’s days are missing (an API rolled back)', async () => {
    getHabits.mockResolvedValue({ ...habits, thisWeek: undefined });
    render(<StreakView accessToken="t" onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText('Mon: not yet')).toBeTruthy());
    expect(screen.getByText('Sun: not yet')).toBeTruthy();
    expect(screen.getByText('3-day streak')).toBeTruthy();
  });

  it('should count up to the streak without reduced motion', async () => {
    reduced = false;
    getHabits.mockResolvedValue(habits);
    render(<StreakView accessToken="t" onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText('3-day streak')).toBeTruthy(), { timeout: 3000 });
  });

  it('should move on from the number shown when the streak changes, never back from 0', async () => {
    reduced = false;
    getHabits.mockResolvedValueOnce(habits); // a 3-day streak
    const { container, rerender } = render(
      <StreakView accessToken="t-one" onContinue={() => {}} />
    );
    await waitFor(() => expect(screen.getByText('3-day streak')).toBeTruthy(), { timeout: 3000 });
    // Every number shown from here on, as the count runs
    const seen: string[] = [];
    const watch = new MutationObserver(() => seen.push(container.textContent ?? ''));
    watch.observe(container, { subtree: true, characterData: true, childList: true });
    getHabits.mockResolvedValue({ ...habits, streakDays: 4 });
    rerender(<StreakView accessToken="t-two" onContinue={() => {}} />); // read again (past midnight)
    await waitFor(() => expect(screen.getByText('4-day streak')).toBeTruthy(), { timeout: 3000 });
    watch.disconnect();
    expect(seen.some((t) => /\b[0-2]-day streak/.test(t))).toBe(false);
  });

  it('should say so when the streak can’t load, and still go on', async () => {
    getHabits.mockRejectedValue(new Error('offline'));
    const onContinue = vi.fn();
    render(<StreakView accessToken="t" onContinue={onContinue} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/couldn’t load/));
    fireEvent.click(document.querySelector(guideSelector('lesson.streak.continue'))!);
    expect(onContinue).toHaveBeenCalled();
  });
});
