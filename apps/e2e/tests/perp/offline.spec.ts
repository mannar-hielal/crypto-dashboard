/** No market order without a connection (row 1.7.8; SC-1-7). */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[1.7.8] offline, the market order button is disabled @full', async ({
  page,
  context,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await at(page, 'trade.type.market').click();
  await at(page, 'trade.amount').fill('100');
  await expect(at(page, 'trade.submit')).toBeEnabled();
  await context.setOffline(true);
  await expect(at(page, 'trade.submit')).toBeDisabled();
  await context.setOffline(false);
  await expect(at(page, 'trade.submit')).toBeEnabled();
});
