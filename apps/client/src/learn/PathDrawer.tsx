/**
 * The learning map, "Crypto trading path" (owner's visual Q&A 2026-10-24; renamed 2026-11-12, and
 * the zig-zag kept after a vertical rail was tried and reverted the same day): opened from the
 * Route button beside the avatar, a 400 px drawer on the right over the dimmed dashboard, full
 * screen on phones. Chapters scroll by under a sticky band; each is a zig-zag of stops walked in
 * order (`learn/path.ts` holds the rules). A second tab keeps the Library — articles are reference
 * material and are never locked — and the habit badges.
 */

import { useHabits } from './useHabits';
import { useTourWide } from '@/guide/useTourWide';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { BookText, Flame, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { guide } from '@/lib/guideAnchors';
import { bg, color } from '@/lib/tokens';
import { getLesson } from '@/guide/lessons';
import { startLesson, startTour } from '@/guide/afterNote';
import { useTourStore } from '@/guide/tourStore';
import { trapFocus } from '@/lib/trapFocus';
import { useAuthStore } from '@/store/authStore';
import { LibraryTab } from './LibraryTab';
import { nodeOffset, onChart, type ChapterView, type NodeKind, type NodeView } from './path';
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

/** The dashed link between two stops, slanting with the zig-zag */
function Connector({ index }: { index: number }) {
  return (
    <li className={styles.connector} role="presentation" aria-hidden="true">
      <svg width="120" height="28" viewBox="0 0 120 28">
        <line x1={60 + nodeOffset(index - 1)} y1="2" x2={60 + nodeOffset(index)} y2="26" />
      </svg>
    </li>
  );
}

/**
 * What a chapter teaches: its stops with their minutes, and what each lesson teaches (its summary's
 * lines; a lesson with no summary, its "You can now" lines)
 */
function ChapterOverview({ nodes }: { nodes: NodeView[] }) {
  const learned = nodes.flatMap((v) => {
    if (v.node.kind !== 'lesson') return [];
    const lesson = getLesson(v.node.id);
    return (lesson.recap?.points ?? lesson.canDo).map((c) => c.text);
  });
  return (
    <div className={styles.overview} {...guide('path.chapter.overview')}>
      <ul className={styles.overviewList}>
        {nodes.map((v) => (
          <li key={v.key}>
            <NodeIcon kind={v.node.kind} onChart={onChart(v.node)} size={14} /> {v.title}
            <span className={styles.rowMeta}> · about {v.minutes} min</span>
          </li>
        ))}
      </ul>
      {learned.length > 0 && (
        <>
          <p className={styles.overviewHead}>What you’ll learn</p>
          <ul className={styles.overviewList}>
            {learned.map((text) => (
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
  const { chapter, firstIndex } = view;
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
          {chapter.preview.map((node, i) => (
            <SoonStop
              key={node.title}
              first={i === 0}
              index={firstIndex + i}
              kind={node.kind}
              title={node.title}
            />
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
                i={i}
                index={firstIndex + i}
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
  first: boolean;
  index: number;
  kind: NodeKind;
  title: string;
}

function SoonStop({ first, index, kind, title }: SoonStopProps) {
  return (
    <>
      {!first && <Connector index={index} />}
      <li className={styles.stop} style={{ transform: `translateX(${nodeOffset(index)}px)` }}>
        <span className={`${styles.node} ${styles.soon}`} aria-hidden="true">
          <NodeIcon kind={kind} />
        </span>
        <span className={styles.caption}>{title}</span>
      </li>
    </>
  );
}

interface ChapterStopProps {
  node: NodeView;
  /** Index in the chapter */
  i: number;
  /** Index on the whole map (the zig-zag) */
  index: number;
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
  i,
  index,
  previous,
  testOut,
  wide,
  started,
  onStart,
  onSkipTour,
}: ChapterStopProps) {
  return (
    <>
      {i > 0 && <Connector index={index} />}
      <PathNode
        view={node}
        index={index}
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
  const wide = useTourWide();
  const accessToken = useAuthStore((s) => s.accessToken);
  const view = usePathView();
  const [tab, setTab] = useState<Tab>('path');
  const drawerRef = useRef<HTMLElement>(null);

  // Habits are counted on the server: read whenever the map opens, and again after a new finish
  const finished = view.chapters.reduce((n, c) => n + c.done, 0);
  const { habits, failed: habitsError } = useHabits(open ? accessToken : null, finished);

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
  // Something finished, or a lesson begun (its ring): the bubble says Continue
  const started =
    finished > 0 || view.chapters.some((c) => c.nodes.some((n) => n.fraction !== null));

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
                  <NodeIcon kind="lesson" size={14} /> Lesson
                </li>
                <li>
                  <NodeIcon kind="tour" size={14} /> Practice on the real chart
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
