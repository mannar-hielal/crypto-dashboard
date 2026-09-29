/** An unverified user is held at /unverified and can resend the email (NEW-19-2). */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

test('[NEW-19-2] an unverified user stays on /unverified; an immediate resend is confirmed but held back @full', async ({
  page,
  hooks,
}) => {
  const user = await hooks.seedUser({ verified: false });
  await signInAs(page, user.email, user.password);
  await expect(page).toHaveURL(/\/unverified/);

  await page.goto('/dashboard/spot/BTC/USDT');
  await expect(page).toHaveURL(/\/unverified/);

  // Resend right after sign-up: the page confirms, but the server holds a second email back for
  // 5 minutes after the last one (anti-spam, routes/auth EMAIL_SENT_TTL_MS) — by design
  const count = async () =>
    (await hooks.outbox(user.email)).filter((m) => m.kind === 'verify-email').length;
  expect(await count()).toBe(1);
  await at(page, 'auth.unverified.resend').click();
  await expect(at(page, 'auth.unverified.message')).toBeVisible();
  expect(await count()).toBe(1);
});
