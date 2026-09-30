/**
 * Toggle
 *
 * Shared pill-style toggle switch used in TradingPanel, PositionEditPanel,
 * and PendingOrderEditPanel. Replaces the three identical local copies.
 */

import { color } from '@/lib/tokens';
import { guide, type GuideAnchor } from '@/lib/guideAnchors';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Optional accessible label (aria-label). */
  label?: string;
  /** Guide anchor for the switch (lib/guideAnchors.ts) */
  anchor?: GuideAnchor;
}

export function Toggle({ checked, onChange, label, anchor }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      {...(anchor ? guide(anchor) : {})}
      onClick={() => onChange(!checked)}
      className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? color.green : `${color.muted}40` }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
        style={{
          right: '2px',
          transform: checked ? 'translateX(-12px)' : 'translateX(0px)',
        }}
      />
    </button>
  );
}
