/** Small helpers shared by the specs: anchor locators and signing in through the form. */

import { expect, type Page } from '@playwright/test';
import { guideSelector, type GuideAnchor } from '@/lib/guideAnchors';

export const at = (page: Page, anchor: GuideAnchor, key?: string) =>
  page.locator(guideSelector(anchor, key));

/**
 * How long a check right after a cold page load waits (a reload, a first visit): the session restore,
 * then the dashboard's modules from the Vite dev server. CI's runner took ~12 s for that on
 * 2026-11-08 (every smoke test 2–3× slower than on 2026-10-28; ~1 s locally), past the 10 s expect.
 */
export const COLD_LOAD_MS = 30_000;

/** Sign in through the login form; waits until the app has navigated away from /login. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await at(page, 'auth.login.email').fill(email);
  await at(page, 'auth.login.password').fill(password);
  await at(page, 'auth.login.submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Reset the account from the open Settings dialog: "Reset account", then "Confirm reset?". The
 * confirm step reverts after 3 s, and on CI's WebKit (5–10× slower) its entry animation plus the
 * click's wait for a stable element can use that up, so the confirm click found "Reset account"
 * again and no reset ran (release #289's [13.3.1]). Retried until the dialog closes, which it does
 * only once the server has reset the account. A reset is idempotent, so a retry can't harm.
 */
export async function resetAccount(page: Page): Promise<void> {
  const button = at(page, 'acct-settings.reset');
  // The dialog is open before the loop starts: a missing button inside it means "closed", never
  // "not mounted yet" (review on #294)
  await expect(button).toBeVisible();
  let confirmed = false;
  await expect(async () => {
    // The dialog closed after a confirm click: the reset went through
    if (confirmed && (await button.count()) === 0) return;
    // "Resetting…" is in flight: wait for the dialog to close rather than clicking again
    if ((await button.textContent({ timeout: 2_000 }))?.includes('Reset account')) {
      await button.click({ timeout: 2_000 });
    }
    // The button swaps with an exit animation (AnimatePresence mode="wait"): click the confirm
    // step only once it is there, or the click lands on the departing "Reset account"
    await expect(button).toHaveText('Confirm reset?', { timeout: 2_000 });
    // Marked before the click: a click that times out after it took effect (the dialog already
    // closing) must still count, and a repeated reset is harmless (review on #294)
    confirmed = true;
    await button.click({ timeout: 2_000 });
    await expect(button).toHaveCount(0, { timeout: 10_000 });
  }).toPass({ timeout: 45_000 });
}

/**
 * Market ownership: the fake feed's prices are global per market and specs run in parallel, so each
 * spec that moves prices owns its market(s). Spot BTCUSDT and linear BTCUSDT stay at 50,000 for the
 * smoke scenarios (quotes.spec sets the same values).
 *
 *   spot SOLUSDT   spotRoundTrip         linear SOLUSDT   perpShort
 *   spot XRPUSDT   spotTpSl              linear XRPUSDT   perpTpSl (long TP)
 *   linear ETHUSDT accountReset          linear DOGEUSDT  perpTpSl (short SL)
 *   linear BNBUSDT limitBracket          linear AVAXUSDT  editOrders
 *   linear LINKUSDT risk (serial file)   linear ADAUSDT   advanced (serial file)
 *
 * A file that owns a market and has several tests runs them serially
 * (`test.describe.configure({ mode: 'serial' })`), so they never move it under each other.
 */

export interface OrderInput {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  amount: string;
  unit: 'coin' | 'usdt';
  price?: string;
  tp?: string;
  sl?: string;
}

/** Fill in and submit the order form through its anchors; waits for the amount to clear. */
export async function placeOrder(page: Page, o: OrderInput): Promise<void> {
  await at(page, o.side === 'buy' ? 'trade.side.buy' : 'trade.side.sell').click();
  await at(page, `trade.type.${o.type}`).click();
  if (o.price !== undefined) await at(page, 'trade.price').fill(o.price);
  await at(page, 'trade.amount-unit', o.unit).click();
  await at(page, 'trade.amount').fill(o.amount);
  if (o.tp !== undefined || o.sl !== undefined) {
    // The exits panel may be collapsed
    if ((await at(page, 'trade.tp.enable').count()) === 0) await page.getByText('Exits').click();
  }
  if (o.tp !== undefined) {
    await at(page, 'trade.tp.enable').click();
    await at(page, 'trade.tp.price').fill(o.tp);
  }
  if (o.sl !== undefined) {
    await at(page, 'trade.sl.enable').click();
    await at(page, 'trade.sl.price').fill(o.sl);
  }
  await at(page, 'trade.submit').click();
  await expect(at(page, 'trade.amount')).toHaveValue('');
}

/** Set the margin mode and leverage through the chip's modal (the steps of the `setIsolated` guide step). */
export async function setMarginMode(
  page: Page,
  mode: 'isolated' | 'cross',
  leverage: 1 | 2 | 3 | 5 | 10
): Promise<void> {
  await at(page, 'trade.leverage-chip').click();
  await at(page, 'leverage.mode', mode).click();
  await at(page, 'leverage.input', String(leverage)).click();
  await at(page, 'leverage.confirm').click();
  await expect(at(page, 'trade.leverage-chip')).toHaveText(
    `${mode === 'isolated' ? 'Isolated' : 'Cross'} ${leverage}x`
  );
}

/** A number shown on screen ("$18,134.5", "−0.51", "1,000.00 USD") as a JS number. */
export function num(text: string | null): number {
  return Number((text ?? '').replace(/[−–]/g, '-').replace(/[^0-9.-]/g, ''));
}
