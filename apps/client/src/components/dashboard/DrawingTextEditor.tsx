import { useState } from 'react';

// ─── Drawing text editor ─────────────────────────────────────────────────────
// The editor of a text drawing (Text, Note, Callout, …), over the chart. Moved out of ChartPanel
// unchanged in look. Only Save and Ctrl/Cmd+Enter keep the text; Cancel, Escape and a press
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
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="rounded-lg border border-white/10 bg-gray-900 p-3 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <textarea
          autoFocus
          className="w-64 rounded border border-white/10 bg-gray-800 p-2 text-sm text-white outline-none"
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
        <div className="mt-2 flex justify-end gap-2">
          <button
            className="rounded px-2 py-1 text-xs text-white/60 hover:text-white"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-500"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
