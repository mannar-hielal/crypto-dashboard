/**
 * A small confirm dialog for the drawing tools (Remove drawings). `alertdialog`, focus on Cancel
 * (the safe choice) when it opens, Esc or a click on the backdrop cancels, Tab stays inside.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './DrawingConfirmDialog.module.css';

interface DrawingConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DrawingConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: DrawingConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      // Two buttons: Tab and Shift+Tab move between them
      e.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="drawing-confirm-title"
        aria-describedby="drawing-confirm-message"
        className={styles.dialog}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="drawing-confirm-title" className={styles.title}>
          {title}
        </h2>
        <p id="drawing-confirm-message" className={styles.message}>
          {message}
        </p>
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
