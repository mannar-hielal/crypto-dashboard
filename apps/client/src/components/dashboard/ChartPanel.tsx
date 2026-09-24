import { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useStore } from 'zustand';
import { DrawingManager, ToolRegistry } from 'lightweight-charts-drawing';
import type { Anchor, IDrawing, Point } from 'lightweight-charts-drawing';
import { paneStores } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import { getIndicatorMeta } from '@/lib/indicators/catalog';
import type { IndicatorInstance, IndicatorPrimitive, IndicatorStyle } from '@/lib/indicators/types';
import { bg, color, chart as chartColors, font, fontSize } from '@/lib/tokens';
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
import { IndicatorWidgets } from '@/components/indicators/IndicatorWidgets';

const CHART_BG = chartColors.bg;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  paneIndex: 0 | 1 | 2 | 3;
  symbol: string;
  interval: Interval;
  timeRangePreset?: TimeRangePreset | null;
  indicators: IndicatorInstance[];
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

  const bars = useStore(paneStores[paneIndex], (s) => s.bars);

  const chartReadyRef = useRef(false);
  const prevIntervalRef = useRef(interval);
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
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)', autoScale: false },
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
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // ── Drawing manager ────────────────────────────────────────────────────
    const manager = new DrawingManager();
    managerRef.current = manager;

    manager.attach(chart, candleRef.current as never, containerRef.current);
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
      const clampedY = Math.max(0, Math.min(mouseY, paneHeight));
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
      const startRY = Math.max(0, Math.min(drag.startY - rect.top, rect.height));
      const currRY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
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
      const clampedY = Math.max(0, Math.min(mouseY, rect.height));
      const price = candleRef.current?.coordinateToPrice(clampedY);
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

    chartReadyRef.current = true;

    return () => {
      chartReadyRef.current = false;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      unsubAdd();
      unsubRemove();
      unsubUpdate();
      unsubClear();
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
      onChartDestroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create once

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
      return;
    }

    if (interval !== prevIntervalRef.current) {
      prevIntervalRef.current = interval;
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

    const candleData = sortedBars.map((b) => ({
      time: toUTC(b.timestamp),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    if (sortedBars.length === prevLenRef.current) {
      candleRef.current?.update(candleData[candleData.length - 1]);
    } else {
      candleRef.current?.setData(candleData);
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

    // Restore saved logical range (setData resets it — known lw-charts bug)
    if (savedRange && notFirstLoad) {
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
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
      requestAnimationFrame(() => {
        chartRef.current?.priceScale('right').applyOptions({ autoScale: false });
      });
      timeScale?.applyOptions({ barSpacing: INTERVAL_BAR_SPACING[interval] });
      if (!timeRangePreset) {
        timeScale?.scrollToRealTime();
      }
    }
    prevLenRef.current = sortedBars.length;
  }, [bars, interval, timeRangePreset, paneIndex]);

  // ── 3. Indicator primitive lifecycle ───────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const source = candleRef.current;
    if (!chart || !source) return;

    const primitives = primitiveRefs.current;
    const prevIds = new Set(primitives.keys());
    const nextIds = new Set(indicators.map((i) => i.instanceId));

    for (const instanceId of prevIds) {
      if (!nextIds.has(instanceId)) {
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
        }
        primitives.delete(instanceId);
      }
    }

    for (const inst of indicators) {
      if (!inst.enabled) {
        const prim = primitives.get(inst.instanceId);
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
          primitives.delete(inst.instanceId);
        }
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
      } else {
        const style: IndicatorStyle = {
          color: inst.color,
          lineWidth: inst.lineWidth,
          lineStyle: inst.lineStyle,
        };
        // Panes are relative to THIS chart instance (0 = candles, 1 = first
        // sub-pane), not to the layout grid — the layout's paneIndex is
        // unrelated to lightweight-charts pane indices.
        const actualPaneIndex = meta.category === 'sub-pane' ? 1 : 0;
        const prim = meta.factory({
          chart,
          source,
          params: inst.params,
          style,
          paneIndex: actualPaneIndex,
        });
        primitives.set(inst.instanceId, prim);
      }
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
      //    being destroyed.
      if (chartReadyRef.current) return;

      for (const [, prim] of primitives) {
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
      }
      primitives.clear();
    };
  }, [indicators, paneIndex]);

  // ── 4. Apply time-range preset when it changes ────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !timeRangePreset) return;
    if (bars.length === 0) return;

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

  return (
    <div className="relative h-full w-full" style={{ background: CHART_BG }}>
      <div ref={containerRef} className="h-full w-full" />

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

      {hoverData && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/6 px-3 py-2 backdrop-blur-md"
          style={{ background: `${bg.page}e6` }}
        >
          <p className="mb-1.5" style={{ fontSize: fontSize.xs10, color: color.muted }}>
            {hoverData.time}
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

      <IndicatorWidgets
        containerRef={containerRef}
        primitiveRefs={primitiveRefs}
        indicators={indicators}
        onRemove={(instanceId) => useLayoutStore.getState().removeIndicator(paneIndex, instanceId)}
        onUpdate={(instanceId, updates) =>
          useLayoutStore.getState().updateIndicator(paneIndex, instanceId, updates)
        }
        onPositionChange={(instanceId, position) =>
          useLayoutStore.getState().setIndicatorPosition(paneIndex, instanceId, position)
        }
      />
    </div>
  );
}
