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
  page: '#0f0e29', // deepest base — page / chart canvas background  (sampled from footer.png)
  panel: '#211e49', // panel / header background  (sampled from header.png)
  footer: '#1e1d34', // footer body background  (sampled from footer.png)
  surface: '#3e3c73', // input / card / elevated surface  (sampled from header.png)
} as const;

// ─── Brand / UI colors ───────────────────────────────────────────────────────

export const color = {
  green: '#2ccd78', // profit / buy / positive / live  (alt bright: #03e673, alt dark: #28a06b/#29a56c)
  red: '#d5455c', // loss / sell / negative / destructive  (alt dark: #c0414d, alt vivid: #ed0127)
  purple: '#a555e2', // primary accent — vibrant  (sampled from header.png)
  purpleDark: '#695bec', // primary accent — dark/muted, hover states, borders  (sampled from header.png)
  purpleDeep: '#4e3287', // deepest purple — overlays, borders, badge backgrounds  (sampled from header.png)
  amber: '#e7ab33', // warning / margin alert (golden-amber)
  muted: '#cac5d4', // secondary / muted text  (sampled from header.png)
} as const;

// ─── Chart indicator colors ───────────────────────────────────────────────────
// lightweight-charts renders to Canvas — it cannot read CSS variables.
// All chart colors MUST be plain hex strings defined here.

export const chart = {
  // EMA overlay lines
  ema9: '#94a3b8', // slate-400 — fast MA
  ema20: '#3b82f6', // blue — medium MA
  ema200: '#9c27b0', // purple — trend filter (source: chart.html markup-reference rgb(156,39,176))

  // VWAP overlay line
  vwap: '#f97316', // orange

  // MACD pane
  macdLine: '#2962ff', // deep blue
  macdSignal: '#ff6d00', // deep orange
  macdHistBull: '#20c8b3', // teal  — rising  positive histogram bar
  macdHistBear: '#d5455c', // red   — falling negative histogram bar

  // Candlestick series
  candleUp: '#2ccd78', // bullish / green candle
  candleDown: '#d5455c', // bearish / red   candle

  // Canvas background — must match bg.page exactly
  bg: '#0f0e29',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const font = {
  sans: "'Geist Variable', ui-sans-serif, sans-serif",
  mono: "ui-monospace, 'Geist Mono', monospace",
} as const;

export const fontSize = {
  xxs: '11px',  // badge counts, tiny labels          (14px × 0.75 ≈ 11px)
  xs10: '11px', // chart legend, table headers         (15px × 0.75 ≈ 11px)
  xs11: '13px', // standard panel / table body text    (17px × 0.75 ≈ 13px)
  xs: '14px',   // Tailwind text-xs equivalent          (18px × 0.75 ≈ 14px)
  sm: '16px',   // Tailwind text-sm equivalent          (21px × 0.75 ≈ 16px)
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

// ─── Border radii ────────────────────────────────────────────────────────────

export const radius = {
  button: '25px', // primary CTA / pill buttons
} as const;
