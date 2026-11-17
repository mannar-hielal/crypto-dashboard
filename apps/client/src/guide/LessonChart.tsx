/**
 * A real mini chart on a lesson card (owner's visual Q&A 2026-10-23): it takes the drawn picture's
 * slot, shows Bybit daily candles from our market history with dated markers, and has no
 * interaction of its own. A scene with `freezeAt` stops on that day until the learner has answered,
 * then plays on a candle at a time (all at once with reduced motion). If the history can't be loaded
 * the card keeps its drawn picture, so a lesson never waits on data.
 */

import { pricePrecision } from './lessonChartData';
import { useEffect, useRef, useState, type ReactNode, useMemo } from 'react';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineStyle,
  TickMarkType,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { guide } from '@/lib/guideAnchors';
import { border, chart as chartColors, font } from '@/lib/tokens';
import { daySeconds, frozenCount, markersUpTo, type LessonBar } from './lessonChartData';
import { loadScene } from './lessonChartLoader';
import type { ChartScene } from './lessons';
import styles from './LessonChart.module.css';

/** One candle every so often while the chart plays on after an answer */
const REVEAL_STEP_MS = 150;
/** Empty candle slots either side, so a marker's label on the first or last days isn't cut off */
const EDGE_ROOM = 4;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis dates as a reader says them: "2024", "Feb", "8 Feb" */
function tickLabel(time: Time, type: TickMarkType): string {
  const d = new Date(Number(time) * 1000);
  if (type === TickMarkType.Year) return String(d.getUTCFullYear());
  if (type === TickMarkType.Month) return MONTHS[d.getUTCMonth()];
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface LessonChartProps {
  scene: ChartScene;
  /** The learner has answered: a frozen scene plays on to its end */
  revealed: boolean;
  /** Shown while loading fails: the card's drawn picture */
  fallback: ReactNode;
}

export function LessonChart({ scene, revealed, fallback }: LessonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [bars, setBars] = useState<LessonBar[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);

  // ── Load the history ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadScene(scene)
      .then((loaded) => {
        if (cancelled) return;
        setBars(loaded);
        setShown(frozenCount(loaded, scene));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // ── Play on after the answer ───────────────────────────────────────────────
  const target = bars ? (revealed ? bars.length : frozenCount(bars, scene)) : 0;
  // With reduced motion the chart jumps straight to where it's going
  const reduced = prefersReducedMotion();
  // (never past the target: asked again, the outcome is hidden at once, not a moment later)
  const count = reduced ? target : Math.min(shown, target);
  useEffect(() => {
    // Asked again (Try again): back to the frozen moment, the outcome hidden until the next answer
    if (shown > target) {
      const back = window.setTimeout(() => setShown(target), 0);
      return () => window.clearTimeout(back);
    }
    if (!bars || reduced || shown >= target) return;
    const t = window.setTimeout(() => setShown((n) => Math.min(n + 1, target)), REVEAL_STEP_MS);
    return () => window.clearTimeout(t);
  }, [bars, reduced, shown, target]);

  // ── The chart itself, once there is data ───────────────────────────────────
  const ready = bars !== null;
  // Decimals by the coin's price level, not its name (pricePrecision), once per data load
  // (from the candles shown before the answer only: the hidden ones mustn't set the axis's format)
  const precision = useMemo(() => {
    const seen = bars && scene.freezeAt ? bars.slice(0, frozenCount(bars, scene)) : bars;
    const top = seen ? seen.reduce((t, b) => Math.max(t, b.high), 0) : 0;
    return pricePrecision(top);
  }, [bars, scene]);
  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: chartColors.bg },
        textColor: chartColors.textColor,
        fontFamily: font.sans,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: border.divider },
      },
      // Room above and below the candles for the markers
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.2, bottom: 0.2 } },
      timeScale: { borderVisible: false, tickMarkFormatter: tickLabel },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.candleUp,
      downColor: chartColors.candleDown,
      wickUpColor: chartColors.candleUp,
      wickDownColor: chartColors.candleDown,
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => {
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [ready]);

  // The price format follows the scene's coin on the same series (a new chart would drop its data
  // and its plan line)
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    });
  }, [ready, precision]);

  // ── A Choose buy or sell plan's price, as a dashed line (owner 2026-11-16) ──
  const planPrice = scene.planLine?.price;
  const planLabel = scene.planLine?.label;
  useEffect(() => {
    const series = seriesRef.current;
    if (!ready || !series || planPrice === undefined) return;
    const line = series.createPriceLine({
      price: planPrice,
      color: chartColors.lessonMarker,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: true,
      title: planLabel ?? '',
    });
    return () => {
      // The series may already be gone with its chart (the creating effect's cleanup runs too)
      if (seriesRef.current === series) series.removePriceLine(line);
    };
  }, [ready, planPrice, planLabel]);

  // ── Push what's shown, and the markers on it ───────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!bars || !series) return;
    const visible = bars.slice(0, count);
    series.setData(
      visible.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );
    markersRef.current?.setMarkers(
      markersUpTo(scene.markers, visible[visible.length - 1]?.time).map((m) => ({
        time: daySeconds(m.date) as UTCTimestamp,
        position: m.position === 'above' ? ('aboveBar' as const) : ('belowBar' as const),
        shape: m.position === 'above' ? ('arrowDown' as const) : ('arrowUp' as const),
        color: chartColors.lessonMarker,
        text: m.text,
      }))
    );
    // A frozen scene keeps its full width, so the candles still to come have room
    chartRef.current
      ?.timeScale()
      .setVisibleLogicalRange({ from: -EDGE_ROOM, to: bars.length - 1 + EDGE_ROOM });
  }, [bars, count, scene]);

  if (failed) return <>{fallback}</>;
  return (
    <div
      ref={containerRef}
      className={styles.chart}
      role="img"
      aria-label={scene.label}
      {...guide('lesson.chart')}
    />
  );
}
