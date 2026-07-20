// ─── BinToolMenu — right-click submenu for the bin toolbar tool ──────

import { useRef, useEffect } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { bg, color, fontSize } from '@/lib/tokens';

interface BinToolMenuProps {
  position: { left: number; top: number };
  onClose: () => void;
}

export function BinToolMenu({ position, onClose }: BinToolMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const alwaysRemoveLocked = useDrawingStore((s) => s.alwaysRemoveLocked);
  const setAlwaysRemoveLocked = useDrawingStore((s) => s.setAlwaysRemoveLocked);
  const drawings = useDrawingStore((s) => s.drawings);
  const removeAll = useDrawingStore((s) => s.removeAll);

  const drawingCount = drawings.length;
  const lockedCount = drawings.filter((d) => d.isLocked).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-white/8 py-1 shadow-xl"
      style={{
        left: position.left,
        top: position.top,
        background: bg.panel,
        fontSize: fontSize.xs11,
        color: color.muted,
      }}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/8"
        onClick={() => {
          removeAll();
          onClose();
        }}
      >
        Remove {drawingCount} drawing{drawingCount !== 1 ? 's' : ''}
      </button>

      <div className="mx-2 my-1 h-px rounded-full" style={{ background: `${color.white}08` }} />

      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/8"
        onClick={() => setAlwaysRemoveLocked(!alwaysRemoveLocked)}
      >
        <span className="flex-1">Always remove locked</span>
        {alwaysRemoveLocked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      {lockedCount > 0 && (
        <p className="px-3 py-1 text-[10px] opacity-50">
          {lockedCount} locked drawing{lockedCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
