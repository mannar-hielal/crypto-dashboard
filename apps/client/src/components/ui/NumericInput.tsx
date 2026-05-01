/**
 * NumericInput
 *
 * Shared suffixed number input used in TradingPanel, PendingOrderEditPanel,
 * and PositionEditPanel.  Renders a `type="number"` field with a right-aligned
 * currency/token suffix chip inside the input.
 *
 * Numbers are left-aligned by default (browser default for type=number).
 *
 *  Usage:
 *    <NumericInput suffix="USDT" value={price} onChange={setPrice} step={0.01} />
 *    <NumericInput suffix="TP"   suffixColor={`${color.green}b3`} borderColor={`${color.green}60`} ... />
 */

import type { ChangeEvent } from 'react';
import { bg, color, fontSize } from '@/lib/tokens';

interface NumericInputProps {
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Text shown in the right suffix chip, e.g. "USDT", "USD", "BTC", "TP", "SL" */
  suffix: string;
  /** Colour of the suffix text. Defaults to color.muted. */
  suffixColor?: string;
  /** Border colour override. Defaults to rgba(255,255,255,0.08). */
  borderColor?: string;
  step?: string | number;
  min?: string | number;
  max?: string | number;
  placeholder?: string;
  disabled?: boolean;
  /** Extra right padding for longer suffixes (pr-14 = 56px).  Defaults to 'pr-14'. */
  suffixPadding?: 'pr-12' | 'pr-14' | 'pr-16';
  id?: string;
  name?: string;
  ariaLabel?: string;
  testId?: string;
}

export function NumericInput({
  value,
  onChange,
  suffix,
  suffixColor,
  borderColor,
  step,
  min,
  max,
  placeholder = '0.00',
  disabled,
  suffixPadding = 'pr-14',
  id,
  name,
  ariaLabel,
  testId,
}: NumericInputProps) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        data-testid={testId}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-md border border-white/8 px-2.5 py-1.5 ${suffixPadding} text-xs text-white transition-colors focus:outline-none focus:border-brand-purple-dark/50 disabled:opacity-40`}
        style={{
          background: bg.surface,
          fontSize: fontSize.xs,
          borderColor: borderColor ?? undefined,
        }}
      />
      <span
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
        style={{ fontSize: fontSize.xs10, color: suffixColor ?? color.muted }}
      >
        {suffix}
      </span>
    </div>
  );
}
