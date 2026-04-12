/**
 * MultiChartArea
 *
 * Renders 1–4 chart panes in a CSS grid matching the selected LayoutId.
 * Each pane has a PaneHeader + ChartPanel.
 * Clicking a pane makes it the active pane (purple border + SymbolBar focus).
 *
 * Cross-pane sync:
 *   crosshair — when the crosshair moves in any pane, its time position is
 *               mirrored onto all other panes (vertical line only).
 *               Uses `param.sourceEvent` to distinguish real mouse events from
 *               programmatic setCrosshairPosition echoes (v5 API guarantee:
 *               sourceEvent is undefined on programmatic calls), eliminating
 *               the circular-loop problem without relying on timing.
 *   timeRange — when the visible range changes in the master pane, all
 *               follower panes are scrolled to match.
 *               Uses an `isSyncingTimeRange` guard ref (no sourceEvent
 *               equivalent on subscribeVisibleTimeRangeChange).
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

  useEffect(() => {
    syncRef.current = syncOptions;
  });
  useEffect(() => {
    paneCountRef.current = paneCount;
  });

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
              // Look up the follower's own close price at this timestamp so
              // the horizontal crosshair line lands on a meaningful level.
              // Fallback to latestPrice when the follower has no bar yet.
              const timeSecs = param.time as number;
              const otherBars = paneStores[i as 0 | 1 | 2 | 3].getState().bars;
              const bar = otherBars.find((b) => Math.floor(b.timestamp / 1000) === timeSecs);
              const price = bar?.close ?? paneStores[i as 0 | 1 | 2 | 3].getState().latestPrice;
              if (price !== null && price !== undefined) {
                other.setCrosshairPosition(price, param.time, otherSeries);
              }
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
