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

// ─── Where the newest candle is on screen ───────────────────────────────────

/** A box in viewport pixels (the same shape as the tour's `Box`) */
export interface CandleBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Locator = () => CandleBox | null;

/** One per mounted chart, keyed by its container: the tour points its arrow at the newest candle
 *  (owner 2026-11-12) of the chart inside the step's anchor */
const locators = new Map<HTMLElement, Locator>();

/** Returns the unregister */
export function registerNewestCandle(container: HTMLElement, locate: Locator): () => void {
  locators.set(container, locate);
  return () => {
    if (locators.get(container) === locate) locators.delete(container);
  };
}

/** The newest candle of the first chart inside `anchor`, or null (no chart, or it's scrolled off) */
export function newestCandleBox(anchor: Element): CandleBox | null {
  for (const [container, locate] of locators) {
    if (anchor === container || anchor.contains(container)) return locate();
  }
  return null;
}

/** The newest candle's box from chart coordinates (relative to the chart's container), or null
 *  when it's off the plot area. A thin candle still gets a box big enough to ring. */
export function candleBoxFrom(
  container: { top: number; left: number; width: number; height: number },
  x: number | null,
  highY: number | null,
  lowY: number | null,
  barSpacing: number,
  plotWidth: number
): CandleBox | null {
  if (x === null || highY === null || lowY === null) return null;
  if (x < 0 || x > plotWidth || !Number.isFinite(highY) || !Number.isFinite(lowY)) return null;
  const width = Math.max(10, Math.round(barSpacing));
  const top = Math.max(0, Math.min(highY, lowY));
  const height = Math.max(12, Math.abs(lowY - highY));
  if (top > container.height) return null;
  return { top: container.top + top, left: container.left + x - width / 2, width, height };
}
