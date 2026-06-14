import { FastifyInstance } from 'fastify';
import { Account, Order, Trade, Position } from '../../../generated/prisma/client.js';
import {
  CreateOrderRequest,
  UpdateOrderRequest,
  CreateTradeRequest,
  CreatePositionRequest,
  UpdatePositionRequest,
  SyncAccountResponse,
} from '@crypto-dashboard/sdk';
import { ALLOWED_SYMBOLS } from '../../constants.js';

// ─── SHARED SCHEMAS ───────────────────────────────────────────────────────────

const accountResponse = {
  type: 'object',
  required: ['id', 'totalBalance', 'availableBalance', 'unrealizedPnl', 'realizedPnl'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    totalBalance: { type: 'string' },
    availableBalance: { type: 'string' },
    unrealizedPnl: { type: 'string' },
    realizedPnl: { type: 'string' },
    lastReset: { type: 'string', format: 'date-time' },
    resetCount: { type: 'integer' },
  },
};

const orderResponse = {
  type: 'object',
  required: ['id', 'symbol', 'side', 'orderType', 'quantity', 'status', 'createdAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    refId: { type: ['string', 'null'] },
    symbol: { type: 'string' },
    side: { type: 'string' },
    orderType: { type: 'string' },
    quantity: { type: 'string' },
    limitPrice: { type: ['string', 'null'] },
    stopPrice: { type: ['string', 'null'] },
    takeProfit: { type: ['string', 'null'] },
    stopLoss: { type: ['string', 'null'] },
    status: { type: 'string' },
    filledQuantity: { type: 'string' },
    averageFilledPrice: { type: ['string', 'null'] },
    margin: { type: 'string' },
    commission: { type: 'string' },
    rejectionReason: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    filledAt: { type: ['string', 'null'], format: 'date-time' },
    cancelledAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

const tradeResponse = {
  type: 'object',
  required: ['id', 'symbol', 'side', 'quantity', 'executedPrice', 'totalCost', 'pnl', 'executedAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    refId: { type: ['string', 'null'] },
    symbol: { type: 'string' },
    side: { type: 'string' },
    quantity: { type: 'string' },
    executedPrice: { type: 'string' },
    entryPrice: { type: ['string', 'null'] },
    totalCost: { type: 'string' },
    commission: { type: 'string' },
    pnl: { type: 'string' },
    pnlPercent: { type: 'string' },
    openedAt: { type: ['string', 'null'], format: 'date-time' },
    executedAt: { type: 'string', format: 'date-time' },
  },
};

const positionResponse = {
  type: 'object',
  required: ['id', 'symbol', 'side', 'quantity', 'entryPrice', 'margin', 'openedAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    refId: { type: ['string', 'null'] },
    symbol: { type: 'string' },
    side: { type: 'string' },
    quantity: { type: 'string' },
    entryPrice: { type: 'string' },
    margin: { type: 'string' },
    takeProfit: { type: ['string', 'null'] },
    stopLoss: { type: ['string', 'null'] },
    openedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function serializeAccount(account: Account) {
  return {
    ...account,
    totalBalance: account.totalBalance.toString(),
    availableBalance: account.availableBalance.toString(),
    unrealizedPnl: account.unrealizedPnl.toString(),
    realizedPnl: account.realizedPnl.toString(),
    lastReset: account.lastReset.toISOString(),
  };
}

function serializeOrder(order: Order) {
  return {
    ...order,
    quantity: order.quantity.toString(),
    limitPrice: order.limitPrice?.toString() ?? null,
    stopPrice: order.stopPrice?.toString() ?? null,
    takeProfit: order.takeProfit?.toString() ?? null,
    stopLoss: order.stopLoss?.toString() ?? null,
    filledQuantity: order.filledQuantity.toString(),
    averageFilledPrice: order.averageFilledPrice?.toString() ?? null,
    margin: order.margin.toString(),
    commission: order.commission.toString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    filledAt: order.filledAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}

function serializeTrade(trade: Trade) {
  return {
    ...trade,
    quantity: trade.quantity.toString(),
    executedPrice: trade.executedPrice.toString(),
    entryPrice: trade.entryPrice?.toString() ?? null,
    totalCost: trade.totalCost.toString(),
    commission: trade.commission.toString(),
    pnl: trade.pnl.toString(),
    pnlPercent: trade.pnlPercent.toString(),
    openedAt: trade.openedAt?.toISOString() ?? null,
    executedAt: trade.executedAt.toISOString(),
    createdAt: trade.createdAt.toISOString(),
  };
}

function serializePosition(position: Position) {
  return {
    ...position,
    quantity: position.quantity.toString(),
    entryPrice: position.entryPrice.toString(),
    margin: position.margin.toString(),
    takeProfit: position.takeProfit?.toString() ?? null,
    stopLoss: position.stopLoss?.toString() ?? null,
    openedAt: position.openedAt.toISOString(),
    updatedAt: position.updatedAt.toISOString(),
  };
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

export async function paperRoutes(app: FastifyInstance) {
  // ── GET ACCOUNT ─────────────────────────────────────────────────────────────
  app.get(
    '/account',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Get paper trading account summary',
        security: [{ bearerAuth: [] }],
        response: {
          200: accountResponse,
          401: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        let account = await app.prisma.account.findUnique({
          where: { userId },
        });

        // Lazy-create account if it doesn't exist (e.g. for users migrated from Phase 1)
        if (!account) {
          account = await app.prisma.account.create({
            data: { userId },
          });
        }

        return reply.send(serializeAccount(account));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to fetch account');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── GET ORDERS ──────────────────────────────────────────────────────────────
  app.get(
    '/orders',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Get order history (active and terminal)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string' }, // optional filter
            limit: { type: 'integer', default: 50, maximum: 200 },
          },
        },
        response: {
          200: {
            type: 'array',
            items: orderResponse,
          },
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { status, limit } = request.query as { status?: string; limit: number };

      try {
        const orders = await app.prisma.order.findMany({
          where: {
            userId,
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit || 50,
        });

        return reply.send(orders.map(serializeOrder));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to fetch orders');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── GET TRADES ──────────────────────────────────────────────────────────────
  app.get(
    '/trades',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Get completed trade executions',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', default: 50, maximum: 200 },
          },
        },
        response: {
          200: {
            type: 'array',
            items: tradeResponse,
          },
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { limit } = request.query as { limit: number };

      try {
        const trades = await app.prisma.trade.findMany({
          where: { userId },
          orderBy: { executedAt: 'desc' },
          take: limit || 50,
        });

        return reply.send(trades.map(serializeTrade));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to fetch trades');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── GET POSITIONS ───────────────────────────────────────────────────────────
  app.get(
    '/positions',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Get active open positions',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'array',
            items: positionResponse,
          },
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        const positions = await app.prisma.position.findMany({
          where: { userId },
          orderBy: { openedAt: 'desc' },
        });

        return reply.send(positions.map(serializePosition));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to fetch positions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── POST POSITIONS (CREATE) ────────────────────────────────────────────────
  app.post(
    '/positions',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Create a new open position',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'entryPrice', 'margin'],
          additionalProperties: false,
          properties: {
            refId: { type: 'string', maxLength: 64 },
            symbol: { type: 'string', enum: ALLOWED_SYMBOLS as unknown as string[] },
            side: { type: 'string', enum: ['LONG', 'SHORT'] },
            quantity: { type: 'string' },
            entryPrice: { type: 'string' },
            margin: { type: 'string' },
            takeProfit: { type: ['string', 'null'] },
            stopLoss: { type: ['string', 'null'] },
          },
        },
        response: {
          201: positionResponse,
          400: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = request.body as CreatePositionRequest;

      const account = await app.prisma.account.findUnique({ where: { userId } });
      if (!account) return reply.status(400).send({ error: 'Account not found' });

      const position = await app.prisma.position.create({
        data: {
          userId,
          refId: body.refId,
          accountId: account.id,
          symbol: body.symbol,
          side: body.side,
          quantity: body.quantity,
          entryPrice: body.entryPrice,
          margin: body.margin,
          takeProfit: body.takeProfit,
          stopLoss: body.stopLoss,
        },
      });

      return reply.status(201).send(serializePosition(position));
    }
  );

  // ── POST ORDERS (CREATE) ───────────────────────────────────────────────────
  app.post(
    '/orders',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Place a new paper order',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['symbol', 'side', 'orderType', 'quantity'],
          additionalProperties: false,
          properties: {
            refId: { type: 'string', maxLength: 64 },
            symbol: { type: 'string', enum: ALLOWED_SYMBOLS as unknown as string[] },
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            orderType: { type: 'string', enum: ['MARKET', 'LIMIT', 'STOP'] },
            quantity: { type: 'string' }, // Decimal
            limitPrice: { type: 'string' },
            stopPrice: { type: 'string' },
            takeProfit: { type: 'string' },
            stopLoss: { type: 'string' },
            margin: { type: 'string' },
          },
        },
        response: {
          201: orderResponse,
          400: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = request.body as CreateOrderRequest;

      const account = await app.prisma.account.findUnique({ where: { userId } });
      if (!account) return reply.status(400).send({ error: 'Account not found' });

      const order = await app.prisma.order.create({
        data: {
          userId,
          refId: body.refId,
          accountId: account.id,
          symbol: body.symbol,
          side: body.side,
          orderType: body.orderType,
          quantity: body.quantity,
          limitPrice: body.limitPrice,
          stopPrice: body.stopPrice,
          takeProfit: body.takeProfit,
          stopLoss: body.stopLoss,
          margin: body.margin ?? '0', // ─── Changed from 0 to '0' ─────────
          status: body.orderType === 'MARKET' ? 'FILLED' : 'PENDING',
          filledQuantity: body.orderType === 'MARKET' ? body.quantity : '0',
          averageFilledPrice: body.orderType === 'MARKET' ? body.limitPrice : null,
          filledAt: body.orderType === 'MARKET' ? new Date() : null,
        },
      });

      // 🔐 Side-effect removal: Market orders no longer automatically create positions.
      // The client calls createPosition explicitly to ensure netting/merging logic
      // remains the single source of truth.

      return reply.status(201).send(serializeOrder(order));
    }
  );

  // ── RESET ACCOUNT ───────────────────────────────────────────────────────────
  app.post(
    '/account/reset',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Reset paper trading account to defaults',
        security: [{ bearerAuth: [] }],
        response: {
          200: accountResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      try {
        const account = await app.prisma.account.update({
          where: { userId },
          data: {
            totalBalance: 10000,
            availableBalance: 10000,
            unrealizedPnl: 0,
            realizedPnl: 0,
            lastReset: new Date(),
            resetCount: { increment: 1 },
          },
        });

        // Clear all active orders and trades on reset?
        // In paper trading, usually yes.
        await app.prisma.order.deleteMany({ where: { userId } });
        await app.prisma.trade.deleteMany({ where: { userId } });
        await app.prisma.position.deleteMany({ where: { userId } });

        return reply.send(serializeAccount(account));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to reset account');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── PATCH ACCOUNT ──────────────────────────────────────────────────────────
  app.patch(
    '/account',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Sync paper trading account stats',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            totalBalance: { type: 'string' },
            availableBalance: { type: 'string' },
            unrealizedPnl: { type: 'string' },
            realizedPnl: { type: 'string' },
          },
        },
        response: {
          200: accountResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = request.body as Partial<SyncAccountResponse>;

      try {
        const account = await app.prisma.account.update({
          where: { userId },
          data: {
            totalBalance: body.totalBalance,
            availableBalance: body.availableBalance,
            unrealizedPnl: body.unrealizedPnl,
            realizedPnl: body.realizedPnl,
          },
        });

        return reply.send(serializeAccount(account));
      } catch (err) {
        app.log.error({ err, userId }, 'Failed to update account');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ── PATCH ORDER (EDIT/CANCEL) ──────────────────────────────────────────────
  app.patch(
    '/orders/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Update or cancel a paper order',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['FILLED', 'CANCELLED', 'REJECTED'] },
            limitPrice: { type: 'string' },
            stopPrice: { type: 'string' },
            takeProfit: { type: ['string', 'null'] },
            stopLoss: { type: ['string', 'null'] },
            filledQuantity: { type: 'string' },
            averageFilledPrice: { type: 'string' },
            rejectionReason: { type: 'string' },
            quantity: { type: 'string' },
            margin: { type: 'string' },
          },
        },
        response: {
          200: orderResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const body = request.body as UpdateOrderRequest;

      const existingOrder = await app.prisma.order.findFirst({
        where: {
          OR: [
            { id, userId },
            { refId: id, userId },
          ],
        },
      });

      if (!existingOrder) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const order = await app.prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          ...body,
          ...(body.status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
          ...(body.status === 'FILLED' ? { filledAt: new Date() } : {}),
        },
      });

      return reply.send(serializeOrder(order));
    }
  );

  // ── POST TRADES (RECORD) ───────────────────────────────────────────────────
  app.post(
    '/trades',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Record a new trade execution',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['symbol', 'side', 'quantity', 'executedPrice', 'totalCost'],
          additionalProperties: false,
          properties: {
            refId: { type: 'string', maxLength: 64 },
            symbol: { type: 'string', enum: ALLOWED_SYMBOLS as unknown as string[] },
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            quantity: { type: 'string' },
            executedPrice: { type: 'string' },
            entryPrice: { type: 'string' },
            totalCost: { type: 'string' },
            commission: { type: 'string' },
            pnl: { type: 'string' },
            pnlPercent: { type: 'string' },
            orderId: { type: 'string' },
            openedAt: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          201: tradeResponse,
          400: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const body = request.body as CreateTradeRequest;

      const account = await app.prisma.account.findUnique({ where: { userId } });
      if (!account) return reply.status(400).send({ error: 'Account not found' });

      const trade = await app.prisma.trade.create({
        data: {
          userId,
          refId: body.refId,
          accountId: account.id,
          symbol: body.symbol,
          side: body.side,
          quantity: body.quantity,
          executedPrice: body.executedPrice,
          entryPrice: body.entryPrice,
          totalCost: body.totalCost,
          commission: body.commission ?? '0',
          pnl: body.pnl ?? '0',
          pnlPercent: body.pnlPercent ?? '0',
          orderId: body.orderId,
          openedAt: body.openedAt,
        },
      });

      return reply.status(201).send(serializeTrade(trade));
    }
  );

  // ── DELETE POSITION ────────────────────────────────────────────────────────
  app.delete(
    '/positions/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Remove an open position (when closed)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      await app.prisma.position.deleteMany({
        where: {
          OR: [
            { id, userId },
            { refId: id, userId },
          ],
        },
      });

      return reply.status(204).send();
    }
  );

  // ── PATCH POSITION (UPDATE EXITS) ──────────────────────────────────────────
  app.patch(
    '/positions/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Update position TP/SL or quantity',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            quantity: { type: 'string' },
            takeProfit: { type: ['string', 'null'] },
            stopLoss: { type: ['string', 'null'] },
            margin: { type: 'string' },
          },
        },
        response: {
          200: positionResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const body = request.body as UpdatePositionRequest;

      const existingPosition = await app.prisma.position.findFirst({
        where: {
          OR: [
            { id, userId },
            { refId: id, userId },
          ],
        },
      });

      if (!existingPosition) {
        return reply.status(404).send({ error: 'Position not found' });
      }

      const position = await app.prisma.position.update({
        where: { id: existingPosition.id },
        data: body,
      });

      return reply.send(serializePosition(position));
    }
  );
}
