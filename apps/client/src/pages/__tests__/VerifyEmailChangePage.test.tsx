/**
 * The email-change link is single-use. React StrictMode runs mount effects twice in dev; the page
 * used to post the token twice, so the second request always failed (a 500 before the server fix,
 * a 400 after) and, when it resolved last, flipped a successful change to an error screen.
 */

import { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const { verifyEmailChange } = vi.hoisted(() => ({ verifyEmailChange: vi.fn() }));

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: { verifyEmailChange },
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));

import { VerifyEmailChangePage } from '@/pages/VerifyEmailChangePage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VerifyEmailChangePage', () => {
  it('should post the token once and show success when StrictMode double-runs effects', async () => {
    verifyEmailChange
      .mockResolvedValueOnce({ message: 'Email updated successfully. Please log in again.' })
      .mockRejectedValueOnce(Object.assign(new Error('Invalid or expired token'), { status: 400 }));

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify-email-change?token=abc']}>
          <Routes>
            <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText(/email updated successfully/i)).toBeTruthy());
    expect(verifyEmailChange).toHaveBeenCalledTimes(1);
    expect(verifyEmailChange).toHaveBeenCalledWith({ token: 'abc' });
  });
});
