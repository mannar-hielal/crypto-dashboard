import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { TopBar } from '@/components/dashboard/TopBar';
import { CoinRibbon } from '@/components/landing/CoinRibbon';
import { FaqList } from '@/components/landing/FaqList';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { LessonPreviewsLazy } from '@/components/landing/LessonPreviewsLazy';
import { PictureAccordion, type AccordionItem } from '@/components/landing/PictureAccordion';
import { PictureCallouts } from '@/components/landing/PictureCallouts';
import { PretendMoney } from '@/components/landing/PretendMoney';
import { TourPlayer } from '@/components/landing/TourPlayer';
import { SectionHead } from '@/components/landing/SectionHead';
import { SingleShot } from '@/components/landing/ShotShowcase';
import { StartLink } from '@/components/landing/StartLink';
import { StackDiagram } from '@/components/landing/StackDiagram';
import { StepFlow } from '@/components/landing/StepFlow';
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
} from '@/lib/landingContent';
import {
  BEGINNER_GETS,
  CHART_STATS,
  CHECKPOINT,
  CHECK_YOURSELF,
  GUIDES,
  HALVES,
  HOSTING,
  NOT_THIS,
  PATH_CHAPTERS,
  QUIZ_NOTE,
  QUIZ_TYPES,
  REMEMBER,
  TRICK,
  WHO_FOR,
  WHY_POINTS,
  WORD_LIST,
} from '@/lib/howItWorksContent';
import chartShot from '@/assets/landing/shot-chart.webp';
import deskShot from '@/assets/landing/shot-desk.webp';
import lessonShot from '@/assets/landing/shot-lesson.webp';
import pathDesktop from '@/assets/landing/shot-path-desktop.webp';
import pretendPanel from '@/assets/landing/pretend-panel.webp';
import shared from '@/components/landing/landing.module.css';
import styles from './HowItWorksPage.module.css';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

// The Why section's five panels: a real capture of the app behind each one (decorative)
const WHY_PICTURES = [lessonShot, pretendPanel, chartShot, pathDesktop, deskShot] as const;
const WHY_SIZES = [
  [1100, 657],
  [1000, 170],
  [1100, 510],
  [1100, 688],
  [1100, 657],
] as const;

function whyItems(): AccordionItem[] {
  const image = (i: number) => ({
    src: WHY_PICTURES[i],
    width: WHY_SIZES[i][0],
    height: WHY_SIZES[i][1],
  });
  return [
    ...WHY_POINTS.map((p, i) => ({
      id: `why-${i}`,
      title: p.title,
      image: image(i),
      body: <p>{p.text}</p>,
    })),
    {
      id: 'why-who',
      title: 'Who is it for?',
      image: image(3),
      body: (
        <>
          <ul>
            {WHO_FOR.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            You never need to know anything first. Each new word is explained the first time you
            meet it.
          </p>
        </>
      ),
    },
    {
      id: 'why-gets',
      title: 'What a beginner gets',
      image: image(4),
      body: (
        <>
          <p>
            <strong>Understanding before risk.</strong> {BEGINNER_GETS.understanding}
          </p>
          <p>{BEGINNER_GETS.free}</p>
          <p>
            <strong>Honest limits.</strong> {BEGINNER_GETS.limits}
          </p>
        </>
      ),
    },
  ];
}

const WHY_ITEMS = whyItems();

const SECTIONS = [
  { id: 'why', label: 'Why' },
  { id: 'picture', label: 'One picture' },
  { id: 'day', label: 'Tours' },
  { id: 'behind', label: 'Behind the scenes' },
  { id: 'chart', label: 'On the chart' },
  { id: 'path', label: 'Learning path' },
  { id: 'not', label: 'What it is not' },
  { id: 'recap', label: 'Recap' },
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
 * The "How it works" page (owner 2026-11-22, built from his tour page; it replaced Features): why
 * the app exists, what it is, a day in it, what runs behind the screen, four flows step by step, what
 * the chart and desk do, the learning path, what it is not, and a recap. Plain English, a picture for
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
          {SECTIONS.filter((s) => isLive || s.id !== 'questions').map((s) => (
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
            id="why"
            eyebrow="1 · Why"
            title="Why this app exists"
            lead="Most people meet trading with real money on the line. That is a bad way to learn. This app lets you learn first, and risk nothing."
          >
            <PictureAccordion items={WHY_ITEMS} />
          </Part>

          <Part
            id="picture"
            eyebrow="2 · The big picture"
            title="What it is, in one picture"
            lead="Two halves that work together. One teaches. One lets you practise."
          >
            <PictureCallouts
              learn={HALVES[0]}
              chart={HALVES[1]}
              alt="The first lesson card open over the live chart"
            />
            <p className={styles.trick}>{TRICK}</p>
          </Part>

          <Part
            id="day"
            eyebrow="3 · Tours"
            title="Little tours of the real app"
            lead="Short clips of the app in use, each one a few steps a new person takes."
          >
            <TourPlayer />
            <div className={styles.links}>
              <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
            </div>
          </Part>

          <Part
            id="behind"
            eyebrow="4 · Behind the scenes"
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
            eyebrow="5 · On the chart"
            title="What you can do on the chart"
            lead="A real charting screen, with room to explore. The chart needs no sign up."
          >
            <ul className={styles.stats}>
              {CHART_STATS.map((s) => (
                <li key={s.label} className={styles.stat}>
                  <span className={styles.statValue}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </li>
              ))}
            </ul>
            <SingleShot id="chart" />
            <FeatureGrid items={CHART_FEATURES} />
            <CoinRibbon />
            <FeatureGrid items={DATA_FEATURES} />
            {isLive && <StartLink cta={CTA_CHART} live variant="text" />}

            <h3 className={styles.sub2}>The practice desk and your account</h3>
            <p className={styles.p}>
              Make a free account and you get $10,000 of pretend money. Practise buying and selling
              as many times as you like. Nothing you do here can cost real money.
            </p>
            <SingleShot id="desk" />
            <PretendMoney />
            <FeatureGrid items={DESK_FEATURES} />
            <FeatureGrid items={ACCOUNT_FEATURES} />
            <h3 className={styles.sub2}>On your phone, too</h3>
            <FeatureGrid items={DEVICE_FEATURES} headingLevel={4} />
          </Part>

          <Part
            id="path"
            eyebrow="6 · The learning path"
            title="Short lessons, then practice, then a checkpoint"
            lead="A stop opens once the one before it is done. Open the map from the top bar once you have an account."
          >
            <StepFlow items={LEARN_STEPS} />
            <LessonPreviewsLazy />
            <div className={styles.twoCols}>
              {GUIDES.map((g) => (
                <div key={g.title} className={styles.box}>
                  <h3 className={styles.boxTitle}>{g.title}</h3>
                  <p className={styles.p}>{g.text}</p>
                </div>
              ))}
            </div>
            {PATH_CHAPTERS.map((c) => (
              <div key={c.title} className={styles.box}>
                <h3 className={styles.boxTitle}>{c.title}</h3>
                <ol className={styles.stops}>
                  {c.stops.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            ))}
            <div className={styles.twoCols}>
              <div className={styles.box}>
                <h3 className={styles.boxTitle}>Quiz types</h3>
                <ul className={styles.bullets}>
                  {QUIZ_TYPES.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className={styles.note}>{QUIZ_NOTE}</p>
              </div>
              <div className={styles.box}>
                <h3 className={styles.boxTitle}>The checkpoint</h3>
                <p className={styles.p}>{CHECKPOINT}</p>
              </div>
            </div>
            <div className={styles.links}>
              <StartLink cta={CTA_REGISTER} live={isLive} variant="text" />
              <Link to="/blog" className={shared.ctaText}>
                Read the articles on the blog
              </Link>
            </div>
          </Part>

          <Part
            id="not"
            eyebrow="7 · What it is not"
            title="What it is not"
            lead="Said plainly, so there are no surprises."
          >
            <FeatureGrid items={NOT_THIS} />
          </Part>

          <Part
            id="recap"
            eyebrow="8 · Recap"
            title="Remember 5 things"
            lead="If you keep only these, you have the idea."
          >
            <ol className={styles.remember}>
              {REMEMBER.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <h3 className={styles.sub2}>Word list</h3>
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
            <h3 className={styles.sub2}>Check yourself</h3>
            <p className={styles.p}>Say your answer out loud, then open it to check.</p>
            <ol className={styles.checks}>
              {CHECK_YOURSELF.map((c) => (
                <li key={c.question}>
                  <details className={styles.more}>
                    <summary>{c.question}</summary>
                    <p className={styles.p}>
                      <strong>{c.answer}</strong> {c.why}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
          </Part>

          {/* ─── Questions: live only, as on the landing page (its answers say what launched) ── */}
          {isLive && (
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
                <FaqList items={FEATURES_FAQ} live anchor="how.faq.start" />
              </div>
            </section>
          )}

          <div className={shared.section}>
            <p className={styles.legal}>
              Paper trading only: no real money is involved, and nothing here is financial advice.
              Prices come from Bybit's public market data; no partnership or endorsement is claimed.
            </p>
          </div>

          <section className={`${shared.section} ${styles.cta}`} aria-label="Get started">
            <CtaSection />
          </section>
        </div>
      </AuthLayout>
    </>
  );
}
