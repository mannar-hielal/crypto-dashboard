// ─── useDrawingInteraction — state machine for drawing placement & drag ─

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useDrawingStore } from '@/store/drawingStore';
import { LINE_TOOLS } from '@/lib/lineTools';
import type { Drawing, DrawingPoint, InProgressDrawing } from '@/lib/drawing/types';

// ─── Types ─────────────────────────────────────────────────────────

type DrawState = 'IDLE' | 'DRAWING' | 'PLACING_A' | 'DRAGGING_HANDLE' | 'DRAGGING_DRAWING';

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
  onExitDrawingMode: () => void;
}

interface UseDrawingInteractionResult {
  inProgressDrawing: InProgressDrawing | null;
}

const DEFAULT_COLOR = '#2196f3';

function isLineTool(toolId: string): boolean {
  return LINE_TOOLS.some((t): t is NonNullable<typeof t> => t !== null && t.id === toolId);
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
    for (let i = 0; i < drawing.points.length; i++) {
      const dist = pointToHandleDist(x, y, chart, series, drawing.points[i]);
      if (dist !== null && dist < 12) {
        return { drawingId: drawing.id, pointIndex: i };
      }
    }
  }
  return null;
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

function hitTestLineBody(
  clientX: number,
  clientY: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  container: HTMLElement,
  drawings: Drawing[]
): { drawingId: string } | null {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (const drawing of drawings) {
    if (drawing.points.length < 2) continue;
    for (let i = 0; i < drawing.points.length - 1; i++) {
      const x1 = chart.timeScale().timeToCoordinate(drawing.points[i].time);
      const y1 = series.priceToCoordinate(drawing.points[i].price);
      const x2 = chart.timeScale().timeToCoordinate(drawing.points[i + 1].time);
      const y2 = series.priceToCoordinate(drawing.points[i + 1].price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      if (pointToSegmentDist(x, y, x1, y1, x2, y2) < 8) {
        return { drawingId: drawing.id };
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
  onExitDrawingMode,
}: UseDrawingInteractionOptions): UseDrawingInteractionResult {
  const stateRef = useRef<DrawState>('IDLE');

  const inProgressRef = useRef<InProgressDrawing | null>(null);
  const [inProgressDrawing, setInProgressDrawing] = useState<InProgressDrawing | null>(null);

  const dragRef = useRef<DragState | null>(null);

  // Refs for latest activeTool/lineTool for use in event handlers
  const activeToolRef = useRef(activeTool);
  const lineToolRef = useRef(lineTool);

  useEffect(() => {
    activeToolRef.current = activeTool;
    lineToolRef.current = lineTool;
  }, [activeTool, lineTool]);

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
        if (hitId) {
          store.selectDrawing(hitId);
        }
        return;
      }

      // Non-line-tool modes: no drawing interaction
      if (!isLineTool(activeToolRef.current)) return;

      if (stateRef.current === 'DRAWING') {
        if (hitId) {
          store.selectDrawing(hitId);
          return;
        }

        // Before starting a new drawing, check if click is on an existing line body
        if (param.point) {
          const allDrawings = useDrawingStore.getState().drawings;
          for (const drawing of allDrawings) {
            if (drawing.points.length < 2) continue;
            for (let i = 0; i < drawing.points.length - 1; i++) {
              const x1 = chart.timeScale().timeToCoordinate(drawing.points[i].time);
              const y1 = series.priceToCoordinate(drawing.points[i].price);
              const x2 = chart.timeScale().timeToCoordinate(drawing.points[i + 1].time);
              const y2 = series.priceToCoordinate(drawing.points[i + 1].price);
              if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
              if (pointToSegmentDist(param.point.x, param.point.y, x1, y1, x2, y2) < 8) {
                store.selectDrawing(drawing.id);
                return;
              }
            }
          }
        }

        if (!param.time || !param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price === null) return;

        const point: DrawingPoint = {
          time: param.time as UTCTimestamp,
          price,
        };
        inProgressRef.current = { type: 'trendline', points: [point], hoverPoint: null };
        setInProgressDrawing(inProgressRef.current);
        stateRef.current = 'PLACING_A';
        store.selectDrawing(null);
        return;
      }

      if (stateRef.current === 'PLACING_A') {
        if (!param.time || !param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price === null) return;

        const ip = inProgressRef.current;
        if (!ip) return;

        const pointB: DrawingPoint = { time: param.time as UTCTimestamp, price };
        const newId = store.addDrawing({
          type: 'trendline',
          points: [...ip.points, pointB],
          color: DEFAULT_COLOR,
          textColor: '#ffffff',
          lineWidth: 2,
          lineStyle: 'solid',
          isLocked: false,
        });

        inProgressRef.current = null;
        setInProgressDrawing(null);
        stateRef.current = 'DRAWING';

        store.selectDrawing(newId);
        return;
      }
    };

    chart.subscribeClick(handler);
    return () => {
      chart.unsubscribeClick(handler);
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
      if (stateRef.current !== 'PLACING_A') return;
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
      if (stateRef.current === 'PLACING_A') return;
      const bodyHit = hitTestLineBody(e.clientX, e.clientY, chart, series, container, drawings);
      if (bodyHit) {
        const drawing = drawings.find((d) => d.id === bodyHit.drawingId);
        if (!drawing || drawing.isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        stateRef.current = 'DRAGGING_DRAWING';
        dragRef.current = {
          drawingId: bodyHit.drawingId,
          pointIndex: -1,
          startPoints: drawing.points.map((p) => ({ ...p })),
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

        const newPoints: DrawingPoint[] = drawing.points.map((p, i) =>
          i === dragRef.current!.pointIndex ? { time: time as UTCTimestamp, price } : p
        );
        useDrawingStore.getState().updateDrawing(dragRef.current.drawingId, { points: newPoints });
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

        useDrawingStore.getState().updateDrawing(drawingId, { points: newPoints });
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
      if (!isLineTool(activeToolRef.current)) return;
      e.preventDefault();

      if (stateRef.current === 'PLACING_A') {
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
      if (!isLineTool(activeToolRef.current)) return;

      if (e.key === 'Escape') {
        if (stateRef.current === 'PLACING_A') {
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
