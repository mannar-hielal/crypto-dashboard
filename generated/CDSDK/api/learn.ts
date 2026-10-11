import type {
  LearnEventRequest,
  LearnItemId,
  LearnProgressItem,
  LearnProgressResponse,
  LearnStatus,
} from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  // 204: nothing to read (an accepted event)
  if (res.status === 204) return undefined as T;
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

  /** Fire-and-forget: report a tour event (accepted with 204, or silently dropped over the cap) */
  trackEvent: (event: LearnEventRequest, accessToken: string) =>
    request<void>('/api/learn/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }),
};
