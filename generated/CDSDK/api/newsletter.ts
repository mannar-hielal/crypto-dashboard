import type { MessageResponse, SubscribersResponse } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
    },
  });
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export const newsletterApi = {
  getSubscribers: (accessToken: string, status?: 'pending' | 'verified' | 'unsubscribed') => {
    const params = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<SubscribersResponse>(`/api/newsletter/subscribers${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  subscribe: (email: string) =>
    fetch(`${BASE_URL}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(async (res) => {
      const data = (await res.json()) as MessageResponse;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      return data;
    }),

  verify: (token: string) =>
    fetch(`${BASE_URL}/api/newsletter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      const data = (await res.json()) as MessageResponse;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      return data;
    }),

  unsubscribe: (token: string) =>
    fetch(`${BASE_URL}/api/newsletter/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      const data = (await res.json()) as MessageResponse;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      return data;
    }),
};
