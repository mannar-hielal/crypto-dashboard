/**
 * Account settings in the browser (rows 19.7, 19.8, 19.13, 19.14; SC-19-7, SC-19-8, SC-19-13):
 * rename, password change, export, delete, and a pending deletion's banner after signing back in.
 */

import { readFile } from 'node:fs/promises';
import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

async function openSettings(page: import('@playwright/test').Page) {
  await at(page, 'nav.user-menu').click();
  await at(page, 'nav.settings').click();
}

test('[19.7][19.14] a new username is saved and shown, with no error @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await openSettings(page);
  const renamed = `ren_${Date.now().toString(36)}`;
  await at(page, 'settings.username.input').fill(renamed);
  await at(page, 'settings.username.save').click();
  // Before #178 the reply was {} and this showed an error though the rename had worked
  await expect(at(page, 'settings.username.save')).toContainText('Saved');
  await expect(at(page, 'settings.username.error')).toHaveCount(0);
  await at(page, 'settings.close').click();
  await expect(at(page, 'nav.user-menu')).toContainText(renamed);
});

test('[19.7] a password change ends the other sessions @full', async ({
  page,
  browser,
  seededUser,
}) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.addInitScript(() => localStorage.setItem('cd-cookie-notice-dismissed', 'true'));
  await signInAs(otherPage, seededUser.email, seededUser.password);

  await signInAs(page, seededUser.email, seededUser.password);
  await openSettings(page);
  await at(page, 'settings.password.toggle').click();
  const newPassword = `Changed!${Date.now()}aA`;
  await at(page, 'settings.password.current').fill(seededUser.password);
  await at(page, 'settings.password.new').fill(newPassword);
  await at(page, 'settings.password.save').click();
  await expect(at(page, 'settings.password.success')).toBeVisible();

  await expect
    .poll(
      async () => {
        await otherPage.reload();
        return new URL(otherPage.url()).pathname;
      },
      { timeout: 20_000 }
    )
    .toMatch(/\/login/);
  await other.close();
});

test('[19.8] export downloads my data without a password; delete can be cancelled, then deletes @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await openSettings(page);

  const download = page.waitForEvent('download');
  await at(page, 'settings.export').click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  expect(JSON.stringify(data)).toContain(seededUser.username);
  expect(JSON.stringify(data)).not.toMatch(/"password"/);

  await at(page, 'settings.delete').click();
  await at(page, 'settings.delete.cancel').click();
  await expect(at(page, 'settings.delete.password')).toHaveCount(0);

  // The dev / e2e server deletes at once (production schedules it: see the next test)
  await at(page, 'settings.delete').click();
  await at(page, 'settings.delete.password').fill(seededUser.password);
  await at(page, 'settings.delete.confirm').click();
  await expect(page).not.toHaveURL(/\/dashboard/);

  await page.goto('/login');
  await at(page, 'auth.login.email').fill(seededUser.email);
  await at(page, 'auth.login.password').fill(seededUser.password);
  await at(page, 'auth.login.submit').click();
  await expect(at(page, 'auth.login.error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('[19.13] a pending deletion shows its banner after signing back in; Cancel removes it for good @full', async ({
  page,
  seededUser,
  hooks,
}) => {
  await hooks.requestDeletion(seededUser.userId);
  await signInAs(page, seededUser.email, seededUser.password);
  // Before #178 no auth response carried deletionRequestedAt, so this banner never appeared
  await expect(at(page, 'notice.deletion-pending')).toBeVisible();
  await expect(at(page, 'notice.deletion-pending')).toContainText('scheduled for deletion');
  await at(page, 'notice.deletion-pending.cancel').click();
  await expect(at(page, 'notice.deletion-pending')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(at(page, 'notice.deletion-pending')).toHaveCount(0);
});
