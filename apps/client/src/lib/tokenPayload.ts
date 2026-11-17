/**
 * An access token's payload, read but not verified (the server verifies it): its expiry for the
 * session's timers, its `userId` to name this account's things on the device. Null when it can't
 * be read (not a JWT, bad base64, not JSON, not an object).
 */
export function tokenPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
