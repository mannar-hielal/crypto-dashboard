// ─── CompositeRenderer — ordered renderer composition ───────────────
//
// Matches the TradingView pattern (module 789190 in the extracted chunks):
// manages an ordered list of BitmapCoordinatesPaneRenderer instances,
// draws them in sequence, and finds the closest hit across all sub‑renderers.
// DrawingPrimitive appends per‑shape renderers + selection renderers + preview
// renderers each frame.

import type { DrawScope } from './BitmapCoordinatesPaneRenderer';
import type { HitTestResult } from '@/lib/drawing/HitTarget';
import { HitTarget } from '@/lib/drawing/HitTarget';

export interface HitTestOutput {
  renderer: unknown;
  result: HitTestResult;
}

export class CompositeRenderer {
  private _renderers: Array<{
    draw(scope: DrawScope): void;
    hitTest(x: number, y: number): HitTestResult | null;
  }> = [];

  append(renderer: (typeof this._renderers)[number]): void {
    this._renderers.push(renderer);
  }

  insert(renderer: (typeof this._renderers)[number], index: number): void {
    this._renderers.splice(index, 0, renderer);
  }

  remove(renderer: (typeof this._renderers)[number]): void {
    const idx = this._renderers.indexOf(renderer);
    if (idx !== -1) this._renderers.splice(idx, 1);
  }

  clear(): void {
    this._renderers.length = 0;
  }

  get length(): number {
    return this._renderers.length;
  }

  draw(scope: DrawScope): void {
    for (const r of this._renderers) {
      r.draw(scope);
    }
  }

  hitTest(x: number, y: number): HitTestOutput | null {
    let best: HitTestOutput | null = null;
    for (const r of this._renderers) {
      const result = r.hitTest(x, y);
      if (result && result.hitTarget !== HitTarget.None) {
        if (!best || result.distance < best.result.distance) {
          best = { renderer: r, result };
        }
      }
    }
    return best;
  }
}
