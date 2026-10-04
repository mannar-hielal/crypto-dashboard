/**
 * The settings dialog's fields: a colour button opening the picker, and a number typed as text.
 */

import { useState } from 'react';
import { parseDecimal } from '@/lib/drawingActions';
import { DrawingColorPopover } from './DrawingColorPopover';
import styles from './DrawingSettingsDialog.module.css';

// ─── A colour button opening the picker ─────────────────────────────────────

interface ColorFieldProps {
  label: string;
  value: string;
  opacity?: number;
  onChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
}

export function ColorField({ label, value, opacity, onChange, onOpacityChange }: ColorFieldProps) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.swatch}
        style={{ background: value }}
        aria-label={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { left: r.left, top: r.bottom + 6 });
        }}
      />
      {at && (
        <DrawingColorPopover
          label={label}
          value={value}
          opacity={opacity}
          position={at}
          onChange={onChange}
          onOpacityChange={onOpacityChange}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

// ─── A number typed as text (locale commas allowed) ─────────────────────────

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Beyond being a number (e.g. above zero); a value failing it is flagged and not applied */
  valid?: (value: number) => boolean;
}

/**
 * Applies each valid value as it is typed. Follows `value` when another field changes it (a stop's
 * ticks and its price), except while it has the focus.
 */
export function NumberField({ label, value, onChange, valid = () => true }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  const [focused, setFocused] = useState(false);
  // Adjusted while rendering when the value changes from outside (React's pattern; no effect)
  if (!focused && value !== shown) {
    setShown(value);
    setText(String(value));
  }
  const n = parseDecimal(text);
  const ok = n !== null && valid(n);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!ok}
      maxLength={32}
      className={`${styles.input}${ok ? '' : ` ${styles.invalid}`}`}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const next = parseDecimal(e.target.value);
        if (next !== null && valid(next)) {
          setShown(next);
          onChange(next);
        }
      }}
    />
  );
}
