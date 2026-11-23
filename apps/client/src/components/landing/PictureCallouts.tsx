import { useId } from 'react';
import { ArrowUp } from 'lucide-react';

import lessonShot from '@/assets/landing/shot-lesson.webp';
import styles from './PictureCallouts.module.css';

interface Callout {
  title: string;
  points: readonly string[];
}

interface PictureCalloutsProps {
  /** The learning path (the lesson card) */
  learn: Callout;
  /** The live chart and practice desk (the chart) */
  chart: Callout;
  alt: string;
}

function PostIt({ callout, tone }: { callout: Callout; tone: 'amber' | 'pink' }) {
  return (
    <div className={`${styles.postit} ${styles[tone]}`}>
      <span className={styles.tape} aria-hidden="true" />
      <h3 className={styles.postTitle}>{callout.title}</h3>
      <ul className={styles.postList}>
        {callout.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The app in one picture (owner 2026-11-23): the lesson screenshot with two big arrows leaving it, one
 * from the chart to a post-it about the live chart and practice desk, one from the lesson card to a
 * post-it about the learning path. The arrows are only a picture; the post-its are plain lists. On a
 * phone the post-its sit under the picture, each with a short arrow up to it.
 */
export function PictureCallouts({ learn, chart, alt }: PictureCalloutsProps) {
  // Marker ids are document-wide: one set per instance
  const uid = useId();
  const pink = `${uid}-pink`;
  const amber = `${uid}-amber`;
  return (
    <div className={styles.wrap}>
      <div className={styles.device}>
        <div className={styles.bar} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
        <img
          src={lessonShot}
          width={1100}
          height={657}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={styles.image}
        />
      </div>

      {/* Desktop arrows: one from the chart (left of the lesson card), one from the lesson card */}
      <svg
        className={styles.arrows}
        viewBox="0 0 1000 340"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id={pink}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-brand-grad-from)" />
          </marker>
          <marker
            id={amber}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-brand-amber)" />
          </marker>
        </defs>
        <path
          d="M232 150 C 262 60, 300 190, 318 205"
          fill="none"
          stroke="var(--color-brand-grad-from)"
          strokeWidth="7"
          strokeLinecap="round"
          markerEnd={`url(#${pink})`}
        />
        <path
          d="M768 150 C 700 70, 640 120, 582 170"
          fill="none"
          stroke="var(--color-brand-amber)"
          strokeWidth="7"
          strokeLinecap="round"
          markerEnd={`url(#${amber})`}
        />
      </svg>

      {/* Phone: the post-its sit under the picture, each with a short arrow up at it */}
      <div className={`${styles.note} ${styles.noteLeft}`}>
        <ArrowUp className={styles.up} aria-hidden="true" />
        <PostIt callout={chart} tone="pink" />
      </div>
      <div className={`${styles.note} ${styles.noteRight}`}>
        <ArrowUp className={styles.up} aria-hidden="true" />
        <PostIt callout={learn} tone="amber" />
      </div>
    </div>
  );
}
