/**
 * The dashboard on phones and tablets (owner, 2026-09-29: "support phone trading", responsive on
 * small phones and tablets). Phones run in the `mobile-safari` / `mobile-chrome` projects (@mobile);
 * the tablet case sets its own viewport.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, signInAs } from '../../helpers';

test('[20.1][20.2] phone: no sideways scroll, the logo without the wordmark, Sell opens a full-width form @mobile', async ({
  page,
  seededUser,
}) => {
  // The desktop project runs every test: this one is for phone widths only
  test.skip((page.viewportSize()?.width ?? 0) >= 640, 'phones only');
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await expect(at(page, 'trade.mobile.buy')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByAltText('CPT')).toBeVisible();
  await expect(page.getByText('cryptopapertrade.com', { exact: true })).toBeHidden();
  await expect(at(page, 'nav.user-menu')).toBeInViewport();

  await at(page, 'trade.mobile.sell').click();
  await expect(at(page, 'trade.submit')).toBeInViewport();
  await expect(at(page, 'trade.submit')).toContainText('Sell');
  const form = await at(page, 'trade.submit').boundingBox();
  const width = page.viewportSize()!.width;
  expect(form!.width).toBeGreaterThan(width * 0.8);
  await expect(at(page, 'trade.mobile.buy')).toHaveCount(0);
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('[20.3] tablet: Buy opens the order form as a sheet beside the chart @full', async ({
    page,
    seededUser,
  }) => {
    await signInAs(page, seededUser.email, seededUser.password);
    await page.goto('/dashboard/usdt/BTCUSDT');
    await at(page, 'trade.mobile.buy').click();
    const form = (await at(page, 'trade.submit').boundingBox())!;
    const chart = (await at(page, 'pane.chart', '0').boundingBox())!;
    // A sheet on the right (320 px), the chart still visible to its left
    expect(form.x).toBeGreaterThan(820 - 330);
    expect(chart.width).toBeGreaterThan(400);
    await expect(page.getByText('cryptopapertrade.com', { exact: true })).toBeVisible();
  });
});

test('[20.2] phone: editing an order covers the screen and hides the Buy / Sell bar until it is done @mobile', async ({
  page,
  seededUser,
  feed,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, 'phones only');
  // Linear LINKUSDT: risk.spec owns it, but that runs in the desktop project, before the phones
  await feed.quote('linear', 'LINKUSDT', { bid: 19.999, ask: 20, last: 20, mark: 20 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/LINKUSDT');
  await at(page, 'trade.mobile.buy').click();
  await placeOrder(page, { side: 'buy', type: 'limit', price: '15', amount: '10', unit: 'coin' });
  // The form closed and the account panel opened on the result
  await expect(at(page, 'trade.mobile.buy')).toBeVisible();

  await at(page, 'account.tab', 'orders').click();
  await at(page, 'orders.row.edit').click();
  const width = page.viewportSize()!.width;
  await expect(at(page, 'order-edit.price')).toBeInViewport();
  expect((await at(page, 'order-edit.price').boundingBox())!.width).toBeGreaterThan(width * 0.6);
  await expect(at(page, 'trade.mobile.buy')).toHaveCount(0);

  await at(page, 'order-edit.price').fill('15.5');
  await at(page, 'order-edit.confirm').click();
  await expect(at(page, 'trade.mobile.buy')).toBeVisible({ timeout: 5_000 });
});

test('[20.4] phone: Assets → Sell opens the order form on Sell with the coins prefilled @mobile', async ({
  page,
  seededUser,
  feed,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, 'phones only');
  // Spot DOGEUSDT: tokenRefresh.spec reads it in the desktop project, before the phones
  await feed.quote('spot', 'DOGEUSDT', { bid: 0.19999, ask: 0.2, last: 0.2 });
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/DOGE/USDT');
  await at(page, 'trade.mobile.buy').click();
  await placeOrder(page, { side: 'buy', type: 'market', amount: '100', unit: 'coin' });

  await at(page, 'account.tab', 'assets').click();
  await at(page, 'assets.row.sell', 'DOGE').click();
  // The tap opens the form (it isn't docked on a phone), on Sell, with the coins held
  await expect(at(page, 'trade.submit')).toBeInViewport();
  await expect(at(page, 'trade.submit')).toContainText('Sell');
  await expect(at(page, 'trade.amount')).toHaveValue(/^99\.9/);
});

test('[20.5] phone: the Limit and Stop tabs show the price field above the amount @mobile', async ({
  page,
  seededUser,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, 'phones only');
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await at(page, 'trade.mobile.buy').click();
  for (const tab of ['limit', 'stop'] as const) {
    await at(page, `trade.type.${tab}`).click();
    const price = at(page, 'trade.price');
    // The form's scrolling column squeezed the field's box to nothing on a phone, leaving the field
    // under the Amount row. Polled: the field opens with a height animation
    await expect
      .poll(() =>
        price.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.height > 24 && !!hit && (hit === el || el.contains(hit) || hit.contains(el));
        })
      )
      .toBe(true);
    const box = (await price.boundingBox())!;
    const amount = (await at(page, 'trade.amount').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(amount.y);
  }
});
