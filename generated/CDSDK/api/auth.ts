import type { AuthResponse, MeResponse, RefreshResponse, MessageResponse } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include', // 🔐 sends httpOnly refresh_token cookie automatically
    ...init,
  });

  // 204 No Content — no body to parse (e.g. logout)
  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json()) as T;

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: { email: string; username: string; password: string }) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Sends the httpOnly refresh_token cookie automatically — no body needed
  refresh: () => request<RefreshResponse>('/api/auth/refresh', { method: 'POST' }),

  // Clears the httpOnly cookie server-side — client discards accessToken from Zustand
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  me: (accessToken: string) =>
    request<MeResponse>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  // 🔐 Always returns a success message — server never reveals if email exists
  forgotPassword: (body: { email: string }) =>
    request<MessageResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resetPassword: (body: { token: string; password: string }) =>
    request<MessageResponse>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
