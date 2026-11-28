import { describe, it, expect } from 'vitest';

import { CHAPTERS, nodeTitle } from '@/learn/path';
import {
  CHAPTER_PAUSE,
  PATH_WALK_CHAPTERS,
  PathRun,
  STOP_R,
  WIDE_FROM,
  chapterEnds,
  layoutWalk,
  measureRoad,
  pointAt,
  roadSegments,
  segmentsPath,
  wrapText,
  type RunEvent,
} from '../pathWalk';

describe('the walk content', () => {
  it('should list the same chapters and stops as the real path, so the page never drifts from the app', () => {
    expect(PATH_WALK_CHAPTERS).toHaveLength(CHAPTERS.length);
    CHAPTERS.forEach((chapter, ci) => {
      const walk = PATH_WALK_CHAPTERS[ci];
      expect(walk.number).toBe(chapter.number);
      expect(walk.title).toBe(chapter.title);
      if (chapter.status !== 'open') throw new Error('The walk draws open chapters only');
      expect(walk.stops.map((s) => s.title)).toEqual(chapter.nodes.map(nodeTitle));
      expect(walk.stops.map((s) => s.kind)).toEqual(
        chapter.nodes.map((n) => (n.kind === 'tour' ? 'practice' : n.kind))
      );
      expect(walk.soon.map((s) => s.title)).toEqual((chapter.soon ?? []).map((s) => s.title));
    });
  });
});

describe('wrapText', () => {
  it('should break at word ends, never inside a word, and never lose a word', () => {
    const lines = wrapText('Trader or investor? Find your style', 14);
    expect(lines.join(' ')).toBe('Trader or investor? Find your style');
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('layoutWalk', () => {
  it('should lay two chapter rows out on a wide screen: the second runs back, right to left', () => {
    const l = layoutWalk(1100);
    expect(l.wide).toBe(true);
    const ch1 = l.nodes.filter((n) => n.chapter === 0);
    const ch2 = l.nodes.filter((n) => n.chapter === 1);
    expect(ch1).toHaveLength(7);
    expect(ch2).toHaveLength(7);
    expect(ch1[6].x).toBeGreaterThan(ch1[0].x);
    expect(ch2[6].x).toBeLessThan(ch2[0].x);
    expect(ch2[0].y).toBeGreaterThan(ch1[0].y + STOP_R * 2);
  });

  it('should keep every stop, card and dot inside the drawing', () => {
    for (const w of [WIDE_FROM, 1100, 375, 320]) {
      const l = layoutWalk(w);
      for (const n of l.nodes) {
        expect(n.x - STOP_R).toBeGreaterThanOrEqual(0);
        expect(n.x + STOP_R).toBeLessThanOrEqual(w);
        expect(n.y + STOP_R).toBeLessThanOrEqual(l.height);
      }
      for (const c of l.cards) {
        expect(c.box.x).toBeGreaterThanOrEqual(0);
        expect(c.box.x + c.box.w).toBeLessThanOrEqual(w);
      }
      for (const d of l.dots) expect(d.x - d.r).toBeGreaterThanOrEqual(0);
    }
  });

  it('should lean the cards 10 degrees on a wide screen, the second the other way, and keep them upright on a phone', () => {
    const angles = layoutWalk(1100).cards.map((c) => c.angle);
    expect(angles).toEqual([-10, 10]);
    for (const c of layoutWalk(1100).cards) {
      // Tilted, a card takes more room than it is: the layout leaves it
      expect(c.box.h).toBeGreaterThan(c.h);
    }
    for (const c of layoutWalk(375).cards) expect(c.angle).toBe(0);
  });

  it('should leave each row clear of its tilted card, with room for the guides between', () => {
    const l = layoutWalk(1100);
    l.cards.forEach((c, ci) => {
      const first = l.nodes.find((n) => n.chapter === ci)!;
      expect(first.y - STOP_R - (c.box.y + c.box.h)).toBeGreaterThanOrEqual(60);
    });
  });

  it('should lay one column out on a phone, in walking order from the top', () => {
    const l = layoutWalk(375);
    expect(l.wide).toBe(false);
    for (let i = 1; i < l.nodes.length; i++) expect(l.nodes[i].y).toBeGreaterThan(l.nodes[i - 1].y);
  });

  it('should walk the open stops only, and leave the coming-soon ones locked', () => {
    const l = layoutWalk(1100);
    const open = PATH_WALK_CHAPTERS.reduce((n, c) => n + c.stops.length, 0);
    expect(l.built).toHaveLength(open);
    expect(l.nodes.filter((n) => n.soon)).toHaveLength(1);
    expect(l.nodes[l.built[l.built.length - 1] + 1].soon).toBe(true);
  });

  it('should keep the caption under the dots inside the drawing, on every width', () => {
    for (const w of [320, 360, 375, 412, 768, 820, 1100, 1440]) {
      const l = layoutWalk(w);
      // About 6.6 px a character at 13 px: the widest line, half each side of the middle
      const half = (Math.max(...l.caption.lines.map((x) => x.length)) * 6.6) / 2;
      expect(l.caption.anchor).toBe('middle');
      expect(l.caption.x - half, `${w}: left`).toBeGreaterThanOrEqual(0);
      expect(l.caption.x + half, `${w}: right`).toBeLessThanOrEqual(w);
      expect(l.caption.y, `${w}: bottom`).toBeLessThanOrEqual(l.height);
    }
  });

  it('should carry the road on past the last stop as fading dots, each fainter than the one before', () => {
    for (const w of [1100, 375]) {
      const { dots } = layoutWalk(w);
      expect(dots.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < dots.length; i++) {
        expect(dots[i].opacity).toBeLessThan(dots[i - 1].opacity);
        expect(dots[i].r).toBeLessThanOrEqual(dots[i - 1].r);
      }
    }
  });
});

describe('the road', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const road = measureRoad(roadSegments(pts));

  it('should measure each point along the curve, in order, from zero', () => {
    expect(road.at[0]).toBe(0);
    expect(road.at).toHaveLength(pts.length);
    expect(road.at[1]).toBeGreaterThanOrEqual(100);
    expect(road.at[2]).toBeGreaterThan(road.at[1]);
    expect(road.total).toBe(road.at[2]);
  });

  it('should find the point at a distance: the stops themselves, and a place between', () => {
    expect(pointAt(road, road.at[1])).toMatchObject({
      x: expect.closeTo(100, 0),
      y: expect.closeTo(0, 0),
    });
    const mid = pointAt(road, road.at[1] / 2);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(100);
  });

  it('should carry straight back before the start, and stop at the end', () => {
    expect(pointAt(road, -10).x).toBeLessThan(0);
    expect(pointAt(road, road.total + 50)).toMatchObject({ x: 100, y: 100 });
  });

  it('should draw as one path through every point', () => {
    const d = segmentsPath(roadSegments(pts));
    expect(d.startsWith('M0 0C')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(segmentsPath([])).toBe('');
  });
});

describe('PathRun', () => {
  const dists = [0, 300, 600, 900];
  const ends = { 1: 0, 3: 1 };
  const play = (run: PathRun, seconds: number, dt = 0.05): RunEvent[] => {
    const all: RunEvent[] = [];
    for (let t = 0; t < seconds; t += dt) all.push(...run.step(dt));
    return all;
  };

  it('should reach every stop in order, flash each chapter at its last stop, then finish', () => {
    const run = new PathRun(dists, ends);
    const events = play(run, 60);
    expect(
      events.filter((e) => e.type === 'arrive').map((e) => (e as { index: number }).index)
    ).toEqual([0, 1, 2, 3]);
    expect(events.filter((e) => e.type === 'chapter')).toEqual([
      { type: 'chapter', chapter: 0 },
      { type: 'chapter', chapter: 1 },
    ]);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(run.finished).toBe(true);
    expect(run.dist).toBe(900);
  });

  it('should say a chapter right after its last stop is reached, and wait there for the flash', () => {
    const run = new PathRun(dists, ends);
    const order: string[] = [];
    while (order.length < 3) {
      for (const e of run.step(0.05)) order.push(e.type === 'arrive' ? `stop ${e.index}` : e.type);
    }
    expect(order).toEqual(['stop 0', 'stop 1', 'chapter']);
    // Standing at the chapter's last stop, the walk waits out the pause before it moves on
    const at = run.dist;
    for (let t = 0; t < CHAPTER_PAUSE - 0.2; t += 0.05) run.step(0.05);
    expect(run.moving).toBe(false);
    expect(run.dist).toBe(at);
  });

  it('should never go backward or past the last stop, whatever the frame time', () => {
    for (const dt of [0.005, 0.016, 0.05, 0.5]) {
      const run = new PathRun(dists, ends);
      let prev = 0;
      for (let t = 0; t < 90; t += dt) {
        run.step(dt);
        expect(run.dist).toBeGreaterThanOrEqual(prev);
        expect(run.dist).toBeLessThanOrEqual(900);
        prev = run.dist;
      }
    }
  });

  it('should start over after a reset', () => {
    const run = new PathRun(dists, ends);
    play(run, 60);
    run.reset();
    expect(run.finished).toBe(false);
    expect(run.index).toBe(-1);
    expect(run.dist).toBe(0);
    expect(play(run, 60).some((e) => e.type === 'done')).toBe(true);
  });

  it('should end at once for a path with no stops', () => {
    expect(new PathRun([], {}).step(1)).toEqual([]);
  });

  it('should end a chapter at its last open stop', () => {
    expect(chapterEnds()).toEqual({ 6: 0, 12: 1 });
  });
});
