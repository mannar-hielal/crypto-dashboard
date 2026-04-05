import { useState } from 'react';
import type { ElementType } from 'react';
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

  return (
    <aside className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/[0.08] bg-[#1a1d2e] py-2 overflow-y-auto">
      {TOOLS.map((tool, i) => {
        // Separator
        if (tool === null) {
          return <div key={`sep-${i}`} className="my-1 h-px w-6 rounded-full bg-white/[0.07]" />;
        }

        const Icon = tool.icon;
        const isActive = activeTool === tool.id;

        return (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
            className={`group relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              isActive
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <Icon className="h-[15px] w-[15px]" />

            {/* Tooltip — appears to the right on hover */}
            <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded bg-[#2a3249] px-2 py-1 text-[10px] font-medium text-slate-300 shadow-lg group-hover:block z-50">
              {tool.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
