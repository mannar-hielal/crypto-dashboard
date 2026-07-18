// ─── Text layout for annotation drawing primitives + textarea editor ────
//
// Pure helpers used by both DrawingPrimitive (Canvas) and TextDrawingEditor
// (HTML textarea overlay). They MUST produce identical bounds, otherwise the
// textarea rect drifts from the canvas-rendered text under pan/zoom.
//
// Shared measuring helpers:
//   - splitLines(label)        — split on `\n`, dropping trailing empties
//   - measureLine(ctx, text, fontSize, fontFamily)
//                             — mesure a single line on a CanvasRenderingContext2D
//   - textBlockBounds(ctx, label, fontSize, fontFamily, paddingPx, minLines)
//                             — box {w, h} for a multiline label
//
// The HTML editor uses these by rendering into a hidden canvas once for
// measuring alignment, then sizing the textarea using the resulting width
// and a 0.6 line-height multiplier matching `font.sans` natural metrics.

import { font } from '@/lib/tokens';

export const FONT_FAMILY = font.sans;
export const BOX_PADDING_PX = 8; // padding inside note/callout/priceNote boxes
export const BOX_RADIUS_PX = 6; // border radius for note/callout/priceNote
export const PILL_RADIUS_PX = 4; // border radius for price pills
export const BOX_LEADER_TAIL_PX = 10; // length of callout leader tail
export const TEXT_LINE_HEIGHT = 1.2; // CSS line-height multiplier matching canvas fillText
export const DEFAULT_LABEL = 'Enter text';

/** Split a label into display lines. Drops the trailing empty line produced
 *  by a final `\n` so the box doesn't grow upright after the user ends typing
 *  with Enter-then-commit-on-blur. Returns `[]` when `label` is falsy. */
export function splitLines(label: string | undefined): string[] {
  if (!label) return [];
  const lines = label.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Measure a single line on the given 2D context using the global font. */
export function measureLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontFamily: string = FONT_FAMILY
): number {
  ctx.save();
  ctx.font = `${fontSize}px ${fontFamily}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** Box bounds for a multiline label including padding. Returns {w, h, lineH}
 *  where `lineH = fontSize * TEXT_LINE_HEIGHT`. Empty label returns the
 *  collapsed minimum box (one text-line of empty content + padding). */
export function textBlockBounds(
  ctx: CanvasRenderingContext2D,
  label: string | undefined,
  fontSize: number,
  fontFamily: string = FONT_FAMILY,
  paddingPx: number = BOX_PADDING_PX,
  minLines: number = 1
): { w: number; h: number; lineH: number } {
  const lines = splitLines(label);
  const visibleLines = Math.max(minLines, lines.length);
  const lineH = Math.round(fontSize * TEXT_LINE_HEIGHT);
  // Width = widest line; empty placeholder = DEFAULT_LABEL width
  let maxW = 0;
  if (lines.length === 0) {
    maxW = measureLine(ctx, DEFAULT_LABEL, fontSize, fontFamily);
  } else {
    for (const ln of lines) {
      const w = measureLine(ctx, ln, fontSize, fontFamily);
      if (w > maxW) maxW = w;
    }
  }
  const w = Math.ceil(maxW) + paddingPx * 2;
  const h = lineH * visibleLines + paddingPx * 2;
  return { w, h, lineH };
}

/** Format an anchor price the way the price pill renders it.
 *  Mirrors `toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})`. */
export function formatPriceLabel(price: number): string {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Build the CSS `font` shorthand string for a given size — used by the
 *  textarea editor so its font matches the canvas-rendered text exactly. */
export function fontCssShorthand(fontSize: number, fontFamily: string = FONT_FAMILY): string {
  return `${fontSize}px ${fontFamily}`;
}

/** True if the given shape type is one of the P6 single-anchor text/note
 *  shapes. Re-exported here so the renderer/editor don't pull in `textNotes`
 *  (a tsx module with React icon components) just for the type guard. */
export function isTextNoteShape(type: string): boolean {
  return (
    type === 'text' ||
    type === 'note' ||
    type === 'callout' ||
    type === 'priceNote' ||
    type === 'priceLabel'
  );
}

/** Compute the screen-space box (CSS pixels) for a single-anchor annotation
 *  drawing based on its shape type + measured label width. Shared by the
 *  canvas renderer (DrawingPrimitive) and the HTML textarea overlay
 *  (TextDrawingEditor) so the textarea rect matches the canvas text under
 *  pan/zoom. `ctx` is any CanvasRenderingContext2D used only for measuring
 *  via `measureText`; passing the chart's own or an offscreen canvas both work. */
export function computeAnnotationBox(
  ctx: CanvasRenderingContext2D,
  drawing: { label?: string; fontSize: number; shape: { type: string } },
  anchorX: number,
  anchorY: number
): { x: number; y: number; w: number; h: number } | null {
  const { type } = drawing.shape;
  const padding = type === 'text' ? 1 : BOX_PADDING_PX;
  const b = textBlockBounds(ctx, drawing.label, drawing.fontSize, FONT_FAMILY, padding);
  switch (type) {
    case 'text':
    case 'priceLabel':
      return { x: anchorX - b.w / 2, y: anchorY - b.h / 2, w: b.w, h: b.h };
    case 'note':
    case 'priceNote':
      return { x: anchorX + 6, y: anchorY - b.h - 6, w: b.w, h: b.h };
    case 'callout':
      return { x: anchorX - b.w / 2, y: anchorY - b.h - BOX_LEADER_TAIL_PX, w: b.w, h: b.h };
    default:
      return null;
  }
}
