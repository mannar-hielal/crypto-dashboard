import type {
  LearnItemId,
  LearnProgressItem,
  LearnProgressResponse,
  LearnStatus,
} from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

/** What the account remembers about the guided tours */
export const learnApi = {
  getProgress: (accessToken: string) =>
    request<LearnProgressResponse>('/api/learn/progress', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  setProgress: (itemId: LearnItemId, status: LearnStatus, accessToken: string) =>
    request<{ item: LearnProgressItem }>(`/api/learn/progress/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
};
