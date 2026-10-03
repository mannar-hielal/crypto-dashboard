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
 *               Only panes on the SAME interval are synced — see
 *               isTimeSyncPeer().
 */

import { useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DrawingManager } from 'lightweight-charts-drawing';
import { useLayoutStore, LAYOUT_PANE_COUNT, DEFAULT_PANE_SIZES } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import {
  canDriveTimeSync,
  clearPendingSyncRange,
  followerCrosshairPrice,
  isPanePushingData,
  isTimeSyncPeer,
  queueSyncedRange,
} from '@/lib/chartSync';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaneHeader } from '@/components/dashboard/PaneHeader';
import { color } from '@/lib/tokens';
import { guide } from '@/lib/guideAnchors';
import { exposeChartForE2e } from '@/lib/e2eProbe';

/** Inputs for canDriveTimeSync — read at event time, never a stale closure. */
function paneHistory(paneIndex: number) {
  const { historyLoaded, bars } = paneStores[paneIndex as 0 | 1 | 2 | 3].getState();
  return { loaded: historyLoaded, bars: bars.length };
}

// ─── ResizeSplitter ───────────────────────────────────────────────────────────

interface SplitterProps {
  axis: 'col' | 'row';
  /** 0–1 cumulative fraction where this splitter sits */
  position: number;
  splitterRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

function ResizeSplitter({ axis, position, splitterRef, onPointerDown }: SplitterProps) {
  const isCol = axis === 'col';
  return (
    <div
      ref={splitterRef}
      aria-hidden="true"
      className="absolute z-10 group"
      style={
        isCol
          ? {
              left: `calc(${position * 100}% - 6px)`,
              top: 0,
              width: 12,
              height: '100%',
              cursor: 'ew-resize',
              touchAction: 'none',
            }
          : {
              top: `calc(${position * 100}% - 6px)`,
              left: 0,
              height: 12,
              width: '100%',
              cursor: 'ns-resize',
              touchAction: 'none',
            }
      }
      onPointerDown={onPointerDown}
    >
      {/* Thin accent line — only visible on hover */}
      <div
        className="pointer-events-none absolute opacity-0 transition-opacity group-hover:opacity-100"
        style={
          isCol
            ? { left: 5, top: 0, width: 2, height: '100%', background: `${color.purpleDark}70` }
            : { top: 5, left: 0, height: 2, width: '100%', background: `${color.purpleDark}70` }
        }
      />
    </div>
  );
}

// ─── MultiChartArea ───────────────────────────────────────────────────────────

interface MultiChartAreaProps {
  onDrawingManagerReady?: (paneIndex: number, manager: DrawingManager) => void;
  onChartRefReady?: (paneIndex: number, chart: IChartApi) => void;
  activeToolType?: string | null;
  onToolChange?: (toolType: string | null) => void;
}

export function MultiChartArea({
  onDrawingManagerReady,
  onChartRefReady,
  activeToolType,
  onToolChange,
}: MultiChartAreaProps) {
  const layout = useLayoutStore((s) => s.layout);
  const activePane = useLayoutStore((s) => s.activePane);
  const syncOptions = useLayoutStore((s) => s.syncOptions);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  // Per-pane selectors — subscribing to the whole `panes` array re-renders all
  // 4 charts when any one pane changes (symbol/interval/indicator edits).
  const pane0 = useLayoutStore((s) => s.panes[0]);
  const pane1 = useLayoutStore((s) => s.panes[1]);
  const pane2 = useLayoutStore((s) => s.panes[2]);
  const pane3 = useLayoutStore((s) => s.panes[3]);
  const panes = [pane0, pane1, pane2, pane3];
  const paneSizes = useLayoutStore((s) => s.paneSizes);
  const setPaneSizes = useLayoutStore((s) => s.setPaneSizes);

  const paneCount = LAYOUT_PANE_COUNT[layout];
  const { colFracs, rowFracs } = paneSizes[layout] ?? DEFAULT_PANE_SIZES[layout];

  // ── Chart instance refs ─────────────────────────────────────────────────
  const chartRefs = useRef<(IChartApi | null)[]>([null, null, null, null]);
  const seriesRefs = useRef<(ISeriesApi<'Candlestick'> | null)[]>([null, null, null, null]);

  // ── Grid + splitter DOM refs (direct mutation during drag) ──────────────
  const gridRef = useRef<HTMLDivElement>(null);
  const colSplitterRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const rowSplitterRefs = useRef<(HTMLDivElement | null)[]>([null]);

  const isSyncingTimeRange = useRef(false);
  /** The pane the mouse is over (the last to send a crosshair move with a sourceEvent) */
  const leadPane = useRef<number | null>(null);
  const syncRef = useRef(syncOptions);
  const paneCountRef = useRef(paneCount);
  const prevTimeRangeSyncRef = useRef(syncOptions.timeRange);

  useEffect(() => {
    syncRef.current = syncOptions;
  });
  useEffect(() => {
    paneCountRef.current = paneCount;
  });

  // ── Snap-on-enable: timeRange ───────────────────────────────────────────
  useEffect(() => {
    const wasOn = prevTimeRangeSyncRef.current;
    prevTimeRangeSyncRef.current = syncOptions.timeRange;
    if (!syncOptions.timeRange || wasOn) return;

    const sourceChart = chartRefs.current[activePane];
    if (!sourceChart) return;
    const range = sourceChart.timeScale().getVisibleRange();
    if (
      !range ||
      !canDriveTimeSync(seriesRefs.current[activePane]?.data(), range, paneHistory(activePane))
    )
      return;

    isSyncingTimeRange.current = true;
    for (let i = 0; i < paneCount; i++) {
      if (i === activePane) continue;
      if (!isTimeSyncPeer(useLayoutStore.getState().panes, activePane, i)) continue;
      const other = chartRefs.current[i];
      if (!other) continue;
      // Don't override a pane the user has manually zoomed
      if (paneStores[i as 0 | 1 | 2 | 3].getState().userZoomed) continue;
      try {
        // Kept until the chart's next frame applies it, so a live tick can't undo it (chartSync.ts)
        queueSyncedRange(
          i,
          range,
          (r) => other.timeScale().setVisibleRange(r as typeof range),
          requestAnimationFrame
        );
      } catch {
        /* ignore */
      }
    }
    isSyncingTimeRange.current = false;
  }, [syncOptions.timeRange, activePane, paneCount]);

  // ── Called by ChartPanel when its chart instance is ready ───────────────
  const handleChartReady = useCallback(
    (paneIndex: number, chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
      chartRefs.current[paneIndex] = chart;
      seriesRefs.current[paneIndex] = series;
      onChartRefReady?.(paneIndex, chart);
      exposeChartForE2e(paneIndex, chart, series); // e2e builds only (VITE_E2E)

      chart.subscribeCrosshairMove((param) => {
        // Sync off: no lead either — a leave swallowed here must not leave a stale lead behind
        if (!syncRef.current.crosshair) {
          leadPane.current = null;
          return;
        }
        // The pane the mouse is in leads. An event with no sourceEvent is either the lead pane's
        // crosshair leaving (the mouse left it: the followers must clear too, 10.4.5) or a
        // follower echoing the programmatic set (no time when it has no candle there, e.g. another
        // interval) — which must never clear the pane under the mouse (review #195)
        if (param.sourceEvent) leadPane.current = paneIndex;
        else if (paneIndex !== leadPane.current || param.point) return;
        else leadPane.current = null;
        for (let i = 0; i < paneCountRef.current; i++) {
          if (i === paneIndex) continue;
          const other = chartRefs.current[i];
          const otherSeries = seriesRefs.current[i];
          if (!other || !otherSeries) continue;
          try {
            if (!param.point || !param.time) {
              other.clearCrosshairPosition();
            } else {
              const followerStore = paneStores[i as 0 | 1 | 2 | 3].getState();
              const followerLatest = followerStore.latestPrice;
              if (followerLatest === null) continue;
              const point = param.point;
              const timeSecs = param.time as number;
              const price = followerCrosshairPrice({
                sourcePaneIndex: param.paneIndex,
                mapY: () => otherSeries.coordinateToPrice(point.y),
                barClose: () =>
                  followerStore.bars.find((b) => Math.floor(b.timestamp / 1000) === timeSecs)
                    ?.close,
                followerLatest,
              });
              other.setCrosshairPosition(price, param.time, otherSeries);
            }
          } catch {
            /* ignore */
          }
        }
      });

      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (!syncRef.current.timeRange) return;
        if (isSyncingTimeRange.current) return;
        if (isPanePushingData(paneIndex)) return;
        if (
          !range ||
          !canDriveTimeSync(seriesRefs.current[paneIndex]?.data(), range, paneHistory(paneIndex))
        )
          return;
        isSyncingTimeRange.current = true;
        for (let i = 0; i < paneCountRef.current; i++) {
          if (i === paneIndex) continue;
          if (!isTimeSyncPeer(useLayoutStore.getState().panes, paneIndex, i)) continue;
          const other = chartRefs.current[i];
          if (!other) continue;
          // Don't override a pane the user has manually zoomed
          if (paneStores[i as 0 | 1 | 2 | 3].getState().userZoomed) continue;
          try {
            // Kept until the chart's next frame applies it, so a live tick can't undo it (chartSync.ts)
            queueSyncedRange(
              i,
              range,
              (r) => other.timeScale().setVisibleRange(r as typeof range),
              requestAnimationFrame
            );
          } catch {
            /* ignore */
          }
        }
        isSyncingTimeRange.current = false;
      });
    },
    // onChartRefReady is intentionally excluded — it's a stable callback setter that should
    // never trigger re-subscription of crosshair/timeRange handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleChartDestroy = useCallback((paneIndex: number) => {
    chartRefs.current[paneIndex] = null;
    seriesRefs.current[paneIndex] = null;
    // A destroyed pane can't lead (its index may map to another chart later)
    if (leadPane.current === paneIndex) leadPane.current = null;
    clearPendingSyncRange(paneIndex);
    exposeChartForE2e(paneIndex, null, null);
  }, []);

  // ── Splitter drag helpers ───────────────────────────────────────────────

  /** Rebuild cumulative splitter positions and push to DOM refs */
  function applyColFracsToDom(fracs: number[]) {
    if (gridRef.current) {
      gridRef.current.style.gridTemplateColumns = fracs.map((f) => `${f}fr`).join(' ');
    }
    let cum = 0;
    for (let k = 0; k < fracs.length - 1; k++) {
      cum += fracs[k];
      const el = colSplitterRefs.current[k];
      if (el) el.style.left = `calc(${cum * 100}% - 6px)`;
    }
  }

  function applyRowFracsToDom(fracs: number[]) {
    if (gridRef.current) {
      gridRef.current.style.gridTemplateRows = fracs.map((f) => `${f}fr`).join(' ');
    }
    let cum = 0;
    for (let k = 0; k < fracs.length - 1; k++) {
      cum += fracs[k];
      const el = rowSplitterRefs.current[k];
      if (el) el.style.top = `calc(${cum * 100}% - 6px)`;
    }
  }

  function handleColSplitterPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    splitterIdx: number
  ) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const containerW = gridRef.current?.clientWidth ?? 1;
    const startX = e.clientX;
    const startFracs = [...colFracs];
    const finalFracs = [...colFracs];

    const onMove = (ev: PointerEvent) => {
      const deltaFrac = (ev.clientX - startX) / containerW;
      const total = startFracs[splitterIdx] + startFracs[splitterIdx + 1];
      const newA = Math.max(0.1, Math.min(total - 0.1, startFracs[splitterIdx] + deltaFrac));
      const next = [...startFracs];
      next[splitterIdx] = newA;
      next[splitterIdx + 1] = total - newA;
      Object.assign(finalFracs, next);
      applyColFracsToDom(next);
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setPaneSizes(layout, { colFracs: [...finalFracs], rowFracs });
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  function handleRowSplitterPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    splitterIdx: number
  ) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const containerH = gridRef.current?.clientHeight ?? 1;
    const startY = e.clientY;
    const startFracs = [...rowFracs];
    const finalFracs = [...rowFracs];

    const onMove = (ev: PointerEvent) => {
      const deltaFrac = (ev.clientY - startY) / containerH;
      const total = startFracs[splitterIdx] + startFracs[splitterIdx + 1];
      const newA = Math.max(0.1, Math.min(total - 0.1, startFracs[splitterIdx] + deltaFrac));
      const next = [...startFracs];
      next[splitterIdx] = newA;
      next[splitterIdx + 1] = total - newA;
      Object.assign(finalFracs, next);
      applyRowFracsToDom(next);
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setPaneSizes(layout, { colFracs, rowFracs: [...finalFracs] });
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  // ── Computed grid template strings ─────────────────────────────────────
  const gridTemplateColumns = colFracs.map((f) => `${f}fr`).join(' ');
  const gridTemplateRows = rowFracs.map((f) => `${f}fr`).join(' ');

  // ── Splitter positions: cumulative fracs ────────────────────────────────
  const colSplitterPositions: number[] = [];
  {
    let cum = 0;
    for (let k = 0; k < colFracs.length - 1; k++) {
      cum += colFracs[k];
      colSplitterPositions.push(cum);
    }
  }
  const rowSplitterPositions: number[] = [];
  {
    let cum = 0;
    for (let k = 0; k < rowFracs.length - 1; k++) {
      cum += rowFracs[k];
      rowSplitterPositions.push(cum);
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        ref={gridRef}
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateColumns, gridTemplateRows }}
      >
        {(Array.from({ length: paneCount }) as undefined[]).map((_, i) => {
          const paneIndex = i as 0 | 1 | 2 | 3;
          const isActive = activePane === paneIndex;

          return (
            <div
              key={paneIndex}
              {...guide('pane', String(paneIndex))}
              data-active={isActive ? 'true' : undefined}
              className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              {paneCount > 1 && (
                <PaneHeader
                  paneIndex={paneIndex}
                  isActive={isActive}
                  onActivate={() => setActivePane(paneIndex)}
                />
              )}

              <div
                {...guide('pane.chart', String(paneIndex))}
                className="relative flex-1 overflow-hidden"
                onClick={() => setActivePane(paneIndex)}
              >
                <ChartPanel
                  paneIndex={paneIndex}
                  symbol={panes[paneIndex].symbol}
                  interval={panes[paneIndex].interval}
                  timeRangePreset={panes[paneIndex].timeRangePreset}
                  indicators={panes[paneIndex].indicators}
                  chartType={panes[paneIndex].chartType}
                  onChartReady={(chart, series) => handleChartReady(paneIndex, chart, series)}
                  onChartDestroy={() => handleChartDestroy(paneIndex)}
                  onDrawingManagerReady={(manager) => onDrawingManagerReady?.(paneIndex, manager)}
                  activeToolType={activeToolType}
                  onToolChange={onToolChange}
                />

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

        {/* ── Column splitters (2h, 3h, 4) ─────────────────────────────────── */}
        {paneCount > 1 &&
          colSplitterPositions.map((pos, k) => (
            <ResizeSplitter
              key={`col-split-${k}`}
              axis="col"
              position={pos}
              splitterRef={(el) => {
                colSplitterRefs.current[k] = el;
              }}
              onPointerDown={(e) => handleColSplitterPointerDown(e, k)}
            />
          ))}

        {/* ── Row splitters (2v, 4) ─────────────────────────────────────────── */}
        {paneCount > 1 &&
          rowSplitterPositions.map((pos, k) => (
            <ResizeSplitter
              key={`row-split-${k}`}
              axis="row"
              position={pos}
              splitterRef={(el) => {
                rowSplitterRefs.current[k] = el;
              }}
              onPointerDown={(e) => handleRowSplitterPointerDown(e, k)}
            />
          ))}
      </div>
    </div>
  );
}
