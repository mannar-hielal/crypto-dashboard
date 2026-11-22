import { Link } from 'react-router';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { TopBar } from '@/components/dashboard/TopBar';
import { CandleSequence } from '@/components/landing/CandleSequence';
import { CoinRibbon } from '@/components/landing/CoinRibbon';
import { ComparisonTable } from '@/components/landing/ComparisonTable';
import { FaqList } from '@/components/landing/FaqList';
import { GroupSections } from '@/components/landing/GroupSections';
import { LessonPreviewsLazy } from '@/components/landing/LessonPreviewsLazy';
import { PathCards } from '@/components/landing/PathCards';
import { SectionHead } from '@/components/landing/SectionHead';
import { ShotShowcase } from '@/components/landing/ShotShowcase';
import { StartLink } from '@/components/landing/StartLink';
import { Timeline } from '@/components/landing/Timeline';
import { BEGINNER_FAQ, CTA_REGISTER } from '@/lib/landingContent';
import shared from '@/components/landing/landing.module.css';
import styles from './LandingPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

/**
 * The landing page (owner's rewrite, 2026-11-22): a total beginner should see within seconds that
 * this is a learning app AND a real-data chart with virtual money. Live: the hero offers two paths
 * (the live chart, no sign up; lessons, free account), then the questions every beginner asks, the
 * first steps, the value of learning on the real chart, real screenshots, where we differ from six
 * kinds of competitor and one comparison table. Before launch there is no sign-up and no chart link,
 * so the page is the hero, the coin ribbon and the newsletter form.
 */
export function LandingPage() {
  return (
    <>
      <SeoHead
        title="Learn Crypto Trading Free"
        description="Learn crypto trading from zero with short lessons, then practise on a live chart with $10,000 of pretend money. Free, no real money, and the chart needs no sign up."
        path="/"
        {...(!isLive && { noIndex: true })}
      />
      <TopBar marketing />
      <AuthLayout marketingFooter>
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <header className={styles.hero}>
          <div className={styles.candles}>
            <CandleSequence />
          </div>
          <div className={styles.heroInner}>
            <p className={styles.badge}>
              <span
                className={`${styles.dot}${isLive ? '' : ` ${styles.dotSoon}`}`}
                aria-hidden="true"
              />
              {isLive ? 'Free · Pretend money · Real prices' : 'Launching Soon'}
            </p>

            {isLive ? (
              <>
                <h1 className={styles.h1}>
                  <span className={shared.gradientText}>Learn crypto trading.</span>{' '}
                  <span>Practise on a real chart.</span>
                </h1>
                <p className={styles.sub}>
                  Short lessons for people who know nothing yet, a live chart with real prices, and
                  $10,000 of pretend money to train with. Pick how you want to begin.
                </p>
                <div className={styles.paths}>
                  <PathCards />
                </div>
              </>
            ) : (
              <>
                <h1 className={styles.h1}>
                  <span className={shared.gradientText}>Paper trade crypto,</span> <span>FREE</span>
                </h1>
                <p className={styles.sub}>
                  Learn on a real-data chart with $10K of pretend money. Stop paying. Start
                  learning.
                </p>
                <div className={styles.heroActions}>
                  <StartLink cta={CTA_REGISTER} live={false} />
                  <Link to="/how-it-works" className={shared.ctaGhost}>
                    See how it works
                  </Link>
                </div>
              </>
            )}
          </div>
        </header>

        <div className={styles.page}>
          {isLive && (
            <section className={shared.section} aria-labelledby="questions-title">
              <SectionHead
                id="questions-title"
                eyebrow="Start here"
                title="Questions every beginner asks"
                lead="Short, honest answers. Tap one to open it."
              />
              <div className={styles.faqWrap}>
                <FaqList
                  items={BEGINNER_FAQ}
                  live={isLive}
                  anchor="landing.faq.start"
                  defaultOpen={['where-to-start']}
                />
              </div>
            </section>
          )}

          <div className={shared.section}>
            <CoinRibbon />
          </div>

          {isLive && (
            <>
              {/* ─── The timeline ───────────────────────────────────────── */}
              <section className={shared.section} aria-labelledby="steps-title">
                <SectionHead
                  id="steps-title"
                  eyebrow="What you get"
                  title="From your first click to your first trade"
                  lead="The chart is free. So is the practice desk. Here is the path, step by step."
                />
                <div className={styles.timelineRow}>
                  <Timeline />
                  <StartLink cta={CTA_REGISTER} live={isLive} anchor="landing.timeline.register" />
                </div>
              </section>

              {/* ─── Learn it, then try it ──────────────────────────────── */}
              <section className={shared.section} aria-labelledby="learn-title">
                <SectionHead
                  id="learn-title"
                  eyebrow="Why it works"
                  title="Learn it. Then try it on real candles."
                  lead="Most chart apps hand you a chart and wish you luck. Most courses hand you words and no chart. Here they sit together: read a short card, then open the real chart and see it happen, with pretend money on the line."
                />
                <LessonPreviewsLazy />
                <ul className={styles.valueList}>
                  <li>Each lesson is short, and every new word is explained the first time.</li>
                  <li>Quizzes tell you why an answer is right, then let you try again.</li>
                  <li>
                    Practical lessons end with a real practice trade, and a look at what happened.
                  </li>
                </ul>
              </section>

              {/* ─── Real screenshots ───────────────────────────────────── */}
              <section className={shared.section} aria-labelledby="screens-title">
                <SectionHead
                  id="screens-title"
                  eyebrow="See it for real"
                  title="This is what you will use"
                  lead="Screens taken from the app itself, not mock-ups. Prices in a picture are just a snapshot."
                />
                <ShotShowcase />
              </section>

              {/* ─── Where we are different ─────────────────────────────── */}
              <section className={shared.section} aria-labelledby="different-title">
                <SectionHead
                  id="different-title"
                  eyebrow="Why this one"
                  title="Not like the other practice tools"
                  lead="Six kinds of tools let you practise. Here is how this one is different, and where the others are better."
                />
                <GroupSections />
              </section>

              {/* ─── The comparison table ───────────────────────────────── */}
              <section className={shared.section} aria-labelledby="compare-title">
                <SectionHead
                  id="compare-title"
                  eyebrow="Side by side"
                  title="How it adds up"
                  lead="Only what works in the app today. We say it plainly where we are smaller."
                />
                <ComparisonTable />
                <p className={styles.legal}>
                  Paper trading only: no real money is involved, and nothing here is financial
                  advice. A practice record does not help anyone get funded.
                </p>
              </section>
            </>
          )}

          {/* ─── Final call ───────────────────────────────────────────── */}
          <section className={shared.section} aria-label="Get started">
            <CtaSection />
          </section>
        </div>
      </AuthLayout>
    </>
  );
}
