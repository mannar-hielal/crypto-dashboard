import { describe, expect, it, vi } from 'vitest';
import type { PaperOrderDTO } from '@crypto-dashboard/sdk';
import { MAX_PER_DAY, FillNotifier, filledRestingOrders } from '../services/FillNotifier.js';
import { readUnsubscribeToken } from '../lib/unsubscribeToken.js';
import type { PaperEvent } from '../trading/PaperEventBus.js';

function order(over: Partial<PaperOrderDTO> = {}): PaperOrderDTO {
  return {
    id: 'o1',
    category: 'spot',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'limit',
    qty: '0.01',
    limitPrice: '80000',
    fillPrice: '79990',
    status: 'filled',
    commission: '0',
    placingTime: 1,
    closingTime: 2,
    ...over,
  };
}

function event(orders: PaperOrderDTO[], pendingRemove: string[], userId = 'u1'): PaperEvent {
  return {
    userId,
    delta: { orders, pendingRemove } as never,
    state: {} as never,
  };
}

describe('filledRestingOrders', () => {
  it('should take a limit order that left the pending list filled', () => {
    expect(filledRestingOrders(event([order()], ['o1']))).toHaveLength(1);
  });

  it('should take a stop order too', () => {
    expect(filledRestingOrders(event([order({ type: 'stop' })], ['o1']))).toHaveLength(1);
  });

  it('should ignore an order that was never resting (it filled as it was placed)', () => {
    expect(filledRestingOrders(event([order()], []))).toHaveLength(0);
  });

  it('should ignore a market order, a cancelled order and a liquidation', () => {
    expect(filledRestingOrders(event([order({ type: 'market' })], ['o1']))).toHaveLength(0);
    expect(filledRestingOrders(event([order({ status: 'cancelled' })], ['o1']))).toHaveLength(0);
    expect(filledRestingOrders(event([order({ createType: 'CreateByLiq' })], ['o1']))).toHaveLength(
      0
    );
  });
});

describe('FillNotifier', () => {
  const OPTED_IN = {
    email: 'trader@example.test',
    username: 'trader',
    fillEmailOptIn: true,
    emailVerifiedAt: new Date(),
    deletionRequestedAt: null,
  };

  function setup(user: unknown = OPTED_IN, present = false) {
    const findUnique = vi.fn().mockResolvedValue(user);
    const send = vi.fn().mockResolvedValue(undefined);
    const events = {
      subscribeAll: vi.fn().mockReturnValue(() => undefined),
      hasListeners: vi.fn().mockReturnValue(present),
    };
    const clock = { now: new Date('2026-10-12T10:00:00Z') };
    const notifier = new FillNotifier(
      { user: { findUnique } } as never,
      events as never,
      { sendOrderFilledEmail: send } as never,
      () => clock.now
    );
    return { notifier, findUnique, send, events, clock };
  }

  it('should e-mail an opted-in, verified user who is away, with a working unsubscribe link', async () => {
    const { notifier, send } = setup();
    const n = await notifier.handle(event([order()], ['o1']));

    expect(n).toBe(1);
    const [to, username, summary, url] = send.mock.calls[0];
    expect(to).toBe('trader@example.test');
    expect(username).toBe('trader');
    expect(summary).toEqual({
      market: 'Spot',
      symbol: 'BTCUSDT',
      side: 'Buy',
      type: 'limit',
      qty: '0.01',
      price: '79990',
    });
    const token = decodeURIComponent(new URL(url).searchParams.get('token')!);
    expect(readUnsubscribeToken(token)).toBe('u1');
    expect(new URL(url).pathname).toBe('/notifications/unsubscribe');
  });

  it('should not e-mail someone who has the app open, and not even look them up', async () => {
    const { notifier, send, findUnique } = setup(OPTED_IN, true);
    expect(await notifier.handle(event([order()], ['o1']))).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should not look anyone up for a change that has no resting fill', async () => {
    const { notifier, findUnique } = setup();
    await notifier.handle(event([order({ type: 'market' })], []));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['not opted in', { ...OPTED_IN, fillEmailOptIn: false }],
    ['unverified', { ...OPTED_IN, emailVerifiedAt: null }],
    ['deleting the account', { ...OPTED_IN, deletionRequestedAt: new Date() }],
    ['no such user', null],
  ])('should not e-mail a user who is %s', async (_label, user) => {
    const { notifier, send } = setup(user);
    expect(await notifier.handle(event([order()], ['o1']))).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('should cap the e-mails per user per UTC day and start again the next day', async () => {
    const { notifier, send, clock } = setup();
    const many = Array.from({ length: MAX_PER_DAY + 5 }, (_, i) => order({ id: `o${i}` }));
    const removed = many.map((o) => o.id);

    expect(await notifier.handle(event(many, removed))).toBe(MAX_PER_DAY);
    expect(send).toHaveBeenCalledTimes(MAX_PER_DAY);

    clock.now = new Date('2026-10-13T00:00:01Z');
    expect(await notifier.handle(event([order()], ['o1']))).toBe(1);
  });

  it('should escape nothing it does not need to: the summary holds only the order’s own fields', async () => {
    const { notifier, send } = setup();
    await notifier.handle(
      event([order({ category: 'linear', side: 'sell', type: 'stop' })], ['o1'])
    );
    expect(send.mock.calls[0][2]).toMatchObject({
      market: 'USDT Perpetual',
      side: 'Sell',
      type: 'stop',
    });
  });

  it('should swallow a failure from the listener, never throw into the event bus', async () => {
    const { notifier, events, findUnique } = setup();
    findUnique.mockRejectedValue(new Error('db down'));
    notifier.start();
    const listener = events.subscribeAll.mock.calls[0][0] as (e: PaperEvent) => void;

    expect(() => listener(event([order()], ['o1']))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
