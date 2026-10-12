import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock EmailService ───────────────────────────────────────────────────────
vi.mock('../services/EmailService.js', () => ({
  EmailService: {
    sendNewsletterConfirmation: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    const prismaClient = {
      user: { findUnique: vi.fn() },
      subscriber: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
            typeof arg === 'function' ? arg(prismaClient) : Promise.all(arg)
        ),
    };
    app.decorate('prisma', prismaClient as never);
  };
  Object.defineProperty(plugin, skipOverride, { value: true });
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { EmailService } from '../services/EmailService.js';

describe('Newsletter Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ userId: 'admin-1', email: 'admin@test.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/newsletter/subscribe', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('subscribes a new email and sends confirmation', async () => {
      vi.mocked(app.prisma.subscriber.create).mockResolvedValueOnce({} as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        message: 'Check your inbox to confirm your subscription.',
      });
      expect(app.prisma.subscriber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            status: 'pending',
            tokenHash: expect.any(String),
          }),
        })
      );
      expect(EmailService.sendNewsletterConfirmation).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('/newsletter/verify?token='),
        expect.stringContaining('/newsletter/unsubscribe?token=')
      );
    });

    it('rejects invalid email format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'not-an-email' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects empty email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: '' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('re-activates unsubscribed subscriber on P2002 and sends new confirmation', async () => {
      const p2002 = Object.assign(new Error(), { code: 'P2002' });
      vi.mocked(app.prisma.subscriber.create).mockRejectedValueOnce(p2002);
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'unsubscribed',
        tokenHash: 'old-hash',
        consentIp: null,
        verifiedAt: null,
        createdAt: new Date(),
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        message: 'Check your inbox to confirm your subscription.',
      });
      expect(app.prisma.subscriber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ status: 'pending' }),
        })
      );
      expect(EmailService.sendNewsletterConfirmation).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(String)
      );
    });

    it('returns already-subscribed for verified subscriber on P2002', async () => {
      const p2002 = Object.assign(new Error(), { code: 'P2002' });
      vi.mocked(app.prisma.subscriber.create).mockRejectedValueOnce(p2002);
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'verified',
        tokenHash: 'old-hash',
        consentIp: '::1',
        verifiedAt: new Date(),
        createdAt: new Date(),
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        message: 'Check your inbox — you are already subscribed.',
      });
      expect(app.prisma.subscriber.update).not.toHaveBeenCalled();
      expect(EmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();
    });

    it('returns already-subscribed for pending subscriber on P2002', async () => {
      const p2002 = Object.assign(new Error(), { code: 'P2002' });
      vi.mocked(app.prisma.subscriber.create).mockRejectedValueOnce(p2002);
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'pending',
        tokenHash: 'old-hash',
        consentIp: '::1',
        verifiedAt: null,
        createdAt: new Date(),
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        message: 'Check your inbox — you are already subscribed.',
      });
      expect(app.prisma.subscriber.update).not.toHaveBeenCalled();
      expect(EmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();
    });

    it('returns 500 when P2002 occurs but no existing record found', async () => {
      const p2002 = Object.assign(new Error(), { code: 'P2002' });
      vi.mocked(app.prisma.subscriber.create).mockRejectedValueOnce(p2002);
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('returns 500 on non-P2002 Prisma error', async () => {
      vi.mocked(app.prisma.subscriber.create).mockRejectedValueOnce(new Error('DB timeout'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/subscribe',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('POST /api/newsletter/verify', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('verifies a pending subscriber', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'pending',
        tokenHash: 'some-hash',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/verify',
        payload: { token: 'valid-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        message: 'Email verified. You are on the waitlist!',
      });
      expect(app.prisma.subscriber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ status: 'verified' }),
        })
      );
    });

    it('returns 404 for invalid token', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/verify',
        payload: { token: 'invalid-token' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Invalid or expired link.' });
    });

    it('returns already-verified for verified subscriber', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'verified',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/verify',
        payload: { token: 'valid-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'Email already verified.' });
      expect(app.prisma.subscriber.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/newsletter/unsubscribe', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('unsubscribes a verified subscriber', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'verified',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/unsubscribe',
        payload: { token: 'valid-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'You have been unsubscribed.' });
      expect(app.prisma.subscriber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: { status: 'unsubscribed' },
        })
      );
    });

    it('returns 404 for invalid token', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/unsubscribe',
        payload: { token: 'invalid-token' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Invalid link.' });
    });

    it('returns already-unsubscribed for unsubscribed subscriber', async () => {
      vi.mocked(app.prisma.subscriber.findUnique).mockResolvedValueOnce({
        id: 'sub-1',
        email: 'test@example.com',
        status: 'unsubscribed',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/newsletter/unsubscribe',
        payload: { token: 'valid-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'You are already unsubscribed.' });
      expect(app.prisma.subscriber.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/newsletter/subscribers', () => {
    beforeEach(() => {
      // requireAdmin reads the account: the admin, verified
      vi.mocked(app.prisma.user.findUnique).mockResolvedValue({
        email: 'admin@test.com',
        emailVerifiedAt: new Date(),
      } as never);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/newsletter/subscribers',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for a signed-in user who is not the admin, and reads nothing', async () => {
      const userToken = app.jwt.sign({ userId: 'user-1', email: 'user@test.com' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/newsletter/subscribers',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'Forbidden' });
      expect(app.prisma.subscriber.findMany).not.toHaveBeenCalled();
    });

    it('returns all subscribers without status filter', async () => {
      const mockSubscribers = [
        {
          id: 'sub-1',
          email: 'a@test.com',
          status: 'verified',
          createdAt: '2025-01-01T00:00:00.000Z',
          verifiedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'sub-2',
          email: 'b@test.com',
          status: 'pending',
          createdAt: '2025-01-02T00:00:00.000Z',
          verifiedAt: null,
        },
      ];
      vi.mocked(app.prisma.subscriber.findMany).mockResolvedValueOnce(mockSubscribers as never);

      const res = await app.inject({
        method: 'GET',
        url: '/api/newsletter/subscribers',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ subscribers: mockSubscribers, total: 2 });
      expect(app.prisma.subscriber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('filters subscribers by status query param', async () => {
      const mockSubscribers = [
        {
          id: 'sub-1',
          email: 'a@test.com',
          status: 'pending',
          createdAt: '2025-01-01T00:00:00.000Z',
          verifiedAt: null,
        },
      ];
      vi.mocked(app.prisma.subscriber.findMany).mockResolvedValueOnce(mockSubscribers as never);

      const res = await app.inject({
        method: 'GET',
        url: '/api/newsletter/subscribers?status=pending',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ subscribers: mockSubscribers, total: 1 });
      expect(app.prisma.subscriber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' } })
      );
    });
  });
});
