import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  authApi: {},
  notificationsApi: { get: vi.fn().mockResolvedValue({}) },
}));

import { SettingsModal } from '../SettingsModal';
import { color } from '@/lib/tokens';
import { useAuthStore } from '@/store/authStore';

describe('SettingsModal delete account button', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
  });

  it('should show its label in a light colour, not the red of its own fill (owner 2026-11-22)', () => {
    useAuthStore
      .getState()
      .setAuth('token', { id: 'u1', email: 'a@b.co', username: 'trader' } as never);
    render(React.createElement(SettingsModal, { open: true, onClose: () => {} }));
    const rgb = (c: string) => {
      const probe = document.createElement('span');
      probe.style.color = c;
      return probe.style.color; // jsdom normalises hex to rgb
    };
    const first = screen.getByRole('button', { name: 'Delete account' });
    expect(first.style.color).toBe(rgb(color.white));
    expect(first.style.color).not.toBe(rgb(color.red));
    // The confirm step's button too
    fireEvent.click(first);
    const confirm = screen.getByRole('button', { name: 'Delete Account Now' });
    expect(confirm.style.color).toBe(rgb(color.white));
  });
});
