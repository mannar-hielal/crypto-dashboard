import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuthStatus } from '@/hooks/useSignIn';
import { useAuthStore } from '@/store/authStore';

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Route>
        <Route path="/login" element={<p>login</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute, opened offline (PWA readiness, review on #283)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isLoading: false,
      awaitingNetwork: false,
      reconnectStalled: false,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should wait for the connection, saying so, instead of sending the learner to /login', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    useAuthStore.setState({ awaitingNetwork: true });
    renderAt();
    expect(screen.queryByText('login')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('You’re offline');
  });

  it('should say Reconnecting while the retries run back online', () => {
    useAuthStore.setState({ awaitingNetwork: true });
    renderAt();
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…');
  });

  it('should offer Try again, not /login, when the reconnect stalled (review on #290)', () => {
    useAuthStore.setState({ awaitingNetwork: true, reconnectStalled: true });
    renderAt();
    expect(screen.queryByText('login')).toBeNull();
    // Honest: the tap may still end in signing in again
    expect(screen.getByRole('status').textContent).toContain('you’ll be asked to sign in');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('should send a signed-out visitor to /login as before', () => {
    renderAt();
    expect(screen.getByText('login')).toBeTruthy();
  });

  it('should let public pages see a guest while the session waits for the network', () => {
    useAuthStore.setState({ awaitingNetwork: true });
    const { result } = renderHook(() => useAuthStatus());
    expect(result.current).toBe('guest');
  });
});
