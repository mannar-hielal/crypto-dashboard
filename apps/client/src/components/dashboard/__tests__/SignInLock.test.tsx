/**
 * Sign-in lock over the order form and the account panel for signed-out visitors on /chart.
 * 🔐 The lock is a UX layer (the server rejects every paper route without a token) — but removing
 * it in DevTools must not leave a usable panel behind.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SignInLock } from '../SignInLock';
import { useAuthStore } from '@/store/authStore';
import { useLayoutStore } from '@/store/layoutStore';
import { guideSelector } from '@/lib/guideAnchors';

const USER = { id: 'u1', email: 'a@b.c', username: 'trader', emailVerifiedAt: '2026-01-01' };

function LoginProbe() {
  const location = useLocation();
  return <p>login from {String((location.state as { from?: string } | null)?.from)}</p>;
}

function renderLock(onClose?: () => void) {
  return render(
    <MemoryRouter initialEntries={['/chart']}>
      <Routes>
        <Route
          path="/chart"
          element={
            <SignInLock onClose={onClose}>
              <button type="button">Buy / Long</button>
            </SignInLock>
          }
        />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

const overlay = () => document.querySelector<HTMLElement>(guideSelector('lock.overlay'));
const content = () => screen.getByText('Buy / Long', { selector: 'button' }).parentElement!;

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useLayoutStore
    .getState()
    .setPaneMarket(useLayoutStore.getState().activePane, 'linear', 'ETHUSDT');
});

afterEach(cleanup);

describe('SignInLock', () => {
  it('should cover the panel and make it inert when the visitor is signed out', () => {
    renderLock();
    expect(overlay()).not.toBeNull();
    expect(screen.getByText('Paper trading needs a free account.')).toBeTruthy();
    expect(content().hasAttribute('inert')).toBe(true);
    expect(content().getAttribute('aria-hidden')).toBe('true');
  });

  it('should send the visitor to sign in, remembering the market on screen', () => {
    renderLock();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to trade' }));
    expect(screen.getByText('login from /dashboard/usdt/ETHUSDT')).toBeTruthy();
  });

  it('should render the panel untouched when signed in', () => {
    useAuthStore.getState().setAuth('token', USER);
    renderLock();
    expect(overlay()).toBeNull();
    expect(content().hasAttribute('inert')).toBe(false);
  });

  it('should dim without a prompt while the session is being restored', () => {
    useAuthStore.setState({ isLoading: true, accessToken: null, user: null });
    renderLock();
    expect(overlay()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in to trade' })).toBeNull();
    expect(content().hasAttribute('inert')).toBe(true);
  });

  it('should unlock when the visitor signs in', () => {
    renderLock();
    act(() => useAuthStore.getState().setAuth('token', USER));
    expect(overlay()).toBeNull();
  });

  it('should offer a close button only when asked (the phone order sheet)', () => {
    renderLock();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    cleanup();
    let closed = false;
    renderLock(() => (closed = true));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });

  it('should dim without a prompt when prompt is off (the phone Buy / Sell bar)', () => {
    render(
      <MemoryRouter>
        <SignInLock prompt={false}>
          <button type="button">Buy / Long</button>
        </SignInLock>
      </MemoryRouter>
    );
    expect(overlay()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in to trade' })).toBeNull();
    expect(content().hasAttribute('inert')).toBe(true);
  });

  describe('🔐 DevTools tampering', () => {
    it('should restore the overlay when it is removed', async () => {
      renderLock();
      await act(async () => overlay()!.remove());
      expect(overlay()).not.toBeNull();
      expect(content().hasAttribute('inert')).toBe(true);
    });

    it('should restore inert when it is stripped from the panel', async () => {
      renderLock();
      await act(async () => content().removeAttribute('inert'));
      expect(content().hasAttribute('inert')).toBe(true);
    });

    it('should restore the overlay when it is hidden', async () => {
      renderLock();
      await act(async () => {
        overlay()!.style.display = 'none';
      });
      expect(overlay()!.style.display).toBe('');
    });
  });
});
