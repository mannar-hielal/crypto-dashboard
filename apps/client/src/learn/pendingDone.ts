/**
 * Lesson finishes and checkpoint passes that couldn't be saved (an API that refuses their version
 * step, as the one before 2026-11-16 does if rolled back on its own; a network failure), kept on
 * this device per account and sent again each time the progress loads, until one lands. Meanwhile
 * they still show as done. 🔐 Read from storage as untrusted input: only known ids and whole steps,
 * capped, and any failure to read or write just means nothing is kept.
 */

import { isLessonId, type LessonId } from '@/guide/lessons';
import { isCheckpointId, type CheckpointId } from './checkpoints';

export interface PendingDone {
  itemId: LessonId | CheckpointId;
  /** A lesson's last screen's step, or a checkpoint's question set version */
  step: number;
}

/** 🔐 Never more than this many kept (there are only a handful of lessons and checkpoints) */
const MAX_PENDING = 20;

const key = (account: string) => `cd-pending-done:${account}`;

/**
 * 🔐 The stored shape's version (security.md: persisted client state is versioned): `{ v, items }`.
 * Another version, or anything else, reads as nothing kept; a new shape bumps it and migrates here
 */
const VERSION = 1;

function isPending(v: unknown): v is PendingDone {
  if (typeof v !== 'object' || v === null) return false;
  const { itemId, step } = v as Record<string, unknown>;
  return (
    typeof itemId === 'string' &&
    (isLessonId(itemId) || isCheckpointId(itemId)) &&
    typeof step === 'number' &&
    Number.isInteger(step) &&
    step >= 1 &&
    step <= 999
  );
}

/**
 * The stored list in today's shape, from any version this module ever wrote (only 1 so far; a new
 * shape adds its step here). Anything else reads as nothing kept: it's validated item by item after
 */
function migrate(raw: unknown): unknown[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const { v, items } = raw as Record<string, unknown>;
  if (v === VERSION && Array.isArray(items)) return items;
  return [];
}

/** The account's finishes and passes still to save */
export function pendingDone(account: string): PendingDone[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(account)) ?? 'null');
    return migrate(raw).filter(isPending).slice(0, MAX_PENDING);
  } catch {
    return [];
  }
}

function write(account: string, items: PendingDone[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(key(account));
    else {
      const stored = { v: VERSION, items: items.slice(0, MAX_PENDING) };
      localStorage.setItem(key(account), JSON.stringify(stored));
    }
  } catch {
    // No storage (private mode, full): nothing is kept
  }
}

/** Keep one to save later (an item already kept is replaced) */
export function queueDone(account: string, item: PendingDone): void {
  write(account, [item, ...pendingDone(account).filter((p) => p.itemId !== item.itemId)]);
}

/** Saved, or refused for good (an earlier version): kept no longer */
export function dropDone(account: string, itemId: PendingDone['itemId']): void {
  write(
    account,
    pendingDone(account).filter((p) => p.itemId !== itemId)
  );
}
