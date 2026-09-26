/**
 * Paper-trading API (BYBIT_PARITY_PLAN BP-1): intent-only endpoints.
 *
 * The client says *what* to do (symbol, side, amount, trigger price, TP/SL). The server picks
 * prices from its own live feed, runs the engine (apps/server/src/trading) and returns the
 * resulting delta, which is also pushed to the user's other tabs over the private WebSocket.
 *
 * 🔐 F11: the old endpoints that stored client-computed balances, fill prices and PnL
 * (PATCH /account, POST /orders|trades|positions, PATCH/DELETE /orders|positions) are gone —
 * nothing the client sends can set a price, a balance or a PnL.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { Decimal } from '@prisma/client/runtime/client';
import type {
  EditPendingOrderRequest,
  JournalNoteRequest,
  PlaceOrderRequest,
  UpdatePositionExitsRequest,
} from '@crypto-dashboard/sdk';
import { ALLOWED_SYMBOLS } from '../../constants.js';
import { TradingError, type Executed } from '../../trading/TradingService.js';
import type { ExitLeg } from '../../trading/engine/index.js';
import { privatePaperWs } from './ws.js';

// ─── Shared schemas ───────────────────────────────────────────────────────────

const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

// 🔐 Up to 12 integer digits and 8 decimals — matches the Decimal(20, 8) columns
const decimalString = {
  type: 'string',
  pattern: '^\\d{1,12}(\\.\\d{1,8})?$',
  maxLength: 21,
} as const;
const nullableDecimal = { ...decimalString, type: ['string', 'null'] } as const;

/** Public ids: engine ids (`<ms>-<base64url>`), cuid, and pre-BP-1 browser refIds */
const idParam = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
  },
} as const;

const legParam = {
  type: 'object',
  required: ['id', 'leg'],
  additionalProperties: false,
  properties: {
    ...idParam.properties,
    leg: { type: 'string', enum: ['take-profit', 'stop-loss'] },
  },
} as const;

/** Every mutating route answers { result, delta, sound? }. Delta shape: PaperDeltaDTO (SDK). */
const actionResponse = (result: object) =>
  ({
    type: 'object',
    required: ['result', 'delta'],
    properties: {
      result,
      delta: { type: 'object', additionalProperties: true },
      sound: { type: 'string', enum: ['placed', 'queued', 'filled', 'profit', 'loss'] },
    },
  }) as const;

// Shape: PaperStateDTO (generated/CDSDK/types). No `required` list: with no `properties`
// declared, fast-json-stringify emits invalid JSON for it.
const stateResponse = { type: 'object', additionalProperties: true } as const;

const secured = { security: [{ bearerAuth: [] }] } as const;

// 🔐 Mutating routes: 60 requests per minute (on top of the global 100/min)
const mutationRateLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } } as const;

const MAX_AMOUNT = new Decimal('1000000000'); // 1e9 USDT / price ceiling

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userIdOf(request: { user: unknown }): string {
  return (request.user as { userId: string }).userId;
}

/** A required positive, bounded decimal (the schema already checked the format). */
function positive(value: string, field: string): Decimal {
  const d = new Decimal(value);
  if (d.lte(0) || d.gt(MAX_AMOUNT)) throw new TradingError(409, `${field} must be positive`);
  return d;
}

function optionalPositive(value: string | null | undefined, field: string): Decimal | null {
  return value === null || value === undefined ? null : positive(value, field);
}

/** Serialize an engine outcome; `notFound` turns a false / 'not-found' result into a 404. */
function send<R>(
  reply: FastifyReply,
  executed: Executed<R>,
  opts: { notFound?: (result: R) => boolean; map?: (result: R) => unknown } = {}
) {
  if (opts.notFound?.(executed.result)) return reply.status(404).send({ error: 'Not found' });
  return reply.send({
    result: opts.map ? opts.map(executed.result) : executed.result,
    delta: executed.delta,
    ...(executed.sound ? { sound: executed.sound } : {}),
  });
}

async function guarded(reply: FastifyReply, fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TradingError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    throw err; // 🔐 anything else → global handler → { error: 'Internal Server Error' }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function paperRoutes(app: FastifyInstance) {
  // ── GET /state — full account view ──────────────────────────────────────────
  app.get(
    '/state',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Paper Trading'],
        summary: 'Balance, positions, pending orders and recent history',
        ...secured,
        response: { 200: stateResponse, 401: errorResponse, 500: errorResponse },
      },
    },
    async (request) => app.paperRepository.snapshot(userIdOf(request))
  );

  // ── POST /orders — place a market / limit / stop order ──────────────────────
  app.post<{ Body: PlaceOrderRequest }>(
    '/orders',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Place an order (market fills at the server live price)',
        ...secured,
        body: {
          type: 'object',
          required: ['symbol', 'side', 'type', 'usdtAmount'],
          additionalProperties: false,
          properties: {
            symbol: { type: 'string', enum: [...ALLOWED_SYMBOLS] },
            side: { type: 'string', enum: ['buy', 'sell'] },
            type: { type: 'string', enum: ['market', 'limit', 'stop'] },
            usdtAmount: decimalString,
            triggerPrice: decimalString,
            takeProfit: decimalString,
            stopLoss: decimalString,
          },
        },
        response: {
          200: actionResponse({ type: ['string', 'null'] }),
          400: errorResponse,
          401: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () => {
        const b = request.body;
        if (b.type !== 'market' && !b.triggerPrice) {
          return reply.status(400).send({ error: 'triggerPrice is required for limit / stop' });
        }
        const executed = await app.trading.placeOrder(userIdOf(request), {
          symbol: b.symbol,
          side: b.side,
          type: b.type,
          usdtAmount: positive(b.usdtAmount, 'usdtAmount'),
          ...(b.type !== 'market' && b.triggerPrice
            ? { triggerPrice: positive(b.triggerPrice, 'triggerPrice') }
            : {}),
          ...(b.takeProfit ? { takeProfit: positive(b.takeProfit, 'takeProfit') } : {}),
          ...(b.stopLoss ? { stopLoss: positive(b.stopLoss, 'stopLoss') } : {}),
        });
        return send(reply, executed);
      })
  );

  // ── DELETE /orders/:id — cancel a pending order ─────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/orders/:id',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Cancel a pending order (refunds its reserve)',
        ...secured,
        params: idParam,
        response: {
          200: actionResponse({ type: 'boolean' }),
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(reply, await app.trading.cancelOrder(userIdOf(request), request.params.id), {
          notFound: (r) => r === false,
        })
      )
  );

  // ── PATCH /orders/:id — edit a pending order ────────────────────────────────
  app.patch<{ Params: { id: string }; Body: EditPendingOrderRequest }>(
    '/orders/:id',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Edit a pending order (price, amount, TP/SL)',
        ...secured,
        params: idParam,
        body: {
          type: 'object',
          required: ['triggerPrice', 'usdtAmount', 'takeProfit', 'stopLoss'],
          additionalProperties: false,
          properties: {
            triggerPrice: decimalString,
            usdtAmount: decimalString,
            takeProfit: nullableDecimal,
            stopLoss: nullableDecimal,
          },
        },
        response: {
          200: actionResponse({ type: 'string', enum: ['ok', 'rejected'] }),
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () => {
        const b = request.body;
        const executed = await app.trading.editOrder(
          userIdOf(request),
          request.params.id,
          positive(b.triggerPrice, 'triggerPrice'),
          positive(b.usdtAmount, 'usdtAmount'),
          optionalPositive(b.takeProfit, 'takeProfit'),
          optionalPositive(b.stopLoss, 'stopLoss')
        );
        return send(reply, executed, { notFound: (r) => r === 'not-found' });
      })
  );

  // ── DELETE /orders/:id/exits/:leg — cancel a pending order's TP or SL ───────
  app.delete<{ Params: { id: string; leg: ExitLeg } }>(
    '/orders/:id/exits/:leg',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: "Cancel a pending order's take-profit or stop-loss leg",
        ...secured,
        params: legParam,
        response: {
          200: actionResponse({ type: 'boolean' }),
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(
          reply,
          await app.trading.cancelOrderExit(
            userIdOf(request),
            request.params.id,
            request.params.leg
          ),
          { notFound: (r) => r === false }
        )
      )
  );

  // ── PATCH /positions/:id/tpsl — set / change / remove TP and SL ─────────────
  app.patch<{ Params: { id: string }; Body: UpdatePositionExitsRequest }>(
    '/positions/:id/tpsl',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: "Set, change or remove a position's TP / SL",
        ...secured,
        params: idParam,
        body: {
          type: 'object',
          required: ['takeProfit', 'stopLoss'],
          additionalProperties: false,
          properties: { takeProfit: nullableDecimal, stopLoss: nullableDecimal },
        },
        response: {
          200: actionResponse({ type: 'boolean' }),
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(
          reply,
          await app.trading.updatePositionExits(
            userIdOf(request),
            request.params.id,
            optionalPositive(request.body.takeProfit, 'takeProfit'),
            optionalPositive(request.body.stopLoss, 'stopLoss')
          ),
          { notFound: (r) => r === false }
        )
      )
  );

  // ── DELETE /positions/:id/exits/:leg — cancel a position's TP or SL ─────────
  app.delete<{ Params: { id: string; leg: ExitLeg } }>(
    '/positions/:id/exits/:leg',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: "Cancel a position's take-profit or stop-loss",
        ...secured,
        params: legParam,
        response: {
          200: actionResponse({ type: 'boolean' }),
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(
          reply,
          await app.trading.cancelPositionExit(
            userIdOf(request),
            request.params.id,
            request.params.leg
          ),
          { notFound: (r) => r === false }
        )
      )
  );

  // ── POST /positions/:id/close — close at the live price ─────────────────────
  app.post<{ Params: { id: string } }>(
    '/positions/:id/close',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Close a position at the server live price',
        ...secured,
        params: idParam,
        response: {
          200: actionResponse({ type: ['string', 'null'] }),
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(reply, await app.trading.closePosition(userIdOf(request), request.params.id), {
          notFound: (r) => r === null,
          map: (pnl) => pnl?.toString() ?? null,
        })
      )
  );

  // ── PATCH /account/leverage ──────────────────────────────────────────────────
  app.patch<{ Body: { leverage: number } }>(
    '/account/leverage',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Set the account leverage (1–10)',
        ...secured,
        body: {
          type: 'object',
          required: ['leverage'],
          additionalProperties: false,
          properties: { leverage: { type: 'integer', minimum: 1, maximum: 10 } },
        },
        response: {
          200: actionResponse({ type: 'integer' }),
          400: errorResponse,
          401: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(reply, await app.trading.setLeverage(userIdOf(request), request.body.leverage))
      )
  );

  // ── POST /account/reset ──────────────────────────────────────────────────────
  app.post(
    '/account/reset',
    {
      onRequest: [app.authenticate],
      // 🔐 Destructive — tighter limit
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['Paper Trading'],
        summary: 'Reset the paper account to $10,000 (wipes positions, orders and history)',
        ...secured,
        response: {
          200: actionResponse({ type: 'boolean' }),
          401: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () => send(reply, await app.trading.reset(userIdOf(request))))
  );

  // ── POST /journal, PATCH /journal/:id — the user's own notes ────────────────
  const noteBody = {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string', minLength: 1, maxLength: 500 } },
  } as const;

  app.post<{ Body: JournalNoteRequest }>(
    '/journal',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Add a journal note',
        ...secured,
        body: noteBody,
        response: {
          200: actionResponse({ type: 'string' }),
          400: errorResponse,
          401: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(reply, await app.trading.addNote(userIdOf(request), request.body.text))
      )
  );

  app.patch<{ Params: { id: string }; Body: JournalNoteRequest }>(
    '/journal/:id',
    {
      onRequest: [app.authenticate],
      config: mutationRateLimit,
      schema: {
        tags: ['Paper Trading'],
        summary: 'Edit one of your journal notes (system entries are read-only)',
        ...secured,
        params: idParam,
        body: noteBody,
        response: {
          200: actionResponse({ type: 'boolean' }),
          400: errorResponse,
          401: errorResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) =>
      guarded(reply, async () =>
        send(
          reply,
          await app.trading.editNote(userIdOf(request), request.params.id, request.body.text)
        )
      )
  );

  // ── Private WebSocket ────────────────────────────────────────────────────────
  await privatePaperWs(app);
}
