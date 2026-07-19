// ─── useDrawingInteraction — state machine for drawing placement & drag ─

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useDrawingStore } from '@/store/drawingStore';
import { LINE_TOOLS } from '@/lib/lineTools';
import { isTextNoteTool } from '@/lib/textNotes';
import type {
  Drawing,
  DrawingPoint,
  InProgressDrawing,
  DrawingType,
  PaneIndex,
} from '@/lib/drawing/types';
import {
  hitTestBodies,
  nearestTextShapeDistance,
  type CoordinateConverters,
} from '@/lib/drawing/coordinates';
import { computeAnnotationBox } from '@/lib/drawing/textLayout';

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
  /** P6 — invoked when the user clicks to place a text/note/callout/priceNote
   *  drawing or double-clicks an existing one, so ChartPanel mounts the
   *  on-chart textarea overlay. NOT invoked for priceLabel (not editable). */
  onRequestEdit?: (drawingId: string) => void;
  /** v4 — pane index this hook's chart owns. Stamped on every newly-spawned
   *  drawing so it lands on the correct pane and is filtered correctly by
   *  DrawingPrimitive's per-pane hitTest/draw. Defaults to 0 when omitted
   *  (test contexts). */
  paneIndex?: PaneIndex;
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

const PLACEMENT_CONFIGS: Record<string, PlacementConfig> = {
  trendline: { totalPoints: 2, finishOn: 'click' },
  horizontal: { totalPoints: 1, finishOn: 'click' },
  vertical: { totalPoints: 1, finishOn: 'click' },
  ray: { totalPoints: 2, finishOn: 'click' },
  parallel: { totalPoints: 3, finishOn: 'click' },
  polyline: { totalPoints: 0, finishOn: 'dblclick' },
  // P6 — text & notes shapes (all single-anchor, single-click placement)
  text: { totalPoints: 1, finishOn: 'click' },
  note: { totalPoints: 1, finishOn: 'click' },
  callout: { totalPoints: 1, finishOn: 'click' },
  priceNote: { totalPoints: 1, finishOn: 'click' },
  priceLabel: { totalPoints: 1, finishOn: 'click' },
};

function isLineTool(toolId: string): boolean {
  return LINE_TOOLS.some((t): t is NonNullable<typeof t> => t !== null && t.id === toolId);
}

function isDrawingTool(toolId: string): boolean {
  return isLineTool(toolId) || isTextNoteTool(toolId);
}

function getPlacementConfig(toolId: string): PlacementConfig | undefined {
  return PLACEMENT_CONFIGS[toolId];
}

/** True for text/note/callout/priceNote — opens the textarea editor after placement.
 *  PriceLabel is NOT editable (renders formatted price only). */
function isEditableTextNoteTool(toolId: string): boolean {
  return toolId === 'text' || toolId === 'note' || toolId === 'callout' || toolId === 'priceNote';
}

// ─── Helpers ───────────────────────────────────────────────────────

// ─── Helpers ───────────────────────────────────────────────────────

/** Lazy offscreen canvas 2D context for measuring text-shape hit-boxes
 *  during the spawn-suppression guard (Fix 3). Created once per session
 *  on first use; safe in browser only (chart code never runs on SSR).
 *  Returns null when offscreen canvas creation is blocked — caller must
 *  tolerate by skipping the guard. Mirrors DrawingPrimitive._getMeasuringCtx. */
let _measuringCtx: CanvasRenderingContext2D | null = null;
function getMeasuringCtx(): CanvasRenderingContext2D | null {
  if (_measuringCtx) return _measuringCtx;
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (ctx) {
      _measuringCtx = ctx;
      return ctx;
    }
  } catch {
    // fall through
  }
  return null;
}

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
  onRequestEdit,
  paneIndex = 0,
}: UseDrawingInteractionOptions): UseDrawingInteractionResult {
  const stateRef = useRef<DrawState>('IDLE');

  const inProgressRef = useRef<InProgressDrawing | null>(null);
  const [inProgressDrawing, setInProgressDrawing] = useState<InProgressDrawing | null>(null);

  const dragRef = useRef<DragState | null>(null);

  // Refs for latest activeTool/lineTool for use in event handlers
  const activeToolRef = useRef(activeTool);
  const lineToolRef = useRef(lineTool);
  const cursorVariantRef = useRef(cursorVariant);
  const onRequestEditRef = useRef(onRequestEdit);
  const paneIndexRef = useRef<PaneIndex>(paneIndex);

  useEffect(() => {
    activeToolRef.current = activeTool;
    lineToolRef.current = lineTool;
    cursorVariantRef.current = cursorVariant;
    onRequestEditRef.current = onRequestEdit;
    paneIndexRef.current = paneIndex;
  }, [activeTool, lineTool, cursorVariant, onRequestEdit, paneIndex]);

  // ── Enter/exit drawing mode ────────────────────────────────────
  useEffect(() => {
    if (isDrawingTool(activeTool) && stateRef.current === 'IDLE') {
      stateRef.current = 'DRAWING';
    } else if (!isDrawingTool(activeTool)) {
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

      // 🔐 Mac right-click is Ctrl+Click — registers as `button=0 +
      // ctrlKey=true` because the Mac platform fires a `contextmenu` event
      // after a synthetic left-click. lightweight-charts' `_mouseDownHandler`
      // only filters by `button !== 0`, so it treats Mac Ctrl+Click as a real
      // left-click and fires `subscribeClick`. Without this guard the click
      // handler would spawn a new empty text drawing at the click location
      // even though the user intended a right-click. The chart's existing
      // `contextmenu` handler then runs and exits drawing mode — but the
      // empty drawing was already placed, polluting the chart.
      //
      // lightweight-charts' compatEvent (the value of `param.sourceEvent`)
      // carries `ctrlKey`, `altKey`, `shiftKey`, `metaKey`, and
      // `_internal_target` (NOT a DOM `target` — the original-event target
      // object lives at `._internal_target`).
      const srcEvent = (
        param as {
          sourceEvent?: (MouseEvent & { _internal_target?: EventTarget | null }) | undefined;
        }
      ).sourceEvent;
      if (srcEvent?.ctrlKey) return;

      // 🔐 Defensive guard: if the chart click originated inside the
      // TextDrawingEditor portal (target is the textarea or its motion.div
      // wrapper), bail before placing a new drawing. The compatEvent's
      // target is on `._internal_target` (not `.target`).
      const srcTarget = srcEvent?._internal_target as HTMLElement | null | undefined;
      if (srcTarget && srcTarget.closest('[data-text-drawing-editor]')) return;

      const store = useDrawingStore.getState();
      const hitId = param.hoveredObjectId as string | undefined;

      // Cursor mode: select existing drawings. 🔐 Fix 4 — when the hit
      // resolves to an editable text/note/callout/priceNote drawing,
      // ALSO open the editor so single left-click is the primary re-entry
      // path for editing committed text. PriceLabel is excluded — it
      // renders formatted price and isn't editable. Mirrors TradingView's
      // "click text to edit" UX (which previously required a precise
      // double-click inside a stingy ~50×17 hit-box).
      if (activeToolRef.current === 'cursor') {
        if (cursorVariantRef.current === 'eraser') {
          if (hitId) {
            store.removeDrawing(hitId);
          }
        } else if (hitId) {
          store.selectDrawing(hitId);
          const hit = useDrawingStore.getState().drawings.find((d) => d.id === hitId);
          if (hit && isEditableTextNoteTool(hit.shape.type)) {
            onRequestEditRef.current?.(hitId);
          }
        }
        return;
      }

      // Non-drawing-tool modes: no drawing interaction
      if (!isDrawingTool(activeToolRef.current)) return;

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

        // 🔐 Fix 3 — Spawn-suppression for text/notes drawings. Without
        // this guard, an imprecise left-click near (but outside) an
        // existing text drawing's small ~50×17 px hit-box would spawn a
        // NEW empty text drawing at the click location — polluting the
        // chart with sibling drawings the user never intended. With the
        // guard, clicks within 16 px of an expanded hit-box (matching
        // DrawingPrimitive.hitTest's TEXT_HIT_* expansion) instead select
        // the existing drawing. When the hit is on an editable text/
        // note/callout/priceNote drawing we also open the editor.
        if (param.point) {
          const allDrawings = useDrawingStore.getState().drawings;
          const mctx = getMeasuringCtx();
          if (mctx) {
            const converters: CoordinateConverters = {
              timeToX: (t) => chart.timeScale().timeToCoordinate(t),
              priceToY: (p) => series.priceToCoordinate(p),
            };
            const nearest = nearestTextShapeDistance(
              param.point.x,
              param.point.y,
              allDrawings,
              (drawing) => {
                const p0 = drawing.shape.points[0];
                if (!p0) return null;
                const ax = converters.timeToX(p0.time);
                const ay = converters.priceToY(p0.price);
                if (ax === null || ay === null) return null;
                return computeAnnotationBox(mctx, drawing, ax, ay);
              }
            );
            if (nearest && nearest.dist < 16) {
              store.selectDrawing(nearest.id);
              const hit = useDrawingStore.getState().drawings.find((d) => d.id === nearest.id);
              if (hit && isEditableTextNoteTool(hit.shape.type)) {
                onRequestEditRef.current?.(nearest.id);
              }
              return;
            }
          }
        }

        // 1-click tools (horizontal, vertical, text, note, callout, priceNote,
        // priceLabel): commit immediately on the click.
        if (config.totalPoints === 1) {
          const toolId = activeToolRef.current as DrawingType;
          const newId = store.addDrawing({
            shape: { type: toolId, points: [point] },
            // P6 — editable annotation shapes default to an empty label so the
            // textarea overlay's placeholder shows. Price label renders the
            // formatted price regardless of label, so undefined is correct.
            label: isEditableTextNoteTool(toolId) ? '' : undefined,
            // 🔐 v4 — stamp the owning pane so DrawingPrimitive's per-pane
            // filter (draw() + hitTest()) places this drawing on the correct
            // chart only. Without this, multi-pane dashboards would render
            // each new drawing on every pane.
            paneIndex: paneIndexRef.current,
          });
          store.selectDrawing(newId);
          // P6 — auto-enter edit mode for text/note/callout/priceNote so the
          // textarea overlay mounts immediately after placement.
          if (isEditableTextNoteTool(toolId)) {
            onRequestEditRef.current?.(newId);
          }
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
            // 🔐 v4 — stamp the owning pane on multi-click commits too.
            paneIndex: paneIndexRef.current,
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

    const handler = (param: Parameters<Parameters<IChartApi['subscribeDblClick']>[0]>[0]) => {
      // P6 — dblclick on an existing editable text/note/callout/priceNote
      // drawing opens the on-chart textarea editor. This branch fires from
      // any non-PLACING state (IDLE, DRAWING) including while a line/note
      // tool is active. The hit detection uses `param.hoveredObjectId`, the
      // same field used by subscribeClick for selection.
      if (stateRef.current !== 'PLACING') {
        const hoveredId = param.hoveredObjectId as string | undefined;
        if (hoveredId) {
          const hovered = useDrawingStore.getState().drawings.find((d) => d.id === hoveredId);
          if (hovered && isEditableTextNoteTool(hovered.shape.type)) {
            useDrawingStore.getState().selectDrawing(hoveredId);
            onRequestEditRef.current?.(hoveredId);
          }
        }
        return;
      }

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
        // 🔐 v4 — stamp the owning pane on polyline dblclick commits.
        paneIndex: paneIndexRef.current,
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
      // Preview only fires during PLACING state. 1-click tools (incl. all P6
      // text/note shapes) never enter PLACING, so they never need preview.
      if (!isDrawingTool(activeToolRef.current)) return;
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
      isDrawingTool(activeToolRef.current) || activeToolRef.current === 'cursor';

    const onPointerDown = (e: PointerEvent) => {
      if (!isInteractive()) return;
      if (cursorVariantRef.current === 'eraser') return;

      // 🔐 If the pointer landed on the TextDrawingEditor's textarea (or any
      // descendant of its portal wrapper), bail before hit-testing. The
      // container's pointerdown listener is registered with { capture: true },
      // so it fires BEFORE the textarea's React onMouseDown/onPointerDown
      // handlers can stopPropagation. Without this guard, right-click inside
      // the editor would trigger a chart click that spawns a new empty text
      // drawing at the click coordinates — losing the user's in-progress text.
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-text-drawing-editor]')) return;

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
        stateRef.current = isDrawingTool(activeToolRef.current) ? 'DRAWING' : 'IDLE';
        dragRef.current = null;
        container.releasePointerCapture(e.pointerId);
        return;
      }

      if (stateRef.current === 'DRAGGING_DRAWING') {
        if (dragRef.current) {
          useDrawingStore.getState().selectDrawing(dragRef.current.drawingId);
        }
        stateRef.current = isDrawingTool(activeToolRef.current) ? 'DRAWING' : 'IDLE';
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
      // 🔐 If the right-click landed inside the TextDrawingEditor portal,
      // suppress the browser context menu but do NOT exit drawing mode,
      // deselect, or spawn a new drawing. The editor's textarea handles
      // its own context interactions; exiting here would discard the
      // user's in-progress text.
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-text-drawing-editor]')) {
        e.preventDefault();
        return;
      }

      // Eraser: right-click exits eraser mode
      if (cursorVariantRef.current === 'eraser') {
        e.preventDefault();
        onEraserExit();
        return;
      }

      if (!isDrawingTool(activeToolRef.current)) return;
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
              // 🔐 v4 — stamp the owning pane on contextmenu polyline commits.
              paneIndex: paneIndexRef.current,
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
      // 🔐 If the user is typing inside an editable element (the TextDrawingEditor
      // textarea, an input, or any contentEditable), let that element handle
      // every keystroke natively — Backspace edits text, Escape cancels via the
      // editor's own onKeyDown, Undo/Redo uses the browser's native text undo.
      // Without this guard, Backspace would call removeDrawing(selectedId) and
      // Escape would deselect the very drawing being edited, both racing the
      // editor's own handlers.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)
      ) {
        return;
      }

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
