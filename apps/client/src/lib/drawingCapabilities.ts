/**
 * Which controls a drawing gets in the floating toolbar and the settings dialog (TradingView
 * shows only what the tool supports): read from the library's factory style and spec of its kind.
 */

import { OVERLAY_SPECS, factoryStyleFor, type DrawingKind } from 'lightweight-charts-drawing';

/** Tools with no line of their own: a text box, a marker, a pin */
const NO_LINE: ReadonlySet<string> = new Set([
  'text',
  'note',
  'pin',
  'comment',
  'price-label',
  'flag-mark',
  'signpost',
  'font-icon',
  'arrow-mark-up',
  'arrow-mark-down',
]);

/** The line tools that extend left / right (TradingView's Extend checkboxes) */
const EXTENDABLE: ReadonlySet<string> = new Set([
  'trend-line',
  'ray',
  'extended-line',
  'info-line',
  'trend-angle',
]);

export interface DrawingCapabilities {
  /** Line colour, width and style */
  line: boolean;
  /** A shape's fill colour and opacity */
  fill: boolean;
  /** Text, its colour and size */
  text: boolean;
  /** Extend left / right */
  extend: boolean;
  /** A level ladder (Fib, pitchfork, Gann fan) */
  levels: boolean;
  /** Price labels on the axis */
  priceLabels: boolean;
  /** The style field the text colour lives in: text boxes draw their text in `color` */
  textColorKey: 'textColor' | 'color';
}

export function capabilitiesOf(kind: DrawingKind): DrawingCapabilities {
  const spec = OVERLAY_SPECS[kind];
  const factory = factoryStyleFor(kind);
  const levels = Array.isArray(factory.levels);
  return {
    line: !NO_LINE.has(kind),
    fill: typeof factory.fillBackground === 'boolean' && !levels,
    text: !!spec?.textEditable,
    extend: EXTENDABLE.has(kind),
    levels,
    priceLabels: typeof factory.showPriceLabels === 'boolean',
    textColorKey: typeof factory.textColor === 'string' ? 'textColor' : 'color',
  };
}
