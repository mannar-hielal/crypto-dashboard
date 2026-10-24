/**
 * The candle under the learner's pointer, for the tour's "hover a candle" tasks (Lesson 1's "Try it",
 * owner 2026-10-23). ChartPanel reports what its crosshair is on; the tour listens. Read only: it
 * never moves or changes the learner's chart. A plain listener set, so a chart with no tour running
 * pays one empty-set check per crosshair move.
 */

export interface HoveredBar {
  /** Candle open time, seconds */
  time: number;
  open: number;
  close: number;
  /** The newest candle, the one still being drawn */
  isLast: boolean;
}

export type HoverWant = 'last' | 'falling';

type Listener = (bar: HoveredBar | null) => void;

const listeners = new Set<Listener>();

export function hasHoverListeners(): boolean {
  return listeners.size > 0;
}

export function reportHover(bar: HoveredBar | null): void {
  for (const listener of listeners) listener(bar);
}

/** Returns the unsubscribe */
export function onHover(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * What a crosshair move means for a hover task: the candle under the pointer, or null when it's off
 * the chart or on a gap with no candle (a leave has to be reported, or a "rest on it" timer would
 * finish after the pointer moved away). `lastTime` is the newest candle's time.
 */
export function crosshairHover(
  time: number | undefined,
  onCanvas: boolean,
  candle: { open: number; close: number } | undefined,
  lastTime: number | undefined
): HoveredBar | null {
  if (time === undefined || !onCanvas || !candle) return null;
  return { time, open: candle.open, close: candle.close, isLast: time === lastTime };
}

/** Whether the hovered candle is the one a task asks for */
export function matchesHover(want: HoverWant, bar: HoveredBar | null): boolean {
  if (!bar) return false;
  return want === 'last' ? bar.isLast : bar.close < bar.open;
}
