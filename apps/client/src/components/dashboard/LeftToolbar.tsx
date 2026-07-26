import { useState, useRef, useEffect, useCallback } from 'react';
import type { ElementType } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer2,
  TrendingUp,
  GitBranch,
  Shapes,
  Type,
  Ruler,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { bg, color, fontSize } from '@/lib/tokens';
import { CURSOR_VARIANTS, type CursorVariantId } from '@/lib/cursors';
import { TOOL_GROUPS } from '@/lib/libraryTools';
import type { ToolDef } from '@/lib/libraryTools';
import { TOOL_ICONS } from '@/lib/toolIcons';

const BIN_TOOLS: ToolDef[] = [
  { id: 'remove-all', label: 'Remove All' },
  { id: 'eraser', label: 'Eraser' },
];

// ─── Tool toolbar button definitions ────────────────────────────────────────

type ToolButton = {
  id: string;
  icon: ElementType;
  label: string;
} | null;

const MAIN_BUTTONS: ToolButton[] = [
  { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
  null,
  { id: 'trend-lines', icon: TrendingUp, label: 'Trend Lines' },
  { id: 'fib-gann', icon: GitBranch, label: 'Fib & Gann' },
  { id: 'shapes', icon: Shapes, label: 'Shapes' },
  { id: 'annotations', icon: Type, label: 'Text & Notes' },
  { id: 'measure', icon: Ruler, label: 'Forecast & Measure' },
  null,
  { id: 'bin', icon: Trash2, label: 'Remove All' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface LeftToolbarProps {
  onToolChange?: (toolType: string | null) => void;
  onBinAction?: () => void;
  onZoomOut?: () => void;
  cursorVariant?: CursorVariantId;
  onCursorVariantChange?: (variant: CursorVariantId) => void;
  activeToolType?: string | null;
}

export function LeftToolbar({
  onToolChange,
  onBinAction,
  onZoomOut,
  cursorVariant: cursorVariantProp,
  onCursorVariantChange,
  activeToolType: activeToolTypeProp,
}: LeftToolbarProps) {
  // ── Cursor (local state falls back when uncontrolled) ──────────────────
  const [localCursorVariant, setLocalCursorVariant] = useState<CursorVariantId>('cross');
  const cursorVariant = cursorVariantProp ?? localCursorVariant;

  // ── Tool state (external prop takes precedence, fall back to local) ──────
  const [localToolType, setLocalToolType] = useState<string | null>(null);
  const activeToolType = activeToolTypeProp !== undefined ? activeToolTypeProp : localToolType;

  // Last-selected sub-tool per group (persists across group switches)
  const [subToolMap, setSubToolMap] = useState<Record<string, string>>({
    'trend-lines': 'trend-line',
    'fib-gann': 'fib-retracement',
    shapes: 'rectangle',
    annotations: 'text-annotation',
    measure: 'long-position',
    bin: 'remove-all',
  });

  // ── Generic popup menu state (replaces individual menu states) ──────────
  const [popupMenu, setPopupMenu] = useState<{
    groupId: string;
    left: number;
    top: number;
  } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // ── Cursor variant menu (kept separate — these are CSS cursors, not drawing tools) ──
  const [showCursorMenu, setShowCursorMenu] = useState(false);
  const cursorBtnRef = useRef<HTMLButtonElement>(null);
  const cursorMenuRef = useRef<HTMLDivElement>(null);
  const [cursorMenuPos, setCursorMenuPos] = useState({ left: 0, top: 0 });

  const asideRef = useRef<HTMLElement>(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleMainClick(groupId: string) {
    if (groupId === 'cursor') {
      setLocalToolType(null);
      onToolChange?.(null);
      return;
    }
    if (groupId === 'bin') {
      const toolType = subToolMap[groupId];
      if (toolType === 'remove-all') {
        onBinAction?.();
        setLocalToolType(null);
        onToolChange?.(null);
      } else {
        setLocalToolType(toolType);
        onToolChange?.(toolType);
      }
      return;
    }
    const toolType = subToolMap[groupId];
    if (toolType) {
      setLocalToolType(toolType);
      onToolChange?.(toolType);
    }
  }

  function handleContextMenu(e: React.MouseEvent, groupId: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopupMenu({ groupId, left: rect.right + 6, top: rect.top });
  }

  function handleSubToolSelect(groupId: string, toolType: string) {
    setSubToolMap((prev) => ({ ...prev, [groupId]: toolType }));
    setPopupMenu(null);
    if (groupId === 'bin' && toolType === 'remove-all') {
      setLocalToolType(null);
      onToolChange?.(null);
      onBinAction?.();
    } else {
      setLocalToolType(toolType);
      onToolChange?.(toolType);
    }
  }

  function isGroupActive(groupId: string): boolean {
    if (groupId === 'cursor') return activeToolType === null;
    if (groupId === 'bin') return activeToolType === 'eraser';
    if (activeToolType === null) return false;
    const group = TOOL_GROUPS.find((g) => g.id === groupId);
    if (!group) return false;
    return group.categories.some((cat) => cat.tools.some((t) => t.id === activeToolType));
  }

  // ── Click-outside: generic popup ────────────────────────────────────────
  const handleMousedown = useCallback((e: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
      setPopupMenu(null);
    }
  }, []);

  useEffect(() => {
    if (popupMenu) {
      document.addEventListener('mousedown', handleMousedown);
    }
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [popupMenu, handleMousedown]);

  // ── Click-outside: cursor menu ──────────────────────────────────────────
  const handleCursorMousedown = useCallback((e: MouseEvent) => {
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
      document.addEventListener('mousedown', handleCursorMousedown);
    }
    return () => document.removeEventListener('mousedown', handleCursorMousedown);
  }, [showCursorMenu, handleCursorMousedown]);

  // ── Cursor handlers ─────────────────────────────────────────────────────
  function handleCursorContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = cursorBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setCursorMenuPos({ left: rect.right + 6, top: rect.top });
    }
    setShowCursorMenu((v) => !v);
  }

  function handleCursorVariantSelect(id: CursorVariantId) {
    setLocalCursorVariant(id);
    setLocalToolType(null);
    setShowCursorMenu(false);
    onCursorVariantChange?.(id);
    onToolChange?.(null);
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────
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

  // ── Get the active group for popup menu ─────────────────────────────────
  const activePopupGroup = popupMenu
    ? popupMenu.groupId === 'bin'
      ? {
          id: 'bin',
          icon: Trash2,
          label: 'Remove All',
          categories: [{ label: 'Tools', tools: BIN_TOOLS }],
        }
      : TOOL_GROUPS.find((g) => g.id === popupMenu.groupId)
    : null;

  const zoomActive = activeToolType === 'zoom-in';

  return (
    <aside
      ref={asideRef}
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/6 py-2 overflow-y-auto"
      style={{ background: bg.page }}
    >
      {MAIN_BUTTONS.map((tool, i) => {
        if (tool === null) {
          return <div key={`sep-${i}`} className="toolbar-divider" />;
        }

        const Icon = tool.icon;
        const toolActive = isGroupActive(tool.id);
        const isCursor = tool.id === 'cursor';

        // ── Cursor tool ──────────────────────────────────────────────────
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
                setLocalToolType(null);
                onToolChange?.(null);
              }}
              onContextMenu={handleCursorContextMenu}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`toolbar-btn focus-ring${toolActive ? ' active' : ''}`}
            >
              {toolActive && (
                <motion.span
                  layoutId="toolbar-active"
                  className="absolute inset-0 rounded"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <CursorIcon size={24} />
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleCursorContextMenu(e);
                }}
                className="absolute bottom-0.5 right-0.5 z-10 cursor-pointer"
                aria-label="Change cursor style"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleCursorContextMenu(e as never);
                }}
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid currentColor',
                  opacity: 0.6,
                  background: 'none',
                  padding: 0,
                }}
              />
            </motion.button>
          );
        }

        // ── Drawing tool groups ──────────────────────────────────────────
        const hasSubmenu = TOOL_GROUPS.some((g) => g.id === tool.id) || tool.id === 'bin';

        // Show the selected subtool's icon in the toolbar
        const selectedToolId = subToolMap[tool.id];
        const selectedToolDef = selectedToolId
          ? tool.id === 'bin'
            ? (BIN_TOOLS.find((t) => t.id === selectedToolId) ?? null)
            : (TOOL_GROUPS.find((g) => g.id === tool.id)
                ?.categories.flatMap((c) => c.tools)
                .find((t) => t.id === selectedToolId) ?? null)
          : null;
        const SelectedIcon = selectedToolDef ? TOOL_ICONS[selectedToolDef.id] : null;
        const toolLabel = selectedToolDef?.label ?? tool.label;
        const showToolIcon = SelectedIcon != null;

        return (
          <motion.button
            key={tool.id}
            data-tooltip={toolLabel}
            aria-label={toolLabel}
            onClick={() => handleMainClick(tool.id)}
            onContextMenu={(e) => hasSubmenu && handleContextMenu(e, tool.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={`toolbar-btn focus-ring${toolActive ? ' active' : ''}`}
          >
            {toolActive && (
              <motion.span
                layoutId="toolbar-active"
                className="absolute inset-0 rounded"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            {showToolIcon ? (
              <span className="relative z-10 flex items-center justify-center w-full">
                <SelectedIcon size={22} />
              </span>
            ) : (
              <Icon className="relative z-10 h-6 w-6" strokeWidth={1} />
            )}
            {hasSubmenu && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const parent = (e.currentTarget as HTMLElement).parentElement;
                  if (parent) {
                    const rect = parent.getBoundingClientRect();
                    setPopupMenu({ groupId: tool.id, left: rect.right + 6, top: rect.top });
                  }
                }}
                className="absolute bottom-0.5 right-0.5 z-10 cursor-pointer"
                aria-label={`${toolLabel} tools`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    if (parent) {
                      const rect = parent.getBoundingClientRect();
                      setPopupMenu({ groupId: tool.id, left: rect.right + 6, top: rect.top });
                    }
                  }
                }}
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid currentColor',
                  opacity: 0.6,
                  background: 'none',
                  padding: 0,
                }}
              />
            )}
          </motion.button>
        );
      })}

      <div className="toolbar-divider" />
      <motion.button
        data-tooltip="Zoom in"
        aria-label="Zoom in"
        onClick={() => {
          if (zoomActive) {
            setLocalToolType(null);
            onToolChange?.(null);
          } else {
            setLocalToolType('zoom-in');
            onToolChange?.('zoom-in');
          }
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`toolbar-btn focus-ring${zoomActive ? ' active' : ''}`}
      >
        {zoomActive && (
          <motion.span
            layoutId="toolbar-active"
            className="absolute inset-0 rounded"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        <ZoomIn className="relative z-10" size={24} strokeWidth={1} />
      </motion.button>
      <motion.button
        data-tooltip="Zoom out"
        aria-label="Zoom out"
        onClick={onZoomOut}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="toolbar-btn"
      >
        <ZoomOut size={24} strokeWidth={1} />
      </motion.button>

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
              left: cursorMenuPos.left,
              top: cursorMenuPos.top,
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
                      strokeWidth={1}
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

      {/* ── Generic tool group popup menu ──────────────────────────────── */}
      <AnimatePresence>
        {popupMenu && activePopupGroup && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 overflow-hidden rounded-md border border-white/8 py-1 shadow-xl"
            style={{
              left: popupMenu.left,
              top: popupMenu.top,
              background: bg.panel,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            {activePopupGroup.categories.map((cat, ci) => (
              <div key={`cat-${ci}`}>
                {ci > 0 && (
                  <div
                    className="mx-2 my-1 h-px rounded-full"
                    style={{ background: `color-mix(in srgb, ${color.white} 8%, transparent)` }}
                  />
                )}
                <div
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: `${color.muted}80` }}
                >
                  {cat.label}
                </div>
                {cat.tools.map((toolDef) => {
                  const isSelected = activeToolType === toolDef.id;
                  const ToolIcon = toolDef.id === 'remove-all' ? Trash2 : TOOL_ICONS[toolDef.id];
                  return (
                    <button
                      key={toolDef.id}
                      onClick={() => handleSubToolSelect(activePopupGroup.id, toolDef.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
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
                      {toolDef.id === 'remove-all' ? (
                        <Trash2 size={16} strokeWidth={1} />
                      ) : ToolIcon ? (
                        <ToolIcon size={16} />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="flex-1 text-xs font-medium">{toolDef.label}</span>
                      {isSelected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
