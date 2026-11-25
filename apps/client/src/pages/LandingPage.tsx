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
import { PathCards } from '@/components/landing/PathCards';
import { PathWalk } from '@/components/landing/PathWalk';
import { PictureCallouts } from '@/components/landing/PictureCallouts';
import { SectionHead } from '@/components/landing/SectionHead';
import { StartLink } from '@/components/landing/StartLink';
import { TourPlayer } from '@/components/landing/TourPlayer';
import { WhySlider } from '@/components/landing/WhySlider';
import { Timeline } from '@/components/landing/Timeline';
import { HALVES, TRICK } from '@/lib/howItWorksContent';
import { BEGINNER_FAQ, CTA_REGISTER } from '@/lib/landingContent';
import { WHY_ITEMS } from '@/lib/whyItems';
import shared from '@/components/landing/landing.module.css';
import styles from './LandingPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

/**
 * The landing page (owner's rewrite, 2026-11-22): a total beginner should see within seconds that
 * this is a learning app AND a real-data chart with virtual money. Live: the hero offers two paths
 * (the live chart, no sign up; lessons, free account), then why the app exists, the one picture and
 * the tours (moved from How it works, 2026-11-25), the questions every beginner asks, the
 * first steps, the value of learning on the real chart, where we differ from six
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
            <>
              {/* ─── Why this app exists (moved from How it works, owner 2026-11-25) ─── */}
              <section className={shared.section} aria-labelledby="why-title">
                <SectionHead
                  id="why-title"
                  eyebrow="Why"
                  title="Why this app exists"
                  lead="Most people meet trading with real money on the line. That is a bad way to learn. This app lets you learn first, and risk nothing."
                />
                <WhySlider slides={WHY_ITEMS} />
              </section>

              {/* ─── What it is, in one picture ───────────────────────────── */}
              <section className={shared.section} aria-labelledby="picture-title">
                <SectionHead
                  id="picture-title"
                  eyebrow="The big picture"
                  title="What it is, in one picture"
                  lead="Two halves that work together. One teaches. One lets you practise."
                />
                <PictureCallouts
                  learn={HALVES[0]}
                  chart={HALVES[1]}
                  alt="The first lesson card open over the live chart"
                />
                <p className={styles.trick}>{TRICK}</p>
              </section>

              {/* ─── Little tours of the real app ─────────────────────────── */}
              <section className={shared.section} aria-labelledby="tours-title">
                <SectionHead
                  id="tours-title"
                  eyebrow="Tours"
                  title="Little tours of the real app"
                  lead="Short clips of the app in use, each one a few steps a new person takes."
                />
                <TourPlayer />
                <div className={styles.links}>
                  <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
                </div>
              </section>
            </>
          )}

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

              {/* ─── The learning path, walked (moved from How it works, owner 2026-11-25) ─── */}
              <section className={shared.section} aria-labelledby="learn-title">
                <SectionHead
                  id="learn-title"
                  eyebrow="The learning path"
                  title="Short lessons, then practice, then a checkpoint"
                  lead="A stop opens once the one before it is done. Open the map from the top bar once you have an account."
                />
                <PathWalk />
                <div className={styles.links}>
                  <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
                  <Link to="/blog" className={shared.ctaText}>
                    Read the articles on the blog
                  </Link>
                </div>
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
