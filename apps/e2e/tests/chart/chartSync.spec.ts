/**
 * Chart sync across panes and history meeting the live stream (SC-10.4-3, rows 10.4.4–10.4.6;
 * SC-12.1-2), read through the e2e-only chart probe (`window.__cdCharts`, apps/client/src/lib/
 * e2eProbe.ts): the canvas itself can't be queried. Read-only: no prices moved.
 */

import { expect, test } from '../../fixtures';
import { at, signInAs } from '../../helpers';
import type { Page } from '@playwright/test';

// The probe's shape (apps/client/src/lib/e2eProbe.ts; that file needs Vite's types to compile)
declare global {
  interface Window {
    __cdCharts?: (
      | {
          range: () => unknown;
          crosshairTime: () => unknown;
          times: () => unknown;
          clears: () => unknown;
        }
      | undefined
    )[];
  }
}

type Probe = 'range' | 'crosshairTime' | 'times' | 'clears';
const probe = <T>(page: Page, pane: number, what: Probe) =>
  page.evaluate(
    ([p, w]) => {
      const c = window.__cdCharts?.[p as number];
      return c ? (c[w as Probe]() as unknown) : undefined;
    },
    [pane, what] as const
  ) as Promise<T>;

async function twoPanes(page: Page) {
  await page.goto('/dashboard/spot/BTC/USDT');
  await at(page, 'layout.picker').click();
  await at(page, 'layout.option', '2h').click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() => probe<number[]>(page, 1, 'times').then((t) => t?.length ?? 0))
    .toBeGreaterThan(10);
  await expect
    .poll(() => probe<number[]>(page, 0, 'times').then((t) => t?.length ?? 0))
    .toBeGreaterThan(10);
}

test('[10.4.4][10.4.5] the crosshair on one pane shows on the other at the same time, and clears with it @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await twoPanes(page);
  const box = (await at(page, 'pane.chart', '0').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);

  await expect.poll(() => probe<number | null>(page, 0, 'crosshairTime')).not.toBeNull();
  const t0 = await probe<number>(page, 0, 'crosshairTime');
  await expect.poll(() => probe<number | null>(page, 1, 'crosshairTime')).toBe(t0);

  // Out of the chart: both clear
  await page.mouse.move(box.x + box.width + 400, box.y - 40);
  await expect.poll(() => probe<number | null>(page, 0, 'crosshairTime')).toBeNull();
  await expect.poll(() => probe<number | null>(page, 1, 'crosshairTime')).toBeNull();
});

test('[10.4.6] zooming one pane zooms the other to the same time range @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await twoPanes(page);
  const box = (await at(page, 'pane.chart', '0').boundingBox())!;
  const before = await probe<{ from: number; to: number }>(page, 0, 'range');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -600);

  await expect
    .poll(async () => (await probe<{ from: number; to: number }>(page, 0, 'range'))?.from)
    .not.toBe(before.from);
  const r0 = await probe<{ from: number; to: number }>(page, 0, 'range');
  await expect.poll(() => probe<{ from: number; to: number }>(page, 1, 'range')).toEqual(r0);
});

test('[12.1.2] the history and the live candles meet with no gap and no duplicate @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await page.goto('/dashboard/spot/BTC/USDT');
  await expect
    .poll(() => probe<number[]>(page, 0, 'times').then((t) => t?.length ?? 0))
    .toBeGreaterThan(10);
  const times = await probe<number[]>(page, 0, 'times');
  const steps = times.slice(1).map((t, i) => t - (times.at(i) ?? t));
  // 1m candles: every step exactly one minute, the live one included
  expect(steps.filter((s) => s !== 60)).toEqual([]);
});

test('[10.4.4] with panes on different intervals, the pane under the mouse keeps its crosshair @full', async ({
  page,
  seededUser,
}) => {
  await signInAs(page, seededUser.email, seededUser.password);
  await twoPanes(page);
  // Pane 1 on 15m: most of pane 0's 1m times have no candle there, so the follower's crosshair
  // lands off its data — its echo must not clear the pane the mouse is over (review #195)
  await at(page, 'pane.header.interval-picker').nth(1).click();
  await at(page, 'pane.header.interval', '15m').first().click();
  await expect
    .poll(() => probe<number[]>(page, 1, 'times').then((t) => t?.length ?? 0))
    .toBeGreaterThan(5);

  const box = (await at(page, 'pane.chart', '0').boundingBox())!;
  // Into pane 0 first: leaving pane 1 (where the interval picker was) rightly clears the others once
  await page.mouse.move(box.x + box.width / 14, box.y + box.height * 0.5);
  const before = await probe<number>(page, 0, 'clears');
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + (box.width * i) / 14, box.y + box.height * 0.5);
  }
  // The sync never cleared the pane under the mouse
  expect(await probe<number>(page, 0, 'clears')).toBe(before);
  // …and pane 1 followed the whole time
  expect(await probe<number | null>(page, 1, 'crosshairTime')).not.toBeNull();
});
