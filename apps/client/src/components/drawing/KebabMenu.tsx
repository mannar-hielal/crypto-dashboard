// ─── KebabMenu — drawing actions (clone, copy, delete, reorder) ──

import { useState, useRef, useEffect, Fragment } from 'react';
import { bg, color, fontSize } from '@/lib/tokens';

interface KebabMenuProps {
  onClone: () => void;
  onRemove: () => void;
  onReorder: (dir: 'front' | 'forward' | 'back' | 'backward') => void;
  onClose: () => void;
}

const REORDER_ITEMS: { label: string; dir: 'front' | 'back' | 'forward' | 'backward' }[] = [
  { label: 'Bring to front', dir: 'front' },
  { label: 'Send to back', dir: 'back' },
  { label: 'Bring forward', dir: 'forward' },
  { label: 'Send backward', dir: 'backward' },
];

export function KebabMenu({ onClone, onRemove, onReorder, onClose }: KebabMenuProps) {
  const [showVisualOrder, setShowVisualOrder] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const btnClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/8';

  return (
    <div
      ref={menuRef}
      className="w-44 rounded-md border border-white/8 py-1 shadow-xl"
      style={{
        background: bg.panel,
        fontSize: fontSize.xs11,
        color: color.muted,
      }}
    >
      <button
        className={btnClass}
        onClick={() => {
          onClone();
          onClose();
        }}
      >
        Clone
      </button>

      <div className="mx-2 my-1 h-px rounded-full bg-white/8" />

      {/* ── Visual Order submenu ──────────────────────────────── */}
      <div className="relative">
        <button className={btnClass} onClick={() => setShowVisualOrder((v) => !v)}>
          <span className="flex-1">Visual Order</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {showVisualOrder && (
          <div
            className="absolute left-full top-0 z-[101] w-44 overflow-hidden rounded-md border border-white/8 py-1 shadow-xl"
            style={{ background: bg.panel }}
          >
            <table className="w-full">
              <tbody>
                {REORDER_ITEMS.map((item, i) => (
                  <Fragment key={item.dir}>
                    <tr
                      data-role="menuitem"
                      tabIndex={-1}
                      className="cursor-pointer transition-colors hover:bg-white/8"
                      onClick={() => {
                        onReorder(item.dir);
                        onClose();
                      }}
                    >
                      <td className="w-8" />
                      <td>
                        <span className="block whitespace-nowrap px-1 py-1 text-xs font-medium">
                          {item.label}
                        </span>
                      </td>
                    </tr>
                    {i < REORDER_ITEMS.length - 1 && (
                      <tr className="h-2">
                        <td />
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mx-2 my-1 h-px rounded-full bg-white/8" />

      <button
        className={btnClass}
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Delete
      </button>
    </div>
  );
}
