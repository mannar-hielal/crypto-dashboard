/**
 * Visual baselines (docs/TEST_IMPLEMENTATION_PLAN.md F10): element screenshots of the order forms,
 * the leverage and adjust-margin dialogs, the account summary bar, the Positions rows with their
 * pair icons (Section 5) and a Closed P&L row. The `visual` project runs them locally only, alone
 * and last, on fixed prices (the fake feed only pushes on a control call) — see playwright.config.ts
 * for why not in CI. A baseline changes only through the visual Q&A gate (design.md):
 * `pnpm --filter @crypto-dashboard/e2e test:visual --update-snapshots` after the owner approved it.
 */

import { expect, test } from '../../fixtures';
import { at, placeOrder, setMarginMode, signInAs } from '../../helpers';
import type { Locator, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Exact (no pixel tolerance): the baselines are local, one machine, and a changed character is a
// few pixels — a 1 % tolerance let "$5000.00" → "$5,000.00" pass unseen
const shot = { animations: 'disabled', caret: 'hide' } as const;
/** The seeded username changes every run; the order form overlaps the right end of wide rows */
const masks = (page: Page) => [at(page, 'nav.user-menu'), orderForm(page)];
function orderForm(page: Page): Locator {
  return page.locator('aside').filter({ has: at(page, 'trade.submit') });
}
/** A dialog 3 px inside its box: its rounded corners show whatever is behind, which changes */
async function dialogShot(page: Page, name: string) {
  const box = (await page.getByRole('dialog').boundingBox())!;
  const clip = { x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.height - 6 };
  await expect(page).toHaveScreenshot(name, { ...shot, clip });
}
const summaryBar = (page: Page): Locator =>
  at(page, 'account.summary.balance').locator(
    'xpath=ancestor::div[contains(@class, "overflow-x-auto")][1]'
  );

test.beforeEach(async ({ feed }) => {
  await feed.quote('spot', 'BTCUSDT', { bid: 49_999.9, ask: 50_000, last: 50_000 });
  await feed.quote('linear', 'BTCUSDT', { bid: 49_999.9, ask: 50_000, last: 50_000, mark: 50_000 });
  await feed.quote('linear', 'ETHUSDT', { bid: 2_999.99, ask: 3_000, last: 3_000, mark: 3_000 });
});

test('[F10] Spot order form, Buy @visual', async ({ page, seededUser }) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await expect(at(page, 'trade.side.buy')).toContainText('50,000');
  await expect(orderForm(page)).toHaveScreenshot('order-form-spot.png', {
    ...shot,
    mask: [at(page, 'nav.user-menu')],
  });
});

test('[F10] USDT Perpetual order form with TP / SL open @visual', async ({ page, seededUser }) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await setMarginMode(page, 'isolated', 10);
  await at(page, 'trade.amount-unit', 'coin').click();
  await at(page, 'trade.amount').fill('0.1');
  if ((await at(page, 'trade.tp.enable').count()) === 0) await page.getByText('Exits').click();
  await at(page, 'trade.tp.enable').click();
  await at(page, 'trade.tp.price').fill('52000');
  await at(page, 'trade.sl.enable').click();
  await at(page, 'trade.sl.price').fill('48000');
  await expect(orderForm(page)).toHaveScreenshot('order-form-perp-tpsl.png', {
    ...shot,
    mask: [at(page, 'nav.user-menu')],
  });
});

test('[F10] leverage and margin-mode modal @visual', async ({ page, seededUser }) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/BTCUSDT');
  await at(page, 'trade.leverage-chip').click();
  await dialogShot(page, 'leverage-modal.png');
});

test('[F10] positions with pair icons, the summary bar, adjust margin, a Closed P&L row @visual', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/usdt/ETHUSDT');
  await setMarginMode(page, 'isolated', 10);
  await placeOrder(page, { side: 'buy', type: 'market', amount: '1', unit: 'coin' });
  await page.goto('/dashboard/usdt/BTCUSDT');
  await placeOrder(page, { side: 'buy', type: 'market', amount: '0.1', unit: 'coin' });
  await at(page, 'account.tab', 'positions').click();
  await expect(at(page, 'positions.row')).toHaveCount(2);
  await expect(at(page, 'positions.row', 'linear:BTCUSDT')).toHaveScreenshot(
    'positions-row-btc.png',
    shot
  );
  await expect(at(page, 'positions.row', 'linear:ETHUSDT')).toHaveScreenshot(
    'positions-row-eth.png',
    shot
  );
  await expect(summaryBar(page)).toHaveScreenshot('account-summary.png', {
    ...shot,
    mask: masks(page),
  });

  await at(page, 'positions.row', 'linear:BTCUSDT').hover();
  await at(page, 'positions.row', 'linear:BTCUSDT')
    .locator('[data-guide="positions.row.adjust-margin"]')
    .click();
  await at(page, 'margin.amount').fill('500');
  await dialogShot(page, 'adjust-margin.png');
  await page.keyboard.press('Escape');
  if ((await page.getByRole('dialog').count()) > 0)
    await page.getByRole('button', { name: 'Cancel' }).click();

  await at(page, 'positions.row', 'linear:BTCUSDT')
    .locator('[data-guide="positions.row.close"]')
    .click();
  await at(page, 'account.tab', 'closedpnl').click();
  const row = at(page, 'closed-pnl.row').first();
  // The close time changes every run
  await expect(row).toHaveScreenshot('closed-pnl-row.png', {
    ...shot,
    mask: [row.locator('td').last()],
  });
});
