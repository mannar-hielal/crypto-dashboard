/**
 * Sign up through the form, verify with the link from the email, and use that link a second time
 * (test plan rows 19.2, 19.4; SC-19-2 / SC-19-4 in docs/TEST_IMPLEMENTATION_PLAN.md).
 */

import { expect, test } from '../../fixtures';
import { guideSelector } from '@/lib/guideAnchors';

const at = (anchor: Parameters<typeof guideSelector>[0], key?: string) =>
  guideSelector(anchor, key);

test('[19.2][19.4] register, verify the email once, then sign out and back in @smoke @mobile', async ({
  page,
  hooks,
}) => {
  const tag = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const email = `e2e-register-${tag}@test.local`;
  const password = `Reg!${tag}aA`;
  const serverErrors: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500)
      serverErrors.push(`${r.status()} ${r.url()}`);
  });

  // Register through the form
  await page.goto('/register');
  await page.locator(at('auth.register.email')).fill(email);
  await page.locator(at('auth.register.username')).fill(`reg_${tag.slice(-10)}`);
  await page.locator(at('auth.register.password')).fill(password);
  await page.locator(at('auth.register.terms')).click();
  await page.locator(at('auth.register.submit')).click();
  await page.waitForURL(/\/(dashboard|unverified)/);

  // The verification email carries a one-time link
  const [mail] = (await hooks.outbox(email)).filter((m) => m.kind === 'verify-email');
  expect(mail?.url).toMatch(/\/verify-email\?token=/);
  const link = new URL(mail!.url!);
  await page.goto(`${link.pathname}${link.search}`);
  await expect(page.locator(at('auth.verify.status', 'success'))).toBeVisible();

  // Used again (a second tab, a double click in the inbox): refused with a message, never a 5xx
  const second = await page.context().newPage();
  await second.goto(`${link.pathname}${link.search}`);
  await expect(second.locator(at('auth.verify.status', 'error'))).toBeVisible();
  await second.close();

  // Sign in with the new account; the session survives a reload; sign out
  await page.goto('/login');
  await page.locator(at('auth.login.email')).fill(email);
  await page.locator(at('auth.login.password')).fill(password);
  await page.locator(at('auth.login.submit')).click();
  await page.waitForURL(/\/dashboard/);
  await page.reload();
  await expect(page.locator(at('nav.user-menu'))).toContainText(`reg_${tag.slice(-10)}`);
  await page.locator(at('nav.user-menu')).click();
  await page.locator(at('nav.sign-out')).click();
  await expect(page).not.toHaveURL(/\/dashboard/);

  expect(serverErrors).toEqual([]);
});

test('[19.1] a too-short username shows its field error and the form stays usable @full', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/register');
  await page.locator(at('auth.register.email')).fill(`e2e-short-${Date.now()}@test.local`);
  await page.locator(at('auth.register.username')).fill('ab');
  await page.locator(at('auth.register.password')).fill('Short!name1');
  await page.locator(at('auth.register.terms')).click();
  await page.locator(at('auth.register.submit')).click();

  await expect(page.getByText('At least 3 characters')).toBeVisible();
  // Not stuck on "Creating account…", and no uncaught ZodError
  await expect(page.locator(at('auth.register.submit'))).toBeEnabled();
  await expect(page).toHaveURL(/\/register/);
  expect(pageErrors.filter((e) => /ZodError/.test(e))).toEqual([]);
});
