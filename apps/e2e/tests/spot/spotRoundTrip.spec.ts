/**
 * A Spot round trip on SOLUSDT (rows 14.6.x; SC-14.6-2): buy 10 at 150 (fee in the coin), sell the
 * 9.99 received at 160 (fee in USDT).
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[14.6.2] buy 10 SOL at 150, sell the 9.99 at 160: fees on each side, profit booked @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'SOLUSDT', { bid: 149.99, ask: 150, last: 150 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/SOL/USDT');

  await placeOrder(page, { side: 'buy', type: 'market', amount: '10', unit: 'coin' });
  await at(page, 'account.tab', 'assets').click();
  // 10 × 150 = 1,500 USDT; 0.1 % of the coins received is the fee: 9.99 SOL, avg 1,500 ÷ 9.99
  await expect(at(page, 'assets.row.free', 'USDT')).toHaveText('8,500.00');
  await expect(at(page, 'assets.row.free', 'SOL')).toContainText('9.99');
  await expect(at(page, 'assets.row.avg-cost', 'SOL')).toContainText('150.15');

  await feed.quote('spot', 'SOLUSDT', { bid: 160, ask: 160.01, last: 160 });
  await placeOrder(page, { side: 'sell', type: 'market', amount: '9.99', unit: 'coin' });
  // 9.99 × 160 = 1,598.40, less 0.1 % (1.5984) = 1,596.8016 → 8,500 + 1,596.80
  await expect(at(page, 'assets.row.free', 'USDT')).toHaveText('10,096.80');
  await expect(at(page, 'assets.row', 'SOL')).toHaveCount(0);
});
