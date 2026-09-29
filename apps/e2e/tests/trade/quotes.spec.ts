/** Sell / Buy and the spread at the instrument's tick (rows 9.x; SC-9-1). */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[9.1][9.5] Sell / Buy show the book at the tick, with the spread between @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'BTCUSDT', { bid: 49_999.9, ask: 50_000, last: 50_000 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await expect(at(page, 'trade.side.sell')).toContainText('49,999.9');
  await expect(at(page, 'trade.side.buy')).toContainText('50,000.0');
  await expect(at(page, 'trade.spread')).toHaveText('0.1');
  await expect(at(page, 'trade.spread')).toHaveAttribute(
    'title',
    /Bid: 49,999\.9 · Ask: 50,000\.0/
  );
});
