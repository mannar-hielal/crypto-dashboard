/**
 * Accessibility of the auth pages (NEW-19-3, F11): axe finds no serious or critical violation, and
 * signing in works with the keyboard alone.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../fixtures';

for (const path of ['/login', '/register', '/forgot-password', '/reset-password?token=e2e-axe']) {
  test(`[NEW-19-3] axe: ${path} has no serious or critical violation @a11y`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // Let the entrance animations finish: a half-faded element reads as low contrast
    await page.waitForTimeout(1_500);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} × ${v.nodes[0]?.target.join(' ')})`
      );
    expect(blocking).toEqual([]);
  });
}

test('[NEW-19-3] signing in works with the keyboard alone @a11y', async ({ page, seededUser }) => {
  await page.goto('/login');
  // As a keyboard user would: once the form is on screen, Tab to the email field, then through it
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await page.keyboard.press('Tab');
  for (let i = 0; i < 20; i++) {
    const autocomplete = await page.evaluate(() =>
      document.activeElement?.getAttribute('autocomplete')
    );
    if (autocomplete === 'email') break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.type(seededUser.email);
  // Tab to the password field (the "Forgot password?" link sits between them)
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const type = await page.evaluate(
      () => (document.activeElement as HTMLInputElement | null)?.type
    );
    if (type === 'password') break;
  }
  await page.keyboard.type(seededUser.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard/);
});
