/**
 * Draw a line (owner's visual Q&A, 2026-11-18): the learner draws one freehand line over the
 * question's dated chart, from the buy to the sell, then taps Check. A round trash button clears the
 * whole line; "Stuck? Use a hint" names where it starts and ends, never its shape. Graded against the
 * two dated closes, and for a freehand line against the closes between them (`drawGrade.ts`): after
 * "Right." our dotted path shows beside theirs, after "Not quite." and the Why comes Try again, which
 * clears the line, like every other question. A keyboard or screen-reader learner can't draw a line,
 * so the area is focusable: Left and Right move a marker over the days, Enter places the buy and then
 * the sell, and the same grading applies to those two ends.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Lightbulb, Trash } from '@phosphor-icons/react';
import { guide } from '@/lib/guideAnchors';
import { color } from '@/lib/tokens';
import { BoardFooter } from './BoardFooter';
import { LessonArt } from './LessonArt';
import { LessonChart, type LessonChartApi } from './LessonChart';
import { daySeconds } from './lessonChartData';
import { gradeLine, type DrawTarget, type Pt } from './drawGrade';
import type { LessonQuestion } from './lessons';
import styles from './DrawQuiz.module.css';

/** A line shorter than this across the chart can't be checked (a tap, a slip of the finger) */
const MIN_LINE_PX = 40;

/** After this many wrong checks the right path is shown for them (owner 2026-11-18) */
const MAX_MISSES = 3;

/** A freehand line never holds more points than this (a memory cap: a finger can run a long time) */
const MAX_POINTS = 600;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "8 April", as a reader says a day */
function dayWords(time: number): string {
  const d = new Date(time * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A day's price as a point on the chart, in pixels; null until the chart has laid out */
function placeAt(api: LessonChartApi, time: number, price: number): Pt | null {
  const x = api.chart.timeScale().timeToCoordinate(time as never);
  const y = api.series.priceToCoordinate(price);
  return x === null || y === null ? null : { x, y };
}

/** The buy, the sell and the closes between them, in pixels; null until the chart has laid out */
function targetOf(
  api: LessonChartApi,
  draw: NonNullable<LessonQuestion['draw']>,
  height: number
): DrawTarget | null {
  const { bars } = api;
  const from = daySeconds(draw.buy.date);
  const to = daySeconds(draw.sell.date);
  const buy = placeAt(api, from, draw.buy.price);
  const sell = placeAt(api, to, draw.sell.price);
  const path = bars
    .filter((b) => b.time >= from && b.time <= to)
    .map((b) => placeAt(api, b.time, b.close))
    .filter((p): p is Pt => p !== null);
  const first = bars.length > 0 ? placeAt(api, bars[0].time, bars[0].close) : null;
  const next = bars.length > 1 ? placeAt(api, bars[1].time, bars[1].close) : null;
  if (!buy || !sell || !first || !next || path.length < 2) return null;
  return { buy, sell, path, spacing: Math.abs(next.x - first.x), height };
}

const toPoints = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

export function DrawQuiz({
  q,
  answer,
  onAnswer,
  onRetry,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
  /** "Try again" after a wrong check: the line is cleared, then the answer */
  onRetry?: () => void;
}) {
  const draw = q.draw;
  const scene = q.chart;
  const stageRef = useRef<HTMLDivElement>(null);
  // The chart's handles and the stage's height when it last laid out (read once, in the callback)
  const [ready, setReady] = useState<{ api: LessonChartApi; height: number } | null>(null);
  // The stage's height after a resize (null: not resized yet): the candles have moved, so the
  // target is read again
  const [resized, setResized] = useState<number | null>(null);
  const onReady = useCallback(
    (a: LessonChartApi) => setReady({ api: a, height: stageRef.current?.clientHeight ?? 240 }),
    []
  );
  const api = ready?.api ?? null;
  const [points, setPoints] = useState<Pt[]>([]);
  const drawing = useRef(false);
  // The keyboard way: a marker over the days, the buy then the sell placed with Enter
  const [cursor, setCursor] = useState(0);
  const [placed, setPlaced] = useState<{ buy?: number; sell?: number }>({});
  const [byKeyboard, setByKeyboard] = useState(false);
  const [hint, setHint] = useState(false);
  const [say, setSay] = useState('');
  // Wrong checks so far, kept through Try again; the third shows the answer (owner 2026-11-18)
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const answered = answer !== undefined;
  const right = answer === q.correct;
  // Answered on an earlier visit: no line in memory, so our path is shown on its own
  const revisit = right && points.length === 0;

  const clear = () => {
    setPoints([]);
    setPlaced({});
    setByKeyboard(false);
    setSay('');
  };

  // A new size moves every candle: a line drawn before it would sit in the wrong place
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const watch = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      setPoints([]);
      setPlaced({});
      setByKeyboard(false);
      setResized(el.clientHeight);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // The chart finishes laying out a frame after its first candles: read the target again then, so
  // Check never waits on coordinates that were not there yet
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => setResized(stageRef.current?.clientHeight ?? null));
    return () => cancelAnimationFrame(id);
  }, [ready]);

  const height = ready?.height ?? 240;
  const target = useMemo(
    () => (ready && draw ? targetOf(ready.api, draw, resized ?? ready.height) : null),
    // A new `ready` or a resized stage means fresh coordinates
    [ready, draw, resized]
  );

  if (!draw || !scene) return null;

  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const bars = api?.bars ?? [];
  const closePt = (i: number): Pt | null =>
    api ? placeAt(api, api.bars[i].time, api.bars[i].close) : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (answered || bars.length === 0) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(
        Math.max(cursor + (e.key === 'ArrowRight' ? 1 : -1), 0),
        bars.length - 1
      );
      setCursor(next);
      setSay(dayWords(bars[next].time));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (placed.buy === undefined) {
        setPlaced({ buy: cursor });
        setPoints([]);
        setSay(
          `${draw.buy.label} placed on ${dayWords(bars[cursor].time)}. Now move to the sell day and press Enter.`
        );
      } else if (placed.sell === undefined && cursor > placed.buy) {
        const a = closePt(placed.buy);
        const b = closePt(cursor);
        if (a && b) {
          setPlaced({ buy: placed.buy, sell: cursor });
          setPoints([a, b]);
          setByKeyboard(true);
          setSay(`${draw.sell.label} placed on ${dayWords(bars[cursor].time)}. Press Check.`);
        }
      } else if (placed.sell !== undefined) {
        setSay('Both days are placed. Press Check, or clear the line to start again.');
      } else {
        setSay('Move to a later day for the sell, then press Enter.');
      }
    }
  };

  const check = () => {
    if (!api) return;
    // Read again now: the chart may have resized since the last layout
    const fresh = targetOf(api, draw, stageRef.current?.clientHeight ?? height);
    if (!fresh) return;
    if (gradeLine(points, fresh, !byKeyboard)) {
      onAnswer(q.correct);
    } else if (misses + 1 >= MAX_MISSES) {
      // Three tries: show our path, and let them on (the lesson counts the answer as given)
      setMisses(misses + 1);
      setRevealed(true);
      onAnswer(q.correct);
    } else {
      setMisses(misses + 1);
      onAnswer(-1);
    }
  };
  const markerX =
    api && bars[cursor] ? api.chart.timeScale().timeToCoordinate(bars[cursor].time as never) : null;
  const showModel = (right || revealed) && target !== null;
  // A tap or a tiny scribble isn't a line: it must run at least this far across
  const xs = points.map((p) => p.x);
  const spans = points.length > 1 && Math.max(...xs) - Math.min(...xs) >= MIN_LINE_PX;
  const keyboardPhase = placed.sell === undefined && !answered;

  return (
    <>
      <p className={styles.question}>{q.question}</p>
      <p className={styles.sr} role="status">
        {say}
      </p>
      <div className={styles.stage} ref={stageRef}>
        <LessonChart
          scene={scene}
          tall
          revealed={false}
          onReady={onReady}
          fallback={<LessonArt id={scene.fallback} />}
        />
        <div
          className={styles.overlay}
          role="group"
          tabIndex={0}
          aria-label="Drawing area. Draw one line from the buy to the sell. With a keyboard, move over the days with Left and Right, and press Enter to place the buy, then the sell."
          onPointerDown={(e) => {
            if (answered) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drawing.current = true;
            setPlaced({});
            setByKeyboard(false);
            setPoints([at(e)]);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || answered) return;
            const p = at(e);
            // Past the cap the last point follows the finger, so the line still ends where it does
            setPoints((cur) => (cur.length >= MAX_POINTS ? [...cur.slice(0, -1), p] : [...cur, p]));
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          onKeyDown={onKeyDown}
          {...guide('lesson.draw-area')}
        >
          <svg className={styles.svg} aria-hidden="true" focusable="false">
            {keyboardPhase && markerX !== null && (
              <line
                x1={markerX}
                x2={markerX}
                y1={0}
                y2={height}
                stroke={color.amber}
                strokeDasharray="4 4"
              />
            )}
            {showModel && target && (
              <polyline
                points={toPoints(target.path)}
                fill="none"
                stroke={color.green}
                strokeWidth={3}
                strokeDasharray="2 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.length > 1 && (
              <polyline
                points={toPoints(points)}
                fill="none"
                stroke={color.purpleLight}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </div>
      <div className={styles.tools}>
        <button
          type="button"
          className={styles.trash}
          aria-label="Clear the line"
          disabled={answered || (points.length === 0 && placed.buy === undefined)}
          onClick={clear}
          {...guide('lesson.draw-clear')}
        >
          <Trash aria-hidden="true" size={22} weight="duotone" />
        </button>
      </div>
      <button
        type="button"
        className={styles.hint}
        aria-expanded={hint}
        onClick={() => setHint((h) => !h)}
        {...guide('lesson.draw-hint')}
      >
        <Lightbulb aria-hidden="true" size={20} weight="duotone" />
        <span>Stuck? Use a hint</span>
      </button>
      {hint && <p className={styles.hintText}>{draw.hint}</p>}
      <BoardFooter
        right={answered ? right : undefined}
        ready={spans && target !== null}
        onCheck={check}
        revealed={revealed}
        revisit={revisit}
        revisitLabel="Our path, dotted:"
        explain={q.explain}
        onRetry={
          onRetry &&
          (() => {
            clear();
            onRetry();
          })
        }
      />
    </>
  );
}
