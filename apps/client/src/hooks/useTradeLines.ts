/**
 * Draws the account's positions and orders on one chart pane and lets TP / SL / order lines be
 * dragged to amend them (APP_LOG Bybit Parity BP-3). Line specs come from lib/tradeLines.ts.
 *
 * Lines are lightweight-charts price lines on the pane's candle series, kept in sync by direct
 * store subscriptions — a mark-price tick moves a line without a React render. React state is
 * only the pending amend (the confirmation after a drag).
 *
 * Dragging: pointer events are taken at the window's capture phase, before lightweight-charts
 * (panning) and the drawing tools see them, and only when the pointer is on a draggable line and
 * no drawing tool is active. The dropped price is rounded to the instrument's tick size and must
 * be confirmed before anything is sent; the server validates it like any other edit.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from 'lightweight-charts';
import { getLastKnownMarkPrice, paneStores } from '@/store/paneStore';
import { usePaperStore } from '@/store/paperStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useInstrument } from '@/hooks/useInstruments';
import {
  buildTradeLines,
  dragTargetLabel,
  hitTestTradeLine,
  roundToTick,
  type DragTarget,
  type TradeLineSpec,
  type TradeLineStyle,
} from '@/lib/tradeLines';

const LINE_STYLE: Record<TradeLineStyle, LineStyle> = {
  solid: LineStyle.Solid,
  // LineStyle.Dashed is barely distinguishable from Dotted at 1 px
  dashed: LineStyle.LargeDashed,
  dotted: LineStyle.Dotted,
};

/** A dropped line waiting for the user to confirm the amend. */
export interface PendingAmend {
  target: DragTarget;
  /** "take-profit", "stop-loss" or "order price" */
  label: string;
  price: number;
  /** Where the line is, in px from the top of the chart container (for the confirmation) */
  y: number;
  busy: boolean;
  error: string | null;
}

interface UseTradeLinesArgs {
  paneIndex: 0 | 1 | 2 | 3;
  chartRef: RefObject<IChartApi | null>;
  candleRef: RefObject<ISeriesApi<'Candlestick'> | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  /** A drawing tool is active — lines don't take the pointer then */
  toolActive: boolean;
}

/** Send the amend a drag asks for. Resolves to an error message, or null when accepted. */
async function sendAmend(target: DragTarget, price: number): Promise<string | null> {
  const store = usePaperStore.getState();
  if ('positionId' in target) {
    const pos = store.positions.find((p) => p.id === target.positionId);
    if (!pos) return 'The position is no longer open';
    return target.kind === 'positionTp'
      ? store.updatePositionExits(pos.id, price, pos.stopLoss ?? null)
      : store.updatePositionExits(pos.id, pos.takeProfit ?? null, price);
  }
  const order = store.pendingOrders.find((o) => o.id === target.orderId);
  if (!order) return 'The order is no longer active';
  const res = await store.editPendingOrder(
    order.id,
    target.kind === 'orderPrice' ? price : order.triggerPrice,
    order.qty,
    target.kind === 'orderTp' ? price : (order.takeProfit ?? null),
    target.kind === 'orderSl' ? price : (order.stopLoss ?? null)
  );
  if (res.result === 'ok') return null;
  if (res.result === 'not-found') return 'The order is no longer active';
  if (res.result === 'rejected') return 'Not enough funds — the order was cancelled';
  return res.error ?? 'The amend was refused';
}

export function useTradeLines({
  paneIndex,
  chartRef,
  candleRef,
  containerRef,
  toolActive,
}: UseTradeLinesArgs) {
  const category = useLayoutStore((s) => s.panes[paneIndex].category);
  const symbol = useLayoutStore((s) => s.panes[paneIndex].symbol);
  const instrument = useInstrument(category, symbol);
  const tickRef = useRef<number | null>(null);
  const toolActiveRef = useRef(toolActive);
  useEffect(() => {
    tickRef.current = instrument?.tickSize ?? null;
  }, [instrument]);
  useEffect(() => {
    toolActiveRef.current = toolActive;
  }, [toolActive]);

  const [amend, setAmend] = useState<PendingAmend | null>(null);
  /** Line held at its dropped price until the amend is confirmed or cancelled */
  const heldRef = useRef<{ id: string; price: number } | null>(null);
  /** Re-draw every line from the stores (set by the effect) */
  const syncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const lines = new Map<string, { spec: TradeLineSpec; line: IPriceLine }>();
    let drag: { spec: TradeLineSpec; price: number } | null = null;

    const specs = (): TradeLineSpec[] => {
      const pane = useLayoutStore.getState().panes[paneIndex];
      const paper = usePaperStore.getState();
      const mark =
        pane.category === 'linear'
          ? (paneStores[paneIndex].getState().markPrice ??
            getLastKnownMarkPrice(pane.symbol) ??
            null)
          : null;
      return buildTradeLines({
        category: pane.category,
        symbol: pane.symbol,
        positions: paper.positions,
        pendingOrders: paper.pendingOrders,
        mark,
        showMark: useLayoutStore.getState().showMarkPriceLine,
      });
    };

    const sync = () => {
      const series = candleRef.current;
      if (!series) return;
      const next = specs();
      const seen = new Set<string>();
      for (const spec of next) {
        seen.add(spec.id);
        const held =
          drag?.spec.id === spec.id
            ? drag.price
            : heldRef.current?.id === spec.id
              ? heldRef.current.price
              : null;
        const options = {
          price: held ?? spec.price,
          color: spec.color,
          lineWidth: 1 as const,
          lineStyle: LINE_STYLE[spec.style],
          axisLabelVisible: true,
          title: spec.title,
        };
        const existing = lines.get(spec.id);
        if (existing) {
          existing.line.applyOptions(options);
          existing.spec = spec;
        } else {
          lines.set(spec.id, { spec, line: series.createPriceLine(options) });
        }
      }
      for (const [id, { line }] of lines) {
        if (seen.has(id)) continue;
        series.removePriceLine(line);
        lines.delete(id);
      }
    };
    syncRef.current = sync;

    const hitAt = (clientY: number): TradeLineSpec | null => {
      const series = candleRef.current;
      const container = containerRef.current;
      if (!series || !container) return null;
      const y = clientY - container.getBoundingClientRect().top;
      return hitTestTradeLine(
        [...lines.values()].map(({ spec, line }) => ({
          spec,
          y: series.priceToCoordinate(line.options().price),
        })),
        y
      );
    };

    const inside = (e: PointerEvent) => {
      const container = containerRef.current;
      return !!container && e.target instanceof Node && container.contains(e.target);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || toolActiveRef.current || heldRef.current || !inside(e)) return;
      const spec = hitAt(e.clientY);
      if (!spec) return;
      // 🔐 Taken before the chart pans or a drawing is grabbed; no mouse events follow
      e.preventDefault();
      e.stopPropagation();
      drag = { spec, price: spec.price };
      chartRef.current?.applyOptions({ handleScroll: false, handleScale: false });
      if (containerRef.current) containerRef.current.dataset.tradeLineDrag = 'true';
    };

    const onPointerMove = (e: PointerEvent) => {
      const container = containerRef.current;
      const series = candleRef.current;
      if (!container || !series) return;
      if (!drag) {
        const hover = !toolActiveRef.current && !heldRef.current && inside(e) && !!hitAt(e.clientY);
        container.dataset.tradeLineHover = hover ? 'true' : 'false';
        return;
      }
      const raw = series.coordinateToPrice(e.clientY - container.getBoundingClientRect().top);
      if (raw === null || !(raw > 0)) return;
      drag.price = roundToTick(raw, tickRef.current);
      lines.get(drag.spec.id)?.line.applyOptions({ price: drag.price });
    };

    const onPointerUp = () => {
      if (!drag) return;
      const { spec, price } = drag;
      drag = null;
      chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
      const container = containerRef.current;
      if (container) container.dataset.tradeLineDrag = 'false';
      if (!spec.drag || price === spec.price) {
        sync();
        return;
      }
      heldRef.current = { id: spec.id, price };
      const y = candleRef.current?.priceToCoordinate(price) ?? 0;
      setAmend({
        target: spec.drag,
        label: dragTargetLabel(spec.drag),
        price,
        y,
        busy: false,
        error: null,
      });
    };

    sync();
    const unsubs = [
      usePaperStore.subscribe(sync),
      useLayoutStore.subscribe(sync),
      paneStores[paneIndex].subscribe((s, prev) => {
        if (s.markPrice !== prev.markPrice) sync();
      }),
    ];
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      for (const unsub of unsubs) unsub();
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      // Read the refs now, on purpose: the chart may already be gone (ChartPanel removes it in
      // its own cleanup and nulls chartRef) — only a still-live series owns its lines
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const series = candleRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (series && chartRef.current) {
        for (const { line } of lines.values()) series.removePriceLine(line);
      }
      lines.clear();
      syncRef.current = () => undefined;
    };
  }, [paneIndex, chartRef, candleRef, containerRef]);

  const cancelAmend = useCallback(() => {
    heldRef.current = null;
    setAmend(null);
    syncRef.current();
  }, []);

  const confirmAmend = useCallback(async () => {
    if (!amend || amend.busy) return;
    setAmend({ ...amend, busy: true, error: null });
    const error = await sendAmend(amend.target, amend.price);
    if (error) {
      setAmend({ ...amend, busy: false, error });
      return;
    }
    heldRef.current = null;
    setAmend(null);
    syncRef.current();
  }, [amend]);

  return { amend, confirmAmend, cancelAmend };
}
