import { describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '../lib/requireAdmin.js';

// ADMIN_EMAIL is 'admin@test.com' in vitest.config.ts
function run(claim: { userId: string; email: string } | undefined, account: unknown) {
  const findUnique = vi.fn().mockResolvedValue(account);
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const request = { user: claim, server: { prisma: { user: { findUnique } } } };
  const reply = { status };
  const result = requireAdmin(request as never, reply as never);
  return { result, findUnique, status, send };
}

const VERIFIED = new Date('2026-09-01T00:00:00Z');

describe('requireAdmin', () => {
  it('should pass the verified admin account', async () => {
    const t = run(
      { userId: 'u1', email: 'admin@test.com' },
      { email: 'admin@test.com', emailVerifiedAt: VERIFIED }
    );
    await t.result;
    expect(t.status).not.toHaveBeenCalled();
    expect(t.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { email: true, emailVerifiedAt: true },
    });
  });

  it('should compare e-mails the way registration stores them: case and spaces do not matter', async () => {
    const t = run(
      { userId: 'u1', email: '  Admin@Test.com ' },
      { email: 'admin@test.com', emailVerifiedAt: VERIFIED }
    );
    await t.result;
    expect(t.status).not.toHaveBeenCalled();
  });

  it('should refuse a claim that is not the admin address, without any lookup', async () => {
    const t = run(
      { userId: 'u2', email: 'someone@test.com' },
      { email: 'admin@test.com', emailVerifiedAt: VERIFIED }
    );
    await t.result;
    expect(t.status).toHaveBeenCalledWith(403);
    expect(t.findUnique).not.toHaveBeenCalled();
  });

  it('should refuse an unauthenticated request', async () => {
    const t = run(undefined, null);
    await t.result;
    expect(t.status).toHaveBeenCalledWith(403);
  });

  it('should refuse the admin address on an account that has not verified it', async () => {
    const t = run(
      { userId: 'u3', email: 'admin@test.com' },
      { email: 'admin@test.com', emailVerifiedAt: null }
    );
    await t.result;
    expect(t.status).toHaveBeenCalledWith(403);
  });

  it('should refuse a token whose e-mail claim is stale: the account has another address now', async () => {
    const t = run(
      { userId: 'u1', email: 'admin@test.com' },
      { email: 'new-address@test.com', emailVerifiedAt: VERIFIED }
    );
    await t.result;
    expect(t.status).toHaveBeenCalledWith(403);
  });

  it('should refuse a token for an account that no longer exists', async () => {
    const t = run({ userId: 'gone', email: 'admin@test.com' }, null);
    await t.result;
    expect(t.status).toHaveBeenCalledWith(403);
  });
});
