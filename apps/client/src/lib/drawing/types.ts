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

export type ShapeData = TrendlineData;

export type DrawingType = ShapeData['type'];

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
  // Shape-specific data (replaces flat `type` + `points`)
  shape: ShapeData;
}

// ─── In-progress placement state ────────────────────────────────────

export interface InProgressDrawing {
  type: DrawingType;
  points: DrawingPoint[];
  hoverPoint: DrawingPoint | null;
}
