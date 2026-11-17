/**
 * Loads a lesson chart's history (guide/LessonChart.tsx), once per scene for the whole visit: the
 * ETF card and the question after it share one request. A failed load is forgotten, so a later
 * visit tries again.
 */

import { marketApi } from '@crypto-dashboard/sdk';
import { sceneEndMs, toBars, type LessonBar } from './lessonChartData';
import type { ChartScene } from './lessons';

/** Scenes are a handful of fixed lesson charts; the cache never holds more than this */
const CACHE_MAX = 16;

const cache = new Map<string, Promise<LessonBar[]>>();

export function loadScene(scene: ChartScene): Promise<LessonBar[]> {
  // A scene reads the USDT perpetual unless it asks for spot (its text quotes spot prices)
  const category = scene.category ?? 'linear';
  const key = `${category}:${scene.symbol}:${scene.end}:${scene.bars}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_MAX) cache.clear();
  const promise = marketApi
    .getCandles(scene.symbol, '1d', scene.bars, category, sceneEndMs(scene))
    .then((r) => toBars(r.candles))
    .catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, promise);
  return promise;
}

/** Test seam: forget what was loaded */
export function clearLessonChartCache(): void {
  cache.clear();
}
