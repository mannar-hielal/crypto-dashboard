import { describe, expect, it } from 'vitest';
import {
  daySeconds,
  frozenCount,
  markersUpTo,
  sceneEndMs,
  toBars,
  pricePrecision,
} from '@/guide/lessonChartData';
import type { ChartScene } from '@/guide/lessons';

const scene: ChartScene = {
  symbol: 'BTCUSDT',
  end: '2024-01-12',
  bars: 3,
  markers: [{ date: '2024-01-11', text: 'x', position: 'above' }],
  freezeAt: '2024-01-11',
  label: 'l',
  fallback: 'etf',
};
const bars = toBars(
  ['2024-01-10', '2024-01-11', '2024-01-12'].map((d) => ({
    timestamp: Date.parse(`${d}T00:00:00Z`),
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
  }))
);

describe('lessonChartData', () => {
  it('should turn dates and candles into chart time (UTC seconds)', () => {
    expect(daySeconds('2024-01-10')).toBe(Date.UTC(2024, 0, 10) / 1000);
    expect(sceneEndMs(scene)).toBe(Date.UTC(2024, 0, 12));
    expect(bars[0]).toEqual({
      time: Date.UTC(2024, 0, 10) / 1000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
    });
  });

  it('should freeze on the freeze day, or show everything without one', () => {
    expect(frozenCount(bars, scene)).toBe(2);
    expect(frozenCount(bars, { ...scene, freezeAt: undefined })).toBe(3);
    // A freeze day before the data: show it all rather than nothing
    expect(frozenCount(bars, { ...scene, freezeAt: '2020-01-01' })).toBe(3);
  });

  it('should show only the markers on candles already drawn', () => {
    expect(markersUpTo(scene.markers, undefined)).toEqual([]);
    expect(markersUpTo(scene.markers, bars[0].time)).toEqual([]);
    expect(markersUpTo(scene.markers, bars[1].time)).toHaveLength(1);
  });

  it('should give prices the decimals their level needs (never $0.00 for a sub-cent coin)', () => {
    expect(pricePrecision(57_459)).toBe(0);
    expect(pricePrecision(182.57)).toBe(2);
    expect(pricePrecision(0.5)).toBe(4); // $0.5000
    expect(pricePrecision(0.00002)).toBe(8);
  });
});
