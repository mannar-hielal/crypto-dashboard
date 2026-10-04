/**
 * TradingView's in-place table cell editor: a text field over the clicked cell of a selected Table
 * (the library's `tableEdit`). Enter or a click away saves, Shift+Enter adds a line, Esc cancels.
 */

import { useEffect, useRef } from 'react';
import styles from './DrawingCellEditor.module.css';

/** 🔐 Bounded: the table is saved to localStorage with every edit */
const MAX_CELL_TEXT = 500;

interface DrawingCellEditorProps {
  /** The cell's box in the pane (px) */
  box: { left: number; top: number; width: number; height: number };
  initialText: string;
  fontSize: number;
  onSave: (text: string) => void;
  onClose: () => void;
}

export function DrawingCellEditor({
  box,
  initialText,
  fontSize,
  onSave,
  onClose,
}: DrawingCellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    el?.focus();
    el?.select();
  }, []);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save) onSave(ref.current?.value ?? '');
    onClose();
  }

  return (
    <textarea
      ref={ref}
      aria-label="Table cell"
      className={styles.cell}
      maxLength={MAX_CELL_TEXT}
      defaultValue={initialText}
      style={{
        left: box.left,
        top: box.top,
        width: Math.max(box.width, 60),
        minHeight: box.height,
        fontSize,
      }}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        }
      }}
    />
  );
}
