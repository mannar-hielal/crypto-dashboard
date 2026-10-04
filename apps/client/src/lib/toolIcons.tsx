/* eslint-disable react-refresh/only-export-components */
import type { JSX } from 'react';

type IconProps = { size?: number };

function s(size: number = 16) {
  return {
    xmlns: 'http://www.w3.org/2000/svg' as const,
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

// ─── Lines ────────────────────────────────────────────────────────────────

export function TrendLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
    </svg>
  );
}

export function RayIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="15" x2="13" y2="3" />
      <path d="M13 3l-4-1.5M13 3l-1.5 4" />
    </svg>
  );
}

export function InfoLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <circle cx="9" cy="7" r="2.5" />
      <line x1="9" y1="8" x2="9" y2="9" />
      <line x1="9" y1="6" x2="9" y2="6" />
    </svg>
  );
}

export function ExtendedLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="15" x2="15" y2="1" />
      <path d="M3 13l-2 2" />
      <path d="M13 3l2-2" />
    </svg>
  );
}

export function TrendAngleIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <line x1="14" y1="2" x2="14" y2="10" />
      <path d="M8.5 7.5l4-1" />
    </svg>
  );
}

export function HorizontalLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="8" x2="15" y2="8" />
    </svg>
  );
}

export function HorizontalRayIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="8" x2="13" y2="8" />
      <path d="M13 5l3 3-3 3" />
    </svg>
  );
}

export function VerticalLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="8" y1="1" x2="8" y2="15" />
    </svg>
  );
}

export function CrossLineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="15" x2="15" y2="1" />
      <line x1="1" y1="1" x2="15" y2="15" />
    </svg>
  );
}

// ─── Channels ─────────────────────────────────────────────────────────────

export function ParallelChannelIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="12" x2="15" y2="4" />
      <line x1="2" y1="14" x2="15" y2="6" />
    </svg>
  );
}

export function RegressionTrendIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <circle cx="5" cy="11" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="11" cy="5" r="1" />
    </svg>
  );
}

export function FlatTopBottomIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="4" x2="15" y2="4" />
      <line x1="1" y1="12" x2="15" y2="12" />
      <line x1="1" y1="4" x2="1" y2="12" />
      <line x1="15" y1="4" x2="15" y2="12" />
    </svg>
  );
}

export function DisjointChannelIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="1" y1="10" x2="8" y2="2" />
      <line x1="8" y1="14" x2="15" y2="6" />
    </svg>
  );
}

// ─── Pitchforks ───────────────────────────────────────────────────────────

export function AndrewsPitchforkIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="3" y1="14" x2="14" y2="2" />
      <line x1="3" y1="14" x2="14" y2="8" />
      <line x1="3" y1="14" x2="14" y2="14" />
    </svg>
  );
}

export function SchiffPitchforkIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <line x1="2" y1="14" x2="12" y2="14" />
      <line x1="8" y1="8" x2="14" y2="8" />
    </svg>
  );
}

export function ModifiedSchiffPitchforkIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <line x1="2" y1="14" x2="14" y2="14" />
      <line x1="10" y1="6" x2="14" y2="6" />
      <line x1="6" y1="10" x2="14" y2="10" />
    </svg>
  );
}

export function InsidePitchforkIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <line x1="2" y1="14" x2="14" y2="14" />
      <line x1="8" y1="8" x2="14" y2="8" />
      <line x1="8" y1="8" x2="14" y2="14" />
    </svg>
  );
}

// ─── Fibonacci ────────────────────────────────────────────────────────────

export function FibRetracementIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M3 5h22v-1h-22z" />
        <path d="M3 17h22v-1h-22z" />
        <path d="M3 11h19.5v-1h-19.5z" />
        <path d="M5.5 23h19.5v-1h-19.5z" />
        <path d="M3.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM24.5 12c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibExtensionIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M4 25h22v-1h-22z" />
        <path d="M4 21h22v-1h-22z" />
        <path d="M6.5 17h19.5v-1h-19.5z" />
        <path d="M5 14.5v-3h-1v3zM6.617 9.275l10.158-3.628-.336-.942-10.158 3.628z" />
        <path d="M18.5 6c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM4.5 11c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM4.5 18c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibChannelIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M7.463 12.026l13.537-7.167-.468-.884-13.537 7.167z" />
        <path d="M22.708 16.824l-17.884 9.468.468.884 17.884-9.468z" />
        <path d="M22.708 9.824l-15.839 8.386.468.884 15.839-8.386z" />
        <path d="M5.5 14c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM5.5 21c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM22.5 5c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibTimeZoneIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        fillRule="evenodd"
        stroke="none"
        d="M19 4v21h1V4h-1Zm5 0v21h1V4h-1ZM6 12.95V25H5V12.95a2.5 2.5 0 0 1 0-4.9V4h1v4.05a2.5 2.5 0 0 1 1.67 3.7L8.7 12.8 8 13.5l-1-1c-.3.22-.63.38-1 .45ZM5.5 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 19.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm1 5.5v-3.05A2.5 2.5 0 0 1 12.5 18l-1-1 .7-.7 1.05 1.03c.23-.13.48-.23.75-.28V4h1v13.05a2.5 2.5 0 0 1 0 4.9V25h-1ZM8.97 14.47l1.56 1.56.7-.71-1.55-1.55-.7.7Z"
      />
    </svg>
  );
}

export function FibSpeedFanIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M4 2v19.5h1v-19.5zM15.5 10h-11v1h11zM17 12.5v11h1v-11zM6.29 22.417l10.162-10.162-.707-.707-10.162 10.162z" />
        <path d="M19.264 9.443l6.589-6.589-.707-.707-6.589 6.589z" />
        <path d="M6.577 23.381l19.071-5.903-.296-.955-19.071 5.903z" />
        <path d="M5.573 21.724l5.905-19.076-.955-.296-5.905 19.076z" />
        <path d="M6.5 24h19.5v-1h-19.5z" />
        <path d="M4.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM17.5 12c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibTimeExtensionIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M20 2v22h1v-22z" />
        <path d="M24 2v22h1v-22z" />
        <path d="M4.673 11.471l3.69 10.333.942-.336-3.69-10.333z" />
        <path d="M17 21.535v-19.535h-1v19.535z" />
        <path d="M11.5 24h3v-1h-3z" />
        <path d="M4.5 11c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM9.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM16.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibCirclesIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M23.868 7.825c2.791 3.916 2.918 9.33-.065 13.435-3.733 5.138-10.925 6.277-16.063 2.544l.721-.714c4.682 3.294 11.157 2.229 14.534-2.418 2.641-3.635 2.657-8.502.153-12.133l.721-.714z" />
        <path d="M8.477 5.899c3.584-2.509 8.298-2.514 11.865-.127l.718-.721c-3.845-2.669-9.099-2.813-13.157.028-5.203 3.643-6.467 10.814-2.824 16.016l.718-.721c-3.201-4.737-2.022-11.185 2.68-14.476z" />
        <path d="M14.5 22c4.142 0 7.5-3.358 7.5-7.5 0-4.142-3.358-7.5-7.5-7.5-4.142 0-7.5 3.358-7.5 7.5 0 4.142 3.358 7.5 7.5 7.5zm0 1c-4.694 0-8.5-3.806-8.5-8.5s3.806-8.5 8.5-8.5 8.5 3.806 8.5 8.5-3.806 8.5-8.5 8.5z" />
        <path d="M14.5 19c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5-4.5 2.015-4.5 4.5 2.015 4.5 4.5 4.5zm0 1c-3.038 0-5.5-2.462-5.5-5.5s2.462-5.5 5.5-5.5 5.5 2.462 5.5 5.5-2.462 5.5-5.5 5.5z" />
        <path d="M22.5 8c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM6.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibSpiralIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M4.395 10.18c3.432-4.412 10.065-4.998 13.675-.973l.745-.668c-4.044-4.509-11.409-3.858-15.209 1.027l.789.614z" />
        <path d="M19.991 12.494c.877 2.718.231 5.487-1.897 7.543-2.646 2.556-6.752 2.83-9.188.477-1.992-1.924-2.027-5.38-.059-7.281 1.582-1.528 3.78-1.587 5.305-.115 1.024.99 1.386 2.424.876 3.491l.902.431c.709-1.482.232-3.37-1.084-4.641-1.921-1.855-4.734-1.78-6.695.115-2.378 2.297-2.337 6.405.059 8.719 2.846 2.749 7.563 2.435 10.577-.477 2.407-2.325 3.147-5.493 2.154-8.569l-.952.307z" />
        <path d="M21.01 9.697l3.197-3.197-.707-.707-3.197 3.197z" />
        <path d="M14.989 15.719l3.674-3.674-.707-.707-3.674 3.674z" />
        <path d="M13.5 18c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM19.5 12c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibArcsIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M8 9.5c0 3.038 2.462 5.5 5.5 5.5s5.5-2.462 5.5-5.5v-.5h-1v.5c0 2.485-2.015 4.5-4.5 4.5s-4.5-2.015-4.5-4.5v-.5h-1v.5z" />
        <path d="M0 9.5c0 7.456 6.044 13.5 13.5 13.5s13.5-6.044 13.5-13.5v-.5h-1v.5c0 6.904-5.596 12.5-12.5 12.5s-12.5-5.596-12.5-12.5v-.5h-1v.5z" />
        <path d="M4 9.5c0 4.259 2.828 7.964 6.86 9.128l.48.139.277-.961-.48-.139c-3.607-1.041-6.137-4.356-6.137-8.167v-.5h-1v.5z" />
        <path d="M16.141 18.628c4.032-1.165 6.859-4.869 6.859-9.128v-.5h-1v.5c0 3.811-2.53 7.125-6.136 8.167l-.48.139.278.961.48-.139z" />
        <path d="M13.5 20c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM13.5 11c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function FibWedgeIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M21.5 23h-14v1h14zM5 7.5v14h1v-14z" />
        <path d="M12 23c0-3.314-2.686-6-6-6h-.5v1h.5c2.761 0 5 2.239 5 5v.5h1v-.5z" />
        <path d="M20 23c0-7.732-6.268-14-14-14h-.5v1h.5c7.18 0 13 5.82 13 13v.5h1v-.5z" />
        <path d="M16 23c0-5.523-4.477-10-10-10h-.5v1h.5c4.971 0 9 4.029 9 9v.5h1v-.5z" />
        <path d="M5.5 7c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM23.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM5.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function PitchfanIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M20.349 20.654l4.489-.711-.156-.988-4.489.711z" />
        <path d="M7.254 22.728l9.627-1.525-.156-.988-9.627 1.525z" />
        <path d="M7.284 22.118l15.669-8.331-.469-.883-15.669 8.331z" />
        <path d="M6.732 21.248l8.364-15.731-.883-.469-8.364 15.731z" />
        <path d="M17.465 18.758l-8.188-8.188-.707.707 8.188 8.188z" />
        <path d="M6.273 20.818l1.499-9.467-.988-.156-1.499 9.467z" />
        <path d="M8.329 7.834l.715-4.516-.988-.156-.715 4.516z" />
        <path d="M7.354 21.354l17-17-.707-.707-17 17z" />
        <path d="M5.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM7.5 11c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM18.5 22c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

// ─── Gann ─────────────────────────────────────────────────────────────────

export function GannBoxIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M3.5 11h21v-1h-21z" />
        <path d="M3.5 18h21v-1h-21z" />
        <path d="M10 3.5v21h1v-21z" />
        <path d="M17 3.5v21h1v-21z" />
        <path d="M22.5 4v-1h-19.5v19.5h1v-18.5z" />
        <path d="M24 24h-18.507v1h19.507v-19.5h-1z" />
        <path d="M3.5 26c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM24.5 5c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function GannFanIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M7.354 21.354l7.097-7.097-.707-.707-7.097 7.097z" />
        <path d="M17.249 11.458l7.105-7.105-.707-.707-7.105 7.105z" />
        <path d="M7.542 22.683l17.296-2.739-.156-.988-17.296 2.739z" />
        <path d="M7.538 22.062l15.708-7.661-.438-.899-15.708 7.661z" />
        <path d="M6.802 20.97l7.695-15.777-.899-.438-7.695 15.777z" />
        <path d="M6.285 20.741l2.76-17.423-.988-.156-2.76 17.423z" />
        <path d="M5.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM15.5 14c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function GannSquareFixedIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g transform="translate(1 3)">
        <path d="M4.5 21.5h19V.5h-21v19m0-5h5m4 0h12M3 7.5h20M16.5 1v20" />
        <path d="M9.5.5v12m0 4v5m-5.6-1.4l4.2-4.2M11 13L23 1M4.4 21l19.1-6M3.1 19.6L9 .5m14.5 21a21 21 0 0 0-21-21" />
        <circle cx="2.5" cy="21.5" r="2" />
        <circle cx="9.5" cy="14.5" r="2" />
      </g>
    </svg>
  );
}

export function GannSquareIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M22.5 4v-1h-19.5v19.5h1v-18.5z" />
        <path d="M5.493 24v1h19.507v-19.5h-1v18.5z" />
        <path d="M5.275 23.432l18.213-18.213-.707-.707-18.213 18.213z" />
        <path d="M5.568 24.383l19.079-5.906-.296-.955-19.079 5.906z" />
        <path d="M4.587 22.68l5.891-19.032-.955-.296-5.891 19.032z" />
        <path d="M3.5 11h21v-1h-21z" />
        <path d="M3.5 18h21v-1h-21z" />
        <path d="M10 3.5v21h1v-21z" />
        <path d="M17 3.5v21h1v-21z" />
        <path d="M23.975 23.475l1.025 1.025c0-11.874-9.626-21.5-21.5-21.5l1.025 1.025c10.506.517 18.932 8.944 19.45 19.45z" />
        <path d="M3.5 26c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM24.5 5c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

// ─── Brushes ──────────────────────────────────────────────────────────────

export function BrushIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M1.789 23l.859-.854.221-.228c.18-.19.38-.409.597-.655.619-.704 1.238-1.478 1.815-2.298.982-1.396 1.738-2.776 2.177-4.081 1.234-3.667 5.957-4.716 8.923-1.263 3.251 3.785-.037 9.38-5.379 9.38h-9.211zm9.211-1c4.544 0 7.272-4.642 4.621-7.728-2.45-2.853-6.225-2.015-7.216.931-.474 1.408-1.273 2.869-2.307 4.337-.599.852-1.241 1.653-1.882 2.383l-.068.078h6.853z" />
        <path d="M18.182 6.002l-1.419 1.286c-1.031.935-1.075 2.501-.096 3.48l1.877 1.877c.976.976 2.553.954 3.513-.045l5.65-5.874-.721-.693-5.65 5.874c-.574.596-1.507.609-2.086.031l-1.877-1.877c-.574-.574-.548-1.48.061-2.032l1.419-1.286-.672-.741z" />
      </g>
    </svg>
  );
}

export function HighlighterIcon({ size = 23 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 25 23"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        stroke="none"
        d="M13.402 0L6.78144 6.71532C6.67313 6.82518 6.5917 6.95862 6.54354 7.10518L5.13578 11.3889C4.89843 12.1111 5.08375 12.9074 5.61449 13.4458L5.68264 13.5149L0 19.2789L8.12695 22.4056L11.2874 19.1999L11.3556 19.269C11.8863 19.8073 12.6713 19.9953 13.3834 19.7546L17.6013 18.3285C17.7493 18.2784 17.8835 18.1945 17.9931 18.0832L24.6912 11.2892L23.9857 10.5837L17.515 17.147L7.70658 7.19818L14.1076 0.705575L13.402 0ZM6.07573 11.7067L7.24437 8.15061L16.576 17.6158L13.0701 18.8012C12.7141 18.9215 12.3215 18.8275 12.0562 18.5584L6.31509 12.7351C6.04972 12.466 5.95706 12.0678 6.07573 11.7067ZM6.30539 14.3045L10.509 18.5682L7.87935 21.2355L1.78414 18.8904L6.30539 14.3045Z"
      />
    </svg>
  );
}

// ─── Arrows ───────────────────────────────────────────────────────────────

export function ArrowIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="14" y2="2" />
      <path d="M14 2l-5-1M14 2l-1 5" />
    </svg>
  );
}

export function ArrowMarkerIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        stroke="none"
        d="M22.38 4.04h.04a1.3 1.3 0 0 1 1.21.33c.37.36.42.84.33 1.2v.04l-2.45 8.32c-.14.55-.57.91-1 1.04-.45.14-1.2.07-1.55-.63l-.34-.64-12.6 10.03c-.3.25-.67.31-1 .25a1.3 1.3 0 0 1-1.01-1.06c-.05-.31.02-.69.29-.99l.02-.02a35.13 35.13 0 0 0 .47-.57 1749.6 1749.6 0 0 0 5-6.15l3.7-4.57.91-1.13-.63-.33c-.7-.36-.77-1.1-.64-1.55.13-.44.5-.86 1.03-1l8.22-2.57zm-7.95 3.53c-.35.08-.5.56-.2.7l1.71.91-.64.8a17294.8 17294.8 0 0 1-10.24 12.6l-.01.02c-.17.19.15.52.33.35l13.55-10.78.92 1.7c.14.3.62.16.7-.2l2.44-8.31c.05-.24-.1-.4-.35-.35l-8.2 2.56zM5.8 23.27z"
      />
    </svg>
  );
}

export function ArrowMarkUpIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M8 13V4M4 8l4-5 4 5" />
    </svg>
  );
}

export function ArrowMarkDownIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M8 3v9M4 8l4 5 4-5" />
    </svg>
  );
}

// ─── Shapes ───────────────────────────────────────────────────────────────

export function RectangleIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="3" width="12" height="10" />
    </svg>
  );
}

export function RotatedRectangleIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="3" width="12" height="10" transform="rotate(15 8 8)" />
    </svg>
  );
}

export function CircleIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

export function TriangleIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <polygon points="8,2 14,13 2,13" />
    </svg>
  );
}

export function EllipseIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <ellipse cx="8" cy="8" rx="6" ry="4" />
    </svg>
  );
}

export function ArcIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M3 12a7 7 0 0110 0" />
    </svg>
  );
}

export function PathIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M3 13q2-6 4-3t3 0 3-5" />
    </svg>
  );
}

export function PolylineIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <polyline points="2,14 6,8 10,11 14,3" />
    </svg>
  );
}

export function CurveIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M2 13c4-8 8-8 12 0" />
    </svg>
  );
}

export function DoubleCurveIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M2 13c4-8 6-8 6 0" />
      <path d="M8 13c4-8 6-8 6 0" />
    </svg>
  );
}

// ─── Text & Notes ─────────────────────────────────────────────────────────

export function TextAnnotationIcon({ size = 24 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </svg>
  );
}

export function CalloutIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="1" y="3" width="14" height="9" rx="2" />
      <polygon points="5,12 7,15 9,12" />
    </svg>
  );
}

export function NoteIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <line x1="4" y1="6" x2="12" y2="6" strokeWidth="0.8" />
      <line x1="4" y1="9" x2="10" y2="9" strokeWidth="0.8" />
      <line x1="4" y1="12" x2="8" y2="12" strokeWidth="0.8" />
    </svg>
  );
}

export function PriceNoteIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <text x="8" y="10" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7">
        $
      </text>
    </svg>
  );
}

export function PriceLabelIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="4" width="12" height="8" rx="2" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <line x1="2" y1="4" x2="2" y2="1" />
    </svg>
  );
}

export function FlagMarkIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="4" y1="14" x2="4" y2="2" />
      <polygon points="4,2 12,5 4,8" />
    </svg>
  );
}

export function PinIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <circle cx="8" cy="4" r="2" />
      <line x1="8" y1="6" x2="8" y2="14" />
      <line x1="5" y1="14" x2="11" y2="14" />
    </svg>
  );
}

export function CommentIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="1" y="3" width="14" height="9" rx="2" />
      <polygon points="5,12 7,15 9,12" />
      <circle cx="5" cy="7.5" r="1" strokeWidth="0.8" />
      <circle cx="8" cy="7.5" r="1" strokeWidth="0.8" />
      <circle cx="11" cy="7.5" r="1" strokeWidth="0.8" />
    </svg>
  );
}

export function SignpostIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <polygon points="2,3 14,3 14,9 2,9" />
      <polygon points="14,6 12,9 14,12 2,12 2,3" />
    </svg>
  );
}

export function TableIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <rect x="2" y="2" width="12" height="12" />
      <line x1="8" y1="2" x2="8" y2="14" strokeWidth="0.8" />
      <line x1="2" y1="7" x2="14" y2="7" strokeWidth="0.8" />
    </svg>
  );
}

// ─── Projection ───────────────────────────────────────────────────────────

export function LongPositionIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        stroke="none"
        d="M5.5 20c1.2 0 2.22.86 2.45 2H25v1H7.95a2.5 2.5 0 1 1-2.45-3m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M25 18H5v-1h20zm-11-4h3v1h-4V9h1zM5.5 4c1.2 0 2.22.86 2.45 2H25v1H7.95A2.5 2.5 0 1 1 5.5 4m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </svg>
  );
}

export function ShortPositionIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path
        stroke="none"
        d="M5.5 20c1.2 0 2.22.86 2.45 2H25v1H7.95a2.5 2.5 0 1 1-2.45-3m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m9.52-7q.53 0 .93.2l.2.1q.27.17.46.43l.06.1q.2.3.25.73v.02h-.82v-.01a1 1 0 0 0-.36-.55 1.2 1.2 0 0 0-.73-.2q-.22 0-.4.06l-.12.04a1 1 0 0 0-.36.3 1 1 0 0 0-.13.43v.01q0 .2.09.34t.26.25q.19.1.48.2l.76.21q.71.2 1.06.57l.08.1q.27.36.27.9v.02q0 .45-.2.81l-.07.1a2 2 0 0 1-.72.62q-.45.22-1.02.22-.42 0-.77-.1l-.22-.1a2 2 0 0 1-.7-.55 2 2 0 0 1-.3-.84v-.02h.86v.01q.1.36.39.57t.76.22q.34 0 .59-.11a1 1 0 0 0 .4-.31l.06-.1q.09-.17.08-.36a1 1 0 0 0-.1-.38l-.1-.1a1.5 1.5 0 0 0-.65-.34l-.78-.21q-.46-.13-.77-.34-.3-.21-.45-.51-.14-.3-.14-.73 0-.5.24-.88l.06-.09q.24-.32.61-.5.43-.23.96-.23M25 12H5v-1h20zM5.5 4c1.2 0 2.22.86 2.45 2H25v1H7.95A2.5 2.5 0 1 1 5.5 4m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </svg>
  );
}

export function ForecastIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g stroke="none">
        <path d="M19 11h5l-2.5 3z" />
        <circle cx="21.5" cy="16.5" r="1.5" />
        <path fillRule="nonzero" d="M22 11v-6h-1v6z" />
        <path d="M14 18h1v3h-1z" />
        <path d="M14 5h1v6h-1z" />
        <path d="M7 19h1v3h-1z" />
        <path d="M7 6h1v7h-1z" />
        <path
          fillRule="nonzero"
          d="M7 13v6h1v-6h-1zm-1-1h3v8h-3v-8zM14 18h1v-7h-1v7zm-1-8h3v9h-3v-9z"
        />
      </g>
    </svg>
  );
}

export function BarsPatternIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <line x1="2" y1="14" x2="2" y2="4" />
      <line x1="6" y1="14" x2="6" y2="2" />
      <line x1="10" y1="14" x2="10" y2="6" />
      <line x1="14" y1="14" x2="14" y2="3" />
    </svg>
  );
}

export function ProjectionIcon({ size }: IconProps) {
  return (
    <svg {...s(size)}>
      <path d="M2 14q3-4 6-2t6-6" />
      <path d="M10 6l4-2-2 4" />
    </svg>
  );
}

// ─── Measurer ─────────────────────────────────────────────────────────────

export function PriceRangeIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g stroke="none">
        <path fillRule="nonzero" d="M4 5h16.5v-1h-16.5zM25 24h-16.5v1h16.5z" />
        <path
          fillRule="nonzero"
          d="M6.5 26c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM22.5 6c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z"
        />
        <path fillRule="nonzero" d="M14 9v14h1v-14z" />
        <path d="M14.5 6l2.5 3h-5z" />
      </g>
    </svg>
  );
}

export function DateRangeIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g stroke="none">
        <path fillRule="nonzero" d="M20 14h-14v1h14z" />
        <path d="M20 17v-5l3 2.5z" />
        <path fillRule="nonzero" d="M24 8.5v16.5h1v-16.5zM4 4v16.5h1v-16.5z" />
        <path
          fillRule="nonzero"
          d="M4.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM24.5 8c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z"
        />
      </g>
    </svg>
  );
}

export function DatePriceRangeIcon({ size = 28 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g stroke="none">
        <path fillRule="nonzero" d="M6.5 23v1h17.5v-17.5h-1v16.5z" />
        <path fillRule="nonzero" d="M21.5 5v-1h-17.5v17.5h1v-16.5z" />
        <path
          fillRule="nonzero"
          d="M4.5 25c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM23.5 6c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z"
        />
        <path fillRule="nonzero" d="M13 9v13h1v-13z" />
        <path d="M13.5 6l2.5 3h-5z" />
        <path fillRule="nonzero" d="M19 14h-13v1h13z" />
        <path d="M19 17v-5l3 2.5z" />
      </g>
    </svg>
  );
}

// ─── Eraser ────────────────────────────────────────────────────────────────

export function EraserIcon({ size = 22 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 29 31"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <g fillRule="nonzero" stroke="none">
        <path d="M15.3 22l8.187-8.187c.394-.394.395-1.028.004-1.418l-4.243-4.243c-.394-.394-1.019-.395-1.407-.006l-11.325 11.325c-.383.383-.383 1.018.007 1.407l1.121 1.121h7.656zm-9.484-.414c-.781-.781-.779-2.049-.007-2.821l11.325-11.325c.777-.777 2.035-.78 2.821.006l4.243 4.243c.781.781.78 2.048-.004 2.832l-8.48 8.48h-8.484l-1.414-1.414z" />
        <path d="M13.011 22.999h7.999v-1h-7.999zM13.501 11.294l6.717 6.717.707-.707-6.717-6.717z" />
      </g>
    </svg>
  );
}

// ─── Icon lookup ──────────────────────────────────────────────────────────

export const TOOL_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  'trend-line': TrendLineIcon,
  ray: RayIcon,
  'info-line': InfoLineIcon,
  'extended-line': ExtendedLineIcon,
  'trend-angle': TrendAngleIcon,
  'horizontal-line': HorizontalLineIcon,
  'horizontal-ray': HorizontalRayIcon,
  'vertical-line': VerticalLineIcon,
  'cross-line': CrossLineIcon,
  'parallel-channel': ParallelChannelIcon,
  'regression-trend': RegressionTrendIcon,
  'flat-top-bottom': FlatTopBottomIcon,
  'disjoint-channel': DisjointChannelIcon,
  pitchfork: AndrewsPitchforkIcon,
  'schiff-pitchfork': SchiffPitchforkIcon,
  'modified-schiff-pitchfork': ModifiedSchiffPitchforkIcon,
  'inside-pitchfork': InsidePitchforkIcon,
  'fib-retracement': FibRetracementIcon,
  'trend-based-fib-extension': FibExtensionIcon,
  'fib-channel': FibChannelIcon,
  'fib-time-zone': FibTimeZoneIcon,
  'fib-speed-resistance-fan': FibSpeedFanIcon,
  'trend-based-fib-time': FibTimeExtensionIcon,
  'fib-circles': FibCirclesIcon,
  'fib-spiral': FibSpiralIcon,
  'fib-speed-resistance-arcs': FibArcsIcon,
  'fib-wedge': FibWedgeIcon,
  pitchfan: PitchfanIcon,
  'gann-box': GannBoxIcon,
  'gann-fan': GannFanIcon,
  'gann-square-fixed': GannSquareFixedIcon,
  'gann-square': GannSquareIcon,
  brush: BrushIcon,
  highlighter: HighlighterIcon,
  arrow: ArrowIcon,
  'arrow-marker': ArrowMarkerIcon,
  'arrow-mark-up': ArrowMarkUpIcon,
  'arrow-mark-down': ArrowMarkDownIcon,
  rectangle: RectangleIcon,
  'rotated-rectangle': RotatedRectangleIcon,
  circle: CircleIcon,
  triangle: TriangleIcon,
  ellipse: EllipseIcon,
  arc: ArcIcon,
  path: PathIcon,
  polyline: PolylineIcon,
  curve: CurveIcon,
  'double-curve': DoubleCurveIcon,
  text: TextAnnotationIcon,
  callout: CalloutIcon,
  note: NoteIcon,
  'price-note': PriceNoteIcon,
  'price-label': PriceLabelIcon,
  'flag-mark': FlagMarkIcon,
  pin: PinIcon,
  comment: CommentIcon,
  signpost: SignpostIcon,
  table: TableIcon,
  'long-position': LongPositionIcon,
  'short-position': ShortPositionIcon,
  'position-forecast': ForecastIcon,
  'bar-pattern': BarsPatternIcon,
  sector: ProjectionIcon,
  'price-range': PriceRangeIcon,
  'date-range': DateRangeIcon,
  'date-and-price-range': DatePriceRangeIcon,
  eraser: EraserIcon,
};
