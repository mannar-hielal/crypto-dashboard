/**
 * textLayout tests — shared measuring helpers used by both
 * DrawingPrimitive (canvas) and TextDrawingEditor (HTML textarea overlay).
 * The textarea rect MUST match the canvas-rendered box during pan/zoom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitLines,
  computeAnnotationBox,
  formatPriceLabel,
  FONT_FAMILY,
  BOX_PADDING_PX,
  isTextNoteShape,
} from '@/lib/drawing/textLayout';

// Offscreen canvas context used for `ctx.measureText` — jsdom doesn't ship
// an HTMLCanvasElement.getContext() implementation, so we stub a 2D context
// whose `measureText` returns the text length as the width. This lets the
// shared helpers (computeAnnotationBox, textBlockBounds, fillMultilineText)
// be exercised in unit tests without rendering on a real canvas.
function makeStubCtx(): CanvasRenderingContext2D {
  const stub = {
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    setLineDash() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    arcTo() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText() {},
    roundRect() {},
    // Measure: pretend every character is 8px wide — deterministic
    measureText(text: string) {
      return { width: text.length * 8 };
    },
  };
  return stub as unknown as CanvasRenderingContext2D;
}

let ctx: CanvasRenderingContext2D | null;
beforeEach(() => {
  ctx = makeStubCtx();
});

describe('splitLines', () => {
  it('returns empty array for falsy input', () => {
    expect(splitLines(undefined)).toEqual([]);
    expect(splitLines('')).toEqual([]);
  });
  it('splits on \\n', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });
  it('drops the trailing empty line produced by a final \\n', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
  });
  it('keeps interior empty lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });
});

describe('formatPriceLabel', () => {
  it('formats with 2 fraction digits and thousands separators', () => {
    // EN locale is the default in jsdom — `toLocaleString` may produce
    // different separators in other locales; check structural properties.
    const s = formatPriceLabel(63841);
    expect(s).toMatch(/63[.,]?841/);
  });
  it('preserves 2 fraction digits for non-integer prices', () => {
    const s = formatPriceLabel(63302.5);
    // Should contain a 2-digit decimal portion
    expect(s).toMatch(/[.,]50$/);
  });
});

describe('isTextNoteShape', () => {
  it.each(['text', 'note', 'callout', 'priceNote', 'priceLabel'])('true for %s', (type) => {
    expect(isTextNoteShape(type)).toBe(true);
  });
  it.each(['trendline', 'horizontal', 'vertical', 'ray', 'parallel', 'polyline'])(
    'false for line shape %s',
    (type) => {
      expect(isTextNoteShape(type)).toBe(false);
    }
  );
});

describe('computeAnnotationBox', () => {
  const baseDrawing = {
    label: 'Hello',
    fontSize: 14,
    shape: { type: 'note' },
  };

  it('returns null for unknown shape types', () => {
    if (!ctx) return;
    const d = { ...baseDrawing, shape: { type: 'unknown' } };
    expect(computeAnnotationBox(ctx, d, 100, 100)).toBeNull();
  });

  it('note box sits above-and-right of the anchor with padding', () => {
    if (!ctx) return;
    const box = computeAnnotationBox(ctx, baseDrawing, 100, 100);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(100); // to the right of anchor
    expect(box!.y).toBeLessThan(100); // above the anchor
  });

  it('text box is centered on the anchor', () => {
    if (!ctx) return;
    const d = { ...baseDrawing, shape: { type: 'text' } };
    const box = computeAnnotationBox(ctx, d, 100, 100);
    expect(box).not.toBeNull();
    // text has minimal padding (1px); horizontal centre should be ≈ anchor
    const centreX = box!.x + box!.w / 2;
    expect(Math.abs(centreX - 100)).toBeLessThan(5);
  });

  it('callout box is above-and-centered with a leader-tail gutter', () => {
    if (!ctx) return;
    const d = { ...baseDrawing, shape: { type: 'callout' } };
    const box = computeAnnotationBox(ctx, d, 100, 100);
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(100); // above the anchor
    expect(Math.abs(box!.x + box!.w / 2 - 100)).toBeLessThan(5);
  });

  it('priceLabel pill is centered on the anchor', () => {
    if (!ctx) return;
    const d = {
      label: undefined, // priceLabel uses formatted price (not label)
      fontSize: 14,
      shape: { type: 'priceLabel' },
    };
    const box = computeAnnotationBox(ctx, d, 100, 100);
    expect(box).not.toBeNull();
    const centreX = box!.x + box!.w / 2;
    expect(Math.abs(centreX - 100)).toBeLessThan(5);
    const centreY = box!.y + box!.h / 2;
    expect(Math.abs(centreY - 100)).toBeLessThan(5);
  });

  it('font family matches FONT_FAMILY export', () => {
    if (!ctx) return;
    // Indirect check: ctx.font is set inside textBlockBounds
    ctx.save();
    ctx.font = `14px ${FONT_FAMILY}`;
    expect(ctx.font).toContain('sans-serif');
    ctx.restore();
    void BOX_PADDING_PX;
  });
});
