/**
 * Invalid input on an auth form shows field messages and sends nothing — it never throws.
 *
 * Regression: @hookform/resolvers 3.x only recognised a zod v3 error (`error.errors`). With
 * zod 4 (`error.issues` only) the resolver re-threw the ZodError, so submit became an uncaught
 * promise rejection in the console, no message was shown, and the button stayed on
 * "Creating account..." until the page was reloaded.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactElement } from 'react';

const { register, login, forgotPassword, resetPassword } = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: { register, login, forgotPassword, resetPassword },
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
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';

function renderAt(path: string, element: ReactElement) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path.split('?')[0]} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

function submit() {
  const button = document.querySelector('form button[type="submit"]');
  if (!button) throw new Error('no submit button');
  fireEvent.click(button);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('auth form validation', () => {
  it('should show every register field error when the form is submitted empty', async () => {
    renderAt('/register', <RegisterPage />);
    submit();
    await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeTruthy());
    expect(screen.getByText('At least 3 characters')).toBeTruthy();
    expect(screen.getByText('You must accept the terms and privacy policy')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('should show the username error and re-enable submit when the username is too short', async () => {
    renderAt('/register', <RegisterPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Passw0rd!' } });
    fireEvent.click(screen.getByRole('checkbox'));
    submit();
    await waitFor(() => expect(screen.getByText('At least 3 characters')).toBeTruthy());
    const button = screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('should show login field errors when the form is submitted empty', async () => {
    renderAt('/login', <LoginPage />);
    submit();
    await waitFor(() => expect(screen.getByText('Invalid email address')).toBeTruthy());
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('should show the forgot-password email error when the form is submitted empty', async () => {
    renderAt('/forgot-password', <ForgotPasswordPage />);
    submit();
    await waitFor(() => expect(document.querySelector('[data-slot="form-message"]')).toBeTruthy());
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('should show the mismatch error when the reset passwords differ', async () => {
    renderAt('/reset-password?token=abc', <ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'Passw0rd!' } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'Passw0rd?' } });
    submit();
    await waitFor(() => expect(screen.getByText('Passwords do not match')).toBeTruthy());
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
