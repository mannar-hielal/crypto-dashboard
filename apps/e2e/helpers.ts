/** Small helpers shared by the specs: anchor locators and signing in through the form. */

import { expect, type Page } from '@playwright/test';
import { guideSelector, type GuideAnchor } from '@/lib/guideAnchors';

export const at = (page: Page, anchor: GuideAnchor, key?: string) =>
  page.locator(guideSelector(anchor, key));

/** Sign in through the login form; waits until the app has navigated away from /login. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await at(page, 'auth.login.email').fill(email);
  await at(page, 'auth.login.password').fill(password);
  await at(page, 'auth.login.submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
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
