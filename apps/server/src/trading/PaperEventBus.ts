/**
 * In-process fan-out of committed paper-account changes (APP_LOG Bybit Parity BP-1).
 *
 * Every committed engine delta is published here. Each user's open private WebSockets subscribe
 * to that user, and the matching engine subscribes to everything to keep its trigger index fresh.
 *
 * Single-machine assumption, like the auth refresh grace map: a delta committed on one Fly
 * machine only reaches sockets on that machine. Scaling out needs Redis pub/sub here.
 */

import type { PaperDeltaDTO, PaperSound } from '@crypto-dashboard/sdk';
import { logger } from '../logger.js';
import type { AccountState } from './engine/index.js';

const log = logger.child({ service: 'PaperEventBus' });

export interface PaperEvent {
  userId: string;
  /** Wire form, pushed to the user's tabs */
  delta: PaperDeltaDTO;
  sound?: PaperSound;
  /** The account state after the change — for the engine's trigger index */
  state: AccountState;
}

type Listener = (event: PaperEvent) => void;

export class PaperEventBus {
  private readonly byUser = new Map<string, Set<Listener>>();
  private readonly global = new Set<Listener>();

  publish(event: PaperEvent): void {
    const listeners = [...this.global, ...(this.byUser.get(event.userId) ?? [])];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        log.error({ err }, 'Paper event listener error');
      }
    }
  }

  /** Subscribe to one user's changes. Returns an unsubscribe function. */
  subscribe(userId: string, listener: Listener): () => void {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(listener);
    return () => {
      const current = this.byUser.get(userId);
      if (!current) return;
      current.delete(listener);
      // Bounded: drop the user's entry once their last socket is gone
      if (current.size === 0) this.byUser.delete(userId);
    };
  }

  /** Subscribe to every user's changes (the matching engine). */
  subscribeAll(listener: Listener): () => void {
    this.global.add(listener);
    return () => this.global.delete(listener);
  }
}
