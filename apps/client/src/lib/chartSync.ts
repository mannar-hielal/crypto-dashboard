/**
 * Rules for multi-pane time-range sync (used by MultiChartArea). Pure
 * functions, so the regression cases below stay unit-testable.
 */

/**
 * 🔐 Time-range sync is limited to panes on the same interval. Copying a 1m/30m
 * pane's few-hour window onto a 4h/1D/1W/1M pane left it showing zero or one
 * candle stretched across the whole pane — a single giant "tall candle".
 */
export function isTimeSyncPeer(
  panes: readonly ({ interval: string } | undefined)[],
  source: number,
  other: number
): boolean {
  const a = panes[source]?.interval;
  return a !== undefined && a === panes[other]?.interval;
}

/**
 * 🔐 Only a pane that is showing its full, loaded history may drive time-range
 * sync, and only with a range that actually overlaps its candles.
 *
 * Right after a pane mounts (layout change) or switches symbol/interval it
 * briefly shows either the previous symbol's candles or the WS cold-aggregator
 * snapshot — a partial history whose length grows with server uptime (2 bars
 * on a fresh server, dozens after an hour, so no bar-count threshold works).
 * Its visible range is then a few minutes wide, or a single instant, or wholly
 * in the empty future padding. Broadcasting that — plus the async echo it
 * triggers, which lands after MultiChartArea's isSyncingTimeRange guard has
 * reset — zoomed every peer, including fully-loaded ones, into a handful of
 * giant candles, permanently.
 *
 * `history.loaded` is the pane store's historyLoaded flag (REST history for
 * the current symbol/interval succeeded) and `history.bars` its bar count.
 * `data` is the chart series' own data: the store updates before the chart
 * receives it, so the chart must also have caught up with the loaded history.
 */
export function canDriveTimeSync(
  data: readonly { time: unknown }[] | null | undefined,
  range: { from: unknown; to: unknown },
  history: { loaded: boolean; bars: number }
): boolean {
  if (!history.loaded) return false;
  // Chart not yet caught up (small slack for a live bar landing mid-frame).
  if (!data || data.length < 2 || data.length < history.bars - 2) return false;
  const from = range.from as number;
  const to = range.to as number;
  if (from >= to) return false;
  const first = data[0].time as number;
  const last = data[data.length - 1].time as number;
  return from < last && to > first;
}

// ── Data-push suppression ────────────────────────────────────────────────────
// 🔐 ChartPanel's data push (setData → padding → restore/anchor the view)
// makes lightweight-charts fire visible-range events SYNCHRONOUSLY, mid-push.
// When a pane's REST history replaces a few-bar WS snapshot, the event fired
// by setData() carries the transitional range left over from the snapshot
// view (~16 bars wide) — and by then the pane already passes
// canDriveTimeSync (history loaded, chart caught up). Broadcasting it, and the
// echoes it triggers, overwrote the pane's own anchor before it was ever
// painted and zoomed every peer into a few giant candles. Ranges are only
// broadcast once the push has finished and the view is final.
const panesPushingData = new Set<number>();

export function runPaneDataPush(paneIndex: number, push: () => void): void {
  panesPushingData.add(paneIndex);
  try {
    push();
  } finally {
    panesPushingData.delete(paneIndex);
  }
}

export function isPanePushingData(paneIndex: number): boolean {
  return panesPushingData.has(paneIndex);
}
