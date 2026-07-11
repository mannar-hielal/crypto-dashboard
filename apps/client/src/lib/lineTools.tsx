/* eslint-disable react-refresh/only-export-components */
// ─── Line drawing tool SVG icons (TradingView style) ──────────────────────

import type { JSX } from 'react';

// ─── SVG icon components ──────────────────────────────────────────────────

function TrendlineIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M7.354 21.354l14-14-.707-.707-14 14z" />
        <path d="M22.5 7c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM5.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

function HorizontalLineIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M4 15h8.5v-1h-8.5zM16.5 15h8.5v-1h-8.5z" />
        <path d="M14.5 16c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

function VerticalLineIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M15 12.5v-8.5h-1v8.5zM14 16.5v8.5h1v-8.5z" />
        <path d="M14.5 16c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

function PolylineIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M3 24l7-11 6 3 9-13" />
        <circle cx="3" cy="24" r="2" />
        <circle cx="10" cy="13" r="2" />
        <circle cx="16" cy="16" r="2" />
        <circle cx="25" cy="3" r="2" />
      </g>
    </svg>
  );
}

function RayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M8.354 20.354l5-5-.707-.707-5 5z" />
        <path d="M16.354 12.354l8-8-.707-.707-8 8z" />
        <path d="M14.5 15c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM6.5 23c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

function ParallelIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M8.354 18.354l10-10-.707-.707-10 10zM12.354 25.354l5-5-.707-.707-5 5z" />
        <path d="M20.354 17.354l5-5-.707-.707-5 5z" />
        <path d="M19.5 8c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM6.5 21c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM18.5 20c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

// ─── Line tool definitions ────────────────────────────────────────────────

export type LineToolId = 'trendline' | 'horizontal' | 'vertical' | 'polyline' | 'ray' | 'parallel';

export interface LineTool {
  id: LineToolId;
  icon: (props: { size?: number }) => JSX.Element;
  label: string;
}

export const LINE_TOOLS: (LineTool | null)[] = [
  { id: 'trendline', icon: TrendlineIcon, label: 'Trendline' },
  { id: 'horizontal', icon: HorizontalLineIcon, label: 'Horizontal Line' },
  { id: 'vertical', icon: VerticalLineIcon, label: 'Vertical Line' },
  { id: 'polyline', icon: PolylineIcon, label: 'Polyline' },
  null,
  { id: 'ray', icon: RayIcon, label: 'Ray' },
  { id: 'parallel', icon: ParallelIcon, label: 'Parallel' },
];
