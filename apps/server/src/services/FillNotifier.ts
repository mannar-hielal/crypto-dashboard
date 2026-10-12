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
/** A user whose sends keep failing (a provider outage) is left alone for the rest of the UTC day */
export const MAX_FAILURES_PER_DAY = 5;
/** The counters map never holds more than this many users in a day */
const MAX_TRACKED_USERS = 10_000;

type Prisma = FastifyInstance['prisma'];

/** A resting order that filled in this change: its pending id in `pendingRemove`, filled, not a system order */
export function filledRestingOrders(event: PaperEvent): PaperOrderDTO[] {
  // The delta's `pendingRemove` holds the pending order's own id; the engine writes the history row
  // it becomes as `o-<pending id>` (engine/spot.ts historyRow, engine/actions.ts pendingFillRecord).
  // Matching the bare id never found a fill — so the e-mail never sent (found on production
  // 2026-10-12, when a real fill with the account away sent nothing).
  const removed = new Set(event.delta.pendingRemove.map((id) => `o-${id}`));
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
  private failed = new Map<string, number>();

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
      const reservedOn = this.reserve(event.userId);
      if (reservedOn === null) break;
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
        this.refund(event.userId, reservedOn);
        log.error({ err }, 'Could not send an order-filled e-mail');
      }
    }
    return count;
  }

  /**
   * Takes one of the user's daily slots before the send (so parallel events cannot both pass the
   * cap) and returns the UTC day it was taken on, or null when there is none to take; `refund`
   * gives it back when the send failed. 🔐 Fails closed: when the map holds `maxTrackedUsers`
   * users, a user it is not already counting gets no e-mail rather than the counters being cleared
   * (which would hand every capped user a fresh allowance mid-day); and a user whose sends have
   * failed `MAX_FAILURES_PER_DAY` times today is not tried again until tomorrow.
   */
  private reserve(userId: string): string | null {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.sent = new Map();
      this.failed = new Map();
    }
    const n = this.sent.get(userId);
    if (n === undefined && this.sent.size >= this.maxTrackedUsers) return null;
    if ((n ?? 0) >= MAX_PER_DAY) return null;
    if ((this.failed.get(userId) ?? 0) >= MAX_FAILURES_PER_DAY) return null;
    this.sent.set(userId, (n ?? 0) + 1);
    return today;
  }

  /** Gives the slot back — only if the day it was taken on is still the current one */
  private refund(userId: string, day: string): void {
    if (day !== this.day) return; // the counters were reset at midnight: nothing of it is left
    const n = this.sent.get(userId);
    if (n !== undefined && n > 0) this.sent.set(userId, n - 1);
    this.failed.set(userId, (this.failed.get(userId) ?? 0) + 1);
  }
}
