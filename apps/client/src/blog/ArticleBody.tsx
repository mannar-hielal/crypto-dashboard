/**
 * An article's body on the Blog (owner's visual Q&A 2026-11-18): the title, reading time and
 * one-line summary, then the blocks (headings, text, lists, tables, callouts and the interactive
 * widgets), a short self-test and the sources, folded away. Article text is our own, plain, with
 * `**bold**` as the only markup: never HTML (`RichText`).
 */

import type { ReactNode } from 'react';
import { ArticleWidget } from '@/components/widgets/ArticleWidgets';
import { RichText } from '@/learn/RichText';
import type { Article, ArticleBlock } from './posts';
import styles from './Article.module.css';

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

/** The anchor of a section heading on the page (`/blog/<id>#<section>`) */
const sectionId = (id: string) => `section-${id}`;

function Block({ block }: { block: ArticleBlock }): ReactNode {
  switch (block.kind) {
    case 'h':
      return (
        <h2 className={styles.h} id={block.id ? sectionId(block.id) : undefined}>
          {block.text}
        </h2>
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

export function ArticleBody({ article }: { article: Article }) {
  return (
    <article className={styles.article}>
      <h1 className={styles.title}>{article.title}</h1>
      <p className={styles.meta}>{article.minutes} min read</p>
      {article.summary && <p className={styles.summary}>{article.summary}</p>}

      {article.blocks.map((block) => (
        <Block key={blockKey(block)} block={block} />
      ))}

      <h2 className={styles.h}>Quick self-test</h2>
      {article.selfTest.map((item) => (
        <details key={item.q} className={styles.selfTest}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}

      <details className={styles.sources}>
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
    </article>
  );
}
