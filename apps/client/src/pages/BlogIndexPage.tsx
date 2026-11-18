/**
 * The Blog (owner 2026-11-18): every article, as a card grid, no login. `/blog`.
 */

import { Link } from 'react-router';
import { AuthLayout } from '@/components/AuthLayout';
import { SeoHead } from '@/components/SeoHead';
import { TopBar } from '@/components/dashboard/TopBar';
import { guide } from '@/lib/guideAnchors';
import { ARTICLES } from '@/blog/posts';
import styles from './BlogPage.module.css';

export function BlogIndexPage() {
  return (
    <>
      <SeoHead
        title="Blog — How Crypto and Trading Work, in Plain Words"
        description="Plain-English articles on how Bitcoin works, how an exchange sets the price, why prices swing and how to spot a scam. Free to read, no signup."
        path="/blog"
      />
      <TopBar marketing />
      <AuthLayout>
        <div className={styles.wrap}>
          <h1 className={styles.title}>Blog</h1>
          <p className={styles.intro}>Learn how crypto trading works, in plain words.</p>
          <ul className={styles.grid} {...guide('blog.list')}>
            {ARTICLES.map((article) => (
              <li key={article.id}>
                <Link
                  to={`/blog/${article.id}`}
                  className={styles.card}
                  {...guide('blog.card', article.id)}
                >
                  <h2 className={styles.cardTitle}>{article.title}</h2>
                  {article.summary && <p className={styles.cardSummary}>{article.summary}</p>}
                  <p className={styles.cardMeta}>{article.minutes} min read</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </AuthLayout>
    </>
  );
}
