/**
 * Trading after the access token expires (SC-13.3-2, row 13.3.3), on Spot DOGEUSDT: 20 minutes on
 * the page's clock → the app refreshes its session on its own, and a market order still goes
 * through. The page's clock is faked (owner Q6: client-side expiry; the server's token lifetime
 * isn't shortened for e2e).
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[13.3.3] 20 minutes later the session refreshes itself and a market order still works @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'DOGEUSDT', { bid: 0.19999, ask: 0.2, last: 0.2 });
  await page.clock.install();
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/DOGE/USDT');
  await expect(at(page, 'trade.side.buy')).toContainText('0.2');

  const refreshed = page.waitForRequest((r) => r.url().includes('/api/auth/refresh'), {
    timeout: 30_000,
  });
  await page.clock.fastForward('20:00');
  await refreshed;

  await placeOrder(page, { side: 'buy', type: 'market', amount: '100', unit: 'coin' });
  await at(page, 'account.tab', 'assets').click();
  await expect(at(page, 'assets.row', 'DOGE')).toBeVisible();
});
