/**
 * TradingView's colour picker for a drawing: the palette, a custom colour, and (for a fill) an
 * opacity slider. Opens under the button that asked for it; Esc or a click outside closes it.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { drawingPalette } from '@/lib/tokens';
import styles from './DrawingColorPopover.module.css';

interface DrawingColorPopoverProps {
  label: string;
  value: string;
  /** Opacity in percent (0–100); the slider shows only when set */
  opacity?: number;
  position: { left: number; top: number };
  onChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  onClose: () => void;
}

/** "#2962ff" — the 6-digit form a colour input takes; anything else reads as black */
function asHex6(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
}

export function DrawingColorPopover({
  label,
  value,
  opacity,
  position,
  onChange,
  onOpacityChange,
  onClose,
}: DrawingColorPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={styles.popover}
      style={{ left: position.left, top: position.top }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div role="radiogroup" aria-label={label} className={styles.grid}>
        {drawingPalette.flat().map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c.toLowerCase() === value.toLowerCase()}
            aria-label={c}
            className={styles.swatch}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <label className={styles.custom}>
        <input
          type="color"
          value={asHex6(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}: custom colour`}
        />
        <span>Custom…</span>
      </label>
      {opacity !== undefined && onOpacityChange && (
        <label className={styles.opacity}>
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
          />
          <output>{opacity}%</output>
        </label>
      )}
    </div>,
    document.body
  );
}
