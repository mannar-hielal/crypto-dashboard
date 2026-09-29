/**
 * Editing a resting limit and an open position's exits on AVAXUSDT (rows 4.17, 4.18; SC-4-17/18).
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[4.17][4.18] move a limit from 19 to 19.1, then add a TP of 22 to an open position @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('linear', 'AVAXUSDT', { bid: 19.999, ask: 20, last: 20, mark: 20 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/AVAXUSDT');

  await placeOrder(page, { side: 'buy', type: 'limit', price: '19', amount: '10', unit: 'coin' });
  await at(page, 'account.tab', 'orders').click();
  await at(page, 'orders.row.edit').click();
  await at(page, 'order-edit.price').fill('19.1');
  await at(page, 'order-edit.confirm').click();
  await expect(at(page, 'orders.row')).toContainText('19.1');

  await placeOrder(page, { side: 'buy', type: 'market', amount: '10', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  await at(page, 'positions.row', 'linear:AVAXUSDT').hover();
  await at(page, 'positions.row.edit-exits', 'tp').click();
  await at(page, 'position-exits.tp.enable').click();
  await at(page, 'position-exits.tp.price').fill('22');
  await at(page, 'position-exits.confirm').click();
  await expect(at(page, 'positions.row.tp')).toContainText('22');
});
