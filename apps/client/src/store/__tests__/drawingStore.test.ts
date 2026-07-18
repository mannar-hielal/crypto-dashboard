/**
 * drawingStore tests
 *
 * Tests cover:
 *   - addDrawing: factory defaults (color, lineWidth, lineStyle, etc.)
 *   - addDrawing: shape is passed through correctly
 *   - updateDrawing: partial merge including nested shape
 *   - removeDrawing: removes + clears selectedDrawingId if matching
 *   - selectDrawing: sets selectedDrawingId
 *   - clearAll: resets everything
 *   - moveDrawing: z-index reordering (front/back/forward/backward)
 *   - cloneDrawing: shape points offset + unlocked + new id/zIndex
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '../drawingStore';
import type { DrawingPoint } from '@/lib/drawing/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePoint(price: number, time = 1000): DrawingPoint {
  return { time: time as DrawingPoint['time'], price };
}

function makeTrendlineShape() {
  return {
    type: 'trendline' as const,
    points: [makePoint(100, 1000), makePoint(200, 2000)],
  };
}

function makeHorizontalShape() {
  return {
    type: 'horizontal' as const,
    points: [makePoint(150, 1000)],
  };
}

function makeVerticalShape() {
  return {
    type: 'vertical' as const,
    points: [makePoint(100, 5000)],
  };
}

function makeRayShape() {
  return {
    type: 'ray' as const,
    points: [makePoint(100, 1000), makePoint(200, 2000)],
  };
}

function makeParallelShape() {
  return {
    type: 'parallel' as const,
    points: [makePoint(100, 1000), makePoint(200, 2000), makePoint(150, 3000)],
  };
}

function makePolylineShape() {
  return {
    type: 'polyline' as const,
    points: [makePoint(100, 1000), makePoint(200, 2000), makePoint(150, 3000)],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('drawingStore', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      drawings: [],
      selectedDrawingId: null,
      nextZIndex: 1,
    });
  });

  // ── addDrawing ─────────────────────────────────────────────────────────────

  describe('addDrawing', () => {
    it('creates a drawing with factory default style', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeTrendlineShape(),
      });

      const drawing = useDrawingStore.getState().drawings[0]!;
      expect(drawing.id).toBe(id);
      expect(drawing.color).toBe('#2196f3');
      expect(drawing.textColor).toBe('#fcfcfd'); // P6 — DEFAULT_TEXT_COLOR switched to tokens.color.white
      expect(drawing.lineWidth).toBe(2);
      expect(drawing.lineStyle).toBe('solid');
      expect(drawing.isLocked).toBe(false);
      // P6 annotation style defaults
      expect(drawing.fontSize).toBe(14);
      expect(drawing.backgroundColor).toBe('#25234e');
    });

    it('allows overriding default style', () => {
      useDrawingStore.getState().addDrawing({
        shape: makeTrendlineShape(),
        color: '#ff0000',
        lineWidth: 4,
        lineStyle: 'dotted',
      });

      const drawing = useDrawingStore.getState().drawings[0]!;
      expect(drawing.color).toBe('#ff0000');
      expect(drawing.lineWidth).toBe(4);
      expect(drawing.lineStyle).toBe('dotted');
    });

    it('passes shape through unchanged', () => {
      const shape = makeTrendlineShape();
      useDrawingStore.getState().addDrawing({ shape });

      const drawing = useDrawingStore.getState().drawings[0]!;
      expect(drawing.shape).toEqual(shape);
    });

    it('auto-generates id and increments zIndex', () => {
      const id1 = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      const id2 = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });

      const drawings = useDrawingStore.getState().drawings;
      expect(drawings).toHaveLength(2);
      expect(drawings[0]!.id).toBe(id1);
      expect(drawings[1]!.id).toBe(id2);
      expect(drawings[0]!.zIndex).toBe(1);
      expect(drawings[1]!.zIndex).toBe(2);
      expect(useDrawingStore.getState().nextZIndex).toBe(3);
      expect(id1).not.toBe(id2);
    });
  });

  // ── updateDrawing ──────────────────────────────────────────────────────────

  describe('updateDrawing', () => {
    it('merges partial updates into an existing drawing', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().updateDrawing(id, { color: '#00ff00', isLocked: true });

      const drawing = useDrawingStore.getState().drawings[0]!;
      expect(drawing.color).toBe('#00ff00');
      expect(drawing.isLocked).toBe(true);
      expect(drawing.lineWidth).toBe(2); // unchanged
    });

    it('updates shape with a new points array', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      const drawing = useDrawingStore.getState().drawings[0]!;
      const newPoints = [makePoint(150), makePoint(250)];
      useDrawingStore.getState().updateDrawing(id, {
        shape: { ...drawing.shape, points: newPoints },
      });

      const updated = useDrawingStore.getState().drawings[0]!;
      expect(updated.shape.points).toEqual(newPoints);
    });

    it('is a no-op for non-existent id', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().updateDrawing('nonexistent', { color: '#000' });

      expect(useDrawingStore.getState().drawings).toHaveLength(1);
      expect(useDrawingStore.getState().drawings[0]!.color).toBe('#2196f3');
    });
  });

  // ── removeDrawing ──────────────────────────────────────────────────────────

  describe('removeDrawing', () => {
    it('removes the drawing from the array', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().removeDrawing(id);

      expect(useDrawingStore.getState().drawings).toHaveLength(0);
    });

    it('clears selectedDrawingId when the removed drawing was selected', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(id);
      useDrawingStore.getState().removeDrawing(id);

      expect(useDrawingStore.getState().selectedDrawingId).toBeNull();
    });

    it('keeps selectedDrawingId when a different drawing is removed', () => {
      const id1 = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      const id2 = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(id1);
      useDrawingStore.getState().removeDrawing(id2);

      expect(useDrawingStore.getState().selectedDrawingId).toBe(id1);
    });
  });

  // ── selectDrawing ──────────────────────────────────────────────────────────

  describe('selectDrawing', () => {
    it('sets selectedDrawingId', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(id);

      expect(useDrawingStore.getState().selectedDrawingId).toBe(id);
    });

    it('clears selection with null', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(id);
      useDrawingStore.getState().selectDrawing(null);

      expect(useDrawingStore.getState().selectedDrawingId).toBeNull();
    });
  });

  // ── clearAll ───────────────────────────────────────────────────────────────

  describe('clearAll', () => {
    it('resets drawings, selectedDrawingId, and nextZIndex', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(useDrawingStore.getState().drawings[0]!.id);

      useDrawingStore.getState().clearAll();

      expect(useDrawingStore.getState().drawings).toHaveLength(0);
      expect(useDrawingStore.getState().selectedDrawingId).toBeNull();
      expect(useDrawingStore.getState().nextZIndex).toBe(1);
    });
  });

  // ── moveDrawing ────────────────────────────────────────────────────────────

  describe('moveDrawing', () => {
    function setupThreeDrawings() {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() }));
      }
      return ids;
    }

    it('brings to front (last in sorted array = topmost z-order)', () => {
      const [id1] = setupThreeDrawings();

      useDrawingStore.getState().moveDrawing(id1, 'front');

      const drawings = useDrawingStore.getState().drawings;
      const sorted = [...drawings].sort((a, b) => a.zIndex - b.zIndex);
      expect(sorted[sorted.length - 1]!.id).toBe(id1);
    });

    it('sends to back', () => {
      const ids = setupThreeDrawings();
      const id3 = ids[2]!;

      useDrawingStore.getState().moveDrawing(id3, 'back');

      const sorted = [...useDrawingStore.getState().drawings].sort((a, b) => a.zIndex - b.zIndex);
      expect(sorted[0]!.id).toBe(id3);
    });

    it('brings forward by one position', () => {
      const [id1] = setupThreeDrawings();

      useDrawingStore.getState().moveDrawing(id1, 'forward');

      const sorted = [...useDrawingStore.getState().drawings].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((d) => d.id === id1);
      expect(idx).toBe(1);
    });

    it('sends backward by one position', () => {
      const ids = setupThreeDrawings();
      const id3 = ids[2]!;

      useDrawingStore.getState().moveDrawing(id3, 'backward');

      const sorted = [...useDrawingStore.getState().drawings].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((d) => d.id === id3);
      expect(idx).toBe(1);
    });

    it('is a no-op for non-existent id', () => {
      setupThreeDrawings();
      const before = [...useDrawingStore.getState().drawings];

      useDrawingStore.getState().moveDrawing('nonexistent', 'front');

      expect(useDrawingStore.getState().drawings).toEqual(before);
    });

    it('is a no-op when already at the requested extreme', () => {
      const [id1] = setupThreeDrawings();

      useDrawingStore.getState().moveDrawing(id1, 'backward');

      const sorted = [...useDrawingStore.getState().drawings].sort((a, b) => a.zIndex - b.zIndex);
      expect(sorted[0]!.id).toBe(id1);
    });
  });

  // ── cloneDrawing ──────────────────────────────────────────────────────────

  describe('cloneDrawing', () => {
    it('creates a copy with new id and incremented zIndex', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeTrendlineShape(),
        color: '#abc',
      });
      const originalNextZ = useDrawingStore.getState().nextZIndex;

      useDrawingStore.getState().cloneDrawing(id);

      const drawings = useDrawingStore.getState().drawings;
      expect(drawings).toHaveLength(2);
      const clone = drawings[1]!;
      expect(clone.id).not.toBe(id);
      expect(clone.zIndex).toBe(originalNextZ);
      expect(clone.color).toBe('#abc'); // inherited
    });

    it('applies price offset to all shape points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: {
          type: 'trendline',
          points: [makePoint(100, 1000), makePoint(200, 2000)],
        },
      });

      useDrawingStore.getState().cloneDrawing(id, 50);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.points[0]!.price).toBe(150);
      expect(clone.shape.points[1]!.price).toBe(250);
    });

    it('preserves point times when applying price offset', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: {
          type: 'trendline',
          points: [makePoint(100, 5000), makePoint(200, 6000)],
        },
      });

      useDrawingStore.getState().cloneDrawing(id, 10);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.points[0]!.time).toBe(5000 as DrawingPoint['time']);
      expect(clone.shape.points[1]!.time).toBe(6000 as DrawingPoint['time']);
    });

    it('forces isLocked to false on the clone', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().updateDrawing(id, { isLocked: true });

      useDrawingStore.getState().cloneDrawing(id);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.isLocked).toBe(false);
    });

    it('clones without price offset (prices unchanged)', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeTrendlineShape(),
      });

      useDrawingStore.getState().cloneDrawing(id);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.points[0]!.price).toBe(100);
      expect(clone.shape.points[1]!.price).toBe(200);
    });

    it('is a no-op for non-existent id', () => {
      useDrawingStore.getState().cloneDrawing('nonexistent');

      expect(useDrawingStore.getState().drawings).toHaveLength(0);
    });
  });

  // ── undo / redo ────────────────────────────────────────────────────────

  describe('undo / redo', () => {
    it('undo reverts the last addDrawing', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      expect(useDrawingStore.getState().drawings).toHaveLength(1);

      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(0);
    });

    it('redo re-applies the undone action', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(0);

      useDrawingStore.getState().redo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    it('redo is a no-op when redo stack is empty', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().redo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    it('undo is a no-op when undo stack is empty', () => {
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(0);
    });

    it('new action clears the redo stack', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().redoStack).toHaveLength(1);

      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      expect(useDrawingStore.getState().redoStack).toHaveLength(0);
    });

    it('undo clears selectedDrawingId', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().selectDrawing(id);
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().selectedDrawingId).toBeNull();
    });

    it('undo reverts removeDrawing', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().removeDrawing(id);
      expect(useDrawingStore.getState().drawings).toHaveLength(0);

      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    it('undo reverts clearAll', () => {
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().clearAll();
      expect(useDrawingStore.getState().drawings).toHaveLength(0);

      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(2);
    });

    it('undo stack respects depth limit of 50', () => {
      for (let i = 0; i < 55; i++) {
        useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      }
      expect(useDrawingStore.getState().undoStack).toHaveLength(50);
    });

    it('undo reverts cloneDrawing', () => {
      const id = useDrawingStore.getState().addDrawing({ shape: makeTrendlineShape() });
      useDrawingStore.getState().cloneDrawing(id, 50);
      expect(useDrawingStore.getState().drawings).toHaveLength(2);

      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });
  });

  // ── Per-shape: horizontal, vertical, ray ────────────────────────────────

  describe('horizontal / vertical / ray shapes', () => {
    it('stores horizontal shape with a single anchor point', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeHorizontalShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.shape.type).toBe('horizontal');
      expect(drawing.shape.points).toHaveLength(1);
    });

    it('stores vertical shape with a single anchor point', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeVerticalShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.shape.type).toBe('vertical');
      expect(drawing.shape.points).toHaveLength(1);
    });

    it('stores ray shape with two anchor points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeRayShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.shape.type).toBe('ray');
      expect(drawing.shape.points).toHaveLength(2);
    });

    it('cloneDrawing offsets horizontal line single point', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeHorizontalShape(),
      });
      useDrawingStore.getState().cloneDrawing(id, 25);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('horizontal');
      expect(clone.shape.points).toHaveLength(1);
      expect(clone.shape.points[0]!.price).toBe(175); // 150 + 25
      expect(clone.shape.points[0]!.time).toBe(1000 as DrawingPoint['time']);
    });

    it('cloneDrawing offsets vertical line single point (price irrelevant but still offset)', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeVerticalShape(),
      });
      useDrawingStore.getState().cloneDrawing(id, 25);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('vertical');
      expect(clone.shape.points).toHaveLength(1);
      // vertical line uses price[0] for hit-detection, but clone offsets the price
      // The TIME (the axis the line sits on) is preserved — that's the important part
      expect(clone.shape.points[0]!.time).toBe(5000 as DrawingPoint['time']);
    });

    it('cloneDrawing offsets both ray points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeRayShape(),
      });
      useDrawingStore.getState().cloneDrawing(id, 50);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('ray');
      expect(clone.shape.points[0]!.price).toBe(150);
      expect(clone.shape.points[1]!.price).toBe(250);
      expect(clone.shape.points[0]!.time).toBe(1000 as DrawingPoint['time']);
      expect(clone.shape.points[1]!.time).toBe(2000 as DrawingPoint['time']);
    });

    it('updateDrawing preserves shape type when only updating one point', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeHorizontalShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      const newPoint = makePoint(500, 2000);
      useDrawingStore.getState().updateDrawing(id, {
        shape: { ...drawing.shape, points: [newPoint] },
      });
      const updated = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(updated.shape.type).toBe('horizontal');
      expect(updated.shape.points[0]!.price).toBe(500);
    });

    it('stores parallel shape with three anchor points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeParallelShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.shape.type).toBe('parallel');
      expect(drawing.shape.points).toHaveLength(3);
    });

    it('cloneDrawing offsets all three parallel points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeParallelShape(),
      });
      useDrawingStore.getState().cloneDrawing(id, 50);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('parallel');
      expect(clone.shape.points[0]!.price).toBe(150);
      expect(clone.shape.points[1]!.price).toBe(250);
      expect(clone.shape.points[2]!.price).toBe(200);
      // Times preserved
      expect(clone.shape.points[0]!.time).toBe(1000 as DrawingPoint['time']);
      expect(clone.shape.points[1]!.time).toBe(2000 as DrawingPoint['time']);
      expect(clone.shape.points[2]!.time).toBe(3000 as DrawingPoint['time']);
    });

    it('stores polyline shape with N anchor points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makePolylineShape(),
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.shape.type).toBe('polyline');
      expect(drawing.shape.points).toHaveLength(3);
    });

    it('cloneDrawing offsets all polyline points', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makePolylineShape(),
      });
      useDrawingStore.getState().cloneDrawing(id, 50);

      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('polyline');
      expect(clone.shape.points[0]!.price).toBe(150);
      expect(clone.shape.points[1]!.price).toBe(250);
      expect(clone.shape.points[2]!.price).toBe(200);
      expect(clone.shape.points[0]!.time).toBe(1000 as DrawingPoint['time']);
      expect(clone.shape.points[1]!.time).toBe(2000 as DrawingPoint['time']);
      expect(clone.shape.points[2]!.time).toBe(3000 as DrawingPoint['time']);
    });
  });

  // ── P6 — text & notes shapes ─────────────────────────────────────────

  describe('P6 text & notes shapes', () => {
    function makeTextNoteShape(type: 'text' | 'note' | 'callout' | 'priceNote' | 'priceLabel') {
      return {
        type,
        points: [makePoint(100, 1000)],
      };
    }

    it.each(['text', 'note', 'callout', 'priceNote', 'priceLabel'] as const)(
      'stores %s shape with one anchor point and default annotation style',
      (type) => {
        const id = useDrawingStore.getState().addDrawing({ shape: makeTextNoteShape(type) });
        const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
        expect(drawing.shape.type).toBe(type);
        expect(drawing.shape.points).toHaveLength(1);
        // P6 default annotation style backfilled by factory
        expect(drawing.fontSize).toBe(14);
        expect(drawing.backgroundColor).toBe('#25234e');
      }
    );

    it('preserves user-provided fontSize + backgroundColor overrides', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeTextNoteShape('note'),
        fontSize: 20,
        backgroundColor: '#0a0a0a',
      });
      const drawing = useDrawingStore.getState().drawings.find((d) => d.id === id)!;
      expect(drawing.fontSize).toBe(20);
      expect(drawing.backgroundColor).toBe('#0a0a0a');
    });

    it('cloneDrawing offsets the single anchor for note/callout/text shapes', () => {
      const id = useDrawingStore.getState().addDrawing({
        shape: makeTextNoteShape('callout'),
      });
      useDrawingStore.getState().cloneDrawing(id, 50);
      const clone = useDrawingStore.getState().drawings[1]!;
      expect(clone.shape.type).toBe('callout');
      expect(clone.shape.points[0]!.price).toBe(150);
      expect(clone.shape.points[0]!.time).toBe(1000 as DrawingPoint['time']);
      // Lock state always fresh on a clone
      expect(clone.isLocked).toBe(false);
    });
  });
});
