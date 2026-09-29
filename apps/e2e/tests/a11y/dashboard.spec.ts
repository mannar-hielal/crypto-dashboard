/**
 * Accessibility of the dashboard (F11): axe on Spot and USDT Perpetual with each bottom tab open,
 * and on the settings modal — no serious or critical violation. The chart canvases are excluded
 * (a canvas has no accessible content to check).
 *
 * Every serious / critical rule blocks, contrast included: the three held back for the visual Q&A
 * gate (contrast, the toolbar's nested buttons, the scroll regions) were fixed on 2026-09-29.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';
import type { Page } from '@playwright/test';

async function blocking(page: Page): Promise<string[]> {
  // Let the entrance animations finish: a half-faded element reads as low contrast
  await page.waitForTimeout(1_500);
  const { violations } = await new AxeBuilder({ page }).exclude('canvas').analyze();
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
