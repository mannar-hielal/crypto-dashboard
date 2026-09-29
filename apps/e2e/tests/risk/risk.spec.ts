/**
 * USDT Perpetual risk on LINKUSDT (SC-15.1-1, SC-15.4-1, SC-15.5-2, SC-17.1-1): P&L on the mark,
 * liquidation, re-margining through the leverage modal, and adding margin. One market, so the tests
 * run one after another.
 *
 * The worked position: isolated 10×, long 250 LINK at the ask 20 (value 5,000, margin 500).
 */

import { expect, test, type Feed } from '../../fixtures';
import { at, num, placeOrder, setMarginMode, signInAs } from '../../helpers';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const SYMBOL = 'LINKUSDT';
const ROW = `linear:${SYMBOL}`;

async function openWorkedLong(page: Page, feed: Feed, email: string, password: string) {
  await feed.quote('linear', SYMBOL, { bid: 19.999, ask: 20, last: 20, mark: 20 });
  await signInAs(page, email, password);
  await page.goto(`/dashboard/usdt/${SYMBOL}`);
  await setMarginMode(page, 'isolated', 10);
  await placeOrder(page, { side: 'buy', type: 'market', amount: '250', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', ROW)).toBeVisible();
}

test('[15.1.1][15.1.2] P&L follows the mark price, the take-profit the last price @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('linear', SYMBOL, { bid: 19.999, ask: 20, last: 20, mark: 20 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(`/dashboard/usdt/${SYMBOL}`);
  await setMarginMode(page, 'isolated', 10);
  await placeOrder(page, {
    side: 'buy',
    type: 'market',
    amount: '250',
    unit: 'coin',
    tp: '20.1',
  });
  await at(page, 'account.tab', 'positions').click();
  const row = at(page, 'positions.row', ROW);
  await expect(row).toBeVisible();

  // The last price moves, the mark doesn't: the P&L stays at 0 and the TP (at 20.1) doesn't fire
  await feed.quote('linear', SYMBOL, { bid: 20.079, ask: 20.08, last: 20.08, mark: 20 });
  await expect(row.locator('[data-guide="positions.row.mark"]')).toHaveText('$20');
  await expect(row.locator('[data-guide="positions.row.pnl"]')).toHaveText(/^\+?0\.00$/); // shown as "+0.00"

  // The mark moves: P&L = 250 × (20.05 − 20) = +12.50
  await feed.quote('linear', SYMBOL, { bid: 20.079, ask: 20.08, last: 20.08, mark: 20.05 });
  await expect(row.locator('[data-guide="positions.row.pnl"]')).toHaveText('+12.50');

  // The last price crosses the TP with the mark still below it: the TP fires on the last price
  await feed.quote('linear', SYMBOL, { bid: 20.119, ask: 20.12, last: 20.12, mark: 20.05 });
  await expect(row).toHaveCount(0, { timeout: 20_000 });
});

test('[15.4.1][15.4.2] the mark reaching the liquidation price liquidates the long @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  // The engine's isolated formula (T1: margin.test), rounded up to LINK's 0.001 tick
  await expect(at(page, 'positions.row.liq')).toHaveText('$18.122');
  const liq = 18.122;
  const balance = await at(page, 'account.summary.balance').textContent();

  // One tick above: still open
  await feed.quote('linear', SYMBOL, { last: liq + 0.01, mark: liq + 0.001 });
  await page.waitForTimeout(2_000);
  await expect(at(page, 'positions.row', ROW)).toBeVisible();

  await feed.quote('linear', SYMBOL, { last: liq - 0.01, mark: liq - 0.001 });
  await expect(at(page, 'positions.row', ROW)).toHaveCount(0, { timeout: 20_000 });

  // The margin was already out of the wallet: the balance doesn't move
  await expect(at(page, 'account.summary.balance')).toHaveText(balance ?? '');
  await expect(at(page, 'notice.liquidation')).toContainText('LINKUSDT Long was liquidated');

  await at(page, 'account.tab', 'closedpnl').click();
  await expect(at(page, 'closed-pnl.exit-type').first()).toHaveText('Liquidation');
  expect(num(await at(page, 'closed-pnl.value').first().textContent())).toBeLessThan(-500);

  await at(page, 'account.tab', 'orderhistory').click();
  await expect(at(page, 'order-history.row.type').first()).toContainText('Liquidation');

  await at(page, 'notice.dismiss', 'liquidation').click();
  await expect(at(page, 'notice.liquidation')).toHaveCount(0);
  await page.reload();
  await expect(at(page, 'positions.row', ROW)).toHaveCount(0);
  await expect(at(page, 'notice.liquidation')).toHaveCount(0);
});

test('[15.5.5] 10× → 5× in the leverage modal: margin 500 → 1,000, the liquidation price drops @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  const liqBefore = num(await at(page, 'positions.row.liq').textContent());

  await at(page, 'trade.leverage-chip').click();
  await at(page, 'leverage.input', '5').click();
  const preview = at(page, 'leverage.preview');
  // Margin + the close-fee reserve at the bankruptcy price: 500 + 250 × 18 × 0.055% → 1,000 + 250 × 16 × 0.055%
  await expect(preview).toContainText(/Position margin: \$502\.48 → \$1,?002\.20/);
  const liqAfterText = (await preview.locator('dd').nth(1).textContent()) ?? '';
  const liqAfter = num(liqAfterText.split('→')[1] ?? '');
  expect(liqAfter).toBeLessThan(liqBefore);
  await at(page, 'leverage.confirm').click();

  await expect(at(page, 'trade.leverage-chip')).toHaveText('Isolated 5x');
  await expect(at(page, 'positions.row.liq')).toContainText(liqAfterText.split('→')[1]!.trim());
});

test('[17.1.1] adding 1,000 of margin lowers the liquidation price; the leverage stays @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await openWorkedLong(page, feed, seededUser.email, seededUser.password);
  const liqBefore = num(await at(page, 'positions.row.liq').textContent());

  await at(page, 'positions.row', ROW).hover();
  await at(page, 'positions.row.adjust-margin').click();
  await at(page, 'margin.mode', 'add').click();
  await at(page, 'margin.amount').fill('1000');
  const liqPreview = ((await at(page, 'margin.preview').textContent()) ?? '').split('→')[1]!.trim();
  await at(page, 'margin.confirm').click();

  await expect(at(page, 'positions.row.liq')).toHaveText(liqPreview);
  expect(num(liqPreview)).toBeLessThan(liqBefore - 3);
  await expect(at(page, 'trade.leverage-chip')).toHaveText('Isolated 10x');
});
