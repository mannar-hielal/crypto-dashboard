import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useStore } from 'zustand';
import { DrawingManager, ToolRegistry } from 'lightweight-charts-drawing';
import type { Anchor, IDrawing, Point } from 'lightweight-charts-drawing';
import { paneStores } from '@/store/paneStore';
import { calcEMA, calcVWAP, calcMACD } from '@/lib/indicators';
import { bg, color, chart as chartColors, font, fontSize } from '@/lib/tokens';
import { INTERVAL_BAR_SPACING, type Interval } from '@/lib/markets';
import { restoreDrawings, persistDrawings, getPersistenceKey } from '@/lib/drawingManager';

const CHART_BG = chartColors.bg;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  paneIndex: 0 | 1 | 2 | 3;
  symbol: string;
  interval: Interval;
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => void;
  onChartDestroy?: () => void;
  onDrawingManagerReady?: (manager: DrawingManager) => void;
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
  ema9: number | null;
  ema20: number | null;
  ema200: number | null;
  vwap: number | null;
}

function toUTC(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

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
  onChartReady,
  onChartDestroy,
  onDrawingManagerReady,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const prevLenRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const managerRef = useRef<DrawingManager | null>(null);
  const prevSymbolRef = useRef<string>('');
  const pendingAnchorsRef = useRef<Anchor[] | null>(null);

  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalRef = useRef<ISeriesApi<'Line'> | null>(null);

  const bars = useStore(paneStores[paneIndex], (s) => s.bars);

  const chartReadyRef = useRef(false);
  const prevIntervalRef = useRef(interval);

  const [hoverData, setHoverData] = useState<LegendData | null>(null);
  const [editingTextInfo, setEditingTextInfo] = useState<{
    drawingId: string;
    text: string;
  } | null>(null);

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

    ema9Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema9,
      lineWidth: 2,
      title: 'EMA 9',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema20,
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    ema200Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema200,
      lineWidth: 1,
      title: 'EMA 200',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    vwapRef.current = chart.addSeries(LineSeries, {
      color: chartColors.vwap,
      lineWidth: 2,
      lineStyle: LineStyle.SparseDotted,
      title: 'VWAP',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    macdHistRef.current = chart.addSeries(
      HistogramSeries,
      { color: chartColors.macdHistBull, priceLineVisible: false, lastValueVisible: false },
      1
    );

    macdLineRef.current = chart.addSeries(
      LineSeries,
      {
        color: chartColors.macdLine,
        lineWidth: 2,
        title: 'MACD',
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      1
    );

    signalRef.current = chart.addSeries(
      LineSeries,
      {
        color: chartColors.macdSignal,
        lineWidth: 2,
        title: 'Signal',
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      1
    );

    // ── Drawing manager ────────────────────────────────────────────────────
    const manager = new DrawingManager();
    managerRef.current = manager;

    manager.attach(chart, candleRef.current as never, containerRef.current);
    restoreDrawings(manager, symbol);
    prevSymbolRef.current = symbol;

    const save = () => persistDrawings(manager, symbol);
    const unsubAdd = manager.on('drawing:added', save);
    const unsubRemove = manager.on('drawing:removed', save);
    const unsubUpdate = manager.on('drawing:updated', save);
    const unsubClear = manager.on('drawing:cleared', save);

    onDrawingManagerReady?.(manager);

    // ── Drawing placement (click-to-place) ─────────────────────────────────
    const removePreview = () => {
      try {
        manager.removeDrawing('__preview__');
      } catch {
        // preview may not exist
      }
    };

    const updatePreview = (mouseX: number, mouseY: number) => {
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

      const time = chart.timeScale().coordinateToTime(mouseX);
      const price = candleRef.current?.coordinateToPrice(mouseY);
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

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      updatePreview(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingAnchorsRef.current) {
        pendingAnchorsRef.current = null;
        removePreview();
        manager.setActiveTool(null);
      }
    };

    const unsubToolChanged = manager.on('tool:changed', () => {
      pendingAnchorsRef.current = null;
      removePreview();
    });

    const handleChartClick: Parameters<typeof chart.subscribeClick>[0] = (param) => {
      const activeTool = manager.getActiveTool();
      if (!activeTool || !param.point) return;

      const time = chart.timeScale().coordinateToTime(param.point.x);
      const price = candleRef.current?.coordinateToPrice(param.point.y);
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
        manager.setActiveTool(null);
      }
    };
    chart.subscribeClick(handleChartClick);

    const container = containerRef.current;
    container.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);

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

      type OhlcRow = { open: number; high: number; low: number; close: number };
      type LineRow = { value: number };

      const candle = param.seriesData.get(candleRef.current) as OhlcRow | undefined;
      if (!candle) {
        setHoverData(null);
        return;
      }

      const lineVal = (ref: RefObject<ISeriesApi<'Line'> | null>): number | null => {
        if (!ref.current) return null;
        const d = param.seriesData.get(ref.current) as LineRow | undefined;
        return d && 'value' in d ? d.value : null;
      };

      setHoverData({
        time: formatUTCTime(param.time as number),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        ema9: lineVal(ema9Ref),
        ema20: lineVal(ema20Ref),
        ema200: lineVal(ema200Ref),
        vwap: lineVal(vwapRef),
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
      chart.unsubscribeClick(handleChartClick);
      unsubToolChanged();
      container.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('dblclick', handleDblClick);
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
      manager.clearAll();
      restoreDrawings(manager, symbol);
    }
    prevSymbolRef.current = symbol;
  }, [symbol]);

  // ── 2. Push data whenever bars changes ───────────────────────────────────
  useEffect(() => {
    if (bars.length === 0) {
      prevLenRef.current = 0;
      candleRef.current?.setData([]);
      ema9Ref.current?.setData([]);
      ema20Ref.current?.setData([]);
      ema200Ref.current?.setData([]);
      vwapRef.current?.setData([]);
      macdHistRef.current?.setData([]);
      macdLineRef.current?.setData([]);
      signalRef.current?.setData([]);
      return;
    }

    if (interval !== prevIntervalRef.current) {
      prevIntervalRef.current = interval;
      prevLenRef.current = 0;
      return;
    }

    if (!chartReadyRef.current) return;

    const dedupMap = new Map<number, (typeof bars)[0]>();
    for (const b of bars) dedupMap.set(b.timestamp, b);
    const sortedBars = Array.from(dedupMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    const closes = sortedBars.map((b) => b.close);
    const ema9 = calcEMA(closes, 9);
    const ema20 = calcEMA(closes, 20);
    const ema200 = calcEMA(closes, 200);
    const vwap = calcVWAP(sortedBars);
    const { macd, signal, histogram } = calcMACD(closes);

    function linePoints(vals: (number | null)[]) {
      const pts: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < sortedBars.length; i++) {
        if (vals[i] !== null) pts.push({ time: toUTC(sortedBars[i].timestamp), value: vals[i]! });
      }
      return pts;
    }

    candleRef.current?.setData(
      sortedBars.map((b) => ({
        time: toUTC(b.timestamp),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );

    ema9Ref.current?.setData(linePoints(ema9));
    ema20Ref.current?.setData(linePoints(ema20));
    ema200Ref.current?.setData(linePoints(ema200));
    vwapRef.current?.setData(linePoints(vwap));

    const histPts: { time: UTCTimestamp; value: number; color: string }[] = [];
    for (let i = 0; i < sortedBars.length; i++) {
      if (histogram[i] !== null) {
        const val = histogram[i]!;
        const prev = i > 0 ? (histogram[i - 1] ?? val) : val;
        const rising = val >= prev;
        let c: string;
        if (val >= 0) {
          c = rising ? chartColors.macdHistBull : `${chartColors.macdHistBull}66`;
        } else {
          c = rising ? `${chartColors.macdHistBear}66` : chartColors.macdHistBear;
        }
        histPts.push({ time: toUTC(sortedBars[i].timestamp), value: val, color: c });
      }
    }
    macdHistRef.current?.setData(histPts);
    macdLineRef.current?.setData(linePoints(macd));
    signalRef.current?.setData(linePoints(signal));

    const timeScale = chartRef.current?.timeScale();
    const firstTime = toUTC(sortedBars[0].timestamp);
    const lastTime = toUTC(sortedBars[sortedBars.length - 1].timestamp);
    const visibleRange = timeScale?.getVisibleRange() as
      | { from: UTCTimestamp; to: UTCTimestamp }
      | null
      | undefined;

    const isFirstLoad = prevLenRef.current === 0;
    const isOutOfRange =
      !visibleRange || lastTime < visibleRange.from || firstTime > visibleRange.to;

    if (isFirstLoad || isOutOfRange) {
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
      timeScale?.applyOptions({ barSpacing: INTERVAL_BAR_SPACING[interval] });
      timeScale?.scrollToRealTime();
    }
    prevLenRef.current = sortedBars.length;
  }, [bars, interval]);

  return (
    <div className="relative h-full w-full" style={{ background: CHART_BG }}>
      <div ref={containerRef} className="h-full w-full" />

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
          >
            {hoverData.ema9 !== null && (
              <span>
                <span style={{ color: chartColors.ema9 }}>EMA9 </span>
                <span className="text-slate-300">
                  {hoverData.ema9.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            )}
            {hoverData.ema20 !== null && (
              <span>
                <span style={{ color: chartColors.ema20 }}>EMA20 </span>
                <span className="text-slate-300">
                  {hoverData.ema20.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            )}
            {hoverData.ema200 !== null && (
              <span>
                <span style={{ color: chartColors.ema200 }}>EMA200 </span>
                <span className="text-slate-300">
                  {hoverData.ema200.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            )}
            {hoverData.vwap !== null && (
              <span>
                <span style={{ color: chartColors.vwap }}>VWAP </span>
                <span className="text-slate-300">
                  {hoverData.vwap.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            )}
          </div>
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
    </div>
  );
}
