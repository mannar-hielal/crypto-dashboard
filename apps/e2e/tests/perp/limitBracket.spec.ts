/**
 * A limit order with TP and SL on BNBUSDT (rows 2.x; SC-2-x): the exits wait until the limit fills,
 * then the TP closes the position and the SL is cancelled.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[2.4.1][2.4.5][2.4.9] limit 580 with TP 620 / SL 560: fills, then the TP closes it and the SL is cancelled @full', async ({
  page,
  seededUser,
  feed,
}) => {
  const path = (points: number[]) =>
    feed.control('path', { category: 'linear', symbol: 'BNBUSDT', points, stepMs: 1_500 });
  await feed.quote('linear', 'BNBUSDT', { bid: 599.99, ask: 600, last: 600, mark: 600 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BNBUSDT');
  await placeOrder(page, {
    side: 'buy',
    type: 'limit',
    price: '580',
    amount: '1',
    unit: 'coin',
    tp: '620',
    sl: '560',
  });
  await at(page, 'account.tab', 'orders').click();
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveText('1');
  await expect(at(page, 'orders.subtab.count', 'inactive')).toHaveText('2');

  await path([590, 580]);
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', 'linear:BNBUSDT')).toBeVisible({ timeout: 20_000 });

  await path([600, 620]);
  await expect(at(page, 'positions.row', 'linear:BNBUSDT')).toHaveCount(0, { timeout: 20_000 });
  await at(page, 'account.tab', 'orderhistory').click();
  await expect(at(page, 'order-history.row.status').filter({ hasText: /filled/i })).toHaveCount(2);
  await expect(at(page, 'order-history.row.status').filter({ hasText: /cancel/i })).toHaveCount(1);
});
