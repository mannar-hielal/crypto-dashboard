/**
 * The chart pages and panels (SC-14.1-3, SC-15.6-2, SC-4-5): the public `/chart` page switching
 * market, the mark price line toggle, and maximizing the account panel. Read-only: no prices moved.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[14.1.10] signed out, /chart switches to USDT Perpetual and stays on /chart @full', async ({
  page,
}) => {
  await page.goto('/chart');
  await at(page, 'nav.trade-menu').click();
  await at(page, 'nav.trade-menu.option', 'linear').click();
  await expect(page.getByText('Perpetual').first()).toBeVisible();
  await expect(page).toHaveURL(/\/chart$/);
});

test('[15.6.2] the mark price line is on by default on a perp pane, remembered when off, absent on Spot @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await at(page, 'chart.type-menu').click();
  await expect(at(page, 'chart.mark-line')).toHaveText('✓ Mark price line');
  await at(page, 'chart.mark-line').click();
  if ((await at(page, 'chart.mark-line').count()) === 0) await at(page, 'chart.type-menu').click();
  await expect(at(page, 'chart.mark-line')).toHaveText('Mark price line');

  await page.reload();
  await at(page, 'chart.type-menu').click();
  await expect(at(page, 'chart.mark-line')).toHaveText('Mark price line');
  await page.keyboard.press('Escape');

  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'chart.type-menu').click();
  await expect(at(page, 'chart.mark-line')).toHaveCount(0);
});

test('[4.12][4.13] maximize fills the column with the account panel; restore brings the chart back @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  const chart = at(page, 'pane.chart', '0');
  const before = await chart.boundingBox();
  expect(before?.height ?? 0).toBeGreaterThan(100);

  await at(page, 'account.maximize').click();
  await expect(at(page, 'account.maximize')).toHaveAttribute('title', 'Restore panel');
  await expect
    .poll(async () => (await chart.boundingBox())?.height ?? 0, { timeout: 5_000 })
    .toBeLessThan(2);
  await expect(at(page, 'trade.submit')).toBeVisible();

  await at(page, 'account.maximize').click();
  await expect(at(page, 'account.maximize')).toHaveAttribute('title', 'Maximize panel');
  await expect
    .poll(async () => Math.abs(((await chart.boundingBox())?.height ?? 0) - before!.height), {
      timeout: 5_000,
    })
    .toBeLessThanOrEqual(2);
});
