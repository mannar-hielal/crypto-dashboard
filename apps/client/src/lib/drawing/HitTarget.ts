// ─── HitTarget — hit-test result types ───────────────────────────────
//
// Matches the TradingView pattern (module 763 in the extracted chunks):
// HitTarget is an enum-like set of constants encoding what part of a
// drawing was hit (if any). HitTestResult bundles the target + distance
// so CompositeRenderer can find the nearest hit across all sub-renderers.

export const HitTarget = {
  None: 0,
  Body: 1,
  Handle: 2,
} as const;

export type HitTargetType = (typeof HitTarget)[keyof typeof HitTarget];

export interface HitTestResult {
  hitTarget: HitTargetType;
  distance: number;
}
