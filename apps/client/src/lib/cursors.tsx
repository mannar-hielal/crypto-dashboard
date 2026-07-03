/* eslint-disable react-refresh/only-export-components */
// ─── Cursor variant SVG icons (TradingView style) ───────────────────────────

import type { JSX } from 'react';

function CrossIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor">
        <path d="M18 15h8v-1h-8z" />
        <path d="M14 18v8h1v-8zM14 3v8h1v-8zM3 15h8v-1h-8z" />
      </g>
    </svg>
  );
}

function DotIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <circle fill="currentColor" cx="14" cy="14" r="3" />
    </svg>
  );
}

function ArrowIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <path
        fill="currentColor"
        d="M11.682 16.09l3.504 6.068 1.732-1-3.497-6.057 3.595-2.1L8 7.74v10.512l3.682-2.163zm-.362 1.372L7 20V6l12 7-4.216 2.462 3.5 6.062-3.464 2-3.5-6.062z"
      />
    </svg>
  );
}

function EraserIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 31" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M15.3 22l8.187-8.187c.394-.394.395-1.028.004-1.418l-4.243-4.243c-.394-.394-1.019-.395-1.407-.006l-11.325 11.325c-.383.383-.383 1.018.007 1.407l1.121 1.121h7.656zm-9.484-.414c-.781-.781-.779-2.049-.007-2.821l11.325-11.325c.777-.777 2.035-.78 2.821.006l4.243 4.243c.781.781.78 2.048-.004 2.832l-8.48 8.48h-8.484l-1.414-1.414z" />
        <path d="M13.011 22.999h7.999v-1h-7.999zM13.501 11.294l6.717 6.717.707-.707-6.717-6.717z" />
      </g>
    </svg>
  );
}

// ─── Cursor variant definitions ─────────────────────────────────────────────

export type CursorVariantId = 'cross' | 'dot' | 'arrow' | 'eraser';

/** Build a data-URI SVG cursor from SVG paths.
 *  Renders with a dark outline + white fill so it's visible on any background.
 *  Hotspot is centred at (14,14) on a 28×28 viewBox (scaled to 24×24 CSS pixels). */
function svgCursor(svgContent: string): string {
  const uri = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 28 28">${svgContent}</svg>`
  );
  return `url("data:image/svg+xml,${uri}") 14 14, auto`;
}

export const CURSOR_CSS_MAP: Record<CursorVariantId, string> = {
  cross: svgCursor(`
    <g fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round">
      <path d="M18 15h8v-1h-8zM14 18v8h1v-8zM14 3v8h1v-8zM3 15h8v-1h-8z"/>
    </g>
    <g fill="white" stroke="none">
      <path d="M18 15h8v-1h-8zM14 18v8h1v-8zM14 3v8h1v-8zM3 15h8v-1h-8z"/>
    </g>
  `),
  dot: svgCursor(`
    <g stroke="none">
      <circle cx="14" cy="14" r="6" fill="#111"/>
      <circle cx="14" cy="14" r="3" fill="white"/>
    </g>
  `),
  arrow: svgCursor(`
    <g fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round">
      <path d="M11.682 16.09l3.504 6.068 1.732-1-3.497-6.057 3.595-2.1L8 7.74v10.512l3.682-2.163zm-.362 1.372L7 20V6l12 7-4.216 2.462 3.5 6.062-3.464 2-3.5-6.062z"/>
    </g>
    <g fill="white" stroke="none">
      <path d="M11.682 16.09l3.504 6.068 1.732-1-3.497-6.057 3.595-2.1L8 7.74v10.512l3.682-2.163zm-.362 1.372L7 20V6l12 7-4.216 2.462 3.5 6.062-3.464 2-3.5-6.062z"/>
    </g>
  `),
  eraser: svgCursor(`
    <g fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round">
      <path d="M15.3 22l8.187-8.187c.394-.394.395-1.028.004-1.418l-4.243-4.243c-.394-.394-1.019-.395-1.407-.006l-11.325 11.325c-.383.383-.383 1.018.007 1.407l1.121 1.121h7.656zm-9.484-.414c-.781-.781-.779-2.049-.007-2.821l11.325-11.325c.777-.777 2.035-.78 2.821.006l4.243 4.243c.781.781.78 2.048-.004 2.832l-8.48 8.48h-8.484l-1.414-1.414z"/>
      <path d="M13.011 22.999h7.999v-1h-7.999z"/>
    </g>
    <g fill="white" stroke="none">
      <path d="M15.3 22l8.187-8.187c.394-.394.395-1.028.004-1.418l-4.243-4.243c-.394-.394-1.019-.395-1.407-.006l-11.325 11.325c-.383.383-.383 1.018.007 1.407l1.121 1.121h7.656zm-9.484-.414c-.781-.781-.779-2.049-.007-2.821l11.325-11.325c.777-.777 2.035-.78 2.821.006l4.243 4.243c.781.781.78 2.048-.004 2.832l-8.48 8.48h-8.484l-1.414-1.414z"/>
      <path d="M13.011 22.999h7.999v-1h-7.999z"/>
    </g>
  `),
};

export interface CursorVariant {
  id: CursorVariantId;
  icon: (props: { size?: number }) => JSX.Element;
  label: string;
}

export const CURSOR_VARIANTS: (CursorVariant | null)[] = [
  { id: 'cross', icon: CrossIcon, label: 'Cross' },
  { id: 'dot', icon: DotIcon, label: 'Dot' },
  { id: 'arrow', icon: ArrowIcon, label: 'Arrow' },
  null,
  { id: 'eraser', icon: EraserIcon, label: 'Eraser' },
];
