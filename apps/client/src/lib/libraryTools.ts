import type { ElementType } from 'react';
import { TrendingUp, GitBranch, Shapes, Type, Ruler } from 'lucide-react';

export interface ToolDef {
  id: string;
  label: string;
}

export interface ToolCategory {
  label: string;
  tools: ToolDef[];
}

export interface ToolGroup {
  id: string;
  icon: ElementType;
  label: string;
  categories: ToolCategory[];
}

/** TradingView's order: trend lines, Fib & Gann, forecast & measure, shapes, text & notes */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'trend-lines',
    icon: TrendingUp,
    label: 'Trend Lines',
    categories: [
      {
        label: 'Lines',
        tools: [
          { id: 'trend-line', label: 'Trend Line' },
          { id: 'ray', label: 'Ray' },
          { id: 'info-line', label: 'Info Line' },
          { id: 'extended-line', label: 'Extended Line' },
          { id: 'trend-angle', label: 'Trend Angle' },
          { id: 'horizontal-line', label: 'Horizontal Line' },
          { id: 'horizontal-ray', label: 'Horizontal Ray' },
          { id: 'vertical-line', label: 'Vertical Line' },
          { id: 'cross-line', label: 'Cross Line' },
        ],
      },
      {
        label: 'Channels',
        tools: [
          { id: 'parallel-channel', label: 'Parallel Channel' },
          { id: 'regression-trend', label: 'Regression Trend' },
          { id: 'flat-top-bottom', label: 'Flat Top/Bottom' },
          { id: 'disjoint-channel', label: 'Disjoint Channel' },
        ],
      },
      {
        label: 'Pitchforks',
        tools: [
          { id: 'pitchfork', label: 'Pitchfork' },
          { id: 'schiff-pitchfork', label: 'Schiff Pitchfork' },
          { id: 'modified-schiff-pitchfork', label: 'Modified Schiff Pitchfork' },
          { id: 'inside-pitchfork', label: 'Inside Pitchfork' },
        ],
      },
    ],
  },
  {
    id: 'fib-gann',
    icon: GitBranch,
    label: 'Fib & Gann',
    categories: [
      {
        label: 'Fibonacci',
        tools: [
          { id: 'fib-retracement', label: 'Fib Retracement' },
          { id: 'trend-based-fib-extension', label: 'Trend-Based Fib Extension' },
          { id: 'fib-channel', label: 'Fib Channel' },
          { id: 'fib-time-zone', label: 'Fib Time Zone' },
          { id: 'fib-speed-resistance-fan', label: 'Fib Speed Resistance Fan' },
          { id: 'trend-based-fib-time', label: 'Trend-Based Fib Time' },
          { id: 'fib-circles', label: 'Fib Circles' },
          { id: 'fib-spiral', label: 'Fib Spiral' },
          { id: 'fib-speed-resistance-arcs', label: 'Fib Speed Resistance Arcs' },
          { id: 'fib-wedge', label: 'Fib Wedge' },
          { id: 'pitchfan', label: 'Pitchfan' },
        ],
      },
      {
        label: 'Gann',
        tools: [
          { id: 'gann-box', label: 'Gann Box' },
          { id: 'gann-square-fixed', label: 'Gann Square Fixed' },
          { id: 'gann-square', label: 'Gann Square' },
          { id: 'gann-fan', label: 'Gann Fan' },
        ],
      },
    ],
  },
  {
    id: 'measure',
    icon: Ruler,
    label: 'Forecast & Measure',
    categories: [
      {
        label: 'Projection',
        tools: [
          { id: 'long-position', label: 'Long Position' },
          { id: 'short-position', label: 'Short Position' },
          { id: 'position-forecast', label: 'Forecast' },
          { id: 'bar-pattern', label: 'Bars Pattern' },
          { id: 'sector', label: 'Projection' },
        ],
      },
      {
        label: 'Measurer',
        tools: [
          { id: 'price-range', label: 'Price Range' },
          { id: 'date-range', label: 'Date Range' },
          { id: 'date-and-price-range', label: 'Date and Price Range' },
        ],
      },
    ],
  },
  {
    id: 'shapes',
    icon: Shapes,
    label: 'Shapes',
    categories: [
      {
        label: 'Brushes',
        tools: [
          { id: 'brush', label: 'Brush' },
          { id: 'highlighter', label: 'Highlighter' },
        ],
      },
      {
        label: 'Arrows',
        tools: [
          { id: 'arrow', label: 'Arrow' },
          { id: 'arrow-marker', label: 'Arrow Marker' },
          { id: 'arrow-mark-up', label: 'Arrow Up' },
          { id: 'arrow-mark-down', label: 'Arrow Down' },
        ],
      },
      {
        label: 'Shapes',
        tools: [
          { id: 'rectangle', label: 'Rectangle' },
          { id: 'rotated-rectangle', label: 'Rotated Rectangle' },
          { id: 'circle', label: 'Circle' },
          { id: 'triangle', label: 'Triangle' },
          { id: 'ellipse', label: 'Ellipse' },
          { id: 'arc', label: 'Arc' },
          { id: 'path', label: 'Path' },
          { id: 'polyline', label: 'Polyline' },
          { id: 'curve', label: 'Curve' },
          { id: 'double-curve', label: 'Double Curve' },
        ],
      },
    ],
  },
  {
    id: 'annotations',
    icon: Type,
    label: 'Text & Notes',
    categories: [
      {
        label: 'Text & Notes',
        tools: [
          { id: 'text', label: 'Text' },
          { id: 'callout', label: 'Callout' },
          { id: 'note', label: 'Note' },
          { id: 'price-note', label: 'Price Note' },
          { id: 'price-label', label: 'Price Label' },
          { id: 'flag-mark', label: 'Flag Mark' },
          { id: 'pin', label: 'Pin' },
          { id: 'comment', label: 'Comment' },
          { id: 'signpost', label: 'Signpost' },
          { id: 'table', label: 'Table' },
        ],
      },
    ],
  },
];

export function getDefaultToolForGroup(groupId: string): string | null {
  const group = TOOL_GROUPS.find((g) => g.id === groupId);
  if (!group || group.categories.length === 0) return null;
  for (const cat of group.categories) {
    if (cat.tools.length > 0) return cat.tools[0]!.id;
  }
  return null;
}

export function findGroupByToolType(toolType: string): ToolGroup | undefined {
  return TOOL_GROUPS.find((g) =>
    g.categories.some((cat) => cat.tools.some((t) => t.id === toolType))
  );
}

// ─── The last tool used in each group (TradingView remembers it) ────────────

const SUB_TOOLS_KEY = 'cd-drawing-subtools';

/** Each group's first tool: what a group button arms before anything else was picked */
export function defaultSubTools(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of TOOL_GROUPS) {
    const first = getDefaultToolForGroup(g.id);
    if (first) map[g.id] = first;
  }
  return map;
}

/** The saved last tool per group, over the defaults; 🔐 entries naming an unknown group or a tool
 *  outside its group are dropped (localStorage is untrusted input) */
export function loadSubTools(): Record<string, string> {
  const map = defaultSubTools();
  try {
    const raw = JSON.parse(localStorage.getItem(SUB_TOOLS_KEY) ?? 'null') as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const g of TOOL_GROUPS) {
        const tool = (raw as Record<string, unknown>)[g.id];
        if (typeof tool === 'string' && findGroupByToolType(tool)?.id === g.id) map[g.id] = tool;
      }
    }
  } catch {
    // Blocked storage or bad JSON: the defaults
  }
  return map;
}

export function saveSubTools(map: Record<string, string>): void {
  try {
    localStorage.setItem(SUB_TOOLS_KEY, JSON.stringify(map));
  } catch {
    // Full or blocked storage: remembered for this session only
  }
}

/** A tool's menu name ("Trend Line"); a kind outside the menu reads as its id in words */
export function toolLabel(toolId: string): string {
  for (const g of TOOL_GROUPS) {
    for (const c of g.categories) {
      const t = c.tools.find((x) => x.id === toolId);
      if (t) return t.label;
    }
  }
  return toolId.replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
}
