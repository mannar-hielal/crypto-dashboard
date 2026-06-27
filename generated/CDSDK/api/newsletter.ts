import type { MessageResponse } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export const newsletterApi = {
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
    request<MessageResponse>(`/api/newsletter/verify?token=${encodeURIComponent(token)}`),

  unsubscribe: (token: string) =>
    request<MessageResponse>(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`),
};
