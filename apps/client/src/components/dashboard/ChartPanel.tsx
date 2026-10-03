import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  IPaneApi,
  IPriceLine,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { useStore } from 'zustand';
import { DrawingManager, ToolRegistry } from 'lightweight-charts-drawing';
import type { Anchor, IDrawing, Point } from 'lightweight-charts-drawing';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import type { ChartType } from '@/store/layoutStore';
import { getIndicatorMeta } from '@/lib/indicators/catalog';
import type { IndicatorInstance, IndicatorPrimitive, IndicatorStyle } from '@/lib/indicators/types';
import { bg, border, color, chart as chartColors, font, fontSize } from '@/lib/tokens';
import { paneHeights, subPaneTargetIndex } from '@/lib/indicators/paneLayout';
import {
  INTERVAL_BAR_SPACING,
  getPresetSeconds,
  type Interval,
  type TimeRangePreset,
} from '@/lib/markets';
import {
  restoreDrawings,
  persistDrawings,
  schedulePersistDrawings,
  getPersistenceKey,
} from '@/lib/drawingManager';
import { pendingSyncRange, runPaneDataPush } from '@/lib/chartSync';
import { toHeikinAshi } from '@/lib/heikinAshi';
import { IndicatorLegends } from '@/components/indicators/IndicatorLegends';
import { useTradeLines } from '@/hooks/useTradeLines';
import { TradeLineAmend } from './TradeLineAmend';

const CHART_BG = chartColors.bg;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  paneIndex: 0 | 1 | 2 | 3;
  symbol: string;
  interval: Interval;
  timeRangePreset?: TimeRangePreset | null;
  indicators: IndicatorInstance[];
  /** 'heikinAshi' draws HA candles (display-only; see lib/heikinAshi.ts). */
  chartType?: ChartType;
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => void;
  onChartDestroy?: () => void;
  onDrawingManagerReady?: (manager: DrawingManager) => void;
  activeToolType?: string | null;
  onToolChange?: (toolType: string | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatUTCTime(secs: number): string {
  const d = new Date(secs * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${DAYS[d.getUTCDay()]} ${dd} ${MONTHS[d.getUTCMonth()]} '${yy} ${hh}:${mm}`;
}

// ─── Legend data ──────────────────────────────────────────────────────────────

interface LegendData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function toUTC(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

const PADDING_BARS = 200;
/** Empty bars kept between the newest candle and the right edge on (re)load. */
const RIGHT_GAP_BARS = 5;

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
};

function getDrawingText(d: IDrawing): string {
  return (d as unknown as { getText?: () => string }).getText?.() ?? '';
}

function setDrawingText(d: IDrawing, text: string): void {
  (d as unknown as { setText?: (t: string) => void }).setText?.(text);
}

export function ChartPanel({
  paneIndex,
  symbol,
  interval,
  timeRangePreset,
  indicators,
  chartType = 'candles',
  onChartReady,
  onChartDestroy,
  onDrawingManagerReady,
  activeToolType,
  onToolChange,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const prevLenRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const managerRef = useRef<DrawingManager | null>(null);
  const prevSymbolRef = useRef<string>('');
  const pendingAnchorsRef = useRef<Anchor[] | null>(null);
  const clickStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const paddingSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const primitiveRefs = useRef<Map<string, IndicatorPrimitive>>(new Map());
  // One lightweight-charts pane per shown sub-pane indicator instance (owner, 2026-10-03). Kept as
  // pane APIs, never as numeric indices: an index shifts when a pane above it is removed.
  const paneRefs = useRef<Map<string, IPaneApi<Time>>>(new Map());
  // The chart and candle series as state (not only refs) so the legend, a child whose effects run
  // before this component's, can subscribe once they exist
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [candleApi, setCandleApi] = useState<ISeriesApi<'Candlestick'> | null>(null);
  // Bumped whenever an indicator's series or pane comes or goes — the legend re-measures
  const [indicatorLayoutVersion, setIndicatorLayoutVersion] = useState(0);
  // The one observer waiting for the chart to get a height before the panes are rebalanced — at
  // most one at a time, replaced by each new wait and disconnected on unmount
  const rebalanceObserverRef = useRef<ResizeObserver | null>(null);

  const bars = useStore(paneStores[paneIndex], (s) => s.bars);

  const chartReadyRef = useRef(false);
  const prevIntervalRef = useRef(interval);
  // 🔐 Separate from prevSymbolRef above — that one drives the drawings-
  // persistence effect and has its own sequencing. This one only tracks
  // which symbol the bars-push effect below last rendered for.
  const prevBarsSymbolRef = useRef(symbol);
  // Chart type the candle series was last filled with — a change forces a
  // full setData (not .update()) but keeps the user's zoom.
  const prevChartTypeRef = useRef(chartType);
  // HA mode hides the series' own last-value label (it would show the HA
  // close) and shows the REAL last price on this line instead.
  const realPriceLineRef = useRef<IPriceLine | null>(null);
  const userZoomedRef = useRef(false);

  const [hoverData, setHoverData] = useState<LegendData | null>(null);
  const [editingTextInfo, setEditingTextInfo] = useState<{
    drawingId: string;
    text: string;
  } | null>(null);

  // ── Zoom-in selection ──────────────────────────────────────────────────
  const [zoomRect, setZoomRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const zoomDragRef = useRef(false);
  const zoomStartRef = useRef({ x: 0, y: 0 });
  const onToolChangeRef = useRef(onToolChange);
  const bodyDragRef = useRef<{
    startX: number;
    startY: number;
    startAnchors: { time: number; price: number }[];
    drawingId: string;
  } | null>(null);
  useEffect(() => {
    onToolChangeRef.current = onToolChange;
  });

  // ── 1. Create chart + drawing manager once on mount ──────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_BG },
        textColor: chartColors.textColor,
        fontFamily: font.sans,
        fontSize: 12,
        attributionLogo: false,
        // Indicator panes resize by dragging the separators (owner, 2026-10-03)
        panes: {
          enableResize: true,
          separatorColor: border.default,
          separatorHoverColor: border.hover,
        },
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      // 🔐 Autoscale stays ON. It used to be forced off and only pulsed on for
      //    one rAF after a data load, which froze whatever range that single
      //    frame computed — if it was a flat WS cold-aggregator snapshot or the
      //    flat padding series, the axis collapsed to ~0.1 USDT and every candle
      //    rendered as a full-height bar until reload. Drawing/indicator
      //    primitives must NOT implement autoscaleInfo, and the padding series
      //    opts out via autoscaleInfoProvider below. A manual price-axis drag
      //    turns autoscale off (lw-charts built-in); double-click restores it.
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.07)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 6,
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) => formatUTCTime(time),
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // ── Series ──────────────────────────────────────────────────────────────
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.candleUp,
      downColor: chartColors.candleDown,
      borderUpColor: chartColors.candleUp,
      borderDownColor: chartColors.candleDown,
      wickUpColor: chartColors.candleUp,
      wickDownColor: chartColors.candleDown,
    });

    // ── Invisible padding: extends time scale into empty space ─────────
    paddingSeriesRef.current = chart.addSeries(LineSeries, {
      color: 'transparent',
      // Flat line at lastClose — must never shape the price axis.
      autoscaleInfoProvider: () => null,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // ── Drawing manager ────────────────────────────────────────────────────
    const manager = new DrawingManager();
    managerRef.current = manager;

    // ── Drawings live on the price pane only (owner, 2026-10-03) ───────────
    // Below it are the indicator panes. 🔐 Every handler below clamps to, or ignores anything
    // that starts outside, the price pane: its candle series can't map a sub-pane's y to a price.
    const mainPaneHeight = () => chart.paneSize(0).height;
    const inMainPane = (y: number) => y >= 0 && y <= mainPaneHeight();
    // The library selects a drawing on a chart click, hit-testing `param.point` — which is
    // relative to the pane clicked (verified in lightweight-charts 5.2.0: the crosshair point is
    // pane-local), so a click near a sub-pane's top would select a drawing near the price pane's.
    // Its handler is private API; it's wrapped before attach() subscribes it.
    const managerInternals = manager as unknown as {
      handleClick: (param: MouseEventParams<Time>) => void;
    };
    const libraryHandleClick = managerInternals.handleClick;
    managerInternals.handleClick = (param) => {
      if ((param.paneIndex ?? 0) !== 0) return;
      libraryHandleClick(param);
    };

    manager.attach(chart, candleRef.current as never, containerRef.current);
    // 🔐 lightweight-charts-drawing's base drawing implements autoscaleInfo()
    //    from its anchor prices, regardless of the visible time range — with
    //    autoscale ON, one far-off trendline would stretch the price axis and
    //    squash the candles. Opt every drawing out as it's added. Subscribed
    //    before restoreDrawings so persisted drawings are covered too.
    const unsubAutoscale = manager.on('drawing:added', ({ drawing }) => {
      if (drawing) Object.assign(drawing, { autoscaleInfo: () => null });
    });
    restoreDrawings(manager, symbol);
    prevSymbolRef.current = symbol;

    // 🔐 Persist under the CURRENT symbol, not the mount-time one — prevSymbolRef
    //    is kept current by the symbol-change effect below, so a drawing made
    //    after switching BTC→ETH writes to the ETH key instead of overwriting
    //    BTC's saved drawings (silent data loss). Debounced to avoid re-writing
    //    the full set on every anchor-drag pointermove.
    const save = () => schedulePersistDrawings(manager, prevSymbolRef.current ?? symbol);
    const unsubAdd = manager.on('drawing:added', save);
    const unsubRemove = manager.on('drawing:removed', save);
    const unsubUpdate = manager.on('drawing:updated', save);
    const unsubClear = manager.on('drawing:cleared', save);

    onDrawingManagerReady?.(manager);

    // ── Drawing placement (click-to-place) ─────────────────────────────────
    const resolveTime = (x: number): UTCTimestamp | null => {
      const t = chart.timeScale().coordinateToTime(x);
      if (t !== null) return t as UTCTimestamp;

      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;

      const cd = candleRef.current;
      if (!cd) return null;
      const data = cd.data();
      if (data.length < 2) return null;

      const last = data[data.length - 1];
      const lastTime = last.time as UTCTimestamp;
      const prev = data[data.length - 2];
      const barInterval = lastTime - (prev.time as UTCTimestamp);
      if (barInterval <= 0) return null;

      for (const ref of [last, data[0]]) {
        const refX = chart.timeScale().timeToCoordinate(ref.time);
        if (refX === null) continue;
        const refLogical = chart.timeScale().coordinateToLogical(refX);
        if (refLogical === null) continue;
        const offset = ref === last ? 0 : data.length - 1;
        const refTime = ref.time as UTCTimestamp;
        return (refTime + (logical - (refLogical + offset)) * barInterval) as UTCTimestamp;
      }

      const vr = chart.timeScale().getVisibleLogicalRange();
      if (vr && logical > Math.floor(vr.to)) {
        const barsPast = logical - Math.floor(vr.to);
        return (lastTime + barsPast * barInterval) as UTCTimestamp;
      }

      return null;
    };

    const removePreview = () => {
      try {
        manager.removeDrawing('__preview__');
      } catch {
        // preview may not exist
      }
    };

    const updatePreview = (mouseX: number, mouseY: number, paneHeight: number) => {
      const pending = pendingAnchorsRef.current;
      if (!pending) return;

      const activeTool = manager.getActiveTool();
      if (!activeTool) return;

      const registry = ToolRegistry.getInstance();
      const toolDef = registry.get(activeTool);
      if (!toolDef) return;

      if (pending.length >= toolDef.requiredAnchors) {
        removePreview();
        return;
      }

      const time = resolveTime(mouseX);
      const clampedY = Math.max(0, Math.min(mouseY, Math.min(paneHeight, mainPaneHeight())));
      const price = candleRef.current?.coordinateToPrice(clampedY);
      if (time === null || price === null || price === undefined) return;

      const mouseAnchor: Anchor = { time, price };
      const previewAnchors: Anchor[] = [...pending];
      const remaining = toolDef.requiredAnchors - pending.length;
      for (let i = 0; i < remaining; i++) previewAnchors.push(mouseAnchor);

      removePreview();

      const previewDrawing = registry.createDrawing(
        activeTool,
        '__preview__',
        previewAnchors,
        { lineDash: [5, 5] as never },
        {}
      );
      if (previewDrawing) {
        manager.addDrawing(previewDrawing);
      }
    };

    // ── Body drag-to-reposition ──────────────────────────────────────────
    /** Intercept mousedown in capturing phase so we can prevent the
     *  lightweight-charts canvas from receiving the event and starting a
     *  chart pan when the user drags a drawing body. */
    const handleBodyMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const m = managerRef.current;
      if (!m || m.getActiveTool()) return;

      const rect = container.getBoundingClientRect();
      const point: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // A press in an indicator pane never grabs a drawing — and deselecting first stops the
      // library's own mousedown from starting an anchor drag there (it only drags the selected one)
      if (!inMainPane(point.y)) {
        if (m.getSelectedDrawing()) m.deselectAll();
        return;
      }

      // Anchor drag — let DrawingManager handle via bubbling phase (no stop)
      if (m.hitTestAnchor(point) !== null) return;

      const hit = m.hitTest(point);
      if (!hit || hit.options.locked) return;

      // Body drag — stop propagation so the canvas never receives the event
      e.stopPropagation();

      // Select the drawing if not already
      const selected = m.getSelectedDrawing();
      if (selected?.id !== hit.id) {
        m.selectDrawing(hit.id);
      }

      bodyDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startAnchors: hit.anchors.map((a) => ({ time: a.time as number, price: a.price })),
        drawingId: hit.id,
      };
      hit.setState('editing');
    };

    const handleBodyMouseUp = () => {
      const drag = bodyDragRef.current;
      if (!drag) return;

      const m = managerRef.current;
      if (!m) {
        bodyDragRef.current = null;
        return;
      }

      const drawing = m.getSelectedDrawing();
      if (drawing) {
        drawing.setState('selected');
        persistDrawings(m, prevSymbolRef.current);
      }
      bodyDragRef.current = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      updatePreview(e.clientX - rect.left, e.clientY - rect.top, rect.height);

      // Body drag
      const drag = bodyDragRef.current;
      if (!drag) return;

      const m = managerRef.current;
      const cs = candleRef.current;
      if (!m || !cs) return;

      const drawing = m.getSelectedDrawing();
      if (!drawing || drawing.id !== drag.drawingId) return;

      const startTime = resolveTime(drag.startX - rect.left);
      const currTime = resolveTime(e.clientX - rect.left);
      const startRY = Math.max(0, Math.min(drag.startY - rect.top, mainPaneHeight()));
      const currRY = Math.max(0, Math.min(e.clientY - rect.top, mainPaneHeight()));
      const startPrice = cs.coordinateToPrice(startRY);
      const currPrice = cs.coordinateToPrice(currRY);
      if (startTime === null || currTime === null || startPrice === null || currPrice === null)
        return;

      const timeOffset = (currTime as number) - (startTime as number);
      const priceOffset = currPrice - startPrice;

      drawing.setAnchors(
        drag.startAnchors.map((a) => ({
          time: (a.time + timeOffset) as UTCTimestamp,
          price: a.price + priceOffset,
        }))
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingAnchorsRef.current) {
        pendingAnchorsRef.current = null;
        removePreview();
        manager.setActiveTool(null);
      }
    };

    // ── Right-click → cursor (selection) mode ─────────────────────────────
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      bodyDragRef.current = null;
      onToolChangeRef.current?.(null);
    };

    const unsubToolChanged = manager.on('tool:changed', () => {
      pendingAnchorsRef.current = null;
      removePreview();
    });

    // ── Tool-active click handling (pointer-based, works in empty space) ───
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!manager.getActiveTool()) return;
      // A click that starts in an indicator pane places no anchor
      if (!inMainPane(e.clientY - container.getBoundingClientRect().top)) {
        clickStartRef.current = null;
        return;
      }
      clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const start = clickStartRef.current;
      clickStartRef.current = null;
      if (!start) return;

      const activeTool = manager.getActiveTool();
      if (!activeTool) return;

      const dist = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y);
      const elapsed = Date.now() - start.time;
      if (dist > 8 || elapsed > 500) return;

      const rect = container.getBoundingClientRect();
      const time = resolveTime(e.clientX - rect.left);
      const mouseY = e.clientY - rect.top;
      if (!inMainPane(mouseY)) return;
      const price = candleRef.current?.coordinateToPrice(mouseY);
      if (time === null || price === null || price === undefined) return;

      const anchor: Anchor = { time, price };

      if (!pendingAnchorsRef.current) {
        pendingAnchorsRef.current = [];
      }

      pendingAnchorsRef.current.push(anchor);

      const registry = ToolRegistry.getInstance();
      const toolDef = registry.get(activeTool);
      if (!toolDef) return;

      if (pendingAnchorsRef.current.length >= toolDef.requiredAnchors) {
        removePreview();
        const drawing = registry.createDrawing(
          activeTool,
          crypto.randomUUID(),
          pendingAnchorsRef.current,
          {},
          {}
        );
        if (drawing) {
          manager.addDrawing(drawing);
        }
        pendingAnchorsRef.current = null;
      }
    };

    const container = containerRef.current;
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mousedown', handleBodyMouseDown, { capture: true });
    document.addEventListener('mouseup', handleBodyMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    container.addEventListener('contextmenu', handleContextMenu);

    // ── Double-click text editing ─────────────────────────────────────────
    const TEXT_DRAWING_TYPES = new Set([
      'text-annotation',
      'anchored-text',
      'note',
      'callout',
      'comment',
    ]);

    const handleDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const point: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      if (!inMainPane(point.y)) return;
      const hit = manager.hitTest(point);
      if (hit && TEXT_DRAWING_TYPES.has(hit.type)) {
        const text = getDrawingText(hit);
        setEditingTextInfo({ drawingId: hit.id, text });
      }
    };
    container.addEventListener('dblclick', handleDblClick);

    // ── Crosshair (hover legend) ───────────────────────────────────────────
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || !candleRef.current) {
        setHoverData(null);
        return;
      }

      const candle = param.seriesData.get(candleRef.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!candle) {
        setHoverData(null);
        return;
      }

      setHoverData({
        time: formatUTCTime(param.time as number),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    });

    // ── ResizeObserver ─────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined;
        chartRef.current?.applyOptions({ width: clientWidth, height: clientHeight });
      });
    });
    ro.observe(containerRef.current);

    if (candleRef.current) {
      onChartReady?.(chart, candleRef.current);
    }
    setChartApi(chart);
    setCandleApi(candleRef.current);

    chartReadyRef.current = true;

    return () => {
      chartReadyRef.current = false;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      unsubAdd();
      unsubRemove();
      unsubUpdate();
      unsubClear();
      unsubAutoscale();
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      container.removeEventListener('pointerup', handlePointerUp);
      unsubToolChanged();
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mousedown', handleBodyMouseDown, { capture: true });
      document.removeEventListener('mouseup', handleBodyMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('dblclick', handleDblClick);
      bodyDragRef.current = null;
      manager.detach();
      managerRef.current = null;
      chart.remove();
      chartRef.current = null;
      setChartApi(null);
      setCandleApi(null);
      // The price line died with the chart — StrictMode re-mounts must not
      // call applyOptions on it.
      realPriceLineRef.current = null;
      onChartDestroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create once

  // ── Position / order lines (BP-3) — after the chart exists (effect order) ──
  const { amend, confirmAmend, cancelAmend } = useTradeLines({
    paneIndex,
    chartRef,
    candleRef,
    containerRef,
    toolActive: !!activeToolType,
  });

  // ── Re-persist on symbol change ──────────────────────────────────────────
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) {
      prevSymbolRef.current = symbol;
      return;
    }
    if (prevSymbolRef.current && prevSymbolRef.current !== symbol) {
      const prevKey = getPersistenceKey(prevSymbolRef.current);
      localStorage.setItem(prevKey, JSON.stringify(manager.exportDrawings()));
      // 🔐 Update prevSymbolRef to the NEW symbol before clearAll/restoreDrawings,
      //    not after. Those calls synchronously emit drawing:cleared/added
      //    events, each invoking the `save` closure above (which persists under
      //    prevSymbolRef.current) — if that ref still pointed at the old symbol
      //    here, the debounced save fires later with the new symbol's restored
      //    drawings but keyed to the old symbol's localStorage key, silently
      //    overwriting the backup line 578 just wrote.
      prevSymbolRef.current = symbol;
      manager.clearAll();
      restoreDrawings(manager, symbol);
    } else {
      prevSymbolRef.current = symbol;
    }
  }, [symbol]);

  // ── 2. Push data whenever bars changes ───────────────────────────────────
  useEffect(() => {
    if (bars.length === 0) {
      userZoomedRef.current = false;
      paneStores[paneIndex].getState().setUserZoomed(false);
      prevLenRef.current = 0;
      candleRef.current?.setData([]);
      paddingSeriesRef.current?.setData([]);
      if (realPriceLineRef.current) {
        candleRef.current?.removePriceLine(realPriceLineRef.current);
        realPriceLineRef.current = null;
      }
      return;
    }

    if (interval !== prevIntervalRef.current || symbol !== prevBarsSymbolRef.current) {
      // 🔐 A symbol switch must force a full setData() below, same as an
      // interval switch already does — otherwise, once a pane has loaded
      // full history (bars.length pinned at MAX_BARS), the new symbol's bars
      // array commonly lands at the same length as the old one, and the
      // length-equality check below wrongly takes the .update() branch —
      // splicing one new-symbol candle onto a series still otherwise showing
      // the previous symbol's candles, corrupting the chart until the
      // interval changes or the page reloads.
      prevIntervalRef.current = interval;
      prevBarsSymbolRef.current = symbol;
      prevLenRef.current = 0;
      paneStores[paneIndex].getState().setUserZoomed(false);
      return;
    }

    if (!chartReadyRef.current) return;

    const dedupMap = new Map<number, (typeof bars)[0]>();
    for (const b of bars) dedupMap.set(b.timestamp, b);
    const sortedBars = Array.from(dedupMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    // ── Data push ──────────────────────────────────────────────────────────
    // Save visible logical range before setData calls — lightweight-charts
    // has a known bug where setData resets the visible range (SO #63557823).
    const notFirstLoad = prevLenRef.current > 0;
    const barDiff = Math.abs(sortedBars.length - prevLenRef.current);
    const isReload = barDiff > 1;
    const savedRange =
      notFirstLoad && !isReload
        ? (chartRef.current?.timeScale().getVisibleLogicalRange() ?? undefined)
        : undefined;

    // 🔐 Sync broadcasts from this pane are suppressed until the push has
    //    finished — see runPaneDataPush in lib/chartSync.ts.
    const chartTypeChanged = chartType !== prevChartTypeRef.current;
    prevChartTypeRef.current = chartType;

    runPaneDataPush(paneIndex, () => {
      const realData = sortedBars.map((b) => ({
        time: toUTC(b.timestamp),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
      // HA bars depend on the previous HA bar, so the whole series is
      // converted even when only the last bar is pushed via .update().
      const candleData = chartType === 'heikinAshi' ? toHeikinAshi(realData) : realData;
      if (sortedBars.length === prevLenRef.current && !chartTypeChanged) {
        candleRef.current?.update(candleData[candleData.length - 1]);
      } else {
        candleRef.current?.setData(candleData);
      }

      // Real last-price label: the series' own label in candles mode; in HA
      // mode a separate price line, since the series' last value is HA.
      const heikinAshi = chartType === 'heikinAshi';
      candleRef.current?.applyOptions({
        lastValueVisible: !heikinAshi,
        priceLineVisible: !heikinAshi,
      });
      const lastReal = realData[realData.length - 1];
      const lastColor =
        lastReal.close >= lastReal.open ? chartColors.candleUp : chartColors.candleDown;
      if (heikinAshi) {
        if (realPriceLineRef.current) {
          realPriceLineRef.current.applyOptions({ price: lastReal.close, color: lastColor });
        } else if (candleRef.current) {
          realPriceLineRef.current = candleRef.current.createPriceLine({
            price: lastReal.close,
            color: lastColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
          });
        }
      } else if (realPriceLineRef.current) {
        candleRef.current?.removePriceLine(realPriceLineRef.current);
        realPriceLineRef.current = null;
      }

      // ── Extend time scale into empty space so coordinateToTime works ──
      if (sortedBars.length > 1) {
        const barSec = INTERVAL_SECONDS[interval];
        const lastBar = sortedBars[sortedBars.length - 1];
        const lastClose = lastBar.close;
        const lastT = toUTC(lastBar.timestamp);
        const paddingData: { time: UTCTimestamp; value: number }[] = [];
        for (let i = 1; i <= PADDING_BARS; i++) {
          paddingData.push({ time: (lastT + i * barSec) as UTCTimestamp, value: lastClose });
        }
        paddingSeriesRef.current?.setData(paddingData);
      }

      // Restore saved logical range (setData resets it — known lw-charts bug). 🔐 A range the time
      // sync queued but the chart hasn't drawn yet wins: savedRange was read before it applied, and
      // restoring that would undo the sync for good (10.4.6, see queueSyncedRange in chartSync.ts).
      const pendingSync = notFirstLoad && !isReload ? pendingSyncRange(paneIndex) : undefined;
      if (pendingSync) {
        try {
          chartRef.current
            ?.timeScale()
            .setVisibleRange(pendingSync as { from: UTCTimestamp; to: UTCTimestamp });
        } catch {
          // The new data can leave the time scale refusing a range queued against the old one
          // ("Value is null"): fall back to the plain restore rather than abort the push
          if (savedRange) chartRef.current?.timeScale().setVisibleLogicalRange(savedRange);
        }
      } else if (savedRange && notFirstLoad) {
        chartRef.current?.timeScale().setVisibleLogicalRange(savedRange);
      }

      const timeScale = chartRef.current?.timeScale();
      const firstTime = toUTC(sortedBars[0].timestamp);
      const lastTime = toUTC(sortedBars[sortedBars.length - 1].timestamp);
      const visibleRange = timeScale?.getVisibleRange() as
        | { from: UTCTimestamp; to: UTCTimestamp }
        | null
        | undefined;

      const isFirstLoad = !notFirstLoad;
      const isOutOfRange =
        !visibleRange || lastTime < visibleRange.from || firstTime > visibleRange.to;

      if (isFirstLoad || isReload || (isOutOfRange && !userZoomedRef.current)) {
        // Re-enable in case the user dragged the price axis (which disables it).
        chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
        timeScale?.applyOptions({ barSpacing: INTERVAL_BAR_SPACING[interval] });
        if (!timeRangePreset) {
          // 🔐 Not scrollToRealTime(): the time scale's "real time" end is the
          //    last PADDING bar, 200 bars past the newest candle. In a narrow
          //    pane (split layouts, higher intervals) that parked the view on
          //    empty future space with zero candles visible — and with nothing
          //    to fit, the price axis showed a stale/collapsed range, so
          //    scrolling back revealed full-height "tall" candles. Anchor the
          //    newest real candle RIGHT_GAP_BARS from the right edge instead.
          const paddingBars = sortedBars.length > 1 ? PADDING_BARS : 0;
          timeScale?.scrollToPosition(RIGHT_GAP_BARS - paddingBars, false);
        }
      }
    });
    prevLenRef.current = sortedBars.length;
  }, [bars, interval, timeRangePreset, paneIndex, symbol, chartType]);

  // ── 3. Indicator primitive lifecycle ───────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const source = candleRef.current;
    if (!chart || !source) return;

    const primitives = primitiveRefs.current;
    const panes = paneRefs.current;
    const rebalanceObserver = rebalanceObserverRef;
    let changed = false;

    /** Series first, then the instance's own pane (owner, 2026-10-03: remove → removePane) */
    const tearDown = (instanceId: string) => {
      const prim = primitives.get(instanceId);
      if (prim) {
        try {
          source.detachPrimitive(prim);
        } catch {
          /* already detached */
        }
        for (const s of prim.getSeries()) {
          try {
            chart.removeSeries(s);
          } catch {
            /* already removed */
          }
        }
        primitives.delete(instanceId);
        changed = true;
      }
      const pane = panes.get(instanceId);
      if (pane) {
        // Read the index now: it shifts whenever a pane above this one goes
        const index = pane.paneIndex();
        if (index > 0) {
          try {
            chart.removePane(index);
          } catch {
            /* already removed */
          }
        }
        panes.delete(instanceId);
        changed = true;
      }
    };

    const nextIds = new Set(indicators.map((i) => i.instanceId));
    for (const instanceId of [...primitives.keys(), ...panes.keys()]) {
      if (!nextIds.has(instanceId)) tearDown(instanceId);
    }

    // Pane order = the order the indicators were added (the store keeps them in that order)
    const subPaneIds = indicators
      .filter((i) => getIndicatorMeta(i.indicatorId)?.category === 'sub-pane')
      .map((i) => i.instanceId);

    for (const inst of indicators) {
      if (!inst.enabled) {
        // Hidden: no series, and no empty pane left behind (owner, 2026-10-03)
        tearDown(inst.instanceId);
        continue;
      }

      const meta = getIndicatorMeta(inst.indicatorId);
      if (!meta) continue;

      const existing = primitives.get(inst.instanceId);
      if (existing) {
        existing.applyOptions(inst.params);
        existing.applyStyle({
          color: inst.color,
          lineWidth: inst.lineWidth,
          lineStyle: inst.lineStyle,
        });
        continue;
      }

      const style: IndicatorStyle = {
        color: inst.color,
        lineWidth: inst.lineWidth,
        lineStyle: inst.lineStyle,
      };
      // Pane indices are this chart's own (0 = candles), unrelated to the layout grid's paneIndex.
      // A sub-pane indicator gets a pane of its own, so two Momentums are two panes, each with its
      // own right price scale — as on TradingView and Bybit.
      let targetPane = 0;
      if (meta.category === 'sub-pane') {
        const pane = chart.addPane(true);
        const target = subPaneTargetIndex(subPaneIds, inst.instanceId, (id) => panes.has(id));
        if (pane.paneIndex() !== target) pane.moveTo(target);
        panes.set(inst.instanceId, pane);
        targetPane = pane.paneIndex();
      }
      const prim = meta.factory({
        chart,
        source,
        params: inst.params,
        style,
        paneIndex: targetPane,
      });
      primitives.set(inst.instanceId, prim);
      changed = true;
    }

    if (changed) {
      // Rebalance on every add / remove / hide / show (owner, 2026-10-03): the price pane keeps at
      // least half, the indicator panes share the rest equally (lib/indicators/paneLayout.ts). A
      // separator drag in between is kept until the next change — this only runs on one.
      const rebalance = () => {
        if (chartRef.current !== chart) return; // unmounted in between
        const allPanes = chart.panes();
        if (allPanes.length < 2) return;
        const paneArea =
          (containerRef.current?.clientHeight ?? 0) - (chart.timeScale().height() || 0);
        // Not laid out yet (first mount, a fresh 4-chart cell) or hidden (account panel
        // maximized): split once the chart gets a height, never against none. One-shot observer,
        // no polling while it stays hidden.
        if (paneArea <= 0) {
          const el = containerRef.current;
          if (!el) return;
          // Only the latest change's rebalance matters: a wait already pending is replaced
          rebalanceObserverRef.current?.disconnect();
          const ro = new ResizeObserver(() => {
            if (el.clientHeight <= 0) return;
            ro.disconnect();
            if (rebalanceObserverRef.current === ro) rebalanceObserverRef.current = null;
            rebalance();
          });
          rebalanceObserverRef.current = ro;
          ro.observe(el);
          return;
        }
        const { main, sub } = paneHeights(paneArea, allPanes.length - 1);
        // Heights as stretch factors: only their ratio counts
        allPanes.forEach((p, i) => p.setStretchFactor(i === 0 ? main : sub));
      };
      rebalance();
      setIndicatorLayoutVersion((v) => v + 1);
    }

    return () => {
      // 🔐 Diff-aware teardown: this cleanup runs BOTH before every dependency
      //    change re-run AND on unmount. On a re-run the effect body above has
      //    already removed primitives absent from `nextIds`, so tearing down
      //    EVERYTHING here (then rebuilding) would turn the diff logic into
      //    dead code and churn all indicator series on every add/remove/edit
      //    (flicker + rescale). Only do the full teardown on real unmount —
      //    signalled by chartReadyRef.current === false, which the mount-effect
      //    cleanup (declared earlier, so it runs first) sets when the chart is
      //    being destroyed. The chart (and every pane with it) is gone by then,
      //    so only the maps are cleared.
      if (chartReadyRef.current) return;
      primitives.clear();
      panes.clear();
      rebalanceObserver.current?.disconnect();
      rebalanceObserver.current = null;
    };
  }, [indicators, paneIndex]);

  // ── 4. Apply time-range preset when it changes ────────────────────────────
  const prevPresetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !timeRangePreset) return;
    if (bars.length === 0) return;

    // This effect also depends on `bars`, which gets a new array reference on
    // every incoming WebSocket tick — so it re-runs on every tick, not just
    // when the preset/interval actually change. Re-snapping to "now" on every
    // tick would make it impossible to pan to older candles while a preset is
    // active. Only force the snap when the preset or interval itself just
    // changed; otherwise respect a manual zoom the same way the autoscale
    // effect above does (`!userZoomedRef.current`).
    const presetKey = `${timeRangePreset}:${interval}`;
    const presetOrIntervalChanged = prevPresetKeyRef.current !== presetKey;
    prevPresetKeyRef.current = presetKey;
    if (!presetOrIntervalChanged && userZoomedRef.current) return;

    const seconds = getPresetSeconds(timeRangePreset);

    if (seconds === Infinity) {
      chart.timeScale().fitContent();
    } else {
      const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
      chart.timeScale().setVisibleRange({
        from: (now - seconds) as UTCTimestamp,
        to: now,
      });
    }
  }, [timeRangePreset, interval, bars]);

  // ── Zoom-in selection handlers ──────────────────────────────────────────
  const handleZoomPointerDown = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    zoomDragRef.current = true;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    zoomStartRef.current = { x, y };
    setZoomRect({ left: x, top: y, width: 0, height: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleZoomPointerMove = useCallback((e: React.PointerEvent) => {
    if (!zoomDragRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const sx = zoomStartRef.current.x;
    const sy = zoomStartRef.current.y;
    setZoomRect({
      left: Math.min(sx, x),
      top: Math.min(sy, y),
      width: Math.abs(x - sx),
      height: Math.abs(y - sy),
    });
  }, []);

  const handleZoomPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!zoomDragRef.current) return;
      zoomDragRef.current = false;
      const el = containerRef.current;
      const chart = chartRef.current;
      if (!el || !chart) {
        setZoomRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const startX = zoomStartRef.current.x;
      const startLogical = chart.timeScale().coordinateToLogical(startX);
      const endLogical = chart.timeScale().coordinateToLogical(endX);
      if (startLogical !== null && endLogical !== null) {
        const minLogical = Math.min(startLogical, endLogical);
        const maxLogical = Math.max(startLogical, endLogical);
        if (maxLogical - minLogical > 2) {
          chart.timeScale().setVisibleLogicalRange({ from: minLogical, to: maxLogical });
          userZoomedRef.current = true;
          paneStores[paneIndex].getState().setUserZoomed(true);
        }
      }
      setZoomRect(null);
    },
    [paneIndex]
  );

  // ── Escape key exits zoom-in mode ───────────────────────────────────────
  useEffect(() => {
    if (activeToolType !== 'zoom-in') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomRect(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      setZoomRect(null);
    };
  }, [activeToolType]);

  // ── Delete/Backspace removes selected drawing ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      const manager = managerRef.current;
      if (!manager) return;
      const selected = manager.getSelectedDrawing();
      if (selected) {
        e.preventDefault();
        manager.removeDrawing(selected.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The OHLC price legend while hovering; the indicator legends stack under it
  const priceLegend = hoverData ? (
    <div
      className="pointer-events-none rounded-lg border border-white/6 px-3 py-2 backdrop-blur-md"
      style={{ background: `${bg.page}e6` }}
    >
      <p className="mb-1.5" style={{ fontSize: fontSize.xs10, color: color.muted }}>
        {hoverData.time}
        {chartType === 'heikinAshi' && ' · Heikin Ashi'}
      </p>
      <div className="flex items-center gap-2 font-mono" style={{ fontSize: fontSize.xs11 }}>
        <span style={{ color: color.muted }}>O</span>
        <span className="text-slate-200">
          {hoverData.open.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span style={{ color: color.muted }}>H</span>
        <span style={{ color: color.green }}>
          {hoverData.high.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span style={{ color: color.muted }}>L</span>
        <span style={{ color: color.red }}>
          {hoverData.low.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span style={{ color: color.muted }}>C</span>
        <span style={{ color: hoverData.close >= hoverData.open ? color.green : color.red }}>
          {hoverData.close.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <div
        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono"
        style={{ fontSize: fontSize.xs10 }}
      ></div>
    </div>
  ) : null;

  return (
    <div className="relative h-full w-full" style={{ background: CHART_BG }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* ── Confirm a dragged TP / SL / order line (BP-3) ─────────────── */}
      {amend && (
        <TradeLineAmend
          amend={amend}
          onConfirm={() => void confirmAmend()}
          onCancel={cancelAmend}
        />
      )}

      {/* ── Zoom-in selection overlay ─────────────────────────────────── */}
      {activeToolType === 'zoom-in' && (
        <div
          className="absolute inset-0 z-20"
          style={{ cursor: 'zoom-in', touchAction: 'none' }}
          onPointerDown={handleZoomPointerDown}
          onPointerMove={handleZoomPointerMove}
          onPointerUp={handleZoomPointerUp}
        />
      )}
      {zoomRect && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left: zoomRect.left,
            top: zoomRect.top,
            width: zoomRect.width,
            height: zoomRect.height,
            background: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
          }}
        />
      )}

      {editingTextInfo && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
          onMouseDown={() => setEditingTextInfo(null)}
        >
          <div
            className="rounded-lg border border-white/10 bg-gray-900 p-3 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <textarea
              autoFocus
              className="w-64 rounded border border-white/10 bg-gray-800 p-2 text-sm text-white outline-none"
              defaultValue={editingTextInfo.text}
              onChange={(e) =>
                setEditingTextInfo((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onBlur={(e) => {
                const drawing = managerRef.current?.getDrawing(editingTextInfo.drawingId);
                if (drawing) setDrawingText(drawing, e.currentTarget.value);
                setEditingTextInfo(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditingTextInfo(null);
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.stopPropagation();
                  const drawing = managerRef.current?.getDrawing(editingTextInfo.drawingId);
                  if (drawing) setDrawingText(drawing, e.currentTarget.value);
                  setEditingTextInfo(null);
                }
              }}
              rows={3}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded px-2 py-1 text-xs text-white/60 hover:text-white"
                onClick={() => setEditingTextInfo(null)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-500"
                onClick={() => {
                  const drawing = managerRef.current?.getDrawing(editingTextInfo.drawingId);
                  if (drawing) setDrawingText(drawing, editingTextInfo.text);
                  setEditingTextInfo(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <IndicatorLegends
        chart={chartApi}
        source={candleApi}
        containerRef={containerRef}
        primitiveRefs={primitiveRefs}
        paneRefs={paneRefs}
        layoutVersion={indicatorLayoutVersion}
        indicators={indicators}
        priceLegend={priceLegend}
        onRemove={(instanceId) => useLayoutStore.getState().removeIndicator(paneIndex, instanceId)}
        onUpdate={(instanceId, updates) =>
          useLayoutStore.getState().updateIndicator(paneIndex, instanceId, updates)
        }
      />
    </div>
  );
}
