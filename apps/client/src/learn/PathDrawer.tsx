/**
 * The learning map, "Crypto trading path" (owner's visual Q&A 2026-10-24; renamed, and a vertical
 * rail of our own in place of the zig-zag, 2026-11-12): opened from the Route button beside the
 * avatar, a 400 px drawer on the right over the dimmed dashboard, full screen on phones. Chapters
 * scroll by under a sticky band; each is a rail of stops walked in order (`learn/path.ts` holds the
 * rules), reading stops round and hands-on stops square, as the legend says. A second tab keeps the Library — articles are reference
 * material and are never locked — and the habit badges.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { BookText, Flame, X } from 'lucide-react';
import { learnApi } from '@crypto-dashboard/sdk';
import type { HabitsResponse } from '@crypto-dashboard/sdk';
import { useNavigate } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { guide } from '@/lib/guideAnchors';
import { bg, color } from '@/lib/tokens';
import { TOUR_MIN_WIDTH } from '@/guide/LearnCard';
import { getLesson } from '@/guide/lessons';
import { startLesson, startTour } from '@/guide/afterNote';
import { useTourStore } from '@/guide/tourStore';
import { trapFocus } from '@/lib/trapFocus';
import { useAuthStore } from '@/store/authStore';
import { LibraryTab } from './LibraryTab';
import { MODE_LABEL, type ChapterView, type NodeKind, type NodeView } from './path';
import { NodeIcon, PathNode } from './PathNode';
import { usePathStore } from './pathStore';
import { usePathView } from './usePathView';
import styles from './PathDrawer.module.css';

type Tab = 'path' | 'library';

const TABS: { id: Tab; label: string }[] = [
  { id: 'path', label: 'Path' },
  { id: 'library', label: 'Library' },
];

// ─── A chapter ───────────────────────────────────────────────────────────────

/** What a chapter teaches: its stops with their minutes, and what each lesson lets you do */
function ChapterOverview({ nodes }: { nodes: NodeView[] }) {
  const canDo = nodes.flatMap((v) =>
    v.node.kind === 'lesson' ? getLesson(v.node.id).canDo.map((c) => c.text) : []
  );
  return (
    <div className={styles.overview} {...guide('path.chapter.overview')}>
      <ul className={styles.overviewList}>
        {nodes.map((v) => (
          <li key={v.key}>
            <NodeIcon kind={v.node.kind} mode={v.mode} size={14} /> {v.title}
            <span className={styles.rowMeta}>
              {' '}
              · {MODE_LABEL[v.mode]} · about {v.minutes} min
            </span>
          </li>
        ))}
      </ul>
      {canDo.length > 0 && (
        <>
          <p className={styles.overviewHead}>After this chapter you can</p>
          <ul className={styles.overviewList}>
            {canDo.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface ChapterSectionProps {
  view: ChapterView;
  wide: boolean;
  started: boolean;
  onStart: (view: NodeView) => void;
  onSkipTour: (view: NodeView) => void;
}

function ChapterSection({ view, wide, started, onStart, onSkipTour }: ChapterSectionProps) {
  const [overview, setOverview] = useState(false);
  const { chapter } = view;
  const soon = chapter.status === 'soon';
  // The chapter's colour, and dark ink on a light one (white on green is ~2:1)
  const toneStyle = {
    '--tone': color[chapter.tone],
    '--tone-ink': chapter.tone === 'green' ? bg.page : color.white,
  } as CSSProperties;
  const checkpoint = view.nodes.find((n) => n.node.kind === 'checkpoint');
  const firstLocked = view.nodes.findIndex((n) => n.state === 'locked');
  const headingId = `path-chapter-${chapter.id}`;

  return (
    <section
      className={`${styles.chapter}${soon || view.locked ? ` ${styles.chapterMuted}` : ''}`}
      aria-labelledby={headingId}
      style={toneStyle}
      {...guide('path.chapter', chapter.id)}
    >
      <div className={styles.band}>
        <div className={styles.bandText}>
          <h3 id={headingId} className={styles.bandTitle}>
            {chapter.title}
          </h3>
          <p className={styles.bandMeta}>
            Chapter {chapter.number}
            {soon
              ? ' · Coming soon'
              : ` · ${view.done} of ${view.nodes.length} done${view.locked ? ' · Locked' : ''}`}
          </p>
        </div>
        {!soon && (
          <button
            type="button"
            className={styles.bandButton}
            aria-label={`What chapter ${chapter.number} covers`}
            aria-expanded={overview}
            onClick={() => setOverview((o) => !o)}
            {...guide('path.chapter.info', chapter.id)}
          >
            <BookText size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      {overview && <ChapterOverview nodes={view.nodes} />}

      {chapter.status === 'soon' ? (
        <ul className={styles.stops} aria-label={`Chapter ${chapter.number}, coming soon`}>
          {chapter.preview.map((node) => (
            <SoonStop key={node.title} kind={node.kind} title={node.title} />
          ))}
        </ul>
      ) : (
        <>
          {view.locked && (
            <p className={styles.hint}>
              Pass the checkpoint of chapter {chapter.number - 1} to open this chapter.
            </p>
          )}
          <ul className={styles.stops}>
            {view.nodes.map((node, i) => (
              <ChapterStop
                key={node.key}
                node={node}
                previous={i > 0 ? view.nodes[i - 1].title : null}
                testOut={i === firstLocked && checkpoint ? checkpoint : null}
                wide={wide}
                started={started}
                onStart={onStart}
                onSkipTour={onSkipTour}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface SoonStopProps {
  kind: NodeKind;
  title: string;
}

function SoonStop({ kind, title }: SoonStopProps) {
  return (
    <li className={styles.stop} data-state="soon">
      <span className={styles.stopRow}>
        <span className={`${styles.node} ${styles.soon}`} aria-hidden="true">
          <NodeIcon kind={kind} />
        </span>
        <span className={styles.card}>
          <span className={styles.caption}>{title}</span>
          <span className={styles.meta}>Coming soon</span>
        </span>
      </span>
    </li>
  );
}

interface ChapterStopProps {
  node: NodeView;
  previous: string | null;
  /** The chapter's checkpoint, offered under the first locked stop */
  testOut: NodeView | null;
  wide: boolean;
  started: boolean;
  onStart: (view: NodeView) => void;
  onSkipTour: (view: NodeView) => void;
}

function ChapterStop({
  node,
  previous,
  testOut,
  wide,
  started,
  onStart,
  onSkipTour,
}: ChapterStopProps) {
  return (
    <>
      <PathNode
        view={node}
        wide={wide}
        started={started}
        previousTitle={previous}
        onStart={onStart}
        onSkipTour={onSkipTour}
      />
      {testOut && testOut.state === 'open' && (
        <li className={styles.testOut}>
          Already know this?{' '}
          <button
            type="button"
            className={styles.noteAction}
            onClick={() => onStart(testOut)}
            {...guide('path.test-out')}
          >
            Take the checkpoint
          </button>
        </li>
      )}
    </>
  );
}

// ─── The drawer ──────────────────────────────────────────────────────────────

export function PathDrawer() {
  const navigate = useNavigate();
  const open = useTourStore((s) => s.panelOpen);
  const wide = useMediaQuery(TOUR_MIN_WIDTH);
  const accessToken = useAuthStore((s) => s.accessToken);
  const view = usePathView();
  const [tab, setTab] = useState<Tab>('path');
  const [habits, setHabits] = useState<HabitsResponse | null>(null);
  const [habitsError, setHabitsError] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  // Habits are counted on the server: read whenever the map opens, and again after a new finish
  const finished = view.chapters.reduce((n, c) => n + c.done, 0);
  useEffect(() => {
    if (!open || !accessToken) return;
    let cancelled = false;
    learnApi
      .getHabits(accessToken)
      .then((r) => {
        if (cancelled) return;
        setHabits(r);
        setHabitsError(false);
      })
      .catch(() => {
        if (!cancelled) setHabitsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accessToken, finished]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useTourStore.getState().closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // The drawer takes the focus, and the next step scrolls into view
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    drawer?.focus();
    if (tab === 'path') {
      drawer?.querySelector('[data-state="current"]')?.scrollIntoView?.({ block: 'center' });
    }
  }, [open, tab]);

  if (!open) return null;

  const close = () => useTourStore.getState().closePanel();
  const started = finished > 0;

  const start = ({ node }: NodeView) => {
    close();
    switch (node.kind) {
      // As an article's links (`afterNote.ts`): the journal line first, one lesson or tour on screen
      case 'lesson':
        startLesson(node.id);
        return;
      case 'tour':
        startTour(node.id, navigate);
        return;
      case 'checkpoint':
        usePathStore.getState().startCheckpoint(node.id);
    }
  };

  const skipTour = ({ node }: NodeView) => {
    if (node.kind === 'tour') usePathStore.getState().skipTour(node.id);
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-title"
        tabIndex={-1}
        // Tab stays inside the drawer while it's open
        onKeyDown={(e) => trapFocus(e, drawerRef.current)}
        {...guide('path.drawer')}
      >
        <div className={styles.head}>
          <h2 id="path-title" className={styles.title}>
            Crypto trading path
          </h2>
          {habits && habits.streakDays > 0 && (
            <span
              className={styles.streak}
              title={`${habits.streakDays}-day learning streak`}
              {...guide('learn.streak')}
            >
              <Flame size={14} aria-hidden="true" />
              {habits.streakDays}
              <span className={styles.srOnly}> -day learning streak</span>
            </span>
          )}
          <button
            type="button"
            className={styles.close}
            aria-label="Close the learning path"
            onClick={close}
            {...guide('path.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className={styles.progressRow}>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Path progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.percent}
            {...guide('path.progress')}
          >
            <div className={styles.progressFill} style={{ width: `${view.percent}%` }} />
          </div>
          <span className={styles.percent}>{view.percent}%</span>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Learning">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`path-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="path-tabpanel"
              className={`${styles.tab}${tab === t.id ? ` ${styles.tabOn}` : ''}`}
              onClick={() => setTab(t.id)}
              {...guide('path.tab', t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          id="path-tabpanel"
          className={styles.body}
          role="tabpanel"
          aria-labelledby={`path-tab-${tab}`}
        >
          {tab === 'path' ? (
            <>
              <p className={styles.intro}>
                Short lessons, then practice on the real screen. Nothing here uses real money.
              </p>
              <ul className={styles.legend} aria-label="Kinds of stop" {...guide('path.legend')}>
                <li>
                  <span
                    className={`${styles.legendMark} ${styles.legendRead}`}
                    aria-hidden="true"
                  />
                  Read: cards and articles
                </li>
                <li>
                  <span
                    className={`${styles.legendMark} ${styles.legendHands}`}
                    aria-hidden="true"
                  />
                  Hands-on: you try it yourself
                </li>
              </ul>
              {view.chapters.map((c) => (
                <ChapterSection
                  key={c.chapter.id}
                  view={c}
                  wide={wide}
                  started={started}
                  onStart={start}
                  onSkipTour={skipTour}
                />
              ))}
            </>
          ) : (
            <LibraryTab habits={habits} habitsError={habitsError} />
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
