import { bg, color, fontSize } from '@/lib/tokens';
import { fmtMktPrice } from '@/lib/utils';
import type { PendingAmend } from '@/hooks/useTradeLines';
import styles from './TradeLineAmend.module.css';

/** Half the popover's height plus a margin, in px */
const POPOVER_MIN_TOP = 48;

interface TradeLineAmendProps {
  amend: PendingAmend;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation after a TP / SL / order line was dragged on the chart (BP-3). */
export function TradeLineAmend({ amend, onConfirm, onCancel }: TradeLineAmendProps) {
  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label={`Move ${amend.label}`}
      style={{
        // Kept inside the chart when the line is at its top edge (the popover is centred on it)
        top: Math.max(amend.y, POPOVER_MIN_TOP),
        background: bg.modal,
        borderColor: `${color.purple}66`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p style={{ fontSize: fontSize.xs11, color: color.white }}>
        Move {amend.label} to ${fmtMktPrice(amend.price)}?
      </p>
      {amend.error && (
        <p role="alert" style={{ fontSize: fontSize.xs10, color: color.red }}>
          {amend.error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          style={{ fontSize: fontSize.xs10, color: color.muted, background: bg.surface }}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.button}
          style={{ fontSize: fontSize.xs10, color: color.white, background: color.purpleDark }}
          disabled={amend.busy}
          onClick={onConfirm}
        >
          {amend.busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
