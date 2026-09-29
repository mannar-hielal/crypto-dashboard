import { useState } from 'react';
import { X } from 'lucide-react';
import { usePaperStore, type ClosedTrade } from '@/store/paperStore';
import { LIQUIDATION_EXPLAINER } from '@/lib/positionMath';
import { bg, color, fontSize } from '@/lib/tokens';
import { fmtMktPrice } from '@/lib/utils';
import { guide } from '@/lib/guideAnchors';
import styles from './LiquidationNotices.module.css';

/** Set once the user dismisses the "liquidation is live" banner (BP-3 deploy notice). */
const INTRO_DISMISSED_KEY = 'cd-bp3-liquidation-intro-dismissed';
/** closedAt of the newest liquidation the user has acknowledged. */
const LIQ_SEEN_KEY = 'cd-liquidation-seen-at';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the notice just shows again next time
  }
}

/** The newest liquidation (Bybit BustTrade) the user hasn't acknowledged, if any. */
function unseenLiquidation(trades: ClosedTrade[], seenAt: number): ClosedTrade | null {
  let latest: ClosedTrade | null = null;
  for (const t of trades) {
    if (t.liquidated && t.closedAt > seenAt && (!latest || t.closedAt > latest.closedAt)) {
      latest = t;
    }
  }
  return latest;
}

/**
 * USDT Perpetual notices above the order form (APP_LOG Bybit Parity BP-3):
 * - a one-time banner that positions can now be liquidated, as on Bybit, with the explainer;
 * - a dismissible notice when a position was liquidated (found in the trade history, so it also
 *   shows when the liquidation happened while the user was away).
 */
export function LiquidationNotices() {
  const trades = usePaperStore((s) => s.history);
  const [introDismissed, setIntroDismissed] = useState(() => !!readStorage(INTRO_DISMISSED_KEY));
  const [seenAt, setSeenAt] = useState(() => Number(readStorage(LIQ_SEEN_KEY) ?? '0') || 0);
  const [showHow, setShowHow] = useState(false);
  const liquidated = unseenLiquidation(trades, seenAt);

  return (
    <>
      {liquidated && (
        <div
          className={styles.notice}
          role="alert"
          style={{ background: bg.banner, borderColor: `${color.red}66` }}
          {...guide('notice.liquidation')}
        >
          <div className={styles.row}>
            <p style={{ fontSize: fontSize.xs10, color: color.white }}>
              <strong style={{ color: color.red }}>
                {liquidated.symbol} {liquidated.side === 'long' ? 'Long' : 'Short'} was liquidated
              </strong>{' '}
              at ${fmtMktPrice(liquidated.exitPrice)} (bankruptcy price). Position margin lost: $
              {Math.abs(liquidated.pnl).toFixed(2)}.
            </p>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss liquidation notice"
              style={{ color: color.muted }}
              {...guide('notice.dismiss', 'liquidation')}
              onClick={() => {
                writeStorage(LIQ_SEEN_KEY, String(liquidated.closedAt));
                setSeenAt(liquidated.closedAt);
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
      {!introDismissed && (
        <div
          className={styles.notice}
          style={{ background: bg.banner, borderColor: `${color.amber}55` }}
          {...guide('notice.liquidation-intro')}
        >
          <div className={styles.row}>
            <p style={{ fontSize: fontSize.xs10, color: color.white }}>
              <strong style={{ color: color.amber }}>Positions can now be liquidated</strong>, as on
              Bybit: when the mark price reaches a position&apos;s liquidation price, its margin is
              lost.
            </p>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss liquidation notice"
              style={{ color: color.muted }}
              {...guide('notice.dismiss', 'liquidation-intro')}
              onClick={() => {
                writeStorage(INTRO_DISMISSED_KEY, '1');
                setIntroDismissed(true);
              }}
            >
              <X size={12} />
            </button>
          </div>
          <button
            type="button"
            className={styles.link}
            style={{ fontSize: fontSize.xs10, color: color.amber }}
            aria-expanded={showHow}
            onClick={() => setShowHow((v) => !v)}
          >
            {showHow ? 'Hide' : 'How liquidation works'}
          </button>
          {showHow && (
            <p className={styles.details} style={{ fontSize: fontSize.xs10, color: color.muted }}>
              {LIQUIDATION_EXPLAINER}
            </p>
          )}
        </div>
      )}
    </>
  );
}
