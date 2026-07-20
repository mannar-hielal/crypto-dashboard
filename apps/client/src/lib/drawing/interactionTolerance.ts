// ─── interactionTolerance — centralized hit-test thresholds ──────────
//
// Matches the TradingView pattern (module 604214 in the extracted chunks):
// a single source of truth for body / handle / arrow proximity thresholds.
// Every renderer's hitTest() reads these so tweaking one constant adjusts
// all shapes uniformly.

export const BODY_HIT_TOLERANCE_PX = 8;
export const HANDLE_HIT_TOLERANCE_PX = 12;

export function interactionTolerance(): {
  body: number;
  handle: number;
} {
  return { body: BODY_HIT_TOLERANCE_PX, handle: HANDLE_HIT_TOLERANCE_PX };
}
