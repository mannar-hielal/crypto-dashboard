/**
 * The dashboard on phones and tablets (owner, 2026-09-29: "support phone trading", responsive on
 * small phones and tablets). Phones run in the `mobile-safari` / `mobile-chrome` projects (@mobile);
 * the tablet case sets its own viewport.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

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
