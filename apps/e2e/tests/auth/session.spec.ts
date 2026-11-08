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
  // A reload is a cold page load on the Vite dev server: the session restore, then the whole
  // dashboard's modules again. CI's runner took 8.9 s for this whole test on 2026-10-28 and 12 s for
  // the reload alone on 2026-11-08 (every smoke test 2–3× slower that day; ~1 s locally)
  await expect(at(page, 'nav.user-menu')).toContainText(seededUser.username, { timeout: 30_000 });
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
  browserName,
}) => {
  // Row 19.15: the offline notice used to cover the top bar; it is a bottom toast since the fix.
  // A short limit keeps an offline hang from eating the run, but WebKit on CI took 19.6 s on
  // 2026-10-03 and failed at 20 s on release #237 (both tries; 5.6 s locally): a minute there
  test.setTimeout(browserName === 'webkit' ? 60_000 : 20_000);
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
