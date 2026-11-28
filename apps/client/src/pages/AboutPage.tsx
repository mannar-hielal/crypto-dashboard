import { Link } from 'react-router';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { TopBar } from '@/components/dashboard/TopBar';
import { SectionHead } from '@/components/landing/SectionHead';
import { StartLink } from '@/components/landing/StartLink';
import { CTA_CHART, CTA_REGISTER } from '@/lib/landingContent';
import { ABOUT } from '@/lib/aboutContent';
import aboutPhoto from '@/assets/landing/about-photo.webp';
import shared from '@/components/landing/landing.module.css';
import styles from './AboutPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

/**
 * The About page (owner 2026-11-22; the words are in `lib/aboutContent.ts`, in the first person):
 * what the site is, why it was built, what it stands for, who is behind it and how to write to them.
 * Kept out of search results until the owner says otherwise, and out of the sitemap.
 */
export function AboutPage() {
  return (
    <>
      <SeoHead title="About" description={ABOUT.description} path="/about" noIndex />
      <TopBar marketing />
      <AuthLayout marketingFooter>
        <div className={styles.page}>
          <header className={styles.hero}>
            <h1 className={styles.h1}>{ABOUT.title}</h1>
            <p className={styles.sub}>{ABOUT.intro}</p>
          </header>

          <section className={shared.section} aria-labelledby="about-why-title">
            <SectionHead id="about-why-title" eyebrow="Why I built it" title={ABOUT.whyTitle} />
            <p className={styles.text}>{ABOUT.why}</p>
          </section>

          <section className={shared.section} aria-labelledby="about-believe-title">
            <SectionHead
              id="about-believe-title"
              eyebrow="What I believe"
              title={ABOUT.believeTitle}
            />
            <ul className={styles.beliefs}>
              {ABOUT.beliefs.map((b) => (
                <li key={b.title} className={styles.belief}>
                  <h3 className={styles.beliefTitle}>{b.title}</h3>
                  <p className={styles.beliefText}>{b.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={shared.section} aria-labelledby="about-who-title">
            <SectionHead id="about-who-title" eyebrow="Who is behind it" title={ABOUT.whoTitle} />
            <div className={styles.who}>
              {/* Square, sized: the page does not jump while the photo loads */}
              <img
                className={styles.photo}
                src={aboutPhoto}
                width={480}
                height={480}
                alt={ABOUT.photoAlt}
                loading="lazy"
                decoding="async"
              />
              <div className={styles.whoText}>
                {ABOUT.who.map((p) => (
                  <p key={p} className={styles.text}>
                    {p}
                  </p>
                ))}
                <p className={styles.text}>{ABOUT.independence}</p>
                <p className={styles.text}>
                  {ABOUT.contactLead}{' '}
                  <a className={styles.mail} href={`mailto:${ABOUT.email}`}>
                    {ABOUT.email}
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <section className={shared.section} aria-label="Get started">
            <div className={styles.actions}>
              <StartLink cta={CTA_REGISTER} live={isLive} anchor="about.register" />
              {isLive && <StartLink cta={CTA_CHART} live variant="ghost" anchor="about.chart" />}
            </div>
            <p className={styles.legal}>
              Paper trading only: no real money is involved, and nothing here is financial advice.{' '}
              <Link to="/how-it-works" className={shared.ctaText}>
                See how it works
              </Link>
            </p>
          </section>

          <section className={`${shared.section} ${styles.cta}`} aria-label="Newsletter">
            <CtaSection />
          </section>
        </div>
      </AuthLayout>
    </>
  );
}
