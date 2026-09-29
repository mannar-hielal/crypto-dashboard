import type {
  AuthResponse,
  MeResponse,
  RefreshResponse,
  MessageResponse,
  UpdateUserResponse,
} from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, signal, ...rest } = init || {};

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    // Always enforce a 10s ceiling, but don't discard a caller-supplied signal
    // (e.g. an unmount AbortController) — abort on whichever fires first.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      // Only set Content-Type when there's a body — Fastify rejects Content-Type: application/json with an empty body
      ...(init?.body !== undefined && init.body !== null && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    credentials: 'include', // 🔐 sends httpOnly refresh_token cookie automatically
  });

  // 204 No Content — no body to parse (e.g. logout)
  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json()) as T;

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    // `status` lets callers tell an auth failure (401) from a transient one (network, 5xx)
    throw Object.assign(new Error(message), { status: res.status });
  }

  return data;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  /** `acceptedTerms` must be true: the server refuses a registration without it (400). */
  register: (body: { email: string; username: string; password: string; acceptedTerms: boolean }) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Sends the httpOnly refresh_token cookie automatically — no body needed.
  // Resolves null when there is no session to restore (204: no refresh cookie was sent);
  // a cookie the server rejects still throws with status 401.
  refresh: async (): Promise<RefreshResponse | null> =>
    (await request<RefreshResponse | undefined>('/api/auth/refresh', { method: 'POST' })) ?? null,

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

  updateUsername: (body: { username: string }, accessToken: string) =>
    request<UpdateUserResponse>('/api/auth/username', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  updateEmail: (body: { email: string; currentPassword: string }, accessToken: string) =>
    request<MessageResponse>('/api/auth/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  updatePassword: (body: { currentPassword: string; newPassword: string }, accessToken: string) =>
    request<MessageResponse>('/api/auth/password', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  verifyEmail: (body: { token: string }) =>
    request<MessageResponse>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resendVerification: (body: { email: string }) =>
    request<MessageResponse>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  verifyEmailChange: (body: { token: string }) =>
    request<MessageResponse>('/api/auth/verify-email-change', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  requestDeletion: (body: { password: string }, accessToken: string) =>
    request<MessageResponse>('/api/auth/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  cancelDeletion: (accessToken: string) =>
    request<MessageResponse>('/api/auth/cancel-deletion', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};
