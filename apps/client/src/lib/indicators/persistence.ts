/**
 * Loading saved indicator instances (layoutStore, `cd-layout` in localStorage). The payload is
 * user-controllable input (.claude/rules/security.md, "Client-side security posture"): every entry
 * is checked here and a bad one dropped or repaired, so a malformed or tampered layout can never
 * crash the chart on load.
 */

import { getIndicatorMeta } from './catalog';
import type {
  IndicatorInstance,
  IndicatorMeta,
  IndicatorStyle,
  ParamDef,
  ParamValues,
} from './types';

// ─── Renamed indicators (layoutStore v7, owner 2026-10-03) ───────────────────

/**
 * Catalog ids that were replaced, and how a saved instance carries over. Percent Change was ROC
 * with length 1 on close, so it becomes exactly that (same output as before); Weighted Close
 * becomes Typical Price. Colour, line style and visibility are kept.
 */
const RENAMED: Record<string, { id: string; params: ParamValues }> = {
  'percent-change': { id: 'roc', params: { length: 1, source: 'close' } },
  'weighted-close': { id: 'typical-price', params: {} },
};

const LINE_STYLES: readonly IndicatorStyle['lineStyle'][] = [
  'solid',
  'dotted',
  'dashed',
  'large-dashed',
  'sparse-dotted',
];

const MAX_ID_LENGTH = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ─── Params ──────────────────────────────────────────────────────────────────

/**
 * One param checked against its catalog definition. A number param must be a finite number, a
 * whole one when its step is whole (lengths), and is clamped to the declared min / max; a select
 * param must be one of its options. Anything else falls back to the default. 🔐 The range matters:
 * a tampered `length: 1e9` or a fractional MACD length would reach the moving-average loops on
 * every load and could freeze the tab.
 */
function checkParam(def: ParamDef, value: unknown, fallback: number | string): number | string {
  if (def.type === 'select') {
    const option = def.options?.find((o) => String(o.value) === String(value));
    return option ? option.value : fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const wholeSteps = def.step === undefined || Number.isInteger(def.step);
  if (wholeSteps && !Number.isInteger(value)) return fallback;
  let v = value;
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

/**
 * An indicator's params, complete and in range: every declared param from `raw` when it passes
 * checkParam, else its default; keys the catalog doesn't declare are dropped. Used on load and on
 * a settings save (the number inputs' min / max don't stop a typed value).
 */
export function sanitizeParams(meta: IndicatorMeta, raw: unknown): ParamValues {
  const saved = isRecord(raw) ? raw : {};
  const out: ParamValues = {};
  for (const def of meta.params) {
    const fallback = Object.hasOwn(meta.defaultParams, def.id)
      ? meta.defaultParams[def.id]
      : def.default;
    out[def.id] = Object.hasOwn(saved, def.id)
      ? checkParam(def, saved[def.id], fallback)
      : fallback;
  }
  return out;
}

/**
 * The saved instances of one chart pane, cleaned: renamed ids carried over, unknown ids and
 * malformed entries dropped, missing or invalid fields filled from the catalog defaults.
 */
export function normalizeIndicatorInstances(raw: unknown): IndicatorInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: IndicatorInstance[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { instanceId, indicatorId: savedId } = entry;
    if (typeof instanceId !== 'string' || typeof savedId !== 'string') continue;
    let indicatorId: string = savedId;
    if (!instanceId || instanceId.length > MAX_ID_LENGTH || seen.has(instanceId)) continue;

    let params: unknown = entry.params;
    const renamed = Object.hasOwn(RENAMED, indicatorId) ? RENAMED[indicatorId] : undefined;
    if (renamed) {
      indicatorId = renamed.id;
      params = { ...renamed.params };
    }
    const meta = getIndicatorMeta(indicatorId);
    if (!meta) continue;

    const lineWidth = entry.lineWidth;
    const lineStyle = entry.lineStyle;
    seen.add(instanceId);
    out.push({
      instanceId,
      indicatorId,
      params: sanitizeParams(meta, params),
      color: typeof entry.color === 'string' && entry.color ? entry.color : meta.defaultColor,
      lineWidth:
        lineWidth === 1 || lineWidth === 2 || lineWidth === 3 || lineWidth === 4
          ? lineWidth
          : meta.defaultLineWidth,
      lineStyle: LINE_STYLES.includes(lineStyle as IndicatorStyle['lineStyle'])
        ? (lineStyle as IndicatorStyle['lineStyle'])
        : meta.defaultLineStyle,
      // The old `position` (where a floating legend pill was dragged to) is dropped: the legend
      // now sits in each pane's header row (owner, 2026-10-03)
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
    });
  }
  return out;
}
