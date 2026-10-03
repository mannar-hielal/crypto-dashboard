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

// ─── Signed-out visitor: trading is locked behind sign-in ──────────────────

test('[14.1.11] signed out, /chart locks the order form and the account panel; 🔐 removing the lock in DevTools brings it back and sends nothing @full', async ({
  page,
}) => {
  const paperRequests: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/paper')) paperRequests.push(req.url());
  });
  await page.goto('/chart');

  // One lock over the order form, one over the account panel — the panels underneath are inert
  await expect(at(page, 'lock.overlay')).toHaveCount(2);
  await expect(at(page, 'lock.sign-in').first()).toHaveText('Sign in to trade');
  await expect(page.locator('[inert] [data-guide="trade.submit"]')).toHaveCount(1);
  // A visitor has no account to sync
  await expect(at(page, 'symbolbar.sync')).toHaveCount(0);

  // 🔐 Tampering: delete both overlays and strip inert — the lock restores itself
  await page.evaluate(() => {
    document.querySelectorAll('[data-guide="lock.overlay"]').forEach((el) => el.remove());
  });
  await expect(at(page, 'lock.overlay')).toHaveCount(2);
  await page.evaluate(() => {
    document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
  });
  await expect(page.locator('[inert] [data-guide="trade.submit"]')).toHaveCount(1);

  expect(paperRequests).toEqual([]);
});

test('[14.1.12] signed out, "Sign in to trade" → sign in → lands on the dashboard on the same market, unlocked @full', async ({
  page,
  seededUser,
}) => {
  await page.goto('/chart');
  await at(page, 'nav.trade-menu').click();
  await at(page, 'nav.trade-menu.option', 'linear').click();
  await at(page, 'lock.sign-in').first().click();

  await expect(page).toHaveURL(/\/login$/);
  await at(page, 'auth.login.email').fill(seededUser.email);
  await at(page, 'auth.login.password').fill(seededUser.password);
  await at(page, 'auth.login.submit').click();

  await expect(page).toHaveURL(/\/dashboard\/usdt\/BTCUSDT$/);
  await expect(at(page, 'trade.submit')).toBeVisible();
  await expect(at(page, 'lock.overlay')).toHaveCount(0);
  await expect(at(page, 'symbolbar.sync')).toHaveAttribute('data-tooltip', /saved on the server/);
});

test('[14.1.13] phone, signed out: the Buy / Sell bar shows dimmed and inert under the account panel\'s "Sign in to trade" @mobile', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, 'phones only');
  await page.goto('/chart');
  await expect(at(page, 'trade.mobile.buy')).toBeVisible();
  await expect(page.locator('[inert] [data-guide="trade.mobile.buy"]')).toHaveCount(1);
  await expect(page.locator('[inert] [data-guide="trade.mobile.sell"]')).toHaveCount(1);
  // The account panel's (the order sheet, off screen, has its own)
  await expect(at(page, 'lock.sign-in').first()).toBeInViewport();
});
