// ─── DrawingPropertiesMenu — floating toolbar for selected drawing ─

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { bg, color, fontSize as fontSizeTokens } from '@/lib/tokens';
import { ColorPicker } from '@/components/drawing/ColorPicker';
import { KebabMenu } from '@/components/drawing/KebabMenu';
import type { Drawing, LineStyle } from '@/lib/drawing/types';
import { SHAPE_CAPABILITIES } from '@/lib/drawing/types';

// ─── Props ─────────────────────────────────────────────────────────

interface DrawingPropertiesMenuProps {
  drawing: Drawing;
  position: { x: number; y: number };
  onUpdate: (id: string, updates: Partial<Drawing>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onClone: (drawing: Drawing) => void;
  onReorder: (id: string, dir: 'front' | 'forward' | 'back' | 'backward') => void;
  onEditLabel?: (drawing: Drawing) => void;
}

// ─── Line width + font size options ─────────────────────────────────

const LINE_WIDTHS = [1, 2, 3, 4] as const;
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32] as const;

// ─── Toolbar button style ─────────────────────────────────────────

const BTN =
  'flex h-10 w-10 items-center justify-center rounded text-sm transition-colors hover:bg-white/10';

const ICON = 'size-5';

// ─── Component ─────────────────────────────────────────────────────

export function DrawingPropertiesMenu({
  drawing,
  position,
  onUpdate,
  onRemove,
  onClose,
  onClone,
  onReorder,
  onEditLabel,
}: DrawingPropertiesMenuProps) {
  const [anchorPos, setAnchorPos] = useState({ x: position.x, y: position.y });
  const [showLineColor, setShowLineColor] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showFillColor, setShowFillColor] = useState(false);
  const [showWidth, setShowWidth] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [showLineStyle, setShowLineStyle] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showKebab, setShowKebab] = useState(false);

  const caps = SHAPE_CAPABILITIES[drawing.shape.type];
  const isTextTool =
    drawing.shape.type === 'text' ||
    drawing.shape.type === 'note' ||
    drawing.shape.type === 'callout' ||
    drawing.shape.type === 'priceNote' ||
    drawing.shape.type === 'priceLabel';

  const isEditableText = isTextTool && drawing.shape.type !== 'priceLabel';

  const toolbarRef = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setAnchorPos({ x: position.x, y: position.y });
  }, [position.x, position.y]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const STYLE_OPTIONS: { key: LineStyle; label: string }[] = [
    { key: 'solid', label: 'Line' },
    { key: 'dashed', label: 'Dashed line' },
    { key: 'dotted', label: 'Dotted line' },
  ];

  function openPopup(name: string) {
    setShowLineColor(name === 'lineColor');
    setShowTextColor(name === 'textColor');
    setShowFillColor(name === 'fillColor');
    setShowWidth(name === 'width');
    setShowLabel(name === 'label');
    setShowLineStyle(name === 'lineStyle');
    setShowFontSize(name === 'fontSize');
    setShowKebab(name === 'kebab');
  }

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[90] flex items-center gap-0.5 rounded-md border border-white/8 px-1.5 py-1 shadow-xl"
      style={{
        left: anchorPos.x,
        top: anchorPos.y,
        background: bg.panel,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* ── Drag handle (6-dot grid) ────────────────────────────── */}
      <div
        title="Drag to reposition toolbar"
        className="flex cursor-grab flex-col items-center justify-center gap-px px-1"
        onPointerDown={(e) => {
          e.preventDefault();
          const el = toolbarRef.current;
          if (!el) return;
          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = anchorPos.x;
          const startTop = anchorPos.y;

          const onMove = (ev: PointerEvent) => {
            setAnchorPos({
              x: startLeft + (ev.clientX - startX),
              y: startTop + (ev.clientY - startY),
            });
          };
          const onUp = () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
          };
          el.setPointerCapture(e.pointerId);
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
        }}
      >
        {[0, 1].map((row) => (
          <div key={row} className="flex gap-px">
            {[0, 1, 2].map((col) => (
              <div
                key={col}
                className="h-[3px] w-[3px] rounded-full"
                style={{ background: `${color.muted}60` }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── Duplicate (hidden for text/note tools) ──────────────── */}
      {!isTextTool && (
        <button
          className={BTN}
          onClick={() => onClone(drawing)}
          title="Duplicate"
          aria-label="Duplicate"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={ICON}
          >
            <rect x="7" y="7" width="14" height="14" rx="1" />
            <rect x="11" y="11" width="14" height="14" rx="1" fill="none" opacity="0.5" />
            <line x1="22" y1="8" x2="22" y2="5" strokeWidth="1.5" />
            <line x1="18.5" y1="6.5" x2="25.5" y2="6.5" strokeWidth="1.5" />
          </svg>
        </button>
      )}

      {/* ── Text format T (label edit — opens textarea for text tools, single-line input for line tools) ── */}
      {caps.hasEditableLabel && (
        <button
          className={BTN}
          onClick={() => {
            if (isEditableText) {
              onEditLabel?.(drawing);
              onClose();
            } else {
              openPopup('label');
            }
          }}
          title="Edit text"
          aria-label="Edit text"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={ICON}
          >
            <text x="10" y="18" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">
              T
            </text>
            <line x1="6" y1="21" x2="22" y2="21" strokeWidth="2.5" />
          </svg>
        </button>
      )}

      {/* ── Font-size chip ─────────────────────────────────────── */}
      {caps.hasFontSize && (
        <button
          className={BTN}
          onClick={() => openPopup('fontSize')}
          title="Font size"
          aria-label="Font size"
          style={{
            fontFamily: 'inherit',
            fontSize: fontSizeTokens.xs11,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: color.white,
          }}
        >
          {drawing.fontSize}
        </button>
      )}

      {/* ── Line / border accent color ─────────────────────────── */}
      {caps.hasLineColor && (
        <button
          className={BTN}
          onClick={() => openPopup('lineColor')}
          title="Line color"
          aria-label="Line color"
        >
          <div
            className="h-6 w-6 rounded-full border border-white/20"
            style={{ background: drawing.color }}
          />
        </button>
      )}

      {/* ── Fill color (box / pill background) ──────────────────── */}
      {caps.hasFillColor && (
        <button
          className={BTN}
          onClick={() => openPopup('fillColor')}
          title="Fill color"
          aria-label="Fill color"
        >
          <div
            className="h-6 w-6 rounded border border-white/20"
            style={{ background: drawing.backgroundColor }}
          />
        </button>
      )}

      {/* ── Text color ─────────────────────────────────────────── */}
      {caps.hasTextColor && (
        <button
          className={BTN}
          onClick={() => openPopup('textColor')}
          title="Text color"
          aria-label="Text color"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={ICON}
          >
            <text
              x="14"
              y="20"
              textAnchor="middle"
              fill={drawing.textColor}
              stroke="none"
              fontSize="18"
              fontFamily="sans-serif"
            >
              A
            </text>
          </svg>
        </button>
      )}

      {/* ── Line width ──────────────────────────────────────────── */}
      {caps.hasLineWidth && (
        <button
          className={BTN}
          onClick={() => openPopup('width')}
          title="Line width"
          aria-label="Line width"
        >
          <svg width="24" height="24" viewBox="0 0 28 28" className={ICON}>
            <line
              x1="2"
              y1="14"
              x2="26"
              y2="14"
              stroke="currentColor"
              strokeWidth={drawing.lineWidth}
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {/* ── Line style ──────────────────────────────────────────── */}
      {caps.hasLineStyle && (
        <button
          className={BTN}
          onClick={() => openPopup('lineStyle')}
          title="Line style"
          aria-label={`Line style: ${drawing.lineStyle}`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={ICON}
          >
            <line
              x1="2"
              y1="14"
              x2="26"
              y2="14"
              strokeDasharray={
                drawing.lineStyle === 'solid'
                  ? 'none'
                  : drawing.lineStyle === 'dashed'
                    ? '6 4'
                    : '2 4'
              }
            />
          </svg>
        </button>
      )}

      {/* ── Hexagon / shape settings (hidden for text/note tools) ── */}
      {!isTextTool && (
        <button
          className={BTN}
          onClick={() => {
            if (caps.hasLineStyle) openPopup('lineStyle');
            else if (caps.hasTextColor) openPopup('textColor');
            else if (caps.hasFontSize) openPopup('fontSize');
          }}
          title="Style settings"
          aria-label="Style settings"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={ICON}
          >
            <path d="M14 3L25 9.5v9L14 25 3 18.5v-9L14 3z" />
            <circle cx="14" cy="14" r="3" />
          </svg>
        </button>
      )}

      {/* ── Lock toggle ─────────────────────────────────────────── */}
      <button
        className={BTN}
        onClick={() => onUpdate(drawing.id, { isLocked: !drawing.isLocked })}
        title={drawing.isLocked ? 'Unlock drawing' : 'Lock drawing'}
        aria-pressed={drawing.isLocked}
        aria-label={drawing.isLocked ? 'Unlock drawing' : 'Lock drawing'}
        style={{ color: drawing.isLocked ? '#fbbf24' : undefined }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={ICON}
        >
          {drawing.isLocked ? (
            <>
              <rect x="5" y="12" width="18" height="12" rx="2" />
              <path d="M9 12V9a5 5 0 0 1 10 0v3" />
              <circle cx="14" cy="18" r="2" />
            </>
          ) : (
            <>
              <rect x="5" y="12" width="18" height="12" rx="2" fill="currentColor" opacity="0.15" />
              <path d="M9 12V9a5 5 0 0 1 10 0v3" opacity="0.4" />
              <circle cx="14" cy="18" r="2" />
            </>
          )}
        </svg>
      </button>

      {/* ── Anchor toggle (hidden for text/note tools) ──────────── */}
      {!isTextTool && (
        <button
          className={BTN}
          onClick={() => onUpdate(drawing.id, { isFloating: !drawing.isFloating })}
          title={drawing.isFloating ? 'Anchor to chart' : 'Detach from chart'}
          aria-pressed={drawing.isFloating}
          aria-label={drawing.isFloating ? 'Anchor to chart' : 'Detach from chart'}
          style={{ color: drawing.isFloating ? '#fbbf24' : undefined }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 28 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={ICON}
          >
            <circle cx="14" cy="7" r="2.5" fill="currentColor" />
            <line x1="14" y1="9.5" x2="14" y2="22" strokeWidth="2" />
            <path d="M9 22h10" strokeWidth="2" />
            <path d="M8 16c0 0 2-4 6-4s6 4 6 4" strokeWidth="1.5" />
          </svg>
        </button>
      )}

      {/* ── Remove ──────────────────────────────────────────────── */}
      <button
        className={BTN}
        onClick={() => onRemove(drawing.id)}
        title="Delete drawing"
        aria-label="Remove drawing"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={ICON}
        >
          <line x1="7" y1="7" x2="21" y2="21" />
          <line x1="21" y1="7" x2="7" y2="21" />
        </svg>
      </button>

      {/* ── Kebab menu ─────────────────────────────────────────── */}
      <button
        className={BTN}
        onClick={() => openPopup('kebab')}
        title="More actions"
        aria-label="More actions"
      >
        <svg width="24" height="24" viewBox="0 0 28 28" fill="currentColor" className={ICON}>
          <circle cx="14" cy="8" r="2" />
          <circle cx="14" cy="14" r="2" />
          <circle cx="14" cy="20" r="2" />
        </svg>
      </button>

      {/* ── Popups ──────────────────────────────────────────────── */}
      {showLineColor && (
        <div className="absolute left-0 top-12 z-[100]">
          <ColorPicker
            selectedColor={drawing.color}
            onSelect={(hex) => onUpdate(drawing.id, { color: hex })}
            onClose={() => setShowLineColor(false)}
          />
        </div>
      )}

      {showTextColor && (
        <div className="absolute left-0 top-12 z-[100]">
          <ColorPicker
            selectedColor={drawing.textColor}
            onSelect={(hex) => onUpdate(drawing.id, { textColor: hex })}
            onClose={() => setShowTextColor(false)}
          />
        </div>
      )}

      {showFillColor && (
        <div className="absolute left-0 top-12 z-[100]">
          <ColorPicker
            selectedColor={drawing.backgroundColor}
            onSelect={(hex) => onUpdate(drawing.id, { backgroundColor: hex })}
            onClose={() => setShowFillColor(false)}
          />
        </div>
      )}

      <AnimatePresence>
        {showLabel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-12 z-[100] overflow-hidden rounded-md border border-white/8 shadow-xl"
            style={{ background: bg.panel }}
          >
            <input
              autoFocus
              type="text"
              placeholder="Add label"
              defaultValue={drawing.label ?? ''}
              className="w-44 bg-transparent px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  onUpdate(drawing.id, { label: val || undefined });
                  setShowLabel(false);
                } else if (e.key === 'Escape') {
                  setShowLabel(false);
                }
              }}
              onBlur={(e) => {
                const val = e.target.value.trim();
                onUpdate(drawing.id, { label: val || undefined });
                setShowLabel(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWidth && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-12 z-[100] overflow-hidden rounded-md border border-white/8 shadow-xl"
            style={{ background: bg.panel }}
          >
            <table>
              <tbody>
                {LINE_WIDTHS.map((w) => (
                  <tr
                    key={w}
                    data-role="menuitem"
                    tabIndex={-1}
                    className="cursor-pointer transition-colors hover:bg-white/8"
                    style={{
                      background: drawing.lineWidth === w ? `${color.purpleDark}20` : undefined,
                      color: drawing.lineWidth === w ? color.white : color.muted,
                    }}
                    onClick={() => {
                      onUpdate(drawing.id, { lineWidth: w });
                      setShowWidth(false);
                    }}
                  >
                    <td className="px-1.5 py-1">
                      <svg width="28" height="12" viewBox="0 0 28 12">
                        <line
                          x1="0"
                          y1="6"
                          x2="28"
                          y2="6"
                          stroke="currentColor"
                          strokeWidth={w}
                          strokeLinecap="round"
                        />
                      </svg>
                    </td>
                    <td className="pr-3 py-1">
                      <span className="whitespace-nowrap text-xs font-medium">{w}px</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFontSize && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-12 z-[100] overflow-hidden rounded-md border border-white/8 shadow-xl"
            style={{ background: bg.panel }}
          >
            <table>
              <tbody>
                {FONT_SIZES.map((size) => (
                  <tr
                    key={size}
                    data-role="menuitem"
                    tabIndex={-1}
                    className="cursor-pointer transition-colors hover:bg-white/8"
                    style={{
                      background: drawing.fontSize === size ? `${color.purpleDark}20` : undefined,
                      color: drawing.fontSize === size ? color.white : color.muted,
                    }}
                    onClick={() => {
                      onUpdate(drawing.id, { fontSize: size });
                      setShowFontSize(false);
                    }}
                  >
                    <td className="px-2.5 py-1.5 text-right">
                      <span className="whitespace-nowrap text-xs font-medium tabular-nums">
                        {size}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLineStyle && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-12 z-[100] overflow-hidden rounded-md border border-white/8 shadow-xl"
            style={{ background: bg.panel }}
          >
            <table>
              <tbody>
                {STYLE_OPTIONS.map((opt) => (
                  <tr
                    key={opt.key}
                    data-role="menuitem"
                    tabIndex={-1}
                    className="cursor-pointer transition-colors hover:bg-white/8"
                    style={{
                      background:
                        drawing.lineStyle === opt.key ? `${color.purpleDark}20` : undefined,
                      color: drawing.lineStyle === opt.key ? color.white : color.muted,
                    }}
                    onClick={() => {
                      onUpdate(drawing.id, { lineStyle: opt.key });
                      setShowLineStyle(false);
                    }}
                  >
                    <td className="px-1.5 py-1">
                      <svg
                        width="28"
                        height="28"
                        stroke="currentColor"
                        strokeWidth={opt.key === 'dotted' ? '0' : '2'}
                      >
                        {opt.key === 'solid' && (
                          <path d="M4 13.5h20" stroke="currentColor" fill="none" />
                        )}
                        {opt.key === 'dashed' && (
                          <path
                            fill="currentColor"
                            d="M4 13h5v1H4v-1zM12 13h5v1h-5v-1zM20 13h5v1h-5v-1z"
                          />
                        )}
                        {opt.key === 'dotted' && (
                          <path
                            fill="currentColor"
                            d="M3 14h2v2H3v-2Zm5 0h2v2H8v-2Zm7 0h-2v2h2v-2Zm3 0h2v2h-2v-2Zm7 0h-2v2h2v-2Z"
                          />
                        )}
                      </svg>
                    </td>
                    <td className="pr-3 py-1">
                      <span className="whitespace-nowrap text-xs font-medium">{opt.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {showKebab && (
        <div className="absolute left-0 top-12 z-[100]">
          <KebabMenu
            onClone={() => onClone(drawing)}
            onRemove={() => onRemove(drawing.id)}
            onReorder={(dir) => onReorder(drawing.id, dir)}
            onClose={() => setShowKebab(false)}
          />
        </div>
      )}
    </div>
  );
}
