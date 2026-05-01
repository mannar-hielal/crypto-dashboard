/**
 * FieldLabel
 *
 * The compact uppercase section / field label used throughout the trading UI
 * (TradingPanel, PendingOrderEditPanel, PositionEditPanel).
 *
 * Usage:
 *   <FieldLabel>Price</FieldLabel>
 *   <FieldLabel as="p">Order info</FieldLabel>
 */

import { color, fontSize } from '@/lib/tokens';

interface FieldLabelProps {
  children: React.ReactNode;
  /** Optional extra class names. */
  className?: string;
  /** Render tag. Defaults to 'span'. */
  as?: 'span' | 'label' | 'p';
  htmlFor?: string;
}

export function FieldLabel({
  children,
  className = '',
  as: Tag = 'span',
  htmlFor,
}: FieldLabelProps) {
  return (
    <Tag
      htmlFor={Tag === 'label' ? htmlFor : undefined}
      className={`font-semibold uppercase tracking-wider ${className}`}
      style={{ fontSize: fontSize.xs10, color: color.muted }}
    >
      {children}
    </Tag>
  );
}
