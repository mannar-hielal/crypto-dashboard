import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useTourStore } from '@/guide/tourStore';
import { OpenPathPage } from '@/pages/OpenPathPage';
import { useAuthStore } from '@/store/authStore';

function Login() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <p>login from {from}</p>;
}

function renderAtPath() {
  return render(
    <MemoryRouter initialEntries={['/path']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/path" element={<OpenPathPage />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the Crypto path link (/path, owner 2026-11-22)', () => {
  beforeEach(() => {
    useTourStore.getState().closePanel();
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isLoading: false,
      awaitingNetwork: false,
      reconnectStalled: false,
    });
  });
  afterEach(cleanup);

  it('should open the path map and land on the dashboard when signed in', () => {
    useAuthStore.setState({
      accessToken: 'token',
      user: { id: 'u1', email: 'a@b.c', emailVerifiedAt: '2026-01-01T00:00:00Z' } as never,
    });
    renderAtPath();
    expect(screen.getByText('dashboard')).toBeTruthy();
    expect(useTourStore.getState().panelOpen).toBe(true);
  });

  it('should send a signed-out visitor to log in, remembering /path, with the map still closed', () => {
    renderAtPath();
    expect(screen.getByText('login from /path')).toBeTruthy();
    expect(useTourStore.getState().panelOpen).toBe(false);
  });
});
