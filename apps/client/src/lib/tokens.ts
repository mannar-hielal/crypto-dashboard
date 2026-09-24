/**
 * Design Tokens — single source of truth for all visual constants.
 *
 * Two surfaces of the same token system:
 *   • This file  → JS/TS side: inline styles, canvas-based libs (lightweight-charts)
 *   • index.css  → Tailwind side: --color-brand-* utilities for className usage
 *
 * Rule: never hardcode a hex value or font string in a component.
 * Always import from '@/lib/tokens'.
 */

// ─── Backgrounds ─────────────────────────────────────────────────────────────

export const bg = {
  deep: '#03020a', // deepest tone — cover background base  (Exgen bg solid)
  page: '#060413', // page / chart canvas background  (Exgen gradient start: #060413)
  navy: '#081129', // secondary background tone  (Exgen gradient end: #081129)
  panel: '#25234e', // panel / header / card background  (Exgen card bg: #25234E)
  footer: '#1e1d34', // footer body background  (sampled from footer.png)
  surface: '#3e3c73', // input / card / elevated surface  (sampled from header.png)
  tooltip: '#25234e', // tooltip background — same as panel by default
  modal: '#1e1d34', // modal overlay background
  input: '#3e3c73', // input field background — same as surface
  banner: '#16143a', // cookie banner / toast background — dark violet tint
} as const;

// ─── Brand / UI colors ───────────────────────────────────────────────────────

export const color = {
  green: '#2ccd78', // profit / buy / positive / live  (alt bright: #03e673, alt dark: #28a06b/#29a56c)
  red: '#d5455c', // loss / sell / negative / destructive  (alt dark: #c0414d, alt vivid: #ed0127)
  purple: '#a555e2', // primary accent — vibrant  (sampled from header.png)
  purpleDark: '#695bec', // primary accent — dark/muted, hover states, borders  (sampled from header.png)
  purpleDeep: '#4e3287', // deepest purple — overlays, borders, badge backgrounds  (sampled from header.png)
  glow: '#6662a9', // ambient glow / blur blobs  (Exgen glow: #6662A9)
  amber: '#e7ab33', // warning / margin alert (golden-amber)
  warning: '#f59e0b', // amber-500 — warning callout / alert borders and icons
  warningLight: '#fcd34d', // amber-200 — warning text / alert message text
  muted: '#cac5d4', // secondary / muted text  (sampled from header.png)
  white: '#fcfcfd', // headline / bright text  (Exgen headline: #FCFCFD)
} as const;

// ─── Chart indicator colors ───────────────────────────────────────────────────
// lightweight-charts renders to Canvas — it cannot read CSS variables.
// All chart colors MUST be plain hex strings defined here.

export const chart = {
  // EMA overlay lines
  ema9: '#94a3b8', // slate-400 — fast MA
  ema20: '#3b82f6', // blue — medium MA
  ema200: '#9c27b0', // purple — trend filter (rgb(156,39,176), originally sampled from a since-removed markup reference)

  // VWAP overlay line
  vwap: '#f97316', // orange

  // MACD pane
  macdLine: '#2962ff', // deep blue
  macdSignal: '#ff6d00', // deep orange
  macdHistBull: '#26a69a', // teal — rising positive histogram bar (TVP Color 0)
  macdHistBullDim: '#b2dfdb', // light teal — falling positive (TVP Color 1)
  macdHistBearDim: '#ffcdd2', // light red — rising negative (TVP Color 2)
  macdHistBear: '#ff5252', // red — falling negative histogram bar (TVP Color 3)

  // Candlestick series
  candleUp: '#2ccd78', // bullish / green candle
  candleDown: '#d5455c', // bearish / red   candle

  // Canvas text colour for axis labels / crosshair values
  textColor: '#d1d4dc',

  // Canvas background — must match bg.page exactly
  bg: '#060413',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const font = {
  sans: "'Geist Variable', ui-sans-serif, sans-serif",
  mono: "ui-monospace, 'Geist Mono', monospace",
} as const;

export const fontSize = {
  xxs: '11px', // badge counts, tiny labels          (14px × 0.75 ≈ 11px)
  xs10: '11px', // chart legend, table headers         (15px × 0.75 ≈ 11px)
  xs11: '13px', // standard panel / table body text    (17px × 0.75 ≈ 13px)
  xs: '14px', // Tailwind text-xs equivalent          (18px × 0.75 ≈ 14px)
  sm: '16px', // Tailwind text-sm equivalent          (21px × 0.75 ≈ 16px)
  base: '18px', // Tailwind text-base equivalent        (24px × 0.75)
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.375,
  normal: 1.5,
} as const;

// ─── Gradients ───────────────────────────────────────────────────────────────

export const gradient = {
  /** Brand CTA gradient — used on primary buttons, login hero, brand marks */
  brand: 'linear-gradient(90deg, #FE4BD1 0%, #3F5FF5 100%)',
  brandFrom: '#FE4BD1', // pink-magenta — gradient start (0%)
  brandTo: '#3F5FF5', // blue-purple  — gradient end   (100%)
} as const;

// ─── Border colors ───────────────────────────────────────────────────────────

export const border = {
  default: 'rgba(255,255,255,0.07)',
  hover: 'rgba(255,255,255,0.12)',
  active: color.purpleDark,
  input: 'rgba(255,255,255,0.10)',
  divider: 'rgba(255,255,255,0.06)',
  card: 'rgba(255,255,255,0.08)',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadow = {
  card: '0 2px 8px rgba(0,0,0,0.3)',
  dropdown: '0 4px 16px rgba(0,0,0,0.4)',
  modal: '0 8px 32px rgba(0,0,0,0.5)',
  tooltip: '0 2px 8px rgba(0,0,0,0.4)',
} as const;

// ─── Toolbar (LeftToolbar / ChartToolbar) ────────────────────────────────────

export const toolbar = {
  buttonBg: 'transparent',
  buttonBgHover: 'rgba(255,255,255,0.08)',
  buttonBgActive: `${color.purpleDark}20`,
  buttonIcon: color.muted,
  buttonIconActive: color.purple,
  buttonIconHover: color.white,
  divider: 'rgba(255,255,255,0.06)',
  height: '40px',
} as const;

// ─── Range bar (chart time-range preset strip) ───────────────────────────────

export const rangeBar = {
  height: 28, // matches TVP-style time-axis row height (originally sampled from a since-removed markup reference)
  background: 'rgba(0,0,0,0.15)',
} as const;

// ─── Focus ring (keyboard-only) ──────────────────────────────────────────────

export const focusRing = {
  width: '2px',
  offset: '3px',
  color: color.purpleDark,
  radius: 'inherit',
} as const;

// ─── Size scale ──────────────────────────────────────────────────────────────

export const size = {
  xs: 2, // 28px — toolbar icon buttons, badge counts
  sm: 3, // 34px — small panel controls
  md: 4, // 40px — default button height
  lg: 5, // 48px — primary CTAs
  xl: 6, // 56px — large inputs
  xxl: 7, // 80px — hero elements
} as const;

// ─── Z-index layers ──────────────────────────────────────────────────────────

export const zIndex = {
  dropdown: 50,
  tooltip: 100,
  modal: 200,
  toast: 300,
  drawingOverlay: 400,
} as const;

// ─── Interaction tolerances (drawing tools / hit testing) ────────────────────

export const interaction = {
  tolerance: { series: 4, anchor: 6, curve: 4 },
  anchorRadius: { regular: 6, touch: 13 },
  anchorStroke: { regular: 1, touch: 3, selected: 3, touchSelected: 0 },
  anchorFill: '#1a1a2e', // non-hovered anchor centre fill
} as const;

// ─── Border radii ────────────────────────────────────────────────────────────

export const radius = {
  button: '25px', // primary CTA / pill buttons
} as const;
