/**
 * USDT Perpetual on ADAUSDT (SC-16-1, SC-17.5-2, SC-17.1-3, SC-11-1, SC-11-3): funding settled on
 * an open position, the margin-mode switch, and two symbols at once. One market, so the tests run
 * one after another.
 *
 * The worked position: isolated 10×, long 10,000 ADA at the ask 0.5 (value 5,000).
 */

import { expect, test, type Feed } from '../../fixtures';
import { at, placeOrder, setMarginMode, signInAs } from '../../helpers';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const SYMBOL = 'ADAUSDT';
const ROW = `linear:${SYMBOL}`;

async function openWorkedLong(page: Page, feed: Feed, email: string, password: string) {
  await feed.quote('linear', SYMBOL, { bid: 0.4999, ask: 0.5, last: 0.5, mark: 0.5 });
  await signInAs(page, email, password);
  await page.goto(`/dashboard/usdt/${SYMBOL}`);
  await setMarginMode(page, 'isolated', 10);
  await placeOrder(page, { side: 'buy', type: 'market', amount: '10000', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', ROW)).toBeVisible();
}

test('[16.1.1] a long pays funding at the timestamp: 10,000 × 0.51 × 0.01% = 0.51 @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  const funding = at(page, 'positions.row', ROW).locator('[data-guide="positions.row.funding"]');
  await expect(funding).toHaveText('0.00');
  const balanceBefore = await at(page, 'account.summary.balance').textContent();

  await feed.quote('linear', SYMBOL, { bid: 0.5099, ask: 0.51, last: 0.51, mark: 0.51 });
  await feed.control('funding', { symbol: SYMBOL, rate: 0.0001, inSeconds: 3 });

  // Paid: shown with a minus (money out)
  await expect(funding).toHaveText('−0.51', { timeout: 30_000 });
  await expect(at(page, 'account.summary.balance')).not.toHaveText(balanceBefore ?? '');
  await at(page, 'account.tab', 'balancehistory').click();
  await expect(at(page, 'balance-history.row').first()).toContainText(/funding/i);
  await expect(at(page, 'balance-history.row').first()).toContainText('0.51');

  // The same timestamp again (a later ticker still naming it) changes nothing
  await at(page, 'account.tab', 'positions').click();
  await page.waitForTimeout(3_000);
  await expect(funding).toHaveText('−0.51');
});

test('[17.5.6][17.1.4] isolated → cross releases the added margin; back to isolated is refused when the long would be liquidated @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  await at(page, 'positions.row', ROW).hover();
  await at(page, 'positions.row.adjust-margin').click();
  await at(page, 'margin.mode', 'add').click();
  await at(page, 'margin.amount').fill('1000');
  await at(page, 'margin.confirm').click();
  await expect(at(page, 'positions.row.liq')).not.toHaveText('$0.4535');

  await setMarginMode(page, 'cross', 10);
  // Cross has no per-position margin (17.1.4); what was added goes back to the wallet
  await expect(at(page, 'positions.row', ROW)).toBeVisible();
  await expect(at(page, 'positions.row.adjust-margin')).toHaveCount(0);
  await at(page, 'account.tab', 'balancehistory').click();
  await expect(at(page, 'balance-history.row').first()).toContainText(
    'Release added margin on switching to cross margin: +$1000.00'
  );

  // Below the isolated liquidation price (0.4535) — safe in cross, not in isolated: refused
  await feed.quote('linear', SYMBOL, { bid: 0.4499, ask: 0.45, last: 0.45, mark: 0.45 });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row.mark')).toHaveText('$0.45');
  await at(page, 'trade.leverage-chip').click();
  await at(page, 'leverage.mode', 'isolated').click();
  await at(page, 'leverage.confirm').click();
  await expect(at(page, 'leverage.error')).toContainText(
    'The ADAUSDT position would be liquidated immediately in isolated margin'
  );
  await page.keyboard.press('Escape');
  await expect(at(page, 'positions.row', ROW)).toBeVisible();
});

test('[11.1][11.2][11.8] two symbols, two positions; closing ADA from the BTC page closes only ADA @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);

  // Linear BTCUSDT is only read here (the smoke scenarios own its price)
  await page.goto('/dashboard/usdt/BTCUSDT');
  await placeOrder(page, { side: 'buy', type: 'market', amount: '0.01', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', ROW)).toBeVisible();
  await expect(at(page, 'positions.row', 'linear:BTCUSDT')).toBeVisible();

  await at(page, 'positions.row', ROW).hover();
  await at(page, 'positions.row', ROW).locator('[data-guide="positions.row.close"]').click();
  await expect(at(page, 'positions.row', ROW)).toHaveCount(0);
  await expect(at(page, 'positions.row', 'linear:BTCUSDT')).toBeVisible();
  // Still on BTC: the page didn't switch symbol to close ADA
  await expect(page).toHaveURL(/\/dashboard\/usdt\/BTCUSDT/);

  await at(page, 'account.tab', 'closedpnl').click();
  await expect(at(page, 'closed-pnl.row')).toHaveCount(1);
  await expect(at(page, 'closed-pnl.row').first()).toContainText('ADAUSDT');
});

test('[17.4.1] a reduce-only half close books its own Closed P&L row: 50 − 1.375 − 1.4025 = +47.2225 @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  await feed.quote('linear', SYMBOL, { bid: 0.51, ask: 0.5101, last: 0.51, mark: 0.51 });
  await expect(at(page, 'trade.side.sell')).toContainText('0.51');

  // Sell 5,000 of the 10,000, reduce-only, at the bid 0.51
  await at(page, 'trade.side.sell').click();
  await at(page, 'trade.type.market').click();
  await at(page, 'trade.amount-unit', 'coin').click();
  await at(page, 'trade.amount').fill('5000');
  await at(page, 'trade.reduce-only').check();
  await at(page, 'trade.submit').click();
  await expect(at(page, 'trade.amount')).toHaveValue('');

  await expect(at(page, 'positions.row', ROW)).toContainText('5000');
  await at(page, 'account.tab', 'closedpnl').click();
  await expect(at(page, 'closed-pnl.row')).toHaveCount(1);
  await expect(at(page, 'closed-pnl.value').first()).toHaveText('+47.2225 USDT');
});
