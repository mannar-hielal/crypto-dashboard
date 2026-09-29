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
  // Known defect (row 19.15): OfflineBanner is `fixed top-0 z-50`, so while offline it covers the
  // top bar and its user menu — Sign out can't be reached. Remove this line with the fix.
  test.fail(true, 'row 19.15: the offline banner covers the top bar and its Sign out');
  test.setTimeout(20_000);
  await signInAs(page, seededUser.email, seededUser.password);
  await context.setOffline(true);
  await at(page, 'nav.user-menu').click({ timeout: 5_000 });
  await at(page, 'nav.sign-out').click({ timeout: 5_000 });
  await expect(page).not.toHaveURL(/\/dashboard/);
  await context.setOffline(false);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await expect(page).toHaveURL(/\/login/);
});
