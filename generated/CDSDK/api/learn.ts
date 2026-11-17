import type {
  HabitsResponse,
  LearnEventRequest,
  LearnItemId,
  LearnProgressItem,
  LearnProgressResponse,
  LearnStatus,
} from '../types/index.js';
import { SDK_REQUEST_TIMEOUT_MS } from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init: RequestInit): Promise<T> {
  // 🔐 Bounded like every SDK call (auth.ts): a stalled request fails instead of hanging, so a
  // progress read, a save or a habits read always settles
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(SDK_REQUEST_TIMEOUT_MS),
  });
  // 204: nothing to read (an accepted event)
  if (res.status === 204) return undefined as T;
  // With its status, so a caller tells a refusal (409: an earlier version) from a failure; the
  // status is checked before the body, which an edge or a proxy may send as HTML (a 502)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw Object.assign(new Error(body?.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return (await res.json()) as T;
}

/** This device's IANA time zone (`Europe/Zurich`), or none where the runtime can't say */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** What the account remembers about learning: tours, lessons, offers, habits and events */
export const learnApi = {
  getProgress: (accessToken: string) =>
    request<LearnProgressResponse>('/api/learn/progress', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  /**
   * `step`: a lesson's funnel step number, with its start (the furthest screen) and its finish (the
   * last screen); a checkpoint pass's question set version (`CHECKPOINT_VERSIONS`). The server
   * answers 409 to one from an earlier version
   */
  setProgress: (itemId: LearnItemId, status: LearnStatus, accessToken: string, step?: number) =>
    request<{ item: LearnProgressItem }>(`/api/learn/progress/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(step === undefined ? { status } : { status, step }),
    }),

  /**
   * The account's habit badges and learning streak, counted from what is already stored. `zone`:
   * the learner's time zone (IANA; this device's by default), so the days are their own. 🔐 Sent
   * as a header, never in the URL: a URL lands in logs, and the zone is a rough location
   */
  getHabits: (accessToken: string, zone: string | undefined = deviceTimeZone()) =>
    request<HabitsResponse>('/api/learn/habits', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(zone ? { 'X-Time-Zone': zone } : {}),
      },
    }),

  /** Fire-and-forget: report a tour event (accepted with 204) */
  trackEvent: (event: LearnEventRequest, accessToken: string) =>
    request<void>('/api/learn/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }),
};
