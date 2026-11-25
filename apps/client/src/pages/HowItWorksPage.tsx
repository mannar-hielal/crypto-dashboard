import type { ReactNode } from 'react';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { TopBar } from '@/components/dashboard/TopBar';
import { CoinRibbon } from '@/components/landing/CoinRibbon';
import { FaqList } from '@/components/landing/FaqList';
import { FlipCards } from '@/components/landing/FlipCards';
import { NotCards } from '@/components/landing/NotCards';
import { PretendMoney } from '@/components/landing/PretendMoney';
import { SectionHead } from '@/components/landing/SectionHead';
import { SingleShot } from '@/components/landing/ShotShowcase';
import { StartLink } from '@/components/landing/StartLink';
import { StackDiagram } from '@/components/landing/StackDiagram';
import { CTA_CHART, CTA_REGISTER, FEATURES_FAQ, type FaqItem } from '@/lib/landingContent';
import { CHECK_YOURSELF, HOSTING, WORD_LIST } from '@/lib/howItWorksContent';
import shared from '@/components/landing/landing.module.css';
import styles from './HowItWorksPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

const SECTIONS = [
  { id: 'behind', label: 'Behind the scenes' },
  { id: 'chart', label: 'On the chart' },
  { id: 'not', label: 'What it is not' },
  { id: 'words', label: 'Word list' },
  { id: 'questions', label: 'Questions' },
] as const;

// The page's questions: the quick answers, then the self-check questions (owner 2026-11-24: one list).
// A self-check answer is its yes or no and its reason, and has no "Start here" button.
const SELF_CHECK: readonly FaqItem[] = CHECK_YOURSELF.map((c, i) => ({
  id: `check-${i}`,
  question: c.question,
  answer: `${c.answer} ${c.why}`,
}));
const QUESTIONS: readonly FaqItem[] = [...FEATURES_FAQ, ...SELF_CHECK];

// Structured data: the page's questions, the same text the accordion shows
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: QUESTIONS.map((q) => ({
    '@type': 'Question',
    name: q.question,
    acceptedAnswer: { '@type': 'Answer', text: q.answer },
  })),
};

/** One section of the page: its anchor, its heading and its body */
function Part({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`${shared.section} ${styles.anchor}`}
      aria-labelledby={`${id}-title`}
    >
      <SectionHead id={`${id}-title`} eyebrow={eyebrow} title={title} lead={lead} />
      {children}
    </section>
  );
}

/**
 * The "How it works" page (owner 2026-11-22, built from his tour page; it replaced Features): what
 * runs behind the screen, what the chart and desk do, what it is not and the word list. Why the app exists, the one picture and the tours moved to the landing page (owner
 * 2026-11-25). Plain English, a picture for
 * every technical word. The questions are an accordion with FAQ structured data.
 */
export function HowItWorksPage() {
  return (
    <>
      <SeoHead
        title="How It Works: Learn Crypto Trading by Doing"
        description="How cryptopapertrade.com works: short crypto lessons, a live chart with real prices and a $10,000 practice account, and what happens behind the screen. Free, paper money only."
        path="/how-it-works"
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

      <AuthLayout marketingFooter>
        <header className={styles.hero}>
          {!isLive && <p className={styles.soon}>Launching soon · this is what you will get</p>}
          <h1 className={styles.h1}>
            How <span className={shared.gradientText}>cryptopapertrade.com</span> works
          </h1>
          <p className={styles.sub}>
            Learn crypto trading by doing it, with pretend money on real prices and short lessons
            that start from zero. Here is what it is, what it does, and what happens behind the
            screen.
          </p>
          <ul className={styles.badges}>
            <li>
              <strong>Free:</strong> no card, no ads
            </li>
            <li>
              <strong>$10,000</strong> pretend money
            </li>
            <li>
              <strong>0</strong> real money at risk
            </li>
          </ul>
          <div className={styles.actions}>
            <StartLink cta={CTA_REGISTER} live={isLive} anchor="how.hero.register" />
            {isLive && <StartLink cta={CTA_CHART} live variant="ghost" anchor="how.hero.chart" />}
          </div>
        </header>

        <div className={styles.page}>
          <Part
            id="behind"
            eyebrow="1 · Behind the scenes"
            title="How it works behind the scenes"
            lead="Every technical word gets an everyday picture. Think of a busy little restaurant."
          >
            <StackDiagram />
            <details className={styles.more}>
              <summary>A little more detail: who hosts what</summary>
              <p className={styles.p}>{HOSTING}</p>
            </details>
          </Part>

          <Part
            id="chart"
            eyebrow="2 · On the chart"
            title="What you can do on the chart"
            lead="A real charting screen, with room to explore. The chart needs no sign up."
          >
            <SingleShot id="chart" />
            <FlipCards />
            <CoinRibbon />
            {isLive && <StartLink cta={CTA_CHART} live variant="text" />}
            <PretendMoney />
          </Part>

          <Part
            id="not"
            eyebrow="3 · What it is not"
            title="What it is not"
            lead="Said plainly, so there are no surprises."
          >
            <NotCards />
          </Part>

          <Part
            id="words"
            eyebrow="4 · Word list"
            title="The words, in plain English"
            lead="The words you will meet in the app, each with a picture to hold on to."
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Word</th>
                    <th scope="col">In plain words</th>
                    <th scope="col">Picture</th>
                  </tr>
                </thead>
                <tbody>
                  {WORD_LIST.map((w) => (
                    <tr key={w.word}>
                      <th scope="row">{w.word}</th>
                      <td>{w.plain}</td>
                      <td>{w.picture}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Part>

          {/* ─── Questions: the quick answers say what launched, so before launch the section holds only the
              self-check questions ───────────────────────────────────────────────────────────────── */}
          <section
            id="questions"
            className={`${shared.section} ${styles.anchor}`}
            aria-labelledby="questions-title"
          >
            <SectionHead
              id="questions-title"
              eyebrow="Questions"
              title={isLive ? 'Quick answers' : 'Check yourself'}
              lead={
                isLive
                  ? 'Tap a question to open it. The last few are for you to check yourself: say your answer, then open it.'
                  : 'Say your answer out loud, then open it to check.'
              }
            />
            <div className={styles.faqWrap}>
              <FaqList
                items={isLive ? QUESTIONS : SELF_CHECK}
                live={isLive}
                anchor="how.faq.start"
              />
            </div>
          </section>

          <div className={shared.section}>
            <p className={styles.legal}>
              Paper trading only: no real money is involved, and nothing here is financial advice.
              Prices come from Bybit's public market data; no partnership or endorsement is claimed.
            </p>
          </div>

          <section className={`${shared.section} ${styles.cta}`} aria-label="Get started">
            <CtaSection newsletterOnly />
          </section>
        </div>
      </AuthLayout>
    </>
  );
}
