/**
 * The last lesson finish's event on its way to the server. The habits (the streak screen, the
 * learning map) are read after it lands, so the server, the one counter of learning days, already
 * counts today's finish (review 2026-11-17: no guessing on the client).
 */

/** How long a habits read waits for the finish's event at most: a hung request never blocks it */
export const FINISH_WAIT_MS = 4000;

/** The finish's event still on its way, or null once it has landed (or failed) */
let pending: Promise<void> | null = null;

/** Called when a finish's event is sent */
export function noteFinishSent(request: Promise<unknown>): void {
  const mine: Promise<void> = request.then(
    () => undefined,
    () => undefined
  );
  pending = mine;
  void mine.then(() => {
    if (pending === mine) pending = null;
  });
}

/**
 * Resolves once the last finish's event has landed (or failed), or after `FINISH_WAIT_MS`. At once
 * when none is on its way; the wait's timer is cleared when the event wins
 */
export function finishSaved(): Promise<void> {
  const waiting = pending;
  if (!waiting) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, FINISH_WAIT_MS);
    void waiting.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
