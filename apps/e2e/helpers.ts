/** Small helpers shared by the specs: anchor locators and signing in through the form. */

import type { Page } from '@playwright/test';
import { guideSelector, type GuideAnchor } from '@/lib/guideAnchors';

export const at = (page: Page, anchor: GuideAnchor, key?: string) =>
  page.locator(guideSelector(anchor, key));

/** Sign in through the login form; waits until the app has navigated away from /login. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await at(page, 'auth.login.email').fill(email);
  await at(page, 'auth.login.password').fill(password);
  await at(page, 'auth.login.submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
