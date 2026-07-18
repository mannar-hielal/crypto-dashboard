/* eslint-disable react-refresh/only-export-components */
// ─── Text & Notes tool SVG icons (TradingView style) ──────────────────────
//
// SVG path data is copied verbatim from TradingView's drawing-tools submenu
// markup. Each icon uses a 28×28 viewBox with `fill="currentColor"` so it
// inherits the toolbar's text color like the existing `LINE_TOOLS` icons.
//
// Display order (per the user-confirmed scope in docs/DRAWING_TOOLS.md P6):
//   text → separator → note → callout → separator → priceNote → priceLabel

import type { JSX } from 'react';

// ─── SVG icon components ──────────────────────────────────────────────────

function TextIcon({ size = 28 }: { size?: number }) {
  // Source: TradingView LineToolText icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <path
        fill="currentColor"
        d="M8 6.5c0-.28.22-.5.5-.5H14v16h-2v1h5v-1h-2V6h5.5c.28 0 .5.22.5.5V9h1V6.5c0-.83-.67-1.5-1.5-1.5h-12C7.67 5 7 5.67 7 6.5V9h1V6.5Z"
      />
    </svg>
  );
}

function NoteIcon({ size = 28 }: { size?: number }) {
  // Source: TradingView LineToolTextNote icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5 3h17v13H5V3Zm8 14H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h17a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-8v4.05a2.5 2.5 0 1 1-1 0V17Zm.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM14 5h3a1 1 0 0 1 1 1v2h-1V6h-3v7h2v1h-5v-1h2V6h-3v2H9V6a1 1 0 0 1 1-1h4Z"
      />
    </svg>
  );
}

function CalloutIcon({ size = 28 }: { size?: number }) {
  // Source: TradingView LineToolCallout icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <path
        fill="currentColor"
        fillRule="nonzero"
        d="M6 21.586l3.586-3.586h13.407c.004 0 .007-11.993.007-11.993 0-.007-17-.007-17-.007v15.586zm-1 2.414v-18.005c0-.549.451-.995.995-.995h17.01c.549 0 .995.45.995 1.007v11.986c0 .556-.45 1.007-1.007 1.007h-12.993l-5 5z"
      />
    </svg>
  );
}

function PriceNoteIcon({ size = 28 }: { size?: number }) {
  // Source: TradingView LineToolPriceNote icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M22 3H5v13h17V3ZM5 17h8v4.05a2.5 2.5 0 1 0 1 0V17h8a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Zm10 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13 4h1v1h.5A2.5 2.5 0 0 1 17 7.5V8h-1v-.5c0-.83-.67-1.5-1.5-1.5H14v3h.5a2.5 2.5 0 0 1 0 5H14v1h-1v-1h-.5a2.5 2.5 0 0 1-2.5-2.5V11h1v.5c0 .83.67 1.5 1.5 1.5h.5v-3h-.5a2.5 2.5 0 0 1 0-5h.5V4Zm0 2h-.5a1.5 1.5 0 0 0 0 3h.5V6Zm1 4v3h.5a1.5 1.5 0 0 0 0-3H14Z"
      />
    </svg>
  );
}

function PriceLabelIcon({ size = 28 }: { size?: number }) {
  // Source: TradingView LineToolPriceLabel icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M6.995 5c.008 0 .005 15.5.005 15.5h-1v-15.493c0-.556.451-1.007.995-1.007h17.01c.549 0 .995.45.995 1.007v11.986c0 .556-.45 1.007-1.007 1.007h-12.993l-3.104 3.104-.707-.707 3.397-3.397h13.407c.004 0 .007-11.993.007-11.993 0-.007-17.005-.007-17.005-.007z" />
        <path d="M6.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

// ─── Text & note tool definitions ────────────────────────────────────────

export type TextNoteToolId = 'text' | 'note' | 'callout' | 'priceNote' | 'priceLabel';

export interface TextNoteTool {
  id: TextNoteToolId;
  icon: (props: { size?: number }) => JSX.Element;
  label: string;
}

/**
 * Submenu entries — order mirrors the user-confirmed TradingView layout:
 *   Text · separator · Note · Callout · separator · Price Note · Price Label
 */
export const TEXT_NOTES: (TextNoteTool | null)[] = [
  { id: 'text', icon: TextIcon, label: 'Text' },
  null,
  { id: 'note', icon: NoteIcon, label: 'Note' },
  { id: 'callout', icon: CalloutIcon, label: 'Callout' },
  null,
  { id: 'priceNote', icon: PriceNoteIcon, label: 'Price note' },
  { id: 'priceLabel', icon: PriceLabelIcon, label: 'Price label' },
];

/** Type guard — true for any of the five text/note tool ids. */
export function isTextNoteTool(id: string | undefined | null): id is TextNoteToolId {
  if (!id) return false;
  return TEXT_NOTES.some((t) => t !== null && t.id === id);
}

/** True for the 4 text/note shapes that have an editable label body. */
export const TEXT_NOTE_EDITABLE_IDS: ReadonlySet<TextNoteToolId> = new Set([
  'text',
  'note',
  'callout',
  'priceNote',
]);
