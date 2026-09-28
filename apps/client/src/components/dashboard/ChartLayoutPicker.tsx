/**
 * ChartLayoutPicker
 *
 * Popover button that lets the user choose between 5 chart layouts.
 * SVG icons match the TVP reference (chart-layout.html).
 * Also surfaces sync-option toggles (symbol / interval / crosshair / time range).
 */

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useLayoutStore } from '@/store/layoutStore';
import type { LayoutId, SyncOptions } from '@/store/layoutStore';
import { bg, color, fontSize } from '@/lib/tokens';
import { guide } from '@/lib/guideAnchors';

// ─── Layout icon SVG paths (from TVP markup reference) ────────────────

const LAYOUT_ICONS: Record<LayoutId, { label: string; path: string }> = {
  '1': {
    label: 'Single chart',
    path: 'M2.5 1C1.67 1 1 1.67 1 2.5v12c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5h-14ZM0 2.5A2.5 2.5 0 0 1 2.5 0h14A2.5 2.5 0 0 1 19 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-14A2.5 2.5 0 0 1 0 14.5v-12Z',
  },
  '2h': {
    label: '2 columns',
    path: 'M1 2.5C1 1.67 1.67 1 2.5 1H9v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM10 16h6.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H10v15ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z',
  },
  '2v': {
    label: '2 rows',
    path: 'M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V8H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5V9H1Zm1.5-9A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z',
  },
  '3h': {
    label: '3 columns',
    path: 'M1 2.5C1 1.67 1.67 1 2.5 1H6v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM7 16h5V1H7v15Zm6-15v15h3.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H13ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z',
  },
  '4': {
    label: '2×2 grid',
    path: 'M1 2.5C1 1.67 1.67 1 2.5 1H9v7H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5H9V9H1Zm9 7h6.5c.83 0 1.5-.67 1.5-1.5V9h-8v7Zm8-8V2.5c0-.83-.67-1.5-1.5-1.5H10v7h8ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z',
  },
};

const LAYOUT_ORDER: LayoutId[] = ['1', '2h', '2v', '3h', '4'];

// ─── Sync toggle labels ────────────────────────────────────────────────────────

const SYNC_LABELS: Record<keyof SyncOptions, string> = {
  symbol: 'Sync Symbol',
  interval: 'Sync Interval',
  crosshair: 'Sync Crosshair',
  timeRange: 'Sync Time Range',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartLayoutPicker() {
  const layout = useLayoutStore((s) => s.layout);
  const syncOptions = useLayoutStore((s) => s.syncOptions);
  const setLayout = useLayoutStore((s) => s.setLayout);
  const toggleSync = useLayoutStore((s) => s.toggleSync);

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentIcon = LAYOUT_ICONS[layout];

  return (
    <div className="relative shrink-0">
      {/* Trigger button — shows the active layout icon */}
      <motion.button
        ref={triggerRef}
        {...guide('layout.picker')}
        onClick={() => {
          setOpen((p) => !p);
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Chart layout"
        className="flex h-7 w-7 items-center justify-center rounded transition-colors"
        style={{
          background: open ? `${color.purpleDark}20` : 'transparent',
          color: open ? color.purple : color.muted,
          border: open ? `1px solid ${color.purpleDark}40` : '1px solid transparent',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="-1 -1 21 19"
          width="16"
          height="14"
          fill="currentColor"
        >
          <path fillRule="evenodd" d={currentIcon.path} />
        </svg>
      </motion.button>

      {/* Rendered via portal to avoid overflow clip from SymbolBar container */}
      {open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              className="fixed z-50 w-56 overflow-hidden rounded-xl border border-white/8 shadow-2xl"
              style={{ background: bg.panel, top: menuPos.top, left: menuPos.left }}
            >
              {/* ── Layout grid ───────────────────────────────────────────── */}
              <div className="border-b border-white/6 px-3 pb-3 pt-2.5">
                <p
                  className="mb-2 font-semibold uppercase tracking-widest"
                  style={{ fontSize: fontSize.xs10, color: color.muted }}
                >
                  Layout
                </p>
                <div className="flex items-center gap-1.5">
                  {LAYOUT_ORDER.map((id) => {
                    const icon = LAYOUT_ICONS[id];
                    const isActive = layout === id;
                    return (
                      <motion.button
                        key={id}
                        {...guide('layout.option', id)}
                        onClick={() => {
                          setLayout(id);
                          setOpen(false);
                        }}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.94 }}
                        title={icon.label}
                        className="flex h-8 w-8 items-center justify-center rounded transition-colors"
                        style={{
                          background: isActive ? `${color.purpleDark}30` : `${bg.surface}80`,
                          color: isActive ? color.purple : color.muted,
                          border: isActive
                            ? `1px solid ${color.purpleDark}60`
                            : `1px solid color-mix(in srgb, ${color.white} 6%, transparent)`,
                          boxShadow: isActive ? `0 0 8px 2px ${color.purpleDark}30` : 'none',
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="-1 -1 21 19"
                          width="16"
                          height="14"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d={icon.path} />
                        </svg>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* ── Sync toggles ──────────────────────────────────────────── */}
              <div className="px-3 pb-2.5 pt-2">
                <p
                  className="mb-1.5 font-semibold uppercase tracking-widest"
                  style={{ fontSize: fontSize.xs10, color: color.muted }}
                >
                  Sync across panes
                </p>
                {(Object.keys(SYNC_LABELS) as (keyof SyncOptions)[]).map((key) => {
                  const enabled = syncOptions[key];
                  return (
                    <button
                      key={key}
                      {...guide('layout.sync', key)}
                      onClick={() => toggleSync(key)}
                      className="flex w-full items-center justify-between rounded px-1.5 py-1 transition-colors hover:bg-white/4"
                    >
                      <span style={{ fontSize: fontSize.xs11, color: color.muted }}>
                        {SYNC_LABELS[key]}
                      </span>
                      {/* Toggle pill */}
                      <div
                        className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
                        style={{
                          background: enabled ? color.purpleDark : `${color.muted}30`,
                        }}
                      >
                        <motion.div
                          animate={{ x: enabled ? 14 : 2 }}
                          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
                          className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>,
          document.body
        )}
    </div>
  );
}
