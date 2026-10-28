/**
 * The Route button's amber dot: a step has opened since the learner last looked at the map. Which
 * steps were open when they last looked is a per-browser convenience in localStorage — no progress
 * lives here, and a blocked or empty storage only means the dot shows.
 */

import { useCallback, useState } from 'react';

const KEY = 'cpt-path-seen';
const MAX_KEYS = 100;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // 🔐 Storage is input anyone can edit: keep only a bounded list of strings
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string').slice(0, MAX_KEYS)
      : [];
  } catch {
    return [];
  }
}

function write(keys: readonly string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys.slice(0, MAX_KEYS)));
  } catch {
    // Private window or blocked storage: the dot simply shows again next time
  }
}

/** Whether any of `open` is new since the map was last looked at, and a way to mark them seen */
export function usePathSeen(open: readonly string[]): { fresh: boolean; markSeen: () => void } {
  const [seen, setSeen] = useState<string[]>(read);
  const fresh = open.some((k) => !seen.includes(k));
  const markSeen = useCallback(() => {
    const next = Array.from(new Set([...open, ...seen]));
    write(next);
    setSeen(next);
  }, [open, seen]);
  return { fresh, markSeen };
}
