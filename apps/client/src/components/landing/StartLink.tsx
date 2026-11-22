import { Link } from 'react-router';

import type { Cta } from '@/lib/landingContent';
import { guide, type GuideAnchor } from '@/lib/guideAnchors';
import styles from './landing.module.css';

interface StartLinkProps {
  cta: Cta;
  /** Live: a link to the page. Before launch there is no sign-up or chart: the newsletter form */
  live: boolean;
  variant?: 'primary' | 'ghost' | 'text';
  anchor?: GuideAnchor;
  /** The anchor's key, when the same anchor repeats (one per FAQ question) */
  anchorKey?: string;
}

const CLASS = {
  primary: styles.ctaPrimary,
  ghost: styles.ctaGhost,
  text: styles.ctaText,
} as const;

/**
 * One call-to-action link, the same everywhere on the public pages. Before launch it jumps to
 * `#newsletter`, which `CtaSection` renders: a page using it pre-launch must render `CtaSection`.
 */
export function StartLink({ cta, live, variant = 'primary', anchor, anchorKey }: StartLinkProps) {
  const extra = anchor ? guide(anchor, anchorKey) : {};
  return live ? (
    <Link to={cta.to} className={CLASS[variant]} {...extra}>
      {cta.label}
    </Link>
  ) : (
    <a
      href="#newsletter"
      className={CLASS[variant]}
      // The jump alone leaves keyboard focus on the link: move it to the email field
      onClick={() => {
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLInputElement>('#newsletter input')
            ?.focus({ preventScroll: true });
        });
      }}
      {...extra}
    >
      {cta.preLabel}
    </a>
  );
}
