import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { getIndicatorMeta } from '@/lib/indicators/catalog';
import type { IndicatorInstance, IndicatorStyle, ParamValues } from '@/lib/indicators/types';
import { bg, color, fontSize } from '@/lib/tokens';

interface IndicatorSettingsProps {
  instance: IndicatorInstance;
  anchorRect: DOMRect;
  onSave: (
    instanceId: string,
    params: ParamValues,
    color: string,
    lineWidth: 1 | 2 | 3 | 4,
    lineStyle: IndicatorStyle['lineStyle']
  ) => void;
  onClose: () => void;
}

const LINE_WIDTH_OPTIONS = [1, 2, 3, 4] as const;

const LINE_STYLE_OPTIONS: {
  value: IndicatorStyle['lineStyle'];
  label: string;
  dashArray: string;
}[] = [
  { value: 'solid', label: 'Solid', dashArray: 'none' },
  { value: 'dashed', label: 'Dashed', dashArray: '6, 6' },
  { value: 'dotted', label: 'Dotted', dashArray: '2, 2' },
  { value: 'large-dashed', label: 'Large', dashArray: '12, 8' },
  { value: 'sparse-dotted', label: 'Sparse', dashArray: '2, 8' },
];

export function IndicatorSettings({
  instance,
  anchorRect,
  onSave,
  onClose,
}: IndicatorSettingsProps) {
  const meta = getIndicatorMeta(instance.indicatorId);
  const [params, setParams] = useState<ParamValues>({ ...instance.params });
  const [colorVal, setColorVal] = useState(instance.color);
  const [lineWidth, setLineWidth] = useState(instance.lineWidth);
  const [lineStyle, setLineStyle] = useState<IndicatorStyle['lineStyle']>(instance.lineStyle);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!meta || meta.params.length === 0) {
    // No configurable params — no settings to show
    onClose();
    return null;
  }

  const handleSave = () => {
    onSave(instance.instanceId, params, colorVal, lineWidth, lineStyle);
    onClose();
  };

  const PANEL_WIDTH = 288;

  const pos = {
    top: Math.min(anchorRect.bottom + 4, window.innerHeight - 80),
    left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - PANEL_WIDTH - 8)),
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.96 }}
        transition={{ duration: 0.1 }}
        className="fixed z-50 flex w-72 flex-col rounded-xl border border-white/8 shadow-2xl"
        style={{
          background: bg.panel,
          top: pos.top,
          left: pos.left,
          maxHeight: Math.max(160, window.innerHeight - pos.top - 8),
        }}
      >
        <div
          className="shrink-0 border-b border-white/6 px-3 py-2 font-semibold"
          style={{ fontSize: fontSize.xs11, color: color.white }}
        >
          {meta.label} — Settings
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {meta.params.map((p) => (
              <div key={p.id}>
                <label
                  className="mb-1 block font-semibold"
                  style={{ fontSize: fontSize.xs10, color: color.muted }}
                >
                  {p.label}
                </label>
                {p.type === 'select' && p.options ? (
                  <select
                    value={String(params[p.id] ?? p.default)}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-full rounded-md border border-white/10 px-2 py-1.5 text-white outline-none"
                    style={{
                      background: bg.input,
                      fontSize: fontSize.xs11,
                      caretColor: color.purple,
                    }}
                  >
                    {p.options.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={Number(params[p.id] ?? p.default)}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                    }
                    className="w-full rounded-md border border-white/10 px-2 py-1.5 text-white outline-none"
                    style={{
                      background: bg.input,
                      fontSize: fontSize.xs11,
                      caretColor: color.purple,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Color */}
          <div>
            <label
              className="mb-1 block font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorVal}
                onChange={(e) => setColorVal(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border-0 p-0"
              />
              <input
                value={colorVal}
                onChange={(e) => setColorVal(e.target.value)}
                className="flex-1 rounded-md border border-white/10 px-2 py-1.5 font-mono text-white outline-none"
                style={{ background: bg.input, fontSize: fontSize.xs10, caretColor: color.purple }}
              />
            </div>
          </div>

          {/* Line Width */}
          <div>
            <label
              className="mb-1 block font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Width
            </label>
            <div className="flex gap-1">
              {LINE_WIDTH_OPTIONS.map((w) => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className="flex-1 rounded py-1 text-center text-xs font-semibold transition-colors"
                  style={{
                    background: lineWidth === w ? `${color.purple}30` : 'transparent',
                    color: lineWidth === w ? color.purple : color.muted,
                    border: `1px solid ${lineWidth === w ? `${color.purple}60` : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Line Style */}
          <div>
            <label
              className="mb-1 block font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Style
            </label>
            <div className="flex flex-wrap gap-1">
              {LINE_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLineStyle(opt.value)}
                  className="rounded px-2 py-1 text-xs font-semibold transition-colors"
                  style={{
                    background: lineStyle === opt.value ? `${color.purple}30` : 'transparent',
                    color: lineStyle === opt.value ? color.purple : color.muted,
                    border: `1px solid ${lineStyle === opt.value ? `${color.purple}60` : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/6 px-3 py-2.5">
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-xs font-semibold transition-colors hover:text-white"
            style={{ color: color.muted }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded px-4 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: color.purpleDark }}
          >
            Apply
          </button>
        </div>
      </motion.div>
    </>,
    document.body
  );
}
