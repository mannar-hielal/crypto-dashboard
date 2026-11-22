/**
 * The top bar's signed-out action: the dashboard / /chart offer "Sign in" back to the market on screen;
 * the marketing pages (Landing, How it works) offer the Live Chart link instead and no "Sign in" at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { TopBar } from '../TopBar';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { guideSelector } from '@/lib/guideAnchors';
import { useAuthStore } from '@/store/authStore';
import { useLayoutStore } from '@/store/layoutStore';

function LoginProbe() {
  const location = useLocation();
  return <p>login from {String((location.state as { from?: string } | null)?.from)}</p>;
}

function renderAt(path: string, marketing: boolean) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<TopBar marketing={marketing} />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useLayoutStore
    .getState()
    .setPaneMarket(useLayoutStore.getState().activePane, 'linear', 'ETHUSDT');
});

afterEach(cleanup);

describe('TopBar signed out', () => {
  it('should offer no Sign in button on a marketing page, only the Live Chart link', () => {
    renderAt('/', true);
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Live Chart' }).getAttribute('href')).toBe('/chart');
  });

  it('should stack the marketing bar above a page’s own sticky bar (z-index 50), so the Product dropdown opens over it', () => {
    // The How it works page's anchor nav sits at z-index 50; at 50 too, the later one covered the dropdown
    renderAt('/how-it-works', true);
    const header = document.querySelector('header') as HTMLElement;
    expect(Number(header.style.zIndex)).toBeGreaterThan(50);
    cleanup();
    renderAt('/chart', false);
    const dashboard = document.querySelector('header') as HTMLElement;
    expect(Number(dashboard.style.zIndex)).toBeLessThan(50);
  });

  it('should send Sign in back to the market on screen when on the dashboard or /chart', () => {
    renderAt('/chart', false);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('login from /dashboard/usdt/ETHUSDT')).toBeTruthy();
  });
});

describe('TopBar signed in', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'ada@example.com', username: 'ada' });
    useTourStore.getState().reset();
    useLessonStore.getState().reset();
    window.localStorage.clear();
  });

  const routeButton = () => document.querySelector<HTMLButtonElement>(guideSelector('nav.learn'))!;

  it('should open the learning path from its own button, beside the avatar', () => {
    renderAt('/dashboard', false);
    fireEvent.click(routeButton());
    expect(useTourStore.getState().panelOpen).toBe(true);
  });

  it('should keep the user menu for settings and auth only', () => {
    renderAt('/dashboard', false);
    fireEvent.click(document.querySelector(guideSelector('nav.user-menu'))!);
    expect(document.querySelector(guideSelector('nav.settings'))).toBeTruthy();
    expect(document.querySelector(guideSelector('nav.sign-out'))).toBeTruthy();
    expect(screen.queryByText('Learn')).toBeNull();
  });

  it('should show the dot once progress is read, and clear it once the map has been seen', () => {
    renderAt('/dashboard', false);
    // Before the account's progress arrives there is nothing to announce
    expect(routeButton().getAttribute('aria-label')).toBe('Learning path');

    act(() => useTourStore.setState({ loaded: true }));
    expect(routeButton().getAttribute('aria-label')).toBe('Learning path: a new step is ready');

    act(() => useTourStore.getState().openPanel());
    act(() => useTourStore.getState().closePanel());
    expect(routeButton().getAttribute('aria-label')).toBe('Learning path');

    // A step that opens later brings it back
    act(() => useLessonStore.getState().setCompleted(['lesson-01']));
    expect(routeButton().getAttribute('aria-label')).toBe('Learning path: a new step is ready');
  });

  it('should leave none of the account’s lesson progress on the device after Sign out', async () => {
    useLessonStore.getState().setCompleted(['lesson-01']);
    renderAt('/chart', false);
    fireEvent.click(document.querySelector(guideSelector('nav.user-menu'))!);
    fireEvent.click(document.querySelector(guideSelector('nav.sign-out'))!);
    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    expect(useLessonStore.getState().completed).toEqual({});
  });
});
