// ─── Drawing type definitions ──────────────────────────────────────

import type { UTCTimestamp } from 'lightweight-charts';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: UTCTimestamp;
  price: number;
}

// ─── Shape data — discriminated union (per-shape interfaces) ────────
//
// Each shape type owns its own variant with exactly the fields it needs.
// `DrawingType` is the union of all `shape.type` values. When a new shape
// is added, add its interface to `ShapeData` — TypeScript narrowing kicks
// in automatically at every `drawing.shape.type` check.

export interface TrendlineData {
  type: 'trendline';
  points: DrawingPoint[]; // exactly 2
}

export interface HorizontalData {
  type: 'horizontal';
  points: DrawingPoint[]; // exactly 1 (price anchor; time is irrelevant — line extends infinitely)
}

export interface VerticalData {
  type: 'vertical';
  points: DrawingPoint[]; // exactly 1 (time anchor; price is irrelevant — line extends infinitely)
}

export interface RayData {
  type: 'ray';
  points: DrawingPoint[]; // exactly 2 (anchor A + direction point B; extends infinitely past B)
}

export interface ParallelData {
  type: 'parallel';
  points: DrawingPoint[]; // exactly 3: A, B, C
}

export interface PolylineData {
  type: 'polyline';
  points: DrawingPoint[]; // N ≥ 2
}

// ─── Text & Notes shapes (P6 — all single-anchor) ───────────────────
//
// Five annotation tools sharing the same geometry (1 anchor at (time, price))
// but different rendering, editability, and styling:
//   - text       : bare multiline text, no box, editable via textarea overlay
//   - note       : sticky-note box pinned at anchor, no extra geometry
//   - callout    : rounded box offset from anchor + leader tail
//   - priceNote  : note box + dashed lead line + right-edge price pill
//   - priceLabel : auto-rendered price pill (not editable)
//
// Text content for all editable ones is stored in the shared `Drawing.label`
// field (multiline via `\n`). Price label does not use `label` — it renders
// the formatted `anchor.price` directly.

export interface TextData {
  type: 'text';
  points: DrawingPoint[]; // exactly 1
}

export interface NoteData {
  type: 'note';
  points: DrawingPoint[]; // exactly 1
}

export interface CalloutData {
  type: 'callout';
  points: DrawingPoint[]; // exactly 1
}

export interface PriceNoteData {
  type: 'priceNote';
  points: DrawingPoint[]; // exactly 1
}

export interface PriceLabelData {
  type: 'priceLabel';
  points: DrawingPoint[]; // exactly 1
}

export type ShapeData =
  | TrendlineData
  | HorizontalData
  | VerticalData
  | RayData
  | ParallelData
  | PolylineData
  | TextData
  | NoteData
  | CalloutData
  | PriceNoteData
  | PriceLabelData;

export type DrawingType = ShapeData['type'];

/** Pane index (0..3) — drawings are scoped to their owning chart pane so a
 *  single global `useDrawingStore` doesn't visually pollute sibling panes in
 *  a multi-pane dashboard layout. Persisted via v4 schema; v3→v4 migration
 *  backfills `paneIndex: 0` for legacy drawings. */
export type PaneIndex = 0 | 1 | 2 | 3;

// ─── Full drawing (base style + shape-specific data) ────────────────

export interface Drawing {
  id: string;
  zIndex: number;
  isLocked: boolean;
  label?: string;
  // Style (shared across all shapes)
  color: string;
  textColor: string;
  lineWidth: number;
  lineStyle: LineStyle;
  // Annotation style (P6 — text & notes)
  fontSize: number;
  backgroundColor: string;
  /** If true, the annotation floats freely on the chart canvas rather than
   *  being pinned to its original anchor point. */
  isFloating?: boolean;
  // Shape-specific data (replaces flat `type` + `points`)
  shape: ShapeData;
  /** Pane this drawing belongs to (v4). Migration backfills 0; addDrawing
   *  defaults to 0 when the caller doesn't supply one. */
  paneIndex: PaneIndex;
}

// ─── Shape capability flags (P6.9 — conditional properties menu) ─────

export interface ShapeCapabilities {
  hasLineColor: boolean;
  hasFillColor: boolean;
  hasTextColor: boolean;
  hasEditableLabel: boolean;
  hasFontSize: boolean;
  hasLineWidth: boolean;
  hasLineStyle: boolean;
}

const LINE_CAPS: ShapeCapabilities = {
  hasLineColor: true,
  hasFillColor: false,
  hasTextColor: true, // label color
  hasEditableLabel: true, // single-line label
  hasFontSize: false,
  hasLineWidth: true,
  hasLineStyle: true,
};

const PARALLEL_CAPS: ShapeCapabilities = { ...LINE_CAPS, hasFillColor: true };

export const SHAPE_CAPABILITIES: Record<DrawingType, ShapeCapabilities> = {
  trendline: LINE_CAPS,
  horizontal: LINE_CAPS,
  vertical: LINE_CAPS,
  ray: LINE_CAPS,
  parallel: PARALLEL_CAPS,
  polyline: LINE_CAPS,
  text: {
    hasLineColor: false,
    hasFillColor: false,
    hasTextColor: true,
    hasEditableLabel: true, // opens textarea editor
    hasFontSize: true,
    hasLineWidth: false,
    hasLineStyle: false,
  },
  note: {
    hasLineColor: true, // border
    hasFillColor: true,
    hasTextColor: true,
    hasEditableLabel: true, // opens textarea editor
    hasFontSize: true,
    hasLineWidth: true,
    hasLineStyle: true,
  },
  callout: {
    hasLineColor: true, // border + leader tail
    hasFillColor: true,
    hasTextColor: true,
    hasEditableLabel: true, // opens textarea editor
    hasFontSize: true,
    hasLineWidth: true,
    hasLineStyle: true,
  },
  priceNote: {
    hasLineColor: true, // border + lead line + pill border
    hasFillColor: true,
    hasTextColor: true,
    hasEditableLabel: true, // opens textarea editor
    hasFontSize: true,
    hasLineWidth: true,
    hasLineStyle: true,
  },
  priceLabel: {
    hasLineColor: true, // pill fill
    hasFillColor: true, // pill fill (alias of color for pill)
    hasTextColor: true, // pill text
    hasEditableLabel: false, // not editable
    hasFontSize: true,
    hasLineWidth: true, // pill border
    hasLineStyle: true, // effectively unused but harmless
  },
};

// ─── In-progress placement state ────────────────────────────────────

export interface InProgressDrawing {
  type: DrawingType;
  points: DrawingPoint[];
  hoverPoint: DrawingPoint | null;
}
