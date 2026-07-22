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
import { DrawingManager } from 'lightweight-charts-drawing';
import { useLayoutStore, LAYOUT_PANE_COUNT, DEFAULT_PANE_SIZES } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { ChartPanel } from '@/components/dashboard/ChartPanel';
import { PaneHeader } from '@/components/dashboard/PaneHeader';
import { color } from '@/lib/tokens';

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
}

export function MultiChartArea({ onDrawingManagerReady }: MultiChartAreaProps) {
  const layout = useLayoutStore((s) => s.layout);
  const activePane = useLayoutStore((s) => s.activePane);
  const syncOptions = useLayoutStore((s) => s.syncOptions);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const panes = useLayoutStore((s) => s.panes);
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
    if (!range) return;

    isSyncingTimeRange.current = true;
    for (let i = 0; i < paneCount; i++) {
      if (i === activePane) continue;
      const other = chartRefs.current[i];
      if (!other) continue;
      try {
        other.timeScale().setVisibleRange(range);
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

      chart.subscribeCrosshairMove((param) => {
        if (!syncRef.current.crosshair) return;
        if (!param.sourceEvent) return;
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
              let price: number | null = otherSeries.coordinateToPrice(param.point.y);
              if (price !== null && (price < followerLatest * 0.5 || price > followerLatest * 2))
                price = null;
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
            /* ignore */
          }
        }
      });

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
            /* ignore */
          }
        }
        isSyncingTimeRange.current = false;
      });
    },
    []
  );

  const handleChartDestroy = useCallback((paneIndex: number) => {
    chartRefs.current[paneIndex] = null;
    seriesRefs.current[paneIndex] = null;
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
    <div
      ref={gridRef}
      className="relative grid h-full w-full"
      style={{ gridTemplateColumns, gridTemplateRows }}
    >
      {(Array.from({ length: paneCount }) as undefined[]).map((_, i) => {
        const paneIndex = i as 0 | 1 | 2 | 3;
        const isActive = activePane === paneIndex;

        return (
          <div key={paneIndex} className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
            {paneCount > 1 && (
              <PaneHeader
                paneIndex={paneIndex}
                isActive={isActive}
                onActivate={() => setActivePane(paneIndex)}
              />
            )}

            <div
              className="relative flex-1 overflow-hidden"
              onClick={() => setActivePane(paneIndex)}
            >
              <ChartPanel
                paneIndex={paneIndex}
                symbol={panes[paneIndex].symbol}
                interval={panes[paneIndex].interval}
                onChartReady={(chart, series) => handleChartReady(paneIndex, chart, series)}
                onChartDestroy={() => handleChartDestroy(paneIndex)}
                onDrawingManagerReady={(manager) => onDrawingManagerReady?.(paneIndex, manager)}
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
  );
}
