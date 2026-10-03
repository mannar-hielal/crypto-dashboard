/**
 * Sizing a new indicator pane (owner, 2026-10-03: one pane per sub-pane indicator instance, as on
 * TradingView and Bybit). lightweight-charts sizes panes by stretch factor: a pane's height is its
 * factor's share of the sum. A separator drag rewrites the factors, so a new pane is sized
 * against whatever the user left, without resetting it.
 */

/** A new indicator pane starts at about this share of the chart height (owner, 2026-10-03) */
export const SUB_PANE_SHARE = 0.2;

/** …and never below this many pixels (owner, 2026-10-03) */
export const SUB_PANE_MIN_HEIGHT_PX = 60;

/**
 * Upper bound on a new pane's share when the 60 px minimum would ask for more (a short chart, e.g.
 * a 4-chart layout on a laptop): at most half, so the price pane keeps the larger share — the
 * owner's "the main pane keeps the larger share".
 */
const MAX_NEW_PANE_SHARE = 0.5;

/**
 * The stretch factor that gives a new pane SUB_PANE_SHARE of the chart (or 60 px, if that's more),
 * given the sum of the existing panes' factors and the chart's height in px.
 */
export function subPaneStretchFactor(existingFactorsSum: number, chartHeightPx: number): number {
  const sum = existingFactorsSum > 0 ? existingFactorsSum : 1;
  const minShare = chartHeightPx > 0 ? SUB_PANE_MIN_HEIGHT_PX / chartHeightPx : 0;
  const share = Math.min(MAX_NEW_PANE_SHARE, Math.max(SUB_PANE_SHARE, minShare));
  return (sum * share) / (1 - share);
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
