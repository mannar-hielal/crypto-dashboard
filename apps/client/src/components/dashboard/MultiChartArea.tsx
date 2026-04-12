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
 *   timeRange — when the visible range changes in the master pane, all
 *               follower panes are scrolled to match.
 *
 * Both sync channels use a guard ref to break circular event loops.
 */

import { useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { IChartApi } from 'lightweight-charts';
import { useLayoutStore, LAYOUT_PANE_COUNT, LAYOUT_GRID_CLASS } from '@/store/layoutStore';
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

  // Guard flags to prevent circular sync loops
  const isSyncingCrosshair = useRef(false);
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
    (paneIndex: number, chart: IChartApi) => {
      chartRefs.current[paneIndex] = chart;

      // ── Crosshair sync ────────────────────────────────────────────────
      chart.subscribeCrosshairMove((param) => {
        if (!syncRef.current.crosshair) return;
        if (isSyncingCrosshair.current) return;
        if (!param.point || !param.time) return;

        isSyncingCrosshair.current = true;
        const time = param.time as number;

        for (let i = 0; i < paneCountRef.current; i++) {
          if (i === paneIndex) continue;
          const other = chartRefs.current[i];
          if (!other) continue;

          try {
            // Convert the master pane's time to an x-coordinate in the follower
            const x = other.timeScale().timeToCoordinate(time as never);
            if (x !== null) {
              // Use null as y to only draw the vertical time crosshair line
              (
                other as IChartApi & { setCrossHairXY: (x: number, y: number, v: boolean) => void }
              ).setCrossHairXY(x, param.point.y, true);
            }
          } catch {
            // Ignore — follower chart may not have data for this time yet
          }
        }

        isSyncingCrosshair.current = false;
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
                onChartReady={(chart) => handleChartReady(paneIndex, chart)}
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
