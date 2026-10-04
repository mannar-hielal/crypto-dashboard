/*
 * TV fib level labels (module 445750 LineToolPaneViewFibWithLabels
 * `_updateLabelForLevel` / `_updateRendererLabel` + TextRenderer
 * getTextAlignInBox): the coefficient (number, or percent with 2 decimals)
 * and / or " (price)", in a text box 4px from the level's end chosen by the
 * horizontal alignment; font = labelFontSize (factory 12).
 */
import { tvTextLayout } from './tv-text';

/** Level value text (TV numeric / percentage formatter). */
export function fibCoeffText(coeff: number, percents: boolean): string {
  if (percents) return `${(100 * coeff).toFixed(2)}%`;
  return String(Math.round(coeff * 1e4) / 1e4);
}

/** Label of a horizontal level from `left` to `right` at `y`. TV Left = the
 *  box ends 4px before the left end (with extend left: starts 4px after the
 *  pane's left edge), Right = starts 4px after the right end (extend right:
 *  ends 4px before the pane edge), Center = the middle of the drawn span. */
export function fibLevelLabel(o: {
  text: string;
  y: number;
  left: number;
  right: number;
  extendLeft: boolean;
  extendRight: boolean;
  paneW: number;
  horz: 'left' | 'center' | 'right';
  vert: 'top' | 'middle' | 'bottom';
  fs: number;
}) {
  if (!o.text) return null;
  let x: number;
  let horz: 'left' | 'center' | 'right';
  if (o.horz === 'left') {
    x = o.extendLeft ? 0 : o.left;
    horz = o.extendLeft ? 'left' : 'right';
  } else if (o.horz === 'right') {
    x = o.extendRight ? o.paneW : o.right;
    horz = o.extendRight ? 'right' : 'left';
  } else {
    x = ((o.extendLeft ? 0 : o.left) + (o.extendRight ? o.paneW : o.right)) / 2;
    horz = 'center';
  }
  return tvTextLayout({ x, y: o.y, text: o.text, fs: o.fs, vert: o.vert, horz, offsetX: 4 });
}

// ─── Local change (cryptopapertrade, 2026-10-04): pill labels ───────────────
// The host can draw the horizontal fib levels' value labels (retracement, trend-based extension)
// as a pill at the level's right end — `61.8% · 83183.52`, white on the level colour — instead of
// TV's plain text at the chosen alignment. Owner decision (visual Q&A): readable over candles.

export type FibLabelMode = 'tradingview' | 'pill';

let fibLabelMode: FibLabelMode = 'tradingview';

/** Host setting: how fib level value labels are drawn (default TV's). */
export function setFibLabelMode(mode: FibLabelMode): void {
  fibLabelMode = mode;
}

export function getFibLabelMode(): FibLabelMode {
  return fibLabelMode;
}

/** Pill text: the level as a percent with one decimal, then the price. */
export function fibPillText(coeff: number, priceText: string | null, showCoeff: boolean): string {
  const parts: string[] = [];
  if (showCoeff) parts.push(`${(100 * coeff).toFixed(1)}%`);
  if (priceText !== null) parts.push(priceText);
  return parts.join(' \u00b7 ');
}

/** The pill box: it starts 5px before the level's right end (with extend right, or when it
 *  would leave the pane, it ends 2px inside the pane's right edge), centred on the level. */
export function fibPillBox(o: {
  textW: number;
  y: number;
  right: number;
  paneW: number;
  extendRight: boolean;
  fs: number;
}): { x: number; y: number; w: number; h: number; textX: number } {
  const padX = 4;
  const padY = 3;
  const w = o.textW + 2 * padX;
  const h = o.fs + 2 * padY;
  const wanted = o.extendRight ? o.paneW - w - 2 : o.right - 5 - padX;
  const x = Math.max(0, Math.min(wanted, o.paneW - w - 2));
  return { x, y: o.y - h / 2, w, h, textX: x + padX };
}
