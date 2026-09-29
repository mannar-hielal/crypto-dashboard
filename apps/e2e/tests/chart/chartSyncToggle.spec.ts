/**
 * Switching time sync on snaps the other panes to the active pane's range (row 10.4.7), read through
 * the e2e-only chart probe (`window.__cdCharts`, apps/client/src/lib/e2eProbe.ts). A pane the user
 * zoomed by hand is left alone by design, so only the active pane is zoomed here. Read-only.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';

type Range = { from: number; to: number } | null;

/** The one probe method used here (a local cast: chartSync.spec declares the global) */
type WithProbe = { __cdCharts?: ({ range: () => Range } | undefined)[] };

test('[10.4.7] switching time sync on snaps the other pane to the active pane’s range @full', async ({
  page,
  seededUser,
}) => {
  const range = (pane: number) =>
    page.evaluate((p) => (window as unknown as WithProbe).__cdCharts?.[p]?.range() ?? null, pane);

  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'layout.picker').click();
  await at(page, 'layout.option', '2h').click();
  if ((await at(page, 'layout.sync', 'timeRange').count()) === 0)
    await at(page, 'layout.picker').click();
  await at(page, 'layout.sync', 'timeRange').click(); // off
  // The open picker lays a transparent overlay over the page: a click on it closes the picker
  await page.mouse.click(2, 450);
  await expect.poll(() => range(1)).not.toBeNull();

  // Sync off: zoom the active pane 0 only — pane 1 keeps its own range
  const box = (await at(page, 'pane.chart', '0').boundingBox())!;
  await at(page, 'pane.chart', '0').click();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -800);
  await expect
    .poll(async () => JSON.stringify(await range(0)))
    .not.toBe(JSON.stringify(await range(1)));

  // Sync on: pane 1 snaps to pane 0 at once
  await at(page, 'layout.picker').click();
  await at(page, 'layout.sync', 'timeRange').click(); // on
  await page.mouse.click(2, 450);
  const r0 = await range(0);
  await expect.poll(() => range(1)).toEqual(r0);
});
