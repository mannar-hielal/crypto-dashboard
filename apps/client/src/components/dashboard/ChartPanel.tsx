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
import { useMarketStore } from '@/store/marketStore';
import { calcEMA, calcVWAP, calcMACD } from '@/lib/indicators';

const CHART_BG = '#1e2235';

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

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const prevLenRef = useRef(0); // tracks first-load for fitContent()

  // ── Series refs (created once, updated on every bars change) ─────────────
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Selector: only subscribe to bars — ChartPanel doesn't care about price/connection state
  const bars = useMarketStore((s) => s.bars);

  // ── Hover legend state ───────────────────────────────────────────────────
  const [hoverData, setHoverData] = useState<LegendData | null>(null);

  // ── 1. Create chart once on mount ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_BG },
        textColor: '#d1d4dc',
        fontFamily: "'Geist', ui-sans-serif, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.08)' },
        horzLines: { color: 'rgba(255,255,255,0.08)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.12)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 12,
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
      upColor: '#22d3a5',
      downColor: '#f43f5e',
      borderUpColor: '#22d3a5',
      borderDownColor: '#f43f5e',
      wickUpColor: '#22d3a5',
      wickDownColor: '#f43f5e',
    });

    // ── Pane 0: EMA 9 — silver/gray ─────────────────────────────────────────
    ema9Ref.current = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 2,
      title: 'EMA 9',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: EMA 20 — blue ───────────────────────────────────────────────
    ema20Ref.current = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: EMA 200 — purple (trend filter, thin — background reference) ─
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      title: 'EMA 200',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    // ── Pane 0: VWAP — orange sparse-dotted ─────────────────────────────────
    vwapRef.current = chart.addSeries(LineSeries, {
      color: '#f97316',
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
      { color: '#22d3a5', priceLineVisible: false, lastValueVisible: false },
      1
    );

    // ── Pane 1: MACD line — blue ────────────────────────────────────────────
    macdLineRef.current = chart.addSeries(
      LineSeries,
      {
        color: '#2962ff',
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
        color: '#ff6d00',
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

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []); // empty dep array — create once

  // ── 2. Push updated data to every series whenever bars changes ───────────
  useEffect(() => {
    if (
      bars.length === 0 ||
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

    const closes = bars.map((b) => b.close);
    const ema9 = calcEMA(closes, 9);
    const ema20 = calcEMA(closes, 20);
    const ema200 = calcEMA(closes, 200);
    const vwap = calcVWAP(bars);
    const { macd, signal, histogram } = calcMACD(closes);

    // Build [{time, value}] skipping null entries (not enough history yet)
    function linePoints(vals: (number | null)[]) {
      const pts: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < bars.length; i++) {
        if (vals[i] !== null) pts.push({ time: toUTC(bars[i].timestamp), value: vals[i]! });
      }
      return pts;
    }

    // Candlestick
    candleRef.current.setData(
      bars.map((b) => ({
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

    // Histogram — 4 colours matching TradingView's MACD style:
    //   ≥0 & rising  → #26a69a (strong bull, dark teal)
    //   ≥0 & falling → #b2dfdb (weak bull, light teal)
    //   <0 & rising  → #ffcdd2 (weak bear, light pink)
    //   <0 & falling → #ef5350 (strong bear, red)
    const histPts: { time: UTCTimestamp; value: number; color: string }[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (histogram[i] !== null) {
        const val = histogram[i]!;
        const prev = i > 0 ? (histogram[i - 1] ?? val) : val;
        const rising = val >= prev;
        let color: string;
        if (val >= 0) {
          color = rising ? '#26a69a' : '#b2dfdb';
        } else {
          color = rising ? '#ffcdd2' : '#ef5350';
        }
        histPts.push({ time: toUTC(bars[i].timestamp), value: val, color });
      }
    }
    macdHistRef.current.setData(histPts);

    macdLineRef.current.setData(linePoints(macd));
    signalRef.current.setData(linePoints(signal));

    // Auto-fit on first load, and also when a snapshot replacement moves the
    // entire dataset outside the current visible range (e.g. interval change).
    // For ordinary incremental bar updates, preserve the user's zoom/pan state.
    const timeScale = chartRef.current?.timeScale();
    const firstTime = toUTC(bars[0].timestamp);
    const lastTime = toUTC(bars[bars.length - 1].timestamp);
    const visibleRange = timeScale?.getVisibleRange();

    const shouldFitContent =
      prevLenRef.current === 0 ||
      !visibleRange ||
      lastTime < visibleRange.from ||
      firstTime > visibleRange.to;

    if (shouldFitContent) timeScale?.fitContent();
    prevLenRef.current = bars.length;
  }, [bars]);

  return (
    <div className="relative h-full w-full" style={{ background: CHART_BG }}>
      {/* The actual lightweight-charts canvas fills this div */}
      <div ref={containerRef} className="h-full w-full" />

      {/* ── Hover legend ─────────────────────────────────────────────────── */}
      {hoverData && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-white/[0.08] bg-[#1a1d2e]/90 px-3 py-2 backdrop-blur-sm">
          {/* Time */}
          <p className="mb-1.5 text-[10px] font-medium text-slate-500">{hoverData.time}</p>

          {/* OHLC */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-slate-500">O</span>
            <span className="text-slate-200">
              {hoverData.open.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-slate-500">H</span>
            <span className="text-emerald-400">
              {hoverData.high.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-slate-500">L</span>
            <span className="text-rose-400">
              {hoverData.low.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-slate-500">C</span>
            <span
              className={hoverData.close >= hoverData.open ? 'text-emerald-400' : 'text-rose-400'}
            >
              {hoverData.close.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>

          {/* Indicators */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
            {hoverData.ema9 !== null && (
              <span>
                <span style={{ color: '#94a3b8' }}>EMA9 </span>
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
                <span style={{ color: '#3b82f6' }}>EMA20 </span>
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
                <span style={{ color: '#a855f7' }}>EMA200 </span>
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
                <span style={{ color: '#f97316' }}>VWAP </span>
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
