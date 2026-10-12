/**
 * The opt-in "your order filled while you were away" e-mail. It listens to the same committed
 * deltas the private sockets get, so what it mails is exactly what the account recorded.
 *
 * Only a resting (limit / stop) order that filled counts — never a market order the user watched
 * go through, never an exit leg, never a liquidation. And only for a user who opted in, whose
 * e-mail is verified, who is not deleting the account, and who has no socket open (they would
 * have seen it). 🔐 Bounded: at most `MAX_PER_DAY` e-mails per user per UTC day.
 *
 * Single-machine assumption (the same one `PaperEventBus` documents): production runs one Fly
 * Machine (`fly.toml`: `min_machines_running = 1`, one shared-cpu VM), and resting orders are
 * filled only by the machine that holds the engine lease. So the sockets `hasListeners` sees are
 * all the sockets there are, and the daily counter lives with the one process that sends. Running
 * several machines needs both moved off this process: presence via Redis pub/sub like the bus, the
 * counter into the database.
 */

import type { FastifyInstance } from 'fastify';
import type { PaperOrderDTO } from '@crypto-dashboard/sdk';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { makeUnsubscribeToken } from '../lib/unsubscribeToken.js';
import type { PaperEvent, PaperEventBus } from '../trading/PaperEventBus.js';
import { EmailService } from './EmailService.js';

const log = logger.child({ service: 'FillNotifier' });

export const MAX_PER_DAY = 20;
/** The counters map never holds more than this many users in a day */
const MAX_TRACKED_USERS = 10_000;

type Prisma = FastifyInstance['prisma'];

/** A resting order that filled in this change: in `pendingRemove`, filled, not a system order */
export function filledRestingOrders(event: PaperEvent): PaperOrderDTO[] {
  const removed = new Set(event.delta.pendingRemove);
  if (removed.size === 0) return [];
  return event.delta.orders.filter(
    (o) =>
      removed.has(o.id) &&
      o.status === 'filled' &&
      !o.createType &&
      (o.type === 'limit' || o.type === 'stop')
  );
}

export interface Mailer {
  sendOrderFilledEmail: typeof EmailService.sendOrderFilledEmail;
}

export class FillNotifier {
  private day = '';
  private sent = new Map<string, number>();

  constructor(
    private readonly prisma: Prisma,
    private readonly events: Pick<PaperEventBus, 'subscribeAll' | 'hasListeners'>,
    private readonly mailer: Mailer = EmailService,
    private readonly now: () => Date = () => new Date(),
    private readonly maxTrackedUsers: number = MAX_TRACKED_USERS
  ) {}

  /** Start listening; returns the unsubscribe function */
  start(): () => void {
    return this.events.subscribeAll((event) => {
      // Fire-and-forget: the bus must never wait on the database or the mail provider
      void this.handle(event).catch((err: unknown) => {
        log.error({ err }, 'Could not send an order-filled e-mail');
      });
    });
  }

  async handle(event: PaperEvent): Promise<number> {
    const filled = filledRestingOrders(event);
    if (filled.length === 0) return 0;
    if (this.events.hasListeners(event.userId)) return 0; // they are looking at the app

    const user = await this.prisma.user.findUnique({
      where: { id: event.userId },
      select: {
        email: true,
        username: true,
        fillEmailOptIn: true,
        emailVerifiedAt: true,
        deletionRequestedAt: true,
      },
    });
    if (!user?.fillEmailOptIn || !user.emailVerifiedAt || user.deletionRequestedAt) return 0;

    let count = 0;
    for (const order of filled) {
      if (!this.reserve(event.userId)) break;
      try {
        await this.mailer.sendOrderFilledEmail(
          user.email,
          user.username,
          {
            market: order.category === 'spot' ? 'Spot' : 'USDT Perpetual',
            symbol: order.symbol,
            side: order.side === 'buy' ? 'Buy' : 'Sell',
            type: order.type === 'limit' ? 'limit' : 'stop',
            qty: order.qty,
            price: order.fillPrice ?? order.limitPrice ?? order.stopPrice ?? '—',
          },
          `${config.clientUrl}/notifications/unsubscribe?token=${encodeURIComponent(
            makeUnsubscribeToken(event.userId)
          )}`
        );
        count += 1;
      } catch (err) {
        // One failed send (a mail-provider outage) neither costs the user a daily slot nor drops
        // the other fills of this change
        this.refund(event.userId);
        log.error({ err }, 'Could not send an order-filled e-mail');
      }
    }
    return count;
  }

  /**
   * Takes one of the user's daily slots before the send (so parallel events cannot both pass the
   * cap); `refund` gives it back when the send failed. 🔐 Fails closed: when the map holds
   * `maxTrackedUsers` users, a user it is not already counting gets no e-mail rather than the
   * counters being cleared (which would hand every capped user a fresh allowance mid-day).
   */
  private reserve(userId: string): boolean {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.sent = new Map();
    }
    const n = this.sent.get(userId);
    if (n === undefined && this.sent.size >= this.maxTrackedUsers) return false;
    if ((n ?? 0) >= MAX_PER_DAY) return false;
    this.sent.set(userId, (n ?? 0) + 1);
    return true;
  }

  private refund(userId: string): void {
    const n = this.sent.get(userId);
    if (n !== undefined && n > 0) this.sent.set(userId, n - 1);
  }
}
