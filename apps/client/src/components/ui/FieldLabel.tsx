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

import type { ReactNode } from 'react';
import { color, fontSize } from '@/lib/tokens';

type FieldLabelProps =
  | {
      children: ReactNode;
      className?: string;
      as?: 'span' | 'p';
      htmlFor?: never;
    }
  | {
      children: ReactNode;
      className?: string;
      as: 'label';
      htmlFor?: string;
    };

export function FieldLabel({ children, className = '', as = 'span', htmlFor }: FieldLabelProps) {
  const commonProps = {
    className: `font-semibold uppercase tracking-wider ${className}`,
    style: { fontSize: fontSize.xs10, color: color.muted },
  };

  if (as === 'label') {
    return (
      <label htmlFor={htmlFor} {...commonProps}>
        {children}
      </label>
    );
  }

  if (as === 'p') {
    return <p {...commonProps}>{children}</p>;
  }

  return <span {...commonProps}>{children}</span>;
}
