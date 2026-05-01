/**
 * WarningText
 *
 * Inline amber warning row with an AlertTriangle icon — used beside
 * TP/SL validation messages in TradingPanel and both edit panels.
 *
 * Usage:
 *   {warning && <WarningText>{warning}</WarningText>}
 */

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { color, fontSize } from '@/lib/tokens';

interface WarningTextProps {
  children: ReactNode;
}

export function WarningText({ children }: WarningTextProps) {
  return (
    <p className="flex items-center gap-1" style={{ fontSize: fontSize.xs10, color: color.amber }}>
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}
