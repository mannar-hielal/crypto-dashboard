import { describe, it, expect, vi, beforeEach } from 'vitest';

const reportBug = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@crypto-dashboard/sdk', () => ({ reportBug }));
vi.mock('@/lib/session', () => ({ refreshAccessToken: refresh }));

import { useAuthStore } from '@/store/authStore';
import { BugReportError, sendBugReport } from '../sendBugReport';

const report = {
  description: 'It broke when I clicked Buy.',
  context: { area: 'chart' as const, path: '/chart', viewport: '1x1@1', userAgent: 'x' },
  screenshots: [],
};
const httpError = (status: number, message = 'nope') =>
  Object.assign(new Error(message), { status });

describe('sendBugReport', () => {
  beforeEach(() => {
    reportBug.mockReset();
    refresh.mockReset();
    useAuthStore
      .getState()
      .setAuth('old-token', { id: 'u1', email: 'a@example.com', username: 'a' });
  });

  it('should send with the signed-in token', async () => {
    reportBug.mockResolvedValue({ ok: true });
    await sendBugReport(report);
    expect(reportBug).toHaveBeenCalledWith(report, 'old-token');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should refuse at once without a token, without calling the server', async () => {
    useAuthStore.getState().clearAuth();
    await expect(sendBugReport(report)).rejects.toMatchObject({ status: 401 });
    expect(reportBug).not.toHaveBeenCalled();
  });

  it('should renew an expired token through the session and send once more, so a valid session is not told to sign in', async () => {
    reportBug.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({ ok: true });
    refresh.mockResolvedValue('new-token');
    await expect(sendBugReport(report)).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reportBug).toHaveBeenNthCalledWith(2, report, 'new-token');
  });

  it('should give up with the 401 when the session cannot be renewed', async () => {
    reportBug.mockRejectedValue(httpError(401, 'Unauthorized'));
    refresh.mockResolvedValue(null);
    await expect(sendBugReport(report)).rejects.toMatchObject({ status: 401 });
    expect(reportBug).toHaveBeenCalledTimes(1);
  });

  it('should try only once more: a second 401 after a renewal is the answer', async () => {
    reportBug.mockRejectedValue(httpError(401));
    refresh.mockResolvedValue('new-token');
    await expect(sendBugReport(report)).rejects.toBeInstanceOf(BugReportError);
    expect(reportBug).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([400, 403, 413, 429, 500])('should not renew or retry for a %s', async (status) => {
    reportBug.mockRejectedValue(httpError(status));
    await expect(sendBugReport(report)).rejects.toMatchObject({ status });
    expect(refresh).not.toHaveBeenCalled();
    expect(reportBug).toHaveBeenCalledTimes(1);
  });

  it('should report a dropped connection with status 0', async () => {
    reportBug.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendBugReport(report)).rejects.toMatchObject({
      status: 0,
      message: 'Failed to fetch',
    });
  });
});
