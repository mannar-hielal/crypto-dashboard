import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChartLine, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { motion } from 'framer-motion';
import { INDICATOR_CATALOG } from '@/lib/indicators/catalog';
import type { IndicatorCategory } from '@/lib/indicators/types';
import { bg, color, fontSize } from '@/lib/tokens';

interface IndicatorDropdownProps {
  existingIds: string[];
  onAdd: (indicatorId: string) => void;
}

export function IndicatorDropdown({ existingIds, onAdd }: IndicatorDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const handleToggle = useCallback(() => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.left - 60) });
      }
    }
    setOpen((p) => !p);
  }, [open]);

  const grouped = INDICATOR_CATALOG.reduce(
    (acc, m) => {
      acc[m.category].push(m);
      return acc;
    },
    { overlay: [], 'sub-pane': [] } as Record<IndicatorCategory, typeof INDICATOR_CATALOG>
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold transition-colors hover:text-white"
        style={{
          fontSize: fontSize.xs11,
          color: open ? color.purple : color.muted,
          background: open ? bg.surface : 'transparent',
        }}
      >
        <ChartLine className="h-3.5 w-3.5" />
        Indicators
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="fixed z-50 w-56 overflow-hidden rounded-xl border border-white/8 shadow-2xl"
              style={{ background: bg.panel, top: menuPos.top, left: menuPos.left }}
            >
              <div
                className="border-b border-white/6 px-3 py-2"
                style={{ fontSize: fontSize.xs10, color: color.muted }}
              >
                Indicators
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {(Object.keys(grouped) as IndicatorCategory[]).map((cat) => (
                  <div key={cat}>
                    <div
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: color.muted }}
                    >
                      {cat === 'overlay' ? 'Overlays' : 'Sub-panes'}
                    </div>
                    {grouped[cat].map((meta) => {
                      // Indicators are independent instances (each with its own
                      // instanceId + params), not per-pane singletons — the
                      // default pane setup itself adds three separate EMA
                      // instances (length 9/20/200). So re-clicking an
                      // indicator that's already added must add ANOTHER
                      // instance, not no-op. `instanceCount` is shown as a
                      // badge purely so it's still visible how many of this
                      // indicator type are already on the chart.
                      const instanceCount = existingIds.filter((id) => id === meta.id).length;
                      return (
                        <button
                          key={meta.id}
                          onClick={() => {
                            onAdd(meta.id);
                            setOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5"
                        >
                          <div
                            className="flex h-6 w-6 items-center justify-center rounded"
                            style={{ background: `${meta.defaultColor}20` }}
                          >
                            {cat === 'sub-pane' ? (
                              <ChartNoAxesColumnIncreasing
                                className="h-3.5 w-3.5"
                                style={{ color: meta.defaultColor }}
                              />
                            ) : (
                              <ChartLine
                                className="h-3.5 w-3.5"
                                style={{ color: meta.defaultColor }}
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-white">{meta.label}</div>
                            <div style={{ fontSize: fontSize.xs10, color: color.muted }}>
                              {meta.description}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {instanceCount > 0 && (
                              <span
                                className="rounded-full px-1.5 py-0.5 font-semibold"
                                style={{
                                  fontSize: fontSize.xs10,
                                  background: `${meta.defaultColor}20`,
                                  color: meta.defaultColor,
                                }}
                              >
                                ×{instanceCount}
                              </span>
                            )}
                            <Plus className="h-3.5 w-3.5" style={{ color: color.purple }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          </>,
          document.body
        )}
    </>
  );
}
