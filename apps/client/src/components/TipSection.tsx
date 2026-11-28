import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { ArrowUpRight } from 'lucide-react';

import { guide } from '@/lib/guideAnchors';
import { TIP } from '@/lib/tipContent';
import shared from '@/components/landing/landing.module.css';
import styles from './TipSection.module.css';

/**
 * The voluntary tip on the About page (owner 2026-11-28). A plain link to PayPal: no script and no
 * widget, so nothing reaches PayPal unless the visitor opens it.
 */
export function TipSection() {
  const { hash, key } = useLocation();
  const title = useRef<HTMLHeadingElement>(null);

  // The footer's "Support the app" lands here. The router does not scroll to a #fragment itself,
  // and a reader who came from the bottom of another page would stay far below. `key` changes on
  // every click, so a second click on this page scrolls again
  useEffect(() => {
    if (hash !== `#${TIP.anchorId}`) return;
    title.current?.scrollIntoView?.({ block: 'start' });
    title.current?.focus({ preventScroll: true });
  }, [hash, key]);

  return (
    <section className={shared.section} aria-labelledby={TIP.anchorId}>
      <div className={shared.head}>
        <h2
          ref={title}
          id={TIP.anchorId}
          tabIndex={-1}
          className={`${shared.title} ${styles.title}`}
        >
          {TIP.title}
        </h2>
        <p className={shared.lead}>{TIP.text}</p>
      </div>
      <a
        href={TIP.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${TIP.label} (opens in a new tab)`}
        className={`${shared.ctaGhost} ${styles.link}`}
        {...guide('about.tip')}
      >
        {TIP.label}
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    </section>
  );
}
