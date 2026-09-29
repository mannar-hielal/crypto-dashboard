/**
 * Order History records every outcome (SC-7-1, rows 7.1.1, 7.2.1, 7.2.2, 7.3.1), on Spot LINKUSDT: a
 * market buy, a limit that fills, and a limit that is cancelled — three rows, newest first.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[7.1.1][7.2.1][7.3.1] market, filled limit and cancelled limit: three rows, newest first @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'LINKUSDT', { bid: 19.999, ask: 20, last: 20 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/LINK/USDT');

  await placeOrder(page, { side: 'buy', type: 'market', amount: '10', unit: 'coin' });
  await placeOrder(page, { side: 'buy', type: 'limit', price: '19.5', amount: '10', unit: 'coin' });
  await feed.control('path', {
    category: 'spot',
    symbol: 'LINKUSDT',
    points: [19.7, 19.4],
    stepMs: 1_000,
  });
  // Filled orders stay listed beside the working ones for 2 minutes: count the working ones
  await at(page, 'account.tab', 'orders').click();
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveCount(0, { timeout: 15_000 });

  await placeOrder(page, { side: 'buy', type: 'limit', price: '15', amount: '10', unit: 'coin' });
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveText('1');
  await at(page, 'orders.row.cancel').click();
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveCount(0);

  await at(page, 'account.tab', 'orderhistory').click();
  const status = page.locator('[data-guide="order-history.row.status"]');
  const type = page.locator('[data-guide="order-history.row.type"]');
  await expect(status).toHaveCount(3);
  await expect(status.nth(0)).toContainText(/cancel/i);
  await expect(status.nth(1)).toContainText(/fill/i);
  await expect(status.nth(2)).toContainText(/fill/i);
  await expect(type.nth(0)).toContainText(/limit/i);
  await expect(type.nth(1)).toContainText(/limit/i);
  await expect(type.nth(2)).toContainText(/market/i);
});
