import { color, fontSize } from '@/lib/tokens';
import styles from './MmrBar.module.css';

/** Fixed segment ids (stable keys for a fixed-length meter) */
const SEGMENTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

/** Colour of a maintenance-margin rate: safe, getting close, about to be liquidated. */
function mmrColor(rate: number): string {
  if (rate >= 0.8) return color.red;
  if (rate >= 0.5) return color.amber;
  return color.green;
}

/**
 * Bybit-style maintenance-margin-rate meter for one position (BP-3): fills toward 100%, where the
 * position is liquidated.
 */
export function MmrBar({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.max(0, rate * 100));
  const filled = Math.min(SEGMENTS.length, Math.ceil((pct / 100) * SEGMENTS.length));
  const tone = mmrColor(rate);
  return (
    <span
      className={styles.meter}
      data-testid="position-mmr"
      aria-label={`Maintenance margin rate ${pct.toFixed(0)}%`}
    >
      <span className={styles.segments} aria-hidden>
        {SEGMENTS.map((id, i) => (
          <span
            key={id}
            className={styles.segment}
            style={{ background: i < filled ? tone : `${color.muted}25` }}
          />
        ))}
      </span>
      <span className={styles.value} style={{ fontSize: fontSize.xs10, color: tone }}>
        {pct.toFixed(pct < 10 ? 1 : 0)}%
      </span>
    </span>
  );
}
