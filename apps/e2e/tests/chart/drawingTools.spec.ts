/**
 * Drawing tools on /chart (docs/TRADING_TEST_PLAN.md section 10.7): the forked
 * lightweight-charts-drawing library with our toolbar, Eraser and storage.
 */

import { expect, test } from '../../fixtures';
import { at } from '../../helpers';
import type { Page } from '@playwright/test';

/** Saved drawings for the chart's symbol (lib/drawingManager.ts persists them per symbol) */
const savedDrawings = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('cd-drawings-v2-BTCUSDT');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });

const candleCount = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __cdCharts?: { times: () => number[] }[] }).__cdCharts?.[0];
    return c ? c.times().length : 0;
  });

async function pickTool(page: Page, group: string, tool: string) {
  await at(page, 'toolbar.tool', group).click({ button: 'right' });
  await at(page, 'toolbar.subtool', tool).click();
}

test('[10.7.2] the Eraser removes the drawing it clicks @full', async ({ page }) => {
  await page.goto('/chart');
  await expect.poll(() => candleCount(page)).toBeGreaterThan(10);
  const chart = (await at(page, 'pane.chart', '0').boundingBox())!;
  const x = chart.x + chart.width * 0.4;
  const y = chart.y + chart.height * 0.3;

  await pickTool(page, 'trend-lines', 'horizontal-line');
  await page.mouse.click(x, y);
  await expect.poll(() => savedDrawings(page)).toBe(1);

  await pickTool(page, 'bin', 'eraser');
  await page.mouse.click(chart.x + chart.width * 0.6, y);
  await expect.poll(() => savedDrawings(page)).toBe(0);
});
