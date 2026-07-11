import { useState, useRef, useEffect, useCallback } from 'react';
import type { ElementType } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, Type, Pencil, Trash2 } from 'lucide-react';
import { bg, color, fontSize } from '@/lib/tokens';
import { CURSOR_VARIANTS, type CursorVariantId } from '@/lib/cursors';
import { LINE_TOOLS, type LineToolId } from '@/lib/lineTools';
import { BinToolMenu } from '@/components/drawing/BinToolMenu';

// ─── Tool definitions ─────────────────────────────────────────────────────────

type Tool = {
  id: string;
  icon: ElementType;
  label: string;
} | null;

const TOOLS: Tool[] = [
  { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
  null,
  { id: 'line', icon: MousePointer2, label: 'Lines' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'pencil', icon: Pencil, label: 'Freehand Draw' },
  null,
  { id: 'bin', icon: Trash2, label: 'Remove All' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface LeftToolbarProps {
  onCursorVariantChange?: (variant: CursorVariantId) => void;
  activeTool?: string;
  cursorVariant?: CursorVariantId;
  onToolChange?: (toolId: string, lineToolId: string) => void;
  onBinAction?: () => void;
  lineTool?: LineToolId;
}

export function LeftToolbar({
  onCursorVariantChange,
  activeTool: activeToolProp,
  cursorVariant: cursorVariantProp,
  onToolChange,
  onBinAction,
  lineTool: lineToolProp,
}: LeftToolbarProps) {
  // Cursor variant mirrors prop when controlled, falls back to local state
  const [localCursorVariant, setLocalCursorVariant] = useState<CursorVariantId>('cross');
  const cursorVariant = cursorVariantProp ?? localCursorVariant;

  // Local active tool mirrors prop, falls back to 'cursor' when uncontrolled
  const [localActiveTool, setLocalActiveTool] = useState('cursor');
  const activeTool = activeToolProp ?? localActiveTool;
  const setActiveTool = useCallback(
    (id: string) => {
      if (activeToolProp === undefined) setLocalActiveTool(id);
    },
    [activeToolProp]
  );
  const [showCursorMenu, setShowCursorMenu] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const cursorBtnRef = useRef<HTMLButtonElement>(null);
  const cursorMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });

  // ── Line drawing tool ──────────────────────────────────────────────────────
  const [localLineTool, setLocalLineTool] = useState<LineToolId>('trendline');
  const lineTool = lineToolProp ?? localLineTool;
  const setLineTool = useCallback(
    (id: LineToolId) => {
      if (lineToolProp === undefined) setLocalLineTool(id);
    },
    [lineToolProp]
  );
  const [showLineMenu, setShowLineMenu] = useState(false);
  const lineBtnRef = useRef<HTMLButtonElement>(null);
  const lineMenuRef = useRef<HTMLDivElement>(null);
  const [lineMenuPos, setLineMenuPos] = useState({ left: 0, top: 0 });

  // ── Bin tool right-click menu ──────────────────────────────────────────────
  const [showBinMenu, setShowBinMenu] = useState(false);
  const binBtnRef = useRef<HTMLButtonElement>(null);
  const [binMenuPos, setBinMenuPos] = useState({ left: 0, top: 0 });

  function handleLineContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = lineBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setLineMenuPos({ left: rect.right + 6, top: rect.top });
    }
    setShowLineMenu((v) => !v);
  }

  function handleBinContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = binBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setBinMenuPos({ left: rect.right + 6, top: rect.top });
    }
    setShowBinMenu(true);
  }

  function handleLineToolSelect(id: LineToolId) {
    setLineTool(id);
    setActiveTool(id);
    setShowLineMenu(false);
    onToolChange?.(id, id);
  }

  // ── Portal-based tooltip (TradingView data-tooltip pattern) ─────────
  const [tooltip, setTooltip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    let lastEl: HTMLElement | null = null;

    const onMouseOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
      if (!el) {
        if (lastEl) {
          lastEl = null;
          clearTimeout(tooltipTimeoutRef.current);
          setTooltip(null);
        }
        return;
      }
      if (el === lastEl) return;
      lastEl = el;
      const text = el.getAttribute('data-tooltip') || '';
      const delay = Number(el.getAttribute('data-tooltip-delay')) || 1500;
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setTooltip({ text, top: rect.top + rect.height / 2, left: rect.right + 10 });
      }, delay);
    };

    const onMouseLeave = () => {
      lastEl = null;
      clearTimeout(tooltipTimeoutRef.current);
      setTooltip(null);
    };

    aside.addEventListener('mouseover', onMouseOver);
    aside.addEventListener('mouseleave', onMouseLeave);
    return () => {
      aside.removeEventListener('mouseover', onMouseOver);
      aside.removeEventListener('mouseleave', onMouseLeave);
      clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  // Close menu on click-outside
  const handleMousedown = useCallback((e: MouseEvent) => {
    if (
      cursorMenuRef.current &&
      !cursorMenuRef.current.contains(e.target as Node) &&
      cursorBtnRef.current &&
      !cursorBtnRef.current.contains(e.target as Node)
    ) {
      setShowCursorMenu(false);
    }
  }, []);

  useEffect(() => {
    if (showCursorMenu) {
      document.addEventListener('mousedown', handleMousedown);
    }
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [showCursorMenu, handleMousedown]);

  const handleLineMousedown = useCallback((e: MouseEvent) => {
    if (
      lineMenuRef.current &&
      !lineMenuRef.current.contains(e.target as Node) &&
      lineBtnRef.current &&
      !lineBtnRef.current.contains(e.target as Node)
    ) {
      setShowLineMenu(false);
    }
  }, []);

  useEffect(() => {
    if (showLineMenu) {
      document.addEventListener('mousedown', handleLineMousedown);
    }
    return () => document.removeEventListener('mousedown', handleLineMousedown);
  }, [showLineMenu, handleLineMousedown]);

  function handleCursorContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = cursorBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ left: rect.right + 6, top: rect.top });
    }
    setShowCursorMenu((v) => !v);
  }

  function handleCursorVariantSelect(id: CursorVariantId) {
    setLocalCursorVariant(id);
    setActiveTool('cursor');
    setShowCursorMenu(false);
    onCursorVariantChange?.(id);
    onToolChange?.('cursor', lineTool);
  }

  return (
    <aside
      ref={asideRef}
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/6 py-2 overflow-y-auto"
      style={{ background: bg.page }}
    >
      {TOOLS.map((tool, i) => {
        // Separator
        if (tool === null) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1.5 h-px w-6 rounded-full"
              style={{ background: `color-mix(in srgb, ${color.white} 6%, transparent)` }}
            />
          );
        }

        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        const isCursor = tool.id === 'cursor';
        const isLine = tool.id === 'line';
        const isBin = tool.id === 'bin';

        // ── Cursor tool gets right-click popup + variant chevron ───────────
        if (isCursor) {
          const cursorVariantDef = CURSOR_VARIANTS.find(
            (v): v is NonNullable<typeof v> => v !== null && v.id === cursorVariant
          );
          const CursorIcon = cursorVariantDef?.icon ?? Icon;

          return (
            <motion.button
              key={tool.id}
              ref={cursorBtnRef}
              data-tooltip={cursorVariantDef?.label ?? 'Cursor'}
              aria-label={cursorVariantDef?.label ?? 'Cursor'}
              onClick={() => {
                setActiveTool('cursor');
                onToolChange?.('cursor', lineTool);
              }}
              onContextMenu={handleCursorContextMenu}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="group relative flex h-10 w-10 items-center justify-center rounded"
              style={{
                background: isActive ? `${color.purpleDark}20` : 'transparent',
                color: isActive ? color.purple : color.muted,
              }}
            >
              {/* Active glow ring */}
              {isActive && (
                <motion.span
                  layoutId="toolbar-active"
                  className="absolute inset-0 rounded"
                  style={{
                    background: `${color.purpleDark}20`,
                    boxShadow: `0 0 0 1px ${color.purpleDark}40`,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              <CursorIcon size={24} />

              {/* Variant indicator chevron — 6px triangle at bottom-right */}
              <span
                className="absolute bottom-0.5 right-0.5 z-10"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid currentColor',
                  opacity: 0.6,
                }}
              />
            </motion.button>
          );
        }

        // ── Line tool gets right-click popup + variant chevron ────────────
        if (isLine) {
          const lineToolDef = LINE_TOOLS.find(
            (v): v is NonNullable<typeof v> => v !== null && v.id === lineTool
          );
          const LineIcon = lineToolDef?.icon ?? Icon;
          const lineToolActive = LINE_TOOLS.some(
            (v): v is NonNullable<typeof v> => v !== null && v.id === activeTool
          );

          return (
            <motion.button
              key={tool.id}
              ref={lineBtnRef}
              data-tooltip="Lines"
              aria-label={lineToolDef?.label ?? 'Lines'}
              onClick={() => {
                setActiveTool(lineTool);
                onToolChange?.(lineTool, lineTool);
              }}
              onContextMenu={handleLineContextMenu}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="group relative flex h-10 w-10 items-center justify-center rounded"
              style={{
                background: lineToolActive ? `${color.purpleDark}20` : 'transparent',
                color: lineToolActive ? color.purple : color.muted,
              }}
            >
              {/* Active glow ring */}
              {lineToolActive && (
                <motion.span
                  layoutId="toolbar-active"
                  className="absolute inset-0 rounded"
                  style={{
                    background: `${color.purpleDark}20`,
                    boxShadow: `0 0 0 1px ${color.purpleDark}40`,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              <LineIcon size={24} />

              {/* Variant indicator chevron — 6px triangle at bottom-right */}
              <span
                className="absolute bottom-0.5 right-0.5 z-10"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid currentColor',
                  opacity: 0.6,
                }}
              />
            </motion.button>
          );
        }

        // ── All other tools ─────────────────────────────────────────────
        if (isBin) {
          return (
            <motion.button
              key={tool.id}
              ref={binBtnRef}
              data-tooltip={tool.label}
              aria-label={tool.label}
              onClick={() => onBinAction?.()}
              onContextMenu={handleBinContextMenu}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="group relative flex h-10 w-10 items-center justify-center rounded"
              style={{
                background: isActive ? `${color.purpleDark}20` : 'transparent',
                color: isActive ? color.purple : color.muted,
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="toolbar-active"
                  className="absolute inset-0 rounded"
                  style={{
                    background: `${color.purpleDark}20`,
                    boxShadow: `0 0 0 1px ${color.purpleDark}40`,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className="relative z-10 h-6 w-6" />
            </motion.button>
          );
        }

        // ── All other tools ─────────────────────────────────────────────
        return (
          <motion.button
            key={tool.id}
            data-tooltip={tool.label}
            aria-label={tool.label}
            onClick={() => {
              setActiveTool(tool.id);
              onToolChange?.(tool.id, lineTool);
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="group relative flex h-10 w-10 items-center justify-center rounded"
            style={{
              background: isActive ? `${color.purpleDark}20` : 'transparent',
              color: isActive ? color.purple : color.muted,
            }}
          >
            {/* Active glow ring */}
            {isActive && (
              <motion.span
                layoutId="toolbar-active"
                className="absolute inset-0 rounded"
                style={{
                  background: `${color.purpleDark}20`,
                  boxShadow: `0 0 0 1px ${color.purpleDark}40`,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}

            <Icon className="relative z-10 h-6 w-6" />
          </motion.button>
        );
      })}

      {/* ── Cursor variant popup menu ─────────────────────────────────── */}
      <AnimatePresence>
        {showCursorMenu && (
          <motion.div
            ref={cursorMenuRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 w-44 overflow-hidden rounded-md border border-white/8 py-1 shadow-xl"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              background: bg.panel,
            }}
          >
            {CURSOR_VARIANTS.map((variant, idx) => {
              if (variant === null) {
                return (
                  <div
                    key={`div-${idx}`}
                    className="mx-2 my-1 h-px rounded-full"
                    style={{ background: `color-mix(in srgb, ${color.white} 8%, transparent)` }}
                  />
                );
              }

              const VariantIcon = variant.icon;
              const isSelected = cursorVariant === variant.id;

              return (
                <button
                  key={variant.id}
                  onClick={() => handleCursorVariantSelect(variant.id)}
                  className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors"
                  style={{
                    background: isSelected ? `${color.purpleDark}20` : 'transparent',
                    color: isSelected ? color.purple : color.muted,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = `${color.white}08`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <VariantIcon size={22} />
                  <span className="flex-1 text-xs font-medium">{variant.label}</span>
                  {isSelected && (
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
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Line variant popup menu ────────────────────────────────────── */}
      <AnimatePresence>
        {showLineMenu && (
          <motion.div
            ref={lineMenuRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 w-44 overflow-hidden rounded-md border border-white/8 py-1 shadow-xl"
            style={{
              left: lineMenuPos.left,
              top: lineMenuPos.top,
              background: bg.panel,
            }}
          >
            {LINE_TOOLS.map((variant, idx) => {
              if (variant === null) {
                return (
                  <div
                    key={`div-${idx}`}
                    className="mx-2 my-1 h-px rounded-full"
                    style={{ background: `color-mix(in srgb, ${color.white} 8%, transparent)` }}
                  />
                );
              }

              const VariantIcon = variant.icon;
              const isSelected = lineTool === variant.id;

              return (
                <button
                  key={variant.id}
                  onClick={() => handleLineToolSelect(variant.id)}
                  className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors"
                  style={{
                    background: isSelected ? `${color.purpleDark}20` : 'transparent',
                    color: isSelected ? color.purple : color.muted,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = `${color.white}08`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <VariantIcon size={22} />
                  <span className="flex-1 text-xs font-medium">{variant.label}</span>
                  {isSelected && (
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
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bin tool submenu ──────────────────────────────────────────── */}
      {showBinMenu && <BinToolMenu position={binMenuPos} onClose={() => setShowBinMenu(false)} />}

      {/* ── Portal tooltip ───────────────────────────────────────────── */}
      {tooltip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[1000] whitespace-nowrap rounded-md border border-white/8 px-2 py-1 font-semibold text-white/80 shadow-xl"
            style={{
              top: tooltip.top,
              left: tooltip.left,
              transform: 'translateY(-50%)',
              fontSize: fontSize.xs10,
              background: bg.surface,
            }}
          >
            {tooltip.text}
          </div>,
          document.body
        )}
    </aside>
  );
}
