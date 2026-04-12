import { useState } from 'react';
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
export function LeftToolbar() {
  const [activeTool, setActiveTool] = useState('cursor');
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

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
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
          );
        }

        const Icon = tool.icon;
        const isActive = activeTool === tool.id;

        return (
          <motion.button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            onHoverStart={() => setHoveredTool(tool.id)}
            onHoverEnd={() => setHoveredTool(null)}
            title={tool.label}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="group relative flex h-8 w-8 items-center justify-center rounded"
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

            <Icon className="relative z-10 h-[15px] w-[15px]" />

            {/* Tooltip — framer-motion animated */}
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
    </aside>
  );
}
