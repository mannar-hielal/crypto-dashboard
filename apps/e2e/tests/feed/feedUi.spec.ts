/**
 * The live feed on screen, on Spot ETHUSDT (SC-12.1-1, SC-12.1-3, SC-9-4, SC-10.5-2, SC-6-3): Spot
 * quotes from the order book, the cached quote on connect, quotes following the active pane, the
 * pane header's price and connection dot, and the browser tab title. One market, so the tests run
 * one after another. The connection is cut for this page only (`routeWebSocket`), never with the
 * feed's `drop` / `stall`, which would cut every spec's Spot stream.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test.describe.configure({ mode: 'serial' });

const ETH = '/dashboard/spot/ETH/USDT';

test('[12.1.1] Spot Sell / Buy come from the order book (the Spot ticker has no bid / ask) @full', async ({
  page,
  seededUser,
  feed,
}) => {
  // The fake feed, like Bybit, sends Spot `tickers` with the last price only; bid / ask come from
  // `orderbook.1`
  await feed.quote('spot', 'ETHUSDT', { bid: 2_999.9, ask: 3_000, last: 3_000 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await expect(at(page, 'trade.side.sell')).toContainText('2,999.9');
  await expect(at(page, 'trade.side.buy')).toContainText('3,000');
  await expect(at(page, 'trade.spread')).toHaveText(/^0\.10?$/);
});

test('[12.1.3] a reload shows the quote at once, from the server cache, before any new push @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'ETHUSDT', { bid: 3_099.9, ask: 3_100, last: 3_100 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await expect(at(page, 'trade.side.sell')).toContainText('3,099.9');
  // Nothing pushes ETH again from here on
  await page.reload();
  await expect(at(page, 'trade.side.sell')).toContainText('3,099.9', { timeout: 3_000 });
  await expect(at(page, 'trade.spread')).not.toHaveText('—');
});

test('[9.7] in two panes, Sell / Buy follow the active pane @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'ETHUSDT', { bid: 3_199.9, ask: 3_200, last: 3_200 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'layout.picker').click();
  await at(page, 'layout.option', '2h').click();
  await page.keyboard.press('Escape');

  // Pane 1 → ETHUSDT, then make pane 0 (BTC) active again
  await at(page, 'pane.header.symbol').nth(1).click();
  await at(page, 'pane.header.symbol-option', 'ETHUSDT').first().click();
  await at(page, 'pane.chart', '0').click();
  await expect(at(page, 'trade.side.buy')).not.toContainText('3,200');

  await at(page, 'pane.chart', '1').click();
  await expect(at(page, 'trade.side.sell')).toContainText('3,199.9');
  await expect(at(page, 'trade.side.buy')).toContainText('3,200');
});

test('[10.5.1][10.5.2] the pane header shows the live price, and its dot goes grey when the feed drops @full', async ({
  page,
  seededUser,
  feed,
}) => {
  // This page's market sockets go through the test, so it can cut them
  const sockets: { close: () => Promise<void> }[] = [];
  await page.routeWebSocket(/\/api\/market\/ws/, (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  await feed.quote('spot', 'ETHUSDT', { bid: 3_299.9, ask: 3_300, last: 3_300 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await at(page, 'layout.picker').click();
  await at(page, 'layout.option', '2h').click();
  await page.keyboard.press('Escape');

  const header = page
    .locator('[data-guide="pane.header.symbol"]')
    .first()
    .locator('..')
    .locator('..');
  await expect(header.locator('[data-guide="pane.header.price"]')).toContainText('3,300');
  await expect(header.locator('[data-guide="pane.header.change"]')).toHaveText(/[+−-]/);
  const dot = header.locator('[data-guide="pane.header.dot"]');
  await expect(dot).toHaveClass(/pulse-live-dot/);

  const open = sockets.length;
  await Promise.all(sockets.map((s) => s.close()));
  await expect(dot).not.toHaveClass(/pulse-live-dot/, { timeout: 2_000 });
  // The page reconnects by itself
  await expect.poll(() => sockets.length, { timeout: 15_000 }).toBeGreaterThan(open);
  await expect(dot).toHaveClass(/pulse-live-dot/, { timeout: 15_000 });
});

test('[6.6] the browser tab title shows the pair, the price and the direction @full', async ({
  page,
  seededUser,
  feed,
}) => {
  await feed.quote('spot', 'ETHUSDT', { bid: 3_399.9, ask: 3_400, last: 3_400 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await expect(page).toHaveTitle(/^[▲▼] ETH\/USDT 3,400\.00 /);
  await expect(page).toHaveTitle(/ · cryptopapertrade\.com$/);

  // Far above, then far below the previous candle's close: the arrow and the sign follow
  await feed.quote('spot', 'ETHUSDT', { last: 100_000 });
  await expect(page).toHaveTitle(/^▲ ETH\/USDT 100,000\.00 \+\d+\.\d\d% · cryptopapertrade\.com$/);
  await feed.quote('spot', 'ETHUSDT', { last: 1 });
  await expect(page).toHaveTitle(/^▼ ETH\/USDT 1\.0000 −\d+\.\d\d% · cryptopapertrade\.com$/);
  // Back to a normal price for the next tests
  await feed.quote('spot', 'ETHUSDT', { bid: 3_399.9, ask: 3_400, last: 3_400 });
});

/** Cut this page's market sockets and refuse its reconnects: the feed is gone for this page only. */
async function cutFeed(page: import('@playwright/test').Page) {
  const sockets: { close: () => Promise<void> }[] = [];
  let refuse = false;
  await page.routeWebSocket(/\/api\/market\/ws/, async (ws) => {
    if (refuse) return ws.close();
    ws.connectToServer();
    sockets.push(ws);
  });
  return async () => {
    refuse = true;
    await Promise.all(sockets.map((s) => s.close()));
  };
}

test('[9.6] with the feed gone, a market order cannot be sent @full', async ({
  page,
  seededUser,
  feed,
}) => {
  const cut = await cutFeed(page);
  await feed.quote('spot', 'ETHUSDT', { bid: 3_499.9, ask: 3_500, last: 3_500 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await at(page, 'trade.type.market').click();
  await at(page, 'trade.amount').fill('0.01');
  await expect(at(page, 'trade.submit')).toBeEnabled();

  await cut();
  await expect(at(page, 'trade.submit')).toBeDisabled({ timeout: 5_000 });
});

test('[9.6] with the feed gone, Sell / Buy fall back to the last price and the spread shows — @full', async ({
  page,
  seededUser,
  feed,
}) => {
  // Finding (M5d): on a disconnect only `isConnected` goes false; the last bid / ask and the spread
  // stay on screen. Changing that is a UI change, so it waits for the visual Q&A gate. Remove
  // test.fail once it is fixed.
  test.fail();
  const cut = await cutFeed(page);
  await feed.quote('spot', 'ETHUSDT', { bid: 3_499.9, ask: 3_500, last: 3_500 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto(ETH);
  await expect(at(page, 'trade.spread')).not.toHaveText('—');
  await cut();
  await expect(at(page, 'trade.spread')).toHaveText('—', { timeout: 5_000 });
});
