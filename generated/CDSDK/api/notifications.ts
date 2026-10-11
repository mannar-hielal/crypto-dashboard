import type { MessageResponse, NotificationSettings } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

/** E-mail preferences. Everything is opt-in and off until the user turns it on. */
export const notificationsApi = {
  get: (accessToken: string) =>
    request<NotificationSettings>('/api/notifications', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  set: (settings: NotificationSettings, accessToken: string) =>
    request<NotificationSettings>('/api/notifications', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),

  /** The link in the e-mail: no sign-in needed, the token says whose preference it is */
  unsubscribe: (token: string) =>
    request<MessageResponse>('/api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
};
