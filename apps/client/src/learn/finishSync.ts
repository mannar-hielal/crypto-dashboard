/**
 * The last lesson finish's event on its way to the server. The habits (the streak screen, the
 * learning map) are read after it lands, so the server, the one counter of learning days, already
 * counts today's finish (review 2026-11-17: no guessing on the client).
 */

/** How long a habits read waits for the finish's event at most: a hung request never blocks it */
export const FINISH_WAIT_MS = 4000;

let pending: Promise<unknown> = Promise.resolve();

/** Called when a finish's event is sent */
export function noteFinishSent(request: Promise<unknown>): void {
  pending = request.catch(() => undefined);
}

/** Resolves once the last finish's event has landed (or failed), or after `FINISH_WAIT_MS` */
export function finishSaved(): Promise<void> {
  return Promise.race([
    pending.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, FINISH_WAIT_MS)),
  ]);
}
