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

/** The account's finishes and passes still to save */
export function pendingDone(account: string): PendingDone[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(account)) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isPending).slice(0, MAX_PENDING) : [];
  } catch {
    return [];
  }
}

function write(account: string, items: PendingDone[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(key(account));
    else localStorage.setItem(key(account), JSON.stringify(items.slice(0, MAX_PENDING)));
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
