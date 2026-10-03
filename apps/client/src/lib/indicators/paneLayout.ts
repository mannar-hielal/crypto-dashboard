/**
 * Sizing and ordering the indicator panes (owner, 2026-10-03: one pane per sub-pane indicator
 * instance, as on TradingView and Bybit; equal indicator panes after the first review).
 * lightweight-charts sizes panes by stretch factor — a pane's height is its factor's share of the
 * sum — so the heights below are applied as factors. ChartPanel re-applies them to every pane on
 * each add, remove, hide or show; a separator drag in between is kept until the next one.
 */

/** An indicator pane aims for this share of the chart height (owner's decision A, 2026-10-03) */
export const SUB_PANE_SHARE = 0.2;

/** …and at least this many pixels, while the price pane can spare them (owner, 2026-10-03) */
export const SUB_PANE_MIN_HEIGHT_PX = 60;

/** The price pane always keeps at least this share of the chart height (owner, 2026-10-03) */
export const MAIN_PANE_MIN_SHARE = 0.5;

export interface PaneHeights {
  /** The price pane's height, px */
  main: number;
  /** Each indicator pane's height, px — all equal */
  sub: number;
}

/**
 * Heights for the price pane and `subPaneCount` equal indicator panes sharing `chartHeightPx`:
 *   1. each indicator pane aims for SUB_PANE_SHARE of the chart, and at least 60 px;
 *   2. when that would leave the price pane under half the chart, the indicator panes shrink
 *      instead — the price pane gives up its extra room, but only down to half;
 *   3. past that (many panes, a small 4-chart cell, a phone) the indicator panes split the other
 *      half equally even below 60 px. Accepted by the owner (2026-10-03): the price pane never
 *      drops under half the chart.
 */
export function paneHeights(chartHeightPx: number, subPaneCount: number): PaneHeights {
  const total = Math.max(0, chartHeightPx);
  if (subPaneCount <= 0) return { main: total, sub: 0 };
  const target = Math.max(SUB_PANE_SHARE * total, SUB_PANE_MIN_HEIGHT_PX);
  const room = ((1 - MAIN_PANE_MIN_SHARE) * total) / subPaneCount;
  const sub = Math.min(target, room);
  return { main: total - sub * subPaneCount, sub };
}

/**
 * Where an instance's pane goes so pane order = the order the indicators were added: right after
 * the price pane (index 0) and the panes of the sub-pane instances before it that are shown.
 */
export function subPaneTargetIndex(
  orderedSubPaneIds: readonly string[],
  instanceId: string,
  hasPane: (id: string) => boolean
): number {
  let index = 1;
  for (const id of orderedSubPaneIds) {
    if (id === instanceId) break;
    if (hasPane(id)) index++;
  }
  return index;
}
