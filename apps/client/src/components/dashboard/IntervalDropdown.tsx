import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { INTERVALS, INTERVAL_LABELS, type Interval } from '@/lib/markets';
import { color, fontSize, bg } from '@/lib/tokens';
import styles from './IntervalDropdown.module.css';

interface IntervalDropdownProps {
  value: Interval;
  onChange: (interval: Interval) => void;
  compact?: boolean;
}

export function IntervalDropdown({ value, onChange, compact }: IntervalDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const handleToggle = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPos({
          top: rect.bottom + 4,
          left: Math.max(8, rect.left - 28),
        });
      }
    }
    setOpen((p) => !p);
  };

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={styles.trigger}
        style={{
          fontSize: compact ? fontSize.xs10 : fontSize.xs11,
          color: color.muted,
          background: open ? bg.surface : 'transparent',
        }}
      >
        <span>{value}</span>
        <ChevronDown className={styles.arrow} size={compact ? 10 : 12} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              className={styles.menu}
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {INTERVALS.map((tf) => (
                <button
                  key={tf}
                  className={styles.item}
                  style={{
                    color: tf === value ? color.purple : color.muted,
                    fontSize: compact ? fontSize.xs10 : fontSize.xs11,
                  }}
                  onClick={() => {
                    onChange(tf);
                    setOpen(false);
                  }}
                  title={INTERVAL_LABELS[tf]}
                >
                  {tf}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
