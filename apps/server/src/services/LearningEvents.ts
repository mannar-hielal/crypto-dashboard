/**
 * Guided-tour events (privacy policy §3, "Learning events"): which tour and step, and when. They
 * answer one question — where do people stop? — so the funnel below counts people, never events.
 *
 * 🔐 Bounded three ways: the route allowlists the name, tour and step shape; a user holds at most
 * `MAX_LEARN_EVENTS_PER_USER` rows (the oldest are pruned past it); the daily job purges rows past
 * the retention period.
 */

import type { FastifyInstance } from 'fastify';
import type { TourFunnelStep, TourFunnelTour } from '@crypto-dashboard/sdk';
import { LEARN_EVENT_RETENTION_DAYS, MAX_LEARN_EVENTS_PER_USER } from '../constants.js';

type Prisma = FastifyInstance['prisma'];

const DAY_MS = 86_400_000;

// ─── Writing ────────────────────────────────────────────────────────────────

export interface EventInput {
  userId: string;
  name: string;
  itemId: string;
  stepId?: string;
}

/**
 * Stores one event; false only when the account is gone.
 *
 * 🔐 Bounded and strict under concurrency: the whole thing runs in a transaction that first takes
 * the user's row lock (an `updateMany` on the user row, typed Prisma — no raw SQL), so parallel
 * requests for one user queue and each sees what the one before it wrote.
 *
 * Two rules keep the funnel's rows alive instead of dropping them at the cap:
 * - a `tour_step` already recorded for this tour and step is not stored again (the funnel counts
 *   people per step, so a repeat adds nothing — going back and forth would only fill the cap);
 * - at the cap the user's *oldest* rows are pruned to make room, never the new event, so
 *   `tour_completed` / `tour_closed` / `tour_started` always land (the journal's own pattern).
 */
export async function recordLearningEvent(prisma: Prisma, e: EventInput): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count: locked } = await tx.user.updateMany({
      where: { id: e.userId },
      data: { updatedAt: new Date() },
    });
    if (locked === 0) return false; // the account is gone

    if (e.name === 'tour_step' && e.stepId) {
      const seen = await tx.learningEvent.findFirst({
        where: { userId: e.userId, name: 'tour_step', itemId: e.itemId, stepId: e.stepId },
        select: { id: true },
      });
      if (seen) return true;
    }

    const held = await tx.learningEvent.count({ where: { userId: e.userId } });
    if (held >= MAX_LEARN_EVENTS_PER_USER) {
      const oldest = await tx.learningEvent.findMany({
        where: { userId: e.userId },
        orderBy: { at: 'asc' },
        take: held - MAX_LEARN_EVENTS_PER_USER + 1,
        select: { id: true },
      });
      await tx.learningEvent.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
    }

    await tx.learningEvent.create({
      data: { userId: e.userId, name: e.name, itemId: e.itemId, stepId: e.stepId ?? null },
    });
    return true;
  });
}

export async function purgeOldLearningEvents(
  prisma: Prisma,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - LEARN_EVENT_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.learningEvent.deleteMany({ where: { at: { lt: cutoff } } });
  return count;
}

// ─── The funnel (pure) ──────────────────────────────────────────────────────

export interface EventRow {
  userId: string;
  name: string;
  itemId: string;
  stepId: string | null;
  at: Date;
}

/** "buy-first-coin.3" → 3, so steps list in tour order */
const stepNumber = (stepId: string) => Number(stepId.slice(stepId.lastIndexOf('.') + 1)) || 0;

/** One entry per tour in `tourIds` (so a tour nobody opened still shows, at zero) */
export function buildTourFunnel(rows: EventRow[], tourIds: readonly string[]): TourFunnelTour[] {
  return tourIds.map((itemId) => {
    const mine = rows.filter((r) => r.itemId === itemId);
    const usersOf = (name: string) =>
      new Set(mine.filter((r) => r.name === name).map((r) => r.userId));

    const viewersByStep = new Map<string, Set<string>>();
    for (const r of mine) {
      if (r.name !== 'tour_step' || !r.stepId) continue;
      let set = viewersByStep.get(r.stepId);
      if (!set) viewersByStep.set(r.stepId, (set = new Set()));
      set.add(r.userId);
    }

    // Where each person's most recent event was a close: the step they left on
    const lastByUser = new Map<string, EventRow>();
    for (const r of mine) {
      const prev = lastByUser.get(r.userId);
      if (!prev || r.at >= prev.at) lastByUser.set(r.userId, r);
    }
    const closedByStep = new Map<string, number>();
    for (const r of lastByUser.values()) {
      if (r.name === 'tour_closed' && r.stepId) {
        closedByStep.set(r.stepId, (closedByStep.get(r.stepId) ?? 0) + 1);
      }
    }

    const stepIds = new Set([...viewersByStep.keys(), ...closedByStep.keys()]);
    const steps: TourFunnelStep[] = [...stepIds]
      .sort((a, b) => stepNumber(a) - stepNumber(b))
      .map((stepId) => ({
        stepId,
        viewers: viewersByStep.get(stepId)?.size ?? 0,
        closedHere: closedByStep.get(stepId) ?? 0,
      }));

    return {
      itemId,
      started: usersOf('tour_started').size,
      completed: usersOf('tour_completed').size,
      steps,
    };
  });
}
