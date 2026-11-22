import styles from './CandleSequence.module.css';

// ─── Shapes (a story, not data) ──────────────────────────────────────────────
// A stylised climb with pullbacks, drawn once at module load: 24 candles and a 4-candle average
// line. Nothing here is a price or a prediction; the picture only says "this is what a chart is".

const CLOSES = [
  30, 34, 32, 38, 36, 42, 40, 37, 43, 47, 45, 50, 48, 53, 51, 49, 55, 58, 56, 61, 59, 64, 62, 67,
] as const;
const STEP = 26;
const BODY = 14;
const HEIGHT = 200;

const toY = (price: number) => HEIGHT - 10 - (price - 25) * 3.8;

interface Candle {
  x: number;
  up: boolean;
  wickTop: number;
  wickBottom: number;
  bodyTop: number;
  bodyHeight: number;
}

const CANDLES: Candle[] = CLOSES.map((close, i) => {
  const open = i === 0 ? close - 3 : (CLOSES[i - 1] as number);
  const high = Math.max(open, close) + 2 + ((i * 7) % 4);
  const low = Math.min(open, close) - 2 - ((i * 3) % 4);
  const bodyTop = toY(Math.max(open, close));
  return {
    x: 18 + i * STEP,
    up: close >= open,
    wickTop: toY(high),
    wickBottom: toY(low),
    bodyTop,
    bodyHeight: Math.max(3, toY(Math.min(open, close)) - bodyTop),
  };
});

const AVERAGE = CLOSES.map((_, i) => {
  if (i < 3) return null;
  const mean = (CLOSES[i] + CLOSES[i - 1] + CLOSES[i - 2] + CLOSES[i - 3]) / 4;
  return `${i === 3 ? 'M' : 'L'}${18 + i * STEP} ${toY(mean)}`;
})
  .filter((p): p is string => p !== null)
  .join(' ');

const WIDTH = 18 + (CLOSES.length - 1) * STEP + 18;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * An animated row of candles that draws itself once, then lets the last one breathe, like a live
 * chart. Plain SVG and CSS: no library, no timers, no JavaScript per frame. With
 * `prefers-reduced-motion` it is simply drawn, still. Decorative: hidden from screen readers.
 */
export function CandleSequence() {
  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-testid="candle-sequence"
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className={styles.grid} x1={0} x2={WIDTH} y1={HEIGHT * f} y2={HEIGHT * f} />
      ))}
      {CANDLES.map((c, i) => (
        <g
          key={c.x}
          className={`${styles.candle} ${c.up ? styles.up : styles.down}${i === CANDLES.length - 1 ? ` ${styles.last}` : ''}`}
        >
          <line className={styles.wick} x1={c.x} x2={c.x} y1={c.wickTop} y2={c.wickBottom} />
          <rect
            className={styles.body}
            x={c.x - BODY / 2}
            y={c.bodyTop}
            width={BODY}
            height={c.bodyHeight}
            rx={2}
          />
        </g>
      ))}
      <path className={styles.average} d={AVERAGE} pathLength={1} />
    </svg>
  );
}
