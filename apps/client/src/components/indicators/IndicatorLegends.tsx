/**
 * Indicator legends, TradingView-style (owner, 2026-10-03): a header row at the top-left of each
 * indicator pane, and one row per price-pane overlay stacked under the price legend. A row reads
 * `<short title> <inputs>` then the values in their series' colours — under the crosshair, or the
 * last bar's when the mouse is off the bars — with settings / hide / remove on hover or focus.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import type { IChartApi, IPaneApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { getIndicatorMeta } from '@/lib/indicators/catalog';
import { legendTitle, legendValues } from '@/lib/indicators/legend';
import { sanitizeParams } from '@/lib/indicators/persistence';
import type { LegendValue, SeriesDataAt } from '@/lib/indicators/legend';
import type {
  IndicatorInstance,
  IndicatorMeta,
  IndicatorPrimitive,
  IndicatorStyle,
  ParamValues,
} from '@/lib/indicators/types';
import { guide } from '@/lib/guideAnchors';
import { IndicatorSettings } from './IndicatorSettings';
import styles from './IndicatorLegends.module.css';

// ─── Row ─────────────────────────────────────────────────────────────────────

interface IndicatorLegendRowProps {
  instance: IndicatorInstance;
  meta: IndicatorMeta;
  values: LegendValue[];
  /** Set for a sub-pane header: px from the chart's top to its pane's top */
  top?: number;
  onToggle: (instanceId: string) => void;
  onSettings: (instanceId: string, anchorRect: DOMRect) => void;
  onRemove: (instanceId: string) => void;
}

export function IndicatorLegendRow({
  instance,
  meta,
  values,
  top,
  onToggle,
  onSettings,
  onRemove,
}: IndicatorLegendRowProps) {
  const settingsRef = useRef<HTMLButtonElement>(null);
  const id = instance.instanceId;
  const title = legendTitle(meta, instance.params);
  const isPaneHeader = top !== undefined;
  const className = [
    styles.row,
    isPaneHeader ? styles.paneHeader : '',
    instance.enabled ? '' : styles.hidden,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...guide(isPaneHeader ? 'indicator.pane-legend' : 'indicator.legend', id)}
      className={className}
      style={isPaneHeader ? { top } : undefined}
    >
      <span className={styles.title}>{title}</span>
      {instance.enabled &&
        // A fixed-length list in the primitive's legend order — it never reorders
        values.map((v, i) => (
          <span key={i} className={styles.value} style={{ color: v.color }}>
            {v.text}
          </span>
        ))}
      <span className={styles.controls}>
        {meta.params.length > 0 && (
          <button
            ref={settingsRef}
            type="button"
            {...guide('indicator.settings', id)}
            className={styles.control}
            aria-label={`Settings: ${title}`}
            onClick={() => {
              const rect = settingsRef.current?.getBoundingClientRect();
              if (rect) onSettings(id, rect);
            }}
          >
            <Settings className={styles.icon} aria-hidden />
          </button>
        )}
        <button
          type="button"
          {...guide('indicator.toggle', id)}
          className={styles.control}
          aria-label={`${instance.enabled ? 'Hide' : 'Show'}: ${title}`}
          aria-pressed={!instance.enabled}
          onClick={() => onToggle(id)}
        >
          {instance.enabled ? (
            <Eye className={styles.icon} aria-hidden />
          ) : (
            <EyeOff className={styles.icon} aria-hidden />
          )}
        </button>
        <button
          type="button"
          {...guide('indicator.remove', id)}
          className={`${styles.control} ${styles.remove}`}
          aria-label={`Remove: ${title}`}
          onClick={() => onRemove(id)}
        >
          <X className={styles.icon} aria-hidden />
        </button>
      </span>
    </div>
  );
}

// ─── Pane positions ──────────────────────────────────────────────────────────

type Tops = Record<string, number>;

function sameTops(a: Tops, b: Tops): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

// ─── Legends ─────────────────────────────────────────────────────────────────

interface IndicatorLegendsProps {
  chart: IChartApi | null;
  source: ISeriesApi<'Candlestick'> | null;
  containerRef: RefObject<HTMLDivElement | null>;
  indicators: IndicatorInstance[];
  primitiveRefs: RefObject<Map<string, IndicatorPrimitive>>;
  paneRefs: RefObject<Map<string, IPaneApi<Time>>>;
  /** Bumped by ChartPanel whenever an indicator's series or pane is created or removed */
  layoutVersion: number;
  /** The OHLC price legend, shown above the overlay rows while it's there */
  priceLegend?: ReactNode;
  onRemove: (instanceId: string) => void;
  onUpdate: (instanceId: string, patch: Partial<IndicatorInstance>) => void;
}

export function IndicatorLegends({
  chart,
  source,
  containerRef,
  indicators,
  primitiveRefs,
  paneRefs,
  layoutVersion,
  priceLegend,
  onRemove,
  onUpdate,
}: IndicatorLegendsProps) {
  const [crosshair, setCrosshair] = useState<SeriesDataAt | null>(null);
  const [, setDataTick] = useState(0);
  const [tops, setTops] = useState<Tops>({});
  const [settingsTarget, setSettingsTarget] = useState<{
    instanceId: string;
    anchorRect: DOMRect;
  } | null>(null);

  // ── Values: the crosshair's bar, else the last bar ────────────────────────
  useEffect(() => {
    if (!chart || !source) return;
    const onMove = (param: MouseEventParams<Time>) => {
      // Off the chart, or past the newest candle (the padding area): the last bar's values
      const onBar = param.time !== undefined && param.point && param.seriesData.has(source);
      setCrosshair(onBar ? param.seriesData : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [chart, source]);

  // New candles change the last-bar values. The indicator series recompute on the same event, so
  // re-render a frame later, once they have.
  useEffect(() => {
    if (!source) return;
    let raf: number | undefined;
    const onData = () => {
      if (raf !== undefined) return;
      raf = requestAnimationFrame(() => {
        raf = undefined;
        setDataTick((n) => n + 1);
      });
    };
    source.subscribeDataChanged(onData);
    return () => {
      source.unsubscribeDataChanged(onData);
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, [source]);

  // ── Header positions: each pane's top, re-read whenever a pane moves ──────
  // A separator drag fires no chart event, so a ResizeObserver on the panes catches it.
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect().top;
    const next: Tops = {};
    for (const [id, pane] of paneRefs.current) {
      if (pane.paneIndex() < 1) continue;
      const el = pane.getHTMLElement();
      if (el) next[id] = Math.round(el.getBoundingClientRect().top - origin);
    }
    setTops((prev) => (sameTops(prev, next) ? prev : next));
  }, [containerRef, paneRefs]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // Every pane, the price pane included: a pane above that changes height moves the indicator
    // panes below it without resizing them, and a ResizeObserver only fires on size changes
    const allPanes = chart?.panes?.() ?? [...paneRefs.current.values()];
    for (const pane of allPanes) {
      const el = pane.getHTMLElement();
      if (!el) continue;
      ro.observe(el);
      // The row's own box isn't reliably observed in every engine — its canvas always is
      const canvas = el.querySelector('canvas');
      if (canvas) ro.observe(canvas);
    }
    // lightweight-charts lays a new pane out on its next frame
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure, containerRef, paneRefs, layoutVersion, chart]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleToggle(instanceId: string) {
    const inst = indicators.find((i) => i.instanceId === instanceId);
    if (inst) onUpdate(instanceId, { enabled: !inst.enabled });
  }

  function handleSettings(instanceId: string, anchorRect: DOMRect) {
    setSettingsTarget({ instanceId, anchorRect });
  }

  // ChartPanel's indicator effect applies the new params / style to the live primitive
  function handleSettingsSave(
    instanceId: string,
    params: ParamValues,
    color: string,
    lineWidth: 1 | 2 | 3 | 4,
    lineStyle: IndicatorStyle['lineStyle']
  ) {
    const inst = indicators.find((i) => i.instanceId === instanceId);
    const meta = inst ? getIndicatorMeta(inst.indicatorId) : undefined;
    // 🔐 The same range check as on load: a typed `length: 100000` would freeze the chart
    const safe = meta ? sanitizeParams(meta, params) : params;
    onUpdate(instanceId, { params: safe, color, lineWidth, lineStyle });
  }

  const handleCloseSettings = useCallback(() => setSettingsTarget(null), []);

  // ── Rows ──────────────────────────────────────────────────────────────────
  const mainRows: ReactNode[] = [];
  const paneHeaders: ReactNode[] = [];
  for (const inst of indicators) {
    const meta = getIndicatorMeta(inst.indicatorId);
    if (!meta) continue;
    const prim = inst.enabled ? primitiveRefs.current.get(inst.instanceId) : undefined;
    const values = prim ? legendValues(prim.legendSeries(), crosshair) : [];
    const top = tops[inst.instanceId];
    const ownPane = meta.category === 'sub-pane' && inst.enabled && top !== undefined;
    const row = (
      <IndicatorLegendRow
        key={inst.instanceId}
        instance={inst}
        meta={meta}
        values={values}
        top={ownPane ? top : undefined}
        onToggle={handleToggle}
        onSettings={handleSettings}
        onRemove={onRemove}
      />
    );
    // A hidden sub-pane indicator has no pane (it's removed while hidden): its row waits in the
    // price pane's column, where its eye brings it back
    (ownPane ? paneHeaders : mainRows).push(row);
  }

  const settingsInstance = settingsTarget
    ? indicators.find((inst) => inst.instanceId === settingsTarget.instanceId)
    : undefined;

  return (
    <>
      <div className={styles.mainStack}>
        {priceLegend}
        {mainRows}
      </div>
      {paneHeaders}
      {settingsInstance && settingsTarget && (
        <IndicatorSettings
          instance={settingsInstance}
          anchorRect={settingsTarget.anchorRect}
          onSave={handleSettingsSave}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}
