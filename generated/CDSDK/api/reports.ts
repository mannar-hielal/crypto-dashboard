import type { BugReportRequest, BugReportResponse } from '../types/index.js';

const REPORT_TIMEOUT_MS = 30_000;

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Sends a bug report (signed-in users only). Rejects with an Error carrying the server's message
 * and a `status` (400 invalid report or screenshot, 401, 413 too large, 429 too many, 500).
 */
export async function reportBug(
  body: BugReportRequest,
  accessToken: string
): Promise<BugReportResponse> {
  const res = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    // 🔐 Bounded like every SDK call, but longer: up to three screenshots go up, about 4 MB on a phone's link
    signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return (await res.json()) as BugReportResponse;
}
