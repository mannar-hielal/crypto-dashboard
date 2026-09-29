import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CandlestickChart, ChevronDown } from 'lucide-react';
import { CHART_TYPES, useLayoutStore, type ChartType } from '@/store/layoutStore';
import { color, fontSize, bg } from '@/lib/tokens';
// Same trigger/menu styling as the interval dropdown it sits next to.
import { guide } from '@/lib/guideAnchors';
import styles from './IntervalDropdown.module.css';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candles: 'Candles',
  heikinAshi: 'Heikin Ashi',
};

interface ChartTypeDropdownProps {
  value: ChartType;
  onChange: (chartType: ChartType) => void;
}

/**
 * Candle-type switch (Candles / Heikin Ashi) for the active pane, plus — on USDT Perpetual — the
 * mark-price line toggle (BP-3).
 */
export function ChartTypeDropdown({ value, onChange }: ChartTypeDropdownProps) {
  const [open, setOpen] = useState(false);
  const isPerp = useLayoutStore((s) => (s.panes[s.activePane] ?? s.panes[0]).category === 'linear');
  const showMark = useLayoutStore((s) => s.showMarkPriceLine);
  const toggleMark = useLayoutStore((s) => s.toggleMarkPriceLine);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const handleToggle = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.left - 28) });
    }
    setOpen((p) => !p);
  };

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
        type="button"
        {...guide('chart.type-menu')}
        onClick={handleToggle}
        className={styles.trigger}
        aria-label={`Chart type: ${CHART_TYPE_LABELS[value]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Chart type: ${CHART_TYPE_LABELS[value]}`}
        style={{
          fontSize: fontSize.xs11,
          color: value === 'heikinAshi' ? color.purple : color.muted,
          background: open ? bg.surface : 'transparent',
        }}
      >
        <CandlestickChart size={14} />
        <ChevronDown className={styles.arrow} size={12} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              role="menu"
              className={styles.menu}
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {CHART_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitemradio"
                  aria-checked={type === value}
                  className={styles.item}
                  style={{
                    color: type === value ? color.purple : color.muted,
                    fontSize: fontSize.xs11,
                    justifyContent: 'flex-start',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => {
                    onChange(type);
                    setOpen(false);
                  }}
                >
                  {CHART_TYPE_LABELS[type]}
                </button>
              ))}
              {isPerp && (
                <>
                  <div role="separator" className={styles.separator} />
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showMark}
                    {...guide('chart.mark-line')}
                    className={styles.item}
                    style={{
                      color: showMark ? color.purple : color.muted,
                      fontSize: fontSize.xs11,
                      justifyContent: 'flex-start',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={toggleMark}
                  >
                    {showMark ? '✓ ' : ''}Mark price line
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
