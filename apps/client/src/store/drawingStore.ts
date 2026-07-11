// ─── Drawing store (Zustand + persist) ──────────────────────────────
// Drawings survive page refresh via localStorage ("cd-drawings" key).
// selectedDrawingId is intentionally excluded from persistence so that
// no drawing remains selected after a cold load.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Drawing, LineStyle, ShapeData } from '@/lib/drawing/types';

// ─── Default style constants ────────────────────────────────────────

const DEFAULT_COLOR = '#2196f3';
const DEFAULT_TEXT_COLOR = '#ffffff';
const DEFAULT_LINE_WIDTH = 2;
const DEFAULT_LINE_STYLE: LineStyle = 'solid';

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Style defaults for new drawings. Callers provide `shape` (the
 * shape-specific data with type + points) and may override any style
 * field. This centralises defaults so they're never scattered across
 * call sites.
 */
function createDrawingStyle(): Omit<Drawing, 'id' | 'zIndex' | 'shape'> {
  return {
    color: DEFAULT_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    lineStyle: DEFAULT_LINE_STYLE,
    isLocked: false,
  };
}

// ─── Types ─────────────────────────────────────────────────────────

export interface DrawingStoreState {
  drawings: Drawing[];
  selectedDrawingId: string | null;
  nextZIndex: number;
}

export interface DrawingStoreActions {
  addDrawing: (
    d: { shape: ShapeData } & Partial<Omit<Drawing, 'id' | 'zIndex' | 'shape'>>
  ) => string;
  updateDrawing: (id: string, updates: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  selectDrawing: (id: string | null) => void;
  clearAll: () => void;
  moveDrawing: (id: string, dir: 'front' | 'forward' | 'back' | 'backward') => void;
  cloneDrawing: (id: string, priceOffset?: number) => void;
}

// ─── Persist migration (v1 → v2) ────────────────────────────────────

/**
 * v1 schema: flat `{ type, points, color, ... }`
 * v2 schema: `{ shape: { type, points }, color, ... }`
 *
 * Every existing persisted drawing has `type: 'trendline'` so the
 * migration is a simple lift: move `type` + `points` into a `shape`
 * object, keep everything else.
 */
function migrateV1toV2(persisted: unknown): { drawings: Drawing[]; nextZIndex: number } {
  const old = persisted as {
    drawings: Array<Record<string, unknown> & { type: string; points: unknown[] }>;
    nextZIndex: number;
  };
  return {
    drawings: old.drawings.map((d) => {
      const { type, points, ...rest } = d;
      return { ...rest, shape: { type, points } } as Drawing;
    }),
    nextZIndex: old.nextZIndex,
  };
}

// ─── Store ─────────────────────────────────────────────────────────

export const useDrawingStore = create<DrawingStoreState & DrawingStoreActions>()(
  persist(
    (set, get) => ({
      drawings: [] as Drawing[],
      selectedDrawingId: null as string | null,
      nextZIndex: 1,

      addDrawing(d) {
        const id = crypto.randomUUID();
        const zIndex = get().nextZIndex;
        const drawing: Drawing = {
          ...createDrawingStyle(),
          ...d,
          id,
          zIndex,
        };
        set((s) => ({ drawings: [...s.drawings, drawing], nextZIndex: zIndex + 1 }));
        return id;
      },

      updateDrawing(id, updates) {
        set((s) => ({
          drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        }));
      },

      removeDrawing(id) {
        set((s) => ({
          drawings: s.drawings.filter((d) => d.id !== id),
          selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
        }));
      },

      selectDrawing(id) {
        set({ selectedDrawingId: id });
      },

      clearAll() {
        set({ drawings: [], selectedDrawingId: null, nextZIndex: 1 });
      },

      moveDrawing(id, dir) {
        set((s) => {
          const sorted = [...s.drawings].sort((a, b) => a.zIndex - b.zIndex);
          const idx = sorted.findIndex((d) => d.id === id);
          if (idx === -1) return s;
          let newIdx = idx;
          if (dir === 'front') newIdx = sorted.length - 1;
          else if (dir === 'back') newIdx = 0;
          else if (dir === 'forward') newIdx = Math.min(idx + 1, sorted.length - 1);
          else if (dir === 'backward') newIdx = Math.max(idx - 1, 0);

          if (newIdx === idx) return s;

          const [item] = sorted.splice(idx, 1);
          sorted.splice(newIdx, 0, item);

          return {
            drawings: sorted.map((d, i) => ({ ...d, zIndex: i + 1 })),
            nextZIndex: Math.max(s.nextZIndex, sorted.length + 1),
          };
        });
      },

      cloneDrawing(id, priceOffset) {
        const drawing = get().drawings.find((d) => d.id === id);
        if (!drawing) return;
        const zIndex = get().nextZIndex;
        const offsetPoints = drawing.shape.points.map((p) => ({
          ...p,
          price: priceOffset ? p.price + priceOffset : p.price,
        }));
        const clone: Drawing = {
          ...drawing,
          id: crypto.randomUUID(),
          zIndex,
          shape: { ...drawing.shape, points: offsetPoints },
          isLocked: false,
        };
        set((s) => ({
          drawings: [...s.drawings, clone],
          nextZIndex: zIndex + 1,
        }));
      },
    }),
    {
      name: 'cd-drawings',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) return migrateV1toV2(persisted);
        return persisted as { drawings: Drawing[]; nextZIndex: number };
      },
      partialize: ({ drawings, nextZIndex }) => ({ drawings, nextZIndex }),
    }
  )
);
