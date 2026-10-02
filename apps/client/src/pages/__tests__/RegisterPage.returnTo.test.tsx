/**
 * After registering from /chart ("Sign in to trade" → "Create one"), the new user lands on the
 * market they were viewing — 🔐 only an allow-listed dashboard market URL; anything else goes to
 * /dashboard (no open redirect). Mirrors LoginPage.returnTo.test.tsx.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { guideSelector } from '@/lib/guideAnchors';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: {
    register: vi.fn(async () => ({
      accessToken: 'token',
      user: { id: 'u1', email: 'a@b.c', username: 'new_trader', emailVerifiedAt: null },
    })),
  },
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));

// The Radix checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { RegisterPage } from '@/pages/RegisterPage';

function LoginProbe() {
  const location = useLocation();
  return <p>login from {String((location.state as { from?: string } | null)?.from)}</p>;
}

function renderRegister(from: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/register', state: { from } }]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/dashboard" element={<p>default dashboard</p>} />
        <Route path="/dashboard/usdt/:symbol" element={<p>ETH perpetual</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function field(anchor: Parameters<typeof guideSelector>[0]): HTMLElement {
  const el = document.querySelector<HTMLElement>(guideSelector(anchor));
  if (!el) throw new Error(`missing ${anchor}`);
  return el;
}

async function register() {
  fireEvent.change(field('auth.register.email'), { target: { value: 'new@example.com' } });
  fireEvent.change(field('auth.register.username'), { target: { value: 'new_trader' } });
  fireEvent.change(field('auth.register.password'), { target: { value: 'Secret123!' } });
  fireEvent.click(field('auth.register.terms'));
  fireEvent.click(field('auth.register.submit'));
}

afterEach(cleanup);

describe('RegisterPage return path', () => {
  it('should return to the market the visitor came from', async () => {
    renderRegister('/dashboard/usdt/ETHUSDT');
    await register();
    await waitFor(() => expect(screen.getByText('ETH perpetual')).toBeTruthy());
  });

  it.each(['https://evil.example/dashboard/usdt/ETHUSDT', '//evil.example', '/admin/newsletter'])(
    '🔐 should ignore %s and go to the dashboard',
    async (from) => {
      renderRegister(from);
      await register();
      await waitFor(() => expect(screen.getByText('default dashboard')).toBeTruthy());
    }
  );

  it('should keep the market when switching to sign in', () => {
    renderRegister('/dashboard/usdt/ETHUSDT');
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByText('login from /dashboard/usdt/ETHUSDT')).toBeTruthy();
  });
});
