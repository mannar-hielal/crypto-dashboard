/**
 * The server keeps trading while the tab is closed (SC-13.2-1, rows 13.2.1, 13.2.2), on Spot
 * BNBUSDT: a resting limit fills, and a take-profit sells, with no page open. One market, so the
 * tests run one after another.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test.describe.configure({ mode: 'serial' });

const BNB = '/dashboard/spot/BNB/USDT';

test('[13.2.1] a limit buy fills while no tab is open; the next visit shows it @full', async ({
  context,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'BNBUSDT', { bid: 599.9, ask: 600, last: 600 });
  const page = await context.newPage();
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(BNB);
  await placeOrder(page, { side: 'buy', type: 'limit', price: '590', amount: '1', unit: 'coin' });
  await at(page, 'account.tab', 'orders').click();
  await expect(at(page, 'orders.row')).toHaveCount(1);
  await page.close();

  await feed.control('path', {
    category: 'spot',
    symbol: 'BNBUSDT',
    points: [595, 589],
    stepMs: 1_000,
  });
  // Give the server time to fill with no page open
  await new Promise((r) => setTimeout(r, 4_000));

  const again = await context.newPage();
  await again.goto(BNB);
  await at(again, 'account.tab', 'assets').click();
  await expect(at(again, 'assets.row', 'BNB')).toBeVisible();
  await at(again, 'account.tab', 'journal').click();
  await expect(again.getByText(/Limit order filled — Buy BNBUSDT @ \$59/)).toBeVisible();
});

test('[13.2.2] a take-profit sells while no tab is open @full', async ({
  context,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'BNBUSDT', { bid: 599.9, ask: 600, last: 600 });
  const page = await context.newPage();
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(BNB);
  await placeOrder(page, { side: 'buy', type: 'market', amount: '1', unit: 'coin', tp: '620' });
  await at(page, 'account.tab', 'assets').click();
  await expect(at(page, 'assets.row', 'BNB')).toBeVisible();
  await page.close();

  await feed.control('path', {
    category: 'spot',
    symbol: 'BNBUSDT',
    points: [610, 621],
    stepMs: 1_000,
  });
  await new Promise((r) => setTimeout(r, 4_000));

  const again = await context.newPage();
  await again.goto(BNB);
  await at(again, 'account.tab', 'journal').click();
  await expect(again.getByText(/Auto-sold BNBUSDT — Take-Profit/)).toBeVisible();
});
