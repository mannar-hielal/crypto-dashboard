// ─── BitmapCoordinatesPaneRenderer — abstract base ──────────────────
//
// Matches the TradingView pattern (module 934305 in the extracted chunks):
// every per-shape renderer extends this base. The draw() method receives
// a DrawScope with both media (CSS pixel) and bitmap (physical pixel)
// dimensions so renderers can convert internally using hpr/vpr.
// hitTest() operates in CSS pixel space and returns HitTestResult | null.

import type { HitTestResult } from '@/lib/drawing/HitTarget';

export interface DrawScope {
  context: CanvasRenderingContext2D;
  mediaSize: { width: number; height: number };
  bitmapSize: { width: number; height: number };
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

export abstract class BitmapCoordinatesPaneRenderer {
  abstract draw(scope: DrawScope): void;

  hitTest(x: number, y: number): HitTestResult | null {
    void x;
    void y;
    return null;
  }
}
