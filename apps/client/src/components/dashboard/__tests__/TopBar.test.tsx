/**
 * The top bar's signed-out action: the dashboard / /chart offer "Sign in" back to the market on screen;
 * the marketing pages (Landing, Features) offer the Live Chart link instead and no "Sign in" at all.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { TopBar } from '../TopBar';
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

  it('should send Sign in back to the market on screen when on the dashboard or /chart', () => {
    renderAt('/chart', false);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('login from /dashboard/usdt/ETHUSDT')).toBeTruthy();
  });
});
