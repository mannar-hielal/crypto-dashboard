/**
 * One Blog article (owner 2026-11-18): `/blog/<id>`, a readable column with a way back and two more
 * articles below. An unknown id goes back to the Blog.
 */

import { Link, Navigate, useParams } from 'react-router';
import { AuthLayout } from '@/components/AuthLayout';
import { SeoHead } from '@/components/SeoHead';
import { TopBar } from '@/components/dashboard/TopBar';
import { guide } from '@/lib/guideAnchors';
import { ArticleBody } from '@/blog/ArticleBody';
import { ARTICLES, getArticle, isArticleId } from '@/blog/posts';
import styles from './BlogPage.module.css';

/** How many other articles close an article page */
const MORE_COUNT = 2;

export function BlogPostPage() {
  const { slug = '' } = useParams();
  if (!isArticleId(slug)) return <Navigate to="/blog" replace />;
  const article = getArticle(slug);
  // The next articles in order, wrapping round, never this one
  const at = ARTICLES.findIndex((a) => a.id === article.id);
  const more = Array.from(
    { length: MORE_COUNT },
    (_, i) => ARTICLES[(at + 1 + i) % ARTICLES.length]
  );

  return (
    <>
      <SeoHead
        title={article.title}
        description={
          article.summary ?? `${article.title}: a plain-English article on cryptopapertrade.com.`
        }
        path={`/blog/${article.id}`}
      />
      <TopBar marketing />
      <AuthLayout>
        <div className={styles.column}>
          <Link to="/blog" className={styles.back} {...guide('blog.back')}>
            ← Blog
          </Link>
          <ArticleBody article={article} />
          <h2 className={styles.moreTitle}>More articles</h2>
          <ul className={styles.moreGrid}>
            {more.map((a) => (
              <li key={a.id}>
                <Link to={`/blog/${a.id}`} className={styles.card} {...guide('blog.more', a.id)}>
                  <h3 className={styles.cardTitle}>{a.title}</h3>
                  <p className={styles.cardMeta}>{a.minutes} min read</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </AuthLayout>
    </>
  );
}
