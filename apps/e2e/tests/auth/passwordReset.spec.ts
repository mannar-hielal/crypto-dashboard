/**
 * Forgot / reset password (row 19.5, SC-19-5): the same answer whether or not the email exists, the
 * outbox link resets it, and a session signed in elsewhere before the reset is ended.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[19.5] forgot password answers the same for any email; the link resets it and ends other sessions @full', async ({
  page,
  browser,
  seededUser,
  hooks,
}) => {
  const answer = async (email: string) => {
    await page.goto('/forgot-password');
    await at(page, 'auth.forgot.email').fill(email);
    await at(page, 'auth.forgot.submit').click();
    return (await at(page, 'auth.forgot.message').textContent())?.trim();
  };

  // A second browser, signed in before the reset
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.addInitScript(() => localStorage.setItem('cd-cookie-notice-dismissed', 'true'));
  await signInAs(otherPage, seededUser.email, seededUser.password);

  // 🔐 No account enumeration: identical text for a known and an unknown address
  const known = await answer(seededUser.email);
  const unknown = await answer(`nobody-${Date.now()}@test.local`);
  expect(known).toBeTruthy();
  expect(unknown).toBe(known);

  const [mail] = (await hooks.outbox(seededUser.email)).filter((m) => m.kind === 'password-reset');
  expect(mail?.url).toMatch(/\/reset-password\?token=/);
  const link = new URL(mail!.url!);
  const newPassword = `Reset!${Date.now()}aA`;
  await page.goto(`${link.pathname}${link.search}`);
  await at(page, 'auth.reset.password', 'new').fill(newPassword);
  await at(page, 'auth.reset.password', 'confirm').fill(newPassword);
  await at(page, 'auth.reset.submit').click();

  // The new password works…
  await signInAs(page, seededUser.email, newPassword);
  await expect(page).toHaveURL(/\/dashboard/);
  // …and the session opened before the reset is gone on its next start
  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();
});
