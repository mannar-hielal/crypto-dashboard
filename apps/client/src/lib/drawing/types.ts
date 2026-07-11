// ─── Drawing type definitions ──────────────────────────────────────

import type { UTCTimestamp } from 'lightweight-charts';

export type DrawingType = 'trendline';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: UTCTimestamp;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
  textColor: string;
  lineWidth: number;
  lineStyle: LineStyle;
  isLocked: boolean;
  zIndex: number;
  label?: string;
}

export interface InProgressDrawing {
  type: DrawingType;
  points: DrawingPoint[];
  hoverPoint: DrawingPoint | null;
}
