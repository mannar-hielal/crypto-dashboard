import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    const prismaClient = {
      account: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      order: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      trade: {
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      position: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
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
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';

describe('Paper Trading Routes', () => {
  let app: FastifyInstance;
  const userId = 'user-1';
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ userId, email: 'test@example.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/paper/account', () => {
    it('returns the account details', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId,
        totalBalance: '10000',
        availableBalance: '10000',
        unrealizedPnl: '0',
        realizedPnl: '0',
      };
      vi.mocked(app.prisma.account.findUnique).mockResolvedValueOnce(mockAccount as never);

      const res = await app.inject({
        method: 'GET',
        url: '/api/paper/account',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(expect.objectContaining({ id: 'acc-1' }));
    });
  });

  describe('POST /api/paper/orders', () => {
    it('creates a new order without side-effects', async () => {
      const mockAccount = { id: 'acc-1', userId };
      vi.mocked(app.prisma.account.findUnique).mockResolvedValueOnce(mockAccount as never);
      vi.mocked(app.prisma.order.create).mockResolvedValueOnce({
        id: 'order-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '1.0',
        status: 'FILLED',
        createdAt: new Date().toISOString(),
        filledQuantity: '1.0',
        margin: '0',
        commission: '0',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/paper/orders',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          symbol: 'BTCUSDT',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: '1.0',
          limitPrice: '50000',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(app.prisma.order.create).toHaveBeenCalled();
      // Verify NO position creation happened in this route
      expect(app.prisma.position.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/paper/positions', () => {
    it('creates a new position', async () => {
      const mockAccount = { id: 'acc-1', userId };
      vi.mocked(app.prisma.account.findUnique).mockResolvedValueOnce(mockAccount as never);
      vi.mocked(app.prisma.position.create).mockResolvedValueOnce({
        id: 'pos-1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        quantity: '1.0',
        entryPrice: '50000',
        margin: '1000',
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/api/paper/positions',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          symbol: 'BTCUSDT',
          side: 'LONG',
          quantity: '1.0',
          entryPrice: '50000',
          margin: '1000',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(app.prisma.position.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/paper/orders/:id', () => {
    it('updates an existing order by refId or id', async () => {
      vi.mocked(app.prisma.order.findFirst).mockResolvedValueOnce({ id: 'db-id-1' } as never);
      vi.mocked(app.prisma.order.update).mockResolvedValueOnce({
        id: 'db-id-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '1.0',
        status: 'FILLED',
        createdAt: new Date().toISOString(),
        filledQuantity: '1.0',
        margin: '0',
        commission: '0',
        updatedAt: new Date().toISOString(),
      } as never);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/paper/orders/local-ref-id',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'FILLED' },
      });

      expect(res.statusCode).toBe(200);
      expect(app.prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'db-id-1' } })
      );
    });
  });
});
