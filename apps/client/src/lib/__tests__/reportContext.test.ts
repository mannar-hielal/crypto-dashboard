import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from '@/learn/pathStore';
import { useLayoutStore } from '@/store/layoutStore';
import { collectReportContext, describeReportContext } from '../reportContext';

const at = (path: string) => window.history.pushState({}, '', path);

describe('collectReportContext', () => {
  beforeEach(() => {
    useLessonStore.getState().reset();
    usePathStore.getState().reset();
    useTourStore.getState().reset();
    at('/');
  });

  it('should say a chart report is about the chart, with the symbol, interval and layout on screen', () => {
    at('/dashboard/usdt/ETHUSDT');
    const { panes, activePane, layout } = useLayoutStore.getState();
    const ctx = collectReportContext();
    expect(ctx.area).toBe('chart');
    expect(ctx.path).toBe('/dashboard/usdt/ETHUSDT');
    expect(ctx.symbol).toBe(panes[activePane].symbol);
    expect(ctx.interval).toBe(String(panes[activePane].interval));
    expect(ctx.layout).toBe(String(layout));
    expect(ctx.lessonId).toBeUndefined();
  });

  it('should say a report from inside a lesson is about learning, with the lesson and its screen', () => {
    at('/chart');
    useLessonStore.getState().start('lesson-01', 2);
    const ctx = collectReportContext();
    expect(ctx.area).toBe('learning');
    expect(ctx.lessonId).toBe('lesson-01');
    expect(ctx.lessonScreen).toBe(2);
  });

  it('should say a report from the open map is about learning, and one from a checkpoint names it', () => {
    at('/chart');
    useTourStore.getState().openPanel();
    expect(collectReportContext().area).toBe('learning');
    useTourStore.getState().reset();
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    expect(collectReportContext()).toMatchObject({
      area: 'learning',
      checkpointId: 'checkpoint-ch1',
    });
  });

  it('should leave the chart fields out on a page that is not the chart', () => {
    at('/how-it-works');
    const ctx = collectReportContext();
    expect(ctx.area).toBe('other');
    expect(ctx.symbol).toBeUndefined();
    expect(ctx.layout).toBeUndefined();
  });

  it('should carry the device, within the sizes the server takes', () => {
    const ctx = collectReportContext();
    expect(ctx.viewport).toMatch(/^\d+x\d+@[\d.]+$/);
    expect(ctx.viewport.length).toBeLessThanOrEqual(20);
    expect(ctx.userAgent.length).toBeLessThanOrEqual(300);
    expect(ctx.path.length).toBeLessThanOrEqual(200);
  });

  describe('the viewport, which the server takes at 20 characters', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([1, 1.5, 2, 3, 1.7999999523162842, 2.625, 0.8999999761581421])(
      'should fit for a pixel ratio of %s, even a long decimal',
      (ratio) => {
        vi.stubGlobal('devicePixelRatio', ratio);
        const { viewport } = collectReportContext();
        expect(viewport.length, viewport).toBeLessThanOrEqual(20);
        expect(viewport).toMatch(/^\d+x\d+@\d+(\.\d{1,2})?$/);
      }
    );

    it('should still fit for the largest screens', () => {
      vi.stubGlobal('devicePixelRatio', 3.0000001);
      vi.stubGlobal('innerWidth', 12000);
      vi.stubGlobal('innerHeight', 9000);
      expect(collectReportContext().viewport.length).toBeLessThanOrEqual(20);
    });
  });

  it('should carry nothing the reporter typed or owns: no token, balance or journal', () => {
    const json = JSON.stringify(collectReportContext());
    expect(json).not.toMatch(/token|balance|journal|password/i);
  });
});

describe('describeReportContext', () => {
  it('should list what goes along, in words, for the chart and for a lesson', () => {
    const base = { path: '/chart', viewport: '1x1@1', userAgent: 'x' };
    expect(
      describeReportContext({ ...base, area: 'chart', symbol: 'BTCUSDT', interval: '1m' })
    ).toBe('Sent with it: BTCUSDT 1m, page /chart, your device and screen size.');
    expect(
      describeReportContext({ ...base, area: 'learning', lessonId: 'lesson-02', lessonScreen: 4 })
    ).toContain('lesson lesson-02, screen 5');
  });
});
