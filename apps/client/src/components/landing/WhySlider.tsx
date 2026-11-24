import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import styles from './WhySlider.module.css';

// How many colours the slides cycle through (WhySlider.module.css: .tone0 to .tone4)
const TONES = 5;
// The phone's thickness: this many slices of 2 px (WhySlider.module.css: .slice)
const SLICES = 12;
// After a slide change the wheel sleeps this long, so one flick of a trackpad moves one slide
const WHEEL_SLEEP_MS = 650;
// ...and stays asleep until the wheel has been quiet this long (a trackpad's momentum keeps sending)
const QUIET_MS = 220;
// A swipe or wheel flick must pass this many pixels to count
const SWIPE_PX = 40;

export interface WhySlide {
  id: string;
  title: string;
  /** A real capture of the app on the phone: decorative, the text says it all */
  image: { src: string; width: number; height: number };
  /** Short bullets: a bold lead and, if needed, a few words more */
  bullets: readonly { lead: string; text?: string }[];
  /** One closing line under the bullets */
  note?: string;
}

/**
 * The "Why" section as a vertical slider (owner 2026-11-24, after the mouse-wheel demo on splidejs.com):
 * one big slide at a time, on a real capture of the app under a coloured glass. The mouse wheel, a swipe
 * up or down, the arrows and the dots all change the slide. The wheel and the swipe only take the
 * gesture while there is a slide in that direction: on the first slide scrolling up, and on the last
 * scrolling down, belong to the page again, and a zoom gesture or a sideways drag is never taken.
 * Inside the slider a vertical swipe moves the slides, so a visitor scrolls past it from its edge, with
 * the arrows, or by reaching the last slide. The text of every
 * slide stays in the page (the other slides are inert, so a screen reader skips them and a crawler
 * still reads them).
 */
export function WhySlider({ slides }: { slides: readonly WhySlide[] }) {
  const [index, setIndex] = useState(0);
  const base = useId();
  const stage = useRef<HTMLDivElement>(null);
  const asleep = useRef(false);
  const last = slides.length - 1;

  // The latest index for the native listeners below (they are added once)
  const at = useRef(index);
  useEffect(() => {
    at.current = index;
  }, [index]);

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(last, to));
      if (next === at.current) return false;
      at.current = next;
      setIndex(next);
      return true;
    },
    [last]
  );

  // Wheel and touch need non-passive listeners: only then can they keep the page from scrolling
  useEffect(() => {
    const el = stage.current;
    if (!el) return;

    let wake: ReturnType<typeof setTimeout> | undefined;
    const sleep = (ms: number) => {
      asleep.current = true;
      clearTimeout(wake);
      wake = setTimeout(() => {
        asleep.current = false;
      }, ms);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // a page zoom or a sideways gesture is not ours
      // The tail of a flick (momentum) lands in the sleep window: it is cancelled too, even at an end, so
      // one flick moves one slide and never carries the page past the slider. Every event of the tail
      // restarts a short quiet time, so the sleep ends only once the wheel has stopped.
      if (asleep.current) {
        e.preventDefault();
        sleep(QUIET_MS);
        return;
      }
      const dir = e.deltaY > 0 ? 1 : -1;
      const target = at.current + dir;
      if (target < 0 || target > last) return; // at an end: the page scrolls on
      e.preventDefault();
      // A mouse wheel may count in lines (Firefox) or pages: bring it to pixels before the dead zone
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (Math.abs(pixels) < 4) return;
      sleep(WHEEL_SLEEP_MS);
      go(target);
    };

    let startX = 0;
    let startY = 0;
    let moved = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // a pinch is a zoom, not a swipe
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
      moved = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      // Once this gesture has moved a slide the slider keeps it to the end, so the rest of the swipe never
      // carries the page along (the end-of-slider rule below applies before the slide moves)
      if (moved) {
        e.preventDefault();
        return;
      }
      const dy = startY - (e.touches[0]?.clientY ?? startY);
      const dx = startX - (e.touches[0]?.clientX ?? startX);
      if (Math.abs(dy) < Math.abs(dx)) return; // a sideways drag is not ours
      const target = at.current + (dy > 0 ? 1 : -1);
      if (target < 0 || target > last) return; // an end: the page scrolls on
      e.preventDefault(); // the slider takes this swipe
      if (!moved && Math.abs(dy) > SWIPE_PX) {
        moved = true;
        go(target);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      clearTimeout(wake);
    };
  }, [go, last]);

  // A mouse drags the slides: press, pull up (next) or down (previous). A finger is handled above.
  const drag = useRef<{ y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) < SWIPE_PX) return;
    drag.current = null;
    go(at.current + (dy < 0 ? 1 : -1));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent) => {
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? index + 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    // Only a key that moves a slide is taken; at an end the browser keeps it
    if (go(to)) e.preventDefault();
  };

  return (
    <div
      className={styles.slider}
      role="region"
      aria-roledescription="carousel"
      aria-label="Why this app exists"
      onKeyDown={onKey}
    >
      <button
        type="button"
        className={`${styles.arrow} ${styles.up}`}
        onClick={() => go(index - 1)}
        aria-disabled={index === 0}
        aria-label="Previous reason"
      >
        <ChevronUp aria-hidden="true" />
      </button>

      <div
        ref={stage}
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.track} style={{ transform: `translateY(${-index * 100}%)` }}>
          {slides.map((s, i) => {
            const active = i === index;
            return (
              <section
                key={s.id}
                id={`${base}-s${i}`}
                className={`${styles.slide} ${styles[`tone${i % TONES}`]}`}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
                inert={!active}
              >
                {/* A phone, turned toward the words: the capture is its screen (decorative) */}
                <div className={styles.phone} aria-hidden="true">
                  {/* a fixed, decorative stack: it never reorders, so the position is its identity */}
                  {Array.from({ length: SLICES }, (_, n) => (
                    <span
                      key={`slice-${n}`}
                      className={styles.slice}
                      style={
                        { transform: `translateZ(${-(n + 1) * 2}px)`, '--i': n } as CSSProperties
                      }
                    />
                  ))}
                  <span className={`${styles.key} ${styles.keyUp}`} />
                  <span className={`${styles.key} ${styles.keyDown}`} />
                  <span className={`${styles.key} ${styles.keyPower}`} />
                  <span className={styles.notch} />
                  <img
                    className={styles.image}
                    src={s.image.src}
                    width={s.image.width}
                    height={s.image.height}
                    alt=""
                    draggable={false}
                    // The first slide is wanted at once; the others can wait behind the page's own pictures
                    fetchPriority={i === 0 ? 'auto' : 'low'}
                    decoding="async"
                  />
                  <span className={styles.gloss} />
                </div>
                <div className={styles.copy}>
                  <h3 className={styles.title}>{s.title}</h3>
                  <ul className={styles.bullets}>
                    {s.bullets.map((b) => (
                      <li key={b.lead} className={styles.bullet}>
                        <strong>{b.lead}</strong>
                        {b.text && ` ${b.text}`}
                      </li>
                    ))}
                  </ul>
                  {s.note && <p className={styles.note}>{s.note}</p>}
                </div>
                <span className={styles.number} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </section>
            );
          })}
        </div>
      </div>

      <ol className={styles.dots} aria-label="Pick a reason">
        {slides.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={styles.dot}
              aria-label={`${i + 1}: ${s.title}`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          </li>
        ))}
      </ol>

      <button
        type="button"
        className={`${styles.arrow} ${styles.down}`}
        onClick={() => go(index + 1)}
        aria-disabled={index === last}
        aria-label="Next reason"
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <p className={styles.hint}>Scroll, swipe or use the arrows</p>
    </div>
  );
}
