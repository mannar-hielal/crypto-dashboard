/**
 * Saved drawings from library 0.1 → 0.4 (lib/drawingMigration.ts) and the one-time run on load
 * (lib/drawingManager.ts loadDrawings). The samples are real 0.1 saves from the app (2026-10-04,
 * fake feed), plus a text with a custom text (0.1 kept it in `options.text` when one was given).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findOverlaySpec } from 'lightweight-charts-drawing';
import {
  DROPPED_LEGACY_TYPES,
  convertLegacyDrawing,
  convertLegacyDrawings,
  legacyKindOf,
} from '@/lib/drawingMigration';
import { getLegacyPersistenceKey, getPersistenceKey, loadDrawings } from '@/lib/drawingManager';
import { TOOL_GROUPS } from '@/lib/libraryTools';

const STYLE_01 = {
  lineColor: '#2962FF',
  lineWidth: 2,
  lineDash: [],
  fillColor: 'rgba(41, 98, 255, 0.1)',
  fillOpacity: 0.1,
  showLabels: true,
  labelFont: '12px sans-serif',
  labelColor: '#2962FF',
};
const OPTIONS_01 = {
  visible: true,
  locked: false,
  zIndex: 0,
  extendLeft: false,
  extendRight: false,
};

const sample = (
  type: string,
  anchors: [number, number][],
  options: Record<string, unknown> = {}
) => ({
  id: `id-${type}`,
  type,
  anchors: anchors.map(([time, price]) => ({ time, price })),
  style: STYLE_01,
  options: { ...OPTIONS_01, ...options },
});

const TREND = sample(
  'trend-line',
  [
    [1791106320, 83076.13464306683],
    [1791108300, 83317.31118286565],
  ],
  { showAngle: false, showPriceChange: false, showPercentChange: false, showBars: false }
);
const HLINE = sample('horizontal-line', [[1791110280, 83377.60533578442]]);
const RECT = sample('rectangle', [
  [1791108780, 83166.57583650686],
  [1791110280, 83045.98756660745],
]);
const FIB = sample('fib-retracement', [
  [1791110760, 83015.84049014807],
  [1791112200, 83287.16410640629],
]);
const LONG = sample('long-position', [
  [1791112620, 83196.72291296624],
  [1791112620, 83136.42876004749],
  [1791113160, 83257.01706588501],
]);
const CHANNEL = sample('parallel-channel', [
  [1791105000, 83000],
  [1791106000, 83100],
  [1791106000, 83050],
]);
const TEXT = sample('text-annotation', [[1791107000, 83200]], { text: 'Breakout' });

describe('convertLegacyDrawing', () => {
  it('should convert a trend line with its points, colour and width', () => {
    const d = convertLegacyDrawing(TREND)!;
    expect(d.id).toBe('id-trend-line');
    expect(d.kind).toBe('trend-line');
    expect(d.points).toEqual([
      { time: 1791106320, price: 83076.13464306683 },
      { time: 1791108300, price: 83317.31118286565 },
    ]);
    expect(d.style.color).toBe('#2962ff');
    expect(d.style.width).toBe(2);
    expect(d.style.lineStyle).toBe('solid');
  });

  it('should convert a horizontal line', () => {
    const d = convertLegacyDrawing(HLINE)!;
    expect(d.kind).toBe('horizontal-line');
    expect(d.points).toEqual([{ time: 1791110280, price: 83377.60533578442 }]);
  });

  it('should convert a rectangle with its 0.1 fill colour and transparency', () => {
    const d = convertLegacyDrawing(RECT)!;
    expect(d.kind).toBe('rectangle');
    expect(d.points).toHaveLength(2);
    expect(d.style.color).toBe('#2962ff');
    expect(d.style.backgroundColor).toBe('#2962ff');
    expect(d.style.transparency).toBe(90);
  });

  it('should convert a Fib retracement and keep its level ladder', () => {
    const d = convertLegacyDrawing(FIB)!;
    expect(d.kind).toBe('fib-retracement');
    expect(d.points).toHaveLength(2);
    expect(d.style.levels?.length).toBeGreaterThan(5);
  });

  it('should convert a text with its custom text', () => {
    const d = convertLegacyDrawing(TEXT)!;
    expect(d.kind).toBe('text');
    expect(d.text).toBe('Breakout');
    expect(d.points).toEqual([{ time: 1791107000, price: 83200 }]);
  });

  it('should convert a long position: stop and target become distances, the box ends at the latest point', () => {
    const d = convertLegacyDrawing(LONG)!;
    expect(d.kind).toBe('long-position');
    expect(d.points).toEqual([
      { time: 1791112620, price: 83196.72291296624 },
      { time: 1791113160, price: 83196.72291296624 },
    ]);
    expect(d.style.stopLevel).toBeCloseTo(83196.72291296624 - 83136.42876004749, 6);
    expect(d.style.profitLevel).toBeCloseTo(83257.01706588501 - 83196.72291296624, 6);
    // Its own TradingView colours stay
    expect(d.style.stopColor).toBe('#f23645');
  });

  it('should re-anchor a parallel channel’s width point to the first point’s time', () => {
    const d = convertLegacyDrawing(CHANNEL)!;
    expect(d.points[2]).toEqual({ time: 1791105000, price: 82950 });
  });

  it('should rename the tools 0.4 renamed after TradingView', () => {
    expect(legacyKindOf('andrews-pitchfork')).toBe('pitchfork');
    expect(legacyKindOf('fib-extension')).toBe('trend-based-fib-extension');
    expect(legacyKindOf('date-price-range')).toBe('date-and-price-range');
    expect(legacyKindOf('anchored-text')).toBe('text');
    expect(legacyKindOf('note')).toBe('pin');
  });

  it('should carry the lock, the hidden state and a dashed line', () => {
    const d = convertLegacyDrawing({
      ...TREND,
      style: { ...STYLE_01, lineDash: [6, 4] },
      options: { ...OPTIONS_01, locked: true, visible: false },
    })!;
    expect(d.locked).toBe(true);
    expect(d.hidden).toBe(true);
    expect(d.style.lineStyle).toBe('dashed');
  });

  it('should skip the tools with no faithful 0.4 form, unknown tools and malformed entries', () => {
    for (const type of DROPPED_LEGACY_TYPES) {
      expect(
        convertLegacyDrawing(
          sample(type, [
            [1, 1],
            [2, 2],
            [3, 3],
          ])
        )
      ).toBeNull();
    }
    expect(convertLegacyDrawing(sample('no-such-tool', [[1, 1]]))).toBeNull();
    expect(convertLegacyDrawing({ id: 'x', type: 'trend-line' })).toBeNull();
    expect(convertLegacyDrawing({ ...TREND, anchors: [{ time: 1, price: 'high' }] })).toBeNull();
    // A wrong point count for the 0.4 kind
    expect(convertLegacyDrawing({ ...TREND, anchors: TREND.anchors.slice(0, 1) })).toBeNull();
  });

  it('should have a rule for every tool of 0.1 our menu offered', () => {
    const menu01 = [
      ...TOOL_GROUPS.flatMap((g) => g.categories.flatMap((c) => c.tools.map((t) => t.id))),
      // the 0.1 ids the menu used before this change
      'andrews-pitchfork',
      'fib-extension',
      'fib-speed-fan',
      'fib-time-extension',
      'fib-arcs',
      'text-annotation',
      'anchored-text',
      'forecast',
      'bars-pattern',
      'projection',
      'date-price-range',
    ];
    for (const id of menu01) {
      const kind = legacyKindOf(id);
      if (kind === null) continue;
      expect(findOverlaySpec(kind), id).toBeDefined();
    }
  });
});

describe('convertLegacyDrawings', () => {
  it('[10.7.9] should convert a whole saved set and skip what it can’t', () => {
    const out = convertLegacyDrawings([
      TREND,
      HLINE,
      RECT,
      FIB,
      TEXT,
      LONG,
      sample('arc', [
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
      'garbage',
    ]);
    expect(out.map((d) => d.kind)).toEqual([
      'trend-line',
      'horizontal-line',
      'rectangle',
      'fib-retracement',
      'text',
      'long-position',
    ]);
  });

  it('should return nothing for something that isn’t an array', () => {
    expect(convertLegacyDrawings({ not: 'an array' })).toEqual([]);
  });

  it('should migrate a 0.1 ellipse’s box corners to the 0.4 three-point model', () => {
    const [d] = convertLegacyDrawings([
      sample('ellipse', [
        [100, 10],
        [200, 20],
      ]),
    ]);
    expect(d!.points).toHaveLength(3);
  });
});

describe('loadDrawings — the one-time migration', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('[10.7.9] should convert the 0.1 key once, save it under the new key and leave the 0.1 key for a rollback', () => {
    const legacy = JSON.stringify([TREND, TEXT]);
    localStorage.setItem(getLegacyPersistenceKey('BTCUSDT'), legacy);
    const first = loadDrawings('BTCUSDT');
    expect(first.map((d) => d.kind)).toEqual(['trend-line', 'text']);
    expect(JSON.parse(localStorage.getItem(getPersistenceKey('BTCUSDT'))!)).toHaveLength(2);
    expect(localStorage.getItem(getLegacyPersistenceKey('BTCUSDT'))).toBe(legacy);

    // Later edits live under the new key: the 0.1 key is never read again
    localStorage.setItem(getPersistenceKey('BTCUSDT'), '[]');
    expect(loadDrawings('BTCUSDT')).toEqual([]);
  });

  it('should mark a symbol migrated even when nothing converts', () => {
    localStorage.setItem(getLegacyPersistenceKey('ETHUSDT'), '{broken');
    expect(loadDrawings('ETHUSDT')).toEqual([]);
    expect(localStorage.getItem(getPersistenceKey('ETHUSDT'))).toBe('[]');
  });
});
