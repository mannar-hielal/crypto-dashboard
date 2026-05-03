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
import { paneStores } from '@/store/paneStore';
import { calcEMA, calcVWAP, calcMACD } from '@/lib/indicators';
import { bg, color, chart as chartColors, font, fontSize } from '@/lib/tokens';
import { INTERVAL_BAR_SPACING, type Interval } from '@/lib/markets';

const CHART_BG = chartColors.bg;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  /** Which pane store to read data from (0–3) */
  paneIndex: 0 | 1 | 2 | 3;
  /**
   * Current interval — used to set the TradingView-matched initial bar
   * spacing on first load and after every symbol/interval change.
   */
  interval: Interval;
  /**
   * Called once when the lightweight-charts instance is ready.
   * Receives both the chart API and the primary candlestick series so that
   * MultiChartArea can use setCrosshairPosition (v5 API).
   */
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => void;
  /** Called when the chart is destroyed (pane unmounts) */
  onChartDestroy?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a UTCTimestamp (seconds) as "Sun 05 Apr '26 17:32" */
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

/** lightweight-charts works in seconds, our store timestamps are milliseconds */
function toUTC(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function ChartPanel({ paneIndex, interval, onChartReady, onChartDestroy }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const prevLenRef = useRef(0); // tracks first-load to trigger scrollToRealTime()

  // ── Series refs (created once, updated on every bars change) ─────────────
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Read bars from this pane's store
  const bars = useStore(paneStores[paneIndex], (s) => s.bars);

  // ── Hover legend state ───────────────────────────────────────────────────
  const [hoverData, setHoverData] = useState<LegendData | null>(null);

  // ── 1. Create chart once on mount ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_BG },
        textColor: '#d1d4dc',
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
        barSpacing: 6, // overridden on first load via INTERVAL_BAR_SPACING
      },
      localization: {
        // Shows "Sun 05 Apr '26 17:32" on the time axis and crosshair tooltip
        timeFormatter: (time: UTCTimestamp) => formatUTCTime(time),
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // ── Pane 0: main candles ────────────────────────────────────────────────
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.candleUp,
      downColor: chartColors.candleDown,
      borderUpColor: chartColors.candleUp,
      borderDownColor: chartColors.candleDown,
      wickUpColor: chartColors.candleUp,
      wickDownColor: chartColors.candleDown,
    });

    // ── Pane 0: EMA 9 — silver/gray ─────────────────────────────────────────
    ema9Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema9,
      lineWidth: 2,
      title: 'EMA 9',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: EMA 20 — blue ───────────────────────────────────────────────
    ema20Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema20,
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: EMA 200 — purple (trend filter, thin — background reference) ─
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: chartColors.ema200,
      lineWidth: 1,
      title: 'EMA 200',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: VWAP — orange sparse-dotted ─────────────────────────────────
    vwapRef.current = chart.addSeries(LineSeries, {
      color: chartColors.vwap,
      lineWidth: 2,
      lineStyle: LineStyle.SparseDotted,
      title: 'VWAP',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 1: MACD histogram (pane auto-created by passing index 1) ────────
    macdHistRef.current = chart.addSeries(
      HistogramSeries,
      { color: chartColors.macdHistBull, priceLineVisible: false, lastValueVisible: false },
      1
    );

    // ── Pane 1: MACD line — blue ────────────────────────────────────────────
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

    // ── Pane 1: Signal line — orange ─────────────────────────────────────────
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

    // ── Crosshair subscription: feeds the hover legend ───────────────────────
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

    // ── ResizeObserver: keeps chart fill its container on any layout change ──
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    ro.observe(containerRef.current);

    // Notify parent so MultiChartArea can wire up sync
    onChartReady?.(chart, candleRef.current!);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      onChartDestroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create once

  // ── 2. Push data whenever bars changes ───────────────────────────────────
  useEffect(() => {
    // When bars are wiped (symbol / interval change), reset the first-load
    // tracker and clear stale series data so old candles don't linger.
    // prevLenRef must be 0 so the next real data load is treated as a
    // fresh first-load, causing autoScale + scrollToRealTime to fire.
    if (bars.length === 0) {
      prevLenRef.current = 0;
      try {
        candleRef.current?.setData([]);
        ema9Ref.current?.setData([]);
        ema20Ref.current?.setData([]);
        ema200Ref.current?.setData([]);
        vwapRef.current?.setData([]);
        macdHistRef.current?.setData([]);
        macdLineRef.current?.setData([]);
        signalRef.current?.setData([]);
      } catch {
        // series may not be initialised on very first mount
      }
      return;
    }

    if (
      !candleRef.current ||
      !ema9Ref.current ||
      !ema20Ref.current ||
      !ema200Ref.current ||
      !vwapRef.current ||
      !macdHistRef.current ||
      !macdLineRef.current ||
      !signalRef.current
    )
      return;

    // lightweight-charts requires data to be strictly ascending by time.
    // De-duplicate by timestamp (keep last) then sort ascending.
    const dedupMap = new Map<number, (typeof bars)[0]>();
    for (const b of bars) dedupMap.set(b.timestamp, b);
    const sortedBars = Array.from(dedupMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    const closes = sortedBars.map((b) => b.close);
    const ema9 = calcEMA(closes, 9);
    const ema20 = calcEMA(closes, 20);
    const ema200 = calcEMA(closes, 200);
    const vwap = calcVWAP(sortedBars);
    const { macd, signal, histogram } = calcMACD(closes);

    // Build [{time, value}] skipping null entries (not enough history yet)
    function linePoints(vals: (number | null)[]) {
      const pts: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < sortedBars.length; i++) {
        if (vals[i] !== null) pts.push({ time: toUTC(sortedBars[i].timestamp), value: vals[i]! });
      }
      return pts;
    }

    // Candlestick
    candleRef.current.setData(
      sortedBars.map((b) => ({
        time: toUTC(b.timestamp),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );

    // Overlay lines
    ema9Ref.current.setData(linePoints(ema9));
    ema20Ref.current.setData(linePoints(ema20));
    ema200Ref.current.setData(linePoints(ema200));
    vwapRef.current.setData(linePoints(vwap));

    // Histogram — 4 colours matching EXGEN/TradingView MACD style:
    //   ≥0 & rising  → #02c076 (strong bull, EXGEN green)
    //   ≥0 & falling → #02c07666 (weak bull, muted green)
    //   <0 & rising  → #f6465d66 (weak bear, muted red)
    //   <0 & falling → #f6465d (strong bear, EXGEN red)
    const histPts: { time: UTCTimestamp; value: number; color: string }[] = [];
    for (let i = 0; i < sortedBars.length; i++) {
      if (histogram[i] !== null) {
        const val = histogram[i]!;
        const prev = i > 0 ? (histogram[i - 1] ?? val) : val;
        const rising = val >= prev;
        let color: string;
        if (val >= 0) {
          color = rising ? chartColors.macdHistBull : `${chartColors.macdHistBull}66`;
        } else {
          color = rising ? `${chartColors.macdHistBear}66` : chartColors.macdHistBear;
        }
        histPts.push({ time: toUTC(sortedBars[i].timestamp), value: val, color });
      }
    }
    macdHistRef.current.setData(histPts);

    macdLineRef.current.setData(linePoints(macd));
    signalRef.current.setData(linePoints(signal));

    // On first load and after interval/symbol changes (data lands outside the
    // current visible window): scroll to the latest bar and let barSpacing
    // control how many candles are visible — same behaviour as TradingView.
    // For ordinary incremental tick updates we leave the user's zoom/pan alone.
    const timeScale = chartRef.current?.timeScale();
    const firstTime = toUTC(sortedBars[0].timestamp);
    const lastTime = toUTC(sortedBars[sortedBars.length - 1].timestamp);
    // getVisibleRange() returns Time (a union), but we only ever feed UTCTimestamp
    // values so it's safe to cast here for the comparison below.
    const visibleRange = timeScale?.getVisibleRange() as
      | { from: UTCTimestamp; to: UTCTimestamp }
      | null
      | undefined;

    const isFirstLoad = prevLenRef.current === 0;
    const isOutOfRange =
      !visibleRange || lastTime < visibleRange.from || firstTime > visibleRange.to;

    if (isFirstLoad || isOutOfRange) {
      // Re-enable Y-axis autoscale before scrolling so that a stale price
      // scale from a previous symbol/interval doesn't hide the new data.
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
      // Apply the TradingView-matched bar spacing for this interval so the
      // initial view shows ~160–200 readable candles regardless of timeframe,
      // then anchor the right edge to the most recent bar.
      timeScale?.applyOptions({
        barSpacing: INTERVAL_BAR_SPACING[interval],
      });
      timeScale?.scrollToRealTime();
    }
    prevLenRef.current = sortedBars.length;
  }, [bars, interval]);

  return (
    <div className="relative h-full w-full" style={{ background: CHART_BG }}>
      {/* The actual lightweight-charts canvas fills this div */}
      <div ref={containerRef} className="h-full w-full" />

      {/* ── Hover legend ─────────────────────────────────────────────────── */}
      {hoverData && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/6 px-3 py-2 backdrop-blur-md"
          style={{ background: `${bg.page}e6` }}
        >
          {/* Time */}
          <p className="mb-1.5" style={{ fontSize: fontSize.xs10, color: color.muted }}>
            {hoverData.time}
          </p>

          {/* OHLC */}
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

          {/* Indicators */}
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
    </div>
  );
}
