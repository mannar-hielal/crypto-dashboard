/**
 * Two tabs of one session stay in sync (SC-13.3-1, rows 13.3.1, 4.6, NEW-8-2), on Spot AVAXUSDT: a
 * limit placed or cancelled, a market buy and a reset in tab A show in tab B within 2 s, and a
 * reload of B shows the same state.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

const AVAX = '/dashboard/spot/AVAX/USDT';

test('[13.3.1][4.6] what tab A does shows in tab B; a reload keeps it @full', async ({
  context,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'AVAXUSDT', { bid: 19.99, ask: 20, last: 20 });
  const a = await context.newPage();
  await signInAs(a, seededUser.email, seededUser.password);
  await a.goto(AVAX);
  const b = await context.newPage();
  await b.goto(AVAX);
  await at(b, 'account.tab', 'orders').click();

  // Finished orders stay listed beside the working ones for 2 minutes: count the working ones
  await placeOrder(a, { side: 'buy', type: 'limit', price: '18', amount: '10', unit: 'coin' });
  await expect(at(b, 'orders.subtab.count', 'working')).toHaveText('1', { timeout: 2_000 });

  await at(a, 'account.tab', 'orders').click();
  await at(a, 'orders.row.cancel').click();
  await expect(at(b, 'orders.subtab.count', 'working')).toHaveCount(0, { timeout: 2_000 });

  await at(b, 'account.tab', 'assets').click();
  await placeOrder(a, { side: 'buy', type: 'market', amount: '10', unit: 'coin' });
  await expect(at(b, 'assets.row', 'AVAX')).toBeVisible({ timeout: 2_000 });

  await b.reload();
  await at(b, 'account.tab', 'assets').click();
  await expect(at(b, 'assets.row', 'AVAX')).toBeVisible();

  // A reset in A empties B too (NEW-8-2)
  await at(a, 'account.settings').click();
  await at(a, 'acct-settings.reset').click();
  await at(a, 'acct-settings.reset').click();
  await expect(at(b, 'assets.row', 'AVAX')).toHaveCount(0, { timeout: 2_000 });
  await expect(at(b, 'assets.row', 'USDT')).toContainText('10,000.00', { timeout: 2_000 });
});
