import { useState, useRef, useEffect, useCallback } from 'react';
import type { ElementType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer2,
  Crosshair,
  TrendingUp,
  Minus,
  ArrowUpRight,
  Square,
  Triangle,
  Type,
  Pencil,
  Trash2,
} from 'lucide-react';
import { bg, color, fontSize } from '@/lib/tokens';
import { CURSOR_VARIANTS, type CursorVariantId } from '@/lib/cursors';

// ─── Tool definitions ─────────────────────────────────────────────────────────
// null = visual separator between groups

type Tool = {
  id: string;
  icon: ElementType;
  label: string;
} | null;

const TOOLS: Tool[] = [
  { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
  { id: 'crosshair', icon: Crosshair, label: 'Crosshair' },
  null,
  { id: 'trendline', icon: TrendingUp, label: 'Trend Line' },
  { id: 'hline', icon: Minus, label: 'Horizontal Line' },
  { id: 'ray', icon: ArrowUpRight, label: 'Ray' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'fib', icon: Triangle, label: 'Fibonacci' },
  null,
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'pencil', icon: Pencil, label: 'Freehand Draw' },
  null,
  { id: 'clear', icon: Trash2, label: 'Clear All' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface LeftToolbarProps {
  onCursorVariantChange?: (variant: CursorVariantId) => void;
}

export function LeftToolbar({ onCursorVariantChange }: LeftToolbarProps) {
  const [activeTool, setActiveTool] = useState('cursor');
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [cursorVariant, setCursorVariant] = useState<CursorVariantId>('cross');
  const [showCursorMenu, setShowCursorMenu] = useState(false);
  const cursorBtnRef = useRef<HTMLButtonElement>(null);
  const cursorMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });

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

  function handleCursorContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = cursorBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ left: rect.right + 6, top: rect.top });
    }
    setShowCursorMenu((v) => !v);
  }

  function handleCursorVariantSelect(id: CursorVariantId) {
    setCursorVariant(id);
    setActiveTool('cursor');
    setShowCursorMenu(false);
    onCursorVariantChange?.(id);
  }

  return (
    <aside
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

        // ── Cursor tool gets right-click popup + variant chevron ───────────
        if (isCursor) {
          return (
            <motion.button
              key={tool.id}
              ref={cursorBtnRef}
              onClick={() => setActiveTool('cursor')}
              onContextMenu={handleCursorContextMenu}
              onHoverStart={() => setHoveredTool(tool.id)}
              onHoverEnd={() => setHoveredTool(null)}
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

              {/* Tooltip */}
              <AnimatePresence>
                {hoveredTool === tool.id && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.12 }}
                    className="pointer-events-none absolute left-full ml-2.5 z-50 whitespace-nowrap rounded-md border border-white/8 px-2 py-1 font-semibold text-white/80 shadow-xl"
                    style={{ fontSize: fontSize.xs10, background: bg.surface }}
                  >
                    Cursor &middot; Right-click for variants
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        }

        // ── All other tools ─────────────────────────────────────────────
        return (
          <motion.button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            onHoverStart={() => setHoveredTool(tool.id)}
            onHoverEnd={() => setHoveredTool(null)}
            title={tool.label}
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

            {/* Tooltip */}
            <AnimatePresence>
              {hoveredTool === tool.id && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.12 }}
                  className="pointer-events-none absolute left-full ml-2.5 z-50 whitespace-nowrap rounded-md border border-white/8 px-2 py-1 font-semibold text-white/80 shadow-xl"
                  style={{ fontSize: fontSize.xs10, background: bg.surface }}
                >
                  {tool.label}
                </motion.span>
              )}
            </AnimatePresence>
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
    </aside>
  );
}
