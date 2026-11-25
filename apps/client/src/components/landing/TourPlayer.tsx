import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Pause, Play } from 'lucide-react';

import { TOURS, type Tour } from '@/lib/howItWorksContent';
import styles from './TourPlayer.module.css';

// The clips are recordings of the running app (Playwright, a throwaway account, 2026-11-23): `<id>.mp4`
// (H.264, muted, 10-20 s) and a `<id>.webp` poster in assets/landing/tours/. A tour whose files are missing
// shows its steps only.
const FILES = import.meta.glob('@/assets/landing/tours/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function fileFor(id: Tour['id'], ext: string): string | undefined {
  const key = Object.keys(FILES).find((k) => k.endsWith(`/${id}.${ext}`));
  return key ? FILES[key] : undefined;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// How far the clip zooms in on a click: less on a phone, whose frame is already narrow
const ZOOM_SCALE = { desktop: 1.8, phone: 1.4 } as const;
const DEFAULT_HOLD = 1.4;

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined';

/** The clip of the open tour: muted, looping, loaded only when it nears the screen, paused when it leaves */
function Clip({ tour }: { tour: Tour }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // A pause the visitor chose stays: scrolling away and back does not restart the clip
  const userPaused = useRef(false);
  // No observer (an old browser): the clip counts as near and on screen, so it still loads
  const [near, setNear] = useState(!HAS_OBSERVER);
  const [onScreen, setOnScreen] = useState(!HAS_OBSERVER);
  const [playing, setPlaying] = useState(false);
  const mp4 = fileFor(tour.id, 'mp4');
  const poster = fileFor(tour.id, 'webp');

  // Load the clip when its box is close to the screen; it plays only while it is on screen
  useEffect(() => {
    const el = box.current;
    if (!el || !HAS_OBSERVER) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
        setOnScreen(e.isIntersecting);
      },
      { rootMargin: '200px', threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The video is keyed on `near`, so its source exists when this runs
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (onScreen && near && !userPaused.current && !reducedMotion()) {
      void v.play?.()?.catch(() => undefined);
    } else {
      v.pause();
    }
  }, [onScreen, near, tour.id]);

  // Zoom in on each click while the clip plays: the active point comes from the clip's time and goes
  // straight onto the video's style (no React state, no re-render per frame). Not with reduced motion.
  useEffect(() => {
    const v = video.current;
    if (!v || !playing || reducedMotion()) return;
    const scale = ZOOM_SCALE[tour.device];
    let raf = 0;
    let shown = -1;
    const tick = () => {
      const t = v.currentTime;
      const i = tour.zoom.findIndex((z) => t >= z.at && t < z.at + (z.hold ?? DEFAULT_HOLD));
      if (i !== shown) {
        shown = i;
        if (i < 0) {
          v.style.transform = '';
        } else {
          const z = tour.zoom[i];
          // Pan as well as zoom: put the spot in the middle of the view, never past the clip's edge
          const sc = z.scale ?? scale;
          const tx = Math.min(0, Math.max(1 - sc, 0.5 - sc * z.x)) * 100;
          const ty = Math.min(0, Math.max(1 - sc, 0.5 - sc * z.y)) * 100;
          v.style.transform = `translate(${tx}%, ${ty}%) scale(${sc})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v.style.transform = '';
    };
  }, [playing, near, tour]);

  if (!mp4) {
    return <div className={styles.empty}>This tour's clip is on its way.</div>;
  }

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      void v.play?.()?.catch(() => undefined);
    } else {
      userPaused.current = true;
      v.pause();
    }
  };

  return (
    <div ref={box} className={styles.clip}>
      <video
        ref={video}
        key={`${tour.id}-${near}`}
        className={styles.video}
        poster={poster}
        muted
        loop
        playsInline
        preload={near ? 'auto' : 'none'}
        aria-label={`Clip: ${tour.title}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {near && <source src={mp4} type="video/mp4" />}
      </video>
      <button type="button" className={styles.playBtn} onClick={toggle}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span className={styles.srOnly}>{playing ? 'Pause the clip' : 'Play the clip'}</span>
      </button>
    </div>
  );
}

/**
 * Little tours of the real app (owner 2026-11-23): five short recordings, some on a desktop and some on
 * a phone, one open at a time, each with its steps in words beside it.
 */
export function TourPlayer() {
  const [id, setId] = useState<Tour['id']>(TOURS[0].id);
  const tour = TOURS.find((t) => t.id === id) ?? TOURS[0];
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys, Home and End move between the tabs (the open one is the only tab stop)
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const last = TOURS.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TOURS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TOURS.length) % TOURS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setId(TOURS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div className={styles.player}>
      <div className={styles.tabs} role="tablist" aria-label="Tours">
        {TOURS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`tour-tab-${t.id}`}
            aria-selected={t.id === id}
            aria-controls="tour-panel"
            tabIndex={t.id === id ? 0 : -1}
            className={styles.tab}
            onClick={() => setId(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.tab}
          </button>
        ))}
      </div>
      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${tour.id}`}
        className={styles.panel}
      >
        <div
          className={`${styles.frame} ${tour.device === 'phone' ? styles.phone : styles.desktop}`}
        >
          <Clip key={tour.id} tour={tour} />
        </div>
        <div className={styles.copy}>
          <p className={styles.device}>
            {tour.device === 'phone' ? 'On a phone' : 'Better viewed on desktop'}
          </p>
          <h3 className={styles.title}>{tour.title}</h3>
          <ol className={styles.steps}>
            {tour.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
