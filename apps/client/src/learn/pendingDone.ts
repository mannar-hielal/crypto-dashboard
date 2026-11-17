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
  /** When it was first kept (ms): one older than `MAX_AGE_MS` is given up, never retried for ever */
  since: number;
}

/** 🔐 How long one is retried at most: an API that keeps refusing it (a removed id) isn't asked again */
const MAX_AGE_MS = 30 * 86_400_000;

/** 🔐 Never more than this many kept (there are only a handful of lessons and checkpoints) */
const MAX_PENDING = 20;

/** The one storage prefix: written by key(), wiped by forgetAllDone() at sign-out */
const PREFIX = 'cd-pending-done:';
const key = (account: string) => `${PREFIX}${account}`;

/**
 * 🔐 The stored shape's version (security.md: persisted client state is versioned): `{ v, items }`.
 * Another version, or anything else, reads as nothing kept; a new shape bumps it and migrates here
 */
const VERSION = 1;

function isPending(v: unknown): v is PendingDone {
  if (typeof v !== 'object' || v === null) return false;
  const { itemId, step, since } = v as Record<string, unknown>;
  return (
    typeof since === 'number' &&
    Number.isFinite(since) &&
    // 🔐 never more than a day ahead (a clock corrected later stays fine; a far-future date, a wrong
    // clock or an edit, would never expire)
    since <= Date.now() + 86_400_000 &&
    typeof itemId === 'string' &&
    (isLessonId(itemId) || isCheckpointId(itemId)) &&
    typeof step === 'number' &&
    Number.isInteger(step) &&
    step >= 1 &&
    step <= 999
  );
}

/**
 * The stored list in today's shape, from any version this module ever wrote (only 1 so far, today's; a new
 * shape adds its step here). Anything else reads as nothing kept: it's validated item by item after
 */
function migrate(raw: unknown): unknown[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const { v, items } = raw as Record<string, unknown>;
  if (!Array.isArray(items)) return [];
  if (v === VERSION) return items;
  return [];
}

/** The account's finishes and passes still to save */
export function pendingDone(account: string): PendingDone[] {
  const oldest = Date.now() - MAX_AGE_MS;
  // The list a failed storage write left in memory, for this session
  const held = unstored.get(account);
  if (held) return held.filter((p) => p.since >= oldest);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(account)) ?? 'null');
    const stored = migrate(raw);
    const kept = stored
      .filter(isPending)
      .filter((p) => p.since >= oldest)
      .slice(0, MAX_PENDING);
    // Ones given up on (too old, unreadable, dated far ahead) leave storage too, not only the screen.
    // A value of another version is left alone: a newer tab's queue, which an older one never wipes
    // (weighed, review after #311)
    if (kept.length !== stored.length) write(account, kept);
    return kept;
  } catch {
    // Not even JSON: nothing readable kept (left alone, as another version's value would be)
    return [];
  }
}

/**
 * Lists the storage refused (full, blocked, private mode), held for this session so a finish made
 * here is never lost to it; a later write that works clears its account's. Cleared at sign-out
 */
const unstored = new Map<string, PendingDone[]>();

/** The stored shape, written in one place (may throw: storage full or blocked) */
function store(account: string, items: PendingDone[]): void {
  const stored = { v: VERSION, items: items.slice(0, MAX_PENDING) };
  localStorage.setItem(key(account), JSON.stringify(stored));
}

function write(account: string, items: PendingDone[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(key(account));
    else {
      store(account, items);
    }
    unstored.delete(account);
  } catch {
    // Refused (full, blocked, private mode): the older stored list goes (so a reload never brings
    // back finishes given up on meanwhile), then one more try, which its freed bytes often allow.
    // Still refused: held in memory for this session
    try {
      localStorage.removeItem(key(account));
      if (items.length > 0) store(account, items);
      unstored.delete(account);
    } catch {
      unstored.set(account, items.slice(0, MAX_PENDING));
    }
  }
}

/** Keep one to save later (an item already kept keeps its first `since`, with the new step) */
export function queueDone(account: string, item: Omit<PendingDone, 'since'>): void {
  const kept = pendingDone(account);
  const since = kept.find((p) => p.itemId === item.itemId)?.since ?? Date.now();
  write(account, [{ ...item, since }, ...kept.filter((p) => p.itemId !== item.itemId)]);
}

/**
 * Drop one: only while it still holds `step` when given (a newer finish of the item, kept while
 * this one was on its way, stays)
 */
export function dropDone(account: string, itemId: PendingDone['itemId'], step?: number): void {
  write(
    account,
    pendingDone(account).filter(
      (p) => p.itemId !== itemId || (step !== undefined && p.step !== step)
    )
  );
}

/**
 * Keep exactly these (a read worked out which stay): one write. A name for its caller's intent
 * beside the private write() (weighed, review after #308)
 */
export function keepOnly(account: string, items: PendingDone[]): void {
  write(account, items);
}

/**
 * 🔐 Forget every account's kept finishes on this device: at sign-out, so a shared device keeps no
 * other account's id or progress (what wasn't saved yet is redone, the worst case)
 */
export function forgetAllDone(): void {
  unstored.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // No storage: nothing kept
  }
}
