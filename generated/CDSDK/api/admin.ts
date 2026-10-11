import type { RetentionMetricsResponse } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

/** Admin-only endpoints: the server answers 403 to anyone but the configured admin */
export const adminApi = {
  getRetentionMetrics: (accessToken: string) =>
    request<RetentionMetricsResponse>('/api/admin/metrics/retention', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};
