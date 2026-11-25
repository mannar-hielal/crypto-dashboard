import { reportBug, type BugReportRequest } from '@crypto-dashboard/sdk';

import { useAuthStore } from '@/store/authStore';

/** A report the server refused or could not take: `status` is the HTTP status (0: it never got there) */
export class BugReportError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const statusOf = (err: unknown): number => {
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : 0;
};

/**
 * Sends the report with the signed-in user's token. A token that has expired (a tab left open while the
 * report was written) is renewed through the session's own single-flight refresh and the send is tried
 * once more, so a valid session is never told to sign in again. Throws a `BugReportError`.
 */
export async function sendBugReport(report: BugReportRequest): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new BugReportError('Sign in to report a bug.', 401);
  try {
    await reportBug(report, token);
    return;
  } catch (first) {
    if (statusOf(first) !== 401) throw toError(first);
    // Loaded only now: the refresh machinery is not needed unless a token has actually expired
    const { refreshAccessToken } = await import('@/lib/session');
    const fresh = await refreshAccessToken();
    if (!fresh) throw toError(first);
    try {
      await reportBug(report, fresh);
    } catch (second) {
      throw toError(second);
    }
  }
}

function toError(err: unknown): BugReportError {
  return new BugReportError(
    err instanceof Error ? err.message : 'Could not send the report.',
    statusOf(err)
  );
}
