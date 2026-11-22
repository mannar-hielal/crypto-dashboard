import { Link } from 'react-router';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { TopBar } from '@/components/dashboard/TopBar';
import { CoinRibbon } from '@/components/landing/CoinRibbon';
import { FaqList } from '@/components/landing/FaqList';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { LessonPreviewsLazy } from '@/components/landing/LessonPreviewsLazy';
import { SectionHead } from '@/components/landing/SectionHead';
import { SingleShot } from '@/components/landing/ShotShowcase';
import { StartLink } from '@/components/landing/StartLink';
import {
  ACCOUNT_FEATURES,
  CHART_FEATURES,
  CTA_CHART,
  CTA_REGISTER,
  DATA_FEATURES,
  DESK_FEATURES,
  DEVICE_FEATURES,
  FEATURES_FAQ,
  LEARN_STEPS,
  LEARN_TOPICS,
} from '@/lib/landingContent';
import shared from '@/components/landing/landing.module.css';
import styles from './FeaturesPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

const SECTIONS = [
  { id: 'learn', label: 'Learn' },
  { id: 'charts', label: 'The chart' },
  { id: 'trading', label: 'Practice desk' },
  { id: 'account', label: 'Your account' },
  { id: 'realtime', label: 'Real data' },
  { id: 'crossplatform', label: 'Phone and more' },
  { id: 'questions', label: 'Questions' },
] as const;

// Structured data: the page's questions, the same text the accordion shows
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FEATURES_FAQ.map((q) => ({
    '@type': 'Question',
    name: q.question,
    acceptedAnswer: { '@type': 'Answer', text: q.answer },
  })),
};

/**
 * The features page (owner's rewrite, 2026-11-22): written in plain English for a beginner, with
 * the learning side first, then the chart, the practice desk, the account, the data and the phone.
 * Every section ends in a way into the app; the questions are an accordion with FAQ structured data.
 */
export function FeaturesPage() {
  return (
    <>
      <SeoHead
        title="Features: Learn Crypto by Doing"
        description="See what you get: step-by-step crypto lessons, a live chart with indicators and drawing tools, a $10,000 practice account and a saved history. Free, paper money only."
        path="/features"
        // Before launch the page stays out of the index and publishes no FAQ data; it still describes
        // the product, under a "launching soon" line, so its sign-up and chart words read as what is coming
        {...(isLive ? { jsonLd: FAQ_JSON_LD } : { noIndex: true })}
      />
      <TopBar marketing />

      {/* Sticky anchor nav: docks below the top bar */}
      <nav className={styles.nav} aria-label="On this page">
        <div className={styles.navInner}>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={styles.navLink}>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <AuthLayout>
        <header className={styles.hero}>
          {!isLive && <p className={styles.soon}>Launching soon · this is what you will get</p>}
          <h1 className={styles.h1}>
            <span className={shared.gradientText}>Learn it. Try it.</span> All in one place.
          </h1>
          <p className={styles.sub}>
            Here is everything you get, in plain words: short crypto lessons, a live chart with real
            prices, and $10,000 of pretend money to practise with. No real money is ever involved.
          </p>
          <div className={styles.actions}>
            <StartLink cta={CTA_REGISTER} live={isLive} anchor="features.hero.register" />
            {isLive && (
              <StartLink cta={CTA_CHART} live variant="ghost" anchor="features.hero.chart" />
            )}
          </div>
        </header>

        <div className={styles.page}>
          {/* ─── Learn ──────────────────────────────────────────────────── */}
          <section
            id="learn"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="learn-title"
          >
            <SectionHead
              id="learn-title"
              eyebrow="Learn"
              title="Learn crypto trading from zero"
              lead="You do not need to know anything first. Each lesson is a few short cards, and the chart is right behind them."
            />
            <FeatureGrid items={LEARN_STEPS} numbered />
            <LessonPreviewsLazy />
            <h3 className={styles.sub2}>What the lessons cover today</h3>
            <FeatureGrid items={LEARN_TOPICS} />
            <div className={styles.links}>
              <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
              <Link to="/blog" className={shared.ctaText}>
                Read the articles on the blog
              </Link>
            </div>
          </section>

          {/* ─── The chart ──────────────────────────────────────────────── */}
          <section
            id="charts"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="charts-title"
          >
            <SectionHead
              id="charts-title"
              eyebrow="The chart"
              title="A real chart you can draw on"
              lead="A chart shows a price over time. This one moves with the real market, and the chart needs no sign up."
            />
            <SingleShot id="chart" />
            <FeatureGrid items={CHART_FEATURES} />
            {isLive && <StartLink cta={CTA_CHART} live variant="text" />}
          </section>

          {/* ─── The practice desk ──────────────────────────────────────── */}
          <section
            id="trading"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="trading-title"
          >
            <SectionHead
              id="trading-title"
              eyebrow="Practice desk"
              title="Pretend money, real prices"
              lead="Make a free account and you get $10,000 of pretend money. Practise buying and selling as many times as you like. Nothing you do here can cost real money."
            />
            <SingleShot id="desk" />
            <FeatureGrid items={DESK_FEATURES} />
            <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
          </section>

          {/* ─── Your account ───────────────────────────────────────────── */}
          <section
            id="account"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="account-title"
          >
            <SectionHead
              id="account-title"
              eyebrow="Your account"
              title="Look back and learn from every trade"
              lead="Everything you do is saved, so you can see what happened and why. It is your account, and you stay in charge of it."
            />
            <FeatureGrid items={ACCOUNT_FEATURES} />
          </section>

          {/* ─── Real data ──────────────────────────────────────────────── */}
          <section
            id="realtime"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="realtime-title"
          >
            <SectionHead
              id="realtime-title"
              eyebrow="Real data"
              title="Real coins, real prices"
              lead="You practise on the same prices that real traders see."
            />
            <CoinRibbon />
            <FeatureGrid items={DATA_FEATURES} />
          </section>

          {/* ─── Phone and more ─────────────────────────────────────────── */}
          <section
            id="crossplatform"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="crossplatform-title"
          >
            <SectionHead
              id="crossplatform-title"
              eyebrow="Phone and more"
              title="Use it on your phone, too"
              lead="Nothing to install and nothing to set up."
            />
            <FeatureGrid items={DEVICE_FEATURES} />
          </section>

          {/* ─── Questions ──────────────────────────────────────────────── */}
          <section
            id="questions"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="questions-title"
          >
            <SectionHead
              id="questions-title"
              eyebrow="Questions"
              title="Quick answers"
              lead="Tap a question to open it."
            />
            <div className={styles.faqWrap}>
              <FaqList items={FEATURES_FAQ} live={isLive} anchor="features.faq.start" />
            </div>
            <p className={styles.legal}>
              Paper trading only: no real money is involved, and nothing here is financial advice.
            </p>
          </section>

          <section className={`${shared.section} ${styles.cta}`} aria-label="Get started">
            <CtaSection />
          </section>
        </div>
      </AuthLayout>
    </>
  );
}
