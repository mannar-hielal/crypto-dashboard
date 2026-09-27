/**
 * Paper-trading API + private WebSocket tests (BYBIT_PARITY_PLAN BP-1).
 *
 * The HTTP layer is tested with the trading service stubbed (vi.spyOn on app.trading /
 * app.paperRepository). Engine maths is covered by trading/engine/__tests__, and the service
 * layer by trading/__tests__. Here: auth, validation (intent only, no client prices),
 * error mapping, ownership (404), the removed F11 endpoints, and the WebSocket protocol.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Decimal } from '@prisma/client/runtime/client';
import type { PaperStateDTO } from '@crypto-dashboard/sdk';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
// The routes never reach Prisma here (the trading service is stubbed per test).
vi.mock('../plugins/prisma.js', () => {
  const skipOverride = Symbol.for('skip-override');
  const plugin = async (app: FastifyInstance) => {
    app.decorate('prisma', {} as never);
  };
  // Fastify Symbol-key pattern — safe, controlled access
  // eslint-disable-next-line security/detect-object-injection
  (plugin as unknown as Record<symbol, boolean>)[skipOverride] = true;
  return { prismaPlugin: plugin };
});

import { buildApp } from '../app.js';
import { marketsOf } from '../routes/paper/ws.js';
import { TradingError, WAITING_FOR_PRICE } from '../trading/TradingService.js';

const EMPTY_DELTA = {
  account: { balance: '10000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 1 },
  positionsUpsert: [],
  positionsRemove: [],
  spotUpsert: [],
  pendingUpsert: [],
  pendingRemove: [],
  orders: [],
  trades: [],
  balanceEvents: [],
  journal: [],
  journalEdits: [],
};

const STATE: PaperStateDTO = {
  account: { balance: '10000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version: 0 },
  positions: [],
  spotBalances: [],
  pendingOrders: [],
  orders: [],
  trades: [],
  journal: [],
  balanceEvents: [],
};

const executed = <R>(result: R) => ({ result, delta: EMPTY_DELTA, sound: 'placed' as const });

describe('Paper Trading API (BP-1)', () => {
  let app: FastifyInstance;
  const userId = 'user-1';
  let token: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    token = app.jwt.sign({ userId, email: 'test@example.com' });
    auth = { authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it.each([
    ['GET', '/api/paper/state'],
    ['POST', '/api/paper/orders'],
    ['DELETE', '/api/paper/orders/o1'],
    ['PATCH', '/api/paper/orders/o1'],
    ['DELETE', '/api/paper/orders/o1/exits/take-profit'],
    ['PATCH', '/api/paper/positions/p1/tpsl'],
    ['DELETE', '/api/paper/positions/p1/exits/stop-loss'],
    ['POST', '/api/paper/positions/p1/close'],
    ['PATCH', '/api/paper/account/leverage'],
    ['PATCH', '/api/paper/symbols/BTCUSDT/leverage'],
    ['POST', '/api/paper/positions/p1/margin'],
    ['POST', '/api/paper/account/margin-mode'],
    ['POST', '/api/paper/spot/exits'],
    ['POST', '/api/paper/account/reset'],
    ['POST', '/api/paper/journal'],
    ['PATCH', '/api/paper/journal/j1'],
  ] as const)('%s %s requires a valid token (401)', async (method, url) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
  });

  // ── F11: client-computed endpoints are gone ──────────────────────────────────

  it.each([
    ['PATCH', '/api/paper/account'],
    ['POST', '/api/paper/trades'],
    ['POST', '/api/paper/positions'],
    ['DELETE', '/api/paper/positions/p1'],
    ['PATCH', '/api/paper/positions/p1'],
  ] as const)('removed endpoint %s %s → 404 (F11)', async (method, url) => {
    const res = await app.inject({ method, url, headers: auth, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  // ── GET /state ───────────────────────────────────────────────────────────────

  it('GET /state returns the account snapshot of the token user', async () => {
    const snapshot = vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue(STATE);
    const res = await app.inject({ method: 'GET', url: '/api/paper/state', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(STATE);
    expect(snapshot).toHaveBeenCalledWith(userId);
  });

  // ── POST /orders ─────────────────────────────────────────────────────────────

  describe('POST /orders', () => {
    const post = (payload: object) =>
      app.inject({ method: 'POST', url: '/api/paper/orders', headers: auth, payload });

    it('passes a market intent as Decimals and returns result + delta + sound', async () => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('pos-1'));
      const res = await post({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: '100.5',
        takeProfit: '55000',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ result: 'pos-1', sound: 'placed' });
      const [calledUser, intent] = place.mock.calls[0];
      expect(calledUser).toBe(userId);
      // A pre-BP-2 client (no category, usdtAmount = margin): today's leveraged trading
      expect(intent.category).toBe('linear');
      expect(intent.size).toEqual({ margin: new Decimal('100.5') });
      expect(intent.takeProfit).toEqual(new Decimal('55000'));
      expect(intent).not.toHaveProperty('triggerPrice');
    });

    it.each([
      [{ qty: '0.01' }, { qty: new Decimal('0.01') }],
      [{ value: '500' }, { value: new Decimal('500') }],
    ])('passes the market and a %o size', async (size, expected) => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('pos-1'));
      const res = await post({
        category: 'spot',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        ...size,
      });
      expect(res.statusCode).toBe(200);
      expect(place.mock.calls[0][1]).toMatchObject({ category: 'spot', size: expected });
    });

    it.each([
      [{}, 'no size'],
      [{ qty: '1', value: '100' }, 'two sizes'],
      [{ qty: '1', usdtAmount: '100' }, 'qty and usdtAmount'],
    ])('400 for %o (%s)', async (size) => {
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', ...size });
      expect(res.statusCode).toBe(400);
    });

    it('passes trigger sources, reduce-only and close-on-trigger (BP-5 B)', async () => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('o-1'));
      const res = await post({
        symbol: 'BTCUSDT',
        side: 'sell',
        type: 'stop',
        qty: '0.1',
        triggerPrice: '48000',
        triggerBy: 'MarkPrice',
        closeOnTrigger: true,
      });
      expect(res.statusCode).toBe(200);
      // Close-on-trigger implies reduce-only
      expect(place.mock.calls[0][1]).toMatchObject({
        triggerBy: 'MarkPrice',
        closeOnTrigger: true,
        reduceOnly: true,
      });
    });

    it.each([
      [{ triggerBy: 'BestPrice' }, 'an unknown trigger source'],
      [{ tpTriggerBy: 'markprice' }, 'a trigger source in the wrong case'],
      [{ reduceOnly: 'yes' }, 'a non-boolean reduce-only'],
      [{ category: 'spot', reduceOnly: true }, 'reduce-only on spot'],
    ])('400 for %o (%s, BP-5 B)', async (extra) => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('o-1'));
      const res = await post({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        qty: '1',
        ...extra,
      });
      expect(res.statusCode).toBe(400);
      expect(place).not.toHaveBeenCalled();
    });

    it('400 for a market outside the allowlist', async () => {
      const res = await post({
        category: 'inverse',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        qty: '1',
      });
      expect(res.statusCode).toBe(400);
    });

    it('🔐 a client-supplied fee or maker flag never reaches the engine', async () => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('pos-1'));
      await post({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        qty: '1',
        fee: '0',
        feeRate: '0',
        isMaker: true,
      });
      const intent = place.mock.calls[0][1];
      expect(intent).not.toHaveProperty('fee');
      expect(intent).not.toHaveProperty('feeRate');
      expect(intent).not.toHaveProperty('isMaker');
    });

    it("422 carries Bybit's rule message", async () => {
      vi.spyOn(app.trading, 'placeOrder').mockRejectedValue(
        new TradingError(422, 'Order quantity lower than the minimum (0.001)')
      );
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', qty: '0.0001' });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({ error: 'Order quantity lower than the minimum (0.001)' });
    });

    it('🔐 a client-supplied price never reaches the engine (unknown fields are stripped)', async () => {
      // Fastify's validator removes properties not in the schema (additionalProperties: false +
      // the default removeAdditional) — the fill price is always the server's own.
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('pos-1'));
      const res = await post({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: '100',
        price: '1',
        balance: '1000000',
      });
      expect(res.statusCode).toBe(200);
      const intent = place.mock.calls[0][1];
      expect(intent).not.toHaveProperty('price');
      expect(intent).not.toHaveProperty('balance');
    });

    it.each([
      [{ symbol: 'PEPEUSDT' }, 'symbol outside the allowlist'],
      [{ side: 'long' }, 'bad side'],
      [{ type: 'trailing' }, 'bad type'],
      [{ usdtAmount: '1e5' }, 'exponent notation'],
      [{ usdtAmount: '-5' }, 'negative amount'],
      [{ usdtAmount: '1.123456789' }, 'more than 8 decimals'],
      [{ usdtAmount: 'abc' }, 'not a number'],
    ])('400 for %o (%s)', async (override) => {
      const res = await post({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        usdtAmount: '100',
        ...override,
      });
      expect(res.statusCode).toBe(400);
    });

    it('409 for a zero amount', async () => {
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', usdtAmount: '0' });
      expect(res.statusCode).toBe(409);
    });

    it('400 for a limit order without triggerPrice', async () => {
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'limit', usdtAmount: '100' });
      expect(res.statusCode).toBe(400);
    });

    it('passes a limit trigger price', async () => {
      const place = vi.spyOn(app.trading, 'placeOrder').mockResolvedValue(executed('o-1'));
      const res = await post({
        symbol: 'ETHUSDT',
        side: 'sell',
        type: 'limit',
        usdtAmount: '100',
        triggerPrice: '3100.25',
      });
      expect(res.statusCode).toBe(200);
      expect(place.mock.calls[0][1].triggerPrice).toEqual(new Decimal('3100.25'));
    });

    it('maps a TradingError to its status with only the message', async () => {
      vi.spyOn(app.trading, 'placeOrder').mockRejectedValue(
        new TradingError(409, WAITING_FOR_PRICE)
      );
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', usdtAmount: '100' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: WAITING_FOR_PRICE });
    });

    it('🔐 an unexpected error becomes a generic 500 (no internals leak)', async () => {
      vi.spyOn(app.trading, 'placeOrder').mockRejectedValue(new Error('db password is hunter2'));
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', usdtAmount: '100' });
      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe('Internal Server Error');
      expect(res.body).not.toContain('hunter2');
    });

    it('without a live price the real service answers "Waiting for live price…"', async () => {
      // No stub: the test-mode Bybit feed has no tickers
      const res = await post({ symbol: 'BTCUSDT', side: 'buy', type: 'market', usdtAmount: '100' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: WAITING_FOR_PRICE });
    });
  });

  // ── Order / position management ──────────────────────────────────────────────

  it('DELETE /orders/:id → 404 when the order is not the user’s (or does not exist)', async () => {
    const cancel = vi.spyOn(app.trading, 'cancelOrder').mockResolvedValue(executed(false));
    const res = await app.inject({ method: 'DELETE', url: '/api/paper/orders/o-9', headers: auth });
    expect(res.statusCode).toBe(404);
    expect(cancel).toHaveBeenCalledWith(userId, 'o-9');
  });

  it('DELETE /orders/:id → 200 with the delta when cancelled', async () => {
    vi.spyOn(app.trading, 'cancelOrder').mockResolvedValue(executed(true));
    const res = await app.inject({ method: 'DELETE', url: '/api/paper/orders/o-1', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: true, delta: EMPTY_DELTA });
  });

  it('🔐 rejects ids with unexpected characters (400)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/paper/orders/o%3B1',
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /orders/:id passes null exits and returns rejected', async () => {
    const edit = vi
      .spyOn(app.trading, 'editOrder')
      .mockResolvedValue(executed('rejected' as const));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/paper/orders/o-1',
      headers: auth,
      payload: { triggerPrice: '50000', usdtAmount: '200', takeProfit: null, stopLoss: '48000' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe('rejected');
    const [, , change] = edit.mock.calls[0];
    expect(change).toEqual({
      triggerPrice: new Decimal('50000'),
      size: { margin: new Decimal('200') },
      takeProfit: null,
      stopLoss: new Decimal('48000'),
    });
  });

  it('PATCH /positions/:id/tpsl passes the legs trigger sources (BP-5 B)', async () => {
    const update = vi.spyOn(app.trading, 'updatePositionExits').mockResolvedValue(executed(true));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/paper/positions/p-1/tpsl',
      headers: auth,
      payload: { takeProfit: '55000', stopLoss: '48000', slTriggerBy: 'IndexPrice' },
    });
    expect(res.statusCode).toBe(200);
    expect(update.mock.calls[0][4]).toEqual({ slTriggerBy: 'IndexPrice' });
    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/paper/positions/p-1/tpsl',
      headers: auth,
      payload: { takeProfit: null, stopLoss: null, tpTriggerBy: 'Last' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('PATCH /orders/:id accepts a qty size and rejects two sizes', async () => {
    const edit = vi.spyOn(app.trading, 'editOrder').mockResolvedValue(executed('ok' as const));
    const payload = { triggerPrice: '50000', qty: '0.02', takeProfit: null, stopLoss: null };
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/paper/orders/o-1',
      headers: auth,
      payload,
    });
    expect(ok.statusCode).toBe(200);
    expect(edit.mock.calls[0][2].size).toEqual({ qty: new Decimal('0.02') });
    const both = await app.inject({
      method: 'PATCH',
      url: '/api/paper/orders/o-1',
      headers: auth,
      payload: { ...payload, usdtAmount: '100' },
    });
    expect(both.statusCode).toBe(400);
  });

  it('DELETE /orders/:id/exits/:leg only accepts take-profit / stop-loss', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/paper/orders/o-1/exits/trailing',
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /positions/:id/close returns the gross PnL as a string', async () => {
    vi.spyOn(app.trading, 'closePosition').mockResolvedValue(executed(new Decimal('12.5')));
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/p-1/close',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe('12.5');
  });

  it('POST /positions/:id/close → 404 for an unknown position', async () => {
    vi.spyOn(app.trading, 'closePosition').mockResolvedValue(executed(null));
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/nope/close',
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /account/leverage validates 1..10', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/paper/account/leverage',
      headers: auth,
      payload: { leverage: 11 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /account/margin-mode passes Bybit's mode and answers a refusal as 422 (BP-5 E)", async () => {
    const setMode = vi
      .spyOn(app.trading, 'setMarginMode')
      .mockResolvedValue(executed('REGULAR_MARGIN' as const));
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/account/margin-mode',
      headers: auth,
      payload: { marginMode: 'REGULAR_MARGIN' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe('REGULAR_MARGIN');
    expect(setMode).toHaveBeenCalledWith(userId, 'REGULAR_MARGIN');

    setMode.mockRejectedValueOnce(
      new TradingError(422, 'Set margin mode failed: Waiting for the BTCUSDT mark price')
    );
    const refused = await app.inject({
      method: 'POST',
      url: '/api/paper/account/margin-mode',
      headers: auth,
      payload: { marginMode: 'ISOLATED_MARGIN' },
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({
      error: 'Set margin mode failed: Waiting for the BTCUSDT mark price',
    });
  });

  it.each([[{ marginMode: 'cross' }], [{ marginMode: 'PORTFOLIO_MARGIN' }], [{}]])(
    'POST /account/margin-mode → 400 for %o (BP-5 E)',
    async (payload) => {
      const setMode = vi.spyOn(app.trading, 'setMarginMode');
      const res = await app.inject({
        method: 'POST',
        url: '/api/paper/account/margin-mode',
        headers: auth,
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(setMode).not.toHaveBeenCalled();
    }
  );

  it('POST /positions/:id/margin passes the signed amount (BP-5 add / reduce margin)', async () => {
    const adjust = vi
      .spyOn(app.trading, 'adjustMargin')
      .mockResolvedValue(executed(new Decimal('600') as never));
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/p1/margin',
      headers: auth,
      payload: { margin: '-400.5' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe('600');
    expect(adjust).toHaveBeenCalledWith(userId, 'p1', new Decimal('-400.5'));
  });

  it.each([
    [{ margin: '1.12345' }, 'more than 4 decimals'],
    [{ margin: 'abc' }, 'not a number'],
    [{}, 'missing'],
  ])('POST /positions/:id/margin %o → 400 (%s)', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/p1/margin',
      headers: auth,
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /positions/:id/margin answers a refusal as 422 in Bybit wording', async () => {
    vi.spyOn(app.trading, 'adjustMargin').mockRejectedValue(
      new TradingError(422, 'Insufficient available balance to add margin')
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/p1/margin',
      headers: auth,
      payload: { margin: '100' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('Insufficient available balance to add margin');
  });

  it('PATCH /symbols/:symbol/leverage passes the symbol and leverage', async () => {
    const set = vi.spyOn(app.trading, 'setSymbolLeverage').mockResolvedValue(executed(5));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/paper/symbols/ETHUSDT/leverage',
      headers: auth,
      payload: { leverage: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe(5);
    expect(set).toHaveBeenCalledWith(userId, 'ETHUSDT', 5);
  });

  it.each([
    ['/api/paper/symbols/PEPEUSDT/leverage', { leverage: 5 }, 'symbol outside the allowlist'],
    ['/api/paper/symbols/BTCUSDT/leverage', { leverage: 0 }, 'below 1'],
    ['/api/paper/symbols/BTCUSDT/leverage', { leverage: 11 }, 'above 10'],
    ['/api/paper/symbols/BTCUSDT/leverage', { leverage: 2.5 }, 'not an integer'],
  ])('PATCH %s %o → 400 (%s)', async (url, payload) => {
    const res = await app.inject({ method: 'PATCH', url, headers: auth, payload });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /symbols/:symbol/leverage → 422 while the symbol has open trades', async () => {
    vi.spyOn(app.trading, 'setSymbolLeverage').mockRejectedValue(new TradingError(422, 'locked'));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/paper/symbols/BTCUSDT/leverage',
      headers: auth,
      payload: { leverage: 5 },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /spot/exits passes symbol, qty and the legs as Decimals', async () => {
    const place = vi.spyOn(app.trading, 'placeSpotExits').mockResolvedValue(executed('grp'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/spot/exits',
      headers: auth,
      payload: { symbol: 'BTCUSDT', qty: '0.05', stopLoss: '45000' },
    });
    expect(res.statusCode).toBe(200);
    expect(place).toHaveBeenCalledWith(userId, {
      symbol: 'BTCUSDT',
      qty: new Decimal('0.05'),
      stopLoss: new Decimal('45000'),
    });
  });

  it.each([
    [{ symbol: 'BTCUSDT', qty: '0.05' }, 'no leg'],
    [{ symbol: 'PEPEUSDT', qty: '1', stopLoss: '1' }, 'symbol outside the allowlist'],
    [{ symbol: 'BTCUSDT', stopLoss: '1' }, 'no qty'],
  ])('POST /spot/exits %o → 400 (%s)', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/spot/exits',
      headers: auth,
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /journal bounds note length (500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/paper/journal',
      headers: auth,
      payload: { text: 'x'.repeat(501) },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Private WebSocket ─────────────────────────────────────────────────────────

describe('WS /api/paper/ws (BP-1)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Ws = Awaited<ReturnType<FastifyInstance['injectWS']>>;

  /** Open a socket and collect its messages and close code. */
  async function open(headers: Record<string, string> = {}) {
    const messages: unknown[] = [];
    let closeCode: number | null = null;
    let onClose: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      onClose = resolve;
    });
    const ws: Ws = await app.injectWS(
      '/api/paper/ws',
      { headers },
      {
        onInit: (socket) => {
          socket.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString())));
          socket.on('close', (code: number) => {
            closeCode = code;
            onClose();
          });
        },
      }
    );
    const next = async (count: number) => {
      for (let i = 0; i < 100 && messages.length < count; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return messages;
    };
    return { ws, messages, next, closed, code: () => closeCode };
  }

  const tokenFor = (userId: string) => app.jwt.sign({ userId, email: `${userId}@x.test` });

  it('closes with 4401 on an invalid token', async () => {
    const { ws, closed, code } = await open();
    ws.send(JSON.stringify({ type: 'auth', token: 'not-a-jwt' }));
    await closed;
    expect(code()).toBe(4401);
  });

  it('closes with 1008 on an unexpected first message', async () => {
    const { ws, closed, code } = await open();
    ws.send(JSON.stringify({ type: 'subscribe' }));
    await closed;
    expect(code()).toBe(1008);
  });

  it('🔐 closes with 1009 on an oversized message (size guard before JSON.parse)', async () => {
    const { ws, closed, code } = await open();
    ws.send('x'.repeat(5 * 1024));
    await closed;
    expect(code()).toBe(1009);
  });

  it('🔐 closes with 1008 when the Origin is not the app', async () => {
    const { closed, code } = await open({ origin: 'https://evil.example' });
    await closed;
    expect(code()).toBe(1008);
  });

  it('sends the snapshot on auth, then the user’s deltas to every open tab', async () => {
    vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue(STATE);
    const a = await open();
    const b = await open();
    a.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('ws-user') }));
    b.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('ws-user') }));
    expect((await a.next(1))[0]).toEqual({ type: 'snapshot', state: STATE });
    await b.next(1);

    app.paperEvents.publish({
      userId: 'ws-user',
      delta: EMPTY_DELTA,
      sound: 'filled',
      state: {
        balance: new Decimal(1),
        realizedPnl: new Decimal(0),
        leverage: 1,
        symbolLeverage: {},
        spot: [],
        positions: [],
        pendingOrders: [],
      },
    });
    // Another user's change never reaches these sockets
    app.paperEvents.publish({
      userId: 'someone-else',
      delta: EMPTY_DELTA,
      state: {
        balance: new Decimal(1),
        realizedPnl: new Decimal(0),
        leverage: 1,
        symbolLeverage: {},
        spot: [],
        positions: [],
        pendingOrders: [],
      },
    });

    expect((await a.next(2))[1]).toEqual({ type: 'delta', delta: EMPTY_DELTA, sound: 'filled' });
    expect((await b.next(2))[1]).toEqual({ type: 'delta', delta: EMPTY_DELTA, sound: 'filled' });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.messages).toHaveLength(2);
    a.ws.terminate();
    b.ws.terminate();
  });

  it('pushes live prices of the markets the account holds (not the others)', async () => {
    vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue({
      ...STATE,
      spotBalances: [{ coin: 'ETH', free: '1', locked: '0', avgCost: '3000' }],
      pendingOrders: [
        {
          id: 'o1',
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'buy',
          type: 'limit',
          usdtAmount: '100',
          reserved: '100.11',
          triggerPrice: '40000',
          qty: '0.0025',
          leverage: 1,
          placedAt: 1,
        },
      ],
    });
    vi.spyOn(app.bybit, 'getTicker').mockImplementation((category, symbol) => ({
      category,
      symbol,
      lastPrice: symbol === 'BTCUSDT' ? 50_000 : 3_000,
      bid: null,
      ask: null,
      ...(category === 'linear' ? { markPrice: 50_010 } : {}),
    }));
    const s = await open();
    s.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('prices-user') }));
    const [, prices] = await s.next(2);
    expect(prices).toEqual({
      type: 'prices',
      items: expect.arrayContaining([
        { category: 'linear', symbol: 'BTCUSDT', last: 50_000, mark: 50_010 },
        { category: 'spot', symbol: 'ETHUSDT', last: 3_000 },
      ]),
    });
    expect((prices as { items: unknown[] }).items).toHaveLength(2);
    s.ws.terminate();
  });

  it('🔐 a re-auth with another user’s token closes the socket (4401)', async () => {
    vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue(STATE);
    const s = await open();
    s.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('switch-a') }));
    await s.next(1);
    s.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('switch-b') }));
    await s.closed;
    expect(s.code()).toBe(4401);
  });

  it('caps open sockets per user (5) with 1013', async () => {
    vi.spyOn(app.paperRepository, 'snapshot').mockResolvedValue(STATE);
    const sockets = [];
    for (let i = 0; i < 5; i++) {
      const s = await open();
      s.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('cap-user') }));
      await s.next(1);
      sockets.push(s);
    }
    const sixth = await open();
    sixth.ws.send(JSON.stringify({ type: 'auth', token: tokenFor('cap-user') }));
    await sixth.closed;
    expect(sixth.code()).toBe(1013);
    for (const s of sockets) s.ws.terminate();
  });
});

describe('marketsOf (PR #136 review)', () => {
  it('keeps a tiny coin balance in the price feed (Decimal, never Number)', () => {
    const keys = marketsOf({
      positions: [],
      pendingOrders: [],
      spot: [
        { coin: 'BTC', free: '0.00000001', locked: '0' },
        { coin: 'ETH', free: '0', locked: '0' },
      ],
    });
    expect([...keys]).toEqual(['spot:BTCUSDT']);
  });
});
