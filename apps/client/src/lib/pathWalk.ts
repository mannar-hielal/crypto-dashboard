/**
 * The walk down the Crypto path on the landing page (owner 2026-11-25; first built for How it works): the guides walk the
 * path's stops in order, tick each one, and flash a chapter's title with a check when they pass it.
 * Pure data and geometry, no React: the content (kept in step with `learn/path.ts` by a test, so the
 * landing page never loads the lessons' module), the layout, the road's curve and its length, and the
 * timeline of the walk. `components/landing/PathWalk.tsx` draws it.
 */

export type WalkKind = 'lesson' | 'practice' | 'checkpoint';
export type WalkTone = 'purple' | 'green';

export interface WalkStop {
  kind: WalkKind;
  title: string;
}

export interface WalkChapter {
  number: number;
  title: string;
  tone: WalkTone;
  /** Open stops: the guides walk these */
  stops: readonly WalkStop[];
  /** Stops still to write: shown locked, never walked */
  soon: readonly WalkStop[];
}

// ─── Content (the same stops as `learn/path.ts`: `pathWalk.test.ts` keeps them in step) ──────────

export const PATH_WALK_CHAPTERS: readonly WalkChapter[] = [
  {
    number: 1,
    title: 'Start here: crypto and trading basics',
    tone: 'purple',
    stops: [
      { kind: 'lesson', title: 'Up, down and your first trade' },
      { kind: 'lesson', title: 'Money nobody controls' },
      { kind: 'lesson', title: 'News, swings and traps' },
      { kind: 'practice', title: 'Buy your first coin' },
      { kind: 'practice', title: 'Sell it and read the result' },
      { kind: 'lesson', title: 'Trader or investor? Find your style' },
      { kind: 'checkpoint', title: 'Chapter 1 checkpoint' },
    ],
    soon: [],
  },
  {
    number: 2,
    title: 'Your crypto toolbox: coins, wallets and the networks behind them',
    tone: 'green',
    stops: [
      { kind: 'lesson', title: 'Coins and tokens: who has their own road' },
      { kind: 'lesson', title: 'Stablecoins: the coins that try to sit still' },
      { kind: 'lesson', title: 'Your wallet, your keys: who holds them?' },
      { kind: 'lesson', title: 'Why sending crypto costs a fee' },
      { kind: 'practice', title: 'Find the fee on your trade' },
      { kind: 'lesson', title: 'Trading without a middleman: DApps and pools' },
      { kind: 'practice', title: 'Try a swap with a practice wallet' },
      { kind: 'checkpoint', title: 'Checkpoint: wallets, fees and the networks' },
    ],
    soon: [],
  },
];

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/** A stop's button radius, in the drawing's own units (one unit is one CSS pixel) */
export const STOP_R = 30;
/**
 * The chapter cards (owner 2026-11-25: smaller, and leaning 10 degrees on a wide screen). Chapter 1
 * leans up to the right, chapter 2 the other way, down to the right, like its row running back.
 */
export const CARD_W = 270;
export const CARD_TILT = 10;
const CARD_CHAR = 7.9; // a 15 px bold character, about
export const CARD_LINE = 19;
/** Below this width the path is one column, above it two rows */
export const WIDE_FROM = 760;
const STEP_COLUMN = 116;
/** Half the width of the "More chapters" caption, about, with a little air */
const CAPTION_HALF = 52;

export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if (cur && `${cur} ${word}`.length > max) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface WalkNode extends WalkStop {
  chapter: number;
  /** Not open yet: drawn locked, never walked */
  soon: boolean;
  x: number;
  y: number;
  /** The longest line of its label, in characters */
  maxChars: number;
}

export interface WalkCard {
  chapter: number;
  /** The card's centre and its own (untilted) size */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees; negative leans up to the right (counter-clockwise), positive down to the right */
  angle: number;
  lines: string[];
  /** The room it takes once tilted */
  box: { x: number; y: number; w: number; h: number };
}

export interface WalkDot {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export interface WalkLayout {
  wide: boolean;
  width: number;
  height: number;
  /** Where the flash is centred when the layout is one column */
  centerX: number;
  nodes: WalkNode[];
  cards: WalkCard[];
  /** The fading dots after the last stop: more chapters are coming */
  dots: WalkDot[];
  caption: { x: number; y: number; lines: string[]; anchor: 'start' | 'middle' };
  /** Indexes into `nodes` of the open stops, in walking order */
  built: number[];
}

function cardFor(
  chapter: WalkChapter,
  w: number,
  angle: number
): { lines: string[]; w: number; h: number; bw: number; bh: number } {
  const lines = wrapText(chapter.title, Math.floor((w - 76) / CARD_CHAR));
  const h = 14 + lines.length * CARD_LINE + 6 + 14 + 14;
  const rad = (Math.abs(angle) * Math.PI) / 180;
  return {
    lines,
    w,
    h,
    bw: w * Math.cos(rad) + h * Math.sin(rad),
    bh: w * Math.sin(rad) + h * Math.cos(rad),
  };
}

const allStops = (c: WalkChapter): { stop: WalkStop; soon: boolean }[] => [
  ...c.stops.map((stop) => ({ stop, soon: false })),
  ...c.soon.map((stop) => ({ stop, soon: true })),
];

/**
 * Two rows on a wide screen: chapter 1 left to right, chapter 2 back right to left under it (a
 * snake, so the road never jumps), each under its header card. One column on a phone.
 */
export function layoutWalk(
  width: number,
  chapters: readonly WalkChapter[] = PATH_WALK_CHAPTERS
): WalkLayout {
  const wide = width >= WIDE_FROM;
  const nodes: WalkNode[] = [];
  const cards: WalkCard[] = [];
  const dots: WalkDot[] = [];
  let height: number;
  let caption: WalkLayout['caption'];
  const R = STOP_R;

  if (wide) {
    const margin = 70;
    // One column a stop of the longest chapter, and one more kept free past the last chapter's last
    // stop for the "more chapters" dots, so a chapter that grows never pushes them off the picture
    const longest = Math.max(...chapters.map((c) => c.stops.length + c.soon.length));
    const lastRow = chapters[chapters.length - 1];
    const columns = Math.max(7, longest, lastRow.stops.length + lastRow.soon.length + 1);
    const step = (width - 2 * margin) / (columns - 1);
    let y = 8;
    chapters.forEach((chapter, ci) => {
      const angle = ci % 2 === 0 ? -CARD_TILT : CARD_TILT;
      const card = cardFor(chapter, CARD_W, angle);
      // Even chapters lean in at the left, odd ones at the right, where their row begins
      const left = ci % 2 === 0 ? 20 : width - 20 - card.bw;
      cards.push({
        chapter: ci,
        cx: left + card.bw / 2,
        cy: y + card.bh / 2,
        w: card.w,
        h: card.h,
        angle,
        lines: card.lines,
        box: { x: left, y, w: card.bw, h: card.bh },
      });
      // Room above the row for the guides to stand on the stops' line
      const rowY = y + card.bh + 6 + 66 + R;
      allStops(chapter).forEach(({ stop, soon }, i) => {
        // Even chapters run left to right, odd ones right to left, starting at the right edge
        const col = ci % 2 === 0 ? i : columns - 1 - i;
        nodes.push({
          ...stop,
          chapter: ci,
          soon,
          x: margin + col * step,
          y: rowY + Math.round(Math.sin(i * 0.9 + ci * 3) * 10),
          // Labels wrap to their column; a longer chapter makes the columns narrower, so the floor is
          // low enough that neighbours never run into each other
          maxChars: Math.max(8, Math.floor((step - 16) / 6.8)),
        });
      });
      y = rowY + R + 30 + 36 + 28;
    });
    const last = nodes[nodes.length - 1];
    for (const [back, r, opacity] of [
      [0.42, 6, 0.85],
      [0.72, 5, 0.55],
      [1, 4, 0.28],
    ] as const) {
      dots.push({ x: last.x - step * back, y: last.y, r, opacity });
    }
    caption = {
      // Well left of the last stop: with every stop open the guides end there, beside the dots
      x: Math.max(CAPTION_HALF, last.x - step * 1.15),
      y: last.y - R - 22,
      lines: ['More chapters', 'on the way'],
      anchor: 'middle',
    };
    // The last row's labels can run to several lines: leave room for the tallest one
    const labelsBottom = Math.max(
      ...nodes
        .filter((n) => n.chapter === chapters.length - 1)
        .map((n) => n.y + R + 30 + (wrapText(n.title, n.maxChars).length - 1) * 18 + 8)
    );
    height = Math.max(last.y + R + 70, labelsBottom);
  } else {
    const centerX = width / 2;
    const colW = Math.min(width - 8, 320);
    let y = 8;
    chapters.forEach((chapter, ci) => {
      const card = cardFor(chapter, colW, 0);
      cards.push({
        chapter: ci,
        cx: centerX,
        cy: y + card.h / 2,
        w: card.w,
        h: card.h,
        angle: 0,
        lines: card.lines,
        box: { x: centerX - colW / 2, y, w: colW, h: card.h },
      });
      const firstY = y + card.h + 6 + 28 + R;
      const stops = allStops(chapter);
      stops.forEach(({ stop, soon }, i) => {
        nodes.push({
          ...stop,
          chapter: ci,
          soon,
          x: centerX + Math.round(Math.sin((i + ci * 3) * 0.9) * 40),
          y: firstY + i * STEP_COLUMN,
          maxChars: 30,
        });
      });
      y = firstY + (stops.length - 1) * STEP_COLUMN + R + 40 + 36;
    });
    const last = nodes[nodes.length - 1];
    for (const [i, r, opacity] of [
      [0, 6, 0.85],
      [1, 5, 0.55],
      [2, 4, 0.28],
    ] as const) {
      dots.push({ x: last.x, y: last.y + R + 56 + i * 22, r, opacity });
    }
    // Centred under the dots on two lines: beside them it ran off a phone's right edge
    const captionY = last.y + R + 56 + 2 * 22 + 30;
    caption = {
      x: centerX,
      y: captionY,
      lines: ['More chapters', 'on the way'],
      anchor: 'middle',
    };
    height = captionY + 17 + 24;
  }

  const built: number[] = [];
  nodes.forEach((n, i) => {
    if (!n.soon) built.push(i);
  });
  return { wide, width, height, centerX: width / 2, nodes, cards, dots, caption, built };
}

// ─── The road: a smooth curve through the stops, with its length measured ─────

export interface Seg {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

/** A Catmull-Rom curve through the points, as cubic Béziers */
export function roadSegments(pts: readonly Pt[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[i + 1];
    const d = pts[Math.min(pts.length - 1, i + 2)];
    segs.push({
      p0: b,
      c1: { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 },
      c2: { x: c.x - (d.x - b.x) / 6, y: c.y - (d.y - b.y) / 6 },
      p1: c,
    });
  }
  return segs;
}

export function segmentsPath(segs: readonly Seg[]): string {
  if (segs.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(segs[0].p0.x)} ${f(segs[0].p0.y)}`;
  for (const s of segs) {
    d += `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.p1.x)} ${f(s.p1.y)}`;
  }
  return d;
}

export interface Road {
  /** The curve as a polyline, each point with its distance from the start */
  samples: { x: number; y: number; d: number }[];
  /** The distance of every input point along the curve (the first is 0) */
  at: number[];
  total: number;
}

const SAMPLES_PER_SEG = 32;

const bezier = (s: Seg, t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p1.x,
    y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p1.y,
  };
};

export function measureRoad(segs: readonly Seg[]): Road {
  const samples: Road['samples'] = [];
  const at: number[] = [0];
  let total = 0;
  segs.forEach((seg, si) => {
    for (let k = si === 0 ? 0 : 1; k <= SAMPLES_PER_SEG; k++) {
      const p = bezier(seg, k / SAMPLES_PER_SEG);
      const prev = samples[samples.length - 1];
      if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
      samples.push({ ...p, d: total });
    }
    at.push(total);
  });
  return { samples, at, total };
}

/** The point at a distance along the road; before the start it carries on straight back */
export function pointAt(road: Road, dist: number): Pt {
  const s = road.samples;
  if (s.length === 0) return { x: 0, y: 0 };
  if (s.length === 1) return { x: s[0].x, y: s[0].y };
  if (dist <= 0) {
    const l = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) || 1;
    return {
      x: s[0].x + ((s[1].x - s[0].x) / l) * dist,
      y: s[0].y + ((s[1].y - s[0].y) / l) * dist,
    };
  }
  if (dist >= road.total) return { x: s[s.length - 1].x, y: s[s.length - 1].y };
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].d <= dist) lo = mid;
    else hi = mid;
  }
  const span = s[hi].d - s[lo].d || 1;
  const t = (dist - s[lo].d) / span;
  return { x: s[lo].x + (s[hi].x - s[lo].x) * t, y: s[lo].y + (s[hi].y - s[lo].y) * t };
}

// ─── The timeline of the walk ────────────────────────────────────────────────

export type RunEvent =
  { type: 'arrive'; index: number } | { type: 'chapter'; chapter: number } | { type: 'done' };

/** Pixels a second between two stops */
export const WALK_SPEED = 300;
const FIRST_PAUSE = 0.7;
const STOP_PAUSE = 0.4;
/** Long enough for the flash (1.6 s) to play before the walk goes on */
export const CHAPTER_PAUSE = 1.7;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Where the guides are, stop by stop. `step(dt)` moves time on and says what happened: a stop
 * reached, a chapter's last stop reached (its title flashes), the end. No timers and no DOM, so it
 * runs the same in a test.
 */
export class PathRun {
  /** Distance along the road */
  dist = 0;
  moving = false;
  /** The stop the guides stand at, -1 before the first */
  index = -1;
  finished = false;
  private pause = FIRST_PAUSE;
  private from = 0;
  private to = 0;
  private progress = 0;
  private duration = 1;

  private readonly stopDists: readonly number[];
  private readonly chapterEnds: Readonly<Record<number, number>>;

  /** `stopDists`: each open stop's distance; `chapterEnds`: stop index -> chapter index */
  constructor(stopDists: readonly number[], chapterEnds: Readonly<Record<number, number>>) {
    this.stopDists = stopDists;
    this.chapterEnds = chapterEnds;
  }

  reset(): void {
    this.dist = 0;
    this.moving = false;
    this.index = -1;
    this.finished = false;
    this.pause = FIRST_PAUSE;
  }

  private arrive(index: number, events: RunEvent[]): void {
    this.index = index;
    events.push({ type: 'arrive', index });
    const chapter = this.chapterEnds[index];
    if (chapter === undefined) {
      this.pause = STOP_PAUSE;
    } else {
      events.push({ type: 'chapter', chapter });
      this.pause = CHAPTER_PAUSE;
    }
  }

  step(dt: number): RunEvent[] {
    const events: RunEvent[] = [];
    if (this.finished || this.stopDists.length === 0) return events;
    if (this.moving) {
      this.progress += dt / this.duration;
      if (this.progress >= 1) {
        this.moving = false;
        this.dist = this.to;
        this.arrive(this.index + 1, events);
      } else {
        this.dist = this.from + (this.to - this.from) * ease(this.progress);
      }
      return events;
    }
    this.pause -= dt;
    if (this.pause > 0) return events;
    if (this.index === -1) {
      this.dist = this.stopDists[0];
      this.arrive(0, events);
    } else if (this.index >= this.stopDists.length - 1) {
      this.finished = true;
      events.push({ type: 'done' });
    } else {
      this.moving = true;
      this.from = this.stopDists[this.index];
      this.to = this.stopDists[this.index + 1];
      this.progress = 0;
      this.duration = Math.max(0.5, (this.to - this.from) / WALK_SPEED);
    }
    return events;
  }
}

/** Stop index -> chapter index, for the last open stop of each chapter */
export function chapterEnds(
  chapters: readonly WalkChapter[] = PATH_WALK_CHAPTERS
): Record<number, number> {
  const ends: Record<number, number> = {};
  let n = 0;
  chapters.forEach((c, ci) => {
    n += c.stops.length;
    ends[n - 1] = ci;
  });
  return ends;
}
