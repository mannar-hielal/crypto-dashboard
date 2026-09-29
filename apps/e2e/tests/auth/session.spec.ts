/** A session survives a reload, and sign-out works with the network down (row 19.4, SC-19-4). */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[19.4] a session survives a reload, then signs out @smoke @mobile', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(at(page, 'nav.user-menu')).toContainText(seededUser.username);
  await at(page, 'nav.user-menu').click();
  await at(page, 'nav.sign-out').click();
  await expect(page).not.toHaveURL(/\/dashboard/);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await expect(page).toHaveURL(/\/login/);
});

test('[19.15] signing out works with the network down @full', async ({
  page,
  context,
  seededUser,
}) => {
  // Row 19.15: the offline notice used to cover the top bar; it is a bottom toast since the fix
  test.setTimeout(20_000);
  await signInAs(page, seededUser.email, seededUser.password);
  // The dashboard is loaded (its code arrives lazily) before the network goes
  await expect(at(page, 'nav.user-menu')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('alert').filter({ hasText: 'Offline' })).toBeVisible();
  await at(page, 'nav.user-menu').click({ timeout: 5_000 });
  await at(page, 'nav.sign-out').click({ timeout: 5_000 });
  await expect(page).not.toHaveURL(/\/dashboard/);
  await context.setOffline(false);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await expect(page).toHaveURL(/\/login/);
});
