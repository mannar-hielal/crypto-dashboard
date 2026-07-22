// ─── Hit targets ─────────────────────────────────────────────────────────

export const HitTarget = {
  MovePoint: 'move-point',
  ChangePoint: 'change-point',
  Regular: 'regular',
  None: 'none',
} as const;

export type HitTarget = (typeof HitTarget)[keyof typeof HitTarget];

// ─── Cursor types ────────────────────────────────────────────────────────

export const PaneCursorType = {
  Default: 'default',
  Pointer: 'pointer',
  Eraser: 'eraser',
  Grabbing: 'grabbing',
  ZoomIn: 'zoom-in',
  Crosshair: 'crosshair',
  VerticalResize: 'vertical-resize',
  HorizontalResize: 'horizontal-resize',
  DiagonalNeSwResize: 'diagonal-ne-sw-resize',
  DiagonalNwSeResize: 'diagonal-nw-se-resize',
  Text: 'text',
  None: 'none',
} as const;

export type PaneCursorType = (typeof PaneCursorType)[keyof typeof PaneCursorType];

// ─── Hit test result ─────────────────────────────────────────────────────

export interface HitTestResult {
  target: HitTarget;
  pointIndex?: number;
  cursor?: PaneCursorType;
}
