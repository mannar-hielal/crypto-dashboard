/** A USDT Perpetual short on SOLUSDT: its P&L rises as the price falls (rows 1.2.x; SC-1-2). */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[1.2.1][1.2.3] a short gains as the price falls and loses as it rises @full', async ({
  page,
  seededUser,
  feed,
}) => {
  const quote = (p: number) =>
    feed.quote('linear', 'SOLUSDT', { bid: p, ask: p + 0.01, last: p, mark: p });
  await quote(150);
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/SOLUSDT');
  await placeOrder(page, { side: 'sell', type: 'market', amount: '1', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  const row = at(page, 'positions.row', 'linear:SOLUSDT');
  await expect(row).toContainText(/short/i);

  await quote(140);
  await expect(at(page, 'positions.row.pnl')).toHaveText(/^\+/);
  await quote(160);
  await expect(at(page, 'positions.row.pnl')).toHaveText(/^-/);
});
