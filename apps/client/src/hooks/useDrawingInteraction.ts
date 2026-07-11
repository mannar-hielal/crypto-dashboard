// ─── useDrawingInteraction — state machine for drawing placement & drag ─

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useDrawingStore } from '@/store/drawingStore';
import { LINE_TOOLS, type LineToolId } from '@/lib/lineTools';
import type { Drawing, DrawingPoint, InProgressDrawing, DrawingType } from '@/lib/drawing/types';
import { hitTestBodies } from '@/lib/drawing/coordinates';

// ─── Types ─────────────────────────────────────────────────────────

type DrawState = 'IDLE' | 'DRAWING' | 'PLACING' | 'DRAGGING_HANDLE' | 'DRAGGING_DRAWING';

interface DragState {
  drawingId: string;
  pointIndex: number;
  startPoints?: DrawingPoint[];
  startMouse?: { x: number; y: number };
}

interface UseDrawingInteractionOptions {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeTool: string;
  lineTool: string;
  cursorVariant: string;
  onExitDrawingMode: () => void;
  onEraserExit: () => void;
}

interface UseDrawingInteractionResult {
  inProgressDrawing: InProgressDrawing | null;
}

// ─── Placement config per tool ──────────────────────────────────────
//
// `totalPoints` is how many clicks to commit. 0 = open-ended (not used in P2).
// `finishOn` can be 'click' (commit on the Nth click) or 'dblclick' (P3).

interface PlacementConfig {
  totalPoints: number;
  finishOn: 'click' | 'dblclick';
}

const PLACEMENT_CONFIGS: Partial<Record<LineToolId, PlacementConfig>> = {
  trendline: { totalPoints: 2, finishOn: 'click' },
  horizontal: { totalPoints: 1, finishOn: 'click' },
  vertical: { totalPoints: 1, finishOn: 'click' },
  ray: { totalPoints: 2, finishOn: 'click' },
  parallel: { totalPoints: 3, finishOn: 'click' },
  polyline: { totalPoints: 0, finishOn: 'dblclick' },
};

function isLineTool(toolId: string): boolean {
  return LINE_TOOLS.some((t): t is NonNullable<typeof t> => t !== null && t.id === toolId);
}

function getPlacementConfig(toolId: string): PlacementConfig | undefined {
  return PLACEMENT_CONFIGS[toolId as LineToolId];
}

// ─── Helpers ───────────────────────────────────────────────────────

function pointToHandleDist(
  px: number,
  py: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  point: DrawingPoint
): number | null {
  const cx = chart.timeScale().timeToCoordinate(point.time);
  const cy = series.priceToCoordinate(point.price);
  if (cx === null || cy === null) return null;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function hitTestHandles(
  clientX: number,
  clientY: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  container: HTMLElement,
  drawings: Drawing[]
): { drawingId: string; pointIndex: number } | null {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (const drawing of drawings) {
    if (drawing.isLocked) continue;
    for (let i = 0; i < drawing.shape.points.length; i++) {
      const dist = pointToHandleDist(x, y, chart, series, drawing.shape.points[i]);
      if (dist !== null && dist < 12) {
        return { drawingId: drawing.id, pointIndex: i };
      }
    }
  }
  return null;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useDrawingInteraction({
  chartRef,
  seriesRef,
  containerRef,
  activeTool,
  lineTool,
  cursorVariant,
  onExitDrawingMode,
  onEraserExit,
}: UseDrawingInteractionOptions): UseDrawingInteractionResult {
  const stateRef = useRef<DrawState>('IDLE');

  const inProgressRef = useRef<InProgressDrawing | null>(null);
  const [inProgressDrawing, setInProgressDrawing] = useState<InProgressDrawing | null>(null);

  const dragRef = useRef<DragState | null>(null);

  // Refs for latest activeTool/lineTool for use in event handlers
  const activeToolRef = useRef(activeTool);
  const lineToolRef = useRef(lineTool);
  const cursorVariantRef = useRef(cursorVariant);

  useEffect(() => {
    activeToolRef.current = activeTool;
    lineToolRef.current = lineTool;
    cursorVariantRef.current = cursorVariant;
  }, [activeTool, lineTool, cursorVariant]);

  // ── Enter/exit drawing mode ────────────────────────────────────
  useEffect(() => {
    if (isLineTool(activeTool) && stateRef.current === 'IDLE') {
      stateRef.current = 'DRAWING';
    } else if (!isLineTool(activeTool)) {
      stateRef.current = 'IDLE';
      inProgressRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInProgressDrawing(null);
      dragRef.current = null;
    }
  }, [activeTool]);

  // ── subscribeClick ─────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const handler = (param: Parameters<Parameters<IChartApi['subscribeClick']>[0]>[0]) => {
      if (stateRef.current === 'DRAGGING_HANDLE' || stateRef.current === 'DRAGGING_DRAWING') return;

      const store = useDrawingStore.getState();
      const hitId = param.hoveredObjectId as string | undefined;

      // Cursor mode: only select existing drawings
      if (activeToolRef.current === 'cursor') {
        if (cursorVariantRef.current === 'eraser') {
          if (hitId) {
            store.removeDrawing(hitId);
          }
        } else if (hitId) {
          store.selectDrawing(hitId);
        }
        return;
      }

      // Non-line-tool modes: no drawing interaction
      if (!isLineTool(activeToolRef.current)) return;

      // Get placement config — if the tool isn't configured yet, bail.
      const config = getPlacementConfig(activeToolRef.current);
      if (!config) return;

      // Capture the click point (used in all branches below)
      if (!param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;
      const point: DrawingPoint = {
        time: param.time as UTCTimestamp,
        price,
      };

      if (stateRef.current === 'DRAWING') {
        if (hitId) {
          store.selectDrawing(hitId);
          return;
        }

        // Before starting a new drawing, check if click is on an existing line body
        if (param.point) {
          const allDrawings = useDrawingStore.getState().drawings;
          const bodyHitId = hitTestBodies(param.point.x, param.point.y, allDrawings, {
            timeToX: (t) => chart.timeScale().timeToCoordinate(t),
            priceToY: (p) => series.priceToCoordinate(p),
          });
          if (bodyHitId) {
            store.selectDrawing(bodyHitId);
            return;
          }
        }

        // 1-click tools (horizontal, vertical): place immediately on the click
        if (config.totalPoints === 1) {
          const toolId = activeToolRef.current as DrawingType;
          const newId = store.addDrawing({
            shape: { type: toolId, points: [point] },
          });
          store.selectDrawing(newId);
          // Stay in DRAWING — user can place more or click elsewhere
          return;
        }

        // Multi-click tools (trendline 2, ray 2, parallel 3 future): start PLACING
        inProgressRef.current = {
          type: activeToolRef.current as DrawingType,
          points: [point],
          hoverPoint: null,
        };
        setInProgressDrawing(inProgressRef.current);
        stateRef.current = 'PLACING';
        store.selectDrawing(null);
        return;
      }

      if (stateRef.current === 'PLACING') {
        const ip = inProgressRef.current;
        if (!ip) return;

        const pointB: DrawingPoint = point;

        // Open-ended tools (polyline, totalPoints === 0): always accumulate;
        // commit is handled by the dblclick handler.
        if (config.totalPoints === 0) {
          inProgressRef.current = { ...ip, points: [...ip.points, pointB] };
          setInProgressDrawing(inProgressRef.current);
          return;
        }

        const totalAfter = ip.points.length + 1;

        if (totalAfter >= config.totalPoints) {
          // Commit
          const newId = store.addDrawing({
            shape: { type: ip.type, points: [...ip.points, pointB] },
          });
          inProgressRef.current = null;
          setInProgressDrawing(null);
          stateRef.current = 'DRAWING';
          store.selectDrawing(newId);
        } else {
          // Accumulate — stay in PLACING
          inProgressRef.current = { ...ip, points: [...ip.points, pointB] };
          setInProgressDrawing(inProgressRef.current);
        }
        return;
      }
    };

    chart.subscribeClick(handler);
    return () => {
      chart.unsubscribeClick(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── subscribeDblClick — commit polyline ──────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const handler = () => {
      if (stateRef.current !== 'PLACING') return;
      const ip = inProgressRef.current;
      if (!ip || ip.type !== 'polyline') return;

      const config = getPlacementConfig(activeToolRef.current);
      if (!config || config.finishOn !== 'dblclick') return;

      // The double-click point is already added by the second subscribeClick
      // event that precedes dblclick. Deduplicate the last two points if they
      // are at the same position (same time + price).
      let points = [...ip.points];
      if (points.length >= 2) {
        const last = points[points.length - 1]!;
        const prev = points[points.length - 2]!;
        if (last.time === prev.time && last.price === prev.price) {
          points = points.slice(0, -1);
        }
      }

      // Need at least 2 points for a polyline
      if (points.length < 2) {
        inProgressRef.current = null;
        setInProgressDrawing(null);
        stateRef.current = 'DRAWING';
        return;
      }

      const store = useDrawingStore.getState();
      const newId = store.addDrawing({
        shape: { type: 'polyline', points },
      });
      inProgressRef.current = null;
      setInProgressDrawing(null);
      stateRef.current = 'DRAWING';
      store.selectDrawing(newId);
    };

    chart.subscribeDblClick(handler);
    return () => {
      chart.unsubscribeDblClick(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── subscribeCrosshairMove (hover preview) ─────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const handler = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      if (!isLineTool(activeToolRef.current)) return;
      if (stateRef.current !== 'PLACING') return;
      if (!param.sourceEvent) return;
      if (!param.time || !param.point) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const ip = inProgressRef.current;
      if (!ip) return;

      ip.hoverPoint = { time: param.time as UTCTimestamp, price };
      inProgressRef.current = { ...ip };
      setInProgressDrawing({ ...ip, hoverPoint: ip.hoverPoint });
    };

    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer capture for drag interactions (handle + body) ─────
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!container || !chart || !series) return;

    const isInteractive = () =>
      isLineTool(activeToolRef.current) || activeToolRef.current === 'cursor';

    const onPointerDown = (e: PointerEvent) => {
      if (!isInteractive()) return;
      if (cursorVariantRef.current === 'eraser') return;
      const drawings = useDrawingStore.getState().drawings;

      // Handle drag (resize) — both modes
      const handleHit = hitTestHandles(e.clientX, e.clientY, chart, series, container, drawings);
      if (handleHit) {
        const drawing = drawings.find((d) => d.id === handleHit.drawingId);
        if (!drawing || drawing.isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        stateRef.current = 'DRAGGING_HANDLE';
        dragRef.current = { drawingId: handleHit.drawingId, pointIndex: handleHit.pointIndex };
        container.setPointerCapture(e.pointerId);
        return;
      }

      // Body drag (translate) — both modes, skip during new-drawing placement
      if (stateRef.current === 'PLACING') return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const bodyHitId = hitTestBodies(x, y, drawings, {
        timeToX: (t) => chart.timeScale().timeToCoordinate(t),
        priceToY: (p) => series.priceToCoordinate(p),
      });
      if (bodyHitId) {
        const drawing = drawings.find((d) => d.id === bodyHitId);
        if (!drawing || drawing.isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        stateRef.current = 'DRAGGING_DRAWING';
        dragRef.current = {
          drawingId: bodyHitId,
          pointIndex: -1,
          startPoints: drawing.shape.points.map((p) => ({ ...p })),
          startMouse: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        };
        container.setPointerCapture(e.pointerId);
        return;
      }

      // No hit → lightweight-charts will fire subscribeClick
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;

      if (stateRef.current === 'DRAGGING_HANDLE') {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const time = chart.timeScale().coordinateToTime(x);
        const price = series.coordinateToPrice(y);
        if (time === null || price === null) return;

        const drawing = useDrawingStore
          .getState()
          .drawings.find((d) => d.id === dragRef.current!.drawingId);
        if (!drawing) return;

        const newPoints: DrawingPoint[] = drawing.shape.points.map((p, i) =>
          i === dragRef.current!.pointIndex ? { time: time as UTCTimestamp, price } : p
        );
        useDrawingStore.getState().updateDrawing(
          dragRef.current!.drawingId,
          {
            shape: { ...drawing.shape, points: newPoints },
          },
          true
        );
        return;
      }

      if (stateRef.current === 'DRAGGING_DRAWING') {
        const { drawingId, startPoints, startMouse } = dragRef.current;
        if (!startPoints || !startMouse) return;

        const rect = container.getBoundingClientRect();
        const dx = e.clientX - rect.left - startMouse.x;
        const dy = e.clientY - rect.top - startMouse.y;

        const newPoints: DrawingPoint[] = startPoints.map((p) => {
          const coordX = chart.timeScale().timeToCoordinate(p.time);
          const coordY = series.priceToCoordinate(p.price);
          if (coordX === null || coordY === null) return { ...p };
          const newTime = chart.timeScale().coordinateToTime(coordX + dx);
          const newPrice = series.coordinateToPrice(coordY + dy);
          if (newTime === null || newPrice === null) return { ...p };
          return { time: newTime as UTCTimestamp, price: newPrice };
        });

        const currentDrawing = useDrawingStore.getState().drawings.find((d) => d.id === drawingId);
        if (!currentDrawing) return;
        useDrawingStore.getState().updateDrawing(
          drawingId,
          {
            shape: { ...currentDrawing.shape, points: newPoints },
          },
          true
        );
        return;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (stateRef.current === 'DRAGGING_HANDLE') {
        stateRef.current = isLineTool(activeToolRef.current) ? 'DRAWING' : 'IDLE';
        dragRef.current = null;
        container.releasePointerCapture(e.pointerId);
        return;
      }

      if (stateRef.current === 'DRAGGING_DRAWING') {
        if (dragRef.current) {
          useDrawingStore.getState().selectDrawing(dragRef.current.drawingId);
        }
        stateRef.current = isLineTool(activeToolRef.current) ? 'DRAWING' : 'IDLE';
        dragRef.current = null;
        container.releasePointerCapture(e.pointerId);
        return;
      }
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    container.addEventListener('pointermove', onPointerMove, { capture: true });
    container.addEventListener('pointerup', onPointerUp, { capture: true });

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      container.removeEventListener('pointermove', onPointerMove, { capture: true });
      container.removeEventListener('pointerup', onPointerUp, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Context menu → exit drawing mode ──────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      // Eraser: right-click exits eraser mode
      if (cursorVariantRef.current === 'eraser') {
        e.preventDefault();
        onEraserExit();
        return;
      }

      if (!isLineTool(activeToolRef.current)) return;
      e.preventDefault();

      if (stateRef.current === 'PLACING') {
        const ip = inProgressRef.current;
        if (ip && ip.type === 'polyline' && ip.points.length >= 2) {
          let points = [...ip.points];
          const last = points[points.length - 1]!;
          const prev = points[points.length - 2]!;
          if (last.time === prev.time && last.price === prev.price) {
            points = points.slice(0, -1);
          }
          if (points.length >= 2) {
            const store = useDrawingStore.getState();
            const newId = store.addDrawing({
              shape: { type: 'polyline', points },
            });
            store.selectDrawing(newId);
          }
        }
        inProgressRef.current = null;
        setInProgressDrawing(null);
      }
      stateRef.current = 'DRAWING';

      useDrawingStore.getState().selectDrawing(null);
      onExitDrawingMode();
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo — global (work regardless of active tool)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useDrawingStore.getState().redo();
        } else {
          useDrawingStore.getState().undo();
        }
        return;
      }

      // Drawing-specific shortcuts require an active line tool
      if (!isLineTool(activeToolRef.current)) return;

      if (e.key === 'Escape') {
        if (stateRef.current === 'PLACING') {
          inProgressRef.current = null;
          setInProgressDrawing(null);
          stateRef.current = 'DRAWING';
        } else {
          useDrawingStore.getState().selectDrawing(null);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = useDrawingStore.getState().selectedDrawingId;
        if (selectedId) {
          useDrawingStore.getState().removeDrawing(selectedId);
          useDrawingStore.getState().selectDrawing(null);
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { inProgressDrawing };
}
