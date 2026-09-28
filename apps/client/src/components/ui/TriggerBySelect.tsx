/**
 * Which price a TP / SL triggers on — Bybit's `triggerBy` (APP_LOG Bybit Parity BP-5 B): Last (the
 * default), Mark or Index. A compact `Last ▾` beside the TP / SL label.
 */

import type { PaperTriggerBy } from '@crypto-dashboard/sdk';
import { color, fontSize } from '@/lib/tokens';
import styles from './TriggerBySelect.module.css';

const OPTIONS: readonly (readonly [PaperTriggerBy, string])[] = [
  ['LastPrice', 'Last'],
  ['MarkPrice', 'Mark'],
  ['IndexPrice', 'Index'],
];

interface TriggerBySelectProps {
  value: PaperTriggerBy;
  onChange: (value: PaperTriggerBy) => void;
  /** e.g. "Take profit trigger price" */
  ariaLabel: string;
}

export function TriggerBySelect({ value, onChange, ariaLabel }: TriggerBySelectProps) {
  return (
    <select
      className={styles.select}
      style={{ fontSize: fontSize.xs10, color: color.muted }}
      aria-label={ariaLabel}
      title="The price that triggers it: last traded, mark or index"
      value={value}
      onChange={(e) => onChange(e.target.value as PaperTriggerBy)}
    >
      {OPTIONS.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
