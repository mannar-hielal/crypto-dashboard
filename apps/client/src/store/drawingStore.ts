// ─── Drawing store (Zustand + persist) ──────────────────────────────
// Drawings survive page refresh via localStorage ("cd-drawings" key).
// selectedDrawingId is intentionally excluded from persistence so that
// no drawing remains selected after a cold load.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Drawing } from '@/lib/drawing/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface DrawingStoreState {
  drawings: Drawing[];
  selectedDrawingId: string | null;
  nextZIndex: number;
}

export interface DrawingStoreActions {
  addDrawing: (d: Omit<Drawing, 'id' | 'zIndex'>) => string;
  updateDrawing: (id: string, updates: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  selectDrawing: (id: string | null) => void;
  clearAll: () => void;
  moveDrawing: (id: string, dir: 'front' | 'forward' | 'back' | 'backward') => void;
  cloneDrawing: (id: string, priceOffset?: number) => void;
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
        const drawing: Drawing = { ...d, id, zIndex };
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
        const clone: Drawing = {
          ...drawing,
          id: crypto.randomUUID(),
          zIndex,
          points: drawing.points.map((p) => ({
            ...p,
            price: priceOffset ? p.price + priceOffset : p.price,
          })),
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
      version: 1,
      partialize: ({ drawings, nextZIndex }) => ({ drawings, nextZIndex }),
    }
  )
);
