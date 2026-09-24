import type {
  SyncAccountResponse,
  SyncOrderResponse,
  SyncTradeResponse,
  SyncPositionResponse,
  CreateOrderRequest,
  UpdateOrderRequest,
  CreateTradeRequest,
  CreatePositionRequest,
  UpdatePositionRequest,
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
      ...(init?.body !== undefined && init.body !== null && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    credentials: 'include',
  });

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

// ─── Paper API ────────────────────────────────────────────────────────────────

export const paperApi = {
  getAccount: (accessToken: string) =>
    request<SyncAccountResponse>('/api/paper/account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  updateAccount: (body: Partial<SyncAccountResponse>, accessToken: string) =>
    request<SyncAccountResponse>('/api/paper/account', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  resetAccount: (accessToken: string) =>
    request<SyncAccountResponse>('/api/paper/account/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  getOrders: (query: { status?: string; limit?: number } = {}, accessToken: string) => {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    return request<SyncOrderResponse[]>(`/api/paper/orders${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  getTrades: (query: { limit?: number } = {}, accessToken: string) => {
    const params = new URLSearchParams();
    if (query.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    return request<SyncTradeResponse[]>(`/api/paper/trades${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  getPositions: (accessToken: string) =>
    request<SyncPositionResponse[]>('/api/paper/positions', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  createPosition: (body: CreatePositionRequest, accessToken: string) =>
    request<SyncPositionResponse>('/api/paper/positions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  createOrder: (body: CreateOrderRequest, accessToken: string) =>
    request<SyncOrderResponse>('/api/paper/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  updateOrder: (id: string, body: UpdateOrderRequest, accessToken: string) =>
    request<SyncOrderResponse>(`/api/paper/orders/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  recordTrade: (body: CreateTradeRequest, accessToken: string) =>
    request<SyncTradeResponse>('/api/paper/trades', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  deletePosition: (id: string, accessToken: string) =>
    request<void>(`/api/paper/positions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  updatePosition: (id: string, body: UpdatePositionRequest, accessToken: string) =>
    request<SyncPositionResponse>(`/api/paper/positions/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),
};
