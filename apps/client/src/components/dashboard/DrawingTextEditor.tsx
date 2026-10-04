import { useState } from 'react';
import { MAX_DRAWING_TEXT } from '@/lib/drawingActions';
import styles from './DrawingTextEditor.module.css';

// ─── Drawing text editor ─────────────────────────────────────────────────────
// The editor of a text drawing (Text, Note, Callout, …), over the chart. Moved out of ChartPanel
// with its look kept (CSS Module, tokens). Only Save and Ctrl/Cmd+Enter keep the text; Cancel, Escape and a press
// outside discard it — losing the focus does neither.

interface DrawingTextEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

export function DrawingTextEditor({ initialText, onSave, onClose }: DrawingTextEditorProps) {
  const [text, setText] = useState(initialText);
  const save = () => {
    onSave(text);
    onClose();
  };
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          className={styles.text}
          aria-label="Drawing text"
          maxLength={MAX_DRAWING_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.stopPropagation();
              save();
            }
          }}
          rows={3}
        />
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.save} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
