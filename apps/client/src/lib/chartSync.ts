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

// ── Pending sync targets ─────────────────────────────────────────────────────
// 🔐 lightweight-charts' setVisibleRange() doesn't move the chart at once: it queues the range and
// applies it on the chart's next animation frame. A live tick pushed to the follower pane before
// that frame (ChartPanel: getVisibleLogicalRange → setData/update → setVisibleLogicalRange) read
// the not-yet-applied OLD range and queued it again, last one winning — the follower snapped back
// to its pre-zoom range and stayed there, since its restore is a data push and never re-broadcasts.
// Headless WebKit on CI draws frames slowly enough that the 1 s feed tick landed inside that window
// in 4 runs out of 4 (10.4.6); any browser hits it when a tick and a sync share a frame. The sync therefore records the range it queued until the frame has applied
// it, and the pane's data push restores that range instead of the stale one it reads back.
export interface SyncedTimeRange {
  from: unknown;
  to: unknown;
}

const pendingSyncRanges = new Map<number, SyncedTimeRange>();

export function setPendingSyncRange(paneIndex: number, range: SyncedTimeRange): void {
  pendingSyncRanges.set(paneIndex, range);
}

/** The range the sync queued on this pane that its chart hasn't applied yet, if any */
export function pendingSyncRange(paneIndex: number): SyncedTimeRange | undefined {
  return pendingSyncRanges.get(paneIndex);
}

/**
 * Forget the pane's pending range once its frame has applied it. Only that exact range: a newer
 * one queued in the meantime must outlive the older range's frame.
 */
export function clearPendingSyncRange(paneIndex: number, range?: SyncedTimeRange): void {
  if (range === undefined || pendingSyncRanges.get(paneIndex) === range) {
    pendingSyncRanges.delete(paneIndex);
  }
}

/**
 * Queue `range` on a follower pane through `apply` (its chart's setVisibleRange) and keep it as the
 * pane's pending range until `nextFrame` — requested after `apply`, so it runs after the chart's own
 * frame that applies the range.
 */
export function queueSyncedRange(
  paneIndex: number,
  range: SyncedTimeRange,
  apply: (range: SyncedTimeRange) => void,
  nextFrame: (cb: () => void) => unknown
): void {
  apply(range); // first: a range the chart refused (throws) is never left pending
  setPendingSyncRange(paneIndex, range);
  nextFrame(() => clearPendingSyncRange(paneIndex, range));
}
