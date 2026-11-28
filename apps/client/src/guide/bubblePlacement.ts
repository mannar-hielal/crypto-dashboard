/**
 * Where the tour bubble goes: below the control, above it when there is no room, inside it when
 * the control is huge (the chart), always kept inside the viewport. Pure geometry.
 */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  placement: 'below' | 'above' | 'beside' | 'inside' | 'center';
}

export const BUBBLE_GAP = 12;
export const VIEWPORT_MARGIN = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placeBubble(
  target: Box | null,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number }
): Placement {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - bubble.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - bubble.height - VIEWPORT_MARGIN);

  if (!target) {
    return {
      top: clamp((viewport.height - bubble.height) / 2, VIEWPORT_MARGIN, maxTop),
      left: clamp((viewport.width - bubble.width) / 2, VIEWPORT_MARGIN, maxLeft),
      placement: 'center',
    };
  }

  const centredLeft = clamp(
    target.left + target.width / 2 - bubble.width / 2,
    VIEWPORT_MARGIN,
    maxLeft
  );

  // To its left, level with it: for a control with no room above or below (a docked panel's request
  // on a short screen), so the bubble never hides it
  const besideLeft = target.left - BUBBLE_GAP - bubble.width;
  const beside: Placement | null =
    besideLeft >= VIEWPORT_MARGIN
      ? { top: clamp(target.top, VIEWPORT_MARGIN, maxTop), left: besideLeft, placement: 'beside' }
      : null;

  // A control that fills most of the screen (the chart): the bubble sits inside it, near the top.
  // By height only (2026-11-28): a wide, short control (a phone's full-width Buy button, a table row)
  // has room above or below, and a bubble inside it covered the very button the step asked for
  if (target.height > viewport.height * 0.5) {
    if (beside) return beside;
    return {
      top: clamp(target.top + 24, VIEWPORT_MARGIN, maxTop),
      left: centredLeft,
      placement: 'inside',
    };
  }

  const below = target.top + target.height + BUBBLE_GAP;
  if (below + bubble.height <= viewport.height - VIEWPORT_MARGIN) {
    return { top: below, left: centredLeft, placement: 'below' };
  }
  const above = target.top - BUBBLE_GAP - bubble.height;
  if (above >= VIEWPORT_MARGIN) {
    return { top: above, left: centredLeft, placement: 'above' };
  }
  // Neither above nor below: beside it, else the nearest free corner
  return beside ?? { top: maxTop, left: centredLeft, placement: 'inside' };
}
