/**
 * "Use a different account" signs the user out locally even when the logout request fails.
 *
 * Regression: the handler had try/finally with no catch, so a failed POST /logout (offline, a
 * 5xx during a deploy) escaped the click handler as an uncaught promise rejection.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useAuthStore } from '@/store/authStore';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: { logout, resendVerification: vi.fn() },
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));

import { UnverifiedPage } from '@/pages/UnverifiedPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});

describe('UnverifiedPage sign-out', () => {
  it('should sign out and go to /login when the logout request fails', async () => {
    useAuthStore.getState().setAuth('token', {
      id: 'u1',
      email: 'new@example.com',
      username: 'newbie',
      emailVerifiedAt: null,
    } as never);
    logout.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      <MemoryRouter initialEntries={['/unverified']}>
        <Routes>
          <Route path="/unverified" element={<UnverifiedPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /use a different account/i }));

    await waitFor(() => expect(screen.getByText('login page')).toBeTruthy());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
