/**
 * Accessibility of the dashboard (F11): axe on Spot and USDT Perpetual with each bottom tab open,
 * and on the settings modal — no serious or critical violation. The chart canvases are excluded
 * (a canvas has no accessible content to check).
 *
 * Three rules are findings waiting for the visual Q&A gate (M5e), because fixing them changes how
 * things look: `color-contrast` (the Beta badge, red % changes, small muted labels in settings),
 * `nested-interactive` (the drawing toolbar's buttons hold a second button) and
 * `scrollable-region-focusable` (a focus ring on the scrolling table). A separate test asserts they
 * are still there, so it turns red once they are fixed.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';
import type { Page } from '@playwright/test';

const PENDING_VISUAL_GATE = ['color-contrast', 'nested-interactive', 'scrollable-region-focusable'];

async function blocking(page: Page, only?: string[]): Promise<string[]> {
  // Let the entrance animations finish: a half-faded element reads as low contrast
  await page.waitForTimeout(1_500);
  const axe = new AxeBuilder({ page }).exclude('canvas');
  const { violations } = await (
    only ? axe.withRules(only) : axe.disableRules(PENDING_VISUAL_GATE)
  ).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} × ${v.nodes[0]?.target.join(' ')})`
    );
}

const MARKETS = [
  {
    path: '/dashboard/spot/BTC/USDT',
    tabs: ['assets', 'orders', 'orderhistory', 'balancehistory', 'journal'],
  },
  {
    path: '/dashboard/usdt/BTCUSDT',
    tabs: ['positions', 'closedpnl', 'orders', 'orderhistory', 'balancehistory', 'journal'],
  },
];

for (const { path, tabs } of MARKETS) {
  test(`[F11] axe: ${path} with each bottom tab has no serious or critical violation @a11y`, async ({
    page,
    seededUser,
  }) => {
    await signInAs(page, seededUser.email, seededUser.password);
    await page.goto(path);
    const found: string[] = [];
    for (const tab of tabs) {
      await at(page, 'account.tab', tab).click();
      for (const v of await blocking(page)) found.push(`[${tab}] ${v}`);
    }
    expect([...new Set(found)]).toEqual([]);
  });
}

test('[F11] axe: the settings modal has no serious or critical violation @a11y', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'nav.user-menu').click();
  await at(page, 'nav.settings').click();
  await expect(at(page, 'settings.close')).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});

test('[F11] axe: contrast, nested controls and scroll focus on the dashboard and in settings @a11y', async ({
  page,
  seededUser,
}) => {
  /** Which of the pending rules fire now (serious / critical only) */
  const firing = async (): Promise<string[]> => {
    await page.waitForTimeout(1_500);
    const { violations } = await new AxeBuilder({ page })
      .exclude('canvas')
      .withRules(PENDING_VISUAL_GATE)
      .analyze();
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id);
  };
  await signInAs(page, seededUser.email, seededUser.password);
  const fired = new Set<string>();
  await page.goto('/dashboard/usdt/BTCUSDT');
  for (const id of await firing()) fired.add(id);
  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'account.tab', 'assets').click();
  for (const id of await firing()) fired.add(id);
  await at(page, 'nav.user-menu').click();
  await at(page, 'nav.settings').click();
  for (const id of await firing()) fired.add(id);
  // Each finding waiting for the visual Q&A gate (top of this file) still fires. Per rule, so the
  // test goes red as soon as any one is fixed — then drop that rule from PENDING_VISUAL_GATE, which
  // puts it back into the blocking tests above (review #196). A broken setup fails the test too.
  for (const rule of PENDING_VISUAL_GATE) {
    expect(fired, `${rule} no longer fires: remove it from PENDING_VISUAL_GATE`).toContain(rule);
  }
});
