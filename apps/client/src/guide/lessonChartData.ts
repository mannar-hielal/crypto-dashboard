/**
 * The pure half of a lesson's mini chart (guide/LessonChart.tsx): turning a scene into a history
 * request, the server's candles into chart bars, and working out how much to show before and after
 * the learner answers. No React, no chart library, so the tests need neither.
 */

import type { ChartMarker, ChartScene } from './lessons';

export interface LessonBar {
  /** Candle open time, seconds (UTC) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** A YYYY-MM-DD date as UTC seconds */
export function daySeconds(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 1000;
}

/** The `end` for the history request: the newest candle's open time, in ms */
export function sceneEndMs(scene: ChartScene): number {
  return daySeconds(scene.end) * 1000;
}

/** The server's candles (ms timestamps, oldest first) as chart bars */
export function toBars(
  candles: { timestamp: number; open: number; high: number; low: number; close: number }[]
): LessonBar[] {
  return candles.map((c) => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

/** How many bars to show before the reveal: up to and including `freezeAt`, else all of them */
export function frozenCount(bars: LessonBar[], scene: ChartScene): number {
  if (!scene.freezeAt) return bars.length;
  const until = daySeconds(scene.freezeAt);
  const n = bars.filter((b) => b.time <= until).length;
  return n > 0 ? n : bars.length;
}

/** The markers that sit on a bar already shown */
export function markersUpTo(markers: ChartMarker[], lastShown: number | undefined): ChartMarker[] {
  if (lastShown === undefined) return [];
  return markers.filter((m) => daySeconds(m.date) <= lastShown);
}
