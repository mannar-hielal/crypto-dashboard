/**
 * What a bug report carries on its own, so the reader does not have to ask where the reporter was
 * (owner 2026-11-25): the page, the chart's symbol and interval, the lesson and its screen, the
 * checkpoint, and the device. Nothing the reporter typed, no balances, no journal, no token. It is
 * shown to the reporter in the panel before it is sent.
 */

import type { BugReportContext } from '@crypto-dashboard/sdk';
import { useLessonStore } from '@/guide/lessonStore';
import { useTourStore } from '@/guide/tourStore';
import { usePathStore } from '@/learn/pathStore';
import { useLayoutStore } from '@/store/layoutStore';

/** Cut to what the server accepts, so an odd value never makes the whole report fail */
const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);

/**
 * "1456x822@2": the window and the screen's pixel ratio. The ratio is rounded to two places: a browser
 * can report 1.7999999523162842, and the server takes 20 characters at most (a report that long was refused).
 */
function viewportOf(): string {
  const ratio = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return cut(`${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}@${ratio}`, 20);
}

export function collectReportContext(): BugReportContext {
  const lesson = useLessonStore.getState();
  const path = usePathStore.getState();
  const learning =
    lesson.activeId !== null || path.checkpointId !== null || useTourStore.getState().panelOpen;
  const pathname = window.location.pathname;
  const onChart = /^\/(chart|dashboard)(\/|$)/.test(pathname);

  const ctx: BugReportContext = {
    area: learning ? 'learning' : onChart ? 'chart' : 'other',
    path: cut(pathname, 200),
    viewport: viewportOf(),
    userAgent: cut(navigator.userAgent, 300),
  };

  if (onChart) {
    const { panes, activePane, layout } = useLayoutStore.getState();
    const pane = panes[activePane];
    if (pane) {
      ctx.symbol = cut(pane.symbol, 20);
      ctx.interval = cut(String(pane.interval), 10);
    }
    ctx.layout = cut(String(layout), 20);
  }
  if (lesson.activeId !== null) {
    ctx.lessonId = cut(lesson.activeId, 60);
    ctx.lessonScreen = Math.max(0, Math.min(500, Math.floor(lesson.screen)));
  }
  if (path.checkpointId !== null) ctx.checkpointId = cut(path.checkpointId, 60);
  return ctx;
}

/** The one line under the form that says what goes along, in words the reporter can check */
export function describeReportContext(ctx: BugReportContext): string {
  const parts: string[] = [];
  if (ctx.lessonId) parts.push(`lesson ${ctx.lessonId}, screen ${(ctx.lessonScreen ?? 0) + 1}`);
  if (ctx.checkpointId) parts.push(`checkpoint ${ctx.checkpointId}`);
  if (ctx.symbol) parts.push(`${ctx.symbol} ${ctx.interval ?? ''}`.trim());
  parts.push(`page ${ctx.path}`, 'your device and screen size');
  return `Sent with it: ${parts.join(', ')}.`;
}
