/**
 * Saved drawings from lightweight-charts-drawing 0.1 → the 0.4 drawing model (fork upgrade,
 * 2026-10-04). Pure: no storage, no chart. `lib/drawingManager.ts` runs it once per symbol, when the
 * 0.4 key is missing and the 0.1 key exists.
 *
 * 0.1 saved `{ id, type, anchors: [{ time, price }], style: { lineColor, lineWidth, lineDash,
 * fillColor, … }, options: { visible, locked, extendLeft, extendRight, text?, … } }`. In practice
 * the app never set a style (every drawing has the 0.1 default blue, width 2) and never saved an
 * edited text (0.1 kept it outside `options`), but both are carried over when present.
 *
 * Anything that doesn't convert is skipped silently: an unknown or malformed entry, and the tools
 * whose 0.1 geometry has no faithful 0.4 equivalent (DROPPED_LEGACY_TYPES).
 */

import {
  buildNewDrawing,
  defaultStyleFor,
  findOverlaySpec,
  parseDrawings,
} from 'lightweight-charts-drawing';
import type { DataPoint, Drawing, DrawingKind, DrawingStyle } from 'lightweight-charts-drawing';
import { MAX_DRAWING_TEXT } from '@/lib/drawingActions';

/** 0.1 tool type → 0.4 kind, where the name changed (0.4 follows TradingView) */
const RENAMED: Record<string, DrawingKind> = {
  'andrews-pitchfork': 'pitchfork',
  'fib-extension': 'trend-based-fib-extension',
  'fib-time-extension': 'trend-based-fib-time',
  'fib-arcs': 'fib-speed-resistance-arcs',
  'fib-speed-fan': 'fib-speed-resistance-fan',
  forecast: 'position-forecast',
  'date-price-range': 'date-and-price-range',
  'text-annotation': 'text',
  // TradingView retired Anchored Text for Text (0.2 did the same)
  'anchored-text': 'text',
  // 0.1's 1-point note is 0.4's Pin (0.4's Note is a 2-point tool)
  note: 'pin',
};

/**
 * 0.1 tools with no faithful 0.4 form — skipped:
 * - arc: 0.1 = centre / start / end, 0.4 = chord ends + bulge;
 * - curve, double-curve: 0.1 = 4 / 3 free points, 0.4 = 2 clicks + derived controls;
 * - bars-pattern: 0.4 needs the bar snapshot taken at placement;
 * - projection: an A-B move copied from C, which 0.4's Sector is not;
 * - gann-square-fixed, arrow-marker: 1 point in 0.1, 2 in 0.4;
 * - disjoint-channel: 4 free points in 0.1, a 3-point mirror model in 0.4;
 * - table: 0.1 kept its cells outside the saved JSON.
 */
export const DROPPED_LEGACY_TYPES: ReadonlySet<string> = new Set([
  'arc',
  'curve',
  'double-curve',
  'bars-pattern',
  'projection',
  'gann-square-fixed',
  'arrow-marker',
  'disjoint-channel',
  'table',
]);

/** Kinds whose own style colours carry the look (levels, zones): only width / dash carry over */
const KEEP_KIND_COLOURS: ReadonlySet<DrawingKind> = new Set<DrawingKind>([
  'long-position',
  'short-position',
  'position-forecast',
]);

type LegacyAnchor = { time: number | string; price: number };

interface LegacyDrawing {
  id: string;
  type: string;
  anchors: LegacyAnchor[];
  style?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

function isLegacy(raw: unknown): raw is LegacyDrawing {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.type !== 'string' || !Array.isArray(r.anchors)) {
    return false;
  }
  return r.anchors.every((a: unknown) => {
    if (!a || typeof a !== 'object') return false;
    const { time, price } = a as Record<string, unknown>;
    return (
      (typeof time === 'number' || typeof time === 'string') &&
      typeof price === 'number' &&
      Number.isFinite(price)
    );
  });
}

/** 0.1 → 0.4 kind, or null when the tool isn't carried over */
export function legacyKindOf(type: string): DrawingKind | null {
  if (DROPPED_LEGACY_TYPES.has(type)) return null;
  const kind = (RENAMED[type] ?? type) as DrawingKind;
  return findOverlaySpec(kind) ? kind : null;
}

/** `rgba(r, g, b, a)` / `#rrggbb` → `{ hex, alpha }` */
function parseColour(c: unknown): { hex: string; alpha: number } | null {
  if (typeof c !== 'string') return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) return { hex: `#${hex[1]!.toLowerCase()}`, alpha: 1 };
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c.trim());
  if (!m) return null;
  const to2 = (v: string) => Math.min(255, Number(v)).toString(16).padStart(2, '0');
  return { hex: `#${to2(m[1]!)}${to2(m[2]!)}${to2(m[3]!)}`, alpha: m[4] ? Number(m[4]) : 1 };
}

/** The 0.4 style: the kind's TradingView defaults, with the 0.1 colour, width, dash and fill */
function styleFor(kind: DrawingKind, d: LegacyDrawing): DrawingStyle {
  const style: DrawingStyle = defaultStyleFor(kind);
  const s = d.style ?? {};
  const o = d.options ?? {};
  if (typeof s.lineWidth === 'number' && s.lineWidth > 0) style.width = s.lineWidth;
  if (Array.isArray(s.lineDash) && s.lineDash.length > 0) {
    style.lineStyle = Number(s.lineDash[0]) >= 4 ? 'dashed' : 'dotted';
  }
  if (!KEEP_KIND_COLOURS.has(kind)) {
    const line = parseColour(s.lineColor);
    if (line) style.color = line.hex;
    const fill = parseColour(s.fillColor);
    // Only kinds with their own fill colour (rectangle, circle, …), not level ladders (Fib)
    if (fill && style.backgroundColor !== undefined) {
      style.backgroundColor = fill.hex;
      style.transparency = Math.round((1 - fill.alpha) * 100);
    }
  }
  if (typeof o.extendLeft === 'boolean' && o.extendLeft) style.extendLeft = true;
  if (typeof o.extendRight === 'boolean' && o.extendRight) style.extendRight = true;
  return style;
}

/** The point model of the 0.4 kind, from the 0.1 anchors (null = not convertible) */
function pointsFor(kind: DrawingKind, a: DataPoint[]): DataPoint[] | null {
  const spec = findOverlaySpec(kind);
  if (!spec || a.length === 0) return null;
  switch (kind) {
    case 'text':
    case 'pin':
      return [a[0]!];
    case 'price-note':
      // 0.1: one point; 0.4: the price bubble and a line end (degenerate until dragged)
      return a.length >= 2 ? [a[0]!, a[1]!] : [a[0]!, { ...a[0]! }];
    case 'parallel-channel': {
      // 0.1's 3rd anchor is anywhere on the far line; 0.4 re-anchors it to p0's time
      if (a.length !== 3) return null;
      return buildNewDrawing(kind, a)?.points ?? null;
    }
    default:
      if (spec.variableLength || spec.freehand) return a.length >= 2 ? a : null;
      // ellipse (0.1 bbox corners) stays 2-point: 0.4's migrateDrawing converts it
      if (kind === 'ellipse') return a.length === 2 ? a : null;
      return a.length === spec.pointCount ? a : null;
  }
}

/**
 * The chart the conversion runs for: its bar length and spacing. 0.1 drew a position box a fixed
 * 200 px wide from the entry (no right-edge time was saved), so this turns those 200 px into bars.
 */
export interface LegacyChartScale {
  /** Seconds per bar of the pane's interval */
  barSeconds: number;
  /** Pixels per bar at the interval's default zoom */
  barSpacing: number;
}

/** 0.1's position box width, in px from the entry (LongPosition / ShortPosition computeGeometry) */
export const LEGACY_POSITION_BOX_PX = 200;

/** One 0.1 entry → a 0.4 drawing (before 0.4's own schema check), or null to skip it */
export function convertLegacyDrawing(raw: unknown, scale?: LegacyChartScale): Drawing | null {
  if (!isLegacy(raw)) return null;
  const kind = legacyKindOf(raw.type);
  if (!kind) return null;
  const anchors: DataPoint[] = raw.anchors.map((x) => ({
    time: x.time as DataPoint['time'],
    price: x.price,
  }));
  const o = raw.options ?? {};

  // Long / short position: 0.1 = [entry, stop, target]; 0.4 = [entry, close point] with the stop
  // and target as price distances in the style
  if (kind === 'long-position' || kind === 'short-position') {
    if (anchors.length !== 3) return null;
    const [entry, stop, target] = anchors as [DataPoint, DataPoint, DataPoint];
    // The box keeps 0.1's 200 px at the interval's default zoom; without a scale, it ends at the
    // latest saved point
    const bars =
      scale && scale.barSpacing > 0 && scale.barSeconds > 0
        ? Math.ceil(LEGACY_POSITION_BOX_PX / scale.barSpacing)
        : 0;
    const closeTime =
      bars > 0 && typeof entry.time === 'number'
        ? ((entry.time + bars * scale!.barSeconds) as DataPoint['time'])
        : [stop.time, target.time].reduce((t, x) => (Number(x) > Number(t) ? x : t), entry.time);
    const style = styleFor(kind, raw);
    style.stopLevel = Math.abs(entry.price - stop.price);
    style.profitLevel = Math.abs(target.price - entry.price);
    return {
      id: raw.id,
      kind,
      points: [entry, { time: closeTime, price: entry.price }],
      style,
      ...(o.locked === true ? { locked: true } : {}),
      ...(o.visible === false ? { hidden: true } : {}),
    } as Drawing;
  }

  const points = pointsFor(kind, anchors);
  if (!points) return null;
  const spec = findOverlaySpec(kind);
  // 🔐 Capped like a typed text (MAX_DRAWING_TEXT): a 0.1 save is untrusted input
  const text = typeof o.text === 'string' ? o.text.slice(0, MAX_DRAWING_TEXT) : undefined;
  return {
    id: raw.id,
    kind,
    points,
    style: styleFor(kind, raw),
    ...(kind === 'circle' ? { fmt: 2 } : {}),
    ...(spec?.textEditable && text !== undefined ? { text } : {}),
    ...(o.locked === true ? { locked: true } : {}),
    ...(o.visible === false ? { hidden: true } : {}),
  } as Drawing;
}

/** A saved 0.1 array → 0.4 drawings, checked and point-migrated by 0.4's own parser */
export function convertLegacyDrawings(raw: unknown, scale?: LegacyChartScale): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const entry of raw) {
    try {
      const d = convertLegacyDrawing(entry, scale);
      if (d) out.push(d);
    } catch {
      // One bad entry never costs the rest
    }
  }
  return parseDrawings(out);
}
