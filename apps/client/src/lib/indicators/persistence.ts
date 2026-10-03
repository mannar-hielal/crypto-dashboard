/**
 * Loading saved indicator instances (layoutStore, `cd-layout` in localStorage). The payload is
 * user-controllable input (.claude/rules/security.md, "Client-side security posture"): every entry
 * is checked here and a bad one dropped or repaired, so a malformed or tampered layout can never
 * crash the chart on load.
 */

import { getIndicatorMeta } from './catalog';
import type { IndicatorInstance, IndicatorStyle, ParamValues } from './types';

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

/** Only number / string values survive (what the settings form can produce) */
function cleanParams(raw: unknown): ParamValues {
  if (!isRecord(raw)) return {};
  const out: ParamValues = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string') out[k] = v;
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

    let params = cleanParams(entry.params);
    const renamed = Object.hasOwn(RENAMED, indicatorId) ? RENAMED[indicatorId] : undefined;
    if (renamed) {
      indicatorId = renamed.id;
      params = { ...renamed.params };
    }
    const meta = getIndicatorMeta(indicatorId);
    if (!meta) continue;

    const lineWidth = entry.lineWidth;
    const lineStyle = entry.lineStyle;
    const position = entry.position;
    seen.add(instanceId);
    out.push({
      instanceId,
      indicatorId,
      params: { ...meta.defaultParams, ...params },
      color: typeof entry.color === 'string' && entry.color ? entry.color : meta.defaultColor,
      lineWidth:
        lineWidth === 1 || lineWidth === 2 || lineWidth === 3 || lineWidth === 4
          ? lineWidth
          : meta.defaultLineWidth,
      lineStyle: LINE_STYLES.includes(lineStyle as IndicatorStyle['lineStyle'])
        ? (lineStyle as IndicatorStyle['lineStyle'])
        : meta.defaultLineStyle,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
      position:
        isRecord(position) && typeof position.x === 'number' && typeof position.y === 'number'
          ? { x: position.x, y: position.y }
          : { x: 8, y: 40 },
    });
  }
  return out;
}
