/**
 * After sign-in, a market deep link comes back to its market (BP-2) — 🔐 only an allow-listed
 * dashboard market URL; anything else goes to /dashboard (no open redirect).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: {
    login: vi.fn(async () => ({
      accessToken: 'token',
      user: { id: 'u1', email: 'a@b.c', username: 'u1', emailVerifiedAt: '2026-01-01' },
    })),
  },
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));

import { LoginPage } from '@/pages/LoginPage';

function renderLogin(from: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>default dashboard</p>} />
        <Route path="/dashboard/usdt/:symbol" element={<p>ETH perpetual</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function signIn() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'trader@example.com' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

afterEach(cleanup);

describe('LoginPage return path', () => {
  it('returns to the market deep link that sent the user to sign in', async () => {
    renderLogin('/dashboard/usdt/ETHUSDT');
    await signIn();
    await waitFor(() => expect(screen.getByText('ETH perpetual')).toBeTruthy());
  });

  it.each(['https://evil.example/dashboard/usdt/ETHUSDT', '//evil.example', '/admin/newsletter'])(
    '🔐 ignores %s and goes to the dashboard',
    async (from) => {
      renderLogin(from);
      await signIn();
      await waitFor(() => expect(screen.getByText('default dashboard')).toBeTruthy());
    }
  );
});
