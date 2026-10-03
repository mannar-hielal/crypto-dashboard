/** Account reset from Settings (row 8.8; SC-8-x): positions, orders and journal cleared, 10,000 back. */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[8.8] reset clears an open position, a resting limit and the journal; balance back to 10,000 @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('linear', 'ETHUSDT', { bid: 2_999.99, ask: 3_000, last: 3_000, mark: 3_000 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/ETHUSDT');

  await placeOrder(page, { side: 'buy', type: 'market', amount: '1', unit: 'coin' });
  await placeOrder(page, { side: 'buy', type: 'limit', price: '2800', amount: '1', unit: 'coin' });
  await at(page, 'account.tab', 'journal').click();
  await at(page, 'journal.add-note').first().click();
  await at(page, 'journal.note-input').fill('before the reset');
  await at(page, 'journal.note-input').press('Enter');
  await expect(page.getByText('before the reset')).toBeVisible();

  await at(page, 'account.settings').click();
  await at(page, 'acct-settings.reset').click();
  // The button swaps with an exit animation (AnimatePresence mode="wait"): click the confirm
  // step only once it is there, or the click lands on the departing "Reset account"
  await expect(at(page, 'acct-settings.reset')).toHaveText('Confirm reset?');
  await at(page, 'acct-settings.reset').click(); // the two-step confirm

  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', 'linear:ETHUSDT')).toHaveCount(0);
  await at(page, 'account.tab', 'orders').click();
  await expect(at(page, 'orders.row')).toHaveCount(0);
  await at(page, 'account.tab', 'journal').click();
  await expect(page.getByText('before the reset')).toHaveCount(0);
  await expect(page.getByText('$10,000.00').first()).toBeVisible();
});
