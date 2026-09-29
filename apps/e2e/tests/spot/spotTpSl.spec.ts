/**
 * Spot TP / SL on XRPUSDT (row 14.6.6): a buy with both exits locks the coins in an
 * OCO pair; the price reaching the TP sells them and cancels the SL.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[14.6.6] a Spot buy with TP and SL: coins locked, TP fills at 2.6, SL cancelled @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'XRPUSDT', { bid: 2.4999, ask: 2.5, last: 2.5 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/XRP/USDT');

  await placeOrder(page, {
    side: 'buy',
    type: 'market',
    amount: '100',
    unit: 'coin',
    tp: '2.6',
    sl: '2.4',
  });
  await at(page, 'account.tab', 'assets').click();
  // 99.9 XRP received (0.1 % fee in the coin), all locked by the TP / SL pair
  await expect(at(page, 'assets.row.locked', 'XRP')).toContainText('99.9');
  await expect(at(page, 'assets.row.free', 'USDT')).toHaveText('9,750.00');

  await feed.control('path', {
    category: 'spot',
    symbol: 'XRPUSDT',
    points: [2.55, 2.6],
    stepMs: 1_500,
  });
  // 99.9 × 2.6 = 259.74, less 0.1 % → 259.48026 → 9,750 + 259.48
  await expect(at(page, 'assets.row.free', 'USDT')).toHaveText('10,009.48', { timeout: 20_000 });
  await expect(at(page, 'assets.row', 'XRP')).toHaveCount(0);
});
