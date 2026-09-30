/**
 * USDT Perpetual TP / SL (rows 1.4, 1.5; SC-1-3): a long's TP closes it at a profit; a short's SL
 * is a working stop order and closes it at a loss.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[1.4.3] a long with a take-profit closes itself when the price reaches it @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('linear', 'XRPUSDT', { bid: 2.4999, ask: 2.5, last: 2.5, mark: 2.5 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/XRPUSDT');
  await placeOrder(page, { side: 'buy', type: 'market', amount: '100', unit: 'coin', tp: '2.6' });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', 'linear:XRPUSDT')).toBeVisible();

  await feed.control('path', {
    category: 'linear',
    symbol: 'XRPUSDT',
    points: [2.55, 2.6],
    stepMs: 1_500,
  });
  await expect(at(page, 'positions.row', 'linear:XRPUSDT')).toHaveCount(0, { timeout: 20_000 });
  await at(page, 'account.tab', 'journal').click();
  await expect(at(page, 'journal.entry.pnl').first()).toHaveText(/^\+/);
});

test('[1.5.3] a short with a stop-loss shows it working, and it closes the short at a loss @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('linear', 'DOGEUSDT', { bid: 0.2, ask: 0.20001, last: 0.2, mark: 0.2 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/DOGEUSDT');
  await placeOrder(page, {
    side: 'sell',
    type: 'market',
    amount: '1000',
    unit: 'coin',
    sl: '0.21',
  });
  await at(page, 'account.tab', 'orders').click();
  // The stop-loss is a working order (the filled market order sits beside it for 2 minutes)
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveText('1');

  await feed.control('path', {
    category: 'linear',
    symbol: 'DOGEUSDT',
    points: [0.205, 0.21],
    stepMs: 1_500,
  });
  await expect(at(page, 'orders.subtab.count', 'working')).toHaveCount(0, { timeout: 20_000 });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row', 'linear:DOGEUSDT')).toHaveCount(0);
  await at(page, 'account.tab', 'journal').click();
  // A loss reads "-$10.12", sign first like Bybit (lib/format.ts, since 2026-09-29; row 1.5.3)
  await expect(at(page, 'journal.entry.pnl').first()).toHaveText(/-/);
});
