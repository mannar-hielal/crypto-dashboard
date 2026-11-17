/**
 * The last lesson finish's event on its way to the server. The habits (the streak screen, the
 * learning map) are read after it lands, so the server, the one counter of learning days, already
 * counts today's finish (review 2026-11-17: no guessing on the client).
 */

/** How long a habits read waits for the finish's event at most: a hung request never blocks it */
export const FINISH_WAIT_MS = 4000;

/**
 * The finish's event still on its way, and whose (`landed`: true once saved, false if it failed), or
 * null once it has settled
 */
let pending: { account: string | null; landed: Promise<boolean> } | null = null;

/** Called when a finish's event is sent, for the account it is */
export function noteFinishSent(account: string | null, request: Promise<unknown>): void {
  const mine = {
    account,
    landed: request.then(
      () => true,
      () => false
    ),
  };
  pending = mine;
  void mine.landed.then(() => {
    if (pending === mine) pending = null;
  });
}

/**
 * Whether the account's last finish is counted: resolves once its event has landed (true) or failed
 * (false), or false after `FINISH_WAIT_MS`; true at once when none is on its way. The wait's timer is cleared when the event settles. The streak screen says "today
 * still counts" rather than showing a count that misses the finish
 */
export function finishSaved(account: string | null): Promise<boolean> {
  const waiting = pending;
  // Nothing on its way (the streak screen always finds its finish still on its way: it opens with
  // it), or another account's: nothing to miss
  if (!waiting || waiting.account !== account) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), FINISH_WAIT_MS);
    void waiting.landed.then((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}
