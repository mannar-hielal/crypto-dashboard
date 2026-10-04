/**
 * Indicator panes (rows 10.6.1–10.6.5, owner decisions A, H and J of 2026-10-03): one chart pane
 * per sub-pane indicator instance, its legend at the pane's top, kept across a reload, and no
 * drawing from an indicator pane. The pane count and positions come from the e2e-only chart probe
 * (`window.__cdCharts`, apps/client/src/lib/e2eProbe.ts). The public /chart page, signed out:
 * nothing is traded.
 */

import { expect, test } from '../../fixtures';
import { at } from '../../helpers';
import type { Page } from '@playwright/test';

// The probe members this spec reads (the full shape is declared in chartSync.spec.ts)
interface PaneProbe {
  paneCount: () => number;
  paneBoxes: () => { top: number; height: number }[];
}

const paneCount = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __cdCharts?: (PaneProbe | undefined)[] }).__cdCharts?.[0];
    return c ? c.paneCount() : 0;
  });

const paneBoxes = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __cdCharts?: (PaneProbe | undefined)[] }).__cdCharts?.[0];
    return c ? c.paneBoxes() : [];
  });

/** Saved drawings for the chart's symbol (lib/drawingManager.ts persists them per symbol) */
const savedDrawings = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('cd-drawings-v2-BTCUSDT');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });

async function addIndicator(page: Page, id: string) {
  await at(page, 'indicator.menu').click();
  await at(page, 'indicator.option', id).click();
}

async function openChart(page: Page) {
  await page.goto('/chart');
  await expect.poll(() => paneCount(page)).toBe(1);
}

test('[10.6.1][10.6.2][10.6.3][10.6.4] each Momentum / MACD gets its own pane; removing one drops its pane and legend; a reload keeps the rest @full', async ({
  page,
  browserName,
}) => {
  // Five panes and two reloads of the chart: 1.1 min on WebKit on CI on 2026-10-03 (6 s locally),
  // past the 60 s limit on release #237, both tries
  test.slow(browserName === 'webkit', 'five chart panes: WebKit on CI needs about a minute');
  await openChart(page);

  // 10.6.1 — two Momentums: two stacked panes below the price pane
  await addIndicator(page, 'momentum');
  await addIndicator(page, 'momentum');
  await expect.poll(() => paneCount(page)).toBe(3);
  await expect(at(page, 'indicator.pane-legend')).toHaveCount(2);
  await expect(at(page, 'indicator.pane-legend').first()).toContainText('Mom 10 close');

  // 10.6.2 — two MACDs: two more
  await addIndicator(page, 'macd');
  await addIndicator(page, 'macd');
  await expect.poll(() => paneCount(page)).toBe(5);
  await expect(at(page, 'indicator.pane-legend')).toHaveCount(4);
  await expect(at(page, 'indicator.pane-legend').nth(2)).toContainText(
    'MACD 12 26 close 9 EMA EMA'
  );

  // Each header sits at its own pane's top
  const boxes = await paneBoxes(page);
  for (let i = 0; i < 4; i++) {
    const header = await at(page, 'indicator.pane-legend').nth(i).boundingBox();
    expect(header).not.toBeNull();
    expect(Math.abs(header!.y - boxes[i + 1].top)).toBeLessThan(12);
  }

  // 10.6.3 — remove the first MACD from its legend
  const legend = at(page, 'indicator.pane-legend').nth(2);
  const key = (await legend.getAttribute('data-guide-key'))!;
  await legend.hover();
  await at(page, 'indicator.remove', key).click();
  await expect.poll(() => paneCount(page)).toBe(4);
  await expect(at(page, 'indicator.pane-legend', key)).toHaveCount(0);
  await expect(at(page, 'indicator.pane-legend')).toHaveCount(3);

  // 10.6.4 — a reload rebuilds the same panes
  await page.reload();
  await expect.poll(() => paneCount(page)).toBe(4);
  await expect(at(page, 'indicator.pane-legend')).toHaveCount(3);
});

test('[10.6.5] a drawing tool places nothing from a click in an indicator pane, and still draws in the price pane @full', async ({
  page,
}) => {
  await openChart(page);
  await addIndicator(page, 'momentum');
  await expect.poll(() => paneCount(page)).toBe(2);
  await expect.poll(async () => (await paneBoxes(page))[1]?.height ?? 0).toBeGreaterThan(40);

  const chart = (await at(page, 'pane.chart', '0').boundingBox())!;
  const [price, momentum] = await paneBoxes(page);
  const x1 = chart.x + chart.width * 0.3;
  const x2 = chart.x + chart.width * 0.5;

  // A trend line needs two clicks: both in Momentum's pane
  await at(page, 'toolbar.tool', 'trend-lines').click();
  const inMomentum = momentum.top + momentum.height / 2;
  await page.mouse.click(x1, inMomentum);
  await page.mouse.click(x2, inMomentum);
  // The save is debounced: give it longer than that before reading
  await page.waitForTimeout(1_000);
  expect(await savedDrawings(page)).toBe(0);

  // The same two clicks in the price pane draw it (the control for the check above)
  await at(page, 'toolbar.tool', 'trend-lines').click();
  await page.mouse.click(x1, price.top + price.height * 0.4);
  await page.mouse.click(x2, price.top + price.height * 0.6);
  await expect.poll(() => savedDrawings(page)).toBe(1);
});
