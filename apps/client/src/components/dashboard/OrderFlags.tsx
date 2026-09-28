/**
 * USDT Perpetual order flags under the amount (APP_LOG Bybit Parity BP-5 B): Reduce-only, and
 * Close-on-trigger for a stop order. Either one means the order only shrinks the open position,
 * so the order form hides its TP / SL.
 */

import { Info } from 'lucide-react';
import { color, fontSize } from '@/lib/tokens';
import styles from './OrderFlags.module.css';

const REDUCE_ONLY_HELP =
  'Reduce-only: the order can only shrink your open position — never open or flip one. It is ' +
  'capped at the position size and holds no margin.';
const CLOSE_ON_TRIGGER_HELP =
  'Close on trigger: when the stop triggers, it closes (part of) your position — a reduce-only ' +
  'order that never opens a new one.';

interface OrderFlagsProps {
  reduceOnly: boolean;
  closeOnTrigger: boolean;
  /** Close-on-trigger is offered for stop orders only */
  showCloseOnTrigger: boolean;
  onReduceOnly: (v: boolean) => void;
  onCloseOnTrigger: (v: boolean) => void;
}

export function OrderFlags({
  reduceOnly,
  closeOnTrigger,
  showCloseOnTrigger,
  onReduceOnly,
  onCloseOnTrigger,
}: OrderFlagsProps) {
  return (
    <div className={styles.flags} style={{ fontSize: fontSize.xs10, color: color.muted }}>
      <FlagBox
        label="Reduce-only"
        help={REDUCE_ONLY_HELP}
        checked={reduceOnly}
        onChange={onReduceOnly}
      />
      {showCloseOnTrigger && (
        <FlagBox
          label="Close on trigger"
          help={CLOSE_ON_TRIGGER_HELP}
          checked={closeOnTrigger}
          onChange={onCloseOnTrigger}
        />
      )}
    </div>
  );
}

interface FlagBoxProps {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function FlagBox({ label, help, checked, onChange }: FlagBoxProps) {
  return (
    <span className={styles.flag}>
      <label className={styles.flag}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span style={{ color: checked ? color.white : color.muted }}>{label}</span>
      </label>
      <span className={styles.info} title={help} aria-label={help} role="img">
        <Info className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}
