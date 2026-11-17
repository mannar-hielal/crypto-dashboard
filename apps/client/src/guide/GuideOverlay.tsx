/**
 * The guided tour: a ring around the real control and a bubble beside it (owner's visual Q&A
 * 2026-10-11 — the page is not dimmed, the learner clicks the real thing). A step moves on when the
 * learner does it: a click on the control, a value typed into it, the pointer on the candle a
 * `hover` step asks for (guide/chartHover.ts), or the Next button on a step that only reads. The overlay changes nothing in the app: when a control isn't on screen it says
 * what to open.
 */

import { AnswerResult } from './AnswerResult';
import { useTourWide } from './useTourWide';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from 'lucide-react';
import { guide, guideSelector } from '@/lib/guideAnchors';
import { placeBubble, type Box } from './bubblePlacement';
import { matchesHover, newestCandleBox, onHover } from './chartHover';
import { useTourStore } from './tourStore';
import { backIndex, getTour, type TourStep, tourSteps } from './tours';
import styles from './GuideOverlay.module.css';

const RING_PAD = 3;
const ARROW_SIZE = 30;
/** Gap between the ring and the arrow, so the two never merge into one shape */
const ARROW_GAP = 10;

type ArrowSide = 'left' | 'right' | 'above' | 'below';
const ARROW_CLASS = {
  left: 'arrowLeft',
  right: 'arrowRight',
  above: 'arrowAbove',
  below: 'arrowBelow',
} as const;

/** Beside the control, in the free space (never over the text above it); above or below only
 *  when the control has no room at either side. A candle is pointed at from above (below when
 *  it's at the top of the chart), like a marker on the chart. */
function arrowSideFor(
  rect: Box,
  bubble: 'below' | 'above' | 'inside' | 'center',
  candle = false
): ArrowSide {
  const room = ARROW_GAP + ARROW_SIZE + RING_PAD + 8;
  if (candle) return rect.top >= room ? 'above' : 'below';
  if (rect.left >= room) return 'left';
  if (rect.left + rect.width + room <= window.innerWidth) return 'right';
  return bubble === 'above' || rect.top < room ? 'below' : 'above';
}

function arrowPosition(rect: Box, side: ArrowSide): { top: number; left: number } {
  const offset = RING_PAD + ARROW_GAP + ARROW_SIZE;
  const midX = rect.left + rect.width / 2 - ARROW_SIZE / 2;
  const midY = rect.top + rect.height / 2 - ARROW_SIZE / 2;
  if (side === 'left') return { top: midY, left: rect.left - offset };
  if (side === 'right') return { top: midY, left: rect.left + rect.width + RING_PAD + ARROW_GAP };
  if (side === 'above') return { top: rect.top - offset, left: midX };
  return { top: rect.top + rect.height + RING_PAD + ARROW_GAP, left: midX };
}
const BUBBLE_WIDTH = 340;
/** After a submit click, how long to wait for the order to be accepted before giving up */
const ACCEPT_TIMEOUT_MS = 15_000;
/** A `hover: 'last'` step: how long the pointer rests on the newest candle (a pass-over isn't reading) */
const HOVER_HOLD_MS = 1000;
/** How long "Done ✓" shows before a checked task moves on */
const DONE_PAUSE_MS = 700;

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

interface Tracked {
  rect: Box | null;
  /** The value of the target if it is an input, else '' */
  value: string;
  /** The value of the `doneWhenEmpty` input; null while it is not on screen */
  doneValue: string | null;
  /** `rect` is the newest candle (a `hover: 'last'` step), not the whole anchor */
  candle: boolean;
}

const NONE: Tracked = { rect: null, value: '', doneValue: null, candle: false };

/** Follows the step's control every frame (the form animates open, panes resize, tabs switch) */
function useTracked(step: TourStep): Tracked {
  const [tracked, setTracked] = useState<Tracked>(NONE);
  const selector = step.anchor ? guideSelector(step.anchor, step.key) : null;
  const doneSelector = step.doneWhenEmpty ? guideSelector(step.doneWhenEmpty) : null;
  const pointAtNewest = step.kind === 'hover' && step.hover === 'last';

  useEffect(() => {
    let raf = 0;
    let scrolled = false;
    const tick = () => {
      const el = selector ? document.querySelector<HTMLElement>(selector) : null;
      let rect: Box | null = null;
      let value = '';
      let candle = false;
      if (el) {
        const r = el.getBoundingClientRect();
        // Zero-size = present but hidden (the order form is mounted while closed)
        if (r.width > 0 && r.height > 0) {
          rect = { top: r.top, left: r.left, width: r.width, height: r.height };
          if (!scrolled) {
            scrolled = true;
            if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
          }
        }
        if (el instanceof HTMLInputElement) value = el.value;
        // The newest candle, when it's on screen; else the whole chart, as before
        const newest = rect && pointAtNewest ? newestCandleBox(el) : null;
        if (newest) {
          rect = newest;
          candle = true;
        }
      }
      const doneEl = doneSelector ? document.querySelector<HTMLInputElement>(doneSelector) : null;
      const doneValue = doneEl ? doneEl.value : null;
      setTracked((prev) =>
        sameBox(prev.rect, rect) &&
        prev.value === value &&
        prev.doneValue === doneValue &&
        prev.candle === candle
          ? prev
          : { rect, value, doneValue, candle }
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selector, doneSelector, pointAtNewest]);

  return tracked;
}

function StepView({ stepIndex }: { stepIndex: number }) {
  const activeId = useTourStore((s) => s.activeId);
  const quizAnswer = useTourStore((s) => s.quizAnswer);
  const { next, back, close, answerQuiz } = useTourStore.getState();
  const wide = useTourStore((s) => s.wide);
  const seen = useTourStore((s) => s.seen);
  const tour = activeId ? getTour(activeId) : null;
  const steps = tour ? tourSteps(tour, wide) : [];
  const step = steps[stepIndex];
  // Back only where it goes somewhere (never onto a phone step already done)
  const canGoBack = backIndex(steps, stepIndex, seen) !== null;

  if (!tour || !step) return null;
  return (
    <TourBubble
      key={step.id}
      title={tour.title}
      step={step}
      index={stepIndex}
      total={steps.length}
      quizAnswer={quizAnswer}
      onNext={next}
      onBack={back}
      canGoBack={canGoBack}
      onClose={close}
      onAnswer={answerQuiz}
    />
  );
}

interface BubbleProps {
  title: string;
  step: TourStep;
  index: number;
  total: number;
  quizAnswer: number | null;
  onNext: () => void;
  onBack: () => void;
  /** Back goes somewhere from this step */
  canGoBack: boolean;
  onClose: () => void;
  onAnswer: (index: number) => void;
}

function TourBubble({
  title,
  step,
  index,
  total,
  quizAnswer,
  onNext,
  onBack,
  canGoBack,
  onClose,
  onAnswer,
}: BubbleProps) {
  const tracked = useTracked(step);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: BUBBLE_WIDTH, height: 180 });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  /** After the click on a `doneWhenEmpty` step: waiting for the order to be accepted */
  const [awaiting, setAwaiting] = useState<{ since: number; hadValue: boolean } | null>(null);
  /** A `hover` step's task is done: "Done ✓" shows, then the tour moves on */
  const [hoverDone, setHoverDone] = useState(false);

  const onScreen = tracked.rect !== null;
  const hasTarget = step.anchor !== undefined;
  const missing = hasTarget && !onScreen;

  // ── Measure the bubble and the viewport ───────────────────────────────────
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [missing, quizAnswer]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Esc closes; a click on the step's control advances a `click` step ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const advance = useCallback(() => {
    // After the click's own handlers have run, so the app has done what the control does
    window.setTimeout(onNext, 0);
  }, [onNext]);

  useEffect(() => {
    if (step.kind !== 'click' || !step.anchor) return;
    const selector = guideSelector(step.anchor, step.key);
    const onClick = (e: MouseEvent) => {
      const el = document.querySelector(selector);
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      if (step.doneWhenEmpty) {
        const input = document.querySelector<HTMLInputElement>(guideSelector(step.doneWhenEmpty));
        setAwaiting({ since: Date.now(), hadValue: !!input && input.value !== '' });
      } else {
        advance();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [step, advance]);

  // A `hover` step: done when the pointer is on the asked-for candle (held a moment on the newest)
  useEffect(() => {
    if (step.kind !== 'hover' || !step.hover || hoverDone) return;
    const want = step.hover;
    let hold: number | undefined;
    const unsubscribe = onHover((bar) => {
      if (!matchesHover(want, bar)) {
        window.clearTimeout(hold);
        hold = undefined;
        return;
      }
      if (want !== 'last') setHoverDone(true);
      else if (hold === undefined)
        hold = window.setTimeout(() => setHoverDone(true), HOVER_HOLD_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(hold);
    };
  }, [step, hoverDone]);

  useEffect(() => {
    if (!hoverDone) return;
    const t = window.setTimeout(onNext, DONE_PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [hoverDone, onNext]);

  // An accepted order empties the amount field (the form's own signal); a refused one doesn't
  useEffect(() => {
    if (!awaiting) return;
    if (awaiting.hadValue && tracked.doneValue === '') {
      // The step is replaced (and this bubble unmounted) by the move on
      advance();
      return;
    }
    const t = window.setTimeout(() => setAwaiting(null), ACCEPT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [awaiting, tracked.doneValue, advance]);

  const placement = placeBubble(missing || !hasTarget ? null : tracked.rect, size, viewport);

  const canNext =
    step.kind === 'observe' ||
    (step.kind === 'type' && tracked.value.trim() !== '') ||
    (step.kind === 'quiz' && quizAnswer !== null);
  const isLast = index === total - 1;
  const nextLabel =
    step.kind === 'quiz' ? 'Finish' : (step.nextLabel ?? (isLast ? 'Finish' : 'Next →'));

  // The learner has to act on this step (click, type or point), not just read it
  const isAction = step.kind === 'click' || step.kind === 'type' || step.kind === 'hover';
  const arrowSide = tracked.rect
    ? arrowSideFor(tracked.rect, placement.placement, tracked.candle)
    : 'left';

  return createPortal(
    <>
      {onScreen && tracked.rect && (
        <div
          className={isAction ? `${styles.ring} ${styles.ringAction}` : styles.ring}
          aria-hidden="true"
          data-tour-ring={tracked.candle ? 'candle' : ''}
          style={{
            top: tracked.rect.top - RING_PAD,
            left: tracked.rect.left - RING_PAD,
            width: tracked.rect.width + RING_PAD * 2,
            height: tracked.rect.height + RING_PAD * 2,
          }}
        />
      )}
      {isAction && onScreen && tracked.rect && (
        <div
          className={`${styles.arrow} ${styles[ARROW_CLASS[arrowSide]]}`}
          aria-hidden="true"
          data-tour-arrow={arrowSide}
          style={arrowPosition(tracked.rect, arrowSide)}
        >
          {arrowSide === 'left' && <ArrowRight size={ARROW_SIZE} strokeWidth={3} />}
          {arrowSide === 'right' && <ArrowLeft size={ARROW_SIZE} strokeWidth={3} />}
          {arrowSide === 'above' && <ArrowDown size={ARROW_SIZE} strokeWidth={3} />}
          {arrowSide === 'below' && <ArrowUp size={ARROW_SIZE} strokeWidth={3} />}
        </div>
      )}
      <div
        ref={bubbleRef}
        className={styles.bubble}
        role="dialog"
        aria-label={title}
        style={{ top: placement.top, left: placement.left }}
        {...guide('tour.bubble')}
      >
        {isAction && <p className={styles.turn}>Your turn</p>}
        <div className={styles.head}>
          <span className={styles.counter}>
            {title} · Step {index + 1} of {total}
          </span>
          <button
            type="button"
            className={styles.close}
            aria-label="Close the tour"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {step.kind === 'quiz' && step.quiz ? (
          <>
            <p className={styles.question}>{step.quiz.question}</p>
            <div className={styles.options}>
              {step.quiz.options.map((option, i) => {
                const answered = quizAnswer !== null;
                const cls = !answered
                  ? styles.option
                  : i === step.quiz!.correct
                    ? `${styles.option} ${styles.right}`
                    : i === quizAnswer
                      ? `${styles.option} ${styles.wrong}`
                      : styles.option;
                return (
                  <button
                    key={option}
                    type="button"
                    className={cls}
                    disabled={answered}
                    onClick={() => onAnswer(i)}
                    {...guide('tour.quiz-option', String(i))}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {quizAnswer !== null && (
              <AnswerResult
                right={quizAnswer === step.quiz.correct}
                explain={step.quiz.explain}
                className={styles.explain}
              />
            )}
          </>
        ) : (
          <>
            <p className={styles.text}>{step.text}</p>
            {step.suggest && step.kind === 'type' && (
              <p className={styles.suggest}>Try {step.suggest}.</p>
            )}
            {step.liveNote && !missing && (
              <p className={styles.live}>You should see: {step.liveNote}</p>
            )}
            {missing && (
              <p className={styles.missing}>
                {step.missingHint ?? 'This part of the app is not on screen yet.'}
              </p>
            )}
            {awaiting && <p className={styles.live}>Waiting for the order to go through…</p>}
            {hoverDone && (
              <p className={styles.done} role="status" {...guide('tour.done')}>
                Done ✓
              </p>
            )}
          </>
        )}

        <div className={styles.foot}>
          {canGoBack && (
            <button type="button" className={styles.link} onClick={onBack} {...guide('tour.back')}>
              ← Back
            </button>
          )}
          <button type="button" className={styles.link} onClick={onClose} {...guide('tour.skip')}>
            Skip tour
          </button>
          {step.kind === 'hover' && !hoverDone && (
            // Pointing needs a mouse; a keyboard or touch learner moves on without it
            <button
              type="button"
              className={styles.link}
              onClick={onNext}
              {...guide('tour.skip-step')}
            >
              Skip this step
            </button>
          )}
          <span className={styles.spacer} />
          {(step.kind === 'observe' || step.kind === 'type' || step.kind === 'quiz') && (
            <button
              type="button"
              className={styles.primary}
              disabled={!canNext}
              onClick={onNext}
              {...guide('tour.next')}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

export function GuideOverlay() {
  const activeId = useTourStore((s) => s.activeId);
  const stepIndex = useTourStore((s) => s.stepIndex);
  // A rotation or resize across the tours' width mid-tour: that layout's steps, from this one on
  const wide = useTourWide();
  useEffect(() => {
    if (activeId) useTourStore.getState().setWide(wide);
  }, [activeId, wide]);
  if (!activeId) return null;
  return <StepView key={activeId} stepIndex={stepIndex} />;
}
