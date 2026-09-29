/**
 * EmailService with the test hooks on: nothing reaches Resend, even with a real key in the
 * environment — the email only goes to the test outbox.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null });

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

vi.mock('../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config.js')>();
  return {
    ...actual,
    config: { ...actual.config, resendApiKey: 'not a real key', testHooks: false },
  };
});

const { config } = await import('../../config.js');
const { EmailService } = await import('../EmailService.js');
const { clearOutbox, outboxFor } = await import('../emailOutbox.js');

describe('EmailService — the test hooks never send real email', () => {
  beforeEach(() => {
    send.mockClear();
    clearOutbox();
  });

  it('should send through Resend when a key is set and the test hooks are off', async () => {
    config.testHooks = false;
    await EmailService.sendPasswordResetEmail('user@example.com', 'http://localhost/reset?t=1');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('should only record the email in the outbox when the test hooks are on, key or no key', async () => {
    config.testHooks = true;
    await EmailService.sendPasswordResetEmail('e2e@test.local', 'http://localhost/reset?t=2');
    await EmailService.sendVerificationEmail('e2e@test.local', 'http://localhost/verify?t=3');
    expect(send).not.toHaveBeenCalled();
    expect(outboxFor('e2e@test.local').map((e) => e.kind)).toEqual([
      'verify-email',
      'password-reset',
    ]);
  });
});
