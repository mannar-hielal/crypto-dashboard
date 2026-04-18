/**
 * MultiChartArea
 *
 * Renders 1–4 chart panes in a CSS grid matching the selected LayoutId.
 * Each pane has a PaneHeader + ChartPanel.
 * Clicking a pane makes it the active pane (purple border + SymbolBar focus).
 *
 * Cross-pane sync:
 *   crosshair — when the crosshair moves in any pane, both axes are mirrored
 *               onto all other panes.
 *               X (vertical line): param.time is forwarded directly.
 *               Y (horizontal line): otherSeries.coordinateToPrice(param.point.y)
 *               maps the source cursor's Y pixel to the equivalent price on the
 *               follower chart's price scale, so the horizontal line lands at
 *               the same relative height on both charts regardless of the
 *               symbols' different price scales. Falls back to bar.close when
 *               the cursor is in the MACD sub-pane (coordinateToPrice → null).
 *               Uses `param.sourceEvent` to distinguish real mouse events from
 *               programmatic setCrosshairPosition echoes (v5 API guarantee:
 *               sourceEvent is undefined on programmatic calls), eliminating
 *               the circular-loop problem without relying on timing.
 *   timeRange — when the visible range changes in the master pane, all
 *               follower panes are scrolled to match.
 *               Uses an `isSyncingTimeRange` guard ref (no sourceEvent
 *               equivalent on subscribeVisibleTimeRangeChange).
 *               Snap-on-enable: when timeRange transitions OFF → ON, all
 *               follower panes are immediately snapped to the active pane's
 *               current visible range (active pane wins — same precedence
 *               rule as symbol/interval sync).
 */

import { useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useLayoutStore, LAYOUT_PANE_COUNT, LAYOUT_GRID_CLASS } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaneHeader } from '@/components/dashboard/PaneHeader';
import { color } from '@/lib/tokens';

export function MultiChartArea() {
  const layout = useLayoutStore((s) => s.layout);
  const activePane = useLayoutStore((s) => s.activePane);
  const syncOptions = useLayoutStore((s) => s.syncOptions);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const panes = useLayoutStore((s) => s.panes);

  const paneCount = LAYOUT_PANE_COUNT[layout];
  const gridClass = LAYOUT_GRID_CLASS[layout];

  // ── Chart instance refs ─────────────────────────────────────────────────
  const chartRefs = useRef<(IChartApi | null)[]>([null, null, null, null]);
  // Candlestick series refs — required for setCrosshairPosition (v5 API)
  const seriesRefs = useRef<(ISeriesApi<'Candlestick'> | null)[]>([null, null, null, null]);

  // Guard flag for time-range sync circular loop prevention.
  // Crosshair sync does NOT need a guard — it uses param.sourceEvent instead
  // (only defined on real mouse events, undefined on programmatic calls).
  const isSyncingTimeRange = useRef(false);

  // Keep sync options and pane count in refs so event handlers always read
  // the latest value without needing to re-register chart subscriptions
  const syncRef = useRef(syncOptions);
  const paneCountRef = useRef(paneCount);
  // Track previous timeRange flag so we can detect OFF → ON transitions
  const prevTimeRangeSyncRef = useRef(syncOptions.timeRange);

  useEffect(() => {
    syncRef.current = syncOptions;
  });
  useEffect(() => {
    paneCountRef.current = paneCount;
  });

  // ── Snap-on-enable: timeRange ───────────────────────────────────────────
  // When timeRange sync transitions OFF → ON, immediately snap all follower
  // panes to the active pane's current visible range. Active pane wins —
  // same precedence as symbol/interval sync.
  useEffect(() => {
    const wasOn = prevTimeRangeSyncRef.current;
    prevTimeRangeSyncRef.current = syncOptions.timeRange;

    if (!syncOptions.timeRange || wasOn) return; // only act on OFF → ON

    const sourceChart = chartRefs.current[activePane];
    if (!sourceChart) return;

    const range = sourceChart.timeScale().getVisibleRange();
    if (!range) return;

    isSyncingTimeRange.current = true;
    for (let i = 0; i < paneCount; i++) {
      if (i === activePane) continue;
      const other = chartRefs.current[i];
      if (!other) continue;
      try {
        other.timeScale().setVisibleRange(range);
      } catch {
        // Ignore — follower may not have loaded data yet
      }
    }
    isSyncingTimeRange.current = false;
  }, [syncOptions.timeRange, activePane, paneCount]);

  // ── Called by ChartPanel when its chart instance is ready ───────────────
  const handleChartReady = useCallback(
    (paneIndex: number, chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
      chartRefs.current[paneIndex] = chart;
      seriesRefs.current[paneIndex] = series;

      // ── Crosshair sync ────────────────────────────────────────────────
      chart.subscribeCrosshairMove((param) => {
        if (!syncRef.current.crosshair) return;
        // sourceEvent is only defined for real pointer events; programmatic
        // setCrosshairPosition / clearCrosshairPosition calls have it undefined.
        // Skipping those calls is what breaks the circular-echo loop.
        if (!param.sourceEvent) return;

        for (let i = 0; i < paneCountRef.current; i++) {
          if (i === paneIndex) continue;
          const other = chartRefs.current[i];
          const otherSeries = seriesRefs.current[i];
          if (!other || !otherSeries) continue;

          try {
            if (!param.point || !param.time) {
              // Cursor left the source chart — hide crosshair on followers
              other.clearCrosshairPosition();
            } else {
              const followerStore = paneStores[i as 0 | 1 | 2 | 3].getState();
              const followerLatest = followerStore.latestPrice;

              // Guard: skip if the follower hasn't loaded data yet. Calling
              // setCrosshairPosition on an empty/uninitialized chart can lock
              // its Y-axis to a garbage default range, hiding candles after
              // data arrives.
              if (followerLatest === null) continue;

              // Map the source cursor's Y pixel coordinate to the equivalent
              // price on the follower chart's price scale, so the horizontal
              // crosshair line lands at the same relative height on both charts.
              let price: number | null = otherSeries.coordinateToPrice(param.point.y);

              // Sanity-check: if coordinateToPrice returns a price more than
              // 50% away from the follower's actual latest price, the chart's
              // coordinate system is stale (e.g. pane was just switched from
              // ETH at ~2 400 to BTC at ~71 000 — the scale hasn't updated
              // yet). Discard the stale value to break the feedback loop that
              // would otherwise keep the chart locked at the old symbol's range.
              if (price !== null && (price < followerLatest * 0.5 || price > followerLatest * 2)) {
                price = null;
              }

              // Fallback: use the bar's close price at this timestamp when
              // coordinateToPrice is null (cursor in MACD sub-pane) or stale.
              if (price === null) {
                const timeSecs = param.time as number;
                const bar = followerStore.bars.find(
                  (b) => Math.floor(b.timestamp / 1000) === timeSecs
                );
                price = bar?.close ?? followerLatest;
              }

              other.setCrosshairPosition(price, param.time, otherSeries);
            }
          } catch {
            // Ignore — follower chart may not have data for this time yet
          }
        }
      });

      // ── Time range sync ───────────────────────────────────────────────
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (!syncRef.current.timeRange) return;
        if (isSyncingTimeRange.current) return;
        if (!range) return;

        isSyncingTimeRange.current = true;

        for (let i = 0; i < paneCountRef.current; i++) {
          if (i === paneIndex) continue;
          const other = chartRefs.current[i];
          if (!other) continue;

          try {
            other.timeScale().setVisibleRange(range);
          } catch {
            // Ignore — follower may not have loaded data yet
          }
        }

        isSyncingTimeRange.current = false;
      });
    },
    [] // stable — reads everything via refs
  );

  const handleChartDestroy = useCallback((paneIndex: number) => {
    chartRefs.current[paneIndex] = null;
    seriesRefs.current[paneIndex] = null;
  }, []);

  return (
    <div className={`grid h-full w-full ${gridClass}`}>
      {(Array.from({ length: paneCount }) as undefined[]).map((_, i) => {
        const paneIndex = i as 0 | 1 | 2 | 3;
        const isActive = activePane === paneIndex;

        return (
          <div
            key={paneIndex}
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
            style={{
              borderRight: i % 2 === 0 && paneCount > 1 && layout !== '2v' ? 'none' : undefined,
            }}
          >
            {/* Per-pane header — only visible in multi-pane mode */}
            {paneCount > 1 && (
              <PaneHeader
                paneIndex={paneIndex}
                isActive={isActive}
                onActivate={() => setActivePane(paneIndex)}
              />
            )}

            {/* Chart area */}
            <div
              className="relative flex-1 overflow-hidden"
              onClick={() => setActivePane(paneIndex)}
            >
              <ChartPanel
                paneIndex={paneIndex}
                interval={panes[paneIndex].interval}
                onChartReady={(chart, series) => handleChartReady(paneIndex, chart, series)}
                onChartDestroy={() => handleChartDestroy(paneIndex)}
              />

              {/* Active pane highlight border */}
              {isActive && paneCount > 1 && (
                <motion.div
                  key={`border-${paneIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0"
                  style={{
                    border: `1.5px solid ${color.purpleDark}60`,
                    boxShadow: `inset 0 0 0 1px ${color.purpleDark}20`,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
