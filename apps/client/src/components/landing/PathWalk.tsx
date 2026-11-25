import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Guide } from '@/guide/art/Guide';
import {
  CARD_LINE,
  CHAPTER_PAUSE,
  PATH_WALK_CHAPTERS,
  PathRun,
  STOP_R,
  chapterEnds,
  layoutWalk,
  measureRoad,
  pointAt,
  roadSegments,
  segmentsPath,
  wrapText,
  type RunEvent,
  type WalkKind,
} from '@/lib/pathWalk';
import styles from './PathWalk.module.css';

const SCALE = 0.62; // the guides' 64 × 92 figure, scaled
const GUIDE_W = 64 * SCALE;
const GUIDE_H = 92 * SCALE;
/** Beside the road on a phone, over the stop on a wide screen */
const PHONE_SIDE = 62;
const WIDE_SIDE = 22;
/** How long the chapter's flash plays (the walk waits for it: `CHAPTER_PAUSE`) */
const FLASH_MS = 1600;
const ENDS = chapterEnds();
const OPEN_STOPS = PATH_WALK_CHAPTERS.reduce((n, c) => n + c.stops.length, 0);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A stop's picture, drawn around (0, 0): a book, three candles, a flag or a padlock */
function StopIcon({ kind, locked }: { kind: WalkKind; locked: boolean }) {
  return (
    <g className={styles.icon} transform="scale(1.15)">
      {locked ? (
        <>
          <rect x={-6} y={-1} width={12} height={9} rx={2} />
          <path d="M-3.5 -1v-3a3.5 3.5 0 0 1 7 0v3" />
        </>
      ) : kind === 'lesson' ? (
        <>
          <path d="M-8 -6c3-1 6-1 8 1v12c-2-2-5-2-8-1z" />
          <path d="M8 -6c-3-1-6-1-8 1v12c2-2 5-2 8-1z" />
        </>
      ) : kind === 'practice' ? (
        <>
          {(
            [
              [-6, -3, 5],
              [0, -7, 9],
              [6, 0, 6],
            ] as const
          ).map(([x, y, h]) => (
            <g key={x}>
              <line x1={x} y1={y - 3} x2={x} y2={y + h + 3} />
              <rect x={x - 2.2} y={y} width={4.4} height={h} />
            </g>
          ))}
        </>
      ) : (
        <>
          <line x1={-6} y1={-8} x2={-6} y2={9} />
          <path d="M-6 -7h12l-3 4 3 4h-12" />
        </>
      )}
    </g>
  );
}

interface Flash {
  id: number;
  chapter: number;
  left: number;
  top: number;
}

/**
 * The learning path as a walk (owner 2026-11-25). Pulin and Berwyn walk the open stops in order:
 * each stop turns into a check as it is reached (its title goes from dim to full), and a chapter's
 * title flashes with a check when its last stop is passed. After the last chapter the road runs on as
 * a few fading dots, to say more chapters are coming. It starts when it comes into view, plays once,
 * and can be replayed; with reduced motion, or without `IntersectionObserver`, it is drawn finished.
 * The timeline is `PathRun`, the layout `layoutWalk` (both in `lib/pathWalk.ts`); the guides' moves
 * are set on the DOM from the frame loop, so the page re-renders once a stop, not once a frame.
 */
function WalkStage({ width, still }: { width: number; still: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const tickGuide = useRef<SVGGElement>(null);
  const tockGuide = useRef<SVGGElement>(null);
  const litRoad = useRef<SVGPathElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashId = useRef(0);

  const [inView, setInView] = useState(false);
  const [reached, setReached] = useState(still ? OPEN_STOPS : 0);
  const [finished, setFinished] = useState(still);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  // Pause and play (owner 2026-11-25): a moving picture needs a way to stop it
  const [paused, setPaused] = useState(false);

  const layout = useMemo(() => layoutWalk(width), [width]);
  const geo = useMemo(() => {
    const pts = [...layout.nodes, ...layout.dots].map((p) => ({ x: p.x, y: p.y }));
    const segs = roadSegments(pts);
    const road = measureRoad(segs);
    return {
      road,
      d: segmentsPath(segs),
      stopDists: layout.built.map((i) => road.at[i]),
    };
  }, [layout]);
  const run = useMemo(() => new PathRun(geo.stopDists, ENDS), [geo]);

  // ─── In view: the walk starts when it is on screen, and waits while it is not ───
  useEffect(() => {
    const el = wrap.current;
    if (still || !el) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [still]);

  // ─── Place the guides and the lit part of the road ───
  const place = useCallback(
    (dist: number, moving: boolean) => {
      const p = pointAt(geo.road, dist);
      const both = [tickGuide.current, tockGuide.current];
      both.forEach((g, i) => {
        if (!g) return;
        // Wide: standing over the stop, a little apart. Phone: beside the road, one each side
        const sign = i === 0 ? 1 : -1;
        const dx = layout.wide ? sign * WIDE_SIDE : sign * PHONE_SIDE;
        const dy = layout.wide ? -(STOP_R + 6) : 12;
        const phase = dist * 0.11 + i * 1.4;
        const hop = moving ? Math.abs(Math.sin(phase)) * 6 : 0;
        const tilt = moving ? Math.sin(phase) * 4 : 0;
        g.setAttribute(
          'transform',
          `translate(${p.x + dx - GUIDE_W / 2} ${p.y + dy - GUIDE_H - hop}) rotate(${tilt} ${GUIDE_W / 2} ${GUIDE_H})`
        );
      });
      litRoad.current?.style.setProperty(
        'stroke-dasharray',
        `${Math.max(0, dist)} ${geo.road.total + 20}`
      );
    },
    [geo, layout.wide]
  );

  const showFlash = useCallback(
    (chapter: number) => {
      const p = pointAt(geo.road, run.dist);
      const half = Math.min(170, width / 2 - 8);
      const left = layout.wide ? Math.max(half, Math.min(width - half, p.x)) : layout.centerX;
      flashId.current += 1;
      setFlash({ id: flashId.current, chapter, left, top: Math.max(4, p.y - 150) });
      setCelebrate(true);
      clearTimeout(flashTimer.current);
      clearTimeout(celebrateTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
      celebrateTimer.current = setTimeout(() => setCelebrate(false), CHAPTER_PAUSE * 1000 - 100);
    },
    [geo, run, width, layout]
  );

  // First placement: at the first stop, or (drawn finished) at the last
  useLayoutEffect(() => {
    place(still ? (geo.stopDists[geo.stopDists.length - 1] ?? 0) : 0, false);
  }, [place, still, geo]);

  // ─── The frame loop ───
  useEffect(() => {
    if (still || finished || !inView || paused) return;
    let raf = 0;
    let last = 0;
    const handle = (e: RunEvent) => {
      if (e.type === 'arrive') setReached(e.index + 1);
      else if (e.type === 'chapter') showFlash(e.chapter);
      else setFinished(true);
    };
    const frame = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      const events = run.step(dt);
      place(run.dist, run.moving);
      events.forEach(handle);
      if (!run.finished) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still, finished, inView, paused, run, place, showFlash]);

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      clearTimeout(celebrateTimer.current);
    },
    []
  );

  const replay = () => {
    setPaused(false);
    run.reset();
    setReached(0);
    setFinished(false);
    setFlash(null);
    place(0, false);
  };

  // Stops done per chapter, for the cards' counters
  const doneIn = (chapter: number): number =>
    layout.built.filter((ni, bi) => layout.nodes[ni].chapter === chapter && bi < reached).length;

  return (
    <div className={styles.walk} ref={wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* The road runs behind the cards; the lit part reaches the last open stop */}
        <path className={styles.road} d={geo.d} />
        <path ref={litRoad} className={styles.lit} d={geo.d} />

        {layout.cards.map((card) => {
          const chapter = PATH_WALK_CHAPTERS[card.chapter];
          const done = doneIn(card.chapter);
          const complete = done === chapter.stops.length;
          const green = chapter.tone === 'green';
          // Drawn upright around its own corner, then leaned about its centre
          const x0 = card.cx - card.w / 2;
          const y0 = card.cy - card.h / 2;
          const dividerX = x0 + card.w - 48;
          const titleY = y0 + 14 + 15;
          const subY = titleY + (card.lines.length - 1) * CARD_LINE + 20;
          return (
            <g
              key={chapter.number}
              className={green ? styles.cardGreen : styles.cardPurple}
              transform={`rotate(${card.angle} ${card.cx} ${card.cy})`}
            >
              <rect
                className={styles.cardEdge}
                x={x0}
                y={y0 + 5}
                width={card.w}
                height={card.h}
                rx={14}
              />
              <rect
                className={styles.cardTop}
                x={x0}
                y={y0}
                width={card.w}
                height={card.h}
                rx={14}
              />
              <text className={styles.cardTitle} x={x0 + 16} y={titleY}>
                {card.lines.map((line, k) => (
                  <tspan key={line} x={x0 + 16} dy={k ? CARD_LINE : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
              <text className={styles.cardSub} x={x0 + 16} y={subY}>
                {`Chapter ${chapter.number} · ${done} of ${chapter.stops.length} done`}
              </text>
              <line
                className={styles.cardDivider}
                x1={dividerX}
                y1={y0 + 7}
                x2={dividerX}
                y2={y0 + card.h - 7}
              />
              <g transform={`translate(${dividerX + 24} ${card.cy})`}>
                {complete ? (
                  <g className={styles.cardCheck}>
                    <circle r={12} className={styles.cardCheckDisc} />
                    <path d="M-5.5 0.5l4 4L6.5 -4" className={styles.cardCheckMark} />
                  </g>
                ) : (
                  <g className={styles.cardBook}>
                    <path d="M-8 -6c3-1 6-1 8 1v12c-2-2-5-2-8-1z" />
                    <path d="M8 -6c-3-1-6-1-8 1v12c2-2 5-2 8-1z" />
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {layout.nodes.map((n, ni) => {
          const bi = layout.built.indexOf(ni);
          const done = !n.soon && bi < reached;
          const next = !n.soon && bi === reached && !finished;
          const justDone = done && bi === reached - 1 && !still;
          const cls = [
            n.soon ? styles.locked : '',
            done ? styles.done : '',
            next ? styles.next : '',
            justDone ? styles.pop : '',
          ]
            .filter(Boolean)
            .join(' ');
          const lines = wrapText(n.title, n.maxChars);
          return (
            <g
              key={`${n.chapter}-${n.title}`}
              data-stop={n.soon ? 'soon' : 'open'}
              className={cls}
              transform={`translate(${n.x} ${n.y})`}
            >
              <circle className={styles.track} r={STOP_R + 7} />
              <circle className={styles.arc} r={STOP_R + 7} />
              <circle className={styles.glow} r={STOP_R + 7} />
              <g className={styles.body}>
                <circle className={styles.base} cy={6} r={STOP_R} />
                <circle className={styles.top} r={STOP_R} />
                <StopIcon kind={n.kind} locked={n.soon} />
                <path className={styles.tick} d="M-9 0.5l6.5 6.5L10 -6" />
              </g>
              <text className={styles.label} y={STOP_R + 30} textAnchor="middle">
                {lines.map((line, k) => (
                  <tspan key={line} x={0} dy={k ? 18 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        {layout.dots.map((d) => (
          <circle
            key={`${d.x}-${d.y}`}
            className={styles.dot}
            cx={d.x}
            cy={d.y}
            r={d.r}
            opacity={d.opacity}
          />
        ))}
        <text
          className={styles.caption}
          x={layout.caption.x}
          y={layout.caption.y}
          textAnchor={layout.caption.anchor}
        >
          {layout.caption.lines.map((line, k) => (
            <tspan key={line} x={layout.caption.x} dy={k ? 17 : 0}>
              {line}
            </tspan>
          ))}
        </text>

        {/* Pulin and Berwyn, on top of everything */}
        <g ref={tickGuide}>
          <Guide
            who="tick"
            mood={celebrate ? 'grin' : 'smile'}
            pose={celebrate ? 'wave' : 'stand'}
            scale={SCALE}
          />
        </g>
        <g ref={tockGuide}>
          <Guide
            who="tock"
            mood={celebrate ? 'grin' : 'smile'}
            pose={celebrate ? 'wave' : 'stand'}
            scale={SCALE}
          />
        </g>
      </svg>

      {/* A chapter's title and a check, flashed over the guides as they pass it */}
      {flash && (
        <div
          key={flash.id}
          className={styles.flash}
          style={{ left: flash.left, top: flash.top }}
          aria-hidden="true"
        >
          <span className={styles.flashCheck}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span>
            <small className={styles.flashNumber}>
              {`Chapter ${PATH_WALK_CHAPTERS[flash.chapter].number}`}
            </small>
            <b className={styles.flashTitle}>{PATH_WALK_CHAPTERS[flash.chapter].title}</b>
          </span>
        </div>
      )}

      {/* Pause or play while it walks; Replay once it has finished. Nothing to control when drawn finished. */}
      {!still && (
        <div className={styles.controls}>
          {finished ? (
            <button type="button" className={styles.control} onClick={replay}>
              Replay
            </button>
          ) : (
            <button type="button" className={styles.control} onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
        </div>
      )}

      {/* The same path for a screen reader and a search engine: the drawing is only a picture */}
      <ol className={styles.srOnly}>
        {PATH_WALK_CHAPTERS.map((c) => (
          <li key={c.number}>
            {`Chapter ${c.number}: ${c.title}`}
            <ol>
              {c.stops.map((s) => (
                <li key={s.title}>{s.title}</li>
              ))}
              {c.soon.map((s) => (
                <li key={s.title}>{`${s.title} (coming soon)`}</li>
              ))}
            </ol>
          </li>
        ))}
        <li>More chapters are on the way.</li>
      </ol>
    </div>
  );
}

/**
 * Measures its width and draws the walk at that width. A new width is a new layout, so the stage is
 * made again (`key`) and starts over: a resize waits a moment before it does.
 */
export function PathWalk() {
  const holder = useRef<HTMLDivElement>(null);
  // Without motion or an observer there is nothing to wait for: draw the finished walk
  const [still] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined'
  );
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || 1000);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={holder} className={styles.holder}>
      {width > 0 && <WalkStage key={width} width={width} still={still} />}
    </div>
  );
}
