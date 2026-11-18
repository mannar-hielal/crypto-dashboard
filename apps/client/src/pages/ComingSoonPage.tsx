/**
 * The About us and Support pages until they are written (owner 2026-11-18): a title, one sentence
 * and a way home. Not indexed, and not in the sitemap.
 */

import { Link } from 'react-router';
import { AuthLayout } from '@/components/AuthLayout';
import { SeoHead } from '@/components/SeoHead';
import { TopBar } from '@/components/dashboard/TopBar';
import { guide } from '@/lib/guideAnchors';
import styles from './BlogPage.module.css';

const PAGES = {
  about: { title: 'About us', path: '/about', text: 'We’re writing this page. Come back soon.' },
  support: {
    title: 'Support',
    path: '/support',
    text: 'Our support page is on its way. Until then, the Blog answers most questions.',
  },
} as const;

export function ComingSoonPage({ page }: { page: keyof typeof PAGES }) {
  const { title, path, text } = PAGES[page];
  return (
    <>
      <SeoHead title={title} description={`${title}: coming soon.`} path={path} noIndex />
      <TopBar marketing />
      <AuthLayout>
        <div className={styles.soon} {...guide('page.coming-soon', page)}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.soonText}>{text}</p>
          <p className={styles.soonText}>Coming soon.</p>
          <Link to="/" className={styles.soonLink}>
            Back to home
          </Link>
        </div>
      </AuthLayout>
    </>
  );
}
