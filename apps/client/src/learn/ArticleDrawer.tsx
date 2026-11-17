/**
 * The knowledge-base drawer (owner's visual Q&A 2026-10-23): an article in a 440 px drawer on the
 * right over the dimmed dashboard, full screen on phones. From a lesson it says where it came from
 * ("← Back to Lesson 1") and the lesson waits behind it. It ends with a short self-test, the ways
 * to practise it on the real screen, and its sources, folded away so the reading never leaves the
 * app. Article text is our own, plain, with `**bold**` as the only markup — never HTML.
 */

import { useTourWide } from '@/guide/useTourWide';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { guide } from '@/lib/guideAnchors';
import { runsHere } from '@/guide/tours';
import { useLessonStore } from '@/guide/lessonStore';
import { getLesson } from '@/guide/lessons';
import { startLesson, startTour } from '@/guide/afterNote';
import { getArticle, type ArticleBlock } from './articles';
import { useArticleStore } from './articleStore';
import { ArticleWidget } from './ArticleWidgets';
import { practiceFor, type PracticeLink } from './graph';
import styles from './ArticleDrawer.module.css';

/** `**bold**` runs as <strong>; everything else stays plain text (never parsed as HTML) */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {/* Odd parts are the captured bold runs; plain strings need no key */}
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={`b:${part}`}>{part}</strong> : part))}
    </>
  );
}

const sectionId = (id: string) => `article-section-${id}`;

/** A block's identity: its kind and its first text (article blocks never repeat word for word) */
function blockKey(block: ArticleBlock): string {
  switch (block.kind) {
    case 'list':
      return `list:${block.items[0]}`;
    case 'table':
      return `table:${block.rows[0]?.[0] ?? ''}:${block.head.join('|')}`;
    case 'widget':
      return `widget:${block.id}`;
    default:
      return `${block.kind}:${block.text}`;
  }
}

function Block({ block }: { block: ArticleBlock }): ReactNode {
  switch (block.kind) {
    case 'h':
      return (
        <h3 className={styles.h} id={block.id ? sectionId(block.id) : undefined}>
          {block.text}
        </h3>
      );
    case 'p':
      return (
        <p className={styles.p}>
          <RichText text={block.text} />
        </p>
      );
    case 'list': {
      const items = block.items.map((item) => (
        <li key={item}>
          <RichText text={item} />
        </li>
      ));
      return block.ordered ? (
        <ol className={styles.list}>{items}</ol>
      ) : (
        <ul className={styles.list}>{items}</ul>
      );
    }
    case 'table':
      return (
        <table className={styles.table}>
          <thead>
            <tr>
              {block.head.map((h) => (
                <th key={h || 'row'} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={cell} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={`${row[0]}-${block.head[i]}`}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'callout':
      return (
        <p className={`${styles.callout} ${styles[block.tone]}`}>
          <RichText text={block.text} />
        </p>
      );
    case 'widget':
      return <ArticleWidget id={block.id} />;
  }
}

export function ArticleDrawer() {
  const navigate = useNavigate();
  const desktop = useTourWide();
  const openId = useArticleStore((s) => s.openId);
  const from = useArticleStore((s) => s.from);
  const section = useArticleStore((s) => s.section);
  const drawerRef = useRef<HTMLElement>(null);

  // Esc closes; the drawer takes the focus, then shows the asked-for section
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useArticleStore.getState().close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    drawerRef.current?.focus();
    const target = section ? document.getElementById(sectionId(section)) : null;
    if (target) target.scrollIntoView?.({ block: 'start' });
    else drawerRef.current?.scrollTo?.({ top: 0 });
  }, [openId, section]);

  if (!openId) return null;
  const article = getArticle(openId);
  const practice = practiceFor(article.id);
  const close = () => useArticleStore.getState().close();

  const practise = (link: PracticeLink) => {
    close();
    if (link.kind === 'tour') {
      startTour(link.tour, navigate);
      return;
    }
    // Back into the lesson it was opened from: just show it again, where the learner left it
    const { activeId } = useLessonStore.getState();
    if (from?.lesson === link.lesson && activeId === link.lesson) return;
    startLesson(link.lesson, link.screen);
  };

  return createPortal(
    <div className={styles.overlay} onClick={close} {...guide('article.drawer')}>
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          {from ? (
            <button
              type="button"
              className={styles.back}
              onClick={close}
              {...guide('article.back')}
            >
              ← Back to Lesson {getLesson(from.lesson).number}
            </button>
          ) : (
            <span className={styles.kicker}>Library</span>
          )}
          <button
            type="button"
            className={styles.close}
            aria-label="Close the article"
            onClick={close}
            {...guide('article.close')}
          >
            <X size={18} />
          </button>
        </div>

        <h2 id="article-title" className={styles.title}>
          {article.title}
        </h2>
        <p className={styles.meta}>{article.minutes} min read</p>
        {article.summary && <p className={styles.summary}>{article.summary}</p>}

        {article.blocks.map((block) => (
          <Block key={blockKey(block)} block={block} />
        ))}

        <h3 className={styles.h}>Quick self-test</h3>
        {article.selfTest.map((item) => (
          <details key={item.q} className={styles.selfTest}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}

        <h3 className={styles.h}>Practise it</h3>
        {practice.length > 0 ? (
          <ul className={styles.practice}>
            {practice.map((link) => {
              const tourOnPhone = link.kind === 'tour' && !runsHere(link.tour, desktop);
              const key = link.kind === 'lesson' ? `${link.lesson}:${link.screen}` : link.tour;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={styles.practiceLink}
                    disabled={tourOnPhone}
                    onClick={() => practise(link)}
                    {...guide('article.practice', key)}
                  >
                    {link.label} →
                  </button>
                  {tourOnPhone && <span className={styles.meta}> (on a larger screen)</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.p}>Coming in {article.practiceSoon ?? 'a later lesson'}.</p>
        )}

        <details className={styles.sources} {...guide('article.sources')}>
          <summary>Sources (checked {article.checked})</summary>
          <ul>
            {article.sources.map((s) => (
              <li key={s.url + s.label}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
        <p className={styles.disclaimer}>Educational content, not financial advice.</p>
      </aside>
    </div>,
    document.body
  );
}
