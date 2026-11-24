import type { FeatureShot } from '@/lib/landingContent';
import timeframes from '@/assets/landing/feat-timeframes.webp';
import indicators from '@/assets/landing/feat-indicators.webp';
import drawing from '@/assets/landing/feat-drawing.webp';
import layouts from '@/assets/landing/feat-layout-menu.webp';
import live from '@/assets/landing/feat-live.webp';
import desk from '@/assets/landing/shot-desk.webp';

/**
 * Real captures of the app's chart (Playwright, 2026-11-22), cropped, 720 px wide WebP, and the practice
 * desk (1100 px). Their sizes are the images' own, so a card never jumps while its picture loads.
 */
export const SHOTS: Record<FeatureShot | 'desk', { src: string; width: number; height: number }> = {
  timeframes: { src: timeframes, width: 720, height: 655 },
  indicators: { src: indicators, width: 720, height: 506 },
  drawing: { src: drawing, width: 720, height: 582 },
  layouts: { src: layouts, width: 720, height: 480 },
  live: { src: live, width: 720, height: 297 },
  desk: { src: desk, width: 1100, height: 657 },
};
